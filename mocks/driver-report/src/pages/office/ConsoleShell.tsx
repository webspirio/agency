// mocks/driver-report/src/pages/office/ConsoleShell.tsx
/** The console's one frame (§4.1): ink sidebar · 56 px header · the page, at four widths.
 *
 *  FOUR THINGS LIVE HERE AND NOWHERE ELSE, because every console page needs them and none of them may be decided
 *  twice:
 *
 *  1. THE BEAT. `BootGate defaultBeat={10}` — standalone it builds its own server at `?beat`, embedded it waits for
 *     the stage's. Nothing below it renders before the server sits at a beat, so no page ever reads an empty world.
 *  2. THE SCOPE. It is the server's (`ui.scope`), not page state: the stage's «Такт» sets it (§5.6) and the
 *     header's switch writes it back through `setScope`, so the phone pane, the console pane and the presenter bar
 *     can never disagree about which parc is on screen.
 *  3. THE LIVE WIRE. `useLiveSync()` once — every write in any pane refetches this pane's active queries 50 ms
 *     later — and `useDriverWrites` for the toast of §5.9 #4. ONE toast at a time, under a fixed `id`, so a burst of
 *     records replaces rather than stacks: a tower of toasts in front of a client is the demo talking over itself.
 *  4. THE LIGHT. `ensureLightDefault()`: light is the default on every surface and nothing follows
 *     `prefers-color-scheme` (D15). A laptop in dark mode must not open this console dark in front of the room.
 *
 *  The sheet's boolean is HERE rather than inside `Sidebar` (W1-04's integrator note): the only control that opens it
 *  is the header's 44 px menu button, which is a sibling, so neither component can own it alone. */
import { useEffect, useState, type JSX } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { Button } from '@agency/kit/button';
import { cn } from '@agency/kit/lib/cn';
import { Toaster } from '@agency/kit/sonner';
import { toast } from '@agency/kit/toast';
import { useOfficeSummary } from '../../api/hooks';
import { BootGate } from '../../app/boot';
import { setScope, useDriverWrites, useLiveSync, useScope, useServerNow } from '../../app/live';
import { ensureLightDefault } from '../../app/theme';
import { ConsoleHeader, Sidebar, useConsoleMode, type ConsoleMode } from '../../components/office';
import { OC } from '../../copy/office';
import type { Counts, OfficeSummary } from '../../domain/dto';

/** What the sidebar counts while the summary is in flight. A zero is wrong for one frame, but an ABSENT badge moves
 *  every label sideways when it lands, and the eye reads that as a change in the data. */
const NO_COUNTS: Counts = { now: 0, review: 0, days_to_confirm: 0, originals: 0, bas_ready: 0 };
const NO_USER: OfficeSummary['user'] = { id: '', name: '', initials: '', role: 'OPERATOR', role_label: '' };
/** §4.1 «Page»: 32 px wide · 24 px compact and rail · 16 px mobile; max-width 1 320. */
const PAD: Record<ConsoleMode, string> = {
  wide: 'p-[32px]',
  compact: 'p-[24px]',
  rail: 'p-[24px]',
  mobile: 'p-[16px]',
};

function Console(): JSX.Element {
  const mode = useConsoleMode();
  const now = useServerNow();
  const scope = useScope();
  const summary = useOfficeSummary(scope);
  const [sheet, setSheet] = useState(false);
  const navigate = useNavigate();

  useLiveSync();
  useEffect(() => {
    ensureLightDefault();
  }, []);

  // §5.9 #4: driver-originated writes only, bottom-right, 4 s, ONE at a time — the fixed id is what replaces the
  // previous one in place. The ghost button opens the day the record landed in.
  useDriverWrites((e) => {
    if (e.toast === null) return;
    const dayId = e.truck_day_id;
    toast(<b>{e.toast.title}</b>, {
      id: 'driver-live',
      duration: 4000,
      description: (
        <>
          {e.toast.line}{' '}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (dayId !== null) navigate(`/day/${dayId}`);
            }}
          >
            {OC.openDay}
          </Button>
        </>
      ),
    });
  });

  const data = summary.data;
  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-paper">
      <Sidebar
        mode={mode}
        counts={data?.counts ?? NO_COUNTS}
        onCall={data?.on_call ?? { name: '—', until: '—' }}
        open={sheet}
        onClose={() => setSheet(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader
          mode={mode}
          clock={now}
          scope={scope}
          onScope={setScope}
          user={data?.user ?? NO_USER}
          onMenu={() => setSheet(true)}
        />
        <main className={cn('min-h-0 flex-1 overflow-y-auto', PAD[mode])}>
          <div className="mx-auto w-full max-w-[1320px]">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}

export function ConsoleShell(): JSX.Element {
  return (
    <BootGate defaultBeat={10}>
      <Console />
    </BootGate>
  );
}
