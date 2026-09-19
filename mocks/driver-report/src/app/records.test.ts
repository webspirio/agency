// mocks/driver-report/src/app/records.test.ts
import { describe, expect, it } from 'vitest';
import { demo } from '../domain/clock';
import { buildPages, buildRecord, pageKey, receiptNo, recordKey } from './records';

describe('records the phone builds (§3.3 D-06, §7.2)', () => {
  it('keys a record by device and seq and numbers the receipt', () => {
    expect([recordKey('device-000001', 419), pageKey('device-000001:419', 4), receiptNo(419), receiptNo(1)])
      .toEqual(['device-000001:419', 'device-000001:419:p4', '№0419', '№0001']);
  });
  it('omits absent optional fields rather than sending null', () => {
    const r = buildRecord({ deviceId: 'device-000001', seq: 425, occurredAt: demo('12:30'), committedAt: demo('12:30'), stopId: null },
      'ROAD_STOP', { reason: 'ALERT', can_drive: null });
    expect(r).toEqual({ key: 'device-000001:425', seq: 425, type: 'ROAD_STOP', occurred_at: demo('12:30'), committed_at: demo('12:30'),
      app_clock_at: demo('12:30'), gps: 'OK', payload: { reason: 'ALERT', can_drive: null } });
    const [p] = buildPages('device-000001:419', [{ artefact: 'TTN_BACK', doc_index: 2, page_no: 2, captured_at: demo('08:39'), source: 'DRAWN',
      bytes: 700000, quality: 'OK', quality_reasons: [], deferred: null, drawn: { variant: 'ttn-004518-back:soft', value: null, sim_read: null }, image: null }]);
    expect(p).toEqual({ key: 'device-000001:419:p1', record_key: 'device-000001:419', artefact: 'TTN_BACK', doc_index: 2, page_no: 2,
      captured_at: demo('08:39'), source: 'DRAWN', bytes: 700000, quality: 'OK', quality_reasons: [], drawn_variant: 'ttn-004518-back:soft' });
  });
});
