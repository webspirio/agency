// mocks/driver-report/src/content/pilot.ts
/** «Пілот» (§4.2 C-17) as data, because it is a DOCUMENT and not a screen: nothing here is derived from the world, no
 *  hook reads it, and the page that renders it is a `map`. The content lives beside the page rather than in
 *  `src/copy/office.ts` because it is read once, by one page, and putting a fourteen-line offer in the console's shared
 *  vocabulary would say the opposite.
 *
 *  D18 — THE OWNER'S DECISION OF 19.09 — is the thing to preserve when this file is edited: **no price and no start
 *  date anywhere**, and no placeholder for either. Not «ціна: [заповнює КТЛ]», not «старт: __.__.____», not an empty
 *  line waiting for one. Price is discussed live, never on a shared screen, so the guard chip «Пілот: ціна не
 *  заповнена» does not exist either — there is nothing for it to guard. The only date-like line is the one that
 *  measures the pilot against itself: «Рішення «далі чи ні»: після 2-го тижня пілоту».
 *
 *  Every string is copied byte for byte from §4.2 C-17, including the `·` (U+00B7), the `—` (U+2014) and the ASCII
 *  apostrophe U+0027 in «зв'язку». */

/** One line of the offer. `heading` introduces a group when a future line needs one; every line §4.2 C-17 spells today
 *  is a sentence of its own, so all eight carry `null` rather than a heading invented here. */
export type PilotLine = { heading: string | null; text: string };

export const PILOT: { title: string; lines: PilotLine[]; notIs: string } = {
  title: 'Пілот · 3 водії · 1 диспетчер · 3 тижні',
  lines: [
    { heading: null, text: 'Водії: П. Ватаманюк (Регіс) · О. Кравчук (Ruptela + CAN) · один ваш (Регіс)' },
    { heading: null, text: 'Диспетчер-відповідальна: ваш вибір' },
    { heading: null,
      text: 'З першого дня пілотні водії не пишуть путьовий: офіс друкує лист з даних, водій підписує, коли здає ТТН' },
    { heading: null, text: 'Фото — тільки через застосунок; що прийде у Viber, офіс додає сам' },
    { heading: null,
      text: "Телефони й інтернет: поповнення зв'язку або SIM від КТЛ і зарядка в кабіну — ~110 МБ на місяць на водія" },
    { heading: null,
      text: 'Від вас: ключ API Ruptela · план на завтра з BAS файлом · 30 хв з вашим програмістом BAS · бланк вашого '
        + 'путьового · 20 фото щитків і 20 ТТН з ваших машин' },
    { heading: null,
      text: 'Міряємо: хвилин водія в застосунку за зміну (ціль — менше, ніж путьовий) · путьових, написаних вручну '
        + 'пілотними водіями (ціль 0) · дзвінків замінено запитами (виконано без дзвінка / довелось дзвонити) · '
        + '% одометрів на ключових точках, прочитаних з фото · % ТТН в офісі протягом 1 год' },
    { heading: null, text: 'Рішення «далі чи ні»: після 2-го тижня пілоту' },
  ],
  notIs: 'Не тахограф, не медогляд і не система е-ТТН — воно з ними працює.',
};

/** The heading of the closing block. Separate from `notIs` so the page never concatenates the two. */
export const PILOT_NOT_IS_TITLE = 'Чим це не є';
