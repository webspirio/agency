import { sum } from '@agency/dec';
import { asDecimal2, asInstant } from '@agency/mock';
import type { Overview, Party } from './types';

/**
 * Derivations live here, never in a component and never in a handler. The
 * handler in `src/api/routes.ts` calls this; at conversion the Nest service
 * calls the same function with the same signature.
 *
 * It takes the ROWS as an argument rather than calling `buildSeed()` itself.
 * That is the fix for the measured defect where every request rebuilt the seed,
 * so nothing a POST did survived into the next GET — and it is also what makes
 * this function pure enough to move into a service unchanged.
 *
 * `now` is a parameter rather than a `new Date()` inside, so a test can pin it
 * and the demo is not clock-dependent.
 */
export function overview(now: string, parties: readonly Party[]): Overview {
  return {
    headline: '{{title}}',
    generated_at: asInstant(now),
    // Rounded per line, then summed — the printed lines must add up to the
    // printed total, which is the one arithmetic property a client checks.
    total: asDecimal2(sum(parties.map((party) => party.balance))),
    rows: parties.length,
  };
}
