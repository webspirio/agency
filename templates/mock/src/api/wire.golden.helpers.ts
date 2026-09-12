/**
 * The seam the wire golden drives, kept out of the test file so the test reads
 * as what it asserts rather than as wiring.
 *
 * It deliberately does NOT import `routes` from './routes': that table is built
 * once at module scope and shares one store, so a write in one drive would move
 * the rows the next drive fingerprints. `makeHandlers()` per call is what keeps
 * each drive independent.
 */
export { mockAdapter } from '@agency/mock';
import type { Route } from '@agency/mock';
import { toRoutes } from './contract';
import { makeHandlers } from './routes';

export function toRoutesOf(): Route[] {
  return toRoutes(makeHandlers());
}
