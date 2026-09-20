// mocks/driver-report/src/pages/office/TruckDayPage.tsx
/** C-08 «Подорожній лист» — the derived waybill (§4.2 C-08, 02 UC-O09).
 *
 *  THE NUMBER IS ASSIGNED AT CONFIRMATION, AND THE TITLE SAYS SO. Before it the h1 reads «Подорожній лист ·
 *  21.09.2026» with a muted «чернетка»; after it «Подорожній лист № ПЛ-000412 від 21.09.2026». The office is used to
 *  a paper blank that already carries a number, so a draft has to look like a draft or they will file it. The title
 *  is rendered ONCE, inside the document header Panel and not also in a `PageHead`: this screen IS a document, and a
 *  document with its own name printed twice above it is a console page pretending to be one.
 *
 *  Nothing on this page is computed here. Every figure — the four cells, the chronology, the legs, the fuel block,
 *  the flags, the audit, the footer's consequence — arrives finished from `src/domain/views/truckday.ts` and is
 *  rendered verbatim. That is why the same day can be printed (C-09) and exported (C-11) without three places
 *  agreeing on what «234 км» means.
 *
 *  TWO REFUSALS, AND THEY ARE OPPOSITE. `TRUCK_DAY_NOT_FOUND` is terminal — a stale link, nothing to render. But
 *  `DAY_CHANGED` is a LIVE-CONSOLE refusal: somebody else corrected the day between this page's read and this
 *  operator's click, so the banner says WHO and WHAT (`fillSays` off the envelope's ctx), the page refetches, and the
 *  footer's one-shot commit guard is renewed on the new version — the operator re-reads and confirms again, rather
 *  than being told «try again» with nothing changed on screen. Branching is on `code` alone (HARD RULE 5). */
import { useState, type JSX } from 'react';
import { CheckCheck, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { codeOf } from '../../api/contract';
import { useConfirmTruckDay, useTruckDay } from '../../api/hooks';
import { fillSays, SAYS_TRUCK_DAY } from '../../api/says';
import { fmtDate, fmtTime } from '../../app/format';
import { EmptyPanel, Panel, SkeletonRows, StatusPill } from '../../components/office';
import { FactGrid } from '../../components/office/review';
import type { TruckDayView } from '../../domain/dto';
import { DayFooter } from './day/DayFooter';
import { DaySummary, DayTabs } from './day/DayTabs';

const DRAFT_LINE = 'Чернетка електронного подорожнього листа · до наказу КТЛ';
const BACK = 'Дні на підтвердження';

function titleOf(day: TruckDayView['day']): string {
  return day.waybill_no === null
    ? `Подорожній лист · ${fmtDate(day.date)}`
    : `Подорожній лист № ${day.waybill_no} від ${fmtDate(day.date)}`;
}

function BackLink(): JSX.Element {
  return (
    <Link to="/days" className="mb-[6px] inline-flex h-[32px] items-center rounded-[8px] text-[13px] text-text-2 hover:text-ink">
      ← {BACK}
    </Link>
  );
}

export function TruckDayPage(): JSX.Element {
  const { truckDayId = '' } = useParams();
  const day = useTruckDay(truckDayId);
  const confirm = useConfirmTruckDay(truckDayId);
  const [changed, setChanged] = useState<string | null>(null);

  const view = day.data ?? null;

  if (day.isPending) {
    return (
      <>
        <BackLink />
        <Panel><SkeletonRows /></Panel>
      </>
    );
  }

  if (view === null) {
    const code = codeOf('getTruckDay', day.error);
    return (
      <>
        <BackLink />
        <EmptyPanel
          title={code === 'TRUCK_DAY_NOT_FOUND' ? SAYS_TRUCK_DAY.TRUCK_DAY_NOT_FOUND : 'День не відкрився.'}
          hint="Поверніться до «Дні на підтвердження» і відкрийте день зі списку."
        />
      </>
    );
  }

  const stamp = view.day.confirmed;
  const confirmed = view.day.status === 'CONFIRMED' && stamp !== null;

  const onConfirm = (reason: string | null): void => {
    confirm.mutate(
      { version: view.version, ...(reason === null ? {} : { reason }) },
      {
        // The banner is cleared by the NEXT confirmation, never by the refetch this one triggers: a `DAY_CHANGED`
        // that vanished the moment the new version landed would leave the operator confirming a day they were
        // never told had moved.
        onSuccess: () => setChanged(null),
        onError: (err) => {
          const code = codeOf('confirmTruckDay', err);
          if (code === 'DAY_CHANGED') {
            setChanged(fillSays(SAYS_TRUCK_DAY.DAY_CHANGED, err));
            void day.refetch();
            return;
          }
          if (code === 'TRUCK_DAY_NOT_FOUND') setChanged(SAYS_TRUCK_DAY.TRUCK_DAY_NOT_FOUND);
        },
      },
    );
  };

  return (
    <>
      <BackLink />

      <Panel className="mb-[16px] px-[24px] py-[24px]">
        <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px]">
          <h1 className="min-w-0 text-o-h1 text-ink">{titleOf(view.day)}</h1>
          {confirmed && stamp !== null
            ? <StatusPill tone="plain" icon={CheckCheck} word={`підтверджено ${fmtTime(stamp.at)}`} />
            : <StatusPill tone="muted" icon={FileText} word="чернетка" />}
          {view.badges.map((badge) => (
            <span key={badge} className="text-[13px] leading-[1.4] text-hold">{badge}</span>
          ))}
        </div>
        <p className="mt-[6px] text-[14px] leading-[1.45] text-text-2">{DRAFT_LINE}</p>
        <div className="mt-[20px]">
          <FactGrid items={view.requisites} />
        </div>
      </Panel>

      {changed === null ? null : (
        <p className="mb-[16px] rounded-[12px] bg-hold-wash px-[16px] py-[12px] text-[14px] leading-[1.45] text-hold">
          {changed}
        </p>
      )}

      <div className="mb-[16px]">
        <DaySummary summary={view.summary} />
      </div>

      <DayTabs view={view} />

      {/* Keyed on the version the operator read: a day that CHANGED gets a fresh one-shot guard (04 EC-137). */}
      <DayFooter
        key={view.version}
        consequence={view.consequence}
        flagsOpen={view.flags_open}
        confirmed={confirmed}
        printTo={`/day/${view.day.id}/print`}
        onConfirm={onConfirm}
      />
    </>
  );
}
