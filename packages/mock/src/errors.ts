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

/**
 * The canonical reason phrases, as `http.STATUS_CODES` spells them — which is
 * what express and Nest put in this field. DECORATIVE: it exists so an error
 * surface can render something human, and a JS class name here ('Error',
 * 'ConflictException') is the leak this table exists to prevent.
 */
const PHRASES: Record<number, string> = {
  100: 'Continue', 101: 'Switching Protocols', 102: 'Processing', 103: 'Early Hints',
  200: 'OK', 201: 'Created', 202: 'Accepted', 203: 'Non-Authoritative Information',
  204: 'No Content', 205: 'Reset Content', 206: 'Partial Content', 207: 'Multi-Status',
  208: 'Already Reported', 226: 'IM Used',
  300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
  304: 'Not Modified', 305: 'Use Proxy', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable',
  407: 'Proxy Authentication Required', 408: 'Request Timeout', 409: 'Conflict',
  410: 'Gone', 411: 'Length Required', 412: 'Precondition Failed', 413: 'Payload Too Large',
  414: 'URI Too Long', 415: 'Unsupported Media Type', 416: 'Range Not Satisfiable',
  417: 'Expectation Failed', 418: "I'm a Teapot", 421: 'Misdirected Request',
  422: 'Unprocessable Entity', 423: 'Locked', 424: 'Failed Dependency', 425: 'Too Early',
  426: 'Upgrade Required', 428: 'Precondition Required', 429: 'Too Many Requests',
  431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates', 507: 'Insufficient Storage', 508: 'Loop Detected',
  510: 'Not Extended', 511: 'Network Authentication Required',
};

/** Fallback by status CLASS, read off the leading digit. Never a JS class name. */
const CLASS_PHRASES: Record<string, string> = {
  '1': 'Informational', '2': 'Success', '3': 'Redirection',
  '4': 'Client Error', '5': 'Server Error',
};

function phraseOf(status: number): string {
  return PHRASES[status] ?? CLASS_PHRASES[String(status).charAt(0)] ?? 'Unknown Status';
}

/**
 * `requestId` is the correlation id the real filter stamps on every error
 * (`all-exceptions.filter.ts` sets it from `request.id`). The adapter passes a
 * store-assigned one per request; it is written LAST so a ctx field of the same
 * name cannot forge it, and omitted entirely when none was supplied rather than
 * emitting an `undefined`-valued key JSON would drop anyway.
 */
export function envelopeOf(
  e: DomainError,
  path: string,
  now: string,
  requestId?: string,
): ErrorEnvelope {
  // Context first, envelope second: envelope keys always win.
  const envelope: ErrorEnvelope = {
    ...e.ctx,
    statusCode: e.status,
    error: phraseOf(e.status),
    message: e.messages,
    code: e.code,
    path,
    timestamp: now,
  };
  if (requestId !== undefined) envelope.requestId = requestId;
  return envelope;
}
