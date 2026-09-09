import { Axios, AxiosError, type AxiosAdapter } from 'axios';
import { DomainError, envelopeOf, type ErrorEnvelope } from './errors';
import { compile, type Actor, type Ctx, type Route } from './router';
import { createSeq } from './types';

export type MockAdapterOptions = {
  caps: Set<string>;
  actor: Actor;
  /**
   * The clock seam. Produced ONCE per request and handed to the handler as
   * `ctx.now` as well as to the error envelope, so a pinned clock pins the
   * whole demo and two handlers in one request can never disagree.
   */
  now?: () => string;
  /**
   * Default 0. The demo is a timed performance — logistic's script budgets 23
   * minutes across 8 screens — so artificial latency is opt-in, never the default.
   */
  latencyMs?: number;
};

/** Only ever used to parse a path; never fetched. */
const PLACEHOLDER_ORIGIN = 'http://mock.invalid';

/**
 * A defaults-FREE axios, built once, used only to serialise a config into its
 * uri. `axios.getUri` is a method of the GLOBAL instance, so it merges live
 * `axios.defaults` into whatever it is handed: a client created before someone
 * set `axios.defaults.baseURL` would have its mocked requests resolved against
 * a prefix the real request never carries (a 404 here, a 200 in production),
 * and `axios.defaults.params` would arrive in `ctx.query` as a param the caller
 * never sent. The config reaching an adapter is already fully merged —
 * dispatchRequest folded in its own instance's defaults before calling us — so
 * config-only is exactly right.
 */
const URI_BUILDER = new Axios({});

/**
 * The uri parsed against a placeholder origin so a server-relative one parses
 * at all. `null` for a uri the parser refuses, which every caller falls back
 * from rather than throwing.
 */
function parseUri(uri: string): URL | null {
  try {
    return new URL(uri, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
}

/**
 * What the SERVER would see in `request.url`: path and query string, origin and
 * fragment excluded. `reference/contract/all-exceptions.filter.ts:78` puts
 * exactly this in the error envelope's `path`, so a support screen or a bug
 * report that renders `envelope.path` reads the same string in the demo as in
 * production — prefix and query included, not the stripped route path.
 */
function requestUrlOf(uri: string): string {
  const parsed = parseUri(uri);
  return parsed ? `${parsed.pathname}${parsed.search}` : uri;
}

/** The path part of a baseURL, without its trailing slash. '' when there is none. */
function basePathOf(baseURL: string | undefined): string {
  if (!baseURL) return '';
  let base = baseURL;
  try {
    base = new URL(baseURL, PLACEHOLDER_ORIGIN).pathname;
  } catch { /* a baseURL the URL parser refuses is treated as a literal prefix */ }
  return base.replace(/\/+$/, '');
}

/**
 * The path the server would route on, resolved the way `buildFullPath` resolves
 * it: an absolute url, a relative one with no leading slash and a baseURL-prefixed
 * one all reduce to the same route-table path, and ONE trailing slash is absorbed
 * because express with `strict routing` off — Nest's default — treats
 * '/suppliers/' and '/suppliers' as the same route.
 *
 * Exactly one, not any number. MEASURED against path-to-regexp 8.4.2, express
 * 5's own matcher: '/suppliers' compiles to /^(?:\/suppliers)(?:\/$)?$/i, so
 * '/suppliers/' matches and '/suppliers//' and '/suppliers///' do not. Absorbing
 * them all would make the mock MORE permissive than the product — a url that
 * works in the demo and 404s after conversion, which is the divergence direction
 * this package exists to prevent.
 */
function pathOf(uri: string, baseURL: string | undefined): string {
  const parsed = parseUri(uri);
  let path = parsed
    ? parsed.pathname
    : ((uri.split('#')[0] ?? '/').split('?')[0] ?? '/');
  const base = basePathOf(baseURL);
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length);
  if (!path.startsWith('/')) path = `/${path}`;
  return path === '/' ? path : path.replace(/\/$/, '') || '/';
}

/**
 * The query as the wire produced it. Repeated keys become arrays, which is what
 * express@5's default `simple` parser hands a Nest DTO — and the reason the
 * serialisation is done by axios (`getUri`) rather than reimplemented here:
 * `paramsSerializer: { indexes: null }`, Date -> ISO, a URLSearchParams instance
 * and a caller's custom serializer all have to behave exactly as they do in the
 * product, or a handler that works in the mock breaks on conversion.
 */
function queryOf(uri: string): Record<string, string | string[]> {
  // PARSED, not sliced at the first '?': a fragment is stripped by the browser
  // before the request is ever sent, so slicing leaks '#section' into the last
  // value — `{ tag: 'a#section' }`, which no server could produce — and makes
  // this function disagree with pathOf about the same string.
  const parsed = parseUri(uri);
  const sent = parsed ? parsed.search : `?${(uri.split('#')[0] ?? '').split('?')[1] ?? ''}`;
  if (sent === '?' || sent === '') return {};
  const search = new URLSearchParams(sent);
  const entries = new Map<string, string | string[]>();
  for (const key of search.keys()) {
    if (entries.has(key)) continue;
    const all = search.getAll(key);
    entries.set(key, all.length === 1 ? (all[0] as string) : all);
  }
  // fromEntries, not assignment: a '__proto__' key must be an own property.
  return Object.fromEntries(entries);
}

function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data ?? null;
  try { return JSON.parse(data); } catch { return data; }
}

/**
 * The divergence killer: undefined vanishes, Dates become strings, object
 * identity breaks — exactly as JSON over the wire would do it. A handler that
 * returns nothing is a Nest void handler, whose empty body axios leaves as `''`.
 */
function serialise(payload: unknown): unknown {
  const json = JSON.stringify(payload);
  return json === undefined ? '' : (JSON.parse(json) as unknown);
}

function fail(
  e: DomainError,
  path: string,
  now: string,
  requestId: string,
): { status: number; data: unknown } {
  try {
    return { status: e.status, data: serialise(envelopeOf(e, path, now, requestId)) };
  } catch {
    // The ctx that poisoned the first attempt cannot be reused, so the fallback
    // envelope is built and serialised from scratch.
    const internal = new DomainError(500, 'INTERNAL', 'Internal server error');
    return { status: 500, data: serialise(envelopeOf(internal, path, now, requestId)) };
  }
}

export function mockAdapter(routes: Route[], opts: MockAdapterOptions): AxiosAdapter {
  const table = compile(routes);
  const clock = opts.now ?? (() => new Date().toISOString());
  // Store-assigned, monotonic. Never Math.random (SPEC §11).
  const nextRequestId = createSeq('req');

  return async (config) => {
    if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));

    const now = clock();
    const requestId = nextRequestId();
    // Everything that can throw — url resolution, matching, param decoding, the
    // handler, and the serialisation of what it returned — is inside the guard,
    // so nothing but an AxiosError can ever leave this adapter.
    // `path` is the ENVELOPE's field — request.url, as the product's filter
    // emits it. The ROUTE path is a separate, stripped derivation below. The
    // seed is a bare read, never a call: it is the one expression outside the
    // guard, so it must not be able to throw. It only survives if getUri does.
    let path = config.url ?? '/';
    let status: number;
    let data: unknown;
    let cause: unknown;

    try {
      const uri = URI_BUILDER.getUri(config);
      path = requestUrlOf(uri);
      const hit = table.match(config.method ?? 'get', pathOf(uri, config.baseURL));

      // Capabilities gate the ROUTE. An off-profile screen is not merely hidden
      // from the menu — its data is unreachable, so a typed URL cannot surface
      // another client's product. (compile() refuses a table where declaration
      // order could shadow a gated route.)
      if (!hit || (hit.route.caps?.some((c) => !opts.caps.has(c)) ?? false)) {
        throw new DomainError(404, 'NOT_FOUND', 'Not found');
      }

      const ctx: Ctx = {
        params: hit.params,
        query: queryOf(uri),
        body: parseBody(config.data),
        actor: opts.actor, // from the session, never the body
        now,
      };
      data = serialise(await hit.route.handler(ctx));
      status = hit.route.status ?? 200;
    } catch (e) {
      let domain: DomainError;
      if (e instanceof DomainError) {
        domain = e;
      } else {
        // Sanitised on the wire, recorded for the developer: a 500 with no
        // stack anywhere is the symptom this package exists to prevent.
        console.error('[mock] unhandled handler error', e);
        domain = new DomainError(500, 'INTERNAL', 'Internal server error');
        cause = e;
      }
      const out = fail(domain, path, now, requestId);
      status = out.status;
      data = out.data;
    }

    const response = { status, statusText: '', headers: {}, config, request: null, data };

    // MUST throw. axios's dispatchRequest calls adapter(config).then(...) and
    // never calls settle(); validateStatus lives inside each built-in adapter.
    // An adapter that RESOLVES a 409 hands TanStack Query a success. The test
    // is settle()'s own, so `validateStatus: () => true` behaves here exactly
    // as it does against the product.
    const validateStatus = config.validateStatus;
    if (status && validateStatus && !validateStatus(status)) {
      const envelope = data as ErrorEnvelope;
      const message = Array.isArray(envelope?.message)
        ? envelope.message.join('; ')
        : (envelope?.message ?? `Request failed with status code ${status}`);
      const error = new AxiosError(
        String(message),
        // oxlint-disable-next-line agency/no-decimal-comparison -- an HTTP status integer this file chose itself, never a value read off a payload: 5xx is ERR_BAD_RESPONSE, everything else ERR_BAD_REQUEST.
        status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        response as never,
      );
      // The original throw stays reachable from the error the caller catches.
      if (cause !== undefined) (error as { cause?: unknown }).cause = cause;
      throw error;
    }

    return response as never;
  };
}
