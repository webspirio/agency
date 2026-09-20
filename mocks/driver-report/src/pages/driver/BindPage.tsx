// mocks/driver-report/src/pages/driver/BindPage.tsx
/** «Телефон ще не підключено» — the first screen a new phone ever shows (§3.3 D-01, §8.2 D-01 #1–#2).
 *
 *  THE PHONE CANNOT ASK THE API WHETHER A CODE IS ON SHOW. `getBindPreview` takes the six digits as its path
 *  parameter, and those digits are exactly what this phone has not been given yet. So the live code is read off the
 *  server directly — `server.world().bindCodes`, through `useServerValue`, so the panel fills the moment the
 *  dispatcher taps «Підключити телефон» in the other pane. That read stands for the phone's CAMERA seeing a QR on
 *  the dispatcher's screen, not for a request the app makes: on a real phone the camera app resolves the link and
 *  the app is not running at all. This screen only draws what the camera would show, which is why the chip is a
 *  `Link` and its tap counts as zero (§3.3 D-01).
 *
 *  NO ACCENT UNTIL THERE IS SOMETHING TO ADVANCE. §8.2 D-01 #1 counts `[data-accent]` at zero on the waiting
 *  screen: «Ввести код» is an outline control that reveals the input, and only the «Далі» it reveals is the one
 *  accent-filled button of the screen. Nothing here is optimistic.
 *
 *  The panel is dark in BOTH themes, like every camera surface of §6.2 — it is a picture of the camera app, and the
 *  camera app is not a themeable surface. */
import { useState, type JSX } from 'react';
import { ArrowRight, Keyboard, Link as LinkIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { byCodepoint } from '@agency/mock';
import { useServerNow, useServerValue } from '../../app/live';
import { ActionBar, AppHeader, DriverScreen, PrimaryAction, QuietButton } from '../../components/driver';
import { QrPattern } from '../../components/shared';
import { atOrBefore, cmpInstant } from '../../domain/clock';
import type { BindCode, Instant, World } from '../../domain/types';
import { bindStatus } from '../../domain/views/driver';

const TITLE = 'Телефон ще не підключено';
const LEAD = 'Попросіть диспетчера показати QR-код і наведіть на нього камеру телефону.';
const CAPTION = 'Так це виглядає в камері телефону';
const WAITING = 'Чекаю QR…';
const TYPE_IT = 'Ввести код';
const CODE_LABEL = 'Код з екрана диспетчера';
const NEXT = 'Далі';
const OPEN = 'відкрити';
/** The nominal drawing size; the panel's own CSS then scales the svg to 60 % of the panel height (§3.3 D-01). */
const QR_PX = 176;
const SIX_DIGITS = /^\d{6}$/;

/** The newest code the office has on show that has neither expired nor been spent. The phone cannot know whose it
 *  is — that is what «Це ви?» is for — so it takes the freshest live one, ordered exactly as `codeAt` orders. */
function liveCode(w: World, now: Instant): BindCode | null {
  return w.bindCodes
    .filter((b) => atOrBefore(b.created_at, now) && bindStatus(b, now) === 'VALID')
    .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id))
    .at(-1) ?? null;
}

/** One of the four white brackets the camera app draws around a symbol it has found. */
function Corner({ at }: { at: 'tl' | 'tr' | 'bl' | 'br' }): JSX.Element {
  const top = at === 'tl' || at === 'tr';
  const left = at === 'tl' || at === 'bl';
  const radius = at === 'tl' ? 'rounded-tl-[6px]' : at === 'tr' ? 'rounded-tr-[6px]'
    : at === 'bl' ? 'rounded-bl-[6px]' : 'rounded-br-[6px]';
  return (
    <span
      aria-hidden="true"
      className={`absolute size-[1.25rem] ${top ? 'top-0 border-t-2' : 'bottom-0 border-b-2'} ${
        left ? 'left-0 border-l-2' : 'right-0 border-r-2'} ${radius}`}
      style={{ borderColor: '#ffffff' }}
    />
  );
}

export function BindPage(): JSX.Element {
  const navigate = useNavigate();
  const now = useServerNow();
  const code = useServerValue((s) => liveCode(s.world(), now));
  const [typing, setTyping] = useState(false);
  const [digits, setDigits] = useState('');

  const go = (): void => {
    if (!SIX_DIGITS.test(digits)) return;
    void navigate(`/bind/${digits}`);
  };

  return (
    <DriverScreen
      header={<AppHeader />}
      bar={!typing ? undefined : (
        <ActionBar><PrimaryAction icon={ArrowRight} verb={NEXT} onPress={go} /></ActionBar>
      )}
    >
      <h1 className="text-d-title">{TITLE}</h1>
      <p className="text-[1.125rem] leading-[1.75rem]">{LEAD}</p>

      <p className="text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--text-2)' }}>{CAPTION}</p>
      <div
        className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[18px] bg-cam-bg text-cam-ink"
        style={{ boxShadow: 'inset 0 0 0 1px var(--cam-ring)' }}
      >
        {code === null ? (
          <p className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--cam-text-2)' }}>{WAITING}</p>
        ) : (
          <>
            <span className="relative grid aspect-square h-[60%] place-items-center [&>svg]:size-full">
              <QrPattern text={`ktl.in.ua/z/${code.code}`} size={QR_PX} />
              <Corner at="tl" /><Corner at="tr" /><Corner at="bl" /><Corner at="br" />
            </span>
            <Link
              to={`/bind/${code.code}`}
              className="flex min-h-tap max-w-[92%] items-center gap-2 rounded-[999px] px-4 text-[1rem] leading-[1.375rem] font-semibold"
              style={{ background: '#ffffff', color: '#141c21' }}
            >
              <LinkIcon aria-hidden="true" className="size-[1.25rem] shrink-0" />
              <span className="min-w-0 truncate">{`ktl.in.ua/z/${code.code} — ${OPEN}`}</span>
            </Link>
          </>
        )}
      </div>

      {typing ? (
        <label className="flex flex-col gap-2">
          <span className="text-[1rem] leading-[1.375rem] font-semibold">{CODE_LABEL}</span>
          <input
            value={digits}
            onChange={(e) => { setDigits(e.target.value.replace(/\D/gu, '').slice(0, 6)); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="card-ring h-[4.5rem] w-full px-4 text-center font-mono text-[2rem] tracking-[0.2em]"
          />
        </label>
      ) : (
        <QuietButton icon={Keyboard} label={TYPE_IT} onPress={() => { setTyping(true); }} />
      )}
    </DriverScreen>
  );
}
