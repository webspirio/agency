export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type Actor = { id: string; role: string };

export type Ctx = {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  actor: Actor;
};

export type Route = {
  method: Method;
  /** Express-style, e.g. '/suppliers/:id'. */
  path: string;
  /** Capabilities required. Absent means always reachable. */
  caps?: string[];
  /** Success status. Defaults to 200; the real backend returns 201 from several POSTs. */
  status?: number;
  handler: (c: Ctx) => unknown;
};

type Compiled = { route: Route; re: RegExp; keys: string[] };

export function compile(routes: Route[]) {
  const compiled: Compiled[] = routes.map((route) => {
    const keys: string[] = [];
    const pattern = route.path
      .split('/')
      .map((segment) => {
        if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        keys.push(segment.slice(1));
        return '([^/]+)';
      })
      .join('/');
    return { route, re: new RegExp(`^${pattern}$`), keys };
  });

  return {
    match(method: string, path: string) {
      const upper = method.toUpperCase();
      for (const c of compiled) {
        if (c.route.method !== upper) continue;
        const m = c.re.exec(path);
        if (!m) continue;
        const params: Record<string, string> = {};
        c.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1] as string); });
        return { route: c.route, params };
      }
      return null;
    },
  };
}
