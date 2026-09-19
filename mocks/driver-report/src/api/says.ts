// mocks/driver-report/src/api/says.ts
import type { CodeOf } from '@agency/mock';
import { fmtTime } from '../app/format';
import type { Api } from './contract';

const DAY_CONFIRMED_OFFICE = 'День уже підтверджено — зміни неможливі без «Відкрити для виправлення».';
const TARGET_GONE = 'Запис не знайдено — можливо, водій його скасував.';
export const SAYS_BIND = { BIND_CODE_EXPIRED: 'Код застарів. Попросіть диспетчера показати новий.' } satisfies Record<CodeOf<Api, 'confirmBinding'>, string>;
export const SAYS_DRIVER_WRITE = { DEVICE_REVOKED: 'Цей телефон відключено. Попросіть диспетчера підключити його знову.' } satisfies Record<CodeOf<Api, 'submitRecord' | 'uploadPhoto'>, string>;
export const SAYS_EXCEPTION = { EXCEPTION_NOT_FOUND: 'Цей пункт уже закрито — список оновлено.' } satisfies Record<CodeOf<Api, 'updateException'>, string>;
export const SAYS_STOP_REVIEW = { STOP_NOT_FOUND: 'Цю зупинку не знайдено — можливо, водій скасував запис.', DAY_CONFIRMED: DAY_CONFIRMED_OFFICE,
  VALUE_INVALID: 'Час — чотири цифри, наприклад 0748.' } satisfies Record<CodeOf<Api, 'getStopReview' | 'reviewStop'>, string>;
export const SAYS_REQUEST = { REQUEST_ALREADY_OPEN: 'Уже запитано: {by} {at} · {state}', TARGET_NOT_FOUND: TARGET_GONE } satisfies Record<CodeOf<Api, 'createRequest'>, string>;
export const SAYS_CORRECTION = { TARGET_NOT_FOUND: TARGET_GONE, DAY_CONFIRMED: DAY_CONFIRMED_OFFICE, VALUE_INVALID: 'Лише цифри, до 7 знаків.' } satisfies Record<CodeOf<Api, 'createCorrection'>, string>;
export const SAYS_TRUCK_DAY = { TRUCK_DAY_NOT_FOUND: 'Такого дня немає.',
  DAY_CHANGED: 'День змінено: {by} {at} — {change}. Перегляньте й підтвердіть ще раз.' } satisfies Record<CodeOf<Api, 'getTruckDay' | 'confirmTruckDay' | 'printTruckDay'>, string>;
export const SAYS_EXPORT = { EXPORT_NOT_FOUND: 'Такого файлу немає — сформуйте його ще раз.' } satisfies Record<CodeOf<Api, 'importExport'>, string>;
export const SAYS_TRUCK = { TRUCK_NOT_FOUND: 'Такої машини немає.' } satisfies Record<CodeOf<Api, 'getTruckFuel'>, string>;
export const SAYS_ORIGINAL = { DOCUMENT_NOT_FOUND: 'Такого документа немає.' } satisfies Record<CodeOf<Api, 'receiveOriginal'>, string>;
export const SAYS_DRIVER = { DRIVER_NOT_FOUND: 'Такого водія немає.' } satisfies Record<CodeOf<Api, 'createBindCode'>, string>;

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** Reads the envelope’s ctx and fills {by} {at} {state} {change}. Not branching. Either side of the seam: the mock’s
 *  AxiosError carries the envelope on `.response.data`; the product’s ApiError has no `.response` and carries the
 *  parsed body on `.payload`; a raw DomainError carries `.ctx`. */
export function fillSays(template: string, err: unknown): string {
  const e = err as { response?: { data?: Record<string, unknown> }; payload?: Record<string, unknown>;
    ctx?: Record<string, unknown> } | null;
  const ctx = e?.response?.data ?? e?.payload ?? e?.ctx ?? {};
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = ctx[name];
    if (typeof v !== 'string' || v === '') return '—';
    return INSTANT.test(v) ? fmtTime(v) : v;
  });
}
