/**
 * THE SPINE. One `as const` registry per mock is the contract; the handler map,
 * every call site, every refusal and the error branch are all derived from that
 * one literal by type. Nothing is generated — tsc derives them.
 *
 * This module holds the GENERIC half. The registry literal itself lives in each
 * mock at `src/api/contract.ts`, because SPEC 5 forbids a shared contracts
 * package by name and SPEC 14 rejects a manifest plus emitters on leverage.
 * The two meet through `makeContract<Api, Io>(api)`.
 *
 * WHAT IS MEASURED HERE, rather than assumed — each of these overturned a design
 * that looked right:
 *
 *  1. `ParamsOf` binds PARAMS ONLY. `'/parties/:id'` -> `'/party/:id'` compiles
 *     clean, because every non-param segment is erased. The lab README claimed a
 *     path rename went red on both sides; it does not. What makes a rename safe
 *     here is that `call()` takes an operation KEY and never a path, so there is
 *     no second copy to desync — and `api:bound` is what catches a screen that
 *     writes a URL by hand anyway.
 *  2. `JsonSafe<T>` CANNOT be a constraint. `T extends JsonSafe<T>` is TS2313
 *     "circular constraint" on a type alias AND on a function type parameter, in
 *     tsc 6.0.3. It ships as a conditional tripwire instead: one line per
 *     contract asserts every operation's response at once.
 *  3. EXACTNESS IS CHECKED AT THE SINK, not at each return. `wire()` was opt-in,
 *     and `getParty: () => storedWideRow` compiled clean against the real
 *     `HandlersOf` in the exact shape routes.ts uses, because excess-property
 *     checking never fires on a contextually typed arrow's return. `toRoutes`
 *     now returns `LeakFree<...>`, so the check happens once, in a line the
 *     scaffolder writes. `Awaited<R>` is still load-bearing there: a handler's
 *     contextual return type is `Res | Promise<Res>`, and `keyof (Party |
 *     Promise<Party>)` is empty.
 *  4. NOTHING TYPE-LEVEL SURVIVES AN ANNOTATED WIDENING OR A CAST. `const out:
 *     Party = wideRow; return out;` is green under `wire()`, under a brand and
 *     under `LeakFree` alike — measured against all three. The wire golden is
 *     the ground truth for that residual, and it is written down as a live type
 *     in each mock's `drift.controls.ts`.
 *  5. A never-returning `fail()` NARROWS ONLY when the callee is a function
 *     declaration or a const with an EXPLICIT type annotation. A destructured
 *     `const { fail } = makeContract(...)` does not narrow, and neither does
 *     `contract.fail(...)`. That is why each mock writes
 *     `export const fail: Contract<Api, Io>['fail'] = contract.fail;`.
 */
import type { AxiosInstance } from 'axios';
import { apiErrorCode } from './api-error';
import { check, type Shape } from './shape';
import { DomainError, type ErrorEnvelope } from './errors';
import type { Ctx, Method, Route } from './router';

/* ── type-level assertions ─────────────────────────────────────────────────
 * So a claim about the type system is checked BY the type system rather than
 * written in a comment. `pnpm typecheck` is what runs these.
 */

/** Fails to compile unless T is exactly `true`. */
export type Expect<T extends true> = T;

/** Exact type equality, not mutual assignability. */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/* ── what a registry entry is ──────────────────────────────────────────── */

/**
 * A query as it travels on the wire: strings, or repeated keys as arrays. Never
 * a number — `?page=1` is the string '1' on both sides of the seam.
 */
export type QuerySpec = Record<string, string | string[] | undefined>;

/**
 * The statuses a REFUSAL may answer with. Not `number`, and the narrowing is not
 * pedantry: a 2xx here makes the adapter RETURN the error envelope as a success,
 * because its throwing branch is gated on axios's `validateStatus`. A screen then
 * receives `{ statusCode, error, message, … }` typed as the declared response and
 * renders `undefined` in every field, with no error branch taken and no row red.
 * Measured in the Phase 2 review.
 *
 * The list is the set a Nest exception filter can actually produce from an
 * `HttpException`, not every integer in 400..599 — a refusal is a decision the
 * domain made, and the domain does not make 418s.
 */
export type RefusalStatus =
  | 400 | 401 | 403 | 404 | 405 | 409 | 410 | 415 | 422 | 423 | 429
  | 500 | 501 | 502 | 503 | 504;

export type Spec = {
  readonly method: Method;
  /** Express-style, e.g. '/parties/:id'. A LITERAL — `op`'s `<const S>` keeps it one. */
  readonly path: string;
  readonly status: number;
  readonly caps: readonly string[];
  /**
   * The closed set this operation may refuse with, each code mapped to the STATUS
   * it answers. `{}` means it never refuses. The status lives HERE rather than at
   * each `fail()` site so two handlers cannot disagree about one code — `getParty`
   * and `renameParty` each spelled `404` by hand before this, and nothing compared
   * them.
   */
  readonly codes: Readonly<Record<string, RefusalStatus>>;
  /**
   * Why this operation has no screen yet. Present and unreached is green; present
   * and REACHED is red as stale, exactly as `reportUnusedDisableDirectives` is.
   */
  readonly unreached?: string;
};

export type ApiSpec = Record<string, Spec>;

/**
 * CURRIED, and the currying is the whole trick: the first call takes the types
 * EXPLICITLY, the second infers the spec. One call taking both would force the
 * author to spell the spec's type as well, which is the descriptor cost SPEC 14
 * rejected.
 *
 * `<const S extends Spec>` is what preserves `'/parties/:id'`, `200` and `'POST'`
 * as literals with NO `as const` on the registry object — measured on tsc 6.0.3.
 * Drop the `const` modifier and every path widens to `string`; `PathsAreLiterals`
 * below is what catches that.
 *
 * `__io` is OPTIONAL and type-only: measured, `'__io' in entry` is false at
 * runtime, `Object.keys` is unchanged, and declaration order is preserved — which
 * matters because declaration order IS the route table's order.
 */
export const op =
  <Req, Res, Qry extends QuerySpec = Record<string, never>>() =>
  <const S extends Spec>(spec: S): S & { readonly __io?: { req: Req; res: Res; qry: Qry } } =>
    spec;

/**
 * `IoOf<Bare>` is `never` for an entry written without `op()`, and
 * `never extends { res: infer R }` is TRUE with `R` inferred as `unknown` — so a
 * forgotten `op()` yields `unknown`, which `AllResJsonSafe` and `Leaks` both refuse.
 *
 * That is deliberate and it is the cheap remedy. MEASURED 2026-09-13: the
 * alternative spelling — intersecting a slot type to make `IoOf` indexable — yields
 * `never` instead, `IsJsonSafe<never>` is `true`, `[never] extends [void]` takes the
 * void branch, and BOTH tripwires go blind. The only remaining signal there was a
 * `TS2739 … Promise<never>` at the handler, in another file, naming neither the
 * operation nor the missing `op()`.
 */
type IoOf<S> = S extends { readonly __io?: infer I } ? NonNullable<I> : never;

export type ReqOf<A extends ApiSpec, K extends keyof A> =
  IoOf<A[K]> extends { req: infer R } ? R : never;
export type ResOf<A extends ApiSpec, K extends keyof A> =
  IoOf<A[K]> extends { res: infer R } ? R : never;
export type QryOf<A extends ApiSpec, K extends keyof A> =
  IoOf<A[K]> extends { qry: infer Q } ? Q : never;

/**
 * KEPT, against design §2.C's "PathsAreLiterals becomes unnecessary".
 *
 * MEASURED: restated over the new entry shape it still holds on a real registry and
 * still goes to `never` on three separate widenings — a `string`-typed variable,
 * `as string`, and `as Spec` — and on an entry written without `op()`. It is the
 * only REGISTRY-LOCAL detector of the forgotten-`op()` mistake; everything else
 * about that mistake surfaces in another file. What genuinely became unnecessary is
 * the `as const` it was named for, so the name moves with the mechanism.
 */
export type PathsAreLiterals<A extends ApiSpec> =
  string extends A[keyof A]['path'] ? never : true;

/* ── params, derived from the path literal ─────────────────────────────── */

type Seg<S extends string> = S extends `:${infer P}` ? P : never;
type Names<P extends string> = P extends `${infer A}/${infer B}` ? Seg<A> | Names<B> : Seg<P>;

/**
 * ':id' -> { id: string }. Required keys, so `c.params.id` is `string` rather
 * than the `string | undefined` that `Ctx`'s index signature yields under
 * `noUncheckedIndexedAccess`.
 */
export type ParamsOf<P extends string> = { [K in Names<P>]: string };

/**
 * The closed code set of an operation — the KEYS of its `codes` object.
 *
 * DISTRIBUTES over `K`, and that is load-bearing whenever a caller passes a union of
 * operations, which a screen's message table does. `keyof` over a union of object
 * types is the INTERSECTION of their keys, so the undistributed form made
 * `CodeOf<Api, 'listParties' | 'getParty'>` equal `never` — and an operation
 * declaring `codes: {}` collapsed any union containing it. A
 * `satisfies Record<never, string>` is `satisfies {}`: it asserts nothing in either
 * direction, which is precisely the hole the table was added to close.
 */
export type CodeOf<A extends ApiSpec, K extends keyof A> =
  K extends keyof A ? keyof A[K]['codes'] & string : never;

/* ── JsonSafe: the declared response must be the WIRE type ─────────────── */

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

/**
 * T as JSON could actually carry it. A `Date` becomes a string, a `Map` becomes
 * `{}`, and a REQUIRED key whose type includes `undefined` simply vanishes from
 * the payload — so a type declaring one is a type that lies about the wire.
 *
 * An honestly-OPTIONAL key (`note?: string`) is fine and stays fine: the type
 * already says the key may be absent. Branded strings (`Decimal2`, `Instant`)
 * pass, because they are strings. A NULLABLE field is fine too — see the peel
 * below; `null` is the one wire value `undefined` is constantly confused with
 * and the only one of the two that survives `JSON.stringify`.
 */
export type JsonSafe<T> =
  [T] extends [void] ? T
  /**
   * `unknown` — which is what `ResOf` yields for an entry written WITHOUT
   * `op<…>()` — is refused here, and it must be refused BEFORE the null peel
   * below rather than by falling off the end as it used to. `[null] extends
   * [unknown]` is true, so the peel would recurse on `unknown` for ever.
   * `any` never reaches this line: it satisfies the `void` branch above, which
   * is the behaviour that was already there.
   */
  : [unknown] extends [T] ? never
  /**
   * NULL IS PEELED OFF, NOT MATCHED, and that is the whole fix.
   *
   * Every branch here is written `[T] extends [X]` deliberately — the tuples
   * stop the conditional distributing, so a union is judged whole rather than
   * taken apart. The cost, MEASURED 2026-09-16, was that a union WITH null in
   * it matched nothing: `[string | null]` satisfies neither `[null]` nor
   * `[string | number | boolean]`, so `JsonSafe<string | null>` fell through to
   * `never` and `RESPONSES_ARE_WIRE_SHAPED` went red on any contract declaring
   * a nullable field. A `timestamptz NULL`, an unset foreign key and a number
   * nobody has supplied are the most ordinary things a real API returns, and
   * `null` round-trips through JSON exactly.
   *
   * So null is removed, the remainder is judged on its own, and null is put
   * back. Recursive rather than a special case at the primitive branch, which
   * is what makes `{ at: string } | null` pass and `Date | null` still fail:
   * the peel hands `Date` to the branch that already refuses it. A required key
   * typed `string | null | undefined` is still refused, by the `undefined`
   * clause in the object case, which the peel never reaches.
   */
  : [null] extends [T] ? JsonSafe<Exclude<T, null>> | null
  : [T] extends [string | number | boolean] ? T
  : [T] extends [Date] ? never
  : [T] extends [(...a: never[]) => unknown] ? never
  : [T] extends [ReadonlyMap<unknown, unknown>] ? never
  : [T] extends [ReadonlySet<unknown>] ? never
  : [T] extends [readonly (infer E)[]] ? readonly JsonSafe<E>[]
  : [T] extends [object]
    ? {
        [K in keyof T]: K extends RequiredKeys<T>
          ? (undefined extends T[K] ? never : JsonSafe<T[K]>)
          : JsonSafe<Exclude<T[K], undefined>> | undefined;
      }
  : never;

/** true only when T survives `JsonSafe` unchanged. */
export type IsJsonSafe<T> = [T] extends [JsonSafe<T>] ? true : false;

/**
 * Every operation's response at once, as one assertable claim.
 *
 * It also refuses an entry written WITHOUT `op<…>()`: that entry carries no phantom,
 * so `ResOf` resolves to `unknown`, and `IsJsonSafe<unknown>` is false. That is the
 * cheap half of the replacement for the deleted `IO_COVERS_API` — see `ResOf`.
 */
export type AllResJsonSafe<A extends ApiSpec> =
  [{ [K in keyof A]: IsJsonSafe<ResOf<A, K>> }[keyof A]] extends [true] ? true : false;

/* ── exactness: a wider store row may not reach the client ─────────────── */

/**
 * Structural equality by KEY, recursively — the nesting is the point. A shallow
 * `A & { [K in Exclude<keyof A, keyof T>]: never }` compares only top-level
 * keys, so a wide row inside `data[]` sails straight through it. Measured.
 */
export type DeepExact<A, T> =
  /* The PRIMITIVE GUARD, and it is first for a reason. A branded `Decimal2` is
     `string & { __brand }`, and an intersection is assignable to `object` when any
     constituent is — so without this branch the object branch below expanded every
     branded string into its ~50 `String.prototype` members, in every diagnostic.
     Measured: −38% instantiations at template size. */
  [A] extends [string | number | boolean | null | undefined]
    ? A
  /* `readonly`, NOT `DeepExact<AE, TE>[]`. MEASURED 2026-09-16 on the first
     mock to declare a readonly array in a response: the mutable rebuild made
     `[readonly T[]] extends [T[]]` false, so the comparison failed on
     MUTABILITY rather than on keys and five of that mock's eight operations
     were red at the sink with nothing wide about any of them. Mutability is
     not a wire property — `JSON.stringify` cannot tell the two apart and
     neither can any client — and widening the result to `readonly` accepts a
     mutable array too, because `T[]` IS assignable to `readonly T[]`. What it
     gives up is nothing: the element type is still compared by the recursive
     `DeepExact<AE, TE>`, which is what `WideElementInAReadonlyArrayIsALeak`
     in contract.controls.ts exists to keep true. */
  : [A] extends [readonly (infer AE)[]]
    ? ([T] extends [readonly (infer TE)[]] ? readonly DeepExact<AE, TE>[] : never)
    : [A] extends [object]
      ? ([T] extends [object]
          ? { [K in keyof A]: K extends keyof T ? DeepExact<A[K], T[K]> : never }
          : never)
      : A;

/**
 * The operations whose handler returns MORE than the contract declares.
 *
 * MEASURED 2026-09-13 on tsc 6.0.3: a wide row at top level, nested in `data[]`,
 * and behind `async` are each caught here, and the diagnostic names the operation;
 * a `string` response and a `string[]` response stay green (the branded-return
 * variant this replaced broke both).
 *
 * A `void` response is exempt: a 204 handler returns nothing, so there is nothing
 * to widen, and `DeepExact<undefined, void>` would report it as one.
 */
/**
 * Exact CONSTITUENT BY CONSTITUENT. `A extends unknown ?` is the distribution, and it
 * is load-bearing: `DeepExact`'s object branch is a homomorphic mapped type, so a union
 * argument distributed through it and
 * `[Wide | Narrow] extends [DeepExact<Wide, Res> | DeepExact<Narrow, Res>]` was
 * satisfied by the Narrow constituent — Wide being ASSIGNABLE to Narrow. Comparing the
 * whole union in one step therefore passed a handler that returns the wide row on one
 * branch and the declared row on the other, which is the shape a capability check takes:
 * `return c.actor.role === 'admin' ? { ...row, internalNote } : row`.
 */
type EveryConstituentExact<A, T> = A extends unknown
  ? ([A] extends [DeepExact<A, T>] ? true : false)
  : never;

export type Leaks<A extends ApiSpec, H> = {
  [K in keyof A]: [ResOf<A, K>] extends [void]
    ? never
    : K extends keyof H
      ? H[K] extends (c: never) => infer R
        ? [EveryConstituentExact<Awaited<R>, ResOf<A, K>>] extends [true]
          ? never
          : K
        : never
      : never;
}[keyof A];

/**
 * `Ok` while no handler leaks, and otherwise an object type whose single key is a
 * sentence — so the failure is read at the assignment rather than decoded from a
 * structural mismatch, and the value of that key names the operation.
 */
export type LeakFree<A extends ApiSpec, H, Ok> =
  [Leaks<A, H>] extends [never]
    ? Ok
    : { 'these handlers return keys the contract does not declare': Leaks<A, H> };

/* ── the page-side client, opaque ──────────────────────────────────────── */

/**
 * A raw verb on this is TS2339 in EVERY file a mock compiles — hooks, components
 * and helpers included, which no single-file AST walk could reach. Only `call()`
 * unwraps it.
 *
 * MEASURED, and the reason this is a type rather than a lint rule: `api:bound`'s
 * /httpClient|axios/i match against the callee text was evaded by 13 of 19
 * spellings, the unaliased `httpClient({ url })` among them — an AxiosInstance is
 * callable, so the callee is an Identifier and the property-access branch never
 * ran. It also false-red `httpClientCache.get`.
 *
 * The property type is `true`, not `unique symbol`: a `unique symbol` type may
 * only annotate a `const` or a `readonly static`, and TS2331 rejects it here.
 */
declare const TRANSPORT: unique symbol;
export interface Transport {
  readonly [TRANSPORT]: true;
}

/**
 * The ONE place an AxiosInstance becomes a Transport. Anything that needs the raw
 * instance — an interceptor, say — attaches BEFORE this call, in the same file.
 */
export const transport = (http: AxiosInstance): Transport => http as never;

/* ── the handler and call-site shapes ──────────────────────────────────── */

export type HandlerCtxOf<A extends ApiSpec, K extends keyof A> =
  Omit<Ctx, 'params' | 'body'> & {
    params: ParamsOf<A[K]['path']>;
    body: ReqOf<A, K>;
  };

export type HandlersOf<A extends ApiSpec> = {
  [K in keyof A]: (c: HandlerCtxOf<A, K>) => ResOf<A, K> | Promise<ResOf<A, K>>;
};

export type CallArgsOf<A extends ApiSpec, K extends keyof A> = {
  /**
   * Required even when the path declares none, so a parameterless GET reads
   * `{ params: {}, body: undefined }`. An honest ergonomic wart.
   */
  params: ParamsOf<A[K]['path']>;
  body: ReqOf<A, K>;
  /** Declared per operation from t=0; the default `Record<string, never>` refuses every key. */
  qry?: QryOf<A, K>;
};

/**
 * A body check for every operation that HAS a body, and none for the ones that do not.
 *
 * REQUIRED, not optional, and that was found by review: with every key optional, an
 * author adding a bodied endpoint and forgetting its shape got the exact behaviour
 * Phase 4 exists to remove — an empty body reaching the handler, `blankName(undefined)`
 * throwing, and the adapter answering 500 — with every row green. The obligation is a
 * type now rather than a comment in the template.
 *
 * The key remapping keys off `ReqOf`, so `op<void, …>()` operations are EXCLUDED: a GET
 * declaring a shape is as wrong as a POST omitting one.
 */
export type BodiesOf<A extends ApiSpec> = {
  readonly [K in keyof A as [ReqOf<A, K>] extends [void] ? never : K]: Shape;
};

export type Contract<A extends ApiSpec> = {
  call<K extends keyof A>(
    http: Transport,
    key: K,
    args: CallArgsOf<A, K>,
  ): Promise<ResOf<A, K>>;
  /**
   * NO `status` PARAMETER. It is read from the registry entry's `codes` object, so
   * one code answers one status everywhere.
   */
  fail<K extends keyof A>(
    key: K,
    code: CodeOf<A, K>,
    message: string | string[],
    ctx?: Record<string, unknown>,
  ): never;
  codeOf<K extends keyof A>(key: K, error: unknown): CodeOf<A, K> | undefined;
  /**
   * THE CHECK SITE. Generic on `H` so the handler map's ACTUAL type survives to
   * `Leaks`; annotate the parameter instead and `H` collapses into the declared
   * type, leaving nothing to compare.
   */
  toRoutes<H extends HandlersOf<A>>(handlers: H): LeakFree<A, H, Route[]>;
};

const PARAM = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Substitute the path params, refusing an empty one.
 *
 * MEASURED against the lab's client: `params: { id: '' }` built '/parties/', the
 * adapter absorbed the one trailing slash exactly as express with strict routing
 * off does, the LIST route answered 200, and the `Paginated<Party>` envelope was
 * cast to `Party`. A detail call answered by its own list is the worst shape of
 * this bug, because every field a screen reads is simply `undefined`.
 */
function buildPath(key: string, path: string, params: Record<string, string>): string {
  return path.replace(PARAM, (_match, name: string) => {
    const raw = params[name];
    if (raw === undefined || raw.trim() === '') {
      throw new Error(
        `call(${key}): the path param ':${name}' is empty or missing, so the request would go to ` +
          `'${path.replace(PARAM, '')}' — where the LIST route answers a detail call and its ` +
          `envelope is cast to the detail type. Pass a real id, or do not make the call.`,
      );
    }
    return encodeURIComponent(raw);
  });
}

export function makeContract<A extends ApiSpec>(api: A, bodies?: BodiesOf<A>): Contract<A> {
  return {
    async call(client, key, args) {
      // The only unwrap in the codebase. Everything else sees an opaque Transport.
      const http = client as unknown as AxiosInstance;
      const entry = api[key] as Spec;
      const url = buildPath(String(key), entry.path, args.params as Record<string, string>);
      const res = await http.request({
        method: entry.method,
        url,
        params: args.qry,
        data: args.body,
      });
      return res.data as never;
    },

    fail(key, code, message, ctx) {
      const entry = api[key] as Spec;
      const status = entry.codes[code as string];
      if (status === undefined) {
        // Unreachable through the type, reachable through a cast. A thrown Error is
        // better than a 500 whose envelope says nothing about why.
        throw new Error(
          `fail(${String(key)}): the code '${String(code)}' is not in that operation's ` +
            `registry entry, so there is no status to answer with`,
        );
      }
      // oxlint-disable-next-line agency/no-decimal-comparison -- an HTTP status, not money
      if (status < 400 || status > 599) {
        /* Also reachable only through a cast, and louder than what it prevents: a 2xx
           here is RESOLVED by the adapter, so the error envelope reaches the screen
           typed as the declared response and nothing anywhere goes red. */
        throw new Error(
          `fail(${String(key)}): the code '${String(code)}' declares status ${status}, which is ` +
            `not a refusal status — the adapter would resolve the error envelope as a success`,
        );
      }
      // String(code): the closed set is a TYPE-level guarantee; DomainError
      // carries the plain string the envelope puts on the wire.
      throw new DomainError(status, String(code), message, ctx);
    },

    codeOf(key, error) {
      /* TWO SHAPES, because the seam has two sides and a screen is written once for
         both. In the mock the adapter rejects with a real AxiosError carrying
         `.response.data`. After conversion the client keeps its axios.create, drops the
         `adapter:` line and gains the product's `attachErrorInterceptor`, which rejects
         with an `ApiError` that has NO `.response` at all — so reading only the envelope
         returned undefined for every refusal the moment the mock became the product, and
         every screen fell back to its generic message. HARD RULE 5 is unaffected: this
         reads `code` and nothing else, from whichever shape arrived. */
      const envelope = (error as { response?: { data?: unknown } } | undefined)?.response?.data as
        | ErrorEnvelope
        | undefined;
      const code = apiErrorCode(error) ?? envelope?.code;
      if (typeof code !== 'string') return undefined as never;

      // FILTERED against the operation's own declared set, so `CodeOf<A, K> | undefined`
      // is true by construction rather than by discipline. Without this a stray
      // `new DomainError(409, 'ANYTHING')` in one handler widens what every screen
      // reading that operation can see, while the type keeps promising it cannot.
      const declared = Object.keys((api[key] as Spec).codes);
      if (!declared.includes(code)) {
        console.error(
          `[mock] ${String(key)} produced the code '${code}', which its registry entry does not ` +
            `declare — the screen is being told undefined, because that is what the product's ` +
            `exception filter would send.`,
        );
        return undefined as never;
      }
      return code as never;
    },

    toRoutes(handlers) {
      /* A handler for something the registry does not declare can never be routed:
         toRoutes maps over the REGISTRY's keys, so the extra one is silently dropped
         and the author is left with a function they believe is serving traffic.
         Checked at runtime because that is the only place it holds for every
         construction — a spread and a cast both slip past tsc's excess-property
         check, and the spread is exactly how a handler map gets extended. */
      for (const k of Object.keys(handlers as object)) {
        if (!Object.hasOwn(api, k)) {
          throw new Error(
            `toRoutes: handler '${k}' names no operation in the registry — it can never be routed`,
          );
        }
      }

      // Object.keys is DECLARATION ORDER, which is the route table's contract:
      // the first matching route wins, and `compile()` refuses a table where an
      // earlier route shadows a later one.
      const table = (Object.keys(api) as (keyof A)[]).map((key) => {
        const entry = api[key] as Spec;
        return {
          method: entry.method,
          path: entry.path,
          // Copied ACROSS, deliberately, and asserted by the test: a derivation
          // that drops `caps` silently un-gates every route, and SPEC 8 promises
          // a typed URL cannot surface another client's product.
          caps: [...entry.caps],
          status: entry.status,
          handler: (c: Ctx) => {
            /* BEFORE the handler, so a handler body never sees a shape it was not
               written for — and so the refusal is the product's, not a 500 from
               whatever the handler did with the missing field. 400, `message` as an
               ARRAY, and NO code: that is exactly what a ValidationPipe rejection
               becomes in AllExceptionsFilter, and a code here would be a
               discriminator the product never sends. */
            const declared = (bodies as Record<string, Shape> | undefined)?.[key as string];
            if (declared !== undefined) {
              const problems = check(declared, c.body);
              if (problems.length !== 0) throw new DomainError(400, undefined, problems);
            }
            return (handlers[key] as (ctx: Ctx) => unknown)(c);
          },
        };
      });
      // `as never`: the declared return is LeakFree<...>, which is Route[] exactly
      // when nothing leaks. The runtime value is a Route[] either way.
      return table as never;
    },
  };
}
