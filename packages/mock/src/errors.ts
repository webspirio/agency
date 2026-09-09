export type ErrorEnvelope = {
  statusCode: number;
  /** Canonical HTTP phrase. DECORATIVE — never branch on it. */
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
  /** THE discriminator. Every client branch reads this and nothing else. */
  code?: string;
  [context: string]: unknown;
};

export class DomainError extends Error {
  readonly messages: string | string[];

  constructor(
    readonly status: number,
    readonly code: string,
    message: string | string[],
    readonly ctx?: Record<string, unknown>,
  ) {
    super(Array.isArray(message) ? message.join('; ') : message);
    this.name = 'DomainError';
    this.messages = message;
  }
}

const PHRASES: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  409: 'Conflict', 410: 'Gone', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Internal Server Error', 503: 'Service Unavailable',
};

export function envelopeOf(e: DomainError, path: string, now: string): ErrorEnvelope {
  // Context first, envelope second: envelope keys always win.
  return {
    ...e.ctx,
    statusCode: e.status,
    error: PHRASES[e.status] ?? 'Error',
    message: e.messages,
    code: e.code,
    path,
    timestamp: now,
  };
}
