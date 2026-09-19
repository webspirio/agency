// mocks/driver-report/src/app/router.dispatcher.test.tsx
import { vi, describe, expect, it } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia'); });
import type { ReactElement } from 'react';
import { matchRoutes, Navigate } from 'react-router';
import { BasPage } from '../pages/office/BasPage';
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
import { ACTOR } from '../profiles';
import { visibleScreens } from './router';

const leaf = (path: string): unknown => (matchRoutes(visibleScreens, path)?.at(-1)?.route.element as ReactElement | undefined)?.type;
describe('the dispatcher profile mounts only console screens (§2.3)', () => {
  it('acts as Наталія Шевчук, operator (D12)', () => expect(ACTOR).toEqual({ id: 'user-natalia', role: 'operator' }));
  it.each([['/', FleetBoardPage], ['/inbox/now', NowLanePage], ['/inbox/review', ReviewLanePage], ['/stop/s1', StopReviewPage],
    ['/days', DaysPage], ['/day/d1', TruckDayPage], ['/day/d1/print', PrintPage], ['/key-points', KeyPointsPage], ['/bas', BasPage],
    ['/trucks', TrucksPage], ['/trucks/t1', TruckPage], ['/trucks/t1/fuel', TruckPage], ['/originals', OriginalsPage],
    ['/worktime', WorktimePage], ['/drivers', DriversPage], ['/pilot', PilotPage]] as const)('%s → its page', (path, Page) => {
    expect(leaf(path)).toBe(Page);
  });
  it('sends a driver route home', () => {
    expect(leaf('/shift/start')).toBe(Navigate);
  });
});
