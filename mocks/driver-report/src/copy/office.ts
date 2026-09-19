/** The console words more than one page shows: the sidebar, the scope switch, source badges, the reason lists of the
 *  correction, resolve and retake dialogs, and the saved-file toast (§4.1, §4.2, §6.6, I-14). Every string is copied
 *  byte for byte from the spec. */
import { plural } from '../app/format';

export const OC = {
  nav: { board: 'Парк зараз', now: 'Зараз', review: 'Перевірка', days: 'Дні на підтвердження', originals: 'Оригінали',
    keyPoints: 'Ключові точки', trucks: 'Машини', worktime: 'Робочий час', bas: 'В BAS', drivers: 'Водії', pilot: 'Пілот' },
  navShort: { board: 'Парк', now: 'Зараз', review: 'Перевірка', days: 'Дні', originals: 'Папір', keyPoints: 'Точки',
    trucks: 'Машини', worktime: 'Час', bas: 'BAS', drivers: 'Водії', pilot: 'Пілот' },
  groups: { work: 'Робота', reports: 'Звіти', settings: 'Налаштування' },
  brand: { title: 'Звіт водія', sub: 'КТЛ · офіс' },
  scope: { PILOT: 'Пілот · 3', FLEET: 'Весь парк · 100 (приклад)' },
  source: { CAN: 'CAN', PHOTO: 'ФОТО', PLAN_OK: 'ПЛАН ✓', TYPED: 'ВРУЧНУ', OFFICE: 'ОФІС', ESTIMATE: 'ОЦІНКА',
    FROM_CALL: 'ЗІ СЛІВ', DRIVER: 'ВОДІЙ', TTN: 'ТТН', RUPTELA: 'Ruptela', TACHO: 'ТАХОГРАФ' },
  badge: { REGIS: 'Регіс', RUPTELA: 'Ruptela', PAPER: 'ПАПІР' },
  resolveReasons: { DRIVER_EXPLAINED: 'Водій пояснив телефоном', OCR_ERROR: 'Помилка розпізнавання', NOT_A_PROBLEM: 'Не є проблемою',
    DOC_TODAY: 'Документ буде сьогодні' },
  correctionReasons: { OCR_ERROR: 'Помилка розпізнавання', TYPO: 'Одруківка', BY_DASH_PHOTO: 'За фото щитка', BY_CAN: 'За CAN',
    ODOMETER_REPLACED: 'Заміна одометра', BY_TTN: 'За ТТН', BY_STATEMENT: 'За випискою', BY_PLAN: 'Розраховано за планом', OTHER: 'Інше' },
  retakeReasons: { BLUR: 'Розмито', CROPPED: 'Обрізано', GLARE: 'Відблиск', WRONG_SIDE: 'Не той бік', NO_ARRIVAL_TIME: 'Не видно часу прибуття' },
  mockBanner: 'Макет: у вашу базу нічого не надсилається',
  toastSaved: (file: string, n: number) => `Файл ${file} · ${n} ${plural(n, ['рядок', 'рядки', 'рядків'])} · збережено`,
  openDay: 'Відкрити день',
} as const;
