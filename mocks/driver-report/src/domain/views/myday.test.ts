// mocks/driver-report/src/domain/views/myday.test.ts
import { describe, expect, it } from 'vitest';
import { demo } from '../clock';
import { replayDriver, testServer } from '../../test/drive';
import { myDayView, myMonthView } from './myday';

/** Павло’s own records up to `until`, straight from the script (office entries not replayed). */
function pavloDay(until: string) {
  const s = testServer();
  replayDriver(s, 'device-000001', until);
  return s;
}

describe('«Мій день» (§3.3 D-15)', () => {
  it('writes the day in the driver’s own words, final at once', () => {
    const s = pavloDay('16:02');
    const d = myDayView(s.world(), 'device-000001', '2026-09-21' as never, demo('16:05'));
    expect([d.span_line, d.on_site_line, d.km_line]).toEqual(['На зміні 05:20 – 16:02 · 10 год 42 хв', 'На точках 5 год 38 хв · тривога 18 хв', '234 км']);
    expect(d.rows[0]).toMatchObject({ title: '06:10 Вільнянськ · завантаження' });
    expect(d.rows[0]!.lines[0]).toBe('на місці 06:10–08:40 · 2 год 30 хв');
    expect(d.rows.find((r) => r.title.includes('Балабине'))!.lines).toContain('прочитано 412 866 · ви вибрали 412 566');
    expect(d.rows.map((r) => r.title)).toContain('08:57 Заправка · ОККО Н-08 · 412 398 км');
  });
  it('says so on a day without a shift', () => {
    expect(myDayView(testServer().world(), 'device-000001', '2026-09-22' as never, demo('16:05')).empty).toBe(true);
  });
});

describe('«Мій місяць» (§3.3 D-16)', () => {
  it('is facts, never a score', () => {
    const m = myMonthView(testServer().world(), 'device-000001', '2026-09', demo('16:05'));
    expect([m.title, ...m.lines]).toEqual(['Вересень', '17 змін · на зміні 186 год · з них на точках 61 год', 'Документів прийнято 64 з 66', 'Оригіналів прийнято 30 з 32']);
    expect(JSON.stringify(m)).not.toMatch(/грн|л\/100|рейтинг|місце в/);
  });
});
