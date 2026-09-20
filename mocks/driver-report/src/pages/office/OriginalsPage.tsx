// mocks/driver-report/src/pages/office/OriginalsPage.tsx
/**
 * «Оригінали» (§4.2 C-14) — the paper chase, and the one console page whose subject is a PHYSICAL object.
 *
 * The photo is in the office within the hour; the sheet of paper is not, and until it is the trip cannot be closed.
 * So this page is not a list of documents — it is a list of PEOPLE who still owe paper, grouped by driver and trip
 * exactly as the window clerk meets them, with one chip per document because a driver hands over one sheet at a time
 * and the office marks one sheet at a time.
 *
 * TWO PANELS, TWO SHAPES, AND THE DIFFERENCE IS THE SPEC'S. «Понад 3 дні» is overdue paper: it needs the columns
 * §4.2 C-14 names (Водій · Рейс · Документи · Днів · Примітка), because «скільки днів» and the note are what decide
 * who gets called. «Очікуємо сьогодні» is not late at all — it is today's ТТН waiting at the window — so it is one
 * line per driver, «Ватаманюк П. · Р-26-3312 · ТТН 004517, 004518», with the same chips underneath.
 *
 * THE OFFICE'S MARK IS THE TRUTH and the driver's «Здав» is a hint: `receiveOriginal` is what closes a document, and
 * the chip then says who took it and when — «отримано 16:15 · Н. Шевчук» — because the next question anybody asks
 * about a missing original is «а хто його брав?». A document received TODAY stays in its row (`originalsRows` keeps
 * it), so the answer stands where the question was asked.
 */
import { useState, type JSX } from 'react';
import { Button } from '@agency/kit/button';
import { codeOf } from '../../api/contract';
import { useOriginals, useReceiveOriginal } from '../../api/hooks';
import { SAYS_ORIGINAL } from '../../api/says';
import { fmtTime, pluralN } from '../../app/format';
import { useScope } from '../../app/live';
import { colW, EmptyPanel, PageHead, Panel, ResponsiveTable, SkeletonRows, useConsoleMode,
  type RTColumn } from '../../components/office';
import { ExampleChip } from '../../components/shared';
import type { OriginalsRow } from '../../domain/dto';

const TITLE = 'Оригінали';
const DESCRIPTION = 'Паперові документи, фото яких уже в офісі, а оригінал — ще ні. Рейс закривається вашою відміткою; '
  + 'натискання водієм «Здав» — лише підказка.';
const OVERDUE = 'Понад 3 дні';
const TODAY = 'Очікуємо сьогодні';
const RECEIVE = 'Оригінал отримано';
const DAYS = ['день', 'дні', 'днів'] as const;
const NONE = '—';

type Doc = OriginalsRow['docs'][number];

/** Two ТТН of one trip read as «ТТН 004517, 004518»: the kind is said once, the way the clerk says it. */
function docLine(docs: readonly Doc[]): string {
  const [first, ...rest] = docs;
  if (first === undefined) return NONE;
  const kind = first.label.split(' ')[0] ?? '';
  const tail = rest.map((d) => (kind !== '' && d.label.startsWith(`${kind} `) ? d.label.slice(kind.length + 1) : d.label));
  return [first.label, ...tail].join(', ');
}

/** One document: its name, and either the office's mark or the button that makes one. */
function DocChip({ doc, busy, onReceive }: { doc: Doc; busy: boolean; onReceive(): void }): JSX.Element {
  const at = doc.received_at;
  return (
    <span className="inline-flex items-center gap-[10px] rounded-[10px] bg-bench/55 py-[4px] pr-[4px] pl-[10px]">
      <span className="text-[13px] leading-[1.35] text-ink">{doc.label}</span>
      {at === null ? (
        <Button type="button" variant="outline" disabled={busy} onClick={onReceive} className="h-[32px] text-[13px]">
          {RECEIVE}
        </Button>
      ) : (
        <span className="pr-[8px] text-[13px] leading-[1.35] text-text-2">
          {`отримано ${fmtTime(at)} · ${doc.received_by ?? NONE}`}
        </span>
      )}
    </span>
  );
}

function Docs({ row, busyDoc, onReceive }: {
  row: OriginalsRow;
  busyDoc: string | null;
  onReceive(docId: string): void;
}): JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-[8px]">
      {row.docs.map((doc) => (
        <DocChip key={doc.id} doc={doc} busy={busyDoc === doc.id} onReceive={() => { onReceive(doc.id); }} />
      ))}
    </span>
  );
}

export function OriginalsPage(): JSX.Element {
  const mode = useConsoleMode();
  const scope = useScope();
  const list = useOriginals(scope);
  const receive = useReceiveOriginal();
  const [busyDoc, setBusyDoc] = useState<string | null>(null);

  const rows = list.data?.data ?? [];
  const overdue = rows.filter((r) => r.group === 'OVERDUE');
  const today = rows.filter((r) => r.group === 'TODAY');
  const refused = receive.isError ? codeOf('receiveOriginal', receive.error) : undefined;

  const take = (docId: string): void => {
    setBusyDoc(docId);
    receive.mutate({ docId }, { onSettled: () => { setBusyDoc(null); } });
  };

  // §4.2 C-14's five columns and their shares: 1 136 with the chevron at wide, 690 below it (`fit.test.tsx`).
  // «Документи» keeps the lion's share at every mode — it is the only column here with buttons in it.
  const columns: RTColumn<OriginalsRow>[] = [
    { id: 'driver', header: 'Водій', width: colW(mode, { wide: 180, narrow: 150 }), cell: (r) => (
      <span className="flex items-center gap-[8px]">
        <span className="text-[14px] font-medium text-ink">{r.driver}</span>
        {r.example ? <ExampleChip /> : null}
      </span>
    ) },
    { id: 'trip', header: 'Рейс', width: colW(mode, { wide: 132, narrow: 104 }),
      cell: (r) => <span className="font-mono text-[13px] text-text-2">{r.trip_no}</span> },
    { id: 'docs', header: 'Документи', width: colW(mode, { wide: 468, narrow: 336 }),
      cell: (r) => <Docs row={r} busyDoc={busyDoc} onReceive={take} /> },
    { id: 'days', header: 'Днів', width: colW(mode, { wide: 96, narrow: 60 }),
      cell: (r) => <span className="text-[14px] text-ink">{pluralN(r.days, DAYS)}</span> },
    { id: 'note', header: 'Примітка', width: 220, hideAt: ['compact', 'rail'], mergeInto: 'driver',
      cell: (r) => <span className="text-[13px] text-text-2">{r.note ?? NONE}</span> },
  ];

  return (
    <>
      <PageHead title={TITLE} description={DESCRIPTION} />
      {refused === undefined ? null : (
        <p className="mb-[12px] text-[13px] leading-[1.45] text-reject">{SAYS_ORIGINAL[refused]}</p>
      )}
      <div className="flex flex-col gap-[16px]">
        <Panel title={OVERDUE}>
          {list.data === undefined ? <SkeletonRows rows={3} /> : (
            <ResponsiveTable
              columns={columns}
              rows={overdue}
              rowKey={(r) => r.id}
              mode={mode}
              empty={(
                <EmptyPanel
                  title="Нічого не прострочено"
                  hint="Документ з'явиться тут, коли його оригінал не дійде до офісу понад три дні."
                />
              )}
              card={(r) => (
                <div className="flex flex-col gap-[6px]">
                  <p className="text-[14px] font-medium text-ink">{`${r.driver} · ${r.trip_no} · ${pluralN(r.days, DAYS)}`}</p>
                  <Docs row={r} busyDoc={busyDoc} onReceive={take} />
                  {r.note === null ? null : <p className="text-[13px] text-text-2">{r.note}</p>}
                </div>
              )}
            />
          )}
        </Panel>
        <Panel title={TODAY}>
          {list.data === undefined ? <SkeletonRows rows={2} /> : today.length === 0 ? (
            <EmptyPanel
              title="Сьогодні нічого не чекаємо"
              hint="ТТН сьогоднішнього рейсу з'являться тут, щойно офіс надрукує лист водієві на підпис."
            />
          ) : (
            <ul className="flex flex-col">
              {today.map((r) => (
                <li key={r.id} className="flex flex-col gap-[8px] border-b border-line/70 px-[20px] py-[14px] last:border-b-0">
                  <span className="flex items-center gap-[8px]">
                    <p className="text-[14px] leading-[1.35] text-ink">{`${r.driver} · ${r.trip_no} · ${docLine(r.docs)}`}</p>
                    {r.example ? <ExampleChip /> : null}
                  </span>
                  <Docs row={r} busyDoc={busyDoc} onReceive={take} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
