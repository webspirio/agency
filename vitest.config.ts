import { defineConfig } from 'vitest/config';

/**
 * Two projects. Which environment a test needs is a property of the PACKAGE,
 * not of the file extension: `packages/kit/src/lib/theme/*.test.ts` drives
 * `localStorage` and `matchMedia` from a `.ts` file, and a mock's pages are
 * React. So the split is "the UI packages get jsdom, everything else gets
 * node", expressed once, with `packages/*` and `mocks/*` globs so a new
 * package or a scaffolded mock is collected without editing this file.
 *
 * The previous config enumerated `packages/{dec,synth,mock,cli}` by hand and
 * collected nothing under `mocks/*` — the actual deliverable — while still
 * reporting green. `packages/cli/src/workspace.contract.test.ts` now asserts
 * that every test file on disk is collected exactly once, so neither a gap nor
 * an overlap can reappear silently.
 */
const DOM = ['packages/kit/src/**/*.test.{ts,tsx}', 'mocks/*/src/**/*.test.{ts,tsx}'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts'],
          exclude: ['**/node_modules/**', ...DOM],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'dom',
          include: DOM,
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          testTimeout: 15000,
        },
      },
    ],
  },
});
