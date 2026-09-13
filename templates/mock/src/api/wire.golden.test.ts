import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import axios, { type AxiosInstance } from 'axios';
import { byCodepoint } from '@agency/mock';
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
  /* No screen reaches this one — its entry carries an `unreached` reason — and the
     golden drives it anyway. That is the point: the golden pins what the WIRE
     carries for every DECLARED operation, and an endpoint modelled ahead of its
     screen is exactly the case where nothing else would look at it. */
  { key: 'exportParties', run: (c) => c.get('/parties/export').then((r) => r.data) },
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

/**
 * ONE DRIVE PER DECLARED (operation, code) PAIR.
 *
 * This is the half that makes the golden an INSTRUMENT rather than a record. No
 * type-level scheme in this repo survives a cast or a subtype-reduced branch — both
 * residuals are written down as live types in `drift.controls.ts` — so the only thing
 * that can establish what a refusal actually puts on the wire is driving it and
 * looking.
 */
const REFUSALS: { key: keyof typeof api; code: string; run: (c: AxiosInstance) => Promise<unknown> }[] = [
  {
    key: 'getParty',
    code: 'PARTY_NOT_FOUND',
    run: (c) => c.get('/parties/party-999999').then(() => null, (e: unknown) => e),
  },
  {
    key: 'createParty',
    code: 'PARTY_NAME_TAKEN',
    run: async (c) => {
      const { name } = await someParty(c);
      return c
        .post('/parties', { name, company: 'x', address: 'y', balance: '1.00' })
        .then(() => null, (e: unknown) => e);
    },
  },
  {
    key: 'createParty',
    code: 'PARTY_NAME_BLANK',
    run: (c) =>
      c
        .post('/parties', { name: '  ', company: 'x', address: 'y', balance: '1.00' })
        .then(() => null, (e: unknown) => e),
  },
  {
    key: 'createParty',
    code: 'PARTY_BALANCE_INVALID',
    run: (c) =>
      c
        .post('/parties', { name: 'Ganz Neu', company: 'x', address: 'y', balance: '1.5' })
        .then(() => null, (e: unknown) => e),
  },
  {
    key: 'renameParty',
    code: 'PARTY_NOT_FOUND',
    run: (c) => c.patch('/parties/party-999999', { name: 'X' }).then(() => null, (e: unknown) => e),
  },
  {
    key: 'renameParty',
    code: 'PARTY_NAME_TAKEN',
    run: async (c) => {
      const [first, second] = await twoParties(c);
      return c
        .patch(`/parties/${first.id}`, { name: second.name })
        .then(() => null, (e: unknown) => e);
    },
  },
  {
    key: 'renameParty',
    code: 'PARTY_NAME_BLANK',
    run: async (c) => {
      const { id } = await someParty(c);
      return c.patch(`/parties/${id}`, { name: '  ' }).then(() => null, (e: unknown) => e);
    },
  },
  {
    key: 'removeParty',
    code: 'PARTY_NOT_FOUND',
    run: (c) => c.delete('/parties/party-999999').then(() => null, (e: unknown) => e),
  },
];

/**
 * The rows come from the STORE, never from a literal.
 *
 * The seed's names are synthesised by `@agency/synth`, so a drive that hard-codes one
 * is a drive that stops refusing the day the seed changes — measured: the first
 * version of this table guessed a name and `createParty.PARTY_NAME_TAKEN` RESOLVED,
 * proving nothing while looking like coverage. The ids matter for the same reason
 * twice over: `party-000001` is what this mock's `seq()` assigns and the product
 * assigns UUIDs, so a golden that hard-codes it cannot be replayed against a live API.
 */
type Row = { id: string; name: string };

async function twoParties(c: AxiosInstance): Promise<[Row, Row]> {
  const page = await c.get('/parties', { params: { limit: '99' } });
  const rows = (page.data as { data: Row[] }).data;
  const [first, second] = rows;
  if (!first || !second) {
    throw new Error('the seed must carry at least two rows for the refusal drives to chain');
  }
  return [first, second];
}

const someParty = async (c: AxiosInstance): Promise<Row> => (await twoParties(c))[0];

/** The declared pairs, read off the registry OBJECT at runtime. */
const declaredPairs = (): string[] => {
  const out: string[] = [];
  const table = api as unknown as Record<string, { codes: Record<string, number> }>;
  for (const key of Object.keys(table)) {
    for (const code of Object.keys(table[key]!.codes)) out.push(`${key}.${code}`);
  }
  return out;
};

describe('the wire golden pins the shape every screen will receive', () => {
  it('covers EVERY declared operation — a new one with no drive is red here', () => {
    // Without this, adding an operation silently adds an uncovered route and the
    // golden goes on passing about the ones it already knew.
    /* byCodepoint, never localeCompare: ICU collation is a property of the machine
       node was built on, so a golden that sorts with it can differ between a laptop
       and CI for reasons unrelated to the code. */
    expect(DRIVES.map((d) => String(d.key)).sort(byCodepoint)).toEqual(
      Object.keys(api).sort(byCodepoint),
    );
  });

  it('drives EVERY declared (operation, code) pair — the loop runs at RUNTIME', () => {
    /* AT RUNTIME, over Object.keys, and that is the point. A mapped type would name a
       missing pair earlier, but a cast in the table evades it — and a cast is exactly
       the residual no type-level scheme here survives. Object.keys reads the registry
       object that actually ships. */
    const driven = REFUSALS.map((r) => `${String(r.key)}.${r.code}`);
    expect([...driven].sort(byCodepoint)).toEqual([...declaredPairs()].sort(byCodepoint));
  });

  /**
   * NARROW, deliberately, and its limit is written down: the status half CANNOT fail
   * while every refusal goes through `fail()`, because `fail()` reads the status off
   * the same registry entry this reads. What it does catch is a handler that bypasses
   * `fail()` and throws a hand-typed `DomainError`, and a drive whose operation
   * answers a DIFFERENT code than the table claims. The committed golden above is what
   * catches a changed status.
   */
  it('refuses through fail(), with the code the table names', async () => {
    const table = api as unknown as Record<string, { codes: Record<string, number> }>;
    for (const refusal of REFUSALS) {
      const pair = `${String(refusal.key)}.${refusal.code}`;
      const err = (await refusal.run(client())) as
        | { response?: { status?: number; data?: { code?: string } } }
        | null;
      const declared = table[String(refusal.key)]!.codes[refusal.code];
      /* `null` means the drive RESOLVED — the request the table calls a refusal was
         answered as a success. Naming the pair matters more than the assertion that
         follows: a drive that does not refuse is a drive that proves nothing. */
      expect({ pair, refused: err !== null }).toEqual({ pair, refused: true });
      expect({ pair, status: err?.response?.status, code: err?.response?.data?.code }).toEqual({
        pair,
        status: declared,
        code: refusal.code,
      });
    }
  });

  it('emits the committed wire shape for every route AND every refusal', async () => {
    const seen: Record<string, string[]> = {};
    for (const drive of DRIVES) {
      seen[drive.key] = shapeOf(await drive.run(client()));
    }
    /* The ENVELOPE is pinned the way every success response already is. Without this
       the refusal drives assert a (status, code) pair and nothing at all about the
       shape around it — and the envelope is what a screen renders when `codeOf`
       returns undefined. */
    const refusals: Record<string, string[]> = {};
    for (const refusal of REFUSALS) {
      const err = (await refusal.run(client())) as
        | { response?: { status?: number; data?: unknown } }
        | null;
      /* THE STATUS IS IN THE FINGERPRINT, and that is not decoration.
         MEASURED while writing this: asserting `err.response.status` against
         `api[key].codes[code]` CANNOT FAIL — fail() derives the wire status from that
         same registry entry, so both sides move together and the assertion is
         `dec === dec` one more time. Only a COMMITTED artifact can catch a changed
         status, because only it does not move when the registry does. */
      refusals[`${String(refusal.key)}.${refusal.code}`] = [
        `${err?.response?.status ?? 'RESOLVED'}`,
        ...shapeOf(err?.response?.data),
      ];
    }

    if (WRITING) {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify({ ...seen, refusals }, null, 2)}\n`);
      return;
    }

    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, unknown>;
    expect({ ...seen, refusals }).toEqual(golden);
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
    /* EVERY element, deduped and ordered — not element [0]. Ordered by CODE POINT:
       this ordering goes into the COMMITTED golden, so sorting it with ICU collation
       would make the fixture itself depend on the ICU build node was compiled with. */
    const variants = [...new Set(value.map((v) => fingerprint(v)))].sort(byCodepoint);
    return `[]${variants.join('|')}`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}:${fingerprint(v)}`)
      .sort(byCodepoint);
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'string') return tokenOf(value);
  return typeof value;
}
