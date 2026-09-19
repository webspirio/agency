// mocks/driver-report/src/api/shapes.ts
import type { Rule } from '@agency/mock';
/** Local body rules in the product’s ValidationPipe wording. A shape answers "is this the right SHAPE"; a domain
 *  rule answers "is this a legal value" — never both for one field. */
export const int = (): Rule => ({ test: (v, name) => (typeof v === 'number' && Number.isInteger(v) ? undefined : `${name} must be an integer number`) });
export const oneOf = (values: readonly string[]): Rule => ({
  test: (v, name) => (typeof v === 'string' && values.includes(v) ? undefined : `${name} must be one of the following values: ${values.join(', ')}`) });
export const obj = (): Rule => ({ test: (v, name) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? undefined : `${name} must be an object`) });
export const strs = (): Rule => ({ test: (v, name) => {
  if (!Array.isArray(v)) return `${name} must be an array`;
  return v.every((x) => typeof x === 'string') ? undefined : `each value in ${name} must be a string`;
} });
