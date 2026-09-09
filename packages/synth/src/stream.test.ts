import { describe, it, expect } from 'vitest';
import { createStream, CORPUS, ALL_NAMES, ALL_TERMS, type Locale, type LocaleCorpus } from './index';

const LOCALES: Locale[] = ['de', 'uk'];
const LISTS: (keyof LocaleCorpus)[] = ['given', 'family', 'company', 'street', 'city'];

/** `draw(n, f)` rather than `for (let i = 0; i < n; i++)`: `<` is restricted syntax here. */
const draw = <T>(n: number, f: () => T): T[] => Array.from({ length: n }, f);

const ALPHABET: Record<Locale, ReadonlySet<string>> = {
  de: new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüß'),
  uk: new Set('АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя'),
};
/** Separators a proper name may legitimately contain. */
const SEPARATORS = new Set([' ', '-', '&', 'ʼ']);

const inAlphabet = (locale: Locale, text: string): boolean =>
  [...text].every((ch) => ALPHABET[locale].has(ch) || SEPARATORS.has(ch));

describe('createStream — deterministic given a seed', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = createStream(20260909);
    const b = createStream(20260909);
    expect(draw(50, () => a.person('de'))).toEqual(draw(50, () => b.person('de')));
  });

  it('produces a different sequence for a different seed', () => {
    const a = draw(20, ((s) => () => s.person('de'))(createStream(1)));
    const b = draw(20, ((s) => () => s.person('de'))(createStream(2)));
    expect(a).not.toEqual(b);
  });

  it('stays inside the declared range', () => {
    const s = createStream(7);
    for (const n of draw(500, () => s.int(10))) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('draws integers, never a float — nothing in this package goes through one', () => {
    const s = createStream(3);
    expect(draw(200, () => s.int(7)).every((n) => Number.isInteger(n))).toBe(true);
  });

  it('is not degenerate — 200 draws over a 22-name list use most of the list', () => {
    const s = createStream(99);
    expect(new Set(draw(200, () => s.pick(CORPUS.de.given))).size).toBeGreaterThanOrEqual(20);
  });
});

/**
 * The stream takes a locale and every one of its lists is indexed by it, so a locale
 * that is read once and then dropped — `CORPUS.de.given` hard-coded — still returns
 * real corpus names, still satisfies ALL_NAMES, and still passes every test above.
 * That mutant was run: 18/18 green while emitting 'Hans Müller' for `--locale uk`.
 * It is SPEC §337's blind green on 'Hans Müller' with the scripts swapped, and it is
 * the one defect in this package a demo audience would notice before a check did.
 */
describe('createStream — locale fidelity', () => {
  it('emits every locale in its own script, never the other locale’s', () => {
    const s = createStream(2026);
    const foreign: string[] = [];
    for (const locale of LOCALES) {
      for (const value of draw(60, () => s.person(locale))) {
        if (!inAlphabet(locale, value)) foreign.push(locale + ' person ' + value);
      }
      for (const value of draw(60, () => s.company(locale))) {
        if (!inAlphabet(locale, value)) foreign.push(locale + ' company ' + value);
      }
      for (const addr of draw(60, () => s.address(locale))) {
        const [line = '', city = ''] = addr.split(', ');
        const street = line.replace(/ \d+$/, '');
        if (!inAlphabet(locale, street)) foreign.push(locale + ' street ' + street);
        if (!inAlphabet(locale, city)) foreign.push(locale + ' city ' + city);
      }
    }
    expect(foreign).toEqual([]);
  });

  it('draws each locale from that locale’s own lists', () => {
    const s = createStream(77);
    for (const locale of LOCALES) {
      const given = new Set(CORPUS[locale].given);
      const family = new Set(CORPUS[locale].family);
      for (const value of draw(60, () => s.person(locale))) {
        const [g = '', f = ''] = value.split(' ');
        expect(given.has(g)).toBe(true);
        expect(family.has(f)).toBe(true);
      }
      expect(CORPUS[locale].company).toContain(s.company(locale));
    }
  });
});

describe('corpus', () => {
  it('carries both locales the agency actually sells into', () => {
    expect(Object.keys(CORPUS).sort((a, b) => a.localeCompare(b))).toEqual(['de', 'uk']);
    for (const locale of LOCALES) {
      expect(CORPUS[locale].given.length).toBeGreaterThanOrEqual(20);
      expect(CORPUS[locale].family.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('includes German names with umlauts, which a Cyrillic-only regex misses', () => {
    expect(CORPUS.de.family).toContain('Müller');
  });

  it('exports every name as one closed set for the allow-list check', () => {
    expect(ALL_NAMES.has('Müller')).toBe(true);
    expect(ALL_NAMES.has('Шевченко')).toBe(true);
    expect(ALL_NAMES.has('Nonexistent')).toBe(false);
  });

  it('every generated person is composed only of corpus names', () => {
    const s = createStream(42);
    for (const person of draw(200, () => s.person('uk'))) {
      for (const part of person.split(' ')) expect(ALL_NAMES.has(part)).toBe(true);
    }
  });
});

/**
 * The corpus is DATA, and corrupt data fails silently: a name whose capital has been
 * replaced by a lookalike from another script still renders, still gets picked, and
 * still ships — it has simply stopped being the name anyone typed, and no test that
 * only counts entries will ever say so. The plan shipped exactly that: 'Федір' with
 * a Hebrew final pe (U+05E3) where the Ф belongs. These are the guards that make the
 * next one loud.
 */
describe('corpus integrity', () => {
  const entries = (): { locale: Locale; list: keyof LocaleCorpus; value: string }[] =>
    LOCALES.flatMap((locale) =>
      LISTS.flatMap((list) => CORPUS[locale][list].map((value) => ({ locale, list, value }))),
    );

  const label = (e: { locale: Locale; list: keyof LocaleCorpus; value: string }): string =>
    e.locale + '.' + e.list + ' ' + JSON.stringify(e.value);

  it('spells every entry in its own locale alphabet and nothing else', () => {
    const offAlphabet = entries()
      .filter(({ locale, value }) =>
        [...value].some((ch) => !ALPHABET[locale].has(ch) && !SEPARATORS.has(ch)),
      )
      .map((e) => {
        const points = [...e.value]
          .map((ch) => 'U+' + (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0'))
          .join(' ');
        return label(e) + ' -> ' + points;
      });
    expect(offAlphabet).toEqual([]);
  });

  it('capitalises every entry — a lowercase first letter is the signature of a swapped capital', () => {
    const uncapitalised = entries()
      .filter(({ value }) => {
        const first = [...value][0] ?? '';
        return first === first.toLowerCase();
      })
      .map(label);
    expect(uncapitalised).toEqual([]);
  });

  it('is NFC-normalised, so a decomposed umlaut cannot defeat Set membership', () => {
    expect(entries().filter(({ value }) => value.normalize('NFC') !== value).map(label)).toEqual([]);
    // The failure this prevents: an NFD spelling renders identically and misses the Set.
    expect(ALL_NAMES.has('Müller'.normalize('NFD'))).toBe(false);
  });

  it('has no duplicate entry, within a list or across them', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const e of entries()) {
      const key = e.locale + '|' + e.value;
      if (seen.has(key)) duplicates.push(label(e));
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it('carries Федір spelled in Cyrillic — the entry the plan shipped corrupted', () => {
    expect(CORPUS.uk.given).toContain('Федір');
    expect(ALL_NAMES.has('Федір')).toBe(true);
    expect(ALL_NAMES.has(String.fromCodePoint(0x05e3) + 'едір')).toBe(false);
  });
});

/**
 * ALL_NAMES is people only, because that is the question Plan B's `synth:names`
 * allow-list asks of a two-or-three-capitalised-words literal. But 'Bad Segeberg'
 * and 'Ягідний Край' have that same shape, so a check built on ALL_NAMES alone
 * would red-flag the corpus's own output. ALL_TERMS is the full closure.
 */
describe('ALL_TERMS closes the corpus over everything a stream can emit', () => {
  it('contains the company, street and city vocabulary that ALL_NAMES does not', () => {
    expect(ALL_NAMES.has('Bad Segeberg')).toBe(false);
    expect(ALL_TERMS.has('Bad Segeberg')).toBe(true);
    expect(ALL_TERMS.has('Nordlicht Logistik')).toBe(true);
    expect(ALL_TERMS.has('Ягідний Край')).toBe(true);
    expect(ALL_TERMS.has('Müller')).toBe(true);
    expect(ALL_TERMS.has('Nonexistent')).toBe(false);
  });

  it('is a superset of ALL_NAMES', () => {
    for (const name of ALL_NAMES) expect(ALL_TERMS.has(name)).toBe(true);
  });

  it('every generated company traces to the corpus', () => {
    const s = createStream(11);
    for (const locale of LOCALES) {
      for (const name of draw(100, () => s.company(locale))) {
        expect(ALL_TERMS.has(name)).toBe(true);
      }
    }
  });

  it('every generated address decomposes into a corpus street and a corpus city', () => {
    const s = createStream(13);
    for (const locale of LOCALES) {
      for (const addr of draw(100, () => s.address(locale))) {
        const [line = '', city = ''] = addr.split(', ');
        const street = line.replace(/ \d+$/, '');
        expect(ALL_TERMS.has(street)).toBe(true);
        expect(ALL_TERMS.has(city)).toBe(true);
        expect(line).not.toBe(street); // the house number was really there
      }
    }
  });
});
