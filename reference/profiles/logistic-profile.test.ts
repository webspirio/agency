import { describe, expect, it } from 'vitest'
import {
  CUSTODY,
  FLEET,
  FLEET_GATES,
  NAV_SPEC,
  PROFIT,
  navFor,
  navForProfile,
  navLabels,
  profileHref,
  resolveProfile,
  type Capabilities,
} from '@/lib/profile'
import { CUSTODY_GATES, canCloseTrip } from '@/lib/transitions'
import type { CargoUnit, Trip } from '@/lib/types'

/* ═══════════════════════════ страховка кустодійного демо ═══════════════════════════

   426 наявних тестів не монтують жодного компонента: вони перевіряють домен, а
   не екрани. Тобто від приховування пункту меню або блока у шляховому листі
   вони не почервоніють — і саме тому цей файл існує.

   Він фіксує рівно одне: у профілі `custody` усе лишається так, як було до
   появи грошей. Якщо хтось випадково погасить прапорець або витягне пункт із
   меню, червоним стане тут, а не на показі клієнтові.                        */

const ALL_CAPS: (keyof Capabilities)[] = [
  'overview',
  'planner',
  'acceptance',
  'orders',
  'cargo',
  'supplies',
  'suppliers',
  'lanes',
  'points',
  'carriers',
  'contracts',
  'refs',
  'codeChip',
  'cargoBlocksOnLog',
  'aetrOnLog',
  'cmrOnLog',
  'tempOnLog',
  'money',
]

/** Меню кустодії до появи грошей — усі 17 пунктів, у тому самому порядку. */
const CUSTODY_LABELS = [
  'Огляд',
  'Планування рейсу',
  'Шляховий лист',
  'Приймання та претензії',
  'Рейси',
  'Заявки',
  'Вантаж',
  'Напрямки',
  'Замовники',
  'Пункти',
  'Перевізники',
  'Водії',
  'Транспорт',
  'Постачальники',
  'Договори',
  'Оснащення',
  'Довідники',
]

/** Рівно те, що бачить власник парку. Дев'ять пунктів, і жодного вантажного. */
const FLEET_LABELS = [
  'Гроші',
  'Витрати',
  'Оплати',
  'Строки документів',
  'Шляховий лист',
  'Рейси',
  'Замовники',
  'Водії',
  'Транспорт',
]

describe('профіль custody — це поведінка «як було»', () => {
  it('усі можливості кустодії ввімкнені, окрім грошей', () => {
    for (const cap of ALL_CAPS) {
      if (cap === 'money') continue
      expect(CUSTODY.caps[cap], `можливість ${cap} у кустодії`).toBe(true)
    }
  })

  /* Гроші в кустодії вимкнені навмисно, і це теж «як було»: грошових екранів у
     тому продукті не існувало, а поява чотирьох пунктів меню була б зміною
     поведінки — саме того, чого профілі мусять не допускати. */
  it('гроші в кустодії вимкнені — інакше в меню зʼявились би чотири нові пункти', () => {
    expect(CUSTODY.caps.money).toBe(false)
  })

  it('перелік прапорців у тесті збігається з типом — новий прапорець не проскочить', () => {
    expect(Object.keys(CUSTODY.caps).sort()).toEqual([...ALL_CAPS].sort())
    expect(Object.keys(FLEET.caps).sort()).toEqual([...ALL_CAPS].sort())
    expect(Object.keys(PROFIT.caps).sort()).toEqual([...ALL_CAPS].sort())
  })

  it('умови закриття рейсу в кустодії — усі пʼять, як до появи профілів', () => {
    expect(CUSTODY_GATES).toEqual({
      status: true,
      cmr: true,
      carried: true,
      unloaded: true,
      verdicts: true,
    })
    expect(CUSTODY.gates).toBe(CUSTODY_GATES)
  })

  it('стартовий екран кустодії — огляд', () => {
    expect(CUSTODY.home).toBe('overview')
  })

  it('меню кустодії — усі 17 пунктів у тому самому порядку', () => {
    expect(navLabels(CUSTODY.caps)).toEqual(CUSTODY_LABELS)
    expect(navLabels(CUSTODY.caps)).toHaveLength(17)
  })

  it('група «Гроші» в кустодії зникає цілком, а не стоїть порожньою', () => {
    expect(navFor(CUSTODY.caps).map((g) => g.group)).toEqual([
      'Диспетчерська',
      'Реєстри',
      'Партнери',
      'Керування',
    ])
  })
})

describe('профіль fleet — свій парк', () => {
  it('меню власника парку — рівно девʼять пунктів', () => {
    expect(navLabels(FLEET.caps).sort()).toEqual([...FLEET_LABELS].sort())
    expect(navLabels(FLEET.caps)).toHaveLength(9)
  })

  it('жодного вантажного екрана в меню власника парку', () => {
    const shown = navLabels(FLEET.caps)
    for (const hidden of [
      'Огляд',
      'Планування рейсу',
      'Приймання та претензії',
      'Заявки',
      'Вантаж',
      'Напрямки',
      'Пункти',
      'Перевізники',
      'Постачальники',
      'Договори',
      'Оснащення',
      'Довідники',
    ]) {
      expect(shown, `${hidden} мусить бути приховано`).not.toContain(hidden)
    }
  })

  it('гроші — перша група, бо з них починається показ', () => {
    expect(navFor(FLEET.caps)[0].group).toBe('Гроші')
    expect(FLEET.home).toBe('money')
  })

  it('чотири блоки шляхового листа приховані, чіп схеми кодів теж', () => {
    expect(FLEET.caps.cargoBlocksOnLog).toBe(false)
    expect(FLEET.caps.aetrOnLog).toBe(false)
    expect(FLEET.caps.cmrOnLog).toBe(false)
    expect(FLEET.caps.tempOnLog).toBe(false)
    expect(FLEET.caps.codeChip).toBe(false)
  })

  /* Таблиця переходів лишається в обох продуктах: рейс «у дорозі» не
     закривається ніде. Знімаються тільки умови по місцях, яких у власника
     парку не існує. */
  it('умови закриття знімають лише те, предмета чого в парку немає', () => {
    expect(FLEET_GATES.status).toBe(true)
    expect(FLEET_GATES.cmr).toBe(false)
    expect(FLEET_GATES.carried).toBe(false)
    expect(FLEET_GATES.unloaded).toBe(false)
    expect(FLEET_GATES.verdicts).toBe(false)
  })
})

/* ═══════════════════════════ профіль показу ═══════════════════════════

   `profit` — це перші дві хвилини розмови з власником парку: один екран,
   рівно на його запитання, і кнопка «показати всю систему». Тест сторожить
   саме одноекранність: якщо в цьому профілі колись зʼявиться другий пункт
   меню, показ почнеться не з відповіді, а з навігації.                       */

describe('профіль profit — один екран на його запитання', () => {
  it('стартовий екран — прорахунок, і меню немає взагалі', () => {
    expect(PROFIT.home).toBe('profit')
    expect(PROFIT.chrome).toBe('solo')
    expect(navForProfile(PROFIT)).toEqual([])
  })

  /* Найважливіше тут. `navFor` віддав би пʼять непозначених прапорцем пунктів
     («Шляховий лист», «Рейси», «Замовники», «Водії», «Транспорт») — і саме
     тому одноекранність вирішує профіль, а не набір прапорців. Якщо хтось
     колись підмінить `navForProfile` на `navFor`, червоним стане тут. */
  it('одноекранність не виводиться з прапорців — її вирішує профіль', () => {
    expect(navFor(PROFIT.caps).length).toBeGreaterThan(0)
    expect(navForProfile(PROFIT)).toHaveLength(0)
  })

  it('усі прапорці погашені — включно з грошима: чотири екрани тут теж зайві', () => {
    for (const cap of ALL_CAPS) {
      expect(PROFIT.caps[cap], `можливість ${cap} у профілі показу`).toBe(false)
    }
  })

  /* Це той САМИЙ власник, а не інша контора: межа закриття рейсу мусить бути
     парковою, інакше профіль обіцяв би іншу відповідальність за вантаж. */
  it('умови закриття рейсу — паркові, бо власник той самий', () => {
    expect(PROFIT.gates).toBe(FLEET_GATES)
  })

  it('повні профілі меню не втратили', () => {
    expect(navForProfile(CUSTODY)).toEqual(navFor(CUSTODY.caps))
    expect(navForProfile(FLEET)).toEqual(navFor(FLEET.caps))
    expect(navForProfile(CUSTODY).length).toBeGreaterThan(0)
    expect(navForProfile(FLEET).length).toBeGreaterThan(0)
  })
})

describe('canCloseTrip з іншими умовами', () => {
  const trip = (patch: Partial<Trip> = {}): Trip =>
    ({
      id: 'tr_1',
      number: 'Р-26-0001',
      status: 'на прийманні',
      cmr: undefined,
      orderIds: [],
      ...patch,
    }) as Trip

  it('за замовчуванням поведінка та сама, що була: без CMR не закривається', () => {
    const res = canCloseTrip(trip(), [])
    expect(res.ok).toBe(false)
    expect(res.reasons.some((r) => r.includes('CMR'))).toBe(true)
  })

  it('у парку CMR і вердикти не питаються — рейс закривається', () => {
    const res = canCloseTrip(trip(), [], FLEET_GATES)
    expect(res).toEqual({ ok: true, reasons: [] })
  })

  it('у парку рейс «у дорозі» все одно не закривається — таблиця переходів діє', () => {
    const res = canCloseTrip(trip({ status: 'у дорозі' }), [], FLEET_GATES)
    expect(res.ok).toBe(false)
    expect(res.reasons).toHaveLength(1)
  })

  it('незакрите місце в дорозі парку не заважає, кустодії — заважає', () => {
    const unit = {
      id: 'u1',
      code: 'PL-1',
      orderId: 'o1',
      tripId: 'tr_1',
      cargoTypeId: 'ct_1',
      status: 'у дорозі',
    } as CargoUnit
    expect(canCloseTrip(trip({ cmr: 'CMR-1' }), [unit]).ok).toBe(false)
    expect(canCloseTrip(trip({ cmr: 'CMR-1' }), [unit], FLEET_GATES).ok).toBe(true)
  })
})

describe('розпізнавання профілю', () => {
  it('?profile=fleet дає власника парку', () => {
    expect(resolveProfile('?profile=fleet').id).toBe('fleet')
    expect(resolveProfile('?a=1&profile=FLEET').id).toBe('fleet')
  })

  it('?profile=profit дає один екран показу', () => {
    expect(resolveProfile('?profile=profit').id).toBe('profit')
    expect(resolveProfile('?a=1&profile=PROFIT').id).toBe('profit')
    expect(resolveProfile('', 'profit').id).toBe('profit')
  })

  /* Три профілі — три різні продукти в очах глядача, і жоден не має права
     випадково відкритися замість іншого. */
  it('три профілі мають різні стартові екрани', () => {
    const homes = [CUSTODY.home, FLEET.home, PROFIT.home]
    expect(new Set(homes).size).toBe(3)
  })

  /* Перехід «прорахунок → уся система» відбувається просто на показі. Якщо
     посилання складеться від корʼня, на GitHub Pages воно поведе глядача на
     404 у найгіршу можливу мить. */
  it('посилання на інший профіль зберігає підкаталог і решту параметрів', () => {
    expect(profileHref('fleet', 'https://x.github.io/logistic/?profile=profit')).toBe(
      'https://x.github.io/logistic/?profile=fleet',
    )
    expect(profileHref('profit', 'https://x.github.io/logistic/')).toBe(
      'https://x.github.io/logistic/?profile=profit',
    )
    expect(profileHref('fleet', 'http://localhost:5173/?a=1&profile=profit')).toBe(
      'http://localhost:5173/?a=1&profile=fleet',
    )
  })

  it('без window посилання лишається відносним, а не падає', () => {
    expect(typeof window).toBe('undefined')
    expect(profileHref('fleet')).toBe('?profile=fleet')
  })

  it('порожній рядок, чуже значення й відсутній параметр дають кустодію', () => {
    expect(resolveProfile('').id).toBe('custody')
    expect(resolveProfile('?profile=').id).toBe('custody')
    expect(resolveProfile('?profile=custody').id).toBe('custody')
    expect(resolveProfile('?profile=банани').id).toBe('custody')
    expect(resolveProfile('?other=fleet').id).toBe('custody')
  })

  it('змінна збірки працює, але параметр адреси її перебиває', () => {
    expect(resolveProfile('', 'fleet').id).toBe('fleet')
    expect(resolveProfile('?profile=custody', 'fleet').id).toBe('custody')
  })

  /* Модуль читає профіль один раз на старті. У node немає `window`, і без
     захисту цей імпорт впав би — тест ловить саме це. */
  it('без window імпорт не падає і дає кустодію', () => {
    expect(typeof window).toBe('undefined')
    expect(resolveProfile().id).toBe('custody')
  })
})

describe('склад меню як дані', () => {
  it('кожен пункт має маршрут і назву, кожна назва унікальна', () => {
    const labels = NAV_SPEC.flatMap((g) => g.items.map((i) => i.label))
    expect(new Set(labels).size).toBe(labels.length)
    for (const g of NAV_SPEC) {
      for (const i of g.items) {
        expect(i.name.length).toBeGreaterThan(0)
        expect(i.label.length).toBeGreaterThan(0)
      }
    }
  })

  it('пункти без прапорця видно в обох профілях', () => {
    const always = NAV_SPEC.flatMap((g) => g.items.filter((i) => !i.cap).map((i) => i.label))
    expect(always).toEqual(['Шляховий лист', 'Рейси', 'Замовники', 'Водії', 'Транспорт'])
    for (const label of always) {
      expect(navLabels(CUSTODY.caps)).toContain(label)
      expect(navLabels(FLEET.caps)).toContain(label)
    }
  })
})
