/* @scaffold-owned — hash history. The product's equivalent is
   createBrowserRouter and that one word is the entire diff: no base path, no
   404.html, no host rewrite rule, so a static Worker serves every deep link
   from a single index.html and `#/` links survive being pasted into a chat.

   The `caps` field is the other half. Capabilities gate the ROUTE, not the
   menu: a screen the current profile cannot see is not merely hidden, it is
   not mounted, and its data 404s in the adapter as well. That makes the
   do-not-open list a derivation of this one array instead of a second list
   somebody has to remember to update. */
import { createHashRouter, type RouteObject } from 'react-router';
import { OverviewPage } from '../pages/OverviewPage';
import { CAPS } from '../profiles';

export type Screen = RouteObject & { caps?: readonly string[] };

/** Add a screen here and to `src/api/routes.ts`; nothing else knows about it. */
export const screens: Screen[] = [{ path: '/', element: <OverviewPage /> }];

/** Both the router and any nav render this, never `screens` directly. */
export const visibleScreens: Screen[] = screens.filter((s) =>
  (s.caps ?? []).every((cap) => CAPS.has(cap)),
);

export const router = createHashRouter([
  ...visibleScreens,
  // A stale link from an old build lands on the first screen rather than a
  // blank page in front of a client.
  { path: '*', element: <OverviewPage /> },
]);
