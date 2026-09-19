// mocks/driver-report/src/domain/types.test.ts
import { describe, expect, it } from 'vitest';
import { ARTEFACT_KINDS, CORRECTION_REASONS, EXCEPTION_CODES, FLAG_CODES, RECORD_TYPES, ROAD_STOP_REASONS,
  SEGMENT_CHIPS, TTN_FIELDS } from './types';

describe('domain enumerations (§7.2)', () => {
  it('declares the 19 record types of §7.2 in order', () => {
    expect(RECORD_TYPES).toHaveLength(19);
    expect(RECORD_TYPES[0]).toBe('SHIFT_START');
    expect(RECORD_TYPES.at(-1)).toBe('VOID');
  });
  it('declares seven artefacts, eight road reasons, eleven segment chips, thirteen ТТН fields', () => {
    expect([ARTEFACT_KINDS.length, ROAD_STOP_REASONS.length, SEGMENT_CHIPS.length, TTN_FIELDS.length]).toEqual([7, 8, 11, 13]);
  });
  it('keeps every enumeration free of duplicates', () => {
    for (const list of [RECORD_TYPES, ARTEFACT_KINDS, EXCEPTION_CODES, FLAG_CODES, CORRECTION_REASONS]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
  it('never makes CLOCK_SUSPECT, GNSS_SUSPECT or NO_CONTACT an item (§7.3)', () => {
    expect(EXCEPTION_CODES).not.toContain('CLOCK_SUSPECT');
    expect(EXCEPTION_CODES).not.toContain('GNSS_SUSPECT');
    expect(EXCEPTION_CODES).not.toContain('NO_CONTACT');
  });
});
