// mocks/driver-report/src/api/says.test.ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '@agency/mock';
import { fillSays, SAYS_REQUEST, SAYS_TRUCK_DAY } from './says';

const envelope = (ctx: Record<string, unknown>) => ({ response: { data: { statusCode: 409, code: 'X', ...ctx } } });
describe('SAYS tables and their context (§4.2 C-06, C-08, §7.5)', () => {
  it('fills who, when and state from the envelope', () => {
    expect(fillSays(SAYS_REQUEST.REQUEST_ALREADY_OPEN, envelope({ by: 'Н. Шевчук', at: '2026-09-21T05:43:00.000Z', state: 'побачив 08:43' })))
      .toBe('Уже запитано: Н. Шевчук 08:43 · побачив 08:43');
    expect(fillSays(SAYS_TRUCK_DAY.DAY_CHANGED, envelope({ by: 'Л. Гончаренко', at: '2026-09-21T14:10:00.000Z', change: 'пальне 250,00 → 245,60 л' })))
      .toBe('День змінено: Л. Гончаренко 17:10 — пальне 250,00 → 245,60 л. Перегляньте й підтвердіть ще раз.');
  });
  it('renders a missing placeholder as «—»', () => {
    expect(fillSays('Уже запитано: {by}', {})).toBe('Уже запитано: —');
  });
  it('reads the same ctx off the product’s ApiError, which has no .response (the other side of the seam)', () => {
    const err = new ApiError(409, 'Conflict', undefined, 'REQUEST_ALREADY_OPEN',
      { statusCode: 409, code: 'REQUEST_ALREADY_OPEN', by: 'Н. Шевчук', at: '2026-09-21T05:43:00.000Z', state: 'побачив 08:43' });
    expect(fillSays(SAYS_REQUEST.REQUEST_ALREADY_OPEN, err)).toBe('Уже запитано: Н. Шевчук 08:43 · побачив 08:43');
  });
});
