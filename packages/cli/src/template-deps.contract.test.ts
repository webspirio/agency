import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The root installs what the template needs, so the template's tests and its
 * type-level tripwires can run in the FAST tier rather than only inside a mock the
 * `build` row scaffolds and installs from scratch.
 *
 * That is only safe while the RANGES agree. A mock built against a different vitest,
 * or a different React, than the one that vetted its tests is a mock whose tests
 * proved something about a different program — and the failure would appear at the
 * client's demo, not here.
 */
describe('the root and the template agree about every shared dependency', () => {
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>;
  };
  const template = JSON.parse(
    readFileSync(join(ROOT, 'templates', 'mock', 'package.json.hbs'), 'utf8'),
  ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

  /** Everything a scaffolded mock installs, from both blocks. */
  const shipped: Record<string, string> = { ...template.dependencies, ...template.devDependencies };
  const external = Object.entries(shipped).filter(([, range]) => !range.startsWith('workspace:'));

  it('installs every non-workspace dependency the template declares', () => {
    const missing = external
      .filter(([name]) => root.devDependencies[name] === undefined)
      .map(([name, range]) => `${name}@${range}`);
    expect(missing).toEqual([]);
  });

  it('installs it at the SAME range, so the tests vet the program the mock gets', () => {
    const drifted = external
      .filter(([name, range]) => root.devDependencies[name] !== range)
      .map(([name, range]) => `${name}: template wants ${range}, root has ${root.devDependencies[name]}`);
    expect(drifted).toEqual([]);
  });

  it('keeps every @agency/* dependency a workspace link, never a version', () => {
    // A published range here would let a mock resolve a DIFFERENT copy of the very
    // packages this repo exists to ship, and nothing would be red.
    const agency = Object.entries(shipped).filter(([name]) => name.startsWith('@agency/'));
    expect(agency.length).toBeGreaterThan(0);
    expect(agency.filter(([, range]) => !range.startsWith('workspace:'))).toEqual([]);
  });
});
