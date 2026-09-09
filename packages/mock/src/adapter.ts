import { AxiosError, type AxiosAdapter, type AxiosRequestConfig } from 'axios';
import { DomainError, envelopeOf, type ErrorEnvelope } from './errors';
import { compile, type Actor, type Route } from './router';

export type MockAdapterOptions = {
  caps: Set<string>;
  actor: Actor;
  now?: () => string;
  /**
   * Default 0. The demo is a timed performance — logistic's script budgets 23
   * minutes across 8 screens — so artificial latency is opt-in, never the default.
   */
  latencyMs?: number;
};

function splitUrl(config: AxiosRequestConfig): { path: string; query: Record<string, string> } {
  const raw = config.url ?? '/';
  const [pathPart = '/', search = ''] = raw.split('?');
  const query: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(search)) query[k] = v;
  for (const [k, v] of Object.entries((config.params as Record<string, unknown>) ?? {})) {
    if (v !== undefined && v !== null) query[k] = String(v);
  }
  return { path: pathPart, query };
}

function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data ?? null;
  try { return JSON.parse(data); } catch { return data; }
}

export function mockAdapter(routes: Route[], opts: MockAdapterOptions): AxiosAdapter {
  const table = compile(routes);
  const now = opts.now ?? (() => new Date().toISOString());

  return async (config) => {
    if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));

    const { path, query } = splitUrl(config);
    const hit = table.match(config.method ?? 'get', path);

    // Capabilities gate the ROUTE. An off-profile screen is not merely hidden
    // from the menu — its data is unreachable, so a typed URL cannot surface
    // another client's product.
    const denied = !hit || (hit.route.caps?.some((c) => !opts.caps.has(c)) ?? false);

    let status: number;
    let payload: unknown;

    if (denied) {
      status = 404;
      payload = envelopeOf(new DomainError(404, 'NOT_FOUND', 'Not found'), path, now());
    } else {
      try {
        payload = hit.route.handler({
          params: hit.params,
          query,
          body: parseBody(config.data),
          actor: opts.actor, // from the session, never the body
        });
        status = hit.route.status ?? 200;
      } catch (e) {
        const domain = e instanceof DomainError
          ? e
          : new DomainError(500, 'INTERNAL', 'Internal server error');
        status = domain.status;
        payload = envelopeOf(domain, path, now());
      }
    }

    const response = {
      status,
      statusText: '',
      headers: {},
      config,
      request: null,
      // The divergence killer: undefined vanishes, Dates become strings, object
      // identity breaks — exactly as JSON over the wire would do it.
      data: JSON.parse(JSON.stringify(payload)) as unknown,
    };

    // MUST throw. axios's dispatchRequest calls adapter(config).then(...) and
    // never calls settle(); validateStatus lives inside each built-in adapter.
    // An adapter that RESOLVES a 409 hands TanStack Query a success.
    if (status >= 400) {
      const envelope = response.data as ErrorEnvelope;
      const message = Array.isArray(envelope?.message)
        ? envelope.message.join('; ')
        : (envelope?.message ?? `Request failed with status code ${status}`);
      throw new AxiosError(
        String(message),
        status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        response as never,
      );
    }

    return response as never;
  };
}
