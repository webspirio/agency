export type Locale = 'de' | 'uk';

export type LocaleCorpus = {
  given: string[];
  family: string[];
  company: string[];
  street: string[];
  city: string[];
};

/**
 * The closed set of proper names a mock is allowed to contain. Plan B's
 * `synth:names` check asserts that every name-shaped literal in a mock's SOURCE
 * traces back to here — an allow-list, because the deny-list it replaces
 * (pii-boundary.mjs:34) is Cyrillic-only and reports green on 'Hans Müller'.
 *
 * Every entry is guarded by the `corpus integrity` block in stream.test.ts:
 * locale alphabet, capitalisation, NFC form, no duplicates. That block was
 * written against the corpus as the plan shipped it and caught 'Федір' spelled
 * with a Hebrew final pe (U+05E3) for the Ф — a name that renders correctly,
 * picks correctly, and is not the name.
 */
export const CORPUS: Record<Locale, LocaleCorpus> = {
  de: {
    given: ['Anna', 'Bernd', 'Claudia', 'Dieter', 'Elke', 'Frank', 'Greta', 'Hans', 'Ingrid',
      'Jörg', 'Katrin', 'Lars', 'Miriam', 'Norbert', 'Otto', 'Petra', 'Ralf', 'Sabine',
      'Thomas', 'Ute', 'Volker', 'Wiebke'],
    family: ['Albrecht', 'Baumann', 'Cordes', 'Dreher', 'Engel', 'Fischer', 'Gerber', 'Hoffmann',
      'Iversen', 'Jäger', 'Köhler', 'Lehmann', 'Müller', 'Neumann', 'Ostermann', 'Peters',
      'Richter', 'Schuster', 'Thiele', 'Ulrich', 'Vogel', 'Winkler'],
    company: ['Nordlicht Logistik', 'Rheinbach Handel', 'Ostsee Frucht', 'Wagner & Söhne',
      'Blaupunkt Service', 'Talhof Agrar', 'Kranich Transporte', 'Silberbach Technik'],
    street: ['Ahornweg', 'Bahnhofstraße', 'Comeniusplatz', 'Dorfstraße', 'Eichenallee',
      'Feldweg', 'Gartenstraße', 'Hauptstraße'],
    city: ['Bad Segeberg', 'Coesfeld', 'Detmold', 'Eutin', 'Fulda', 'Görlitz', 'Herford', 'Ilmenau'],
  },
  uk: {
    given: ['Андрій', 'Богдана', 'Василь', 'Галина', 'Дмитро', 'Оксана', 'Ігор', 'Катерина',
      'Леонід', 'Марина', 'Назар', 'Олена', 'Павло', 'Руслана', 'Сергій', 'Тетяна',
      'Устим', 'Федір', 'Христина', 'Юрій', 'Ярослава', 'Зоряна'],
    family: ['Бондаренко', 'Ватаманюк', 'Гнатюк', 'Даниленко', 'Кравець', 'Лисенко', 'Мельник',
      'Наливайко', 'Оліфер', 'Панченко', 'Романюк', 'Савчук', 'Ткаченко', 'Українець',
      'Федорів', 'Харченко', 'Цимбал', 'Черненко', 'Шевченко', 'Ющенко', 'Яременко', 'Іванців'],
    company: ['Ягідний Край', 'Лан-Агро', 'Дніпро Логістик', 'Сонячна Долина',
      'Карпатський Сад', 'Степовик Транс', 'Зелена Хвиля', 'Полтава Фрукт'],
    street: ['Вишнева', 'Гагаріна', 'Зелена', 'Каштанова', 'Лугова', 'Миру', 'Незалежності', 'Садова'],
    city: ['Бахмач', 'Волочиськ', 'Гадяч', 'Дубно', 'Заліщики', 'Ізюм', 'Косів', 'Лубни'],
  },
};

/** People only: given + family, across every locale. See ALL_TERMS below. */
export const ALL_NAMES: ReadonlySet<string> = new Set(
  (Object.keys(CORPUS) as Locale[]).flatMap((l) => [...CORPUS[l].given, ...CORPUS[l].family]),
);

/**
 * The corpus closed over EVERY list, not just people.
 *
 * `ALL_NAMES` answers "is this literal a person from the corpus", which is the
 * question `pii-boundary.mjs:34` asks — badly, because its `NAME_RE` is
 * Cyrillic-only and so returns green on 'Hans Müller'. But that regex shape,
 * two-or-three capitalised words, also matches 'Bad Segeberg', 'Nordlicht
 * Logistik' and 'Ягідний Край', which the corpus emits on purpose. An allow-list
 * built on `ALL_NAMES` alone would therefore fail on its own output. `ALL_TERMS`
 * is the set that makes `synth:names` decidable.
 */
export const ALL_TERMS: ReadonlySet<string> = new Set(
  (Object.keys(CORPUS) as Locale[]).flatMap((l) => [
    ...CORPUS[l].given,
    ...CORPUS[l].family,
    ...CORPUS[l].company,
    ...CORPUS[l].street,
    ...CORPUS[l].city,
  ]),
);
