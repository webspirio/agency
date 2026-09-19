/* @scaffold-owned — hash history. The product's equivalent is
   createBrowserRouter and that one word is the entire diff: no base path, no
   404.html, no host rewrite rule, so a static Worker serves every deep link
   from a single index.html and `#/` links survive being pasted into a chat.

   The `caps` field is the other half. Capabilities gate the ROUTE, not the
   menu: a screen the current profile cannot see is not merely hidden, it is
   not mounted, and its data 404s in the adapter as well. That makes the
   do-not-open list a derivation of this one array instead of a second list
   somebody has to remember to update. */
import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { ArrivePage } from '../pages/driver/ArrivePage';
import { BindConfirmPage } from '../pages/driver/BindConfirmPage';
import { BindPage } from '../pages/driver/BindPage';
import { DayPage } from '../pages/driver/DayPage';
import { DayStopPage } from '../pages/driver/DayStopPage';
import { DriverShell } from '../pages/driver/DriverShell';
import { ElsewherePage } from '../pages/driver/ElsewherePage';
import { HomePage } from '../pages/driver/HomePage';
import { LoadedPage } from '../pages/driver/LoadedPage';
import { MonthPage } from '../pages/driver/MonthPage';
import { MorePage } from '../pages/driver/MorePage';
import { OfficeSeesPage } from '../pages/driver/OfficeSeesPage';
import { RefuelLaterPage } from '../pages/driver/RefuelLaterPage';
import { RefuelPage } from '../pages/driver/RefuelPage';
import { RequestPage } from '../pages/driver/RequestPage';
import { RequestsPage } from '../pages/driver/RequestsPage';
import { ShiftEndPage } from '../pages/driver/ShiftEndPage';
import { ShiftStartPage } from '../pages/driver/ShiftStartPage';
import { StandPage } from '../pages/driver/StandPage';
import { StopLaterPage } from '../pages/driver/StopLaterPage';
import { UnloadedPage } from '../pages/driver/UnloadedPage';
import { BasPage } from '../pages/office/BasPage';
import { ConsoleShell } from '../pages/office/ConsoleShell';
import { DaysPage } from '../pages/office/DaysPage';
import { DriversPage } from '../pages/office/DriversPage';
import { FleetBoardPage } from '../pages/office/FleetBoardPage';
import { KeyPointsPage } from '../pages/office/KeyPointsPage';
import { NowLanePage } from '../pages/office/NowLanePage';
import { OriginalsPage } from '../pages/office/OriginalsPage';
import { PilotPage } from '../pages/office/PilotPage';
import { PrintPage } from '../pages/office/PrintPage';
import { ReviewLanePage } from '../pages/office/ReviewLanePage';
import { StopReviewPage } from '../pages/office/StopReviewPage';
import { TruckDayPage } from '../pages/office/TruckDayPage';
import { TruckPage } from '../pages/office/TruckPage';
import { TrucksPage } from '../pages/office/TrucksPage';
import { WorktimePage } from '../pages/office/WorktimePage';
import { CAPS } from '../profiles';
import { StagePage } from '../stage/StagePage';

export type Screen = RouteObject & { caps?: readonly string[] };

/**
 * THREE PRODUCTS, ONE BUILD, AND ALL THREE OWN '/'.
 *
 * `?profile=driver` is the thing in a driver's hand; `?profile=dispatcher` is
 * the office; `?profile=demo` is the presenter stage. Exactly one of the `/`
 * entries survives `visibleScreens`, because a profile carries one capability
 * and the filter is an `every`. That is not a trick played on the router — it
 * is the capability mechanism doing precisely what it exists for, and it means
 * the same URL is the right home screen for whoever opened it.
 *
 * The driver's routes (§2.2) and the console's (§2.3) each sit under their
 * shell as a layout route whose own `*` child sends an unknown path home, so an
 * office link pasted into a phone lands on «Сьогодні» rather than a blank page.
 * A flow's steps are history state, never routes: a pasted link cannot drop the
 * driver into step 4 of a flow he never opened. The A4 print preview is the one
 * console route outside the shell, because it carries no console chrome.
 */
export const screens: Screen[] = [
  { path: '/', element: <DriverShell />, caps: ['driver'], children: [
    { index: true, element: <HomePage /> },
    { path: 'bind', element: <BindPage /> },
    { path: 'bind/:code', element: <BindConfirmPage /> },
    { path: 'shift/start', element: <ShiftStartPage /> },
    { path: 'stop/:stopId/arrive', element: <ArrivePage /> },
    { path: 'stop/:stopId/loaded', element: <LoadedPage /> },
    { path: 'stop/:stopId/unloaded', element: <UnloadedPage /> },
    { path: 'stop/:stopId/later', element: <StopLaterPage /> },
    { path: 'refuel', element: <RefuelPage /> },
    { path: 'refuel/:recordKey/later', element: <RefuelLaterPage /> },
    { path: 'stand', element: <StandPage /> },
    { path: 'elsewhere', element: <ElsewherePage /> },
    { path: 'shift/end', element: <ShiftEndPage /> },
    { path: 'requests', element: <RequestsPage /> },
    { path: 'request/:requestId', element: <RequestPage /> },
    { path: 'day', element: <DayPage /> },
    { path: 'day/:date', element: <DayPage /> },
    { path: 'day/:date/stop/:stopId', element: <DayStopPage /> },
    { path: 'month/:month', element: <MonthPage /> },
    { path: 'office-sees', element: <OfficeSeesPage /> },
    { path: 'more', element: <MorePage /> },
    { path: '*', element: <Navigate to="/" replace /> },
  ] },
  { path: '/day/:truckDayId/print', element: <PrintPage />, caps: ['dispatcher'] },
  { path: '/', element: <ConsoleShell />, caps: ['dispatcher'], children: [
    { index: true, element: <FleetBoardPage /> },
    { path: 'inbox/now', element: <NowLanePage /> },
    { path: 'inbox/review', element: <ReviewLanePage /> },
    { path: 'stop/:stopId', element: <StopReviewPage /> },
    { path: 'days', element: <DaysPage /> },
    { path: 'day/:truckDayId', element: <TruckDayPage /> },
    { path: 'key-points', element: <KeyPointsPage /> },
    { path: 'bas', element: <BasPage /> },
    { path: 'trucks', element: <TrucksPage /> },
    { path: 'trucks/:truckId', element: <TruckPage /> },
    { path: 'trucks/:truckId/fuel', element: <TruckPage /> },
    { path: 'originals', element: <OriginalsPage /> },
    { path: 'worktime', element: <WorktimePage /> },
    { path: 'drivers', element: <DriversPage /> },
    { path: 'pilot', element: <PilotPage /> },
    { path: '*', element: <Navigate to="/" replace /> },
  ] },
  { path: '/', element: <StagePage />, caps: ['stage'] },
  { path: '/beat/:n', element: <StagePage />, caps: ['stage'] },
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
