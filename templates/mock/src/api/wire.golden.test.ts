import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import axios, { type AxiosInstance } from 'axios';
import { byCodepoint, transport, type Transport } from '@agency/mock';
import { mockAdapter, toRoutesOf } from './wire.golden.helpers';
import { api, call } from './contract';

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

/** The opaque page-side view of a fresh client — what `call()` takes. */
const wired = (): Transport => transport(client());

function client(): AxiosInstance {
  return axios.create({
    baseURL: 'http://mock',
    paramsSerializer: { indexes: null },
    adapter: mockAdapter(toRoutesOf(), { caps: new Set<string>(), actor: ACTOR, now: NOW }),
  });
}

type Ids = { seeded: string; removable: string };

/**
 * The ids come from the STORE, never from a literal.
 *
 * `party-000001` is what this mock's `seq()` assigns; the product assigns UUIDs, so a
 * golden that hard-codes the sequence id cannot be replayed against a live API — which
 * is exactly what an `AGENCY_LIVE_API` replay needs, and why this is worth doing before
 * one exists.
 */
async function idsFrom(t: Transport): Promise<Ids> {
  const page = await call(t, 'listParties', { params: {}, body: undefined, qry: { limit: '99' } });
  const [first, second] = page.data;
  if (!first || !second) {
    throw new Error('the seed must carry at least two rows for the golden to chain');
  }
  return { seeded: first.id, removable: second.id };
}

/**
 * One drive per operation, each through `call()` with a typed operation KEY — never a
 * hand-written URL. A raw verb here would be a second copy of the path, which is the
 * thing the contract exists to remove, and the golden is the last place one could hide.
 * Each gets a FRESH client, so a write in one does not move the rows another
 * fingerprints — the ordering dependence that made the contract lab's suite green in
 * declaration order only.
 */
const DRIVES: { key: keyof typeof api; run: (t: Transport, ids: Ids) => Promise<unknown> }[] = [
  { key: 'overview', run: (t) => call(t, 'overview', { params: {}, body: undefined }) },
  {
    key: 'listParties',
    run: (t) =>
      call(t, 'listParties', { params: {}, body: undefined, qry: { page: '1', limit: '3' } }),
  },
  /* No screen reaches this one — its entry carries an `unreached` reason — and the
     golden drives it anyway. That is the point: the golden pins what the WIRE carries
     for every DECLARED operation, and an endpoint modelled ahead of its screen is
     exactly the case where nothing else would look at it. */
  { key: 'exportParties', run: (t) => call(t, 'exportParties', { params: {}, body: undefined }) },
  {
    key: 'getParty',
    run: (t, ids) => call(t, 'getParty', { params: { id: ids.seeded }, body: undefined }),
  },
  {
    key: 'createParty',
    run: (t) =>
      call(t, 'createParty', {
        params: {},
        body: {
          name: 'Neu Angelegt',
          company: 'Neu GmbH',
          address: 'Hauptstrasse 1, Fulda',
          balance: '10.00',
        },
      }),
  },
  {
    key: 'renameParty',
    run: (t, ids) =>
      call(t, 'renameParty', { params: { id: ids.seeded }, body: { name: 'Umbenannt' } }),
  },
  {
    key: 'removeParty',
    run: (t, ids) => call(t, 'removeParty', { params: { id: ids.removable }, body: undefined }),
  },
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

/**
 * MALFORMED BODIES, which are NOT refusals.
 *
 * A validation failure declares no `code` — the product's ValidationPipe produces one
 * and `AllExceptionsFilter` puts it on the wire as a 400 with `message: string[]` and
 * nothing else — so it forms no (operation, code) pair and the exhaustiveness loop
 * above must keep passing without it. Putting these in REFUSALS would make that loop
 * demand a code that does not exist, which is the tell that they belong apart.
 *
 * MEASURED 2026-09-13, before `shape()`: `{}` answered 500 `Internal server error`,
 * and a forged `id` was accepted with 201 and silently ignored.
 */
const MALFORMED: { name: string; run: (c: AxiosInstance) => Promise<unknown> }[] = [
  {
    name: 'createParty.emptyBody',
    run: (c) => c.post('/parties', {}).then(() => null, (e: unknown) => e),
  },
  {
    name: 'createParty.forgedId',
    run: (c) =>
      c
        .post('/parties', {
          id: 'party-999999',
          created_at: '1999-01-01T00:00:00.000Z',
          name: 'Forged',
          company: 'x',
          address: 'y',
          balance: '1.00',
        })
        .then(() => null, (e: unknown) => e),
  },
  {
    name: 'renameParty.wrongType',
    run: (c) => c.patch('/parties/party-000001', { name: 4 }).then(() => null, (e: unknown) => e),
  },
];

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

  it('drives every operation through call(), never a hand-written URL', () => {
    /* A raw verb in a drive is a SECOND COPY of the path — the thing the contract
       exists to remove — and the golden is the last place one could hide, because it
       is the one file that legitimately talks to the wire. The REFUSALS table keeps
       its raw verbs deliberately: a refusal has no typed call-site equivalent that
       also captures the rejection. */
    const source = readFileSync(`${HERE}/wire.golden.test.ts`, 'utf8');
    const drives = source.slice(source.indexOf('const DRIVES'), source.indexOf('const REFUSALS'));
    expect(drives).not.toMatch(/\.(get|post|patch|put|delete)\(/);
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

  it('emits the committed wire shape for every route, refusal and malformed body', async () => {
    const seen: Record<string, string[]> = {};
    for (const drive of DRIVES) {
      const t = wired();
      seen[drive.key] = shapeOf(await drive.run(t, await idsFrom(t)));
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

    const malformed: Record<string, string[]> = {};
    for (const bad of MALFORMED) {
      const err = (await bad.run(client())) as
        | { response?: { status?: number; data?: unknown } }
        | null;
      malformed[bad.name] = [`${err?.response?.status ?? 'RESOLVED'}`, ...shapeOf(err?.response?.data)];
    }

    if (WRITING) {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify({ ...seen, refusals, malformed }, null, 2)}\n`);
      return;
    }

    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, unknown>;
    expect({ ...seen, refusals, malformed }).toEqual(golden);
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

/* ── THE LIVE REPLAY ────────────────────────────────────────────────────── *
 *
 * SPEC 15 promises "exactly one migration mechanism". This is it, and it is the
 * reason the drives read their ids from the store rather than from `party-000001`:
 * the product assigns UUIDs, so a golden that hard-codes a sequence id cannot be
 * replayed at all.
 *
 *   AGENCY_LIVE_API=https://api.example.com pnpm --filter <slug> test
 *
 * SKIPPED when unset, through vitest's own `describe.skipIf` — so the suite REPORTS
 * skipped rather than passing vacuously. `if (!LIVE) return` would report a pass,
 * which is the status collapse this whole layer exists to prevent.
 */
const LIVE = process.env.AGENCY_LIVE_API;

/**
 * ONE ENTRY, and it should stay that way. `seq-id` and `uuid` are the same THING — a
 * store-assigned identifier — fingerprinted differently because this mock's allocator
 * is a sequence and the product's is a UUID. Every other token must match exactly: a
 * second entry here would mean the wire has genuinely diverged, and that is the
 * finding rather than something to configure away.
 */
const EQUIVALENT: Readonly<Record<string, readonly string[]>> = { 'seq-id': ['uuid'] };

/** Is the live token an accepted stand-in for the committed one? */
const equivalent = (committed: string, live: string): boolean =>
  committed === live || (EQUIVALENT[committed]?.includes(live) ?? false);

/** Compare two fingerprints token by token, allowing only the declared equivalences. */
export function fingerprintsAgree(committed: string, live: string): boolean {
  const a = committed.split(/([{},:[\]|])/);
  const b = live.split(/([{},:[\]|])/);
  if (a.length !== b.length) return false;
  return a.every((token, i) => equivalent(token, b[i] ?? ''));
}

/* The equivalence logic runs in every suite, LIVE or not — otherwise the only code
   path that decides whether a replay passed would itself be unexercised in every run
   this repository can perform. */
describe('the replay allows exactly one equivalence and no more', () => {
  const PARTY = '{balance:dec2,created_at:instant,id:seq-id,name:string}';

  it('accepts a uuid where the mock committed a seq-id', () => {
    expect(fingerprintsAgree(PARTY, PARTY.replace('seq-id', 'uuid'))).toBe(true);
  });

  it('refuses any OTHER substitution, however plausible', () => {
    expect(fingerprintsAgree(PARTY, PARTY.replace('dec2', 'number'))).toBe(false);
    expect(fingerprintsAgree(PARTY, PARTY.replace('instant', 'string'))).toBe(false);
    expect(fingerprintsAgree(PARTY, PARTY.replace('created_at', 'createdAt'))).toBe(false);
  });

  it('refuses a uuid where the mock did NOT commit a seq-id — the map is one-way', () => {
    expect(fingerprintsAgree(PARTY.replace('name:string', 'name:uuid'), PARTY)).toBe(false);
  });

  it('refuses a shape with a different number of tokens', () => {
    expect(fingerprintsAgree(PARTY, PARTY.replace(',name:string', ''))).toBe(false);
  });

  it('accepts an identical fingerprint', () => {
    expect(fingerprintsAgree(PARTY, PARTY)).toBe(true);
  });
});

describe.skipIf(LIVE === undefined)('the golden replays against a live API', () => {
  it('answers every drive with the committed shape, modulo the id allocator', async () => {
    const live = transport(
      axios.create({ baseURL: LIVE, paramsSerializer: { indexes: null } }),
    );
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, string[]>;
    const ids = await idsFrom(live);

    for (const drive of DRIVES) {
      const seen = shapeOf(await drive.run(live, ids));
      const committed = golden[drive.key] ?? [];
      expect({ key: drive.key, agree: seen.length === committed.length }).toEqual({
        key: drive.key,
        agree: true,
      });
      seen.forEach((token, i) => {
        expect({ key: drive.key, i, agree: fingerprintsAgree(committed[i] ?? '', token) }).toEqual({
          key: drive.key,
          i,
          agree: true,
        });
      });
    }
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
