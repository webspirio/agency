import { CORPUS, type Locale } from './corpus';

export type Stream = {
  int(maxExclusive: number): number;
  pick<T>(xs: readonly T[]): T;
  person(locale: Locale): string;
  company(locale: Locale): string;
  address(locale: Locale): string;
};

/**
 * mulberry32 — small, fast, and identical across engines, so a seed pins the demo.
 *
 * Stopped one step short of the customary `/ 4294967296`: a draw stays a 32-bit
 * integer and is reduced with `%`, so no value in this package passes through a
 * float. That is not fastidiousness. The float form spells the reduction
 * `Math.floor(next() * maxExclusive)`, which trips two of `oxlint.base.json`'s
 * restricted-syntax selectors (`*` and `/`), and the only ways to keep it would
 * have been to exempt this file in a config owned by another task or to weaken
 * the rule — neither permitted. The integer form needs no exemption and loses
 * nothing: the reduction bias over 2^32 is below one part in 10^8.
 */
export function createStream(seed: number): Stream {
  let state = seed >>> 0;
  const next32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  const stream: Stream = {
    int: (maxExclusive) => next32() % maxExclusive,
    pick: (xs) => xs[next32() % xs.length] as never,
    person: (locale) => `${stream.pick(CORPUS[locale].given)} ${stream.pick(CORPUS[locale].family)}`,
    company: (locale) => stream.pick(CORPUS[locale].company),
    address: (locale) =>
      `${stream.pick(CORPUS[locale].street)} ${stream.int(80) + 1}, ${stream.pick(CORPUS[locale].city)}`,
  };
  return stream;
}
