// mocks/driver-report/src/components/office/index.ts
/** The console shell kit (I-15 «components/office», W1-04). Every Wave 2 console page imports from HERE and from
 *  nothing deeper: the names and prop types below are the contract those tasks were written against, so a change to
 *  one of them is a change to fourteen pages.
 *
 *  `saveFile` lives in this kit rather than in a page because two Wave 2 tasks save files — «Ключові точки» (W2-08)
 *  and «В BAS» (W2-12) — and a Wave 2 task may not import another Wave 2 task's file. */
export { useConsoleMode, type ConsoleMode } from './useConsoleMode';
export { Sidebar } from './Sidebar';
export { ConsoleHeader } from './ConsoleHeader';
export { PageHead } from './PageHead';
export { Panel } from './Panel';
export { StatTile } from './StatTile';
export { StatusPill } from './StatusPill';
export { RowRule } from './RowRule';
export { DocDots } from './DocDots';
export { ContactCell } from './ContactCell';
export { ResponsiveTable, type RTColumn } from './ResponsiveTable';
export { MockBanner } from './MockBanner';
export { EmptyPanel } from './EmptyPanel';
export { SkeletonRows } from './SkeletonRows';
export { LiveLine } from './LiveLine';
export { saveFile } from './saveFile';
