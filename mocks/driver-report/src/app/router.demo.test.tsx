// mocks/driver-report/src/app/router.demo.test.tsx
import { vi, describe, expect, it } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=demo'); });
import type { ReactElement } from 'react';
import { matchRoutes } from 'react-router';
import { CAPS } from '../profiles';
import { StagePage } from '../stage/StagePage';
import { visibleScreens } from './router';

const leaf = (path: string): unknown => (matchRoutes([...visibleScreens, { path: '*', element: <StagePage /> }], path)?.at(-1)?.route.element as ReactElement | undefined)?.type;
describe('the demo profile mounts only the stage (§2.5)', () => {
  it('carries the stage capability only', () => expect([...CAPS]).toEqual(['stage']));
  it.each(['/', '/beat/7', '/inbox/now'])('%s → the stage', (path) => {
    expect(leaf(path)).toBe(StagePage);
  });
});
