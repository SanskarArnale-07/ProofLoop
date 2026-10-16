import { NextRequest, NextResponse } from 'next/server';
import { InternshipPosting, InternshipRequirement } from './types';

const VALID_CATEGORIES = new Set<string>([
  'core',
  'backend',
  'frontend',
  'database',
  'devops',
  'testing',
  'architecture',
  'general'
]);

const VALID_IMPORTANCE = new Set<string>(['required', 'preferred']);

/**
 * Safely parses the JSON request body.
 * Returns either parsed data or a NextResponse with 400 Bad Request.
 */
export async function safeParseJson<T = Record<string, unknown>>(
  req: NextRequest | Request
): Promise<{ data: T | null; errorResponse: NextResponse | null }> {
  try {
    const text = await req.text();
    if (!text || text.trim().length === 0) {
      return {
        data: null,
        errorResponse: NextResponse.json(
          { error: 'Request body cannot be empty. Valid JSON is required.' },
          { status: 400 }
        )
      };
    }

    if (text.length > 2 * 1024 * 1024) {
      return {
        data: null,
        errorResponse: NextResponse.json(
          { error: 'Request payload exceeds maximum allowed size (2MB).' },
          { status: 413 }
        )
      };
    }

    const data = JSON.parse(text) as T;
    if (typeof data !== 'object' || data === null) {
      return {
        data: null,
        errorResponse: NextResponse.json(
          { error: 'Malformed JSON payload: Root value must be a JSON object.' },
          { status: 400 }
        )
      };
    }

    return { data, errorResponse: null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Invalid JSON';
    return {
      data: null,
      errorResponse: NextResponse.json(
        { error: `Malformed JSON payload in request: ${detail}` },
        { status: 400 }
      )
    };
  }
}

/**
 * Validates resource identifiers (e.g., assessment IDs).
 * Rejects path traversal, whitespace, empty values, and excessively long IDs.
 */
export function validateId(id: unknown, fieldName = 'id'): { valid: boolean; error?: string; cleanId?: string } {
  if (typeof id !== 'string' || id.trim().length === 0) {
    return { valid: false, error: `${fieldName} is required and must be a non-empty string.` };
  }

  const clean = id.trim();
  if (clean.length > 128) {
    return { valid: false, error: `${fieldName} exceeds maximum length of 128 characters.` };
  }

  if (clean.includes('/') || clean.includes('\\') || clean.includes('..')) {
    return { valid: false, error: `${fieldName} contains invalid path characters.` };
  }

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(clean)) {
    return { valid: false, error: `${fieldName} contains invalid characters. Only alphanumeric, dashes, dots, and underscores allowed.` };
  }

  return { valid: true, cleanId: clean };
}

/**
 * Validates GitHub usernames according to GitHub naming conventions.
 */
export function validateGitHubUsername(username: unknown): { valid: boolean; error?: string; cleanUsername?: string } {
  if (typeof username !== 'string' || username.trim().length === 0) {
    return { valid: false, error: 'Username parameter is required.' };
  }

  const clean = username.trim();
  if (clean.length > 39) {
    return { valid: false, error: 'GitHub username cannot exceed 39 characters.' };
  }

  // GitHub usernames: alphanumeric with single hyphens, cannot start or end with hyphen
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(clean)) {
    return { valid: false, error: 'Invalid GitHub username format.' };
  }

  return { valid: true, cleanUsername: clean };
}

/**
 * Validates and strictly parses positive integers (e.g. revision numbers, pagination limits).
 * Rejects float strings ("1.5"), strings with suffix ("1abc"), negative numbers, and zeroes if min > 0.
 */
export function validatePositiveInteger(
  value: unknown,
  fieldName: string,
  min = 1,
  max = 100000
): { valid: boolean; value?: number; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: `${fieldName} is required.` };
  }

  const str = String(value).trim();
  if (!/^\d+$/.test(str)) {
    return { valid: false, error: `Invalid ${fieldName}: must be a positive integer.` };
  }

  const num = parseInt(str, 10);
  if (!Number.isSafeInteger(num) || num < min || num > max) {
    return { valid: false, error: `${fieldName} must be an integer between ${min} and ${max}.` };
  }

  return { valid: true, value: num };
}

/**
 * Validates string bounds.
 */
export function validateString(
  value: unknown,
  fieldName: string,
  minLen = 0,
  maxLen = 500,
  required = false
): { valid: boolean; error?: string; cleanValue?: string } {
  if (value === undefined || value === null) {
    if (required) {
      return { valid: false, error: `${fieldName} is required.` };
    }
    return { valid: true, cleanValue: undefined };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string.` };
  }

  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty.` };
  }

  if (trimmed.length < minLen) {
    return { valid: false, error: `${fieldName} must be at least ${minLen} characters long.` };
  }

  if (trimmed.length > maxLen) {
    return { valid: false, error: `${fieldName} exceeds maximum length of ${maxLen} characters.` };
  }

  return { valid: true, cleanValue: trimmed };
}

/**
 * Extracts authorization token from request headers or body.
 * Supports Authorization: Bearer <token> or Authorization: token <token>.
 */
export function extractAuthToken(
  req: NextRequest | Request,
  bodyToken?: unknown
): string | undefined {
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^(?:Bearer|token)\s+(.+)$/i);
    if (match && match[1]) {
      const token = match[1].trim();
      if (token.length > 0 && token.length <= 500) {
        return token;
      }
    }
  }

  if (typeof bodyToken === 'string' && bodyToken.trim().length > 0) {
    const clean = bodyToken.trim();
    if (clean.length <= 500 && !/[\r\n\t]/.test(clean)) {
      return clean;
    }
  }

  return undefined;
}

/**
 * Validates the internship payload and its requirements collection.
 */
export function validateInternshipPayload(
  internship: unknown
): { valid: boolean; error?: string; cleanPosting?: Partial<InternshipPosting> } {
  if (!internship || typeof internship !== 'object') {
    return { valid: false, error: 'Valid internship posting with requirements is required.' };
  }

  const obj = internship as Record<string, unknown>;

  const titleVal = validateString(obj.title, 'Internship title', 1, 200, false);
  const companyVal = validateString(obj.company, 'Company name', 1, 200, false);
  const sourceUrlVal = validateString(obj.sourceUrl, 'Source URL', 0, 2048, false);

  if (!Array.isArray(obj.requirements)) {
    return { valid: false, error: 'Valid internship posting with requirements is required.' };
  }

  if (obj.requirements.length === 0) {
    return { valid: false, error: 'Internship requirements list cannot be empty.' };
  }

  if (obj.requirements.length > 50) {
    return { valid: false, error: 'Internship requirements exceed maximum allowed limit of 50 items.' };
  }

  const cleanRequirements: InternshipRequirement[] = [];
  const seenReqIds = new Set<string>();

  for (let i = 0; i < obj.requirements.length; i++) {
    const req = obj.requirements[i] as Record<string, unknown>;
    if (!req || typeof req !== 'object') {
      return { valid: false, error: `Requirement at index ${i} is malformed.` };
    }

    const reqId = validateString(req.id, `Requirement id at index ${i}`, 1, 64, true);
    if (!reqId.valid || !reqId.cleanValue) {
      return { valid: false, error: reqId.error || `Requirement at index ${i} missing valid id.` };
    }

    if (seenReqIds.has(reqId.cleanValue)) {
      return { valid: false, error: `Duplicate requirement id "${reqId.cleanValue}" detected.` };
    }
    seenReqIds.add(reqId.cleanValue);

    const title = validateString(req.title, `Requirement title for ${reqId.cleanValue}`, 1, 200, true);
    if (!title.valid || !title.cleanValue) {
      return { valid: false, error: title.error || `Requirement "${reqId.cleanValue}" missing title.` };
    }

    const description = validateString(req.description, `Requirement description for ${reqId.cleanValue}`, 0, 2000, false);

    let category: InternshipRequirement['category'] = 'general';
    if (typeof req.category === 'string' && VALID_CATEGORIES.has(req.category.toLowerCase())) {
      category = req.category.toLowerCase() as InternshipRequirement['category'];
    }

    let importance: InternshipRequirement['importance'] = 'required';
    if (typeof req.importance === 'string' && VALID_IMPORTANCE.has(req.importance.toLowerCase())) {
      importance = req.importance.toLowerCase() as InternshipRequirement['importance'];
    }

    cleanRequirements.push({
      id: reqId.cleanValue,
      title: title.cleanValue,
      description: description.cleanValue || '',
      category,
      importance,
      isInferred: Boolean(req.isInferred)
    });
  }

  return {
    valid: true,
    cleanPosting: {
      id: typeof obj.id === 'string' && obj.id ? obj.id.slice(0, 64) : undefined,
      title: titleVal.cleanValue || 'Software Engineering Intern',
      company: companyVal.cleanValue || 'Technology Company',
      sourceUrl: sourceUrlVal.cleanValue || 'https://proofloop.local',
      rawText: typeof obj.rawText === 'string' ? obj.rawText.slice(0, 15000) : undefined,
      requirements: cleanRequirements,
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString()
    }
  };
}

/**
 * Validates a GitHub repository URL or shorthand (e.g. owner/repo).
 */
export function validateRepoUrlInput(repoUrl: unknown): { valid: boolean; error?: string; cleanUrl?: string } {
  if (typeof repoUrl !== 'string' || repoUrl.trim().length === 0) {
    return { valid: false, error: 'Repository URL is required.' };
  }

  const clean = repoUrl.trim();
  if (clean.length > 500) {
    return { valid: false, error: 'Repository URL exceeds maximum length of 500 characters.' };
  }

  return { valid: true, cleanUrl: clean };
}
