// mocks/driver-report/src/components/driver/DriverScreen.tsx
/** The shell every driver screen sits in (§3.1): a header above, one 35rem content column with a 1rem gutter, and the
 *  sticky ActionBar below. The page itself scrolls — there is no inner scroller — because a sticky bar over a
 *  document scroll is the one arrangement that survives `env(safe-area-inset-bottom)` and 130 % text without a
 *  measured height.
 *
 *  `dark` puts `data-surface="dark"` on the root, which swaps in the `--cam-*` tokens in EITHER theme (§6.2): the
 *  camera, every photo review and the motion lock are dark surfaces whatever the viewer chose. */
import type { JSX, ReactNode } from 'react';

export function DriverScreen({ dark = false, header, children, bar }: {
  dark?: boolean;
  header: ReactNode;
  children: ReactNode;
  bar?: ReactNode;
}): JSX.Element {
  return (
    <div
      {...(dark ? { 'data-surface': 'dark' } : {})}
      className={`flex min-h-dvh flex-col ${dark ? 'bg-cam-bg text-cam-ink' : 'bg-paper text-ink'}`}
    >
      {header}
      <div className="flex-1">
        <div className="mx-auto flex w-full max-w-[35rem] flex-col gap-3 px-gutter pt-3 pb-4">{children}</div>
      </div>
      {bar}
    </div>
  );
}
