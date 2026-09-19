// mocks/driver-report/src/app/records.ts
/** What the phone sends (§7.2, §7.4 ops 5–6): the record's key and receipt number, and the wire bodies a flow or the
 *  stage runner builds from what the driver did. Pure: no clock, no server — the caller mints `seq` (EC-137) and passes
 *  every instant, so a record built at the first tap keeps that moment however late it leaves the phone (D11).
 *
 *  An absent optional field is OMITTED, never sent as null: the contract's body shapes declare them `s.opt(...)`, and a
 *  null there is a value the product's ValidationPipe would refuse. */
import type { PageIn, RecordIn } from '../domain/dto';
import type { ArtefactKind, Deferred, Gps, Instant, Payloads, RecordType } from '../domain/types';

/** A page as the capture step holds it, before it becomes a wire body. `drawn` is the scripted artefact the stage
 *  shows instead of a camera frame (D4); `image` is a real downscaled frame (in-page camera only). */
export type CapturedPage = { artefact: ArtefactKind; doc_index: number; page_no: number; captured_at: Instant;
  source: 'DRAWN' | 'INPAGE' | 'NATIVE'; bytes: number; quality: 'OK' | 'LOW'; quality_reasons: string[];
  deferred: Deferred | null; drawn: { variant: string; value: string | null; sim_read: string | null } | null;
  image: string | null };

/** The size a drawn page claims (the phone's «фото N з M» and the office's provenance line read it). */
export const MOCK_BYTES: Record<ArtefactKind, number> = { TTN_FRONT: 700000, TTN_BACK: 700000, TTN_SIGNED: 700000,
  ACT: 700000, RECEIPT: 300000, CLUSTER: 200000, WEIGH_TICKET: 300000 };

/** 'device-000001:417' — the idempotency key of a record (EC-121, EC-137). */
export const recordKey = (deviceId: string, seq: number): string => `${deviceId}:${seq}`;
/** 'device-000001:419:p4' — the n-th page (1-based) of a record. */
export const pageKey = (recordKeyOf: string, n: number): string => `${recordKeyOf}:p${n}`;
/** '№0419' — the receipt number the driver reads on the ReceiptCard. */
export const receiptNo = (seq: number): string => `№${String(seq).padStart(4, '0')}`;

export type RecordCommon = { deviceId: string; seq: number; occurredAt: Instant; committedAt: Instant;
  appClockAt?: Instant; stopId?: string | null; placeId?: string | null; gps?: Gps };

/** One record body. `app_clock_at` defaults to the commit moment and `gps` to 'OK'; `stop_id` / `place_id` appear only
 *  when the caller names one. */
export function buildRecord<T extends RecordType>(c: RecordCommon, type: T, payload: Payloads[T]): RecordIn {
  const record = {
    key: recordKey(c.deviceId, c.seq),
    seq: c.seq,
    type,
    occurred_at: c.occurredAt,
    committed_at: c.committedAt,
    app_clock_at: c.appClockAt ?? c.committedAt,
    ...(c.stopId === undefined || c.stopId === null ? {} : { stop_id: c.stopId }),
    ...(c.placeId === undefined || c.placeId === null ? {} : { place_id: c.placeId }),
    gps: c.gps ?? 'OK',
    payload,
  };
  // The union member is chosen by `type`; TypeScript cannot correlate a generic `T` with the mapped union by itself.
  return record as RecordIn;
}

/** The pages of one record, keyed `<record>:p1 … :pN` in capture order. */
export function buildPages(recordKeyOf: string, pages: CapturedPage[]): PageIn[] {
  return pages.map((p, i) => ({
    key: pageKey(recordKeyOf, i + 1),
    record_key: recordKeyOf,
    artefact: p.artefact,
    doc_index: p.doc_index,
    page_no: p.page_no,
    captured_at: p.captured_at,
    source: p.source,
    bytes: p.bytes,
    quality: p.quality,
    quality_reasons: [...p.quality_reasons],
    ...(p.deferred === null ? {} : { deferred: p.deferred }),
    ...(p.drawn === null ? {} : { drawn_variant: p.drawn.variant }),
    ...(p.drawn === null || p.drawn.value === null ? {} : { drawn_value: p.drawn.value }),
    ...(p.drawn === null || p.drawn.sim_read === null ? {} : { drawn_sim_read: p.drawn.sim_read }),
    ...(p.image === null ? {} : { image: p.image }),
  }));
}
