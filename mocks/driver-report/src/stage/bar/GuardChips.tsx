// mocks/driver-report/src/stage/bar/GuardChips.tsx
/** The three guards (§5.4 #13). Each is a claim about THE MACHINE THE DEMO IS RUNNING ON, and each names a failure
 *  that is otherwise completely silent in front of the client:
 *
 *  - «Масштаб 88 %» — the window is smaller than the 1 440 × 900 the demo was rehearsed at, so what the audience
 *    sees is not what the presenter practised. One chip, never two: the layout already decides which of the phone
 *    and the canvas is the smaller, and it is the only one worth naming.
 *  - «Шрифти не завантажились» — Onest did not arrive and every screen is rendering in a fallback. Nothing breaks,
 *    nothing errors, and the product simply looks like somebody else's.
 *  - «Не збірка — запустіть vite preview» — this is the dev server. §5.8 requires the built bundle: the dev server
 *    re-transforms on the fly, so a beat that lands in under a second here can take four in front of a client.
 *
 *  A chip is rendered ONLY when the thing it warns about is true, so a clean stage carries no chrome at all. That is
 *  the whole design: the presenter never reads these, they just notice one. */
import type { JSX } from 'react';

export function GuardChips({ scaleLabel }: { scaleLabel: string | null }): JSX.Element {
  /** A claim about the browser, and jsdom has no font manager at all — where there is nothing to ask, nothing is
   *  claimed. `document.fonts?.check` is optional for exactly that reason and not for an old browser's. */
  const fontsMissing = typeof document.fonts?.check === 'function' && !document.fonts.check('16px Onest');

  return (
    <>
      {scaleLabel === null ? null : <Chip text={scaleLabel} />}
      {fontsMissing ? <Chip text="Шрифти не завантажились" /> : null}
      {import.meta.env.DEV ? <Chip text="Не збірка — запустіть vite preview" /> : null}
    </>
  );
}

function Chip({ text }: { text: string }): JSX.Element {
  return (
    <span className="shrink-0 rounded-[8px] bg-stage-hold-bg px-[8px] py-[4px] text-[12px] text-stage-hold">
      {text}
    </span>
  );
}
