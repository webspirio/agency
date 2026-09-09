import { sum } from '@agency/dec';
import { asDecimal2, asInstant } from '@agency/mock';
import { buildSeed } from './seed';
import type { Overview } from './types';

/**
 * Derivations live here, never in a component and never in a handler. The
 * handler in `src/api/routes.ts` calls this; at conversion the Nest service
 * calls the same function with the same signature.
 *
 * `now` is a parameter rather than a `new Date()` inside, so a test can pin it.
 */
export function overview(now: string): Overview {
  const { parties } = buildSeed();

  return {
    headline: '{{title}}',
    generated_at: asInstant(now),
    // Rounded per line, then summed — the printed lines must add up to the
    // printed total, which is the one arithmetic property a client checks.
    total: asDecimal2(sum(parties.map((party) => party.balance))),
    rows: parties.length,
    parties,
  };
}
