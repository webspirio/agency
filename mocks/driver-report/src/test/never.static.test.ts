// mocks/driver-report/src/test/never.static.test.ts
/** The four «must never happen» rows of §8.6 that are properties of the SOURCE TEXT rather than of a rendered screen:
 *  #10 (one AlertDialog on the driver route), #14 (no device permission is ever asked for outside the two modules that
 *  own one), #21 (no domain row is persisted), #28 (no hand-written query key), and D8 (no XLSX promise) — plus the
 *  W3-04 gate's own row: no route is still on the construction-window placeholder.
 *
 *  Why text and not a render: each of these is a claim about EVERY file, including the ones no test mounts. A DOM test
 *  can only say «this screen did not ask for the camera»; #14 has to say «no screen can», and the only instrument that
 *  reads every screen at once is the file tree. The precedent is `src/copy/words.test.ts`, which is the same shape.
 *
 *  COMMENTS ARE STRIPPED BEFORE EVERY MATCH, and that is load-bearing rather than a convenience: `getUserMedia`,
 *  `geolocation` and «XLSX» each appear in this tree exactly where the code EXPLAINS why it does not do the thing —
 *  `src/stage/bar/HiddenMenu.tsx` says the stage never calls `getUserMedia`, `src/pages/office/BasPage.tsx` says D8 is
 *  a subtraction and no XLSX writer was built. A check that counted those would be red for the documentation of its
 *  own invariant, which is the fastest route to a row an operator switches off (SPEC §17).
 *
 *  WHAT THE STRIPPER STAYS BLIND TO: it is a regex, not a parser, so a `//` inside a string literal truncates the rest
 *  of that line (`'http://…'` is the shape that occurs here) and a banned token placed after one on the same line would
 *  be invisible. It errs toward a false GREEN, never a false red. The `template` half of a template literal is not
 *  special-cased either. Both are acceptable because every row below is ALSO held by something else: #14 by the spy
 *  drives in `never.driver.test.tsx` and `never.stage.test.tsx`, #28 by `api:bound`, D8 by `bas.test.tsx`'s
 *  `queryByText(/XLSX/)`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const isSource = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.controls.ts');
const rel = (f: string): string => path.relative(SRC, f);
const sources = (...dirs: string[]): string[] => dirs.flatMap((d) => walk(path.join(SRC, d))).filter(isSource);

/** Block comments and line comments removed; see the header for the one shape this gets wrong. */
function code(file: string): string {
  return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** The files whose text can reach a driver screen — the same two trees `words.test.ts` walks. */
const DRIVER_DIRS = ['pages/driver', 'components/driver'];

describe('#10 — a modal is never how the driver route talks', () => {
  it('imports AlertDialog in exactly one driver file, «Вийти» in MorePage', () => {
    const hits = sources(...DRIVER_DIRS).filter((f) => /AlertDialog/.test(code(f))).map(rel);
    expect(hits).toEqual(['pages/driver/MorePage.tsx']);
  });
  it('names no other radix dialog primitive on the driver route either', () => {
    // The row is about the SHAPE, not about one import name: `Dialog` and `Sheet` are the same interruption.
    const hits = sources(...DRIVER_DIRS)
      .filter((f) => rel(f) !== 'pages/driver/MorePage.tsx')
      .filter((f) => /\bDialog\b/.test(code(f)))
      .map(rel);
    expect(hits).toEqual([]);
  });
});

describe('#14 — nothing asks the device for a permission outside the two modules that own one', () => {
  it('names getUserMedia only in the capture engine', () => {
    const hits = sources('.').filter((f) => /getUserMedia/.test(code(f))).map(rel);
    expect(hits).toEqual(['app/capture/engine.ts']);
  });
  it('names geolocation only in the speed module', () => {
    const hits = sources('.').filter((f) => /geolocation/.test(code(f))).map(rel);
    expect(hits).toEqual(['app/speed.ts']);
  });
  it('names Notification nowhere at all — the product has no notification to ask for', () => {
    const hits = sources('.').filter((f) => /\bNotification\b/.test(code(f))).map(rel);
    expect(hits).toEqual([]);
  });
  it('registers no beforeunload anywhere — §5.8 and D4', () => {
    const hits = sources('.').filter((f) => /beforeunload/.test(code(f))).map(rel);
    expect(hits).toEqual([]);
  });
});

describe('#21 — no domain row survives a reload', () => {
  it('keeps the scaffold-owned persist allow-list in main.tsx byte for byte', () => {
    expect(readFileSync(path.join(SRC, 'main.tsx'), 'utf8')).toContain('partialize: (s) => ({ sidebar: s.sidebar })');
  });
  it('writes to storage only under the two I-10 per-viewer keys and the stage log', () => {
    // The kit owns the theme key and lives outside src/; the stage log holds ACTIONS, never rows (log.ts's own test
    // asserts the serialised log contains no `"records"`).
    const ALLOWED = new Set(['examplesKey(DEVICE_ID)', 'officeSeesKey(DEVICE_ID)', 'STAGE_LOG_KEY']);
    const calls: string[] = [];
    for (const f of sources('.')) {
      for (const m of code(f).matchAll(/(?:localStorage|sessionStorage)\.setItem\(\s*([^,]+?)\s*,/g)) {
        calls.push(`${rel(f)}: ${m[1]}`);
      }
    }
    expect(calls.filter((c) => !ALLOWED.has(c.split(': ')[1]!))).toEqual([]);
    expect(calls.length).toBeGreaterThan(0);          // the matcher itself must still match something
  });
});

describe('#28 — a query key is never hand-written', () => {
  it('has no queryKey: under pages/ or components/', () => {
    const hits = sources('pages', 'components').filter((f) => /queryKey\s*:/.test(code(f))).map(rel);
    expect(hits).toEqual([]);
  });
  it('calls useQuery and useMutation only from src/api/hooks.ts', () => {
    const hits = sources('.').filter((f) => /\buse(?:Query|Mutation)\s*[(<]/.test(code(f))).map(rel);
    expect(hits).toEqual(['api/hooks.ts']);
  });
  it('builds every key through queries.ts, which is the only file that names keyOf', () => {
    const hits = sources('.').filter((f) => /keyOf\s*\(/.test(code(f))).map(rel);
    expect(hits.filter((f) => f !== 'api/queries.ts' && f !== 'api/hooks.ts')).toEqual([]);
  });
});

describe('D8 — the console promises no XLSX', () => {
  it('has no XLSX outside a comment anywhere under pages/', () => {
    const hits = sources('pages').filter((f) => /XLSX/i.test(code(f))).map(rel);
    expect(hits).toEqual([]);
  });
});

describe('W3-04 — every route renders its own screen, never the construction-window placeholder', () => {
  /* `src/pages/PagePlaceholder.tsx` is the stand-in W0-18 pointed all 40 routes at so the tree stayed buildable
     while Wave 2 replaced the page files one at a time. The build plan deletes it at this gate and says why the
     deletion is the check rather than a grep run once: a Tier 2 page that runs out of time must render its OWN
     «Цей розділ у пілоті» panel, so that the sentence a client reads is a decision somebody wrote on that page,
     not a debug line reading «C-14 · Водії». A shared placeholder is the shape that lets that happen silently.

     The row is text, for the same reason every row above it is: it is a claim about all forty routes at once, and
     the router mounts one of them per test. It also ratchets — the module cannot come back under its own name.
     WHAT IT DOES NOT PROVE: only that no file NAMES this symbol. A page rendering an empty <main/>, or a new
     placeholder under another name, is green here and is what W3-05's browser pass is the instrument for. */
  it('names PagePlaceholder in no source file, and the module is gone', () => {
    const hits = sources('.').filter((f) => /PagePlaceholder/.test(code(f))).map(rel);
    expect(hits).toEqual([]);
    expect(existsSync(path.join(SRC, 'pages/PagePlaceholder.tsx'))).toBe(false);
  });
});
