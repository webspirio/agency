export type ProfileDef<C extends string> = {
  id: string;
  label: string;
  caps: readonly C[];
};

/**
 * The app routes with `createHashRouter` (SPEC §11), so the URL a prospect
 * shares looks like `/#/reports?profile=fleet` — and `location.search` is empty
 * for it. Reading only the search silently drops such a link to the fallback
 * profile, which is the wrong product on screen with no error. So: search
 * first, then the hash's own query segment, with the HASH winning, because the
 * hash is the URL the router owns.
 */
function ambientHash(): string {
  const loc = (globalThis as { location?: { hash?: string } }).location;
  return loc?.hash ?? '';
}

/** The part of '#/reports?tab=2&profile=fleet' after the '?'. */
function hashQuery(hash: string): string {
  const mark = hash.indexOf('?');
  return mark === -1 ? '' : hash.slice(mark + 1);
}

/** The part before it, without the leading '#': '/reports'. */
function hashRoute(hash: string): string {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const mark = withoutHash.indexOf('?');
  return mark === -1 ? withoutHash : withoutHash.slice(0, mark);
}

/**
 * One codebase, several prospects. Ported from logistic/src/lib/profile.ts.
 *
 * The profile is NEVER persisted. A stored profile survives "reset demo data"
 * — pre-call step #1 — and leaves the show in the wrong product.
 */
export function createProfiles<C extends string>(
  defs: readonly ProfileDef<C>[],
  fallbackId: string,
) {
  const fallback = defs.find((d) => d.id === fallbackId) ?? defs[0];
  if (!fallback) throw new Error('createProfiles: at least one profile is required');

  return {
    all: defs,

    /**
     * `hash` defaults to the ambient `location.hash`, so a mock that calls
     * `resolve(window.location.search, import.meta.env.VITE_PROFILE)` — the
     * shape the scaffolder writes — inherits hash support without changing.
     *
     * `||`, not `??`: `URLSearchParams.get` returns '' for a present-but-empty
     * `?profile=`, and an empty value must fall through to VITE_PROFILE rather
     * than suppress it.
     */
    resolve(search: string, envProfile?: string, hash?: string): ProfileDef<C> {
      const fromHash = new URLSearchParams(hashQuery(hash ?? ambientHash())).get('profile');
      const fromQuery = new URLSearchParams(search).get('profile');
      const wanted = (fromHash || fromQuery || envProfile || '').toLowerCase();
      return defs.find((d) => d.id.toLowerCase() === wanted) ?? fallback;
    },

    capsOf(p: ProfileDef<C>): Set<C> {
      return new Set(p.caps);
    },

    /**
     * The link the profile switcher renders. Under a hash router the profile
     * must be written INTO the hash — a switcher that only rewrote the search
     * would be overruled on the next read by a stale profile still sitting in
     * the hash — so the search's copy is dropped and the hash's is set, leaving
     * exactly one profile in the URL.
     */
    href(search: string, id: string, hash?: string): string {
      const raw = hash ?? ambientHash();
      const route = hashRoute(raw);
      const params = new URLSearchParams(search);
      if (!route) {
        params.set('profile', id);
        return `?${params.toString()}`;
      }
      params.delete('profile');
      const hashParams = new URLSearchParams(hashQuery(raw));
      hashParams.set('profile', id);
      const searchPart = params.toString() ? `?${params.toString()}` : '';
      return `${searchPart}#${route}?${hashParams.toString()}`;
    },
  };
}
