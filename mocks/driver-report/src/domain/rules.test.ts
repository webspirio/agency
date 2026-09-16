import { describe, expect, it } from 'vitest';
import {
  alreadyConfirmed,
  blankTtn,
  duplicateTtn,
  flagsFor,
  invalidOdometer,
  photoMismatch,
  unknownTruck,
  MAX_JUMP_KM,
  type ConfirmedRow,
  type TruckRow,
  type TtnRow,
} from './rules';

/**
 * THE LINE THIS FILE DEFENDS, and it is the design decision the whole product
 * rests on: a rule either REFUSES or it FLAGS, and the two are not the same
 * mechanism.
 *
 * A refusal has a declared code, stops the write, and shows the driver a
 * sentence. A flag is computed, stored, shown to the office and to nobody else,
 * and blocks nothing. Detrack warns when a driver is outside the geofence and
 * lets him proceed; Samsara logs an out-of-sequence arrival to an audit trail
 * and lets him proceed. Blocking a man at a silo gate at 21:00 produces a
 * telephone call and a return to paper — which is how the client's two previous
 * attempts died.
 *
 * So: a malformed odometer is REFUSED (there is no number to store). An odometer
 * that went BACKWARDS is FLAGGED (there is a number, and it is probably a typo,
 * and the office can see both it and the photograph).
 */

const TRUCKS: TruckRow[] = [
  { id: 'truck-000001', plate: 'AP 1234 BC' },
  { id: 'truck-000002', plate: 'AP 5678 CE' },
];

describe('invalidOdometer refuses what there is no number in', () => {
  it('accepts a plain run of digits', () => {
    expect(invalidOdometer('412348')).toBeUndefined();
    expect(invalidOdometer('0')).toBeUndefined();
    expect(invalidOdometer('9999999')).toBeUndefined();
  });

  it('refuses a decimal point — an odometer is a COUNT of whole kilometres', () => {
    expect(invalidOdometer('412348.5')?.code).toBe('ODOMETER_INVALID');
  });

  it('refuses letters, blanks and separators — the cracked-screen typo cases', () => {
    expect(invalidOdometer('')?.code).toBe('ODOMETER_INVALID');
    expect(invalidOdometer('   ')?.code).toBe('ODOMETER_INVALID');
    expect(invalidOdometer('412 348')?.code).toBe('ODOMETER_INVALID');
    expect(invalidOdometer('abc')?.code).toBe('ODOMETER_INVALID');
  });

  it('refuses a negative reading and one longer than any odometer has digits', () => {
    expect(invalidOdometer('-5')?.code).toBe('ODOMETER_INVALID');
    expect(invalidOdometer('12345678')?.code).toBe('ODOMETER_INVALID');
  });
});

describe('photoMismatch keeps the two ТТН photos from being the same photo', () => {
  /* п.11.3–11.5 Правил №363 issues the ТТН in three copies. The one photographed
     at unloading is примірник 3, certified by the consignee's signature and
     stamp — the copy that proves delivery and unlocks payment. A flow that
     accepted either photo at either end would silently collect two pictures of
     the same unsigned sheet. */
  it('accepts the right artefact for each event', () => {
    expect(photoMismatch('LOADING', 'TTN')).toBeUndefined();
    expect(photoMismatch('UNLOADING', 'TTN_SIGNED')).toBeUndefined();
    expect(photoMismatch('REFUEL', 'FUEL_RECEIPT')).toBeUndefined();
  });

  it('refuses the unsigned sheet at unloading', () => {
    expect(photoMismatch('UNLOADING', 'TTN')?.code).toBe('PHOTO_WRONG_KIND');
  });

  it('refuses a receipt where a waybill belongs, and the reverse', () => {
    expect(photoMismatch('LOADING', 'FUEL_RECEIPT')?.code).toBe('PHOTO_WRONG_KIND');
    expect(photoMismatch('REFUEL', 'TTN')?.code).toBe('PHOTO_WRONG_KIND');
  });

  it('refuses a dashboard photo as the event artefact — DASH is the odometer step', () => {
    expect(photoMismatch('LOADING', 'DASH')?.code).toBe('PHOTO_WRONG_KIND');
  });
});

describe('unknownTruck', () => {
  it('accepts a truck in the fleet', () => {
    expect(unknownTruck(TRUCKS, 'truck-000001')).toBeUndefined();
  });

  it('refuses one that is not', () => {
    const refusal = unknownTruck(TRUCKS, 'truck-999999');
    expect(refusal?.code).toBe('TRUCK_NOT_FOUND');
    expect(refusal?.ctx).toEqual({ truck_id: 'truck-999999' });
  });
});

describe('the dispatcher side — the only place in the product where anyone types', () => {
  const ROWS: TtnRow[] = [
    { id: 'event-000001', ttn_number: '0034512' },
    { id: 'event-000002', ttn_number: null },
  ];

  it('refuses a blank number, including one that is only whitespace', () => {
    expect(blankTtn('0034512')).toBeUndefined();
    expect(blankTtn('')?.code).toBe('TTN_BLANK');
    expect(blankTtn('   ')?.code).toBe('TTN_BLANK');
  });

  it('refuses a number already on another event', () => {
    expect(duplicateTtn(ROWS, '0034512')?.code).toBe('TTN_DUPLICATE');
  });

  it('lets a row keep its OWN number — the rename case, via exceptId', () => {
    /* Without exceptId the first confirmation succeeds and every later save of
       the same row is refused, which is the classic shape of this bug. */
    expect(duplicateTtn(ROWS, '0034512', 'event-000001')).toBeUndefined();
  });

  it('ignores rows with no number yet — null is not a collision', () => {
    expect(duplicateTtn(ROWS, '0099999')).toBeUndefined();
  });

  it('refuses confirming an event twice', () => {
    const open: ConfirmedRow = { confirmed_at: null };
    const done: ConfirmedRow = { confirmed_at: '2026-09-15T08:00:00.000Z' };
    expect(alreadyConfirmed(open)).toBeUndefined();
    expect(alreadyConfirmed(done)?.code).toBe('EVENT_ALREADY_CONFIRMED');
  });
});

describe('flagsFor computes, and REFUSES NOTHING', () => {
  it('is empty for an ordinary reading that carries a number', () => {
    expect(flagsFor(412348, 412100, '0034512')).toEqual([]);
  });

  it('flags a reading below the last one rather than refusing it', () => {
    /* He dropped a digit: 41 348 for 412 348. The office sees the flag AND the
       photograph, and can fix it. The driver is already 300 km away. */
    expect(flagsFor(41348, 412100, '0034512')).toEqual(['ODOMETER_BACKWARDS']);
  });

  it('flags an implausible jump rather than refusing it', () => {
    expect(flagsFor(412100 + MAX_JUMP_KM + 1, 412100, '0034512')).toEqual(['ODOMETER_JUMP']);
  });

  it('does NOT flag a jump exactly at the threshold — the boundary is inclusive', () => {
    expect(flagsFor(412100 + MAX_JUMP_KM, 412100, '0034512')).toEqual([]);
  });

  it('flags a missing ТТН number, which is the normal state at capture', () => {
    /* The driver is never asked for it. Every event arrives with this flag and
       the dispatcher clears it by reading one number off a photograph — that is
       the product, not an error. */
    expect(flagsFor(412348, 412100, null)).toEqual(['NO_TTN_NUMBER']);
  });

  it('accumulates, in a stable order, rather than reporting only the first', () => {
    expect(flagsFor(1, 412100, null)).toEqual(['ODOMETER_BACKWARDS', 'NO_TTN_NUMBER']);
  });

  it('treats a first-ever reading on a truck with no history as ordinary', () => {
    expect(flagsFor(412348, null, '0034512')).toEqual([]);
  });
});
