import { describe, expect, it } from 'vitest';
import { byCodepoint } from './order';

describe('byCodepoint is the comparator a SQL ORDER BY can reproduce', () => {
  it('orders by code point, not by locale collation', () => {
    // MEASURED: with the default ICU collation 'a'.localeCompare('B') is -1, so
    // ['a','B'].sort(localeCompare) is ['a','B']. By code point 'B' (0x42) precedes
    // 'a' (0x61), and a Postgres ORDER BY under the C collation agrees with the code
    // point, not with ICU.
    expect(['a', 'B'].sort(byCodepoint)).toEqual(['B', 'a']);
  });

  it('is 0 for equal strings, so a sort using it is stable', () => {
    expect(byCodepoint('x', 'x')).toBe(0);
  });

  it('does not consult the ICU build node was compiled with', () => {
    // THE TRIPWIRE. Node can be compiled `small-icu`, and then a localeCompare sort
    // differs between a laptop and CI for reasons that have nothing to do with the
    // code — the host-not-code failure docs/BUILD-REPORT.md records twice. By code
    // point 'z' (0x7A) precedes 'ä' (0xE4); every ICU collation puts 'ä' near 'a'.
    expect(['ä', 'z'].sort(byCodepoint)).toEqual(['z', 'ä']);
  });

  it('disagrees with localeCompare, which is the whole reason it exists', () => {
    expect(['a', 'B'].sort((x, y) => x.localeCompare(y))).not.toEqual(['B', 'a']);
  });
});
