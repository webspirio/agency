# Provenance

Lifted from `yagoda-starter/frontend/src/shared/ui` at commit `7d1aa4f40a447648ca9d25af6259f041e3e72058`
(`7d1aa4f`) on 2026-09-09.

Measured at lift, in the source tree: **84 files, 52 non-test components, 30 co-located tests,
3,514 non-test LOC, zero imports above `shared/`, 13 radix-touching primitives, 3 page
templates.** Every one of those numbers was re-counted here and every one matched; the two earlier
research counts (79 files / 3,187 LOC and 79 / 3,496) are both wrong.

The source repo is NOT absorbed, NOT forked and NOT edited. This is a dated snapshot; see the
spec's open decision on kit drift (§16.5 — the source moved 212 commits in the 5 days before this
lift).

## What came across unchanged

All 84 files of `shared/ui`, plus the five `shared/lib` modules they reference, which the
alias rewrite folded into `src/lib/`:

| Source | Here | Note |
|---|---|---|
| `shared/lib/cn.ts` | `src/lib/cn.ts` | verbatim |
| `shared/lib/clipboard/` | `src/lib/clipboard/` | verbatim |
| `shared/lib/motion.ts` | `src/lib/motion.ts` | see below |
| `shared/lib/theme/` | `src/lib/theme/` | see below |
| `shared/lib/i18n/language-preference.ts` | `src/lib/language-preference.ts` | verbatim — plain localStorage, no i18next in it |

Two alias forms were rewritten to relative imports, depth-aware so the three files in
`src/templates/` resolve correctly: `@/shared/ui/x` → `./x` (`../x` from `templates/`),
`@/shared/lib/y` → `./lib/y` (`../lib/y` from `templates/`). Zero `@/` specifiers remain.

Measured here after the lift: **52 non-test components, 3 page templates, 3,778 non-test LOC**
across the same 54 files. The +264 lines over the source are the LIFT NOTE comments below and the
toast store; no component gained behaviour.

## Substitutions — six upstream dependencies this workspace does not carry

Every one keeps the export names and the call shapes, so re-adding the real dependency is a revert
of one file, never a change at a call site.

### 1. `react-i18next` — 6 components (forbidden: SPEC §14)

Each component that called `useTranslation()` now takes a `labels` prop with English defaults.
The English defaults are the exact strings from `shared/lib/i18n/locales/en.json`, which is why
the copied tests still assert on 'Copy', 'Theme', 'Dark', 'Add “Delta”' and 'Show all (4)'
unchanged.

| Component | New prop | Defaults |
|---|---|---|
| `CopyableField` | `labels?: Partial<CopyableFieldLabels>` | `copy: 'Copy'`, `copied: 'Copied'` |
| `ThemeToggle` | `labels?: Partial<ThemeToggleLabels>` | `label: 'Theme'`, `light: 'Light'`, `dark: 'Dark'` |
| `TagPicker` | `labels?: Partial<TagPickerLabels>` | `searchPlaceholder: 'Start typing or pick below…'`, `create: (l) => \`Add “${l}”\``, `showAll: (n) => \`Show all (${n})\``, `collapse: 'Collapse'` |
| `LanguageSwitcher` | `labels`, plus `value`/`onChange` | `label: 'Language'`, `options: { uk: 'UK', en: 'EN' }` |
| `Field` | none — `error` changed meaning | was an i18n KEY resolved with `t()`; is now the resolved message |
| `ImagePicker` | none — `error` changed meaning | same |

`LanguageSwitcher` additionally lost its only two i18next *runtime* calls
(`i18n.resolvedLanguage` / `i18n.changeLanguage`); it is now a controlled
`value`/`onChange` pair that falls back to the persisted preference when the caller does not
drive it.

The only copied test that had to change for this is `field.test.tsx`, which passed
`error="common.somethingWentWrong"` and asserted the key resolved to 'Something went wrong'. It
now passes that message directly and asserts it reaches the alert verbatim. No other assertion in
any copied test was touched.

### 2. `motion` (`motion/react`) — 3 files

Not installed in this workspace.

- `src/lib/motion.ts` — the whole motion vocabulary (springs, `reducedFade`, `refusal`,
  `pressScale`, the variant helpers, `useEntranceOnce`) is unchanged. Only three imported pieces
  are local now: `Transition` and `Variants` as structural types, and `useReducedMotion` as a
  `matchMedia('(prefers-reduced-motion: reduce)')` subscription.
- `animated-number.tsx` — the `animate()`/`useMotionValue()` tween is a
  `requestAnimationFrame` tween over the same two durations (350 ms, 150 ms reduced) with the
  same easeOut. Props and display contract unchanged.
- `segmented.tsx` — **the one visual regression in the lift.** The active thumb was a
  `motion.span` gliding between segments via `layoutId`; a layoutId animates a position
  transform between two different DOM nodes, which CSS cannot express, so the thumb now snaps.
  That is exactly the branch the component already took under reduced motion, not a new visual
  state. Restoring the glide means adding `motion` and reverting that one element.

### 3. `sonner` — 2 files

Not installed. `toast.ts` now owns a ~60-line store with the same surface — `toast`,
`toast.success/error/info/warning/loading/dismiss`, `toastSuccess`, `toastError` — and ids
from a `seq()`-style counter, never `Math.random()`. `sonner.tsx` renders that store with
the same component name, the same five lucide icons and the same four CSS custom properties
(`--normal-bg`, `--normal-text`, `--normal-border`, `--border-radius`), so a mock's
stylesheet theming keeps working. Neither file has a test upstream or here.

### 4. `zustand` — 1 file

`src/lib/theme/theme-preference.ts` was a `create()` call. It is now the same three-method
contract — `useThemePreference(selector)`, `.getState()`, `.setState()` — over React's own
`useSyncExternalStore`. Both copied test files (`theme-preference.test.ts`,
`useAppTheme.test.ts`) pass unmodified against it, including their `vi.resetModules()`
fresh-store trick.

### 5. `vaul` — 1 file

`drawer.tsx` was the only file in the lift that used double-quoted imports (it is shadcn-CLI
output kept in its original formatting), which is why a single-quote grep of the source missed it
and only `tsc` caught it. It is now built on radix's `Dialog` — already a dependency, and what
vaul itself wraps.

Every export keeps its name and props, and `DrawerContent`/`DrawerBareContent` still stamp
`data-vaul-drawer-direction` on the sheet, so every `data-[vaul-drawer-direction=…]` and
`group-data-[vaul-drawer-direction=…]` selector in the file — and in any consumer — keeps matching
unchanged. `direction` moved from vaul's Root onto a context the content reads.

What is lost: **vaul's drag.** No swipe-to-dismiss, no follow-the-finger rubber-banding; open and
close are CSS slide transitions per edge. Escape, outside-press, `DrawerClose` and focus trapping
are unaffected — those were radix's to begin with. `DRAWER_TRANSITION_MS` keeps its value and its
contract.

This is the one substitution that changes the **13 radix-touching primitives** measured at source:
here there are **14**.

### 6. `vitest-axe` + `axe-core` — **a check that was lost, not substituted**

16 of the copied tests called `expectNoAxeViolations(container)` from
`frontend/src/test-axe.ts`. Neither package is installed and neither can be reimplemented. There
is no honest stand-in: a no-op helper would report green while checking nothing, which is the
exact failure mode the spec's §14 rejects i18n key-parity for.

So the import and the assertion were **removed**, along with the 15 `it(...)` blocks whose only
content was that one assertion (the 16th, in `theme-toggle.test.tsx`, sat inside a larger test
and only lost its line). Nothing else in those files changed.

**This is the one thing in the kit that is weaker than its source.** Restoring it: install
`vitest-axe` and `axe-core`, copy `frontend/src/test-axe.ts` to `src/test-axe.ts`, and
re-add `await expectNoAxeViolations(container)` to these 16 files —

```
data-table  date-stepper  dot  empty-state  eyebrow  ledger-row  page-header  section-card
share-bar  sparkline  stat-grid  stat-tile  theme-toggle
templates/dashboard-page  templates/document-page  templates/list-page
```

## One addition that is not from upstream

`src/test-setup.ts`, imported by the 32 test files that render. Testing Library registers its own
`afterEach(cleanup)` — but only when a global `afterEach` exists, i.e. only under
`globals: true`, which this workspace's vitest projects do not set. Without it the second
`render()` in a file stacks a second copy of the component into the same document and every
subsequent `getByRole` throws "Found multiple elements": 20 of the 37 files failed that way on
the first run. The registration belongs in the root `vitest.setup.ts`, which is shared with the
other packages and is not this package's to edit; `cleanup` is idempotent, so if the root setup
ever gains it this file becomes a no-op.

## Four edits `tsc` forced, under this workspace's stricter compiler options

`tsconfig.base.json` here sets `noUncheckedIndexedAccess` and an `ES2022` lib; the source repo's
does not. Three lifted expressions and one lifted test line did not compile as a result. All four
are guards, not behaviour changes, and the kit typechecks clean under the workspace options:

- `segmented.tsx` — `enabled[nextPos]` is provably in range (a modulo of a length already checked
  non-zero); now `if (target)`.
- `sparkline.tsx` — `pts[pts.length - 1]` is provably present (`values.length` is checked on the
  first line); now `?? [0, height]`.
- `TagPicker.test.tsx` — `chips[0]` destructured and thrown on if absent, so `fireEvent.click`
  takes an `HTMLElement`.
- `toast.ts` (new code) — `Array.prototype.with` is ES2023; replaced with a `map`.
