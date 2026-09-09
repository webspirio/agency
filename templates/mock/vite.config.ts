import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // One Worker per slug serves the mock at root, so base is '/' unless a build
  // deliberately targets a subpath. Combined with hash routing this is what
  // makes the hosting topology reversible: no rewrite rule, no 404.html.
  base: process.env.MOCK_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  // The mock/product switch, resolved at build time so the adapter and the
  // whole route table tree-shake out of a product build.
  define: { 'import.meta.env.VITE_MOCK': JSON.stringify(process.env.VITE_MOCK ?? '1') },
  build: { sourcemap: true },
  // `pnpm --filter <slug> test` is step four of the gate, and the test that
  // matters mounts the app. That needs a DOM and the same jsdom stubs the
  // workspace's own UI tests need (ResizeObserver, pointer capture,
  // matchMedia) — radix components throw without them. Reusing the workspace
  // file rather than copying it keeps one definition of "what jsdom is missing".
  test: {
    environment: 'jsdom',
    setupFiles: ['../../vitest.setup.ts'],
    testTimeout: 15000,
  },
});
