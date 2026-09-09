import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `toast.ts` is the one module in the kit that is NOT lifted — upstream it was a
 * two-line re-export of `sonner`, and `sonner` is not a dependency here, so the
 * store is code this repo owns and therefore code this repo has to test.
 *
 * Fresh module per test, the same `vi.resetModules()` trick the copied
 * `theme-preference.test.ts` uses: the store is module-level state and the id
 * counter has to start from 1 for the id assertions to mean anything.
 */
async function freshToast() {
  vi.resetModules();
  return await import('./toast');
}

describe('toast store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('assigns sequential ids — seq(), never Math.random()', async () => {
    const { toast } = await freshToast();
    expect(toast('first')).toBe('toast-000001');
    expect(toast.success('second')).toBe('toast-000002');
    expect(toast.error('third')).toBe('toast-000003');
  });

  it('keeps the stack in creation order, with type and message', async () => {
    const { toast, getToasts } = await freshToast();
    toast.success('saved');
    toast.error('failed');
    expect(getToasts().map((t) => [t.type, t.message])).toEqual([
      ['success', 'saved'],
      ['error', 'failed'],
    ]);
  });

  it('notifies subscribers on push and on dismiss, and stops after unsubscribe', async () => {
    const { toast, subscribeToasts } = await freshToast();
    const seen = vi.fn();
    const off = subscribeToasts(seen);
    toast('a');
    expect(seen).toHaveBeenCalledTimes(1);
    toast.dismiss();
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    toast('b');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('reuses an id to replace in place — loading -> success keeps one row, in position', async () => {
    const { toast, getToasts } = await freshToast();
    toast('before');
    const id = toast.loading('uploading…');
    toast('after');
    toast.success('uploaded', { id });

    expect(getToasts()).toHaveLength(3);
    const [, replaced] = getToasts();
    expect(replaced?.id).toBe(id);
    expect(replaced?.type).toBe('success');
    expect(replaced?.message).toBe('uploaded');
  });

  it('auto-dismisses a default toast after its duration, and only then', async () => {
    const { toast, getToasts } = await freshToast();
    toast('bye', { duration: 1000 });
    vi.advanceTimersByTime(999);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getToasts()).toEqual([]);
  });

  it('pins a loading toast — Infinity duration, no timer', async () => {
    const { toast, getToasts } = await freshToast();
    toast.loading('working…');
    vi.advanceTimersByTime(60_000);
    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0]?.duration).toBe(Infinity);
  });

  it('replacing a pending toast clears its old timer, so the replacement is not cut short', async () => {
    const { toast, getToasts } = await freshToast();
    const id = toast('slow', { duration: 1000 });
    vi.advanceTimersByTime(900);
    toast.success('done', { id, duration: 1000 });
    // The original timer would fire here if it had not been cleared.
    vi.advanceTimersByTime(200);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(800);
    expect(getToasts()).toEqual([]);
  });

  it('dismiss(id) removes one; dismiss() clears the stack and its timers', async () => {
    const { toast, getToasts } = await freshToast();
    const a = toast('a');
    toast('b');
    toast.dismiss(a);
    expect(getToasts().map((t) => t.message)).toEqual(['b']);
    toast.dismiss();
    expect(getToasts()).toEqual([]);
  });

  it('toastSuccess / toastError are the success / error channels', async () => {
    const { toastSuccess, toastError, getToasts } = await freshToast();
    toastSuccess('yes', { description: 'ok' });
    toastError('no');
    expect(getToasts().map((t) => t.type)).toEqual(['success', 'error']);
    expect(getToasts()[0]?.description).toBe('ok');
  });
});
