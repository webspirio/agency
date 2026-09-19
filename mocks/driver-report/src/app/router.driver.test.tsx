// mocks/driver-report/src/app/router.driver.test.tsx
// Resolves routes WITHOUT rendering them: the pages are placeholders now and real screens after Wave 2, and this test
// must stay green through both (it asserts the route → component table, not placeholder text).
import { vi, describe, expect, it } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001'); });
import type { ReactElement } from 'react';
import { matchRoutes, Navigate } from 'react-router';
import { ArrivePage } from '../pages/driver/ArrivePage';
import { BindConfirmPage } from '../pages/driver/BindConfirmPage';
import { BindPage } from '../pages/driver/BindPage';
import { DayPage } from '../pages/driver/DayPage';
import { DayStopPage } from '../pages/driver/DayStopPage';
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
import { visibleScreens } from './router';

const leaf = (path: string): unknown => (matchRoutes(visibleScreens, path)?.at(-1)?.route.element as ReactElement | undefined)?.type;
describe('the driver profile mounts only driver screens (§2.2)', () => {
  it.each([['/', HomePage], ['/bind', BindPage], ['/bind/483920', BindConfirmPage], ['/shift/start', ShiftStartPage],
    ['/stop/s1/arrive', ArrivePage], ['/stop/s1/loaded', LoadedPage], ['/stop/s1/unloaded', UnloadedPage],
    ['/stop/s1/later', StopLaterPage], ['/refuel', RefuelPage], ['/refuel/k/later', RefuelLaterPage], ['/stand', StandPage],
    ['/elsewhere', ElsewherePage], ['/requests', RequestsPage], ['/request/r1', RequestPage], ['/shift/end', ShiftEndPage],
    ['/day', DayPage], ['/day/2026-09-21', DayPage], ['/day/2026-09-21/stop/s1', DayStopPage], ['/month/2026-09', MonthPage],
    ['/office-sees', OfficeSeesPage], ['/more', MorePage]] as const)('%s → its screen', (path, Page) => {
    expect(leaf(path)).toBe(Page);
  });
  it('sends an unknown or office route home', () => {
    expect(leaf('/inbox/now')).toBe(Navigate);
  });
});
