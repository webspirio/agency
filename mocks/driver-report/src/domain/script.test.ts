// mocks/driver-report/src/domain/script.test.ts
import { describe, expect, it } from 'vitest';
import { fmtTime } from '../app/format';
import { cmpInstant } from './clock';
import { BEATS, CHECKPOINTS, HRYHORII, OLEH, PAVLO, SCRIPT } from './script';

describe('the beats (§5.6)', () => {
  it('lists fourteen beats with title, clock, phone, scope and counts', () => {
    expect(BEATS.map((b) => [b.n, b.title, fmtTime(b.clock), b.phone, b.scope, b.counts.join(' · ')])).toEqual([
      [0, "Такт 0 · Результат: подорожній лист п'ятниці", '05:14', PAVLO, 'PILOT', '0 · 0 · 0 · 1 · 0'],
      [1, 'Такт 1 · Новий водій за один дотик', '05:15', HRYHORII, 'PILOT', '0 · 0 · 0 · 1 · 0'],
      [2, 'Такт 2 · Початок зміни на Регісі', '05:20', PAVLO, 'PILOT', '0 · 0 · 0 · 1 · 0'],
      [3, 'Такт 3 · Черга, якої немає на папері', '06:10', PAVLO, 'PILOT', '0 · 0 · 0 · 1 · 0'],
      [4, 'Такт 4 · Одне завантаження — дві ферми', '08:40', PAVLO, 'PILOT', '0 · 0 · 0 · 1 · 0'],
      [5, 'Такт 5 · Підтвердити, а не набирати', '08:42', PAVLO, 'PILOT', '0 · 1 · 0 · 1 · 0'],
      [6, 'Такт 6 · Машина з Ruptela і звіт по точках', '08:52', OLEH, 'PILOT', '0 · 1 · 0 · 1 · 0'],
      [7, "Такт 7 · Заправка без зв'язку", '08:57', PAVLO, 'PILOT', '0 · 2 · 0 · 1 · 0'],
      [8, 'Такт 8 · Ферма, тривога, машина в русі', '11:50', PAVLO, 'PILOT', '0 · 0 · 0 · 1 · 0'],
      [9, 'Такт 9 · День водія', '16:02', PAVLO, 'PILOT', '0 · 1 · 0 · 1 · 1'],
      [10, 'Такт 10 · Подорожній лист складається сам', '16:05', PAVLO, 'FLEET', '3 · 11 · 7 · 4 · 57'],
      [11, 'Такт 11 · Файл у BAS', '16:07', PAVLO, 'FLEET', '3 · 10 · 6 · 4 · 58'],
      [12, 'Такт 12 · Кожна машина — окремий бізнес', '16:08', PAVLO, 'FLEET', '3 · 10 · 6 · 4 · 0'],
      [13, 'Вихід · Пілот', '16:09', PAVLO, 'FLEET', '3 · 10 · 6 · 4 · 0'],
    ]);
    expect(BEATS[2]!.cue).toBe('Такт 2 · телефон Павла · «Почати зміну»');
  });
});

describe('the script (§5.7)', () => {
  it('holds fifty entries — S-01…S-51 without the derived S-43 — in `at` order', () => {
    expect(SCRIPT).toHaveLength(50);
    expect(SCRIPT.map((e) => e.id)).not.toContain('S-43');
    expect(new Set(SCRIPT.map((e) => e.id)).size).toBe(50);
    SCRIPT.slice(1).forEach((e, i) => expect([e.id, cmpInstant(SCRIPT[i]!.at, e.at)]).not.toEqual([e.id, 1]));
  });
  it('gives every LIVE entry a matcher and no AUTO entry one', () => {
    for (const e of SCRIPT) expect([e.id, e.match !== null]).toEqual([e.id, e.mode === 'LIVE']);
  });
  it('numbers each device’s records as the receipts of §1.4 say', () => {
    const next: Record<string, number> = { [PAVLO]: 417, [OLEH]: 388, [HRYHORII]: 1 };
    const numbers: Record<string, number[]> = {};
    for (const e of SCRIPT) {
      if (e.step.kind !== 'record') continue;
      for (const r of e.step.records) {
        numbers[e.id] = [...(numbers[e.id] ?? []), next[r.device] ?? 0];
        next[r.device] = (next[r.device] ?? 0) + 1;
      }
    }
    expect([numbers['S-03'], numbers['S-06'], numbers['S-10'], numbers['S-13'], numbers['S-14'], numbers['S-16'],
      numbers['S-36'], numbers['S-44'], numbers['S-45'], numbers['S-38']])
      .toEqual([[417], [418], [419], [420], [421], [422], [393, 394], [430], [431], [9]]);
  });
  it('keeps «Лан» as the digit question: read 412 866, confirmed 412 566', () => {
    const s39 = SCRIPT.find((e) => e.id === 'S-39')!;
    const cluster = s39.step.kind === 'record' ? s39.step.records[0]!.pages.find((p) => p.artefact === 'CLUSTER') : undefined;
    expect(cluster).toMatchObject({ value: '412566', sim_read: '412866', deferred: 'AFTER_EXIT' });
  });
  it('lists the ten rewind checkpoints of §5.4', () => {
    expect(CHECKPOINTS.map((c) => `${fmtTime(c.at)} · ${c.label}`)).toEqual(['06:10 · біля воріт',
      '07:48 · відмітка відправника', '08:40 · ТТН видали', '08:52 · Олег завантажився', '08:57 · заправка',
      '11:50 · Злагода', '12:30 · тривога', '12:48 · кінець тривоги', '16:02 · база', '16:05 · офіс, кінець дня']);
  });
});
