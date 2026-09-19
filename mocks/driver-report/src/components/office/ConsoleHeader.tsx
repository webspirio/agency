// mocks/driver-report/src/components/office/ConsoleHeader.tsx
/** 56 px, solid `--paper`, an inset bottom line — and deliberately NOT glass (§4.1).
 *
 *  A frosted bar smears over the video behind it on a call, which is where this product is going to be looked at.
 *
 *  Left: the SERVER clock in mono, «пн 21.09 · 08:43». Not the browser's — the whole demo rests on one clock the
 *  stage can rewind (§5.8), so this takes an `Instant` prop and the page supplies it from `useServerNow()`.
 *  Centre: the scope switch, kit `Segmented` at 36 px — «Пілот · 3» | «Весь парк · 100 (приклад)», the sentence
 *  that keeps the three real trucks honest about the 97 invented ones (§0.3). Right: the theme toggle (manual only,
 *  D15 — nothing here follows `prefers-color-scheme`) and the user: a 32 px `--accent-ink` circle with mono
 *  initials, the name at 13/500 and the role at 12 px.
 *
 *  Below 720 px the bar keeps the menu button, the clock and the user's initials and drops the rest: the scope
 *  switch and the full name do not fit beside a 44 px target, and the sidebar sheet carries the navigation. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { Segmented } from '@agency/kit/segmented';
import { Menu, Moon, Sun } from 'lucide-react';
import type { Instant } from '@agency/mock';
import { fmtDay, fmtTime } from '../../app/format';
import { useDarkTheme } from '../../app/theme';
import { OC } from '../../copy/office';
import type { OfficeSummary } from '../../domain/dto';
import type { Scope } from '../../domain/types';
import type { ConsoleMode } from './useConsoleMode';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'PILOT', label: OC.scope.PILOT },
  { value: 'FLEET', label: OC.scope.FLEET },
];

export function ConsoleHeader({
  clock,
  scope,
  onScope,
  user,
  onMenu,
  mode,
}: {
  clock: Instant;
  scope: Scope;
  onScope(s: Scope): void;
  user: OfficeSummary['user'];
  onMenu?(): void;
  mode: ConsoleMode;
}): JSX.Element {
  const { dark, setDark } = useDarkTheme();
  const narrow = mode === 'mobile';
  return (
    <header className="flex h-[56px] shrink-0 items-center gap-[12px] bg-paper px-[16px] shadow-[inset_0_-1px_0_var(--line)]">
      {narrow ? (
        <button
          type="button"
          aria-label="Меню"
          onClick={onMenu}
          className="-ml-[10px] flex size-[44px] shrink-0 items-center justify-center rounded-[12px] text-ink hover:bg-bench"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      ) : null}

      <p className="shrink-0 font-mono text-[14px] leading-none font-medium whitespace-nowrap text-ink tabular-nums">
        {`${fmtDay(clock)} · ${fmtTime(clock)}`}
      </p>

      {narrow ? (
        <span className="flex-1" />
      ) : (
        <div className="flex min-w-0 flex-1 justify-center">
          <Segmented
            label="Що показувати"
            fit="content"
            size="md"
            className="w-auto"
            options={SCOPES}
            value={scope}
            onChange={onScope}
          />
        </div>
      )}

      <button
        type="button"
        aria-label={dark ? 'Світла тема' : 'Темна тема'}
        onClick={() => setDark(!dark)}
        className="flex size-[36px] shrink-0 items-center justify-center rounded-[10px] text-ink hover:bg-bench"
      >
        {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </button>

      <div className={cn('flex shrink-0 items-center gap-[8px]', narrow ? null : 'pl-[4px]')}>
        <span
          aria-hidden="true"
          className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-accent-ink font-mono text-[11px] leading-none font-semibold text-white"
        >
          {user.initials}
        </span>
        {narrow ? null : (
          <div className="min-w-0 leading-[1.25]">
            <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
            <p className="truncate text-[12px] text-text-2">{user.role_label}</p>
          </div>
        )}
      </div>
    </header>
  );
}
