// mocks/driver-report/src/copy/words.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DC } from './driver';
import { OC } from './office';

const SRC = path.resolve(import.meta.dirname, '..');
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const isSource = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f);
/** Every file whose text can reach the driver’s screen. Re-read on every test: Wave 2 adds files here. */
const driverFiles = (): string[] => [
  ...walk(path.join(SRC, 'pages/driver')), ...walk(path.join(SRC, 'components/driver')),
  path.join(SRC, 'copy/driver.ts'), path.join(SRC, 'domain/project.ts'), path.join(SRC, 'domain/views/driver.ts'),
  path.join(SRC, 'domain/views/myday.ts'),
].filter((f) => existsSync(f) && isSource(f));
const rel = (f: string): string => path.relative(SRC, f);

const BANNED = ['помилк', 'одрук', 'надісл', 'відправлен', 'синхроніз', 'подія', 'події', 'подію', 'статус', 'сесі',
  'валідац', 'печатк', 'подорожн', 'путьов', 'шляхов', 'рейтинг', 'керування залишилось', 'грн/км', 'бонус'];

describe('what the driver route never says (§0.3, §8.6 #1, #4, #12, #18)', () => {
  it.each(BANNED)('no driver-route file contains «%s»', (stem) => {
    const hits = driverFiles().filter((f) => readFileSync(f, 'utf8').toLowerCase().includes(stem)).map(rel);
    expect(hits).toEqual([]);
  });
  it('no driver-route file references the brick tokens', () => {
    const hits = driverFiles().filter((f) => /-reject/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual([]);
  });
  it('keeps the status and sync grammar of §6.6 and §3.3 D-02', () => {
    expect(DC.status.inOffice).toBe('В офісі ✓');
    expect(DC.status.photosLeft(3, 4)).toBe('фото 3 з 4 ще в телефоні');
    expect([1, 2, 5].map((n) => DC.sync.waiting(n, '08:57'))).toEqual([
      "1 запис чекає інтернету · останній зв'язок 08:57",
      "2 записи чекають інтернету · останній зв'язок 08:57",
      "5 записів чекають інтернету · останній зв'язок 08:57",
    ]);
    expect(DC.tiles.standSub).toBe('тривога · поломка · проблема');
    expect(DC.basis.lastAtBase('17:48', '412\u00A0355')).toBe('вчора о 17:48 на базі: 412\u00A0355 — порівняйте з фото');
  });
});

describe('the console copy (§4.1)', () => {
  it('names the sidebar items in order', () => {
    expect(Object.values(OC.nav)).toEqual(['Парк зараз', 'Зараз', 'Перевірка', 'Дні на підтвердження', 'Оригінали',
      'Ключові точки', 'Машини', 'Робочий час', 'В BAS', 'Водії', 'Пілот']);
  });
  it('confirms saved files with a declined row count', () => {
    expect(OC.toastSaved('КТЛ-ключові-точки-21.09.2026.csv', 3)).toBe('Файл КТЛ-ключові-точки-21.09.2026.csv · 3 рядки · збережено');
    expect(OC.toastSaved('КТЛ-подорожні-21.09.2026.csv', 58)).toBe('Файл КТЛ-подорожні-21.09.2026.csv · 58 рядків · збережено');
  });
});

describe('no source file names the reference design (§8.6 #23)', () => {
  it('no .ts/.tsx under src/ contains the two forbidden words', () => {
    const forbidden = ['магістрал', 'logistic'];
    const hits = walk(SRC).filter(isSource).filter((f) => {
      const text = readFileSync(f, 'utf8').toLowerCase();
      return forbidden.some((w) => text.includes(w));
    });
    expect(hits.map(rel)).toEqual([]);
  });
});
