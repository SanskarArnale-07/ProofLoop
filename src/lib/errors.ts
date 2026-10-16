import { NextResponse } from 'next/server';
import { redactSensitiveContent } from './github';

export class ApiError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number = 400, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Strips secrets, tokens, file paths, and internal SQLite details from client-facing error strings.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'An error occurred.';

  // 1. Redact API keys, bearer tokens, private keys
  let sanitized = redactSensitiveContent(message);

  // 2. Strip local system file paths (Windows & POSIX)
  sanitized = sanitized.replace(/(?:[a-zA-Z]:\\[^\s:;,"]+|\/(?:home|Users|var|tmp|etc)\/[^\s:;,"]+)/g, '[INTERNAL_PATH]');

  // 3. Mask raw SQLite engine errors
  if (/sqlite/i.test(sanitized) && /syntax|table|column|constraint|readonly|locked|busy/i.test(sanitized)) {
    return 'A database persistence error occurred while processing the request.';
  }

  // 4. Strip stack-trace indicators
  sanitized = sanitized.replace(/\s+at\s+.*(?:\r?\n|$)/g, '');

  return sanitized.trim();
}

/**
 * Maps upstream external service (GitHub, network, database) errors to appropriate HTTP status codes.
 */
export function mapErrorToStatus(error: unknown, defaultStatus = 500): number {
  if (error instanceof ApiError) {
    return error.statusCode;
  }

  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Rate limit detection
  if (msg.includes('rate limit exceeded') || msg.includes('too many requests')) {
    return 429;
  }

  // Not found / private repository without credentials
  if (msg.includes('not found') || msg.includes('does not exist')) {
    return 404;
  }

  // Authentication / Authorization failures
  if (msg.includes('bad credentials') || msg.includes('unauthorized') || msg.includes('token expired')) {
    return 401;
  }

  if (msg.includes('forbidden') || msg.includes('access forbidden') || msg.includes('access is restricted')) {
    return 403;
  }

  // Request validation / Bad client input
  if (
    msg.includes('invalid') ||
    msg.includes('malformed') ||
    msg.includes('syntaxerror') ||
    msg.includes('required') ||
    msg.includes('unsafe url') ||
    msg.includes('prohibited')
  ) {
    return 400;
  }

  // Upstream timeout
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('network error')) {
    return 504;
  }

  return defaultStatus;
}

/**
 * Produces a secure, contract-compliant JSON error response.
 * Never leaks stack traces, secrets, tokens, or internal database schema.
 */
export function createErrorResponse(
  error: unknown,
  fallbackMessage = 'Internal server error occurred.',
  fallbackStatus = 500,
  extraPayload?: Record<string, unknown>
): NextResponse {
  const status = mapErrorToStatus(error, fallbackStatus);
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : fallbackMessage;

  // Log full server-side diagnostic without crashing
  if (status >= 500) {
    console.error(`[ProofLoop API Error ${status}]:`, error);
  } else {
    console.warn(`[ProofLoop API Client Error ${status}]:`, rawMessage);
  }

  let clientMessage: string;
  if (status >= 500) {
    // For 500s, never expose internal exceptions unless explicitly safe
    const sanitized = sanitizeErrorMessage(rawMessage);
    if (/sqlite|database|internal|fatal|syntax|cannot read/i.test(sanitized)) {
      clientMessage = fallbackMessage;
    } else {
      clientMessage = sanitized;
    }
  } else {
    clientMessage = sanitizeErrorMessage(rawMessage);
  }

  const responseBody: Record<string, unknown> = {
    error: clientMessage,
    ...extraPayload
  };

  return NextResponse.json(responseBody, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
