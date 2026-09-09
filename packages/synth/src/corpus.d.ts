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
export declare const CORPUS: Record<Locale, LocaleCorpus>;
/** People only: given + family, across every locale. See ALL_TERMS below. */
export declare const ALL_NAMES: ReadonlySet<string>;
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
export declare const ALL_TERMS: ReadonlySet<string>;
