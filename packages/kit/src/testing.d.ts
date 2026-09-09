/**
 * `vitest.setup.ts` does `import '@testing-library/jest-dom/vitest'` at runtime,
 * but it sits at the repo root — outside this project's `rootDir` — so its type
 * augmentation never reached the program and all 136 `toHaveClass`/`toBeVisible`
 * assertions in the kit's own tests were TS2339 under `tsc -b`. Nobody saw it
 * because `pnpm typecheck` could not compile this project at all.
 */
/// <reference types="@testing-library/jest-dom/vitest" />
