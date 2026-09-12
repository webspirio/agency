/**
 * Reading `page`/`limit` off the wire, clamped ONCE, with the CLAMPED values
 * returned — so the envelope never echoes a number the store did not use.
 *
 * Every case below is a measured defect of the lab's `pageQuery`, which did
 * `Number.parseInt(first, 10)` and returned it unclamped:
 *   limit:-1  returned rows and echoed -1
 *   page:NaN  serialised as `"page": null` on a field typed `number`
 *   '12abc'   became 12
 *   '0x10'    became 0
 */
import { describe, it, expect } from 'vitest';
import { pageQuery, DEFAULT_LIMIT, MAX_LIMIT } from './query';

const q = (query: Record<string, string | string[]>) => pageQuery(query);

describe('pageQuery parses strictly — the whole token, or the default', () => {
  it('reads a plain integer', () => {
    expect(q({ page: '2', limit: '5' })).toEqual({ page: 2, limit: 5 });
  });

  it('defaults an absent key rather than emitting NaN', () => {
    expect(q({})).toEqual({ page: 1, limit: DEFAULT_LIMIT });
  });

  it("refuses '12abc' — parseInt would have returned 12", () => {
    // A trailing-garbage token is not a number the client meant to send. The
    // lab's parseInt took the prefix and paged by it silently.
    expect(q({ page: '12abc' }).page).toBe(1);
  });

  it("refuses '0x10' — parseInt(…, 10) returned 0, which then clamped to 1", () => {
    expect(q({ limit: '0x10' }).limit).toBe(DEFAULT_LIMIT);
  });

  it('refuses a decimal, a sign and whitespace', () => {
    expect(q({ page: '1.5' }).page).toBe(1);
    expect(q({ page: '+2' }).page).toBe(1);
    expect(q({ page: ' 2' }).page).toBe(1);
    expect(q({ page: '2 ' }).page).toBe(1);
  });

  it('refuses NaN and Infinity as words, which never reach a number', () => {
    expect(q({ page: 'NaN' }).page).toBe(1);
    expect(q({ limit: 'Infinity' }).limit).toBe(DEFAULT_LIMIT);
  });

  it('takes the first value of a repeated key, as express@5 delivers it', () => {
    expect(q({ page: ['3', '9'] }).page).toBe(3);
  });
});

describe('pageQuery CLAMPS, and returns what it clamped to', () => {
  it("refuses a negative limit — the lab's returned rows AND echoed -1", () => {
    // The echo is the half that matters: a client renders `limit` from the
    // envelope, so an unclamped echo is a number on screen the store never used.
    expect(q({ limit: '-1' })).toEqual({ page: 1, limit: DEFAULT_LIMIT });
  });

  it('clamps page 0 up to 1, because pages are 1-based on this wire', () => {
    expect(q({ page: '0' }).page).toBe(1);
  });

  it('clamps a limit above the ceiling rather than serving the whole table', () => {
    expect(q({ limit: '9999' }).limit).toBe(MAX_LIMIT);
  });

  it('clamps a limit of 0 up to 1 rather than returning an empty page forever', () => {
    expect(q({ limit: '0' }).limit).toBe(1);
  });

  it('never returns a value outside the contract, for any input', () => {
    for (const raw of ['-5', '0', '1', '20', '100', '101', '99999', 'x', '', '1e3']) {
      const { page, limit } = q({ page: raw, limit: raw });
      expect(Number.isSafeInteger(page)).toBe(true);
      expect(Number.isSafeInteger(limit)).toBe(true);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(limit).toBeGreaterThanOrEqual(1);
      expect(limit).toBeLessThanOrEqual(MAX_LIMIT);
    }
  });

  it('survives a value long enough to overflow, without emitting Infinity', () => {
    const { limit } = q({ limit: '9'.repeat(400) });
    expect(Number.isSafeInteger(limit)).toBe(true);
    expect(limit).toBe(MAX_LIMIT);
  });
});
