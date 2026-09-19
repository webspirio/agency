// mocks/driver-report/src/api/hooks.test.tsx
import { vi, describe, expect, it } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001'); });
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { demo } from '../domain/clock';
import { server } from './server';
import { useConfirmBinding, useToday } from './hooks';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('hooks read and write through the factory (§7.7, §8.6 #28)', () => {
  it('reads today', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useToday(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data?.plan?.trip_no).toBe('Р-26-3312'));
    expect(qc.getQueryCache().getAll()[0]!.queryKey[0]).toBe('getToday');
  });
  it('invalidates every active query after a write', async () => {
    const hryhorii = server.world().drivers.find((d) => d.tab_no === '0457')!;
    server.stores.bindCodes.create({ code: '777111', driver_id: hryhorii.id, created_by: 'user-000001', created_at: demo('05:14'),
      expires_at: demo('05:29'), opened_at: null, used_at: null, device_id: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useConfirmBinding('777111'), { wrapper: wrapper(qc) });
    result.current.mutate();
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ type: 'active' }));
  });
});
