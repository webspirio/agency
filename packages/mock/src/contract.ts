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
 *  3. `wire()` must strip the Promise. A handler's contextual return type is
 *     `Res | Promise<Res>`, and `keyof (Party | Promise<Party>)` is empty — so
 *     without `Awaited<T>` every property mapped to `never` and the check was
 *     noise rather than a guard.
 *  4. `NoInfer` is load-bearing TWICE: once for the reason example B advertised
 *     (a narrower handler silently redefining the contract) and once here —
 *     without it `A` collapses into `T` and the exactness check evaporates.
 *  5. A never-returning `fail()` NARROWS ONLY when the callee is a function
 *     declaration or a const with an EXPLICIT type annotation. A destructured
 *     `const { fail } = makeContract(...)` does not narrow, and neither does
 *     `contract.fail(...)`. That is why each mock writes
 *     `export const fail: Contract<Api, Io>['fail'] = contract.fail;`.
 */
import type { AxiosInstance } from 'axios';
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

export type OperationSpec = {
  readonly method: Method;
  /** Express-style, e.g. '/parties/:id'. A LITERAL — see `PathsAreLiterals`. */
  readonly path: string;
  readonly status: number;
  readonly caps: readonly string[];
  /** The closed set this operation may refuse with. Empty means it never does. */
  readonly codes: readonly string[];
};

export type ApiSpec = Record<string, OperationSpec>;

/**
 * A query as it travels on the wire: strings, or repeated keys as arrays. Never
 * a number — `?page=1` is the string '1' on both sides of the seam.
 */
export type QuerySpec = Record<string, string | string[] | undefined>;

export type IoSpec = { req: unknown; res: unknown; qry: QuerySpec };

/** The sibling type map every registry must have exactly one entry in. */
export type IoFor<A extends ApiSpec> = { [K in keyof A]: IoSpec };

/**
 * The `as const` tripwire. A literal path is assignable to `string`, but
 * `string` is not assignable back — so this is `true` only while every path is
 * still a literal, and becomes an error the moment someone drops `as const`.
 * Without it that deletion silently removes call-site parameter checking across
 * the whole mock, and ONLY the handler stays red.
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

/** The closed code set of one operation, straight off `as const`. */
export type CodeOf<A extends ApiSpec, K extends keyof A> = A[K]['codes'][number];

/* ── JsonSafe: the declared response must be the WIRE type ─────────────── */

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

/**
 * T as JSON could actually carry it. A `Date` becomes a string, a `Map` becomes
 * `{}`, and a REQUIRED key whose type includes `undefined` simply vanishes from
 * the payload — so a type declaring one is a type that lies about the wire.
 *
 * An honestly-OPTIONAL key (`note?: string`) is fine and stays fine: the type
 * already says the key may be absent. Branded strings (`Decimal2`, `Instant`)
 * pass, because they are strings.
 */
export type JsonSafe<T> =
  [T] extends [void] ? T
  : [T] extends [null] ? T
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
 * Constrained on `IoFor<A>` and mapped over `keyof A`, NOT `Record<string, IoSpec>`:
 * an `interface` gets no implicit index signature (only a type alias does), so the
 * Record form is TS2344 against the very declaration every mock writes. Measured.
 */
export type AllResJsonSafe<A extends ApiSpec, I extends IoFor<A>> =
  [{ [K in keyof A]: IsJsonSafe<I[K]['res']> }[keyof A]] extends [true] ? true : false;

/* ── exactness: a wider store row may not reach the client ─────────────── */

/**
 * Structural equality by KEY, recursively — the nesting is the point. A shallow
 * `A & { [K in Exclude<keyof A, keyof T>]: never }` compares only top-level
 * keys, so a wide row inside `data[]` sails straight through it. Measured.
 */
export type DeepExact<A, T> =
  [A] extends [readonly (infer AE)[]]
    ? ([T] extends [readonly (infer TE)[]] ? DeepExact<AE, TE>[] : never)
    : [A] extends [object]
      ? ([T] extends [object]
          ? { [K in keyof A]: K extends keyof T ? DeepExact<A[K], T[K]> : never }
          : never)
      : A;

/**
 * The handler's way of saying "this value IS the declared wire shape".
 *
 * Excess-property checking only fires on a fresh object literal, so `return row`
 * where `row` carries an internal field is green everywhere without this. Here
 * the extra key is typed `never` and the error names it.
 *
 * `Awaited<T>` because the contextual return type is `Res | Promise<Res>`;
 * `NoInfer` because otherwise `A` collapses into `T` and nothing is checked.
 */
export function wire<T, A extends NoInfer<Awaited<T>>>(
  value: DeepExact<A, NoInfer<Awaited<T>>>,
): Awaited<T> {
  return value as unknown as Awaited<T>;
}

/* ── the handler and call-site shapes ──────────────────────────────────── */

export type HandlerCtxOf<A extends ApiSpec, I extends IoFor<A>, K extends keyof A> =
  Omit<Ctx, 'params' | 'body'> & {
    params: ParamsOf<A[K]['path']>;
    body: I[K]['req'];
  };

export type HandlersOf<A extends ApiSpec, I extends IoFor<A>> = {
  [K in keyof A]: (c: HandlerCtxOf<A, I, K>) => I[K]['res'] | Promise<I[K]['res']>;
};

export type CallArgsOf<A extends ApiSpec, I extends IoFor<A>, K extends keyof A> = {
  /**
   * Required even when the path declares none, so a parameterless GET reads
   * `{ params: {}, body: undefined }`. An honest ergonomic wart.
   */
  params: ParamsOf<A[K]['path']>;
  body: I[K]['req'];
  /** Declared per operation from t=0; the default `Record<string, never>` refuses every key. */
  qry?: I[K]['qry'];
};

export type Contract<A extends ApiSpec, I extends IoFor<A>> = {
  call<K extends keyof A>(
    http: AxiosInstance,
    key: K,
    args: CallArgsOf<A, I, K>,
  ): Promise<I[K]['res']>;
  fail<K extends keyof A>(
    key: K,
    status: number,
    code: CodeOf<A, K>,
    message: string | string[],
    ctx?: Record<string, unknown>,
  ): never;
  codeOf<K extends keyof A>(key: K, error: unknown): CodeOf<A, K> | undefined;
  toRoutes(handlers: HandlersOf<A, I>): Route[];
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

export function makeContract<A extends ApiSpec, I extends IoFor<A>>(api: A): Contract<A, I> {
  return {
    async call(http, key, args) {
      const op = api[key] as OperationSpec;
      const url = buildPath(String(key), op.path, args.params as Record<string, string>);
      const res = await http.request({
        method: op.method,
        url,
        params: args.qry,
        data: args.body,
      });
      return res.data as never;
    },

    fail(key, status, code, message, ctx) {
      // String(code): the closed set is a TYPE-level guarantee; DomainError
      // carries the plain string the envelope puts on the wire.
      void key;
      throw new DomainError(status, String(code), message, ctx);
    },

    codeOf(_key, error) {
      // The key exists to CLOSE the return type. At runtime the envelope is the
      // only source, and HARD RULE 5 says branch on `code` and nothing else.
      const envelope = (error as { response?: { data?: unknown } } | undefined)?.response?.data as
        | ErrorEnvelope
        | undefined;
      const code = envelope?.code;
      return (typeof code === 'string' ? code : undefined) as never;
    },

    toRoutes(handlers) {
      // Object.keys is DECLARATION ORDER, which is the route table's contract:
      // the first matching route wins, and `compile()` refuses a table where an
      // earlier route shadows a later one.
      return (Object.keys(api) as (keyof A)[]).map((key) => {
        const op = api[key] as OperationSpec;
        return {
          method: op.method,
          path: op.path,
          // Copied ACROSS, deliberately, and asserted by the test: a derivation
          // that drops `caps` silently un-gates every route, and SPEC 8 promises
          // a typed URL cannot surface another client's product.
          caps: [...op.caps],
          status: op.status,
          handler: (c: Ctx) => (handlers[key] as (ctx: Ctx) => unknown)(c),
        };
      });
    },
  };
}
