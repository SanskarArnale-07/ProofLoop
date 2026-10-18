import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const {
  generateVerificationTask,
  evaluatePracticalSolution,
  generateAdaptiveFollowup,
  evaluateReasoningResponse,
  computeMultidimensionalScore
} = jiti('../src/lib/developer-verification.ts');

const {
  SAMPLE_ASSESSMENT,
  SAMPLE_VERIFICATION_RECORD
} = jiti('../src/lib/sample-data.ts');

const {
  saveAssessment,
  saveDeveloperVerification,
  getVerificationForRequirement,
  getAssessmentVerificationSummary,
  ensureDeveloperVerificationsTable
} = jiti('../src/lib/db.ts');

const { reassessAssessment } = jiti('../src/lib/reassessment-service.ts');

function skipIfNoDb(t) {
  if (!process.env.DATABASE_URL) {
    t.skip('Live PostgreSQL database required: DATABASE_URL is not set.');
    return true;
  }
  return false;
}

// ============================================================================
// Test 1: Strong repository evidence with no practical verification
// ============================================================================
test('1. Strong repository evidence with no practical verification maintains "not yet verified"', () => {
  const reqApi = SAMPLE_ASSESSMENT.internship.requirements.find((r) => r.id === 'req-api');
  const evApi = SAMPLE_ASSESSMENT.latestRevision.evidence.find((e) => e.requirementId === 'req-api');

  assert.ok(reqApi, 'Requirement must exist in sample');
  assert.ok(evApi, 'Evidence must exist in sample');
  assert.equal(evApi.status, 'demonstrated', 'Repository evidence is demonstrated');
  assert.equal(evApi.evidenceStrength, 'strong', 'Repository evidence is strong');

  // Compute multidimensional evaluation before any practical task is taken
  const emptyPractical = {
    passed: false,
    syntaxValid: false,
    contractPreserved: false,
    testsPassed: 0,
    totalTests: 4,
    checksSummary: ['No practical task submitted.'],
    strengths: [],
    unresolvedGaps: ['Task not attempted.'],
    evaluatedAt: new Date().toISOString()
  };

  const emptyReasoning = {
    score: 0,
    criteriaMet: [],
    missingReasoning: ['Understanding check not yet attempted'],
    unresolvedUncertainty: ['No reasoning evidence provided.'],
    overallEvaluation: 'Not yet verified.',
    evaluatedAt: new Date().toISOString()
  };

  const { dimensions, verdict, overallExplanation } = computeMultidimensionalScore(
    evApi,
    emptyPractical,
    emptyReasoning,
    'ai_restricted_independent'
  );

  // Assertions: Repo evidence is strong, but developer understanding is NOT verified
  assert.equal(verdict, 'unverified');
  assert.equal(dimensions.repositoryEvidence.status, 'demonstrated');
  assert.equal(dimensions.repositoryEvidence.strength, 'strong');
  assert.equal(dimensions.practicalPerformance.passed, false);
  assert.match(overallExplanation, /Not verified/i);
});

// ============================================================================
// Test 2: Weak repository evidence with a successful task on a specific skill
// ============================================================================
test('2. Weak repository evidence upgraded to verified understanding upon successful practical task', () => {
  const reqGit = SAMPLE_ASSESSMENT.internship.requirements.find((r) => r.id === 'req-git');
  const evGit = SAMPLE_ASSESSMENT.latestRevision.evidence.find((e) => e.requirementId === 'req-git');

  assert.ok(reqGit);
  assert.ok(evGit);
  assert.equal(evGit.status, 'partial', 'Repository evidence is partial/weak');

  // Candidate completes practical task
  const task = generateVerificationTask(evGit, reqGit, 'ai_restricted_independent');
  assert.ok(task, 'Task generated');

  const validSolution = `
export function validateCommitFlow(commit: { message: string; author: string }): boolean {
  if (!commit || !commit.message || commit.message.trim().length === 0) {
    throw new Error("Invalid commit message");
  }
  return true;
}
`;

  const practicalEval = evaluatePracticalSolution(task, validSolution);
  assert.ok(practicalEval.syntaxValid, 'Syntax must be valid');
  assert.ok(practicalEval.passed, 'Practical solution should pass checks');

  const followup = generateAdaptiveFollowup(task, validSolution, practicalEval);
  assert.ok(followup.question, 'Followup question generated');

  const thoroughReasoning =
    'A key remaining limitation is handling branch race conditions under high volume concurrency. Git index contention occurs when multiple writers push simultaneously. As a mitigation strategy, we propose using atomic pre-receive hooks and automated pipeline validation before merging.';

  const reasoningEval = evaluateReasoningResponse(task, validSolution, followup, thoroughReasoning);

  const { dimensions, verdict } = computeMultidimensionalScore(
    evGit,
    practicalEval,
    reasoningEval,
    'ai_restricted_independent'
  );

  assert.equal(verdict, 'verified_demonstrated');
  assert.equal(dimensions.practicalPerformance.passed, true);
  assert.equal(dimensions.repositoryEvidence.status, 'partial'); // Repository evidence preserves actual fact
  assert.ok(dimensions.confidenceAndLimitations.confidenceLevel === 'high' || dimensions.confidenceAndLimitations.confidenceLevel === 'moderate');
});

// ============================================================================
// Test 3: A task that passes tests but has an inadequate explanation
// ============================================================================
test('3. Code passing tests with inadequate explanation results in "partial_verification", not full understanding', () => {
  const reqApi = SAMPLE_ASSESSMENT.internship.requirements.find((r) => r.id === 'req-api');
  const evApi = SAMPLE_ASSESSMENT.latestRevision.evidence.find((e) => e.requirementId === 'req-api');
  const task = generateVerificationTask(evApi, reqApi, 'ai_restricted_independent');

  // Solution passes practical contract checks
  const workingSolution = `
export async function handleCreateCharge(req: Request): Promise<Response> {
  const rawIdempotencyKey = req.headers.get("Idempotency-Key");
  const idempotencyKey = rawIdempotencyKey?.trim();
  if (!idempotencyKey || idempotencyKey.length === 0) {
    return new Response(JSON.stringify({ error: "Missing or invalid Idempotency-Key header" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const body = await req.json();
  const validation = ChargeRequestSchema.safeParse(body);
  if (!validation.success) {
    return new Response(JSON.stringify({ error: "Validation failed" }), { status: 422 });
  }
  try {
    const charge = await chargeService.process({ ...validation.data, idempotencyKey });
    return new Response(JSON.stringify(charge), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal processing error" }), { status: 500 });
  }
}
`;

  const practicalEval = evaluatePracticalSolution(task, workingSolution);
  assert.equal(practicalEval.passed, true, 'Practical code passes tests');

  const followup = generateAdaptiveFollowup(task, workingSolution, practicalEval);

  // Inadequate, superficial explanation
  const superficialReasoning = 'I just wrote the code and it works. Everything is fine.';
  const reasoningEval = evaluateReasoningResponse(task, workingSolution, followup, superficialReasoning);

  assert.ok(reasoningEval.score < 50, 'Reasoning score must reflect superficial explanation');
  assert.ok(reasoningEval.missingReasoning.length > 0, 'Must record missing reasoning criteria');

  const { verdict, overallExplanation } = computeMultidimensionalScore(
    evApi,
    practicalEval,
    reasoningEval,
    'ai_restricted_independent'
  );

  // Crucial test: Code passed, but understanding is NOT marked as verified!
  assert.equal(verdict, 'partial_verification');
  assert.match(overallExplanation, /Partial verification/i);
  assert.match(overallExplanation, /superficial or lacked essential reasoning/i);
});

// ============================================================================
// Test 4: An incorrect solution with a convincing explanation
// ============================================================================
test('4. Incorrect solution with fluent explanation fails verification (code contract broken)', () => {
  const reqApi = SAMPLE_ASSESSMENT.internship.requirements.find((r) => r.id === 'req-api');
  const evApi = SAMPLE_ASSESSMENT.latestRevision.evidence.find((e) => e.requirementId === 'req-api');
  const task = generateVerificationTask(evApi, reqApi, 'ai_restricted_independent');

  // Broken solution: drops validation and does not catch service rejections
  const brokenSolution = `
export async function handleCreateCharge(req: Request): Promise<Response> {
  // Omitted header validation and error handling
  const body = await req.json();
  const charge = await chargeService.process(body);
  return new Response(JSON.stringify(charge));
}
`;

  const practicalEval = evaluatePracticalSolution(task, brokenSolution);
  assert.equal(practicalEval.passed, false, 'Practical solution must fail contract checks');

  const followup = generateAdaptiveFollowup(task, brokenSolution, practicalEval);

  // Highly eloquent, fluent explanation
  const eloquentReasoning =
    'In a distributed enterprise payment gateway, idempotency key collisions require SHA-256 payload hashing stored in high-throughput Redis clusters with TTL expirations. When payload hashes diverge on identical keys, HTTP 409 Conflict guarantees strict linearizability across transactional replicas.';

  const reasoningEval = evaluateReasoningResponse(task, brokenSolution, followup, eloquentReasoning);

  const { verdict, dimensions, overallExplanation } = computeMultidimensionalScore(
    evApi,
    practicalEval,
    reasoningEval,
    'ai_restricted_independent'
  );

  // Crucial test: Fluent prose cannot override broken practical code contracts!
  assert.notEqual(verdict, 'verified_demonstrated');
  assert.equal(dimensions.practicalPerformance.passed, false);
  assert.match(overallExplanation, /failed automated checks/i);
});

// ============================================================================
// Test 5: Incomplete or interrupted assessment
// ============================================================================
test('5. Incomplete, empty, or syntax-broken assessment handled safely without exceptions', () => {
  const reqApi = SAMPLE_ASSESSMENT.internship.requirements.find((r) => r.id === 'req-api');
  const task = generateVerificationTask(null, reqApi, 'ai_restricted_independent');

  // Test empty input
  const emptyEval = evaluatePracticalSolution(task, '   ');
  assert.equal(emptyEval.passed, false);
  assert.equal(emptyEval.syntaxValid, false);
  assert.match(emptyEval.checksSummary[0], /empty or too short/i);

  // Test unbalanced braces
  const syntaxBrokenEval = evaluatePracticalSolution(
    task,
    'export function broken() { if (true) { return 1; ' // missing closing braces
  );
  assert.equal(syntaxBrokenEval.passed, false);
  assert.equal(syntaxBrokenEval.syntaxValid, false);
  assert.match(syntaxBrokenEval.checksSummary[0], /Syntax Error.*Unbalanced/i);

  // Test empty reasoning
  const emptyReasoning = evaluateReasoningResponse(
    task,
    'const x = 1;',
    { id: 'f1', taskId: 't1', question: 'Explain?', contextWhyAsked: 'test', expectedCriteria: ['Criterion A'] },
    ''
  );
  assert.equal(emptyReasoning.score, 15);
  assert.equal(emptyReasoning.criteriaMet.length, 0);
  assert.match(emptyReasoning.overallEvaluation, /Inadequate/i);
});

// ============================================================================
// Test 6: New GitHub commit after practical assessment preserves verification
// ============================================================================
test('6. New GitHub commit updates repository evidence without overwriting or auto-upgrading verification', async (t) => {
  if (skipIfNoDb(t)) return;

  const id = `asmt-verif-commit-test-${Date.now()}`;
  const assessment = {
    ...SAMPLE_ASSESSMENT,
    id,
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${id}-1`,
      assessmentId: id,
      revisionNumber: 1
    }
  };

  await saveAssessment(assessment);
  await ensureDeveloperVerificationsTable();

  // Save verification record for req-api
  const verifRecord = {
    ...SAMPLE_VERIFICATION_RECORD,
    id: `verif-${id}-req-api`,
    assessmentId: id,
    revisionId: `rev-${id}-1`
  };
  await saveDeveloperVerification(verifRecord);

  // Verify it exists
  const loadedVerif = await getVerificationForRequirement(id, 'req-api');
  assert.ok(loadedVerif);
  assert.equal(loadedVerif.status, 'verified_demonstrated');

  // Trigger reassessment simulating new commit
  const reassessResult = await reassessAssessment({
    assessmentId: id,
    triggerType: 'manual',
    triggerMessage: 'Commit new changes',
    commitSha: 'sha-new-commit-456'
  });

  assert.equal(reassessResult.success, true);
  assert.equal(reassessResult.newRevisionNumber, 2);

  // Check verification record AFTER new revision
  const verifAfterCommit = await getVerificationForRequirement(id, 'req-api');
  assert.ok(verifAfterCommit, 'Verification record must remain durable');
  assert.equal(verifAfterCommit.status, 'verified_demonstrated');

  // Unverified skills must NOT be automatically upgraded by commit
  const unverifiedReq = await getVerificationForRequirement(id, 'req-db');
  assert.equal(unverifiedReq, null, 'Unverified skill must not be auto-upgraded by new commit');
});

// ============================================================================
// Test 7: Historical revision preservation
// ============================================================================
test('7. Developer verification records are preserved durably across revision cycles', async (t) => {
  if (skipIfNoDb(t)) return;

  const id = `asmt-verif-durable-test-${Date.now()}`;
  const assessment = {
    ...SAMPLE_ASSESSMENT,
    id,
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${id}-1`,
      assessmentId: id,
      revisionNumber: 1
    }
  };

  await saveAssessment(assessment);
  await ensureDeveloperVerificationsTable();

  const verifRecord = {
    ...SAMPLE_VERIFICATION_RECORD,
    id: `verif-${id}-durable`,
    assessmentId: id,
    revisionId: `rev-${id}-1`
  };
  await saveDeveloperVerification(verifRecord);

  // Retrieve verification summary
  const summary = await getAssessmentVerificationSummary(id, SAMPLE_ASSESSMENT.internship.requirements);
  assert.equal(summary.assessmentId, id);
  assert.ok(summary.records.length >= 1);
  assert.equal(summary.verifiedCount, 1);
  assert.ok(summary.notYetVerifiedCount >= 1);
});

// ============================================================================
// Test 8: Unauthorized access and malicious task submissions
// ============================================================================
test('8. Malicious code submissions containing dangerous constructs are evaluated statically without execution', () => {
  const reqApi = SAMPLE_ASSESSMENT.internship.requirements.find((r) => r.id === 'req-api');
  const task = generateVerificationTask(null, reqApi, 'ai_restricted_independent');

  // Malicious payload attempting execution or process tampering
  const maliciousCode = `
export function exploit() {
  eval("console.log('pwned')");
  if (typeof process !== 'undefined') {
    // Attempt crash
  }
  return true;
}
`;

  // Must not execute eval or fail uncaught
  const result = evaluatePracticalSolution(task, maliciousCode);
  assert.ok(result, 'Evaluation must complete safely');
  assert.equal(typeof result.passed, 'boolean');
  assert.equal(typeof result.syntaxValid, 'boolean');
});
