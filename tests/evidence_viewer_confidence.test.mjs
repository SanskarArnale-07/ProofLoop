import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const { evaluateRequirement } = jiti('../src/lib/analyzer.ts');
const {
  evaluateConfidenceDetails,
  calculateGroundedConfidence,
  rankEvidenceDeterministically,
} = jiti('../src/lib/scoring.ts');

const SAMPLE_REQ_API = {
  id: 'req-api',
  title: 'API & HTTP Endpoints',
  category: 'Backend',
  description: 'Implements RESTful HTTP endpoints with structured routing and validation.',
  weight: 15,
};

const SAMPLE_REQ_TESTING = {
  id: 'req-testing',
  title: 'Automated Testing',
  category: 'Testing',
  description: 'Implements unit or integration tests with assertions and test runners.',
  weight: 15,
};

const DUMMY_COMMIT = {
  sha: 'a1b2c3d4e5f678901234567890abcdef12345678',
  message: 'feat: add api and test fixtures',
  author: 'Developer',
  date: '2026-10-15T10:00:00Z',
  filesChanged: ['src/routes/api.ts', 'src/rules/api/exposed-schemas.ts'],
};

// ============================================================================
// 1. Source file containing a verified implementation
// ============================================================================
test('1. Source file containing a verified implementation produces demonstrated status, high confidence, and excerpt with line numbers', async () => {
  const fileTree = [
    { path: 'src/routes/api.ts', mode: '100644', type: 'blob', sha: 'blob1', size: 350 },
  ];

  const codeContent = [
    'import { Router } from "express";',
    'const router = Router();',
    '',
    '// User API endpoints',
    'router.get("/users", async (req, res) => {',
    '  const users = await db.users.findMany();',
    '  res.json({ users });',
    '});',
    '',
    'export default router;',
  ].join('\n');

  const evidence = await evaluateRequirement({
    req: SAMPLE_REQ_API,
    fileTree,
    commits: [DUMMY_COMMIT],
    getFile: async () => codeContent,
    getFileWithStatus: async (_path, sha) => {
      assert.equal(sha, DUMMY_COMMIT.sha, 'Must query at exact analyzed commit SHA');
      return { content: codeContent, status: 'retrieved' };
    },
    repoFullName: 'acme/backend',
    latestCommitSha: DUMMY_COMMIT.sha,
    diffs: [],
  });

  // Verify status and level
  assert.equal(evidence.status, 'demonstrated', 'Status must be demonstrated for verified implementation');
  assert.equal(evidence.verificationLevel, 'implementation_verified', 'Verification level must be implementation_verified');
  assert.equal(evidence.sourceRetrievalStatus, 'retrieved', 'Source retrieval status must be retrieved');

  // Verify excerpt and line numbers
  assert.ok(evidence.codeExcerpt, 'Code excerpt must be populated');
  assert.ok(evidence.codeExcerpt.includes('router.get("/users"'), 'Excerpt must contain the matched route handler');
  assert.ok(evidence.lineStart && evidence.lineStart >= 1, 'lineStart must be positive number');
  assert.ok(evidence.lineEnd && evidence.lineEnd >= evidence.lineStart, 'lineEnd must be >= lineStart');

  // Verify diagnostic fields
  assert.ok(evidence.detectedWhat.includes('HTTP route handler'), 'detectedWhat must describe what was found');
  assert.ok(evidence.evidenceSupports.includes('commit'), 'evidenceSupports must reference commit');
  assert.ok(evidence.notVerified, 'notVerified must be present');

  // Verify confidence score: must be high (>= 85%)
  assert.ok(evidence.confidence >= 85, `Confidence must be >= 85%, got ${evidence.confidence}%`);
  assert.ok(evidence.confidenceExplanation.includes('High confidence'), 'Explanation must justify high confidence');

  // Verify scoring engine consistency
  const scoreDetails = evaluateConfidenceDetails(evidence);
  assert.ok(scoreDetails.confidence >= 85);
  assert.equal(scoreDetails.verificationLevel, 'implementation_verified');
});

// ============================================================================
// 2. Detected file without a verified implementation (src/rules/api/exposed-schemas.ts)
// ============================================================================
test('2. Detected file without verified implementation (exposed-schemas.ts) produces partial status, confidence strictly <= 45% (never 60%), and displays inspected source lines', async () => {
  const fileTree = [
    { path: 'src/rules/api/exposed-schemas.ts', mode: '100644', type: 'blob', sha: 'blob2', size: 400 },
  ];

  const schemaContent = [
    'export interface UserSchema {',
    '  id: string;',
    '  email: string;',
    '  role: "admin" | "user";',
    '}',
    '',
    'export interface AuthResponse {',
    '  token: string;',
    '  expiresIn: number;',
    '}',
    '',
    'export const ApiVersion = "v1";',
  ].join('\n');

  const evidence = await evaluateRequirement({
    req: SAMPLE_REQ_API,
    fileTree,
    commits: [DUMMY_COMMIT],
    getFile: async () => schemaContent,
    getFileWithStatus: async (_path, sha) => {
      assert.equal(sha, DUMMY_COMMIT.sha, 'Must query at exact analyzed commit SHA');
      return { content: schemaContent, status: 'retrieved' };
    },
    repoFullName: 'acme/backend',
    latestCommitSha: DUMMY_COMMIT.sha,
    diffs: [],
  });

  // Verify status is partial, not demonstrated
  assert.equal(evidence.status, 'partial', 'Status must be partial when route handlers are absent');
  assert.equal(evidence.verificationLevel, 'source_inspected', 'Verification level must be source_inspected');
  assert.equal(evidence.sourceRetrievalStatus, 'retrieved', 'Source code was successfully retrieved and inspected');

  // CRITICAL REQUIREMENT: Finding a filename or schema file must not receive 60% confidence!
  // Must be strictly <= 45% (40% base + modifiers capped at 45%).
  assert.ok(
    evidence.confidence <= 45,
    `Confidence must be capped at 45% (was previously 60%), got ${evidence.confidence}%`
  );
  assert.equal(evidence.confidence, 40, 'Default source_inspected without route handlers receives 40%');

  // CRITICAL REQUIREMENT: Code panel must not say "No code excerpt available"!
  // It must display the inspected source code!
  assert.ok(evidence.codeExcerpt, 'Code excerpt must NOT be empty for partial inspected file');
  assert.ok(evidence.codeExcerpt.includes('export interface UserSchema'), 'Excerpt must show the inspected file content');
  assert.equal(evidence.lineStart, 1);
  assert.ok(evidence.lineEnd >= 5);

  // Verify diagnostic fields explicitly explain what is missing
  assert.ok(evidence.notVerified.includes('HTTP route handler'), 'notVerified must state route handlers were not found');
  assert.ok(evidence.confidenceExplanation.includes('capped at 45%') || evidence.confidenceExplanation.includes('Moderate confidence (40%)'));

  // Test scoring engine directly on this evidence
  const scoreDetails = evaluateConfidenceDetails(evidence);
  assert.ok(scoreDetails.confidence <= 45, 'Scoring engine must cap confidence at 45%');
  assert.equal(scoreDetails.verificationLevel, 'source_inspected');
});

// ============================================================================
// 3. Missing source file (negative finding)
// ============================================================================
test('3. Missing source file produces not_demonstrated, negative_verification level, and honest negative finding confidence', async () => {
  const fileTree = [
    { path: 'README.md', mode: '100644', type: 'blob', sha: 'blob0', size: 120 },
    { path: 'docs/architecture.md', mode: '100644', type: 'blob', sha: 'blob1', size: 450 },
  ];

  const evidence = await evaluateRequirement({
    req: SAMPLE_REQ_API,
    fileTree,
    commits: [DUMMY_COMMIT],
    getFile: async () => null,
    getFileWithStatus: async () => ({ content: null, status: 'missing_file' }),
    repoFullName: 'acme/backend',
    latestCommitSha: DUMMY_COMMIT.sha,
    diffs: [],
  });

  assert.equal(evidence.status, 'not_demonstrated', 'Status must be not_demonstrated');
  assert.equal(evidence.verificationLevel, 'negative_verification', 'Level must be negative_verification');
  assert.equal(evidence.sourceRetrievalStatus, 'missing_file', 'Source status must be missing_file');
  assert.equal(evidence.codeExcerpt, undefined, 'No code excerpt for missing files');

  // Negative finding certainty is high (88%) because the tree was scanned and confirmed absent
  assert.equal(evidence.confidence, 88, 'Confidence in negative finding is 88%');
  assert.ok(evidence.detectedWhat.includes('Zero API route handlers'), 'detectedWhat clarifies nothing was found');
  assert.ok(evidence.notVerified.includes('HTTP route handlers'), 'notVerified states unverified requirements');

  const scoreDetails = evaluateConfidenceDetails(evidence);
  assert.equal(scoreDetails.confidence, 88);
  assert.equal(scoreDetails.verificationLevel, 'negative_verification');
});

// ============================================================================
// 4. Source retrieval failure
// ============================================================================
test('4. Source retrieval failure records error reason, sets low confidence (25%), and does not fabricate code', async () => {
  const fileTree = [
    { path: 'src/api/routes.ts', mode: '100644', type: 'blob', sha: 'blob_err', size: 300 },
  ];

  const failureReason = 'GitHub API HTTP 403: Rate limit exceeded or access denied at commit a1b2c3d';

  const evidence = await evaluateRequirement({
    req: SAMPLE_REQ_API,
    fileTree,
    commits: [DUMMY_COMMIT],
    getFile: async () => null,
    getFileWithStatus: async (_path, sha) => {
      assert.equal(sha, DUMMY_COMMIT.sha);
      return {
        content: null,
        status: 'failed',
        error: failureReason,
      };
    },
    repoFullName: 'acme/backend',
    latestCommitSha: DUMMY_COMMIT.sha,
    diffs: [],
  });

  assert.equal(evidence.status, 'partial');
  assert.equal(evidence.sourceRetrievalStatus, 'failed');
  assert.equal(evidence.sourceRetrievalError, failureReason);
  assert.equal(evidence.codeExcerpt, undefined, 'Must NEVER fabricate source code on retrieval failure');
  assert.equal(evidence.confidence, 25, 'Confidence must drop to 25% for uninspected file discovery');
  assert.equal(evidence.verificationLevel, 'file_discovery');
  assert.ok(evidence.notVerified.includes('Source code could not be inspected due to retrieval failure'));

  const scoreDetails = evaluateConfidenceDetails(evidence);
  assert.equal(scoreDetails.confidence, 25);
  assert.equal(scoreDetails.verificationLevel, 'file_discovery');
});

// ============================================================================
// 5. Implementation that exists but does not satisfy the rule (e.g. testing without assertions)
// ============================================================================
test('5. Implementation that exists but does not satisfy rule (test file with no assertions) results in partial status, capped confidence, and specific unverified explanation', async () => {
  const fileTree = [
    { path: 'tests/empty.spec.ts', mode: '100644', type: 'blob', sha: 'blob_test', size: 150 },
  ];

  const testFileWithoutAssertions = [
    '// Setup mock environment',
    'const env = process.env.NODE_ENV;',
    'console.log("Running suite with env", env);',
    'const port = 3000;',
  ].join('\n');

  const evidence = await evaluateRequirement({
    req: SAMPLE_REQ_TESTING,
    fileTree,
    commits: [DUMMY_COMMIT],
    getFile: async () => testFileWithoutAssertions,
    getFileWithStatus: async () => ({ content: testFileWithoutAssertions, status: 'retrieved' }),
    repoFullName: 'acme/backend',
    latestCommitSha: DUMMY_COMMIT.sha,
    diffs: [],
  });

  assert.equal(evidence.status, 'partial', 'Status must be partial when assertions are missing');
  assert.equal(evidence.verificationLevel, 'source_inspected');
  assert.ok(evidence.confidence <= 45, 'Confidence must be capped at 45%');
  assert.equal(evidence.confidence, 40);

  // Inspected lines are present so code panel is not blank
  assert.ok(evidence.codeExcerpt, 'Inspected code excerpt is provided');
  assert.ok(evidence.codeExcerpt.includes('Setup mock environment'));

  // What was not verified points out missing assertions
  assert.ok(evidence.notVerified.includes('assertions'), 'notVerified must mention assertions/test runners');
  assert.ok(evidence.notVerified.includes('expect'));
});

// ============================================================================
// 6. Verified implementation whose excerpt fails to render / retrieve
// ============================================================================
test('6. Verified implementation whose excerpt fails to render preserves verified confidence and demonstrated status', () => {
  // A verified finding where implementation was verified, but excerpt is missing/empty
  const verifiedWithoutExcerpt = {
    requirementId: 'req-api',
    requirementTitle: 'API & HTTP Endpoints',
    category: 'Backend',
    status: 'demonstrated',
    evidenceType: 'direct_implementation',
    evidenceStrength: 'strong',
    explanation: 'Verified HTTP route implementation.',
    repoFullName: 'acme/backend',
    commitSha: DUMMY_COMMIT.sha,
    confidence: 90,
    relevantCommits: [DUMMY_COMMIT.sha],
    relevantFiles: ['src/routes/api.ts'],
    codeExcerpt: undefined, // Rendering or excerpt extraction failed
    sourceRetrievalStatus: 'retrieved',
    verificationLevel: 'implementation_verified',
  };

  // Rule 2 check: "Do not automatically reduce confidence to zero merely because the UI cannot render an excerpt:
  // first determine whether source verification succeeded and whether the problem is only a rendering or retrieval failure."
  const scoreDetails = evaluateConfidenceDetails(verifiedWithoutExcerpt);
  assert.ok(
    scoreDetails.confidence >= 75,
    `Verified implementation confidence must be preserved (>= 75%), got ${scoreDetails.confidence}%`
  );
  assert.ok(scoreDetails.explanation.includes('High confidence') || scoreDetails.explanation.includes('verified'));

  const groundedScore = calculateGroundedConfidence(verifiedWithoutExcerpt);
  assert.ok(groundedScore >= 75, `Grounded score must be >= 75%, got ${groundedScore}%`);
});

// ============================================================================
// 7. Full pipeline ranking determinism
// ============================================================================
test('7. Deterministic ranking orders verified implementations first, maintains consistent confidence and level metadata', () => {
  const findings = [
    {
      requirementId: 'req-schemas',
      requirementTitle: 'Schemas',
      status: 'partial',
      evidenceType: 'configuration',
      evidenceStrength: 'weak',
      filePath: 'src/rules/api/exposed-schemas.ts',
      verificationLevel: 'source_inspected',
      confidence: 40,
    },
    {
      requirementId: 'req-api',
      requirementTitle: 'API Endpoints',
      status: 'demonstrated',
      evidenceType: 'direct_implementation',
      evidenceStrength: 'strong',
      filePath: 'src/routes/api.ts',
      verificationLevel: 'implementation_verified',
      confidence: 92,
      relevantCommits: ['c1', 'c2'],
      additionsOrPatterns: ['router.get'],
    },
    {
      requirementId: 'req-db',
      requirementTitle: 'Database',
      status: 'not_demonstrated',
      evidenceType: 'none',
      evidenceStrength: 'none',
      verificationLevel: 'negative_verification',
      confidence: 88,
    },
  ];

  const ranked = rankEvidenceDeterministically(findings);

  // Demonstrated findings must be ranked ahead of partial and not_demonstrated
  assert.equal(ranked[0].requirementId, 'req-api');
  assert.equal(ranked[0].status, 'demonstrated');
  assert.ok(ranked[0].confidence >= 85);

  // Partial finding with schema file must have confidence <= 45
  const schemaFinding = ranked.find((f) => f.requirementId === 'req-schemas');
  assert.ok(schemaFinding.confidence <= 45);
  assert.equal(schemaFinding.verificationLevel, 'source_inspected');
});
