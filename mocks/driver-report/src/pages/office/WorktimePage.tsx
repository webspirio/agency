// mocks/driver-report/src/pages/office/WorktimePage.tsx
/**
 * «Робочий час» (§4.2 C-15) — shift lengths beside the tachograph, and NEVER a legal verdict.
 *
 * THE COLUMN IS «Тривалість змін», never «Робочий час», and that is the whole design of this page. What the app
 * knows is when a driver started and ended a shift; what the law counts is the tachograph. Calling the app's number
 * «робочий час» would put this product between the client and a labour inspector, which it must never be — so the
 * page shows both numbers side by side, names the difference «Різниця», and says out loud, in hold, that whether
 * Положення №340 applies to these trips under martial law is a lawyer's question and not this screen's.
 *
 * Every cell arrives finished from `worktimeRows` (I-12): «на зміні» for a driver whose only shift is today's, «—»
 * for what is not counted, «потрібен графік змінності» where a number would be a guess. Nothing is computed here —
 * a page that did the arithmetic would be a page that could quietly invent an hour.
 *
 * `SimChip` marks a row whose tachograph figure the mock simulated (Олег's Ruptela hours); `ExampleChip` marks the
 * fleet rows that are there to show the shape at 100 trucks (§6.5).
 */
import type { JSX } from 'react';
import { useWorktime } from '../../api/hooks';
import { useScope, useServerNow } from '../../app/live';
import { colW, EmptyPanel, MockBanner, PageHead, Panel, ResponsiveTable, SkeletonRows, useConsoleMode,
  type RTColumn } from '../../components/office';
import { ExampleChip, SimChip } from '../../components/shared';
import { businessDate } from '../../domain/clock';
import type { WorktimeRow } from '../../domain/dto';

const TITLE = 'Робочий час';
const DESCRIPTION = 'Тривалість змін за записами застосунку поруч із тахографом. Законний облік часу — тахограф.';
const LAWYER = 'Чи діє Положення №340 на ваші рейси під час воєнного стану — питання юриста (наказ №1727 п.3)';

export function WorktimePage(): JSX.Element {
  const mode = useConsoleMode();
  const scope = useScope();
  // The month is the SERVER's business month, never a literal: «today» on this product always comes from the clock.
  const month = businessDate(useServerNow()).slice(0, 7);
  const list = useWorktime(month, scope);
  const rows = list.data?.data ?? [];

  // §4.2 C-15's nine columns and their shares: 1 136 with the chevron at wide, 690 below it (`fit.test.tsx`).
  // «Різниця» and «Робота у вихідний» already folded under «Тахограф» at rail and now fold at compact too — five
  // columns is what a 690 px pane holds, and the tacho cell is the one that carries a sentence.
  const columns: RTColumn<WorktimeRow>[] = [
    { id: 'driver', header: 'Водій', width: colW(mode, { wide: 150, narrow: 150 }), cell: (r) => (
      <span className="flex items-center gap-[8px]">
        <span className="text-[14px] font-medium text-ink">{r.driver}</span>
        {r.simulated ? <SimChip /> : null}
        {r.example ? <ExampleChip /> : null}
      </span>
    ) },
    { id: 'shifts', header: 'Змін', width: colW(mode, { wide: 60, narrow: 56 }), align: 'right',
      cell: (r) => <span className="font-mono text-[14px] text-ink">{r.shifts}</span> },
    { id: 'span', header: 'Тривалість змін', width: colW(mode, { wide: 120, narrow: 116 }), align: 'right',
      cell: (r) => <span className="font-mono text-[14px] text-ink">{r.span}</span> },
    { id: 'on_site', header: 'На точках', width: colW(mode, { wide: 96, narrow: 100 }), align: 'right',
      cell: (r) => <span className="font-mono text-[14px] text-text-2">{r.on_site}</span> },
    { id: 'night', header: 'Нічні 22–06', width: 96, align: 'right', hideAt: ['compact', 'rail'], mergeInto: 'on_site',
      cell: (r) => <span className="font-mono text-[14px] text-text-2">{r.night}</span>,
      // A merged line loses its header, so it has to label itself: a bare «9 год» under «61 год» says nothing.
      mergedCell: (r) => <span className="font-mono text-[13px] text-text-2">{`нічні ${r.night}`}</span> },
    { id: 'curfew', header: 'Комендантська, спека', width: 160, hideAt: ['compact', 'rail'], mergeInto: 'tacho',
      cell: (r) => <span className="text-[13px] text-text-2">{r.curfew_heat}</span> },
    { id: 'tacho', header: 'Тахограф', width: colW(mode, { wide: 160, narrow: 228 }),
      cell: (r) => <span className="text-[13px] text-ink">{r.tacho}</span> },
    { id: 'diff', header: 'Різниця', width: 100, align: 'right', hideAt: ['compact', 'rail'], mergeInto: 'tacho',
      cell: (r) => <span className="font-mono text-[14px] text-ink">{r.diff}</span>,
      mergedCell: (r) => <span className="font-mono text-[13px] text-ink">{`різниця ${r.diff}`}</span> },
    { id: 'weekend', header: 'Робота у вихідний за графіком', width: 154, hideAt: ['compact', 'rail'], mergeInto: 'tacho',
      cell: (r) => <span className="text-[13px] text-text-2">{r.weekend}</span> },
  ];

  return (
    <>
      <PageHead title={TITLE} description={DESCRIPTION} />
      <div className="flex flex-col gap-[16px]">
        {/* The hold banner of §4.2 C-15. `MockBanner` is the console's one hold banner — a 4 px hold rule and a
            14 px line — and its text is the caller's by design, so the legal question is said in the same voice as
            every other standing fact this console states. */}
        <MockBanner text={LAWYER} />
        {/* No panel title: the page's own h1 already names this list, and «Робочий час» is a word this screen may
            not put over a column of the app's own hours (§4.2 C-15). */}
        <Panel>
          {list.data === undefined ? <SkeletonRows rows={4} /> : (
            <ResponsiveTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.driver}
              mode={mode}
              empty={(
                <EmptyPanel
                  title="Змін цього місяця ще немає"
                  hint="Рядок з'являється, щойно водій почне зміну в застосунку; тахограф підтягнеться після зчитування картки."
                />
              )}
              card={(r) => (
                <div className="flex flex-col gap-[4px]">
                  <span className="flex items-center gap-[8px]">
                    <p className="text-[14px] font-medium text-ink">{r.driver}</p>
                    {r.simulated ? <SimChip /> : null}
                    {r.example ? <ExampleChip /> : null}
                  </span>
                  <p className="font-mono text-[13px] text-ink">{`${r.shifts} змін · ${r.span} · на точках ${r.on_site}`}</p>
                  <p className="text-[13px] text-text-2">{`Тахограф: ${r.tacho}`}</p>
                  <p className="text-[13px] text-text-2">{r.weekend}</p>
                </div>
              )}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
