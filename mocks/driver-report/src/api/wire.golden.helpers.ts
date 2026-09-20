// mocks/driver-report/src/api/wire.golden.helpers.ts
/**
 * The seam the wire golden drives, kept out of the test file so the test reads as what it asserts rather than as
 * wiring.
 *
 * It drives the REAL route table — `routes`, the same one `src/api/client.ts` hands the mock adapter — rather than a
 * private `toRoutes(makeHandlers())` the way the template's golden does. That is forced by this mock rather than
 * chosen: every handler here reads `s.stores` at call time off the ONE module-global `server` (the stage replaces
 * that object on every reset), and the demo day is not a seed but a seed plus forty-five script entries applied
 * through that same table. `rebuild(beat)` is the only thing that can put the world at «Такт n», and it writes into
 * `server`. A second, private table would fingerprint a world the app never shows.
 *
 * Independence therefore comes from the REBUILD, not from a fresh handler map: every drive and every refusal starts
 * from its own `wiredAt(10, …)`, so no drive observes another's writes. `wiredAs` is the same client WITHOUT a
 * rebuild — for the second actor a drive needs (the office creates a bind code, the phone confirms it) and for
 * reading an id off one wire surface before driving another.
 */
import axios, { type AxiosInstance } from 'axios';
import { mockAdapter, transport, type Actor, type Transport } from '@agency/mock';
import { routes, serverNow } from './routes';
import { rebuild } from '../stage/runner';

/** Both halves of one client: the opaque page-side view `call()` takes, and the raw instance a refusal drive needs. */
export type Wired = { t: Transport; http: AxiosInstance };

/** Both capabilities, so one table answers the driver's routes and the office's. The ACTOR is what separates them. */
const CAPS = new Set(['driver', 'dispatcher']);

/** A client over the realm's route table as `actor`, answering at the server clock. The world is left where it is. */
export function wiredAs(actor: Actor): Wired {
  const http = axios.create({
    baseURL: 'http://mock',
    // express@5's `simple` query parser plus Nest's forbidNonWhitelisted: the product needs this line, so a drive
    // that omitted it would fingerprint a query the product never sees.
    paramsSerializer: { indexes: null },
    adapter: mockAdapter(routes, { caps: CAPS, actor, now: serverNow }),
  });
  return { t: transport(http), http };
}

/** The realm's world rebuilt to «Такт n» (§5.6), then a client on it as `actor`. */
export async function wiredAt(beat: number, actor: Actor): Promise<Wired> {
  await rebuild(beat);
  return wiredAs(actor);
}
