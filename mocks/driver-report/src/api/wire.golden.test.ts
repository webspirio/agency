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

/**
 * BOTH CAPABILITIES, and that is deliberate rather than lazy.
 *
 * Every operation in this contract declares a real one — `['driver']` on the write
 * the phone performs, `['dispatcher']` on the office's — so an EMPTY set makes the
 * adapter 404 before any handler runs and every drive below fingerprints a 404
 * instead of a response. This golden's job is to pin what the wire carries for
 * every DECLARED operation, which it cannot do from behind a gate it also has to
 * open. The GATE itself is asserted where it lives: `adapter.test.ts` proves an
 * ungranted cap is a 404, and the router proves a profile cannot reach the other
 * product's screens. Nothing here is evidence about either.
 */
function client(): AxiosInstance {
  return axios.create({
    baseURL: 'http://mock',
    paramsSerializer: { indexes: null },
    adapter: mockAdapter(toRoutesOf(), {
      caps: new Set<string>(['driver', 'dispatcher']),
      actor: ACTOR,
      now: NOW,
    }),
  });
}

type Ids = { seeded: string; unconfirmed: string; truck: string };

/**
 * The ids come from the STORE, never from a literal.
 *
 * `event-000001` is what this mock's `seq()` assigns; the product assigns UUIDs, so a
 * golden that hard-codes the sequence id cannot be replayed against a live API — which
 * is exactly what an `AGENCY_LIVE_API` replay needs, and why this is worth doing before
 * one exists. `truck` is read off `/me` for the same reason twice over: the bound
 * driver's truck is a store-assigned id, and `submitEvent` refuses an unknown one.
 *
 * `unconfirmed` is chosen by FILTERING on `confirmed_at`, never by index. An index is
 * the implicit ordering HARD RULE 4 forbids, and it would also stop selecting the right
 * row the first time somebody adds a line to the seed table — at which point
 * `confirmEvent` would refuse with EVENT_ALREADY_CONFIRMED and this golden would
 * silently commit the fingerprint of an ERROR where a success belongs.
 */
async function idsFrom(t: Transport): Promise<Ids> {
  const page = await call(t, 'listEvents', { params: {}, body: undefined, qry: { limit: '99' } });
  const [first] = page.data;
  const open = page.data.find((row) => row.confirmed_at === null);
  if (!first || !open) {
    throw new Error('the seed must carry at least one event and one UNCONFIRMED event');
  }
  const me = await call(t, 'me', { params: {}, body: undefined });
  return { seeded: first.id, unconfirmed: open.id, truck: me.truck_id };
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
  { key: 'me', run: (t) => call(t, 'me', { params: {}, body: undefined }) },
  { key: 'overview', run: (t) => call(t, 'overview', { params: {}, body: undefined }) },
  {
    key: 'listEvents',
    /**
     * `limit: '99'`, NOT the template's `'3'`, and the difference was MEASURED.
     *
     * This golden's stated property is that it folds EVERY array element into the
     * fingerprint rather than element [0], "so a heterogeneous list cannot hide its
     * odd row". A page size smaller than the seed defeats exactly that: it hides the
     * odd row behind pagination instead of behind indexing, which looks identical in
     * the committed file and is just as blind. The template could carry `'3'` because
     * its parties are homogeneous — every row the same shape — so truncation cost it
     * nothing. These rows are not: a REFUEL carries `litres` and `amount_uah` as
     * decimal strings and every other event carries both as `null`.
     */
    run: (t) =>
      call(t, 'listEvents', { params: {}, body: undefined, qry: { page: '1', limit: '99' } }),
  },
  /**
   * The one write the phone performs, driven with the body a screen actually sends:
   * `odometer_km` as a STRING, because that is what an input carries and because
   * `invalidOdometer` — not the shape — is what refuses a non-number. A drive that
   * sent a number here would be fingerprinting a request no screen can make.
   *
   * `photo_kind: 'TTN'` is not decoration either: `photoMismatch` pairs LOADING with
   * TTN, so any other artefact turns this success drive into a refusal and commits
   * an error envelope where a row belongs.
   */
  {
    key: 'submitEvent',
    run: (t, ids) =>
      call(t, 'submitEvent', {
        params: {},
        body: {
          kind: 'LOADING',
          truck_id: ids.truck,
          odometer_km: '412400',
          odometer_source: 'DRIVER_CONFIRMED',
          photo_kind: 'TTN',
          place: 'Комбікормовий завод, Вільнянськ',
        },
      }),
  },
  {
    key: 'getEvent',
    run: (t, ids) => call(t, 'getEvent', { params: { id: ids.seeded }, body: undefined }),
  },
  /* An UNCONFIRMED row, chosen in `idsFrom` by filtering rather than by index — see
     there. The ТТН number is one the seed does not hold, so `duplicateTtn` stays
     quiet: a collision here would fingerprint a 409 and the golden would record a
     refusal as this operation's success shape. */
  {
    key: 'confirmEvent',
    run: (t, ids) =>
      call(t, 'confirmEvent', {
        params: { id: ids.unconfirmed },
        body: { ttn_number: '0099901' },
      }),
  },
  {
    key: 'listLegs',
    /**
     * `'99'` for the same reason as `listEvents`, and here it was not theoretical.
     *
     * MEASURED 2026-09-16: with `limit: '3'` the committed fingerprint carried two
     * leg variants and `l_100km:null` in BOTH of them, because the drive returned the
     * three NEWEST legs — two still open and one closed with no refuel on it — while
     * the only leg with a computed consumption rate sat on page two. So `l_100km`'s
     * wire domain was never pinned at all, and it is the field the client's stated
     * goal #3 is about: розхід пального. A drift from `dec2` to `number` there is the
     * precise failure this repository exists to prevent, and it would have been
     * invisible here while the golden went on passing about the rows it could see.
     */
    run: (t) => call(t, 'listLegs', { params: {}, body: undefined, qry: { page: '1', limit: '99' } }),
  },
  /* The export is driven here even though one screen already reaches it. That is the
     point of generating this table FROM the registry: the golden pins what the WIRE
     carries for every DECLARED operation, so an endpoint modelled ahead of its screen
     — which is exactly the case where nothing else would ever look at it — is covered
     the day it is declared rather than the day somebody renders it. */
  { key: 'exportWaybill', run: (t) => call(t, 'exportWaybill', { params: {}, body: undefined }) },
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
  /* `'412 400'` rather than `'abc'`, because the thin space is the input error a real
     driver makes — he copies the separator printed on the cluster — and `invalidOdometer`
     refuses it deliberately rather than guessing at what he meant. */
  {
    key: 'submitEvent',
    code: 'ODOMETER_INVALID',
    run: async (c) => {
      const truck_id = await boundTruck(c);
      return c
        .post('/events', {
          kind: 'LOADING', truck_id, odometer_km: '412 400',
          odometer_source: 'DRIVER_TYPED', photo_kind: 'TTN', place: 'Елеватор, Комишуваха',
        })
        .then(() => null, (e: unknown) => e);
    },
  },
  /* UNLOADING wants примірник 3 — the copy the consignee signed and stamped — so a
     plain TTN is the wrong artefact even though it is a photograph of a ТТН. The
     odometer must be VALID here: `invalidOdometer` runs first in the handler, so a
     malformed one would refuse with the other code and this pair would never be driven. */
  {
    key: 'submitEvent',
    code: 'PHOTO_WRONG_KIND',
    run: async (c) => {
      const truck_id = await boundTruck(c);
      return c
        .post('/events', {
          kind: 'UNLOADING', truck_id, odometer_km: '412400',
          odometer_source: 'DRIVER_CONFIRMED', photo_kind: 'TTN', place: 'Ферма, Пологи',
        })
        .then(() => null, (e: unknown) => e);
    },
  },
  /* Third in the handler's order, so both earlier rules must pass: a valid odometer
     AND an artefact that matches the kind. A drive that got either wrong would refuse
     with somebody else's code and the pair-and-code assertion below would name it. */
  {
    key: 'submitEvent',
    code: 'TRUCK_NOT_FOUND',
    run: (c) =>
      c
        .post('/events', {
          kind: 'LOADING', truck_id: 'truck-999999', odometer_km: '412400',
          odometer_source: 'DRIVER_CONFIRMED', photo_kind: 'TTN', place: 'Млин, Токмак',
        })
        .then(() => null, (e: unknown) => e),
  },
  {
    key: 'getEvent',
    code: 'EVENT_NOT_FOUND',
    run: (c) => c.get('/events/event-999999').then(() => null, (e: unknown) => e),
  },
  {
    key: 'confirmEvent',
    code: 'EVENT_NOT_FOUND',
    run: (c) =>
      c.patch('/events/event-999999', { ttn_number: '0099902' }).then(() => null, (e: unknown) => e),
  },
  /* A row the SEED already confirmed, selected by filtering on `confirmed_at` rather
     than by index — see `confirmedEvent` below. */
  {
    key: 'confirmEvent',
    code: 'EVENT_ALREADY_CONFIRMED',
    run: async (c) => {
      const { id } = await confirmedEvent(c);
      return c.patch(`/events/${id}`, { ttn_number: '0099903' }).then(() => null, (e: unknown) => e);
    },
  },
  /* Trimmed emptiness, which is the case a required-field check misses: `'   '` is a
     non-empty string and the shape passes it through. `alreadyConfirmed` runs first,
     so this needs an UNCONFIRMED row or it refuses with the other code. */
  {
    key: 'confirmEvent',
    code: 'TTN_BLANK',
    run: async (c) => {
      const { id } = await openEvent(c);
      return c.patch(`/events/${id}`, { ttn_number: '   ' }).then(() => null, (e: unknown) => e);
    },
  },
  {
    key: 'confirmEvent',
    code: 'TTN_DUPLICATE',
    run: async (c) => {
      const { id } = await openEvent(c);
      const taken = await takenTtn(c);
      return c.patch(`/events/${id}`, { ttn_number: taken }).then(() => null, (e: unknown) => e);
    },
  },
];

/**
 * The rows come from the STORE, never from a literal.
 *
 * MEASURED on the scaffold this file came from: the first version of that table
 * guessed a seeded value and `createParty.PARTY_NAME_TAKEN` RESOLVED — the drive the
 * table called a refusal was answered as a success, proving nothing while looking
 * exactly like coverage. The same trap is live here: `'0034512'` is a ТТН number
 * somebody typed into `seed.ts`, and a TTN_DUPLICATE drive that hard-codes it stops
 * colliding the day that table is edited. `takenTtn` reads one off the wire instead.
 *
 * The ids matter for the same reason twice over: `event-000001` is what this mock's
 * `seq()` assigns and the product assigns UUIDs, so a golden that hard-codes one
 * cannot be replayed against a live API.
 */
type EventRow = { id: string; ttn_number: string | null; confirmed_at: string | null };

async function listedEvents(c: AxiosInstance): Promise<EventRow[]> {
  const page = await c.get('/events', { params: { limit: '99' } });
  return (page.data as { data: EventRow[] }).data;
}

/** SELECTED BY PREDICATE, never by index — HARD RULE 4, and the practical half of it:
 *  an index stops naming the row it was chosen for the first time the seed grows a
 *  line, and the drive then refuses with a different code or none at all. */
async function openEvent(c: AxiosInstance): Promise<EventRow> {
  const row = (await listedEvents(c)).find((event) => event.confirmed_at === null);
  if (!row) throw new Error('the seed must carry an UNCONFIRMED event for the refusal drives');
  return row;
}

async function confirmedEvent(c: AxiosInstance): Promise<EventRow> {
  const row = (await listedEvents(c)).find((event) => event.confirmed_at !== null);
  if (!row) throw new Error('the seed must carry a CONFIRMED event for the refusal drives');
  return row;
}

/** A ТТН number the store already holds, so the collision is real rather than guessed. */
async function takenTtn(c: AxiosInstance): Promise<string> {
  const rows = await listedEvents(c);
  const ttn = rows.map((event) => event.ttn_number).find((n): n is string => n !== null);
  if (ttn === undefined) throw new Error('the seed must carry an event with a ТТН number');
  return ttn;
}

const someEvent = async (c: AxiosInstance): Promise<EventRow> => {
  const [first] = await listedEvents(c);
  if (!first) throw new Error('the seed must carry at least one event for the drives to chain');
  return first;
};

/** The bound driver's truck, store-assigned: `submitEvent` refuses an unknown one, so
 *  a literal here would turn every submit refusal drive into TRUCK_NOT_FOUND. */
async function boundTruck(c: AxiosInstance): Promise<string> {
  const me = await c.get('/me');
  return (me.data as { truck_id: string }).truck_id;
}

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
 *
 * `odometer_km` is `s.str()` in the contract's shape and that is load-bearing rather
 * than lax: anything stricter would intercept a malformed reading BEFORE the handler
 * and turn ODOMETER_INVALID into a declared code nothing could ever emit — which is
 * why the wrong-TYPE body below is driven at `confirmEvent`'s `ttn_number` and the
 * malformed ODOMETER is a REFUSAL, up in the table above, with a code of its own.
 */
const MALFORMED: { name: string; run: (c: AxiosInstance) => Promise<unknown> }[] = [
  {
    name: 'submitEvent.emptyBody',
    run: (c) => c.post('/events', {}).then(() => null, (e: unknown) => e),
  },
  /* `forbidNonWhitelisted: true` is the product's setting, and both forged keys are
     ones the driver's phone must never be able to name: the id is store-assigned
     (HARD RULE 4) and `occurred_at` is server-derived, because a timestamp a client
     can name is a timestamp a client can forge. */
  {
    name: 'submitEvent.forgedFields',
    run: async (c) => {
      const truck_id = await boundTruck(c);
      return c
        .post('/events', {
          id: 'event-999999',
          occurred_at: '1999-01-01T00:00:00.000Z',
          kind: 'LOADING',
          truck_id,
          odometer_km: '412400',
          odometer_source: 'DRIVER_CONFIRMED',
          photo_kind: 'TTN',
          place: 'Елеватор, Комишуваха',
        })
        .then(() => null, (e: unknown) => e);
    },
  },
  /* The OTHER shape declaration: nothing else in this table opens `bodies.confirmEvent`,
     so without this entry a mock author could delete it and only `submitEvent`'s
     rejection would still be pinned. Every OTHER field of both bodies is legal, so the
     400 can only be the one forbidden or mistyped key — a body wrong in two ways proves
     the shape rejected SOMETHING and nothing about which. */
  {
    name: 'confirmEvent.wrongType',
    run: async (c) => {
      const { id } = await someEvent(c);
      return c.patch(`/events/${id}`, { ttn_number: 4 }).then(() => null, (e: unknown) => e);
    },
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
  /* A synthetic fingerprint rather than one read from the committed file, and that is
     deliberate: this block tests the COMPARATOR, so pinning it to a real drive would
     make these five cases go red the day an unrelated handler gains a field. It carries
     one of each token on purpose — a substitution the map must refuse for each. */
  const EVENT = '{id:seq-id,litres:dec2,occurred_at:instant,place:string}';

  it('accepts a uuid where the mock committed a seq-id', () => {
    expect(fingerprintsAgree(EVENT, EVENT.replace('seq-id', 'uuid'))).toBe(true);
  });

  it('refuses any OTHER substitution, however plausible', () => {
    expect(fingerprintsAgree(EVENT, EVENT.replace('dec2', 'number'))).toBe(false);
    expect(fingerprintsAgree(EVENT, EVENT.replace('instant', 'string'))).toBe(false);
    expect(fingerprintsAgree(EVENT, EVENT.replace('occurred_at', 'occurredAt'))).toBe(false);
  });

  it('refuses a uuid where the mock did NOT commit a seq-id — the map is one-way', () => {
    expect(fingerprintsAgree(EVENT.replace('place:string', 'place:uuid'), EVENT)).toBe(false);
  });

  it('refuses a shape with a different number of tokens', () => {
    expect(fingerprintsAgree(EVENT, EVENT.replace(',place:string', ''))).toBe(false);
  });

  it('accepts an identical fingerprint', () => {
    expect(fingerprintsAgree(EVENT, EVENT)).toBe(true);
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
