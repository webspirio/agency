/**
 * A BODY CHECK THAT EMITS THE PRODUCT'S BYTES.
 *
 * Not a schema library, and deliberately not one. SPEC 14 rejected `zod` and HARD
 * RULE 6 names it, so this is a combinator set small enough to read in one screen —
 * but the real reason it is hand-written is that its JOB is to emit what a Nest
 * `ValidationPipe` emits, field sentence for field sentence. A general validator
 * would emit its own wording, and a screen that renders `error.details` would show
 * one thing in the demo and another after conversion.
 *
 * MEASURED 2026-09-13 against a freshly scaffolded mock, through the real adapter:
 * `POST /parties` with `{}` answered **500** `Internal server error` — the demo's
 * most common mistake looking like a crash — where the product answers 400 with one
 * sentence per failed field. A forged `id` was accepted with 201 and silently
 * ignored, where the product's `forbidNonWhitelisted: true` answers 400
 * (`reference/contract/frontend-api-client.ts:94` records that setting).
 *
 * What it produces is `string[]`, which is what `message` carries for a validation
 * failure and what `extractErrorDetails` in api-error.ts already reads.
 */

/** One field's rule: a sentence when it is wrong, `undefined` when it is right. */
export type Rule = {
  readonly optional?: true;
  /** @returns the class-validator sentence, given the property name. */
  readonly test: (value: unknown, name: string) => string | undefined;
};

export type Shape = Readonly<Record<string, Rule>>;

export const shape = (fields: Shape): Shape => fields;

const DEC2 = /^-?\d+\.\d{2}$/;

export const s = {
  /** A string. The wording is class-validator's `isString` default. */
  str: (): Rule => ({
    test: (v, name) => (typeof v === 'string' ? undefined : `${name} must be a string`),
  }),

  /**
   * A decimal string with two places. Two sentences, not one, because the product
   * stacks `@IsString()` and `@Matches()` and a screen showing "must be a string"
   * for the value `1` is showing the user something true.
   */
  dec2: (): Rule => ({
    test: (v, name) => {
      if (typeof v !== 'string') return `${name} must be a string`;
      return DEC2.test(v) ? undefined : `${name} must be a decimal string with two places`;
    },
  }),

  /** An absent value passes; a present one is checked. */
  opt: (rule: Rule): Rule => ({ ...rule, optional: true }),
} as const;

/**
 * EVERY failure, never the first — a form shows all its errors at once, and so does
 * a `ValidationPipe`. Declaration order, then unknown properties, which is the order
 * Nest reports them in.
 */
export function check(fields: Shape, body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return ['body must be an object'];
  }
  const value = body as Record<string, unknown>;
  const problems: string[] = [];

  for (const [name, rule] of Object.entries(fields)) {
    const present = Object.hasOwn(value, name) && value[name] !== undefined;
    if (!present) {
      if (!rule.optional) problems.push(...[rule.test(undefined, name)].filter((x) => x !== undefined));
      continue;
    }
    const problem = rule.test(value[name], name);
    if (problem !== undefined) problems.push(problem);
  }

  /* forbidNonWhitelisted. A forged `id` or `created_at` is the case that matters:
     the store assigns both, so the mock IGNORED them and answered 201 while the
     product answers 400. Silently ignoring a field a client sent is the divergence. */
  for (const name of Object.keys(value)) {
    if (!Object.hasOwn(fields, name)) problems.push(`property ${name} should not exist`);
  }

  return problems;
}
