export type ProfileDef<C extends string> = {
  id: string;
  label: string;
  caps: readonly C[];
};

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

    resolve(search: string, envProfile?: string): ProfileDef<C> {
      const fromQuery = new URLSearchParams(search).get('profile');
      const wanted = (fromQuery ?? envProfile ?? '').toLowerCase();
      return defs.find((d) => d.id.toLowerCase() === wanted) ?? fallback;
    },

    capsOf(p: ProfileDef<C>): Set<C> {
      return new Set(p.caps);
    },

    href(search: string, id: string): string {
      const params = new URLSearchParams(search);
      params.set('profile', id);
      return `?${params.toString()}`;
    },
  };
}
