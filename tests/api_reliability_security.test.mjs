import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const {
  safeParseJson,
  validateId,
  validateGitHubUsername,
  validatePositiveInteger,
  validateString,
  extractAuthToken,
  validateInternshipPayload,
  validateRepoUrlInput
} = jiti('../src/lib/validation.ts');

const {
  sanitizeErrorMessage,
  mapErrorToStatus,
  createErrorResponse,
  ApiError
} = jiti('../src/lib/errors.ts');

const {
  validateUrlSafety
} = jiti('../src/lib/scraper.ts');

const {
  safeJsonParse
} = jiti('../src/lib/db.ts');

// ============================================================================
// 1. Safe JSON Parsing and Malformed Payload Handling
// ============================================================================

test('Validation: safeParseJson rejects empty or whitespace-only bodies with 400', async () => {
  const reqEmpty = new Request('http://localhost/api/test', {
    method: 'POST',
    body: ''
  });
  const resEmpty = await safeParseJson(reqEmpty);
  assert.equal(resEmpty.data, null);
  assert.ok(resEmpty.errorResponse);
  assert.equal(resEmpty.errorResponse.status, 400);

  const reqSpaces = new Request('http://localhost/api/test', {
    method: 'POST',
    body: '   \n  \t  '
  });
  const resSpaces = await safeParseJson(reqSpaces);
  assert.equal(resSpaces.data, null);
  assert.equal(resSpaces.errorResponse.status, 400);
});

test('Validation: safeParseJson rejects malformed JSON with 400 Bad Request', async () => {
  const malformedBodies = [
    '{ unclosed json ',
    '{"key": undefined}',
    '{"trailingComma": 1,}',
    '<html><body>Not JSON</body></html>',
    'NaN',
    'True'
  ];

  for (const body of malformedBodies) {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      body
    });
    const res = await safeParseJson(req);
    assert.equal(res.data, null, `Body "${body}" should not parse`);
    assert.ok(res.errorResponse);
    assert.equal(res.errorResponse.status, 400);
  }
});

test('Validation: safeParseJson rejects non-object root JSON values with 400', async () => {
  const nonObjectRoots = ['"just a string"', '12345', 'true', 'false'];

  for (const body of nonObjectRoots) {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      body
    });
    const res = await safeParseJson(req);
    assert.equal(res.data, null);
    assert.ok(res.errorResponse);
    assert.equal(res.errorResponse.status, 400);
  }
});

test('Validation: safeParseJson successfully parses valid JSON objects', async () => {
  const validPayload = { internship: { id: 'job-1' }, repoUrl: 'owner/repo' };
  const req = new Request('http://localhost/api/test', {
    method: 'POST',
    body: JSON.stringify(validPayload)
  });
  const res = await safeParseJson(req);
  assert.equal(res.errorResponse, null);
  assert.deepEqual(res.data, validPayload);
});

// ============================================================================
// 2. Resource Identifier & Path Validation
// ============================================================================

test('Validation: validateId strictly rejects invalid IDs, path traversal, and empty values', () => {
  // Invalid inputs
  assert.equal(validateId('').valid, false);
  assert.equal(validateId('   ').valid, false);
  assert.equal(validateId(null).valid, false);
  assert.equal(validateId(undefined).valid, false);
  assert.equal(validateId(12345).valid, false);

  // Path traversal attacks
  assert.equal(validateId('../evil-id').valid, false);
  assert.equal(validateId('..\\evil-id').valid, false);
  assert.equal(validateId('folder/subfolder').valid, false);
  assert.equal(validateId('folder\\subfolder').valid, false);

  // Invalid special characters
  assert.equal(validateId('id with spaces').valid, false);
  assert.equal(validateId('id$special!').valid, false);
  assert.equal(validateId('id;DROP TABLE assessments;').valid, false);

  // Length limit (exceeding 128 characters)
  const tooLong = 'a'.repeat(129);
  assert.equal(validateId(tooLong).valid, false);

  // Valid IDs
  assert.equal(validateId('sample-assessment-stripe').valid, true);
  assert.equal(validateId('assess-m3x9-7a1b').valid, true);
  assert.equal(validateId('rev_123_test.01').valid, true);
});

// ============================================================================
// 3. GitHub Username Validation
// ============================================================================

test('Validation: validateGitHubUsername enforces GitHub naming rules and bounds', () => {
  assert.equal(validateGitHubUsername('').valid, false);
  assert.equal(validateGitHubUsername('   ').valid, false);
  assert.equal(validateGitHubUsername(null).valid, false);
  assert.equal(validateGitHubUsername('-starts-with-hyphen').valid, false);
  assert.equal(validateGitHubUsername('ends-with-hyphen-').valid, false);
  assert.equal(validateGitHubUsername('contains..dots').valid, false);
  assert.equal(validateGitHubUsername('user@domain').valid, false);
  assert.equal(validateGitHubUsername('a'.repeat(40)).valid, false);

  // Valid usernames
  assert.equal(validateGitHubUsername('octocat').valid, true);
  assert.equal(validateGitHubUsername('alex-chen').valid, true);
  assert.equal(validateGitHubUsername('Developer2026').valid, true);
});

// ============================================================================
// 4. Positive Integer & Query Parameter Validation
// ============================================================================

test('Validation: validatePositiveInteger rejects non-integers, floats, negative values, and suffixes', () => {
  // Suffix flaw (parseInt("1abc") = 1) must be rejected
  assert.equal(validatePositiveInteger('1abc', 'rev').valid, false);
  assert.equal(validatePositiveInteger('100px', 'rev').valid, false);

  // Negative and zeroes
  assert.equal(validatePositiveInteger('-5', 'rev').valid, false);
  assert.equal(validatePositiveInteger('0', 'rev', 1).valid, false);

  // Floats
  assert.equal(validatePositiveInteger('1.5', 'rev').valid, false);
  assert.equal(validatePositiveInteger('3.14159', 'rev').valid, false);

  // Out of range
  assert.equal(validatePositiveInteger('100001', 'rev', 1, 100000).valid, false);

  // Valid integers
  const res1 = validatePositiveInteger('1', 'rev');
  assert.equal(res1.valid, true);
  assert.equal(res1.value, 1);

  const res2 = validatePositiveInteger('42', 'rev');
  assert.equal(res2.valid, true);
  assert.equal(res2.value, 42);

  const res3 = validatePositiveInteger(10, 'rev');
  assert.equal(res3.valid, true);
  assert.equal(res3.value, 10);
});

// ============================================================================
// 5. Internship Payload & Requirements Validation
// ============================================================================

test('Validation: validateInternshipPayload enforces structure, limits, and uniqueness', () => {
  // Missing or non-object
  assert.equal(validateInternshipPayload(null).valid, false);
  assert.equal(validateInternshipPayload('string').valid, false);
  assert.equal(validateInternshipPayload({}).valid, false);

  // Empty requirements
  assert.equal(validateInternshipPayload({ requirements: [] }).valid, false);

  // Requirements > 50
  const manyReqs = [];
  for (let i = 0; i < 51; i++) {
    manyReqs.push({ id: `req-${i}`, title: `Skill ${i}` });
  }
  assert.equal(validateInternshipPayload({ requirements: manyReqs }).valid, false);

  // Duplicate requirement IDs
  const dupReqs = [
    { id: 'req-api', title: 'REST API' },
    { id: 'req-api', title: 'Duplicate REST API' }
  ];
  const dupResult = validateInternshipPayload({ requirements: dupReqs });
  assert.equal(dupResult.valid, false);
  assert.ok(dupResult.error.includes('Duplicate requirement id'));

  // Valid payload with category and importance normalization
  const validPayload = {
    title: 'Backend Engineering Intern',
    company: 'Stripe',
    requirements: [
      { id: 'req-api', title: 'REST API', category: 'backend', importance: 'required' },
      { id: 'req-db', title: 'Database Design', category: 'database', importance: 'preferred' }
    ]
  };
  const valResult = validateInternshipPayload(validPayload);
  assert.equal(valResult.valid, true);
  assert.equal(valResult.cleanPosting.requirements.length, 2);
  assert.equal(valResult.cleanPosting.requirements[0].category, 'backend');
  assert.equal(valResult.cleanPosting.requirements[1].importance, 'preferred');
});

test('Validation: validateString and validateRepoUrlInput enforce limits and clean values', () => {
  assert.equal(validateString(null, 'field', 0, 10, true).valid, false);
  assert.equal(validateString(12345, 'field', 0, 10).valid, false);
  assert.equal(validateString('a'.repeat(20), 'field', 0, 10).valid, false);
  assert.equal(validateString('  hello world  ', 'field', 1, 20).cleanValue, 'hello world');

  assert.equal(validateRepoUrlInput('').valid, false);
  assert.equal(validateRepoUrlInput('   ').valid, false);
  assert.equal(validateRepoUrlInput('a'.repeat(501)).valid, false);
  assert.equal(validateRepoUrlInput('https://github.com/alexchen/payment-orchestrator').valid, true);
});

// ============================================================================
// 6. Token Extraction & Authorization Support
// ============================================================================

test('Authentication: extractAuthToken parses Bearer and token schemes safely', () => {
  const reqBearer = new Request('http://localhost/api/test', {
    headers: { 'Authorization': 'Bearer ghp_validToken1234567890abcdef' }
  });
  assert.equal(extractAuthToken(reqBearer), 'ghp_validToken1234567890abcdef');

  const reqTokenScheme = new Request('http://localhost/api/test', {
    headers: { 'Authorization': 'token ghp_validToken1234567890abcdef' }
  });
  assert.equal(extractAuthToken(reqTokenScheme), 'ghp_validToken1234567890abcdef');

  // Fallback to body token if no header present
  const reqNoHeader = new Request('http://localhost/api/test');
  assert.equal(extractAuthToken(reqNoHeader, 'body_token_abc'), 'body_token_abc');

  // Header takes precedence over body token
  assert.equal(extractAuthToken(reqBearer, 'body_token_ignored'), 'ghp_validToken1234567890abcdef');

  // Rejects control characters / newlines in tokens
  assert.equal(extractAuthToken(reqNoHeader, 'token\nwith\rnewlines'), undefined);
});

// ============================================================================
// 7. SSRF Protection Edge Cases
// ============================================================================

test('Security SSRF: Hardened check blocks cloud metadata, loopback ranges, IPv6, and unsafe ports', () => {
  // Cloud metadata endpoint (AWS / GCP / Azure)
  assert.equal(validateUrlSafety('http://169.254.169.254/latest/meta-data').safe, false);
  assert.equal(validateUrlSafety('http://169.254.1.1').safe, false);

  // Full 127.0.0.0/8 loopback range
  assert.equal(validateUrlSafety('http://127.0.0.2/admin').safe, false);
  assert.equal(validateUrlSafety('http://127.1.2.3:8080').safe, false);

  // IPv6 loopback & link-local
  assert.equal(validateUrlSafety('http://[::1]/internal').safe, false);
  assert.equal(validateUrlSafety('http://[::]/').safe, false);
  assert.equal(validateUrlSafety('http://[fe80::1]/').safe, false);
  assert.equal(validateUrlSafety('http://[fc00::1]/').safe, false);

  // Sensitive non-web ports
  assert.equal(validateUrlSafety('http://public-site.com:22/').safe, false); // SSH
  assert.equal(validateUrlSafety('http://public-site.com:3306/').safe, false); // MySQL
  assert.equal(validateUrlSafety('http://public-site.com:5432/').safe, false); // PostgreSQL
  assert.equal(validateUrlSafety('http://public-site.com:6379/').safe, false); // Redis
  assert.equal(validateUrlSafety('http://public-site.com:27017/').safe, false); // MongoDB

  // Standard web ports accepted
  assert.equal(validateUrlSafety('https://stripe.com:443/jobs').safe, true);
  assert.equal(validateUrlSafety('http://example.com:80/jobs').safe, true);
  assert.equal(validateUrlSafety('https://jobs.lever.co/posting').safe, true);
});

// ============================================================================
// 8. Secrets Redaction & Error Message Sanitization
// ============================================================================

test('Security: sanitizeErrorMessage scrubs GitHub tokens, private keys, file paths, and SQLite syntax', () => {
  const tokenMsg = 'Failed to connect using token ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8';
  const scrubbedToken = sanitizeErrorMessage(tokenMsg);
  assert.ok(!scrubbedToken.includes('ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8'));
  assert.ok(scrubbedToken.includes('[REDACTED_GITHUB_TOKEN]'));

  const pathMsg = 'Error in C:\\Users\\Administrator\\AppData\\secret\\db.ts at line 42';
  const scrubbedPath = sanitizeErrorMessage(pathMsg);
  assert.ok(!scrubbedPath.includes('C:\\Users\\Administrator'));
  assert.ok(scrubbedPath.includes('[INTERNAL_PATH]'));

  const sqliteMsg = 'SqliteError: near "SYNTAX_ERROR": table users has no column named password';
  const scrubbedSqlite = sanitizeErrorMessage(sqliteMsg);
  assert.ok(!scrubbedSqlite.includes('SYNTAX_ERROR'));
  assert.ok(!scrubbedSqlite.includes('table users'));
  assert.ok(scrubbedSqlite.includes('database persistence error'));
});

// ============================================================================
// 9. Status Code Mapping
// ============================================================================

test('Reliability: mapErrorToStatus correctly categorizes error classes', () => {
  assert.equal(mapErrorToStatus(new Error('GitHub API rate limit exceeded')), 429);
  assert.equal(mapErrorToStatus(new Error('Repository user/repo not found')), 404);
  assert.equal(mapErrorToStatus(new Error('User alexchen not found')), 404);
  assert.equal(mapErrorToStatus(new Error('Bad credentials unauthorized')), 401);
  assert.equal(mapErrorToStatus(new Error('GitHub access forbidden: 403')), 403);
  assert.equal(mapErrorToStatus(new Error('Malformed JSON payload')), 400);
  assert.equal(mapErrorToStatus(new Error('Invalid URL format')), 400);
  assert.equal(mapErrorToStatus(new Error('Unexpected disk read error')), 500);

  const customApiError = new ApiError('Not acceptable', 406);
  assert.equal(mapErrorToStatus(customApiError), 406);
});

// ============================================================================
// 10. Database Safe JSON Parsing Resilience
// ============================================================================

test('Database Resilience: safeJsonParse recovers gracefully from corrupted JSON records', () => {
  assert.deepEqual(safeJsonParse('{ corrupted json', []), []);
  assert.deepEqual(safeJsonParse(null, { defaultVal: true }), { defaultVal: true });
  assert.deepEqual(safeJsonParse('""', 'fallback'), '');
  assert.deepEqual(safeJsonParse('{"valid": 123}', {}), { valid: 123 });
});

// ============================================================================
// 11. API Contract Compatibility
// ============================================================================

test('Contract Compatibility: createErrorResponse returns consistent { error } JSON shape', async () => {
  const err = new Error('Repository user/private-repo not found or is private without authorized credentials.');
  const response = createErrorResponse(err);

  assert.equal(response.status, 404);
  const json = await response.json();
  assert.ok(json.error);
  assert.equal(typeof json.error, 'string');
  assert.ok(json.error.includes('not found or is private'));
});
