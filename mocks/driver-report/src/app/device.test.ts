// mocks/driver-report/src/app/device.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000002&stage=1&beat=7'); });
import { DEVICE_ID, IS_STAGE, STANDALONE_TOUCH, urlBeat } from './device';

describe('device identity from the URL (§2.1)', () => {
  it('reads the phone, the stage flag and the beat', () => {
    expect([DEVICE_ID, IS_STAGE, STANDALONE_TOUCH, urlBeat(2)]).toEqual(['device-000002', true, false, 7]);
  });
});
