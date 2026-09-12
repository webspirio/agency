import { describe, expect, it } from 'vitest';
import { blankName, duplicateName, invalidBalance, type PartyNameRow } from './rules';

/**
 * The refusal rules are pure, so they are testable without a store, an adapter
 * or a request — which is the property that lets the same function move into a
 * Nest service at conversion. Replace these when you replace the domain; do not
 * delete the file.
 */
const BOOK: readonly PartyNameRow[] = [
  { id: 'party-000001', name: 'Anna Albrecht' },
  { id: 'party-000002', name: 'Bernd Cordes' },
];

describe('duplicateName', () => {
  it('refuses a name already in the book, and says which field', () => {
    const refusal = duplicateName(BOOK, 'Anna Albrecht');
    expect(refusal?.code).toBe('PARTY_NAME_TAKEN');
    expect(refusal?.ctx).toEqual({ field: 'name' });
  });

  it('allows a name nobody holds', () => {
    expect(duplicateName(BOOK, 'Elke Fischer')).toBeUndefined();
  });

  it('lets a row keep its OWN name — the rename that refuses itself', () => {
    // Without `exceptId` a rename succeeds once and then refuses every
    // subsequent save of the same row, which looks like data loss to a client.
    expect(duplicateName(BOOK, 'Anna Albrecht', 'party-000001')).toBeUndefined();
    expect(duplicateName(BOOK, 'Bernd Cordes', 'party-000001')?.code).toBe('PARTY_NAME_TAKEN');
  });
});

describe('blankName', () => {
  it('refuses whitespace, which a required-field check treats as present', () => {
    expect(blankName('   ')?.code).toBe('PARTY_NAME_BLANK');
    expect(blankName('')?.code).toBe('PARTY_NAME_BLANK');
  });

  it('allows a real name', () => {
    expect(blankName('Anna Albrecht')).toBeUndefined();
  });
});

describe('invalidBalance', () => {
  it('accepts exactly what asDecimal2 accepts', () => {
    expect(invalidBalance('1240.00')).toBeUndefined();
    expect(invalidBalance('-3.50')).toBeUndefined();
  });

  it('refuses the shapes a form actually produces, rather than 500ing on them', () => {
    // Unguarded, every one of these reached asDecimal2 and threw a plain Error,
    // which the adapter turns into a 500 — a stack trace where a 400 belongs.
    for (const raw of ['12.5', '12', '', 'abc', '12.345', '1,240.00']) {
      expect(invalidBalance(raw)?.code).toBe('PARTY_BALANCE_INVALID');
    }
  });
});
