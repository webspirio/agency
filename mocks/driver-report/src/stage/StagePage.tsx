// mocks/driver-report/src/stage/StagePage.tsx
/** The presenter stage (§5.1): one page that owns the demo's one server and shows a phone and the office side by
 *  side, so the owner watches a driver tap and the office change within 500 ms.
 *
 *  IT CREATES NOTHING. `src/api/server.ts` published `window.__ktlServer` at module load, and the four iframes
 *  inherit it through `window.parent` (§7.7) — so "one store across the panes" is a property of module order, not
 *  of anything this component does. What it does own is the FIRST rebuild: `ensureBooted` puts the server at a beat
 *  exactly once per realm, and the frames are not mounted until it has, because a pane that loads against a server
 *  sitting at no beat renders the seed and then has to be reloaded anyway.
 *
 *  Three rules this page exists to keep (§5.8, D4, §8.6 #14):
 *  - it never asks for a camera, a notification or a position — the stage is the one surface where a permission
 *    prompt in front of a client cannot be recovered from;
 *  - it registers no `beforeunload`, and answers `popstate` with `pushState`, so a mouse's back button cannot take
 *    the demo off the stage;
 *  - the clock runs from the beat's moment, never from the wall date. */
import { useEffect, useState, type CSSProperties, type JSX } from 'react';
import { useParams } from 'react-router';
import { server } from '../api/server';
import { urlBeat } from '../app/device';
import { useServerNow, useServerValue } from '../app/live';
import { between, gte, toInt } from '../domain/num';
import { ConsoleFrame } from './ConsoleFrame';
import { beatOf, CONSOLE_CAPTION, phoneOf, STAGE_PHONES, useHub } from './hub';
import { STAGE_CANVAS, stageLayout } from './layout';
import { PhoneFrame } from './PhoneFrame';
import { ensureBooted, watchLiveTwins } from './runner';
import { StageBar } from './bar/StageBar';

/** `/beat/:n` (§2.5) wins, then `?beat=`, then the beat the demo opens on. */
function routeBeat(raw: string | undefined): number {
  if (raw !== undefined && /^\d{1,2}$/.test(raw)) {
    const n = toInt(raw);
    if (between(n, 0, 13)) return n;
  }
  return urlBeat(0);
}

/** The window, as the layout sees it. */
function useWindowSize(): { w: number; h: number } {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = (): void => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, []);
  return size;
}

export function StagePage(): JSX.Element {
  const params = useParams();
  const hub = useHub();
  const { ui, toggles } = useServerValue((s) => ({ ui: s.ui, toggles: s.toggles }));
  const now = useServerNow();
  const size = useWindowSize();
  const boot = routeBeat(params.n);

  useEffect(() => { void ensureBooted(boot); }, [boot]);

  /** A live clock from the beat's moment on: the rebuild leaves it frozen so the replay is deterministic (§5.8). */
  const ready = ui.beat !== null;
  useEffect(() => { if (ready) server.clock.run(); }, [ready]);

  /** Retires a script entry the presenter has just performed live, so «Перемотати» never plays it twice (§5.8).
   *  The effect RETURNS the stopper: under StrictMode a subscription without one is made twice and never dropped. */
  useEffect(() => watchLiveTwins(), []);

  /** A back button on a presenter's mouse is one click away from ending the demo (EC-159). */
  useEffect(() => {
    const onPop = (): void => { window.history.pushState(null, '', window.location.href); };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); };
  }, []);

  const layout = stageLayout({ W: size.w, H: size.h, viewport: toggles.viewport, focus: ui.focus,
    single: ui.single, barHidden: ui.barHidden });
  const beat = beatOf(ui.beat);
  const framed = phoneOf(ui.phone) ?? STAGE_PHONES[0];

  if (beat === null || framed === undefined) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-stage-bg text-[13px] font-medium text-stage-text-2">
        Сцена · Звіт водія · КТЛ
      </div>
    );
  }

  /** In `canvas` mode the whole 1 440 × 900 stage is ONE scaled box, so every rect the layout returns is a canvas
   *  coordinate and `k` is applied here, once. Everywhere else the canvas IS the window and `k` is 1. */
  const canvas: CSSProperties = layout.mode === 'canvas'
    ? { width: STAGE_CANVAS.w, height: STAGE_CANVAS.h, left: '50%', top: '50%',
        transform: `translate(-50%, -50%) scale(${layout.k})` }
    : { width: size.w, height: size.h, left: 0, top: 0 };
  /** One pane only: the phone, unless the presenter asked for «2». The other stays mounted and invisible (§5.2). */
  const soloConsole = layout.mode === 'single' && ui.single === 'console';
  const phonePane = !soloConsole;
  const consolePane = layout.mode !== 'single' || soloConsole;

  return (
    <div className="fixed inset-0 overflow-hidden bg-stage-bg font-sans text-stage-text">
      <div className="absolute" style={canvas}>
        {ui.barHidden ? null : (
          <div className="absolute inset-x-0 top-0 z-10" style={{ height: layout.bar }}>
            <StageBar hub={hub} ui={ui} toggles={toggles} now={now} scaleLabel={layout.scaleLabel}
              wide={gte(size.w, STAGE_CANVAS.w)} />
          </div>
        )}

        <p
          className="absolute truncate text-[13px] font-medium text-stage-text-2"
          style={{ left: layout.phone.x, top: layout.captionsY, visibility: phonePane ? 'visible' : 'hidden' }}
        >
          {framed.caption}
        </p>
        <p
          className="absolute truncate text-[13px] font-medium text-stage-text-2"
          style={{ left: layout.console.x, top: layout.captionsY, visibility: consolePane ? 'visible' : 'hidden' }}
        >
          {CONSOLE_CAPTION}
        </p>

        {STAGE_PHONES.map((phone) => (
          <PhoneFrame
            key={phone.id}
            phone={phone}
            visible={phonePane && phone.id === ui.phone}
            x={layout.phone.x}
            y={layout.phone.y}
            scale={layout.phone.scale}
            viewport={toggles.viewport}
            now={now}
            offline={toggles.offline}
            hub={hub}
          />
        ))}

        <ConsoleFrame
          beat={beat}
          visible={consolePane}
          x={layout.console.x}
          y={layout.console.y}
          w={layout.console.w}
          h={layout.console.h}
          hub={hub}
        />
      </div>
    </div>
  );
}
