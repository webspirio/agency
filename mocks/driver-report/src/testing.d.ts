/**
 * The root `vitest.setup.ts` does `import '@testing-library/jest-dom/vitest'` at runtime (this mock's vite.config.ts
 * lists it in `setupFiles`), but it sits outside this mock's tsconfig `include`, so its type augmentation never
 * reached the mock's program: without this line every `toBeInTheDocument()` in a mock test is TS2339 under the
 * mock's own `tsc`. A triple-slash reference applies to the whole program, so it lives here, once, rather than at
 * the top of whichever test file happened to need it first. `packages/kit/src/testing.d.ts` carries the same line.
 */
/// <reference types="@testing-library/jest-dom/vitest" />
