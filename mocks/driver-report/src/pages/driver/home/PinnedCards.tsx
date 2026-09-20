// mocks/driver-report/src/pages/driver/home/PinnedCards.tsx
/** Everything the office (or the driver's own half-finished flow) is waiting on, pinned above the now card in the
 *  order §3.2 fixes: the open draft, the R+C card-out row, the office's request, the office's correction, the
 *  capture he put off, and the one-time «Що бачить офіс».
 *
 *  THE ORDER IS THE POINT and it is not alphabetical: it runs from "you started this and stopped" through "the
 *  office is blocked on you" to "read this once". A card lower down can wait a day; the draft cannot, because the
 *  seq it minted is already spent and the office can see the gap (§7.7).
 *
 *  EVERY CARD IS OCHRE AND NONE OF THEM REFUSES ANYTHING (§8.6 #4). The brick tone is office-only, and the accent
 *  belongs to the one state-advancing button in the ActionBar — a pinned card is an errand, not the next move.
 *
 *  «Відкинути» is a button BESIDE the draft card rather than inside it: `HoldCard` with `onPress` IS a button, and a
 *  button inside a button is invalid HTML (and an ambiguous tap target at 4 rem). */
import type { JSX } from 'react';
import { CreditCard, FileClock, MessageCircleQuestionMark, Pencil, Printer, ShieldCheck } from 'lucide-react';
import { fmtDec, fmtTime, pluralN } from '../../../app/format';
import type { Draft } from '../../../app/flow';
import { Artefact } from '../../../components/artefacts';
import { HoldCard, QuietButton } from '../../../components/driver';
import { DC } from '../../../copy/driver';
import { atOrBefore, isBefore } from '../../../domain/clock';
import { receiptOwed } from '../RefuelPage';
import type { CorrectionView, DriverToday, RecordView, RequestCardView } from '../../../domain/dto';
import type { Instant, Payloads, RecordType } from '../../../domain/types';

const PRINTING = 'ТТН ще друкують — сфотографуйте, щойно дадуть';
const DISCARD = 'Відкинути';
const OFFICE_SEES = 'Що бачить офіс — прочитайте один раз';
const AGREE = 'Згоден';
const DISAGREE = 'Не згоден — подзвоніть';
const NEEDED = 'Потрібно від вас';
const ASKS_RETAKE = 'Диспетчер просить перезняти';
const ASKS_CALL = 'Диспетчер просить подзвонити';
const CARD_OUT = (hm: string): string => `Картку вийнято ${hm}. Закінчити зміну?`;
/** The reason reads as the tail of a sentence («… зворотний бік — розмито»), so it is not capitalised here. */
const asTail = (line: string): string => line.toLocaleLowerCase('uk-UA');

/** «Потрібно від вас (2) · Диспетчер просить перезняти: ТТН 2 з 2, зворотний бік — розмито», as ONE text node.
 *  One node, because the accessible name of the card is what §8.2 reads and a name assembled by the browser from
 *  several inline spans is a different string on every engine. */
function requestLine(open: number, q: RequestCardView): string {
  const asks = q.type === 'CALL_ME' ? ASKS_CALL : `${ASKS_RETAKE}: ${q.target_label}`;
  const tail = q.reason_line === '' ? '' : ` — ${asTail(q.reason_line)}`;
  return `${NEEDED} (${open}) · ${asks}${tail}`;
}

/** «Офіс виправив: одометр 318 405 → 381 405 · число виправлено за фото щитка · Н. Шевчук 16:05» (§3.3 D-02).
 *  An odometer is a digit string and is grouped as one; a time is an instant and is shown in Kyiv. */
function correctionLine(c: CorrectionView): string {
  const [what, was, now] = c.field === 'odometer'
    ? ['одометр', fmtDec(c.old), fmtDec(c.new)]
    : ['час', fmtTime(c.old), fmtTime(c.new)];
  return `Офіс виправив: ${what} ${was} → ${now} · ${c.driver_wording} · ${c.by} ${fmtTime(c.at)}`;
}

type Owed = { key: string; title: string; to: string };
/** `RecordView` carries `type` and `payload` as two INDEPENDENT unions (I-5); the server pairs them, so the pair is
 *  re-joined here exactly as `project()` re-joins it, and `r.type === 'REFUEL'` then narrows `r.payload`. */
type Joined = { [T in RecordType]: RecordView & { type: T; payload: Payloads[T] } }[RecordType];

/** What a capture put off still owes, as a card apiece (§3.3 D-02, D-07/D-08 «Зніму після виїзду»). A record whose
 *  documents arrived later carries a `DOCS_ADDED` naming the same stop; until it does, the phone keeps asking. */
function deferredCards(today: DriverToday, now: Instant): Owed[] {
  const alive = today.records.filter((r) => !r.voided && atOrBefore(r.occurred_at, now)) as Joined[];
  const settled = new Set(alive.flatMap((r) => (r.type === 'DOCS_ADDED' && r.stop_id !== null ? [r.stop_id] : [])));
  /** The PLACE'S OWN NAME — «Лан», not the TripRail's «Лан, Балабине». §2.4's deep-link table, §3.2's home diagram,
   *  §3.3 D-08 and `UnloadedPage`'s own docblock all spell this card «… з підписом і щитка — Лан», and `short` made
   *  it read «— Лан, Балабине». The one place that spells it with a town is §3.3 D-06's LOADING example
   *  («… фото ТТН — Вільнянськ», where the stop's own name is «Дніпро-Корм»); that path is not in the demo and its
   *  card now reads «— Дніпро-Корм». Flagged for the owner rather than decided twice. */
  const nameOf = (stopId: string): string => today.plan?.stops.find((s) => s.stop_id === stopId)?.label ?? '';
  const owedBy = (r: Joined): Owed[] => {
    if (r.type === 'REFUEL') {
      // ONE sentence, composed where the refuel flow composes it: «Зніму пізніше» already hands that receipt
      // «Потрібно від вас: чек із заправки 08:57» as the record's `next`, and two copies of it can drift.
      return r.payload.deferred
        ? [{ key: r.key, title: receiptOwed(r.occurred_at), to: `/refuel/${r.key}/later` }] : [];
    }
    const stopId = r.stop_id;
    if (stopId === null || settled.has(stopId)) return [];
    if (r.type === 'UNLOADED' && r.payload.deferred !== null) {
      return [{ key: r.key, title: `${NEEDED}: фото ТТН з підписом і щитка — ${nameOf(stopId)}`,
        to: `/stop/${stopId}/later` }];
    }
    if (r.type === 'LOADED' && r.payload.deferred !== null) {
      return [{ key: r.key, title: `${NEEDED}: фото ТТН — ${nameOf(stopId)}`, to: `/stop/${stopId}/later` }];
    }
    return [];
  };
  return alive.flatMap(owedBy);
}

export function PinnedCards({ today, now, drafts, officeSeesRead, shiftOpen, rc, onOpen, onResume, onDiscard, onAck }: {
  today: DriverToday;
  now: Instant;
  drafts: Draft[];
  officeSeesRead: boolean;
  shiftOpen: boolean;
  rc: boolean;
  onOpen(path: string): void;
  onResume(draft: Draft): void;
  onDiscard(draft: Draft): void;
  onAck(correction: CorrectionView, agree: boolean): void;
}): JSX.Element {
  const request = today.requests[0] ?? null;
  const shiftFrom = today.shift?.started_at ?? null;
  const cardOut = rc && shiftOpen && shiftFrom !== null
    ? today.auto_events.filter((e) => e.kind === 'CARD_OUT' && atOrBefore(e.at, now) && !isBefore(e.at, shiftFrom)).at(-1) ?? null
    : null;

  return (
    <>
      {drafts.map((draft) => (draft.data['printing'] === true
        ? <HoldCard key={draft.id} icon={Printer} title={PRINTING} onPress={() => { onResume(draft); }} />
        : (
          <div key={draft.id} className="flex flex-col gap-2">
            <HoldCard
              icon={FileClock}
              title={`Продовжимо: ${draft.label} · ${pluralN(draft.pages.length, DC.plurals.page)} вже збережено`}
              onPress={() => { onResume(draft); }}
            />
            <QuietButton label={DISCARD} onPress={() => { onDiscard(draft); }} />
          </div>
        )))}

      {cardOut === null ? null : (
        <HoldCard icon={CreditCard} title={CARD_OUT(fmtTime(cardOut.at))} onPress={() => { onOpen('/shift/end'); }} />
      )}

      {request === null ? null : (
        <HoldCard
          icon={MessageCircleQuestionMark}
          title={requestLine(today.requests.length, request)}
          onPress={() => { onOpen(`/request/${request.id}`); }}
          {...(request.thumb_variant === null ? {} : {
            thumb: (
              <span aria-hidden="true" className="shrink-0">
                <Artefact variant={request.thumb_variant} size="thumb" />
              </span>
            ),
          })}
        />
      )}

      {today.corrections_to_ack.map((c) => (
        <HoldCard key={c.id} icon={Pencil} title={correctionLine(c)}>
          <span className="flex flex-wrap gap-2 pt-2">
            <QuietButton half label={AGREE} onPress={() => { onAck(c, true); }} />
            <QuietButton half label={DISAGREE} onPress={() => { onAck(c, false); }} />
          </span>
        </HoldCard>
      ))}

      {deferredCards(today, now).map((d) => (
        <HoldCard key={d.key} icon={FileClock} title={d.title} onPress={() => { onOpen(d.to); }} />
      ))}

      {officeSeesRead ? null : (
        <HoldCard icon={ShieldCheck} title={OFFICE_SEES} onPress={() => { onOpen('/office-sees'); }} />
      )}
    </>
  );
}
