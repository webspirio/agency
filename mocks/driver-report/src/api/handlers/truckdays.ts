// mocks/driver-report/src/api/handlers/truckdays.ts
/** Operations 18–21 of §7.4: the list of truck-days, the derived waybill, «Підтвердити день» and the print. Thin: every
 *  figure is `src/domain/views/truckday.ts`'s; a handler reads `s.stores` / `s.world()` at call time (the stage's reset
 *  replaces them), uses `c.now` and never the wall clock, stores only what the office decided and tells the other panes
 *  through `s.wrote`.
 *
 *  The office user is `'user-' + login` on the wire and its STORE id in every row written here (`confirmed_by`, the
 *  audit's `actor_id`). A confirmation never moves `version` (§7.3): a second click on the same version finds the day
 *  CONFIRMED and answers it unchanged, so a double click stamps one number (EC-137); a version the office did not look at
 *  is DAY_CHANGED, with who changed it, when and what.
 *
 *  Every refusal is its operation's own literal `fail('<op>', 'TRUCK_DAY_NOT_FOUND', …)` — never a helper that takes the
 *  operation (`contract:complete` credits a code only to a literal call site). No return-type annotation on
 *  `truckDayHandlers`: an annotation widens the map and blinds the exactness sink in routes.ts. */
import { asInstant, pageQuery, type Actor, type HandlerCtxOf, type Paginated } from '@agency/mock';
import { lt } from '../../domain/num';
import type { BusinessDate, Scope, World } from '../../domain/types';
import { CONFIRM_CODE, confirmAction, lastChange, nextWaybillNo, PRINT_ACTION, PRINT_CODE, truckDayRows,
  truckDayView } from '../../domain/views/truckday';
import { fail, type Api } from '../contract';
import { SAYS_TRUCK_DAY } from '../says';
import type { Server } from '../server';

const STATES = ['to-confirm', 'confirmed', 'exported'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A page of rows by the wire's `page` / `limit` (limit capped at 100), chunked rather than multiplied. */
function paged<T>(rows: readonly T[], query: Record<string, string | string[]>): Paginated<T> {
  const { page, limit } = pageQuery(query);
  let start = 0;
  for (let p = 1; p !== page && lt(start, rows.length); p += 1) start += limit;
  return { data: rows.slice(start, start + limit), total: rows.length, page, limit };
}
const one = (v: string | string[] | undefined): string | null => (typeof v === 'string' && v !== '' ? v : null);
/** The office user behind a console actor: its store id, or the actor's own id when no user answers to it. */
const userIdOf = (w: World, actor: Actor): string => w.officeUsers.find((u) => `user-${u.login}` === actor.id)?.id ?? actor.id;
/** Its role as the office rows store it (`OPERATOR`), or the actor's own when no user answers to it. */
const userRole = (w: World, actor: Actor): string =>
  w.officeUsers.find((u) => `user-${u.login}` === actor.id)?.role ?? actor.role;

export function truckDayHandlers(s: Server) {
  return {
    /** «Дні на підтвердження» (C-07): one tab, one scope, one date or all of them. */
    listTruckDays: (c: HandlerCtxOf<Api, 'listTruckDays'>) => {
      const rawState = one(c.query['state']);
      const state = STATES.find((x) => x === rawState) ?? 'to-confirm';
      const scope: Scope = one(c.query['scope']) === 'FLEET' ? 'FLEET' : 'PILOT';
      const rawDate = one(c.query['date']);
      const date = rawDate !== null && DATE.test(rawDate) ? (rawDate as BusinessDate) : null;
      return paged(truckDayRows(s.world(), state, scope, date, asInstant(c.now)), c.query);
    },

    /** «Подорожній лист» (C-08): the whole derived waybill. */
    getTruckDay: (c: HandlerCtxOf<Api, 'getTruckDay'>) => {
      const view = truckDayView(s.world(), c.params.id, asInstant(c.now));
      if (view === null) fail('getTruckDay', 'TRUCK_DAY_NOT_FOUND', SAYS_TRUCK_DAY.TRUCK_DAY_NOT_FOUND);
      return view;
    },

    /** «Підтвердити день»: the next number of the series, who and when, once per version. */
    confirmTruckDay: (c: HandlerCtxOf<Api, 'confirmTruckDay'>) => {
      const now = asInstant(c.now);
      const id = c.params.id;
      const day = s.stores.truckDays.get(id);
      if (day === undefined) fail('confirmTruckDay', 'TRUCK_DAY_NOT_FOUND', SAYS_TRUCK_DAY.TRUCK_DAY_NOT_FOUND);
      if (c.body.version !== day.version) {
        fail('confirmTruckDay', 'DAY_CHANGED', SAYS_TRUCK_DAY.DAY_CHANGED, lastChange(s.world(), id, now));
      }
      if (day.status !== 'CONFIRMED') {
        const w = s.world();
        const userId = userIdOf(w, c.actor);
        const waybill = nextWaybillNo(w, day.example);
        s.stores.truckDays.update(id, { status: 'CONFIRMED', waybill_no: waybill, confirmed_by: userId, confirmed_at: now,
          confirm_reason: c.body.reason ?? null });
        s.stores.audit.create({ at: now, actor_id: userId, role: userRole(w, c.actor), action: CONFIRM_CODE, target: waybill,
          detail: confirmAction(day.version), truck_day_id: id });
        s.wrote('confirmTruckDay', c, { truck_day_id: id, result_id: id, highlight: true });
      }
      const view = truckDayView(s.world(), id, now);
      if (view === null) fail('confirmTruckDay', 'TRUCK_DAY_NOT_FOUND', SAYS_TRUCK_DAY.TRUCK_DAY_NOT_FOUND);
      return view;
    },

    /** «Друкувати подорожній лист» (C-09): the preview opening records the first print; a reprint changes nothing. */
    printTruckDay: (c: HandlerCtxOf<Api, 'printTruckDay'>) => {
      const now = asInstant(c.now);
      const id = c.params.id;
      const day = s.stores.truckDays.get(id);
      if (day === undefined) fail('printTruckDay', 'TRUCK_DAY_NOT_FOUND', SAYS_TRUCK_DAY.TRUCK_DAY_NOT_FOUND);
      if (day.printed_at === null) {
        const w = s.world();
        s.stores.truckDays.update(id, { printed_at: now });
        s.stores.audit.create({ at: now, actor_id: userIdOf(w, c.actor), role: userRole(w, c.actor), action: PRINT_CODE,
          target: day.waybill_no ?? id, detail: PRINT_ACTION, truck_day_id: id });
        s.wrote('printTruckDay', c, { truck_day_id: id, result_id: id, highlight: true });
      }
      const view = truckDayView(s.world(), id, now);
      if (view === null) fail('printTruckDay', 'TRUCK_DAY_NOT_FOUND', SAYS_TRUCK_DAY.TRUCK_DAY_NOT_FOUND);
      return view;
    },
  };
}
