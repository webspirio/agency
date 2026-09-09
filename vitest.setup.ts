/**
 * Lifted from yagoda-starter/frontend/src/test-setup.ts, minus the i18n
 * initialisation the kit does not have.
 *
 * These four stubs are the non-obvious cost of getting radix + vaul + Tailwind
 * component tests green under jsdom. They were paid for once already; an agent
 * regenerating this file from scratch will not rediscover them.
 */
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

// Testing Library defaults findBy*/waitFor to 1000ms. A full-suite run executes
// every file's worker concurrently, and the resulting CPU contention pushes an
// otherwise-fast mocked round trip past 1000ms on a busy machine — which is what
// makes a handful of files intermittently red under the full suite while passing
// in isolation. Raised globally rather than per call site: per-test bumps are
// whack-a-mole against a moving threshold. This does NOT slow the suite; a
// passing assertion resolves as soon as its condition holds.
configure({ asyncUtilTimeout: 5000 });

// jsdom doesn't implement ResizeObserver; radix's Popper-based components read
// element size on mount and throw without a stub.
/* eslint-disable @typescript-eslint/no-unused-vars */
class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}
/* eslint-enable @typescript-eslint/no-unused-vars */
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom doesn't implement pointer capture; drawer components call
// setPointerCapture on pointerdown and would throw on every click.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

// jsdom doesn't implement matchMedia; theme and breakpoint hooks call it
// unconditionally on mount. Default to "no preference matches".
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
