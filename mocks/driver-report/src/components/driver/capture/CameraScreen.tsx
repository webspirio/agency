// mocks/driver-report/src/components/driver/capture/CameraScreen.tsx
/**
 * The one camera of the driver route (§3.3 D-06): a dark screen that names the page being photographed, frames it,
 * and hands back one `CapturedPage` per shot.
 *
 * ONE SCREEN, TWO ENGINES. On the stage — and on any pointer that is not a finger — it shows the drawn artefact of
 * §6.11 on a seat, and `navigator.mediaDevices` is not touched anywhere in that path (D4, §8.6 #14): the presenter's
 * window is on the projector, and a permission sheet there is the demo's worst minute. On a real phone it opens the
 * in-page viewfinder after its own pre-prompt ([T2], W3-05).
 *
 * THE SHUTTER IS ARMED BY THE NEXT TITLE, not by a timer. §3.3 D-06 asks that it «takes no touch until the next title
 * has painted», and that is also the whole of §8.6 #13 for this screen: a second press with the same title on it is
 * the same page, so it is dropped whatever the wall clock says. The 50 ms window is the second half of the same rule,
 * for the flow that re-arms the shutter within one frame.
 *
 * WHICH PAGE THIS IS comes off the DRAWN SPEC, not off this screen. A camera shown one page cannot know it is the
 * reverse of the second ТТН of two, but `drawnFor` already knows: it reads the pair straight out of `SCRIPT`, which
 * numbers S-10's four pages 1/1, 1/2, 2/1, 2/2, and a retake carries the numbering the office asked for. So a flow
 * that just passes `drawn={plan[i]}` commits pages the office can caption («ТТН 2 з 2, зворотний») without doing any
 * arithmetic of its own. With no spec — an unscripted stop, or the in-page engine — it falls back to 1/1, and a flow
 * that knows better still overrides by spreading over what `onShot` hands it:
 * `onShot={(p) => addPage({ ...p, doc_index, page_no })}`.
 */
import type { JSX, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, Clock, FileText, Files, Receipt, Weight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { server } from '../../../api/server';
import {
  closeCamera, frameFromFile, grabFrame, hasTorch, openCamera, setTorch, type Frame,
} from '../../../app/capture/engine';
import type { DrawnSpec } from '../../../app/capture/drawnPlan';
import { rememberThumb } from '../../../app/capture/similarity';
import { MOCK_BYTES, type CapturedPage } from '../../../app/records';
import type { ArtefactKind } from '../../../domain/types';
import { Artefact, SeatBackdrop } from '../../artefacts';
import { ActionBar } from '../ActionBar';
import { BottomSheet } from '../BottomSheet';
import { FlowHeader } from '../FlowHeader';
import { PrimaryAction } from '../PrimaryAction';
import { QuietButton } from '../QuietButton';
import { FrameGuide, frameFor } from './FrameGuide';
import { QualityChips, type QualityReason } from './QualityChips';

/** The second row of the camera: the ways out of a photo that cannot be taken (§3.3 D-06). */
export type Row2Kind = 'NO_DOC' | 'NO_MORE_TTN' | 'AT_PARKING' | 'AFTER_EXIT' | 'LATER' | 'NO_RECEIPT' | 'NO_TICKET';

const ROW2: Record<Row2Kind, { word: string; icon: LucideIcon }> = {
  NO_DOC: { word: 'Немає документа', icon: FileText },
  NO_MORE_TTN: { word: 'Більше ТТН немає', icon: Files },
  AT_PARKING: { word: 'Зніму на стоянці', icon: Clock },
  AFTER_EXIT: { word: 'Зніму після виїзду', icon: Clock },
  LATER: { word: 'Зніму пізніше', icon: Clock },
  // P1, and never passed today: a fuel receipt the driver does not have is «Зніму пізніше» (§3.3 D-06, D-10).
  NO_RECEIPT: { word: 'Чека немає', icon: Receipt },
  NO_TICKET: { word: 'Талона не дали', icon: Weight },
};

const DRAWN_CHIP = 'Макет: намальоване фото';
const FRAMING = 'Фото — для контролю. Оригінал здайте в офіс.';
const PROMPT = 'Телефон зараз спитає дозвіл на камеру. Натисніть «Дозволити».';
const DENIED = 'Без камери не вийде сфотографувати щиток.';
const HELP = ['Натисніть ⋮ вгорі', 'Далі «Налаштування сайту»', 'Потім «Камера» → «Дозволити»'];

/** A shot flashes 80 ms (§6.8); a second press inside this window is the same press. */
const FLASH_MS = 80;
const DOUBLE_MS = 50;

type Phase = 'PROMPT' | 'LIVE' | 'DENIED';

export function CameraScreen({ title, hint, artefact, counter, taken, row2, engine, drawn, lastThumb = null,
  onBack, onShot, onRow2, banner }: {
  title: string;
  hint: string;
  artefact: ArtefactKind;
  /** The FlowHeader count: the flow's own STEPS, the grid among them — «2 з 5» at a two-ТТН loading (§3.3 D-07). */
  counter?: { index: number; total: number };
  /** The count beside the shutter: the PAGES of the set, «1 з 4» (§3.3 D-06's diagram). It is a different number
   *  from `counter` and needs its own prop; without one it follows `counter` and reads «2 з 5 ✓» after one shot. */
  taken?: { index: number; total: number };
  row2: Row2Kind[];
  engine: 'DRAWN' | 'INPAGE';
  drawn: DrawnSpec | null;
  /** The last page taken, as a drawn variant or a data URL — the thumbnail beside the counter. */
  lastThumb?: string | null;
  onBack(): void;
  onShot(page: CapturedPage): void;
  onRow2(kind: Row2Kind): void;
  /** «Диспетчер просить: Розмито» and the old page, when the office asked for this one again (§3.3 D-13). */
  banner?: ReactNode;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>(engine === 'DRAWN' ? 'LIVE' : 'PROMPT');
  const [flash, setFlash] = useState(false);
  const [help, setHelp] = useState(false);
  const [torch, setTorchReady] = useState(false);
  /** What is wrong with the frame. The drawn engine measures nothing (§3.3 D-06) and the in-page analyser is [T2],
   *  so today this is always empty: it is the wire the chips and `quality` hang on, not a measurement. */
  const reasons: QualityReason[] = [];
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const armed = useRef(true);
  const pressedAt = useRef(0);

  // The next title re-arms the shutter. Keyed on the counter too, so a flow that shoots the same title twice (two
  // copies of one page) still gets its second shot. It clears the 50 ms window with it: that window exists to drop
  // the second half of a double tap on ONE page, and a flow that has already painted the next title has accepted
  // the first shot — measured, the two presses of a four-page sequence are ~30 ms apart under the test runner.
  useEffect(() => { armed.current = true; pressedAt.current = 0; }, [title, counter?.index]);

  // The camera is opened HERE and nowhere else, and only after the driver has answered the pre-prompt: the drawn
  // engine never reaches this effect, which is what makes §8.6 #14 a property of the code rather than of a stub.
  useEffect(() => {
    if (engine !== 'INPAGE' || phase !== 'LIVE') return undefined;
    let live = true;
    openCamera().then((got) => {
      if (!live) { closeCamera(got); return; }
      stream.current = got;
      setTorchReady(hasTorch(got));
      if (video.current !== null) video.current.srcObject = got;
    }).catch(() => { if (live) setPhase('DENIED'); });
    return () => {
      live = false;
      closeCamera(stream.current);
      stream.current = null;
    };
  }, [engine, phase]);

  const hand = (source: CapturedPage['source'], frame: Frame | null): void => {
    if (frame !== null) rememberThumb(frame.image, frame.thumb);
    onShot({
      artefact,
      doc_index: drawn?.doc_index ?? 1,
      page_no: drawn?.page_no ?? 1,
      captured_at: server.clock.nowIso(),
      source,
      bytes: frame === null ? MOCK_BYTES[artefact] : frame.bytes,
      quality: reasons.length === 0 ? 'OK' : 'LOW',
      quality_reasons: reasons,
      deferred: null,
      drawn: drawn === null ? null : { variant: drawn.variant, value: drawn.value, sim_read: drawn.sim_read },
      image: frame === null ? null : frame.image,
    });
  };

  const shoot = (): void => {
    const now = Date.now();
    if (!armed.current) return;
    if (now - pressedAt.current < DOUBLE_MS) return;
    const frame = engine === 'DRAWN' || video.current === null ? null : grabFrame(video.current);
    // An in-page viewfinder that has not decoded a frame yet has nothing to hand back, and a page with no picture
    // in it would be worse than a second press: the shutter simply stays live.
    if (engine === 'INPAGE' && frame === null) return;
    pressedAt.current = now;
    armed.current = false;
    setFlash(true);
    window.setTimeout(() => { setFlash(false); }, FLASH_MS);
    hand(engine === 'DRAWN' ? 'DRAWN' : 'INPAGE', frame);
  };

  const fromNative = (file: File | undefined): void => {
    if (file === undefined) return;
    void frameFromFile(file).then((frame) => { if (frame !== null) hand('NATIVE', frame); });
  };

  // Absolutely placed, so the drawn document has a definite box to be `h-full` of: the artefacts are SVGs with a
  // viewBox and `h-full w-auto`, which collapse against a parent whose own height is content-derived.
  const viewfinder = (): JSX.Element => {
    if (engine === 'INPAGE' && phase === 'LIVE') {
      return <video ref={video} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />;
    }
    return (
      // Keyed on the variant so the next artefact CROSS-FADES in rather than swapping (§6.8, 200 ms).
      <div key={drawn === null ? 'empty' : drawn.variant} className="cl-label absolute inset-0">
        <SeatBackdrop>
          {drawn === null ? <span /> : <Artefact variant={drawn.variant} value={drawn.value} size="view" />}
        </SeatBackdrop>
      </div>
    );
  };

  return (
    <div data-surface="dark" className="flex min-h-dvh flex-col bg-cam-bg text-cam-ink">
      <FlowHeader title={title} step={counter} dark onBack={onBack} />
      <p className="mx-auto w-full max-w-[35rem] px-gutter pt-2 text-[1rem] leading-[1.375rem]"
        style={{ color: 'var(--cam-text-2)' }}>
        {hint}
      </p>
      {banner === undefined ? null : <div className="mx-auto w-full max-w-[35rem] px-gutter pt-2">{banner}</div>}

      <div className="relative mt-2 min-h-[16rem] flex-1 overflow-hidden">
        {viewfinder()}
        <FrameGuide kind={frameFor(artefact)} />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-gutter">
          <QualityChips reasons={reasons} torch={torch} onTorch={(on) => { setTorch(stream.current, on); }} />
          {engine === 'DRAWN' ? (
            <span
              className="inline-flex h-[2.5rem] shrink-0 items-center rounded-[10px] px-3 text-[1rem] leading-[1.25rem] font-semibold"
              style={{ background: 'var(--cam-hold-bg)', color: 'var(--cam-hold)' }}
            >
              {DRAWN_CHIP}
            </span>
          ) : null}
        </div>
        {artefact === 'CLUSTER' ? null : (
          <p className="absolute inset-x-0 bottom-0 px-gutter pb-3 text-center text-[1rem] leading-[1.375rem]"
            style={{ color: 'var(--cam-ink)', textShadow: '0 1px 4px rgb(0 0 0 / 0.8)' }}>
            {FRAMING}
          </p>
        )}
        {flash ? (
          <span aria-hidden="true" className="absolute inset-0 bg-white"
            style={{ animation: `flash ${String(FLASH_MS)}ms linear both` }} />
        ) : null}
        {engine === 'INPAGE' && phase !== 'LIVE' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-gutter text-center"
            style={{ background: 'var(--cam-scrim)' }}>
            <CameraOff aria-hidden="true" className="size-[2.5rem]" />
            <p className="text-[1.125rem] leading-[1.5rem] font-semibold">{phase === 'PROMPT' ? PROMPT : DENIED}</p>
            {phase === 'PROMPT' ? (
              <PrimaryAction icon={Check} verb="Добре" dark onPress={() => { setPhase('LIVE'); }} />
            ) : (
              <>
                <label className="flex h-tap-lg w-full items-center justify-center gap-2 rounded-[14px] px-4 text-[1.125rem] font-semibold"
                  style={{ background: 'var(--cam-accent)', color: 'var(--cam-accent-ink)' }}>
                  Відкрити камеру телефону
                  <input type="file" accept="image/*" capture="environment" className="sr-only"
                    onChange={(e) => { fromNative(e.target.files?.[0]); }} />
                </label>
                <QuietButton dark label="Як увімкнути камеру для сайту" onPress={() => { setHelp(true); }} />
              </>
            )}
          </div>
        ) : null}
      </div>

      <ActionBar dark>
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            aria-label="Зняти"
            onClick={shoot}
            className="size-shutter rounded-full"
            style={{ background: '#ffffff', boxShadow: '0 0 0 3px var(--cam-bg), 0 0 0 6px #ffffff' }}
          />
          {lastThumb === null || (taken ?? counter) === undefined ? null : (
            <span className="absolute right-0 flex items-center gap-2">
              {/* «flies its thumbnail to the counter 220 ms ease-out» (§6.8): the kit's own enter keyframe at the
                  duration and curve the spec names, rather than a second keyframe in the frozen stylesheet. */}
              <span className="inline-flex h-[3rem] items-center overflow-hidden rounded-[8px]"
                style={{ animation: 'cl-label 220ms cubic-bezier(0, 0, 0.2, 1) both' }}>
                {lastThumb.startsWith('data:')
                  ? <img src={lastThumb} alt="" className="h-[3rem] w-[2.25rem] object-cover" />
                  : <Artefact variant={lastThumb} size="thumb" />}
              </span>
              <span className="font-mono text-[0.875rem] font-medium" style={{ color: 'var(--cam-text-2)' }}>
                {(taken ?? counter)!.index + 1} з {(taken ?? counter)!.total} ✓
              </span>
            </span>
          )}
        </div>
        {row2.length === 0 ? null : (
          <div className="flex gap-2">
            {row2.map((kind) => (
              <QuietButton key={kind} dark half icon={ROW2[kind].icon} label={ROW2[kind].word}
                onPress={() => { onRow2(kind); }} />
            ))}
          </div>
        )}
      </ActionBar>

      <BottomSheet open={help} title="Як увімкнути камеру для сайту" onClose={() => { setHelp(false); }}>
        <ol className="flex flex-col gap-2 py-2">
          {HELP.map((step, i) => (
            <li key={step} className="flex items-center gap-3 text-[1.125rem] leading-[1.5rem]">
              <span className="grid size-[2rem] shrink-0 place-items-center rounded-full font-mono"
                style={{ background: 'var(--bench)' }}>{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <QuietButton icon={Camera} label="Зрозумів" onPress={() => { setHelp(false); }} />
      </BottomSheet>
    </div>
  );
}
