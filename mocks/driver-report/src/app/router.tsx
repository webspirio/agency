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
import { DriverHomePage } from '../pages/DriverHomePage';
import { DriverReportPage } from '../pages/DriverReportPage';
import { DriverHistoryPage } from '../pages/DriverHistoryPage';
import { DispatchQueuePage } from '../pages/DispatchQueuePage';
import { DispatchLegsPage } from '../pages/DispatchLegsPage';
import { DispatchExportPage } from '../pages/DispatchExportPage';
import { CAPS } from '../profiles';

export type Screen = RouteObject & { caps?: readonly string[] };

/**
 * TWO PRODUCTS, ONE BUILD, AND BOTH OWN '/'.
 *
 * `?profile=driver` is the thing in a driver's hand; `?profile=dispatcher` is
 * the office. Exactly one of the two `/` entries survives `visibleScreens`,
 * because a profile carries one capability and the filter is an `every`. That
 * is not a trick played on the router — it is the capability mechanism doing
 * precisely what it exists for, and it means the same URL is the right home
 * screen for whoever opened it.
 *
 * The driver has THREE routes and no navigation between them: `/` is the only
 * place he starts, `/z/:kind` is the report he is in the middle of, and `/moi`
 * is the one screen that gives him something back rather than taking something
 * from him. Every adoption source converges on that being why these apps die —
 * an app that only increases oversight is uninstalled — and nothing in the
 * client's brief gave the driver a single reason to open it.
 *
 * `/z/:kind` is deep-linkable on purpose: `#/z/LOADING` drops straight into the
 * loading flow, which is what a geofence push would do in production and what a
 * presenter needs on a call.
 */
export const screens: Screen[] = [
  { path: '/', element: <DriverHomePage />, caps: ['driver'] },
  { path: '/z/:kind', element: <DriverReportPage />, caps: ['driver'] },
  { path: '/moi', element: <DriverHistoryPage />, caps: ['driver'] },

  { path: '/', element: <DispatchQueuePage />, caps: ['dispatcher'] },
  { path: '/reisy', element: <DispatchLegsPage />, caps: ['dispatcher'] },
  { path: '/bas', element: <DispatchExportPage />, caps: ['dispatcher'] },
];

/** Both the router and any nav render this, never `screens` directly. */
export const visibleScreens: Screen[] = screens.filter((s) =>
  (s.caps ?? []).every((cap) => CAPS.has(cap)),
);

/** The home screen of whichever profile is loaded — the fallback target, and
 *  the only place a stale link may land. */
const home = visibleScreens.find((screen) => screen.path === '/')?.element ?? null;

export const router = createHashRouter([
  ...visibleScreens,
  // A stale link from an old build lands on this profile's home screen rather
  // than a blank page in front of a client.
  { path: '*', element: home },
]);
