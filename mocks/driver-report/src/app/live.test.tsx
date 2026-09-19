// mocks/driver-report/src/app/live.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { server } from '../api/server';
import { demo } from '../domain/clock';
import { useLiveHighlight, useLiveSync } from './live';

describe('live sync (§7.7, §5.9, EC-168)', () => {
  it('invalidates active queries once per burst of writes, 50 ms after the last', async () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useLiveSync(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
    const c = { actor: { id: 'device-000001', role: 'driver' }, now: demo('05:21'), params: {}, body: {} };
    server.wrote('submitRecord', c, { truck_day_id: 'day-1', highlight: true });
    server.wrote('uploadPhoto', c, { truck_day_id: 'day-1' });
    await vi.advanceTimersByTimeAsync(60);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ type: 'active' });
    vi.useRealTimers();
  });
  it('highlights a changed truck-day for 10 s of wall clock', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(() => useLiveHighlight());
    server.wrote('submitRecord', { actor: { id: 'device-000001', role: 'driver' }, now: demo('05:21'), params: {}, body: {} }, { truck_day_id: 'day-7', highlight: true });
    rerender();
    expect(result.current('day-7')).toEqual({ live: true, at: demo('05:21') });
    await vi.advanceTimersByTimeAsync(10_001);
    rerender();
    expect(result.current('day-7').live).toBe(false);
    vi.useRealTimers();
  });
});
