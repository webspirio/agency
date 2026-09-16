import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@agency/kit/lib/cn';

/**
 * THE DRIVER'S WHOLE WIDGET SET. Five pieces, and there is deliberately no
 * sixth: no menu, no tab bar, no hamburger, no settings, no back arrow, no
 * logout. The failure shape the adoption literature names is DEPTH — "three
 * layers of navigation to get to the signature capture" — not length, so the
 * product is linear and has no hierarchy to get lost in.
 *
 * Sizes are not decoration. Every primary target here is at least 96 px tall,
 * which is roughly 15 mm — above the 11–12 mm that published guidance puts at
 * >95% single-thumb accuracy, with margin for a glove, feed dust and a cracked
 * digitiser. The client's phrase was «максимум простоти»; this is what that
 * costs in pixels.
 */

/**
 * THE CAMERA TILE — and it IS the camera, not a button that leads to one.
 *
 * `<input type="file" accept="image/*" capture="environment">` inside a
 * `<label>` hands the capture to the phone's OWN camera app. That is a
 * deliberate choice over `getUserMedia`: on a fragmented fleet of budget
 * Androids the OS camera is the one component guaranteed to work, it needs no
 * permission prompt of ours, and it also writes the shot to DCIM — a second copy
 * that survives an Android «очистити дані» wipe for free. Telegram is not an
 * option for this at all: telegram-apps issue #681 (12 Mar 2025, closed «not
 * planned») records that a Mini App cannot launch the native camera on Android
 * and falls back to gallery-only, and this product is 60% camera.
 *
 * A `<label>` rather than an onClick handler because the label activation IS the
 * user gesture — there is no intermediate screen saying «тепер натисни камеру»,
 * which would cost a tap and teach nothing the tile did not already say.
 *
 * THE `cancel` LISTENER is for the demo laptop, and it is worth one sentence of
 * honesty: on a phone this opens the camera and returns a photograph. On a
 * desktop `capture` is ignored and the browser opens a file dialog; dismissing
 * it fires `cancel`, and the flow advances with the drawn artefact standing in
 * for the shot. Same code path, same number of taps, no separate demo mode.
 */
export function CameraTile({
  title,
  hint,
  face,
  onCaptured,
}: {
  title: string;
  hint?: string;
  /** A drawn artefact, shown as the tile's face. Never a camera glyph: the
   *  low-literacy research is explicit that abstract icons are semantically
   *  opaque to this reader and concrete imagery is not. */
  face: ReactNode;
  /** The captured file, or `null` when the picker was dismissed. */
  onCaptured: (file: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = ref.current;
    if (!input) return undefined;
    const dismissed = () => onCaptured(null);
    input.addEventListener('cancel', dismissed);
    return () => input.removeEventListener('cancel', dismissed);
  }, [onCaptured]);

  return (
    <label
      className={cn(
        'group relative block w-full cursor-pointer overflow-hidden rounded-2xl',
        'border-2 border-primary/25 bg-secondary',
        'active:scale-[0.99] active:border-primary motion-safe:transition',
        'focus-within:ring-4 focus-within:ring-ring focus-within:outline-none',
      )}
    >
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => onCaptured(event.target.files?.[0] ?? null)}
      />
      <span className="flex items-center justify-center bg-muted px-3 py-5">{face}</span>
      <span className="flex items-center gap-3 bg-primary px-4 py-4 text-primary-foreground">
        <CameraGlyph />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-xl leading-tight font-bold tracking-tight uppercase sm:text-2xl">
            {title}
          </span>
          {hint ? <span className="block text-sm opacity-85">{hint}</span> : null}
        </span>
      </span>
    </label>
  );
}

/** The one glyph in the product, and it sits BESIDE a photograph rather than
 *  instead of one. */
function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-9 shrink-0" fill="currentColor">
      <path d="M9.4 4h5.2l1.3 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.1l1.3-2Zm2.6 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z" />
    </svg>
  );
}

/**
 * The three things that ever happen, and the one shape they are offered in.
 * 120 px tall, full bleed, one word, no icon-only variant.
 */
export function BigButton({
  children,
  onClick,
  tone = 'primary',
  sub,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'accent' | 'quiet' | 'go';
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl px-5 py-6 text-left',
        'active:scale-[0.99] motion-safe:transition',
        'focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
        /* EVERY FILLED TONE IS A PAIR. MEASURED in a 390px viewport on
           2026-09-16: `text-white` hard-coded against `--ring` and `--success`
           read fine in the light theme and at roughly 2:1 in the dark one,
           where both tokens invert to a light tint — a cab at 05:40 in November
           is exactly when this matters and exactly when nobody is looking at a
           contrast checker. A literal colour in a component cannot follow a
           theme, which is why the theme contract forbids one. */
        tone === 'primary' && 'bg-primary text-primary-foreground',
        tone === 'accent' && 'bg-ring text-primary-foreground',
        tone === 'go' && 'bg-success text-success-foreground',
        tone === 'quiet' && 'border-2 border-line2 bg-card text-foreground',
      )}
    >
      <span className="block text-2xl leading-none font-bold tracking-tight uppercase sm:text-3xl">
        {children}
      </span>
      {sub ? <span className="mt-1.5 block text-sm opacity-85">{sub}</span> : null}
    </button>
  );
}

/**
 * THE STATUS STRIP, and the word «помилка» never appears in it.
 *
 * A driver must be able to SEE that a photograph is safe, or he will re-take it,
 * doubt the product and go back to paper. So the queue state is stated calmly
 * and permanently, and there is deliberately NO retry button: there is nothing
 * for him to do about connectivity, and a control he can press wrongly is one
 * that will be pressed wrongly.
 */
export function StatusStrip({ today, queued }: { today: number; queued: number }) {
  const waiting = queued !== 0;
  return (
    <p
      className={cn(
        'flex items-center gap-2 rounded-xl px-4 py-3 text-base font-medium',
        waiting ? 'bg-amber/10 text-amber' : 'bg-success/10 text-success',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2.5 shrink-0 rounded-full',
          waiting ? 'bg-amber motion-safe:animate-pulse' : 'bg-success',
        )}
      />
      {waiting ? (
        <>
          Сьогодні: {today}. {queued} ще не прийняв офіс.
        </>
      ) : (
        <>Сьогодні: {today}. Все надіслано.</>
      )}
    </p>
  );
}

/**
 * ONE QUESTION, ONE PAGE. A frame with a step counter and nothing else — no back
 * button, because linear-and-unskippable is what makes one-question-per-page
 * work; GOV.UK's «one thing per page» names our exact reader («low-confidence
 * users find them easier to use»), and Bringg is the one tier-1 vendor that
 * actually ships one action per screen.
 */
export function Step({
  step,
  of,
  question,
  why,
  children,
}: {
  step: number;
  of: number;
  question: string;
  /** One sentence of WHY, only where the reason is not obvious — the unloading
   *  photo being примірник 3 rather than «сфотографуй ще раз». */
  why?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-[520px] px-4 pt-5 pb-10">
      {/* NOT `uppercase`, and that is a legibility fix rather than a taste.
          MEASURED by looking at it in a 390px viewport: «КРОК 1 З 3» set in caps
          reads as «КРОК 1 3 3», because the Cyrillic З and the digit 3 are the
          same shape in a sans-serif at this weight. The reader this product is
          built for is the one least likely to work that out, and a progress
          indicator that has to be decoded is worse than none. Lowercase «з» is
          unambiguous. The dots carry the meaning anyway for anyone who does not
          read the line at all. */}
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: of }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-6 rounded-full',
                i < step ? 'bg-primary' : 'bg-line2',
              )}
            />
          ))}
        </span>
        Крок {step} з {of}
      </p>
      <h1 className="text-3xl leading-[1.1] font-bold tracking-tight text-balance sm:text-4xl">
        {question}
      </h1>
      {why ? <p className="mt-2 text-base text-muted-foreground">{why}</p> : null}
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  );
}

/**
 * THE ODOMETER KEYPAD — the last resort, and the only screen in the entire
 * product where a man the client describes as «дуже не любить писати» writes.
 *
 * It is reached only when there is no telematics reading AND no dashboard photo
 * was taken. Its guard WARNS and never blocks: ГОТОВО stays enabled on a value
 * below the last one or far above it, because a driver who cannot finish at the
 * gate telephones the office and then goes back to paper. That is the pattern
 * Detrack and Samsara both ship, and it is the difference between a flag in the
 * office and a lost report.
 */
export function Keypad({
  previous,
  onDone,
}: {
  previous: number | null;
  onDone: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const shown = value === '' ? '—' : value;
  const warning = warn(value, previous);

  const press = (key: string) => setValue((v) => (v.length === 7 ? v : `${v}${key}`));

  return (
    <div className="space-y-3">
      <output className="block rounded-xl border-2 border-line2 bg-card px-4 py-5 text-center font-mono text-5xl tabular-nums">
        {shown}
      </output>
      {previous !== null ? (
        <p className="text-center text-base text-muted-foreground">
          Минулого разу було {previous.toLocaleString('uk-UA')}
        </p>
      ) : null}
      {warning ? (
        <p role="status" className="rounded-xl bg-amber/10 px-4 py-3 text-center text-base text-amber">
          {warning} Якщо так і є — тисни ГОТОВО.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
          <Key key={key} onClick={() => press(key)}>
            {key}
          </Key>
        ))}
        <Key onClick={() => setValue((v) => v.slice(0, -1))} muted>
          ⌫
        </Key>
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={() => setValue('')} muted>
          C
        </Key>
      </div>

      <BigButton tone="go" onClick={() => onDone(value)}>
        Готово
      </BigButton>
    </div>
  );
}

/** Warn, never block. Returns the sentence or `null`. */
function warn(value: string, previous: number | null): string | null {
  if (value === '' || previous === null) return null;
  const entered = value.length;
  const last = String(previous).length;
  if (entered !== 0 && entered < last) return 'Схоже, цифру загубили.';
  return null;
}

function Key({
  children,
  onClick,
  muted,
}: {
  children: ReactNode;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl py-5 text-3xl font-semibold tabular-nums',
        'active:scale-95 motion-safe:transition',
        'focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
        muted ? 'bg-muted text-muted-foreground' : 'bg-card text-foreground ring-1 ring-line2',
      )}
    >
      {children}
    </button>
  );
}
