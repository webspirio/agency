// mocks/driver-report/src/api/contract.test.ts
import { describe, expect, it } from 'vitest';
import { api } from './contract';

type Entry = { method: string; path: string; caps: readonly string[]; codes: Record<string, number> };
const table = api as unknown as Record<string, Entry>;

describe('the registry (§7.4, §7.5)', () => {
  it('declares exactly the 32 P0 operations in §7.4 order', () => {
    expect(Object.keys(api)).toEqual(['getBindPreview', 'confirmBinding', 'getToday', 'listNearbyPlaces', 'submitRecord',
      'uploadPhoto', 'sendHeartbeat', 'getMyDay', 'getMyMonth', 'getOfficeSummary', 'listFleet', 'listExceptions',
      'updateException', 'getStopReview', 'reviewStop', 'createRequest', 'createCorrection', 'listTruckDays', 'getTruckDay',
      'confirmTruckDay', 'printTruckDay', 'getKeyPoints', 'getExportPreview', 'createExport', 'importExport', 'listTrucks',
      'getTruckFuel', 'listOriginals', 'receiveOriginal', 'listWorktime', 'listDrivers', 'createBindCode']);
  });
  it('declares 14 codes in 21 (operation, code) pairs', () => {
    const pairs = Object.entries(table).flatMap(([k, e]) => Object.keys(e.codes).map((c) => `${k}.${c}`));
    expect(pairs).toHaveLength(21);
    expect(new Set(pairs.map((p) => p.split('.')[1])).size).toBe(14);
  });
  it('lets a driver meet only DEVICE_REVOKED and BIND_CODE_EXPIRED, the latter only on confirmBinding (§8.6 #26)', () => {
    for (const [key, e] of Object.entries(table)) {
      if (!e.caps.includes('driver')) continue;
      const extra = Object.keys(e.codes).filter((c) => c !== 'DEVICE_REVOKED' && c !== 'BIND_CODE_EXPIRED');
      expect({ key, extra }).toEqual({ key, extra: [] });
    }
    expect(Object.entries(table).filter(([, e]) => 'BIND_CODE_EXPIRED' in e.codes).map(([k]) => k)).toEqual(['confirmBinding']);
  });
  it('gates every operation by exactly one product capability', () => {
    for (const [key, e] of Object.entries(table)) expect({ key, caps: e.caps.length === 1 && ['driver', 'dispatcher'].includes(e.caps[0]!) }).toEqual({ key, caps: true });
  });
  it('declares no P1 operation', () => {
    for (const k of ['cancelRequest', 'reopenTruckDay', 'createCallEntry']) expect(k in api).toBe(false);
  });
});
