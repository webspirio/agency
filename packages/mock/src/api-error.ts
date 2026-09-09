import type { AxiosInstance } from 'axios';

/**
 * Ported from the product's `shared/api/client.ts` (reference/contract/
 * frontend-api-client.ts) with the auth half dropped — a mock has no token.
 *
 * It lives HERE, not in the template, because SPEC §6.3's promise is that
 * everything above the seam is byte-identical to the product: a copy in the
 * template would be a copy per mock, and a fix would have to be made in each
 * of them. The template imports it; the seam stays one line.
 */
export class ApiError extends Error {
  readonly status: number;
  /**
   * The raw `message` array from the backend body, when the response carried one
   * (e.g. class-validator's per-field messages) — preserved so forms can map
   * field-level validation errors. `message` (the flattened string) is
   * unaffected either way.
   */
  readonly details?: string[];
  /**
   * Machine-readable error code the backend attaches to 4xx bodies (e.g.
   * `SHIFT_CLOSED`) — THE discriminator. Branch on this, never on the
   * human-readable message. Undefined when the response carried none.
   */
  readonly code?: string;
  /**
   * The raw parsed JSON error body — `code`'s context fields travel here (e.g.
   * a `field` name for a validation error). Read specific fields off it, never
   * render it wholesale.
   */
  readonly payload?: Record<string, unknown>;
  /**
   * The body's `reason` field, when it carried a string one — lets a caller
   * branch on *why* a request was denied without parsing the human-facing
   * message.
   */
  readonly reason?: string;

  constructor(
    status: number,
    message: string,
    details?: string[],
    code?: string,
    payload?: Record<string, unknown>,
    reason?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
    this.payload = payload;
    this.reason = reason;
  }
}

/** The backend's machine-readable `code` field, if the error body carried one. */
export function extractErrorCode(body: unknown): string | undefined {
  const code = (body as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Narrow an unknown thrown value to `ApiError` and read its `code`, if any. */
export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

/** The parsed JSON error body, when it was an object — carries `code`'s context fields. */
export function extractErrorPayload(body: unknown): Record<string, unknown> | undefined {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : undefined;
}

export function extractErrorMessage(status: number, body: unknown): string {
  const message = (body as { message?: string | string[] } | undefined)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return `Request failed with status ${status}`;
}

/** The backend's raw `message` array, if the response body carried one — undefined otherwise. */
export function extractErrorDetails(body: unknown): string[] | undefined {
  const message = (body as { message?: string | string[] } | undefined)?.message;
  return Array.isArray(message) ? message : undefined;
}

/** The backend's machine-readable `reason` code, if the body carried a string one. */
export function extractErrorReason(body: unknown): string | undefined {
  const reason = (body as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' ? reason : undefined;
}

/**
 * Tracks what this module attached to each client so a second call REPLACES
 * rather than stacks. Axios has no built-in "is this attached" query, and
 * stacked handlers are silently destructive here: the second error handler
 * receives the first's `ApiError`, which carries no `.response`, so every
 * status collapses to 0 and the symptom points nowhere near the cause.
 *
 * Eject-and-replace rather than a skip-if-present guard, deliberately: a guard
 * would make a re-attach — an HMR reload, or an app wiring the client from two
 * entry points — silently keep the stale handler. This makes the function a
 * "set", not an "add". Keyed by client instance, so separate clients never
 * interfere.
 */
const attached = new WeakMap<AxiosInstance, number>();

/**
 * Maps every rejected response into `ApiError`. The mock adapter throws an
 * AxiosError whose `response.data` is the same envelope the real
 * `AllExceptionsFilter` emits, so this is the product's interceptor unchanged —
 * which is the point: a screen's error handling cannot behave one way in the
 * demo and another after conversion.
 */
export function attachErrorInterceptor(client: AxiosInstance): void {
  const prior = attached.get(client);
  if (prior !== undefined) client.interceptors.response.eject(prior);

  const res = client.interceptors.response.use(
    (response) => response,
    (error: { response?: { status?: number; data?: unknown } }) => {
      const status = error?.response?.status ?? 0;
      const body = error?.response?.data;
      return Promise.reject(
        new ApiError(
          status,
          extractErrorMessage(status, body),
          extractErrorDetails(body),
          extractErrorCode(body),
          extractErrorPayload(body),
          extractErrorReason(body),
        ),
      );
    },
  );

  attached.set(client, res);
}
