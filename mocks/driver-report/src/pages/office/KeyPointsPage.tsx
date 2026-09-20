// mocks/driver-report/src/pages/office/KeyPointsPage.tsx
/** C-10 «Ключові точки» — the geozone report the owner builds in Excel, as a table (§4.2 C-10, §8.3 C-10 #1–#2).
 *
 *  One row per VISIT: a stop a truck arrived at on the chosen day, with when it left and the odometer that was read
 *  there. `src/domain/views/reports.ts` decides all six values; this file only places them, which is why the departure
 *  column prints `departed_label` verbatim («08:40 (запис)», «невідомо, за ТТН», «—») instead of re-deciding here what
 *  an open visit looks like.
 *
 *  The day is in the URL (`?date=`) so a row the office wants to show again survives a paste into a chat, and its
 *  default is the SERVER'S business date — never a literal, because the stage rebuilds the world at a beat and a
 *  hard-coded «21.09» would be right only until someone changed the demo day (§0.1, §8.6 #3).
 *
 *  «Завантажити CSV» is a `Blob` and a temporary `<a download>` (`saveFile`, W1-04) over `keyPointsCsv` — the same
 *  finished rows the table shows, written by `src/domain/export.ts`, which owns the BOM, the `;` and the CRLF. No
 *  browser dialog, because the download shelf plus the «Файл … збережено» toast IS the confirmation (§8.3 C-10 #2).
 *  That toast goes through the kit store and is drawn by the ONE `<Toaster />` `ConsoleShell` mounts (§4.1), which is
 *  also where «В BAS» puts its saved-file line — one toaster per console, not one per page. */
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@agency/kit/button';
import { DateStepper } from '@agency/kit/date-stepper';
import { toast } from '@agency/kit/toast';
import { Download } from 'lucide-react';
import { asBusinessDate, type BusinessDate } from '@agency/mock';
import { colW, PageHead, Panel, ResponsiveTable, SkeletonRows, EmptyPanel, saveFile, useConsoleMode,
  type ConsoleMode, type RTColumn } from '../../components/office';
import { Plate, SimChip, SourceBadge } from '../../components/shared';
import { useScope, useServerNow } from '../../app/live';
import { fmtDay, fmtKm, fmtTime } from '../../app/format';
import { OC } from '../../copy/office';
import { addDays, businessDate, daysBetween } from '../../domain/clock';
import type { KeyPointRow } from '../../domain/dto';
import { fileName, keyPointsCsv } from '../../domain/export';
import { gt } from '../../domain/num';
import { useKeyPoints } from '../../api/hooks';

const TITLE = 'Ключові точки';
const DESCRIPTION = 'Прибуття і виїзд на кожному місці за день — без геозон і Excel. Ruptela — за координатами проти '
  + 'ваших місць; Регіс — за дотиками водія.';
/** A business date and nothing else; a pasted `?date=` that is not one falls back to the server's day. The shape test
 *  is not enough — `asBusinessDate` also refuses an unreal day, and «2026-13-45» pasted from a chat must land the
 *  office on today rather than throw a blank page in front of a client. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function askedDate(raw: string | null): BusinessDate | null {
  if (raw === null || !DATE.test(raw)) return null;
  try {
    return asBusinessDate(raw);
  } catch {
    return null;
  }
}

/** The six columns of §4.2 C-10, and their shares. Nothing is dropped: below `wide` «Джерело» becomes «Одометр»'s
 *  second line, which is where a badge belongs anyway — it vouches for that number and for nothing else. Wide adds
 *  up to 1 036 with the chevron, narrow to 690, against the 1 136 and 690 px panes of `fit.test.tsx`.
 *  `mode` is still the caller's, because a page — not a table — decides the fold. */
const W = {
  plate: { wide: 168, narrow: 150 },
  place: { wide: 268, narrow: 168 },
  arrived: { wide: 108, narrow: 90 },
  departed: { wide: 176, narrow: 132 },
  odometer: { wide: 128, narrow: 110 },
};

export function KeyPointsTable({ rows, mode }: { rows: KeyPointRow[]; mode: ConsoleMode }): JSX.Element {
  const columns: RTColumn<KeyPointRow>[] = [
    { id: 'plate', header: 'Машина', width: colW(mode, W.plate), cell: (r) => <Plate plate={r.plate} size="sm" /> },
    { id: 'place', header: 'Місце', width: colW(mode, W.place), cell: (r) => r.place },
    { id: 'arrived', header: 'Прибуття', width: colW(mode, W.arrived),
      cell: (r) => <span className="font-mono tabular-nums">{fmtTime(r.arrived_at)}</span> },
    { id: 'departed', header: 'Виїзд', width: colW(mode, W.departed),
      cell: (r) => <span className="font-mono tabular-nums">{r.departed_label}</span> },
    { id: 'odometer', header: 'Одометр', width: colW(mode, W.odometer), align: 'right',
      cell: (r) => <span className="font-mono tabular-nums">{fmtKm(r.odometer)}</span> },
    { id: 'source', header: 'Джерело', width: 148, hideAt: ['compact', 'rail'], mergeInto: 'odometer',
      cell: (r) => (
        <span className="inline-flex items-center gap-[6px]">
          <SourceBadge source={r.source} />
          {r.simulated ? <SimChip /> : null}
        </span>
      ) },
  ];
  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(r) => `${r.plate}|${r.arrived_at}|${r.place}`}
      mode={mode}
      card={(r) => (
        <div className="flex flex-col gap-[6px]">
          <div className="flex items-center gap-[8px]">
            <Plate plate={r.plate} size="sm" />
            <span className="min-w-0 truncate">{r.place}</span>
          </div>
          <p className="font-mono text-[13px] tabular-nums text-text-2">
            {fmtTime(r.arrived_at)} → {r.departed_label} · {fmtKm(r.odometer)}
          </p>
          <span className="inline-flex items-center gap-[6px]">
            <SourceBadge source={r.source} />
            {r.simulated ? <SimChip /> : null}
          </span>
        </div>
      )}
      empty={<EmptyPanel title="За цей день ключових точок немає" hint="Виберіть інший день — рядки з'являться тут самі, щойно водій приїде на місце." />}
    />
  );
}

export function KeyPointsPage(): JSX.Element {
  const mode = useConsoleMode();
  const scope = useScope();
  // A minute is finer than a business date ever changes; a one-second tick would re-render the whole table for nothing.
  const today = businessDate(useServerNow(60_000));
  const [params, setParams] = useSearchParams();
  const date = askedDate(params.get('date')) ?? today;
  const go = (next: BusinessDate): void => setParams({ date: next });

  const query = useKeyPoints(date, scope);
  const rows = query.data?.data ?? [];

  const download = (): void => {
    const name = fileName('KEY_POINTS', date, 'CSV');
    saveFile(name, 'text/csv;charset=utf-8', keyPointsCsv(rows));
    // `translate="no"`: a file name is a name, and a browser's page translator rewriting it mid-demo would name a
    // file that is not on the disk (EC-171). The toast itself is the console shell's `<Toaster />` (§4.1).
    toast(<span translate="no">{OC.toastSaved(name, rows.length)}</span>);
  };

  return (
    <>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <>
            <DateStepper
              label={fmtDay(date)}
              onPrev={() => go(addDays(date, -1))}
              onNext={() => go(addDays(date, 1))}
              canNext={gt(daysBetween(date, today), 0)}
            />
            <Button variant="outline" onClick={download}>
              <Download aria-hidden="true" />
              Завантажити CSV
            </Button>
          </>
        }
      />
      <Panel>
        {query.isPending ? <SkeletonRows /> : <KeyPointsTable rows={rows} mode={mode} />}
      </Panel>
    </>
  );
}
