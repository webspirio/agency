import { DomainError } from './errors';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type Actor = { id: string; role: string };

export type Ctx = {
  params: Record<string, string>;
  /**
   * Query as the wire delivers it. A repeated key arrives as an array —
   * `?tagIds=a&tagIds=b` is `{ tagIds: ['a', 'b'] }` — because that is what
   * express@5's default `simple` query parser hands a Nest DTO, and a handler
   * that works on `'a,b'` here would break the moment it is ported.
   */
  query: Record<string, string | string[]>;
  body: unknown;
  actor: Actor;
  /**
   * The one instant this request happened at, produced once per request from
   * the adapter's `now` seam so every handler in a request agrees and a pinned
   * clock reaches the handler. A handler that reaches for `new Date()` makes
   * the demo clock-dependent.
   */
  now: string;
};

export type Route = {
  method: Method;
  /**
   * Express-style, e.g. '/suppliers/:id'. Must start with '/'; a param segment
   * must be a bare identifier (':id', never ':id.csv' or ':id?'), and there is
   * no wildcard — `compile()` throws on all three rather than registering a
   * route that cannot mean what it looks like.
   *
   * DECLARATION ORDER IS THE CONTRACT: the first matching route wins, exactly
   * as express matches. `compile()` therefore refuses a table where an earlier
   * route shadows a later one, so `[:id, /reports/pnl]` is a startup failure
   * instead of a capability gate quietly reduced to a no-op.
   */
  path: string;
  /** Capabilities required. Absent means always reachable. */
  caps?: string[];
  /** Success status. Defaults to 200; the real backend returns 201 from several POSTs. */
  status?: number;
  handler: (c: Ctx) => unknown;
};

type Compiled = { route: Route; re: RegExp; keys: string[] };

/** A bare identifier. ':id.csv' would otherwise register a param named 'id.csv'. */
const PARAM_NAME = /^:[A-Za-z_][A-Za-z0-9_]*$/;
/** Stands in for a param when testing whether an earlier route subsumes a later one. */
const PARAM_SAMPLE = '__mock_param__';

function patternOf(route: Route): { re: RegExp; keys: string[]; sample: string } {
  if (!route.path.startsWith('/')) {
    throw new Error(
      `compile: route path ${JSON.stringify(route.path)} needs a leading '/' — no incoming path can ever equal it`,
    );
  }
  const keys: string[] = [];
  const sample: string[] = [];
  const pattern = route.path
    .split('/')
    .map((segment) => {
      if (segment.includes('*')) {
        throw new Error(
          `compile: wildcard segments are not supported (${route.path}); declare an explicit ':param' segment`,
        );
      }
      if (!segment.startsWith(':')) {
        sample.push(segment);
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (!PARAM_NAME.test(segment)) {
        throw new Error(
          `compile: '${segment}' is not a valid param name in ${route.path} — a param segment must be a bare identifier like ':id'`,
        );
      }
      const name = segment.slice(1);
      // A duplicate name cannot mean what it looks like: match()'s
      // Object.fromEntries keeps only the LAST capture, so '/a/:id/b/:id'
      // hands the handler one `id` and the first segment is unrecoverable.
      //
      // MEASURED, against path-to-regexp 8.4.2 — express 5's own matcher:
      // it ACCEPTS the duplicate and loses the same segment,
      // `match('/a/:id/b/:id')('/a/7/b/9')` -> `{ id: '9' }`, and its reverse
      // `compile()` fills both segments from one value, '/a/7/b/7'. So this is
      // not a mock-vs-product divergence — it is a pattern that means nothing
      // coherent in EITHER, which is exactly what this function refuses. A
      // startup throw costs the author one message; the alternative costs a
      // handler a param that silently is not the one it was written against.
      if (keys.includes(name)) {
        throw new Error(
          `compile: duplicate param name '${segment}' in ${route.path} — each param segment must be uniquely named`,
        );
      }
      keys.push(name);
      sample.push(PARAM_SAMPLE);
      return '([^/]+)';
    })
    .join('/');
  return { re: new RegExp(`^${pattern}$`), keys, sample: sample.join('/') };
}

export function compile(routes: Route[]) {
  const compiled: Compiled[] = [];
  for (const route of routes) {
    const { re, keys, sample } = patternOf(route);
    // First declaration wins, so a route an earlier one already answers is
    // unreachable — always a bug, and on a capability-gated route it silently
    // reduces the gate to a no-op (SPEC §8).
    const shadow = compiled.find((c) => c.route.method === route.method && c.re.test(sample));
    if (shadow) {
      throw new Error(
        `compile: ${route.method} ${route.path} is shadowed by ${shadow.route.method} ${shadow.route.path}, ` +
        'declared earlier — the first matching route wins, so declare the literal path first',
      );
    }
    compiled.push({ route, re, keys });
  }

  return {
    match(method: string, path: string) {
      const upper = method.toUpperCase();
      for (const c of compiled) {
        if (c.route.method !== upper) continue;
        const m = c.re.exec(path);
        if (!m) continue;
        const params = c.keys.map((k, i): [string, string] => {
          const raw = m[i + 1] as string;
          try {
            return [k, decodeURIComponent(raw)];
          } catch {
            // express answers a malformed escape with a 400, not a 500, and
            // never with the raw segment — that would invent a param value no
            // server would produce.
            throw new DomainError(400, 'BAD_REQUEST', 'Malformed URL');
          }
        });
        return { route: c.route, params: Object.fromEntries(params) };
      }
      return null;
    },
  };
}
