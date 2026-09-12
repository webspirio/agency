import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import axios, { type AxiosInstance } from 'axios';
import { mockAdapter, toRoutesOf } from './wire.golden.helpers';
import { api } from './contract';

/**
 * THE WIRE GOLDEN. Every route driven once through the REAL adapter, reduced to
 * a structural fingerprint, and diffed against a committed fixture.
 *
 * This is SPEC 10's `numbers:frozen` applied to SHAPES instead of numbers, and
 * it is the only mechanism in this mock that catches a renamed or RE-CASED wire
 * field: `created_at` -> `createdAt` typechecks perfectly on both sides if both
 * sides are renamed together, and every type-level mechanism here is blind to
 * it. The golden is not.
 *
 * Four things it does that the contract lab's version did not:
 *   - it is generated FROM the operation table, so a new operation with no
 *     golden entry is red rather than silently uncovered — writes included;
 *   - it folds EVERY array element into the fingerprint, not element [0], so a
 *     heterogeneous list cannot hide its odd row;
 *   - it is driven against a seeded store, so a list can never fingerprint as
 *     `[]` and pass by being empty;
 *   - it emits VALUE-DOMAIN tokens (`balance:dec2`, `created_at:instant`) rather
 *     than a bare `typeof`, so a decimal string that becomes a number, or an
 *     instant that becomes a date, is a diff instead of `string` either way.
 *
 * Regenerate deliberately:  AGENCY_GOLDEN=write pnpm --filter <slug> test
 */
const HERE = import.meta.dirname;
const GOLDEN_PATH = `${HERE}/wire.golden.json`;
const WRITING = process.env.AGENCY_GOLDEN === 'write';

const ACTOR = { id: 'demo-user', role: 'owner' };
/** Pinned, so the fingerprint is about the shape and never about the clock. */
const NOW = () => '2026-09-12T10:00:00.000Z';

function client(): AxiosInstance {
  return axios.create({
    baseURL: 'http://mock',
    paramsSerializer: { indexes: null },
    adapter: mockAdapter(toRoutesOf(), { caps: new Set<string>(), actor: ACTOR, now: NOW }),
  });
}

/**
 * One drive per operation. Each gets a FRESH client, so a write in one does not
 * move the rows another one fingerprints — the ordering dependence that made the
 * contract lab's suite green only in declaration order.
 */
const DRIVES: { key: keyof typeof api; run: (c: AxiosInstance) => Promise<unknown> }[] = [
  { key: 'overview', run: (c) => c.get('/overview').then((r) => r.data) },
  { key: 'listParties', run: (c) => c.get('/parties', { params: { page: '1', limit: '3' } }).then((r) => r.data) },
  { key: 'getParty', run: (c) => c.get('/parties/party-000001').then((r) => r.data) },
  {
    key: 'createParty',
    run: (c) =>
      c
        .post('/parties', {
          name: 'Neu Angelegt',
          company: 'Neu GmbH',
          address: 'Hauptstrasse 1, Fulda',
          balance: '10.00',
        })
        .then((r) => r.data),
  },
  {
    key: 'renameParty',
    run: (c) => c.patch('/parties/party-000001', { name: 'Umbenannt' }).then((r) => r.data),
  },
  { key: 'removeParty', run: (c) => c.delete('/parties/party-000002').then((r) => r.data) },
];

describe('the wire golden pins the shape every screen will receive', () => {
  it('covers EVERY declared operation — a new one with no drive is red here', () => {
    // Without this, adding an operation silently adds an uncovered route and the
    // golden goes on passing about the ones it already knew.
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(DRIVES.map((d) => String(d.key)).sort(byName)).toEqual(Object.keys(api).sort(byName));
  });

  it('emits the committed wire shape for every route', async () => {
    const seen: Record<string, string[]> = {};
    for (const drive of DRIVES) {
      seen[drive.key] = shapeOf(await drive.run(client()));
    }

    if (WRITING) {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(seen, null, 2)}\n`);
      return;
    }

    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, string[]>;
    expect(seen).toEqual(golden);
  });

  it('would notice a re-cased wire field, which no type here can', () => {
    // `created_at` -> `createdAt` typechecks perfectly if both sides are renamed
    // together. This is the only mechanism that sees the WIRE change.
    expect(shapeOf({ created_at: '2026-09-12T10:00:00.000Z' })).toEqual(['{created_at:instant}']);
    expect(shapeOf({ createdAt: '2026-09-12T10:00:00.000Z' })).not.toEqual(['{created_at:instant}']);
  });

  it('distinguishes a decimal string from a number, which `typeof` does not', () => {
    expect(shapeOf({ balance: '12.00' })).toEqual(['{balance:dec2}']);
    expect(shapeOf({ balance: 12 })).toEqual(['{balance:number}']);
  });

  it('folds EVERY element of an array, so an odd row cannot hide behind [0]', () => {
    const mixed = shapeOf([{ a: '1.00' }, { a: 1 }]);
    expect(mixed).toEqual(['[]{a:dec2}|{a:number}']);
  });

  it('says an empty list is empty, rather than fingerprinting as a shape', () => {
    expect(shapeOf([])).toEqual(['[]empty']);
  });
});

const DEC2 = /^-?\d+\.\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEQ_ID = /^[a-z][a-z0-9-]*-\d{6}$/;

/** The value DOMAIN, not its `typeof`. A decimal that becomes a float, or an
 *  instant that becomes a date, is a different token and therefore a diff. */
function tokenOf(value: string): string {
  if (DEC2.test(value)) return 'dec2';
  if (INSTANT.test(value)) return 'instant';
  if (BUSINESS_DATE.test(value)) return 'date';
  if (SEQ_ID.test(value)) return 'seq-id';
  return 'string';
}

/** A structural fingerprint: key names and value DOMAINS, recursively, sorted. */
function shapeOf(value: unknown): string[] {
  return [fingerprint(value)].flat();
}

function fingerprint(value: unknown): string {
  if (value === null) return 'null';
  if (value === '') return 'empty-body';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]empty';
    // EVERY element, deduped and ordered — not element [0].
    const variants = [...new Set(value.map((v) => fingerprint(v)))].sort((a, b) => a.localeCompare(b));
    return `[]${variants.join('|')}`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}:${fingerprint(v)}`)
      .sort((a, b) => a.localeCompare(b));
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'string') return tokenOf(value);
  return typeof value;
}
