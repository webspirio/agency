import { CUSTODY_GATES, type CloseGates } from '@/lib/transitions'
import type { RouteName } from '@/lib/store'

/* ═══════════════════════════ два продукти, один код ═══════════════════════════

   Той самий застосунок продається двом різним конторам, і в них різна межа
   відповідальності — а не різний набір кнопок.

   • `custody` — експедитор, що відповідає за вантаж власними грошима. Його
     предмет обліку — МІСЦЕ: палета з кодом, приймання по кожному місцю,
     претензія, пломба, CMR, години AETR. Рейс без вердикту по місцю не
     закривається, бо закритий рейс означає, що замовник більше нічого не
     пришиє.

   • `fleet` — власник свого парку на міжнародних перевезеннях. Його предмет
     обліку — МАШИНА: скільки вона принесла, скільки зʼїла, коли їй кінчається
     страховка. Місць у нього немає взагалі: він везе чужий палетований вантаж
     одним цілим і відповідає за машину, а не за палету.

   • `profit` — той самий власник парку, але ПЕРШІ ДВІ ХВИЛИНИ показу. Одне
     запитання, з яким він прийшов: «щоб я в кінці-кінців побачив, от, що в
     мене залишається». Один екран, без меню, без решти системи. Це не урізана
     версія продукту й не окремий продукт: та сама арифметика, той самий сід,
     той самий модуль. Спершу відповідь рівно на його запитання — і аж потім
     уся система, у яку та відповідь вбудована. Порядок тут і є сенс профілю:
     людині, яка просила «просто цифри», меню з девʼяти пунктів на першому
     екрані читається як «нам продають не те, що я просив».

   Тому перемикається не тема й не набір іконок, а СКЛАД ЕКРАНІВ і межа
   закриття рейсу. Кожен прапорець тут названий за тим, що він приховує, і
   `CUSTODY` — це рівно та поведінка, яка була до появи профілів. Через це
   жоден наявний тест і жоден наявний екран від появи профілів не змінився.

   Профіль НЕ живе в zustand-персисті: збережений профіль пережив би «скинути
   демо-дані» і залишив би показ у чужому продукті. Він читається один раз при
   старті модуля — з `?profile=fleet`, `?profile=profit` або з `VITE_PROFILE`. */

/**
 * Один прапорець на групу екранів. Імена — за назвами пунктів меню, які вони
 * приховують, плюс чотири блоки всередині шляхового листа й чіп схеми кодів
 * у шапці.
 */
export interface Capabilities {
  /** «Огляд» — дашборд вантажної кустодії: місця, претензії, план напрямків. */
  overview: boolean
  /** «Планування рейсу» — комплектація місць і генерація кодів. */
  planner: boolean
  /** «Приймання та претензії» — вердикт по кожному місцю. */
  acceptance: boolean
  /** «Заявки» — реєстр броней із кодами місць. */
  orders: boolean
  /** «Вантаж» — реєстр місць. */
  cargo: boolean
  /** «Оснащення» — ремені, пломби, маркування. */
  supplies: boolean
  /** «Постачальники» — до кого їхати за оснащенням. */
  suppliers: boolean
  /** «Напрямки» — план обсягу з замовником. */
  lanes: boolean
  /** «Пункти» — рампи, вікна, кількість місць під завантаження. */
  points: boolean
  /** «Перевізники» — коли рейс віддається на сторону. */
  carriers: boolean
  /** «Договори» — реєстр контрактів. */
  contracts: boolean
  /** «Довідники» — типи вантажу, критерії приймання, схеми кодів. */
  refs: boolean
  /** Чіп «схема · код місця вшитий» у шапці. */
  codeChip: boolean
  /** Список місць із галочками у шляховому листі. */
  cargoBlocksOnLog: boolean
  /** Години за кермом за AETR у шляховому листі. */
  aetrOnLog: boolean
  /** «Пломба, CMR і скан листа» у шляховому листі. */
  cmrOnLog: boolean
  /** Температура рефа у шляховому листі. */
  tempOnLog: boolean
  /** Гроші: маржинальність, витрати, оплати, строки документів. */
  money: boolean
}

/**
 * Умови закриття рейсу для власника парку.
 *
 * Таблиця переходів лишається — з «у дорозі» рейс не закривається в жодному
 * продукті. Знімаються рівно ті три умови, предмета яких у власника парку не
 * існує: CMR по місцях, вивантаження кожного місця й вердикт приймання. У нього
 * закритий рейс означає «машина повернулась, виручку можна визнавати».
 */
export const FLEET_GATES: CloseGates = {
  status: true,
  cmr: false,
  carried: false,
  unloaded: false,
  verdicts: false,
}

export interface Profile {
  id: 'custody' | 'fleet' | 'profit'
  /** Як профіль називається вголос на показі. */
  name: string
  caps: Capabilities
  gates: CloseGates
  /** Екран, з якого профіль починається — і куди повертає «скинути демо». */
  home: RouteName
  /**
   * Скільком екранів має право дістатися людина.
   *
   * `full` — бокове меню, як було. `solo` — один екран і нічого крім нього:
   * меню не малюється зовсім, а не малюється порожнім. Це окреме поле, а не
   * висновок із набору прапорців, бо прапорці кажуть ЩО ввімкнено, і «одне
   * ввімкнено» не означає «решти не існує» — у профілі показу решта якраз
   * існує, і на неї ведуть з екрана кнопкою.
   */
  chrome: 'full' | 'solo'
}

/**
 * Три профілі поруч в одному літералі: цей літерал і є таблиця обсягу для
 * клієнтської специфікації — рядок «що ввімкнено» не існує двічі.
 *
 * `money: false` у кустодії — це і є «як сьогодні»: грошових екранів у тому
 * продукті не було, і поява чотирьох пунктів меню була б зміною поведінки.
 */
export const PROFILES: { CUSTODY: Profile; FLEET: Profile; PROFIT: Profile } = {
  CUSTODY: {
    id: 'custody',
    name: 'Кустодія вантажу',
    home: 'overview',
    gates: CUSTODY_GATES,
    chrome: 'full',
    caps: {
      overview: true,
      planner: true,
      acceptance: true,
      orders: true,
      cargo: true,
      supplies: true,
      suppliers: true,
      lanes: true,
      points: true,
      carriers: true,
      contracts: true,
      refs: true,
      codeChip: true,
      cargoBlocksOnLog: true,
      aetrOnLog: true,
      cmrOnLog: true,
      tempOnLog: true,
      money: false,
    },
  },
  FLEET: {
    id: 'fleet',
    name: 'Свій парк',
    home: 'money',
    gates: FLEET_GATES,
    chrome: 'full',
    caps: {
      overview: false,
      planner: false,
      acceptance: false,
      orders: false,
      cargo: false,
      supplies: false,
      suppliers: false,
      lanes: false,
      points: false,
      carriers: false,
      contracts: false,
      refs: false,
      codeChip: false,
      cargoBlocksOnLog: false,
      aetrOnLog: false,
      cmrOnLog: false,
      tempOnLog: false,
      money: true,
    },
  },
  /**
   * Профіль показу: один екран «Прорахунок» і нічого більше.
   *
   * Усі прапорці погашені — включно з `money`. Це не описка: чотири грошові
   * екрани тут теж зайві. Ввімкнений лише один маршрут, і саме тому цей
   * профіль нічим не рискує — він фізично не має чим показати щось поза
   * запитанням власника.
   *
   * Умови закриття рейсу — ті самі, що в парку: це той самий власник, а не
   * інша контора. Рейсів він на цьому екрані не закриває, але значення мусить
   * бути парковим, інакше профіль обіцяв би іншу межу відповідальності.
   */
  PROFIT: {
    id: 'profit',
    name: 'Прорахунок',
    home: 'profit',
    gates: FLEET_GATES,
    chrome: 'solo',
    caps: {
      overview: false,
      planner: false,
      acceptance: false,
      orders: false,
      cargo: false,
      supplies: false,
      suppliers: false,
      lanes: false,
      points: false,
      carriers: false,
      contracts: false,
      refs: false,
      codeChip: false,
      cargoBlocksOnLog: false,
      aetrOnLog: false,
      cmrOnLog: false,
      tempOnLog: false,
      money: false,
    },
  },
}

export const CUSTODY = PROFILES.CUSTODY
export const FLEET = PROFILES.FLEET
export const PROFIT = PROFILES.PROFIT

/* ═══════════════════════════ меню ═══════════════════════════

   Склад меню — дані без іконок, щоб його можна було перевірити тестом у node,
   де немає ні DOM, ні React. Іконку до кожного пункту чіпляє `Shell`.        */

export interface NavSpec {
  name: RouteName
  label: string
  /** Живе число праворуч — те, що чекає на людину. */
  badge?: 'acceptance' | 'driverlog'
  /** Порожньо — пункт видно в обох профілях. */
  cap?: keyof Capabilities
}

export interface NavGroup {
  group: string
  items: NavSpec[]
}

export const NAV_SPEC: NavGroup[] = [
  {
    group: 'Гроші',
    items: [
      { name: 'money', label: 'Гроші', cap: 'money' },
      { name: 'expenses', label: 'Витрати', cap: 'money' },
      { name: 'receivables', label: 'Оплати', cap: 'money' },
      { name: 'terms', label: 'Строки документів', cap: 'money' },
    ],
  },
  {
    group: 'Диспетчерська',
    items: [
      { name: 'overview', label: 'Огляд', cap: 'overview' },
      { name: 'planner', label: 'Планування рейсу', cap: 'planner' },
      { name: 'driverlog', label: 'Шляховий лист', badge: 'driverlog' },
      { name: 'acceptance', label: 'Приймання та претензії', badge: 'acceptance', cap: 'acceptance' },
      { name: 'trips', label: 'Рейси' },
    ],
  },
  {
    group: 'Реєстри',
    items: [
      { name: 'orders', label: 'Заявки', cap: 'orders' },
      { name: 'cargo', label: 'Вантаж', cap: 'cargo' },
    ],
  },
  {
    group: 'Партнери',
    items: [
      { name: 'lanes', label: 'Напрямки', cap: 'lanes' },
      { name: 'clients', label: 'Замовники' },
      { name: 'points', label: 'Пункти', cap: 'points' },
      { name: 'carriers', label: 'Перевізники', cap: 'carriers' },
      { name: 'drivers', label: 'Водії' },
      { name: 'vehicles', label: 'Транспорт' },
      { name: 'suppliers', label: 'Постачальники', cap: 'suppliers' },
      { name: 'contracts', label: 'Договори', cap: 'contracts' },
    ],
  },
  {
    group: 'Керування',
    items: [
      { name: 'supplies', label: 'Оснащення', cap: 'supplies' },
      { name: 'refs', label: 'Довідники', cap: 'refs' },
    ],
  },
]

/** Пункти меню, які видно за цим набором можливостей. Порядок груп не рухається. */
export function navFor(caps: Capabilities): NavGroup[] {
  return NAV_SPEC.map((g) => ({
    group: g.group,
    items: g.items.filter((i) => !i.cap || caps[i.cap]),
  })).filter((g) => g.items.length > 0)
}

/**
 * Меню профілю. Профіль із одним екраном не має меню ВЗАГАЛІ.
 *
 * Ця функція існує окремо від `navFor` саме тому, що склад меню профілю показу
 * не виводиться з прапорців: непозначені прапорцем пункти («Шляховий лист»,
 * «Рейси», «Замовники», «Водії», «Транспорт») видно в обох повних профілях, і
 * `navFor` віддав би їх і тут. Одноекранність — рішення профілю, а не наслідок
 * набору можливостей.
 */
export function navForProfile(profile: Profile): NavGroup[] {
  return profile.chrome === 'solo' ? [] : navFor(profile.caps)
}

/** Плоский список назв — те, чим міряється склад меню в тесті. */
export function navLabels(caps: Capabilities): string[] {
  return navFor(caps).flatMap((g) => g.items.map((i) => i.label))
}

/* ═══════════════════════════ розпізнавання профілю ═══════════════════════════ */

/**
 * `?profile=fleet` або `?profile=profit` у рядку адреси, інакше `VITE_PROFILE`
 * зі збірки, інакше кустодія. Тести йдуть у node, де `window` немає, тому
 * звернення захищене: без нього імпорт цього модуля впав би у першому ж тесті.
 */
export function resolveProfile(search?: string, env?: string): Profile {
  const fromQuery =
    search !== undefined
      ? new URLSearchParams(search).get('profile')
      : typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('profile')

  const raw = (fromQuery ?? env ?? import.meta.env?.VITE_PROFILE ?? '').toString().trim().toLowerCase()
  if (raw === 'fleet') return FLEET
  if (raw === 'profit') return PROFIT
  return CUSTODY
}

/**
 * Адреса того самого демо в іншому профілі.
 *
 * Складається з ПОТОЧНОЇ адреси, а не з кор'ня: на GitHub Pages застосунок
 * живе в підкаталозі `/logistic/`, і посилання `?profile=fleet` завело б
 * глядача на чужу сторінку просто на показі. Решта параметрів адреси теж
 * лишається — вона могла принести з собою щось ще.
 */
export function profileHref(id: Profile['id'], href?: string): string {
  const from = href ?? (typeof window === 'undefined' ? undefined : window.location.href)
  if (!from) return `?profile=${id}`
  const url = new URL(from)
  url.searchParams.set('profile', id)
  return url.toString()
}

/** Профіль розпізнається один раз на старті модуля й далі не змінюється. */
export const PROFILE: Profile = resolveProfile()

export const CAPS: Capabilities = PROFILE.caps

/** Коротка перевірка на екрані: `can('money')`. */
export function can(cap: keyof Capabilities): boolean {
  return PROFILE.caps[cap]
}
