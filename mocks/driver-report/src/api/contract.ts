/**
 * THE CONTRACT. One object keyed by operation name, and everything else in this
 * mock is derived from it by type: the handler map in `routes.ts`, every call
 * site in `src/pages/`, every refusal, every cache key, and the error branch a
 * screen reads. Nothing is generated — tsc derives them from this one literal.
 *
 * NOT @scaffold-owned, and that is a decision rather than an omission: this is
 * the one file a mock author MUST edit, and it fails LOUDLY rather than
 * silently — drop an operation and the handler map is red, forget the
 * `op<…>()` wrapper and `KEEP_LITERAL` is red.
 *
 * WHAT A BACKEND DEVELOPER RECEIVES. This object is the whole hand-off for
 * «Звіт водія»: every operation with its method, path, success status,
 * capability, request type, response type, and closed set of error codes WITH
 * the status each answers.
 */
import {
  makeContract,
  op,
  s,
  shape,
  type AllResJsonSafe,
  type BodiesOf,
  type Contract,
  type Expect,
  type Paginated,
  type PathsAreLiterals,
} from '@agency/mock';
import type {
  ConfirmEvent,
  DriverEvent,
  Leg,
  Me,
  Overview,
  SubmitEvent,
  WaybillExport,
} from '../domain/types';

/**
 * CAPABILITIES ARE LOAD-BEARING HERE, unlike in the stock scaffold where every
 * operation carries `caps: []`.
 *
 * `agency new --profiles driver,dispatcher` gives this build two products from
 * one deployment: `?profile=driver` is the thing in a driver's hand and
 * `?profile=dispatcher` is the office. The gate is on the ROUTE, not the menu —
 * a dispatcher's browser cannot reach `POST /events` and a driver's cannot reach
 * `PATCH /events/:id`, because the adapter 404s before a handler runs. That is
 * worth showing on the call: the separation is structural rather than a hidden
 * button.
 *
 * `listEvents` is shared deliberately. The driver reads his own queue from it
 * and the dispatcher reads the whole fleet's; one operation, one response shape,
 * and the filtering is the server's job rather than two near-identical
 * endpoints that drift.
 *
 * DECLARATION ORDER IS THE ROUTE TABLE'S ORDER. `toRoutes` reads these keys in
 * order, the first matching route wins, and `compile()` refuses a table where an
 * earlier route shadows a later one — so a literal segment must be declared
 * before its `:param` sibling.
 *
 * `codes` maps each code to the STATUS it answers, so `fail()` takes no status
 * and two handlers cannot disagree about one code. `{}` means the operation
 * never refuses, and `CodeOf` for it is `never`.
 */
export const api = {
  /** The driver's whole home screen in one request: who he is, which truck, the
   *  odometer pre-fill that makes that screen one tap, and the two counters on
   *  the status strip. */
  me: op<void, Me>()({
    method: 'GET', path: '/me', status: 200, caps: ['driver'], codes: {},
  }),

  overview: op<void, Overview>()({
    method: 'GET', path: '/overview', status: 200, caps: ['dispatcher'], codes: {},
  }),

  /**
   * `pending=1` narrows to events no dispatcher has confirmed — the work queue.
   * A query parameter rather than a second operation: the response shape is
   * identical and two endpoints that return the same rows are two endpoints
   * that drift.
   */
  listEvents: op<void, Paginated<DriverEvent>, { page?: string; limit?: string; pending?: string }>()({
    method: 'GET', path: '/events', status: 200, caps: [], codes: {},
  }),

  /**
   * THE ONE WRITE THE DRIVER PERFORMS, and the only operation `caps: ['driver']`
   * protects. Three refusals, and NOT ONE of them is an odometer that looks
   * wrong: a reading below the last one, or 4 000 km above it, is FLAGGED and
   * stored. Blocking a man at a loading gate is how the client's two previous
   * attempts died.
   */
  submitEvent: op<SubmitEvent, DriverEvent>()({
    method: 'POST', path: '/events', status: 201, caps: ['driver'],
    codes: { ODOMETER_INVALID: 400, PHOTO_WRONG_KIND: 400, TRUCK_NOT_FOUND: 404 },
  }),

  getEvent: op<void, DriverEvent>()({
    method: 'GET', path: '/events/:id', status: 200, caps: ['dispatcher'],
    codes: { EVENT_NOT_FOUND: 404 },
  }),

  /**
   * THE DISPATCHER'S ONE WRITE — and the honest centre of this design. The
   * driver is never asked for the ТТН number, so somebody still types it: a
   * person sitting down, in light, with two clean hands and the photograph on
   * screen, at roughly four seconds a document instead of re-keying a whole
   * waybill from a scan that arrived a week later.
   */
  confirmEvent: op<ConfirmEvent, DriverEvent>()({
    method: 'PATCH', path: '/events/:id', status: 200, caps: ['dispatcher'],
    codes: {
      EVENT_NOT_FOUND: 404,
      EVENT_ALREADY_CONFIRMED: 409,
      TTN_BLANK: 400,
      TTN_DUPLICATE: 409,
    },
  }),

  /** A рейс is a QUERY over the event table, never a row the driver maintained.
   *  See `legsOf` in `src/domain/calc.ts`. */
  listLegs: op<void, Paginated<Leg>, { page?: string; limit?: string }>()({
    method: 'GET', path: '/legs', status: 200, caps: ['dispatcher'], codes: {},
  }),

  /** BAS's own «Подорожній лист» columns — водій, авто, показники спідометра на
   *  виїзд і повернення, паливо за нормою — which is a near one-to-one match
   *  with what four taps produce. */
  exportWaybill: op<void, WaybillExport>()({
    method: 'GET', path: '/waybill', status: 200, caps: ['dispatcher'], codes: {},
  }),
};

/** No `as const`. `op`'s `<const S extends Spec>` preserves every literal. */
export type Api = typeof api;

/* ── the two tripwires, each a compile error rather than a convention ────── */

/**
 * Every path is still a LITERAL — the only check INSIDE this file that an entry
 * was written with `op<…>()` at all. Forget the wrapper and the path widens to
 * `string`, `ParamsOf` evaporates, and every other symptom surfaces elsewhere.
 */
export const KEEP_LITERAL: PathsAreLiterals<Api> = true;

/**
 * Every declared response is a shape JSON can actually carry. A `Date`, a `Map`,
 * or a REQUIRED key whose value may be `undefined` is refused here — all three
 * survive the round trip as something other than what the type promised.
 */
export type RESPONSES_ARE_WIRE_SHAPED = Expect<AllResJsonSafe<Api>>;

/* ── the bound helpers ──────────────────────────────────────────────────── */

/**
 * WHAT A MALFORMED REQUEST GETS: the product's answer, which is 400 with one
 * sentence per failed field and no `code` — because a `ValidationPipe` rejection
 * declares none.
 *
 * EVERY FIELD IS `s.str()`, INCLUDING `odometer_km`, and that is the load-bearing
 * distinction. A shape check answers "is this the right SHAPE"; a DOMAIN RULE
 * answers "is this a legal value", and only the second carries a code. Writing
 * `odometer_km` as anything stricter here would intercept the malformed reading
 * BEFORE the handler and turn `ODOMETER_INVALID` into a declared code nothing
 * could ever emit — measured on this scaffold's `balance` field, where
 * `contract:complete` stayed green throughout because the `fail()` site still
 * existed. The wire golden's refusal drive is what caught it.
 *
 * `kind`, `photo_kind` and `odometer_source` are strings on the wire and unions
 * in the type. The shape cannot check a union — that is the type's job at the
 * call site and `HandlersOf`'s job at the handler — so what arrives here is a
 * string and the compiler is what keeps a screen from sending a nonsense one.
 */
const bodies = {
  submitEvent: shape({
    kind: s.str(),
    truck_id: s.str(),
    odometer_km: s.str(),
    odometer_source: s.str(),
    photo_kind: s.str(),
    place: s.str(),
  }),
  confirmEvent: shape({ ttn_number: s.str() }),
} satisfies BodiesOf<Api>;

const contract = makeContract<Api>(api, bodies);

/**
 * ANNOTATED CONSTS, not a destructure, and the annotation is load-bearing on
 * `fail`. A never-returning function narrows only when the callee is a function
 * declaration or a const with an EXPLICIT type — a destructured
 * `const { fail } = ...` does not narrow, and neither does `contract.fail(...)`.
 */
export const call: Contract<Api>['call'] = contract.call;
export const fail: Contract<Api>['fail'] = contract.fail;
export const codeOf: Contract<Api>['codeOf'] = contract.codeOf;
export const toRoutes: Contract<Api>['toRoutes'] = contract.toRoutes;

/** The bound `Contract` itself, for `makeQueries` in `src/api/queries.ts`.
 *  Exported rather than used here: `contract.ts` must not import `./client`,
 *  which imports `./routes`, which imports this file. */
export { contract };
