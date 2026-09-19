// mocks/driver-report/src/api/handlers/myday.ts
/** Operations 8–9 of §7.4: «Мій день» and «Мій місяць». Reads only, and thin: every rule lives in
 *  `src/domain/views/myday.ts`. Each handler reads `s.world()` at call time (the stage's reset replaces the stores),
 *  answers for the phone that asks (`c.actor.id`), and uses `c.now`, never the wall clock.
 *
 *  Neither operation declares a code (§7.5: the driver meets only two refusals, neither of them here). A date or month
 *  that is not one answers for the server's own day or month, so «Мій день» opened without a date shows today.
 *
 *  No return-type annotation on `myDayHandlers`: an annotation widens the map and blinds the exactness sink in
 *  routes.ts. */
import { asBusinessDate, asInstant, type BusinessDate, type HandlerCtxOf, type Instant } from '@agency/mock';
import { businessDate } from '../../domain/clock';
import { myDayView, myMonthView } from '../../domain/views/myday';
import type { Api } from '../contract';
import type { Server } from '../server';

/** The day the path names, or the server's today when it names none. */
function dateOr(raw: string, now: Instant): BusinessDate {
  try {
    return asBusinessDate(raw);
  } catch {
    return businessDate(now);
  }
}
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** The month the path names ('YYYY-MM'), or the server's current month. */
const monthOr = (raw: string, now: Instant): string => (MONTH.test(raw) ? raw : businessDate(now).slice(0, 7));

export function myDayHandlers(s: Server) {
  return {
    /** «Мій день»: his own record of one day, final at once. */
    getMyDay: (c: HandlerCtxOf<Api, 'getMyDay'>) => {
      const now = asInstant(c.now);
      return myDayView(s.world(), c.actor.id, dateOr(c.params.date, now), now);
    },

    /** «Мій місяць»: his month as facts, never a score. */
    getMyMonth: (c: HandlerCtxOf<Api, 'getMyMonth'>) => {
      const now = asInstant(c.now);
      return myMonthView(s.world(), c.actor.id, monthOr(c.params.month, now), now);
    },
  };
}
