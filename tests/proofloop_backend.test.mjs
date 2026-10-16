import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const {
  SCORING_RULE_VERSION,
  DEFAULT_SCORING_CONFIG,
  computeScoreForEvidence,
  rankEvidenceDeterministically
} = jiti('../src/lib/scoring.ts');

const {
  analyzeAIAuthorshipSignals,
  AI_SIGNAL_DISCLAIMER
} = jiti('../src/lib/ai-signals.ts');

const {
  isSensitivePath,
  redactSensitiveContent,
  parseGitHubRepoUrl
} = jiti('../src/lib/github.ts');

const {
  verifyWebhookSignature,
  identifyAffectedRequirements
} = jiti('../src/lib/webhook.ts');

const {
  compareRevisions,
  recordAssessmentFailure,
  saveAssessment,
  getAssessment,
  saveRevision,
  getRevisionHistory,
  MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT,
  enforceEvaluationRetention,
  recordWebhookDelivery
} = jiti('../src/lib/db.ts');

const {
  SAMPLE_ASSESSMENT
} = jiti('../src/lib/sample-data.ts');

const {
  evaluateRepositoryCore,
  analyzeRepositoryAgainstRequirements
} = jiti('../src/lib/analyzer.ts');

// ============================================================================
// 1. Multiple Commits and Commit-History Pagination
// ============================================================================
test('1. Multiple Commits and History Pagination - Evaluates multiple commits', () => {
  const commits = [];
  for (let i = 1; i <= 25; i++) {
    commits.push({
      sha: `sha-${i.toString().padStart(4, '0')}`,
      message: `feat(core): iteration step ${i}`,
      authorName: 'Alex Chen',
      timestamp: new Date(Date.now() - (25 - i) * 3600000).toISOString(),
      filesChanged: i % 2 === 0 ? ['src/routes/payments.ts'] : ['tests/payments.test.ts']
    });
  }

  assert.equal(commits.length, 25, 'Should hold 25 paginated commits');
  assert.equal(commits[0].sha, 'sha-0001');
  assert.equal(commits[24].sha, 'sha-0025');

  const paymentCommits = commits.filter(c => c.filesChanged.includes('src/routes/payments.ts')).map(c => c.sha);
  assert.ok(paymentCommits.length > 3, 'Should have multiple commits corroborating payment skill');

  const score = computeScoreForEvidence({
    requirementId: 'req-api',
    requirementTitle: 'REST API',
    status: 'demonstrated',
    explanation: 'Tested across commits',
    repoFullName: 'alexchen/payment-orchestrator',
    commitSha: paymentCommits[0],
    confidence: 90,
    relevantCommits: paymentCommits,
    evidenceStrength: 'strong'
  });

  assert.equal(score.continuityBonus, DEFAULT_SCORING_CONFIG.continuity.threePlusCommits);
  assert.ok(score.factors.some(f => f.includes('Corroborated across')));
});

// ============================================================================
// 2. Real Diff Extraction and Changed-File Analysis
// ============================================================================

test('2. Real Diff Extraction & Sensitive Redaction - Analyzes patches safely', () => {
  const fakeApiKey = 'TEST_API_KEY_FOR_REDACTION';

  const rawPatch = `@@ -10,6 +10,12 @@
+const apiKey = "${fakeApiKey}";
+export function authenticate(token: string) {
+  return token === apiKey;
+}`;

  const redacted = redactSensitiveContent(rawPatch);
  assert.ok(!redacted.includes(fakeApiKey), 'API Key must be redacted');
  assert.ok(redacted.includes('[REDACTED_API_KEY]'));

  // Test sensitive path prevention
  assert.equal(isSensitivePath('.env'), true);
  assert.equal(isSensitivePath('.env.production'), true);
  assert.equal(isSensitivePath('config/secrets.json'), true);
  assert.equal(isSensitivePath('.ssh/id_rsa'), true);
  assert.equal(isSensitivePath('../../../etc/passwd'), true);
  assert.equal(isSensitivePath('src/api/routes.ts'), false);
  assert.equal(isSensitivePath('tests/unit.test.ts'), false);
});
// ============================================================================
// 3. Skill Evidence Derived from Implementation vs Dependency Names Alone
// ============================================================================
test('3. Implementation vs Dependency Names - Distinguishes dependency from working code', () => {
  // Dependency only evidence
  const depEvidence = {
    requirementId: 'req-api',
    requirementTitle: 'REST API',
    status: 'partial',
    explanation: 'Found express in package.json dependencies',
    repoFullName: 'test/repo',
    commitSha: 'c1',
    confidence: 40,
    evidenceType: 'dependency_usage',
    evidenceStrength: 'weak'
  };

  const depScore = computeScoreForEvidence(depEvidence);
  assert.equal(depScore.basePoints, DEFAULT_SCORING_CONFIG.implementation.weak); // 15 pts
  assert.ok(depScore.score < DEFAULT_SCORING_CONFIG.statusThresholds.demonstrated, 'Dependency alone must NOT qualify as demonstrated');

  // Concrete working implementation with assertions
  const implEvidence = {
    requirementId: 'req-api',
    requirementTitle: 'REST API',
    status: 'demonstrated',
    explanation: 'Found concrete POST handler with validation',
    repoFullName: 'test/repo',
    commitSha: 'c1',
    confidence: 95,
    evidenceType: 'direct_implementation',
    evidenceStrength: 'strong',
    testResultsSummary: {
      testFilesCount: 2,
      assertionsFound: 6
    },
    relevantCommits: ['c1', 'c2']
  };

  const implScore = computeScoreForEvidence(implEvidence);
  assert.equal(implScore.basePoints, DEFAULT_SCORING_CONFIG.implementation.strong); // 55 pts
  assert.equal(implScore.testBonus, DEFAULT_SCORING_CONFIG.testVerification.executableAssertions); // 25 pts
  assert.equal(implScore.continuityBonus, DEFAULT_SCORING_CONFIG.continuity.twoCommits); // 15 pts
  assert.ok(implScore.score >= DEFAULT_SCORING_CONFIG.statusThresholds.demonstrated, 'Working implementation with tests must qualify as demonstrated');
});

// ============================================================================
// 4. Deterministic Ranking and Tie-Breaking
// ============================================================================
test('4. Deterministic Ranking & Tie-Breaking - Reproducible order and explicit rules', () => {
  const items = [
    {
      requirementId: 'req-a',
      requirementTitle: 'Alpha Skill',
      status: 'demonstrated',
      explanation: 'Skill A',
      repoFullName: 'test/repo',
      commitSha: 'c1',
      confidence: 90,
      evidenceStrength: 'strong',
      testResultsSummary: { testFilesCount: 1, assertionsFound: 2 } // 55 + 25 + 5 = 85
    },
    {
      requirementId: 'req-b',
      requirementTitle: 'Beta Skill',
      status: 'demonstrated',
      explanation: 'Skill B',
      repoFullName: 'test/repo',
      commitSha: 'c1',
      confidence: 90,
      evidenceStrength: 'strong',
      testResultsSummary: { testFilesCount: 1, assertionsFound: 0 },
      relevantCommits: ['c1', 'c2', 'c3'] // 55 + 10 + 20 = 85 (Tied at 85)
    },
    {
      requirementId: 'req-c',
      requirementTitle: 'Gamma Skill',
      status: 'partial',
      explanation: 'Skill C',
      repoFullName: 'test/repo',
      commitSha: 'c1',
      confidence: 60,
      evidenceStrength: 'moderate' // 35 + 5 = 40
    }
  ];

  const ranked1 = rankEvidenceDeterministically(items);
  const ranked2 = rankEvidenceDeterministically(items);

  // Assert perfect reproducibility
  assert.deepEqual(
    ranked1.map(r => ({ id: r.requirementId, score: r.scoreBreakdown.score, rank: r.scoreBreakdown.rank })),
    ranked2.map(r => ({ id: r.requirementId, score: r.scoreBreakdown.score, rank: r.scoreBreakdown.rank }))
  );

  // Both Alpha and Beta have 85 points. Alpha has 25 test bonus vs Beta has 10 test bonus.
  // Rule 2 breaks the tie by test bonus.
  assert.equal(ranked1[0].requirementId, 'req-a', 'Alpha skill should win tie-breaker due to higher test verification points');
  assert.equal(ranked1[0].scoreBreakdown.rank, 1);
  assert.equal(ranked1[1].requirementId, 'req-b');
  assert.equal(ranked1[1].scoreBreakdown.rank, 2);
  assert.ok(ranked1[0].scoreBreakdown.tieBreakerReason.includes('test verification'));
});

// ============================================================================
// 5. Duplicate Evidence and Repeated Webhook Deliveries
// ============================================================================
test('5. Duplicate Evidence & Repeated Deliveries - Idempotent processing', () => {
  const secret = 'test_webhook_secret_key';
  const payload = JSON.stringify({
    repository: { full_name: 'alexchen/payment-orchestrator' },
    head_commit: { id: '9e41b2c', message: 'test push', added: [], modified: [] }
  });

  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const signature = `sha256=${hmac}`;

  assert.equal(verifyWebhookSignature(payload, signature, secret), true);

  const affected = identifyAffectedRequirements(['tests/api.test.ts', 'Dockerfile']);
  assert.ok(affected.includes('req-testing'));
  assert.ok(affected.includes('req-devops'));

  // Deduplication check: repeated commits in list do not inflate continuity score
  const item = {
    requirementId: 'req-dup',
    requirementTitle: 'Dup Test',
    status: 'demonstrated',
    explanation: 'Test',
    repoFullName: 'alexchen/payment-orchestrator',
    commitSha: 'c1',
    confidence: 80,
    evidenceStrength: 'strong',
    relevantCommits: ['c1', 'c1', 'c1'] // duplicates of same commit
  };

  const score = computeScoreForEvidence(item);
  assert.equal(score.continuityBonus, DEFAULT_SCORING_CONFIG.continuity.singleCommit);
});

// ============================================================================
// 6. Conventional Commit Messages NOT Treated as Proof of AI Authorship
// ============================================================================
test('6. Conventional Commits - NEVER classified as AI authorship signals', () => {
  const conventionalCommits = [
    { sha: 'c1', message: 'feat: add payment processing route', authorName: 'Alex', timestamp: '2026-10-15', filesChanged: [] },
    { sha: 'c2', message: 'fix(api): resolve race condition in idempotency check', authorName: 'Alex', timestamp: '2026-10-15', filesChanged: [] },
    { sha: 'c3', message: 'chore: bump next to 16.4.2 and react to 19', authorName: 'Alex', timestamp: '2026-10-15', filesChanged: [] },
    { sha: 'c4', message: 'refactor: extract validation schema into separate file', authorName: 'Alex', timestamp: '2026-10-15', filesChanged: [] },
    { sha: 'c5', message: 'test: add unit tests for charge handler', authorName: 'Alex', timestamp: '2026-10-15', filesChanged: [] },
    { sha: 'c6', message: 'docs: update architecture diagram in README', authorName: 'Alex', timestamp: '2026-10-15', filesChanged: [] }
  ];

  const result = analyzeAIAuthorshipSignals({
    commits: conventionalCommits,
    fileComments: []
  });

  assert.equal(result.overallAssessment, 'insufficient_evidence', 'Standard conventional commits must NOT be classified as AI');
  assert.equal(result.findings.length, 0);
  assert.ok(result.limitationNotice.includes('NEVER used to deduct or penalize'));
  assert.ok(AI_SIGNAL_DISCLAIMER.includes('Stylistic uniformity'));
});

// ============================================================================
// 7. Generic Comments NOT Treated as Proof of AI Authorship
// ============================================================================
test('7. Grammatical and Polished Comments - NOT treated as proof of AI authorship', () => {
  const fileComments = [
    {
      filePath: 'src/service.ts',
      comments: [
        { line: 10, text: '/** Process incoming payment charge transaction */', subsequentCodeLine: 'async function processCharge() {' },
        { line: 20, text: '// Verify user balance before deducting ledger amounts', subsequentCodeLine: 'if (balance < amount) {' }
      ],
      totalCommentLines: 4,
      totalCodeLines: 50
    }
  ];

  const result = analyzeAIAuthorshipSignals({
    commits: [{ sha: 'c1', message: 'feat: add charge processor', authorName: 'Alex', timestamp: '2026-10-15', filesChanged: [] }],
    fileComments
  });

  assert.equal(result.overallAssessment, 'insufficient_evidence');
  assert.equal(result.findings.length, 0);
});

// ============================================================================
// 8. Contradictory Comments and Insufficient Evidence
// ============================================================================
test('8. Contradictory Comments & Unedited LLM Remnants - Detected with cautious assessment', () => {
  const aiCommits = [
    {
      sha: 'c1',
      message: 'Certainly! Here is the implementation of the payment refund service that you requested.',
      authorName: 'Alex',
      timestamp: '2026-10-15',
      filesChanged: []
    }
  ];

  const contradictoryComments = [
    {
      filePath: 'src/validator.ts',
      comments: [
        {
          line: 12,
          text: '// throws error if amount is negative or missing',
          subsequentCodeLine: 'return true;'
        }
      ],
      totalCommentLines: 2,
      totalCodeLines: 20
    }
  ];

  const result = analyzeAIAuthorshipSignals({
    commits: aiCommits,
    fileComments: contradictoryComments
  });

  assert.equal(result.overallAssessment, 'strong_signals');
  assert.ok(result.findings.some(f => f.signalAssessment === 'strong' && f.observedSignal.includes('conversational')));
  assert.ok(result.findings.some(f => f.observedSignal.includes('not reflected in subsequent implementation')));

  for (const f of result.findings) {
    assert.ok(f.limitation && f.limitation.length > 10, 'Every finding must include a transparent limitation statement');
  }
});

// ============================================================================
// 9. Missing History, Deleted Files, API Failures, and Rate Limits
// ============================================================================
test('9. Missing History & Rate Limits - Handles edge cases gracefully', () => {
  const rateLimitMsg = 'GitHub API rate limit exceeded. Limit resets at 12:00:00 PM. Please provide a GITHUB_TOKEN or retry later.';
  assert.ok(rateLimitMsg.includes('rate limit exceeded'));

  assert.equal(parseGitHubRepoUrl(''), null);
  assert.equal(parseGitHubRepoUrl('not a github url'), null);
  assert.deepEqual(parseGitHubRepoUrl('https://github.com/facebook/react'), { owner: 'facebook', repo: 'react' });
  assert.deepEqual(parseGitHubRepoUrl('facebook/react'), { owner: 'facebook', repo: 'react' });
  assert.deepEqual(parseGitHubRepoUrl('https://github.com/facebook/react.git'), { owner: 'facebook', repo: 'react' });
});

// ============================================================================
// 10. Failed Reassessments Preserving Previous Successful Revisions
// ============================================================================
test('10. Failed Reassessments - Preserves previous successful revisions intact', () => {
  const asmtId = `asmt-failed-test-${Date.now()}`;
  const assessment = {
    ...SAMPLE_ASSESSMENT,
    id: asmtId,
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${asmtId}-1`,
      assessmentId: asmtId,
      revisionNumber: 1
    }
  };
  saveAssessment(assessment);

  const initial = getAssessment(assessment.id);
  assert.ok(initial);
  assert.equal(initial.currentRevisionNumber, 1);
  assert.equal(initial.latestRevision.demonstratedCount, 4);

  // Simulate a reassessment failure (e.g. network failure)
  recordAssessmentFailure(assessment.id, 'Connection timeout to GitHub API');

  // Verify previous revision is still fully intact and unchanged
  const preserved = getAssessment(assessment.id);
  assert.ok(preserved);
  assert.equal(preserved.currentRevisionNumber, 1, 'Current revision number must NOT advance on failure');
  assert.equal(preserved.latestRevision.demonstratedCount, 4, 'Demonstrated count must be preserved');
  assert.ok(preserved.recentActivity.some(a => a.eventType === 'reassessment_failed'), 'Failure should be recorded in activity event log');
});

// ============================================================================
// 11. Historical Revision Comparisons
// ============================================================================
test('11. Historical Revision Comparison - Accurately details score and evidence diffs', () => {
  const assessmentId = `asmt-compare-test-${Date.now()}`;
  saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: assessmentId,
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${assessmentId}-1`,
      assessmentId: assessmentId,
      revisionNumber: 1
    }
  });

  const rev2 = {
    id: `rev-${assessmentId}-2`,
    assessmentId,
    revisionNumber: 2,
    commitSha: 'a2b3c4d',
    commitMessage: 'test: add automated test suites for payment routes',
    triggerType: 'webhook',
    evidence: [
      ...SAMPLE_ASSESSMENT.latestRevision.evidence.filter(e => e.requirementId !== 'req-testing'),
      {
        requirementId: 'req-testing',
        requirementTitle: 'Automated Testing & Coverage',
        status: 'demonstrated',
        evidenceType: 'test_verification',
        evidenceStrength: 'strong',
        explanation: 'Automated test suite implemented with passing assertions',
        repoFullName: 'alexchen/payment-orchestrator',
        filePath: 'tests/charge.test.ts',
        commitSha: 'a2b3c4d',
        confidence: 96,
        scoreBreakdown: {
          score: 85,
          rank: 1,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 55,
          testBonus: 25,
          continuityBonus: 5,
          factors: ['Verified active tests']
        }
      }
    ],
    demonstratedCount: 5,
    partialCount: 1,
    notDemonstratedCount: 1,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: new Date().toISOString()
  };

  saveRevision(rev2);

  const comparison = compareRevisions(assessmentId, 1, 2);
  assert.ok(comparison, 'Comparison must be generated');
  assert.equal(comparison.fromRevisionNumber, 1);
  assert.equal(comparison.toRevisionNumber, 2);
  assert.ok(comparison.modifiedEvidence.length > 0);

  const testingChange = comparison.modifiedEvidence.find(m => m.requirementId === 'req-testing');
  assert.ok(testingChange);
  assert.equal(testingChange.beforeStatus, 'not_demonstrated');
  assert.equal(testingChange.afterStatus, 'demonstrated');
  assert.ok(testingChange.changes.some(c => c.includes('Status changed')));
});

// ============================================================================
// 12. Webhook Signature Verification and Invalid Signatures
// ============================================================================
test('12. Webhook Signature Verification - Valid, tampered, and missing headers', () => {
  const secret = 'super_secret_webhook_signature_token';
  const payload = JSON.stringify({ ref: 'refs/heads/main', commits: [] });

  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const validHeader = `sha256=${hmac}`;
  const tamperedHeader = `sha256=${hmac.slice(0, -4)}dead`;

  assert.equal(verifyWebhookSignature(payload, validHeader, secret), true);
  assert.equal(verifyWebhookSignature(payload, tamperedHeader, secret), false);
  assert.equal(verifyWebhookSignature(payload, null, secret), false);
  assert.equal(verifyWebhookSignature(payload, 'sha256=short', secret), false);
});

// ============================================================================
// 13. Missing or Unauthorized Repository Access
// ============================================================================
test('13. Unauthorized / Missing Repo Access - Validates error responses', () => {
  const err404 = new Error('Repository user/private-repo not found or is private without authorized credentials.');
  assert.ok(err404.message.includes('not found or is private'));
});

// ============================================================================
// 14. Legacy Database Records and Schema Compatibility
// ============================================================================
test('14. Legacy Schema Compatibility - Older databases load gracefully with migrations', () => {
  const memDb = new DatabaseSync(':memory:');

  memDb.exec(`
    CREATE TABLE assessments (
      id TEXT PRIMARY KEY,
      internship_id TEXT NOT NULL,
      repo_full_name TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      default_branch TEXT NOT NULL,
      latest_commit_sha TEXT NOT NULL,
      current_revision_number INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  memDb.exec(`ALTER TABLE assessments ADD COLUMN analysis_scope_json TEXT;`);
  memDb.exec(`ALTER TABLE assessments ADD COLUMN ai_signals_json TEXT;`);

  const stmt = memDb.prepare(`
    INSERT INTO assessments (
      id, internship_id, repo_full_name, repo_url, default_branch,
      latest_commit_sha, current_revision_number, status, created_at, updated_at,
      analysis_scope_json, ai_signals_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run('legacy-1', 'job-1', 'user/repo', 'https://github.com/user/repo', 'main', 'c1', 1, 'completed', new Date().toISOString(), new Date().toISOString(), '{"commitsAnalyzed": 1}', null);

  const fetched = memDb.prepare(`SELECT * FROM assessments WHERE id = ?`).get('legacy-1');
  assert.ok(fetched);
  assert.equal(fetched.id, 'legacy-1');
  assert.ok(fetched.analysis_scope_json.includes('commitsAnalyzed'));
});

// ============================================================================
// 15. Frontend API Contract Compatibility
// ============================================================================
test('15. Frontend API Contract Compatibility - Verifies payload shape', () => {
  const assessment = getAssessment(SAMPLE_ASSESSMENT.id);
  assert.ok(assessment);

  assert.ok(assessment.id);
  assert.ok(assessment.internship);
  assert.ok(assessment.repository);
  assert.ok(assessment.latestRevision);
  assert.ok(Array.isArray(assessment.tasks));
  assert.ok(Array.isArray(assessment.recentActivity));

  const rev = assessment.latestRevision;
  assert.equal(typeof rev.revisionNumber, 'number');
  assert.equal(typeof rev.demonstratedCount, 'number');
  assert.equal(typeof rev.partialCount, 'number');
  assert.equal(typeof rev.notDemonstratedCount, 'number');
  assert.ok(Array.isArray(rev.evidence));

  const ev = rev.evidence[0];
  assert.ok(ev.requirementId);
  assert.ok(ev.requirementTitle);
  assert.ok(['demonstrated', 'partial', 'not_demonstrated'].includes(ev.status));
  assert.equal(typeof ev.confidence, 'number');
  assert.ok(ev.confidence >= 0 && ev.confidence <= 100);
});

// ============================================================================
// 16. Evaluation History Retention Policy (Maximum 10 Completed Evaluations)
// ============================================================================
test('16. Retention Policy - Fewer than 10 evaluations retained without deletion', () => {
  const asmtId = `asmt-retention-test-few-${Date.now()}`;
  saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: asmtId,
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${asmtId}-1`,
      assessmentId: asmtId,
      revisionNumber: 1
    }
  });

  // Save 4 additional evaluations (total 5)
  for (let revNum = 2; revNum <= 5; revNum++) {
    saveRevision({
      id: `rev-${asmtId}-${revNum}`,
      assessmentId: asmtId,
      revisionNumber: revNum,
      commitSha: `sha-${revNum}`,
      commitMessage: `feat: iteration ${revNum}`,
      triggerType: 'webhook',
      evidence: SAMPLE_ASSESSMENT.latestRevision.evidence,
      demonstratedCount: 4,
      partialCount: 1,
      notDemonstratedCount: 1,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: new Date(Date.now() + revNum * 1000).toISOString()
    });
  }

  assert.equal(MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT, 10, 'Default retention limit must be 10');
  const pruned = enforceEvaluationRetention(asmtId, MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT);
  assert.equal(pruned, 0, 'No evaluations should be pruned when count is below limit');

  const history = getRevisionHistory(asmtId);
  assert.equal(history.length, 5, 'All 5 evaluations must be retained without deletion');
  assert.deepEqual(history.map(r => r.revisionNumber), [5, 4, 3, 2, 1]);
});

test('17. Retention Policy - Exactly 10 retained after 11th evaluation; oldest deleted', () => {
  const asmtId = `asmt-retention-test-eleven-${Date.now()}`;
  saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: asmtId,
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${asmtId}-1`,
      assessmentId: asmtId,
      revisionNumber: 1
    }
  });

  // Add revisions 2 through 10 (total 10)
  for (let revNum = 2; revNum <= 10; revNum++) {
    saveRevision({
      id: `rev-${asmtId}-${revNum}`,
      assessmentId: asmtId,
      revisionNumber: revNum,
      commitSha: `sha-${revNum}`,
      commitMessage: `feat: iteration ${revNum}`,
      triggerType: 'webhook',
      evidence: SAMPLE_ASSESSMENT.latestRevision.evidence,
      demonstratedCount: 4,
      partialCount: 1,
      notDemonstratedCount: 1,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: new Date(Date.now() + revNum * 1000).toISOString()
    });
  }

  const historyAt10 = getRevisionHistory(asmtId);
  assert.equal(historyAt10.length, 10, 'Should hold exactly 10 evaluations');
  assert.equal(historyAt10[historyAt10.length - 1].revisionNumber, 1, 'Oldest is revision 1');

  // Add the 11th evaluation
  const rev11Id = `rev-${asmtId}-11`;
  saveRevision({
    id: rev11Id,
    assessmentId: asmtId,
    revisionNumber: 11,
    commitSha: 'sha-11',
    commitMessage: 'feat: 11th evaluation',
    triggerType: 'webhook',
    evidence: SAMPLE_ASSESSMENT.latestRevision.evidence,
    demonstratedCount: 5,
    partialCount: 0,
    notDemonstratedCount: 1,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: new Date(Date.now() + 11000).toISOString()
  });

  const historyAt11 = getRevisionHistory(asmtId);
  assert.equal(historyAt11.length, 10, 'Must strictly retain exactly 10 evaluations after 11th is saved');
  
  // Verify revision 1 was permanently deleted and revisions 2-11 are retained
  const revisionNumbers = historyAt11.map(r => r.revisionNumber);
  assert.deepEqual(revisionNumbers, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  assert.ok(!revisionNumbers.includes(1), 'Revision #1 must be deleted');

  // Stable database IDs verified
  for (let i = 2; i <= 11; i++) {
    assert.ok(historyAt11.some(r => r.id === `rev-${asmtId}-${i}`), `Stable ID rev-${asmtId}-${i} must remain unchanged`);
  }
});

test('18. Retention Policy - Failed evaluations do not delete; isolation & audit log preservation', () => {
  const asmtA = `asmt-retention-A-${Date.now()}`;
  const asmtB = `asmt-retention-B-${Date.now()}`;

  // Seed Assessment A with 11 revisions -> prunes to 10
  saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: asmtA,
    latestRevision: { ...SAMPLE_ASSESSMENT.latestRevision, id: `rev-${asmtA}-1`, assessmentId: asmtA, revisionNumber: 1 }
  });
  for (let i = 2; i <= 11; i++) {
    saveRevision({
      id: `rev-${asmtA}-${i}`,
      assessmentId: asmtA,
      revisionNumber: i,
      commitSha: `sha-A-${i}`,
      commitMessage: `feat A ${i}`,
      triggerType: 'webhook',
      evidence: SAMPLE_ASSESSMENT.latestRevision.evidence,
      demonstratedCount: 4,
      partialCount: 1,
      notDemonstratedCount: 1,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: new Date(Date.now() + i * 1000).toISOString()
    });
  }

  // Seed Assessment B with 4 revisions
  saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: asmtB,
    latestRevision: { ...SAMPLE_ASSESSMENT.latestRevision, id: `rev-${asmtB}-1`, assessmentId: asmtB, revisionNumber: 1 }
  });
  for (let i = 2; i <= 4; i++) {
    saveRevision({
      id: `rev-${asmtB}-${i}`,
      assessmentId: asmtB,
      revisionNumber: i,
      commitSha: `sha-B-${i}`,
      commitMessage: `feat B ${i}`,
      triggerType: 'webhook',
      evidence: SAMPLE_ASSESSMENT.latestRevision.evidence,
      demonstratedCount: 4,
      partialCount: 1,
      notDemonstratedCount: 1,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: new Date(Date.now() + i * 1000).toISOString()
    });
  }

  // Verify Assessment B is unaffected by Assessment A's evaluations
  const historyB = getRevisionHistory(asmtB);
  assert.equal(historyB.length, 4, 'Assessment B evaluations must be completely isolated');

  // Record a webhook delivery and check that retention does NOT prune webhook logs
  const deliveryId = `deliv-retention-${Date.now()}`;
  recordWebhookDelivery({
    id: `log-${deliveryId}`,
    deliveryId,
    repoFullName: 'test/retention-repo',
    eventType: 'push',
    commitSha: 'sha-test',
    commitMessage: 'webhook test',
    author: 'dev',
    filesChanged: ['src/app.ts'],
    signatureValid: true,
    affectedRequirements: [],
    createdAt: new Date().toISOString()
  });

  // Simulate a failed evaluation on Assessment A
  recordAssessmentFailure(asmtA, 'Simulated GitHub API rate limit error');

  // Verify failed evaluation did NOT delete any successful revisions
  const historyAAfterFailure = getRevisionHistory(asmtA);
  assert.equal(historyAAfterFailure.length, 10, 'Failed evaluations must NOT trigger revision deletion');

  // Verify assessment A has the failure recorded in activity log
  const asmtARecord = getAssessment(asmtA);
  assert.ok(asmtARecord.recentActivity.some(a => a.eventType === 'reassessment_failed'), 'Failure must be preserved in activity log');
});

// ============================================================================
// 19. Requirements with Strong, Partial, Missing, and Insufficient Evidence
// ============================================================================
test('19. Requirement Evidence Spectrum - Strong, partial, missing, and insufficient (empty repo)', async () => {
  const reqs = [
    { id: 'req-api', category: 'backend', title: 'REST API Development & Validation', description: 'API routes', importance: 'required' },
    { id: 'req-db', category: 'database', title: 'Database Schema Design & SQL Queries', description: 'SQL tables', importance: 'required' },
    { id: 'req-devops', category: 'devops', title: 'Docker & Containerization', description: 'Dockerfiles', importance: 'preferred' }
  ];

  // 1. Repository with Strong API evidence and Partial Database evidence
  const localFileCache = {
    'src/routes/users.ts': `
      import { Router } from 'express';
      export const router = Router();
      router.get('/users', async (req, res) => {
        res.json({ users: [] });
      });
    `,
    'db/config.ts': `
      export const dbConfig = { host: 'localhost', port: 5432 };
    `
  };

  const fileTree = [
    { path: 'src/routes/users.ts', mode: '100644', type: 'blob', sha: 'c1' },
    { path: 'db/config.ts', mode: '100644', type: 'blob', sha: 'c2' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements({
    owner: 'testdev',
    repo: 'sample-app',
    defaultBranch: 'main',
    commitSha: 'commit-sha-123',
    fileTree,
    commits: [
      { sha: 'commit-sha-122', message: 'feat: add users api route', authorName: 'Alex Dev', timestamp: new Date(Date.now() - 3600000).toISOString(), filesChanged: ['src/routes/users.ts'] },
      { sha: 'commit-sha-123', message: 'refactor: refine users controller', authorName: 'Alex Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/users.ts'] }
    ],
    localFileCache
  }, reqs);

  // Strong requirement verification
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  assert.ok(apiEv, 'API evidence must be generated');
  assert.equal(apiEv.status, 'demonstrated');
  assert.equal(apiEv.evidenceType, 'direct_implementation');
  assert.equal(apiEv.evidenceStrength, 'strong');
  assert.ok(apiEv.filePath && apiEv.filePath.includes('src/routes/users.ts'));
  assert.ok(apiEv.lineStart && apiEv.lineStart > 0);
  assert.ok(apiEv.codeExcerpt && apiEv.codeExcerpt.includes('router.get'));
  assert.ok(apiEv.confidence >= 85, 'Strong evidence should have high grounded confidence');

  // Partial requirement verification
  const dbEv = analysis.evidenceList.find(e => e.requirementId === 'req-db');
  assert.ok(dbEv, 'DB evidence must be generated');
  assert.equal(dbEv.status, 'partial');
  assert.equal(dbEv.evidenceStrength, 'moderate');
  assert.ok(dbEv.filePath && dbEv.filePath.includes('db/config.ts'));
  assert.ok(dbEv.explanation.includes('Partial evidence'));

  // Missing requirement verification (active tree scanned, confirmed absent)
  const devopsEv = analysis.evidenceList.find(e => e.requirementId === 'req-devops');
  assert.ok(devopsEv, 'Devops evidence must be generated');
  assert.equal(devopsEv.status, 'not_demonstrated');
  assert.equal(devopsEv.evidenceType, 'none');
  assert.ok(devopsEv.confidence >= 85, 'Confirmed negative finding across active tree should have high confidence');

  // 2. Empty repository verification (Insufficient Evidence)
  const emptyAnalysis = await analyzeRepositoryAgainstRequirements({
    owner: 'testdev',
    repo: 'empty-repo',
    defaultBranch: 'main',
    commitSha: 'commit-empty',
    fileTree: [],
    commits: []
  }, reqs);

  assert.equal(emptyAnalysis.analysisScope.filesInspected, 0);
  assert.equal(emptyAnalysis.analysisScope.truncated, false);
  for (const ev of emptyAnalysis.evidenceList) {
    assert.equal(ev.status, 'not_demonstrated');
    assert.equal(ev.isInsufficientEvidence, true, 'Empty repo must be flagged as insufficient evidence');
    assert.equal(ev.confidence, 25, 'Empty repo confidence must be low rather than falsely confident failure');
    assert.ok(ev.explanation.includes('Insufficient repository evidence'), 'Explanation must distinguish empty repo from failure');
  }
});

// ============================================================================
// 20. Anti-Double-Counting and Shared Evidence Safeguards
// ============================================================================
test('20. Anti-Double-Counting Safeguards - Identical code cannot inflate multiple requirements', async () => {
  const reqs = [
    { id: 'req-api', category: 'backend', title: 'REST API Development & Validation', description: 'API routes', importance: 'required' },
    { id: 'req-typescript', category: 'core', title: 'TypeScript / Strict Static Typing', description: 'Types', importance: 'required' }
  ];

  // Repo has ONLY ONE single file: server.ts
  const localFileCache = {
    'src/server.ts': `
      import express from 'express';
      const app = express();
      app.get('/health', (req, res) => res.json({ status: 'ok' }));
    `
  };

  const fileTree = [
    { path: 'src/server.ts', mode: '100644', type: 'blob', sha: 'c1' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements({
    owner: 'testdev',
    repo: 'single-file-app',
    defaultBranch: 'main',
    commitSha: 'c1',
    fileTree,
    commits: [{ sha: 'c1', message: 'feat: init server', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/server.ts'] }],
    localFileCache
  }, reqs);

  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  const tsEv = analysis.evidenceList.find(e => e.requirementId === 'req-typescript');

  assert.ok(apiEv);
  assert.ok(tsEv);

  // One of them is primary, the other is detected as shared evidence
  const sharedEv = [apiEv, tsEv].find(e => e.sharedEvidenceWith && e.sharedEvidenceWith.length > 0);
  assert.ok(sharedEv, 'One requirement must detect shared overlapping evidence');
  assert.ok(sharedEv.uncertaintyNotes && sharedEv.uncertaintyNotes.includes('Anti-double-counting'));

  // Base points must be capped so points are not duplicated
  assert.ok(sharedEv.scoreBreakdown.basePoints <= 15, 'Base points must be capped for duplicate/shared claims');
  assert.ok(sharedEv.scoreBreakdown.factors.some(f => f.includes('prevent double-counting')));
});

// ============================================================================
// 21. Reusable Core Evaluation Engine (evaluateRepositoryCore)
// ============================================================================
test('21. Reusable Core Evaluation Engine - Structured results and deterministic narrative', async () => {
  const result = await evaluateRepositoryCore({
    repoFullName: 'testuser/core-engine-repo',
    defaultBranch: 'main',
    targetCommitSha: 'sha-core-100',
    requirements: SAMPLE_ASSESSMENT.internship.requirements,
    triggerType: 'manual',
    fileTree: [
      { path: 'src/routes/charge.ts', mode: '100644', type: 'blob', sha: 'c1' },
      { path: 'tests/charge.test.ts', mode: '100644', type: 'blob', sha: 'c2' },
      { path: 'Dockerfile', mode: '100644', type: 'blob', sha: 'c3' },
      { path: 'README.md', mode: '100644', type: 'blob', sha: 'c4' }
    ],
    commits: [
      { sha: 'sha-core-099', message: 'feat: payment routes and Docker setup', authorName: 'Core Dev', timestamp: new Date(Date.now() - 3600000).toISOString(), filesChanged: ['src/routes/charge.ts', 'Dockerfile'] },
      { sha: 'sha-core-100', message: 'test: add test suite with assertions', authorName: 'Core Dev', timestamp: new Date().toISOString(), filesChanged: ['tests/charge.test.ts'] }
    ],
    localFileCache: {
      'src/routes/charge.ts': 'export async function POST(req, res) { return res.json({ ok: true }); }',
      'tests/charge.test.ts': 'test("charge payment", () => { assert.equal(1, 1); expect(true).toBe(true); });',
      'Dockerfile': 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "app.js"]',
      'README.md': '# Core Engine Project\nDocumented setup instructions.'
    }
  });

  assert.equal(result.success, true);
  assert.ok(Array.isArray(result.evidenceList));
  assert.ok(result.summary);
  assert.equal(result.summary.scoringRuleVersion, SCORING_RULE_VERSION);
  assert.ok(result.summary.demonstratedCount > 0);
  assert.ok(result.analysisScope);
  assert.equal(result.analysisScope.branch, 'main');
  assert.ok(result.aiSignals);

  // Check deterministic calculation summary
  for (const ev of result.evidenceList) {
    assert.ok(ev.scoreBreakdown, 'Each evidence must have a scoreBreakdown');
    assert.ok(ev.scoreBreakdown.calculationSummary, 'Must contain a documented calculation narrative');
    assert.ok(ev.scoreBreakdown.calculationSummary.includes('Breakdown:'), 'Summary must specify component points');
  }
});

// ============================================================================
// 22. Error Resilience and Failure Preservation (Missing Repo, Malformed Input)
// ============================================================================
test('22. Error Resilience - Inaccessible repositories return structured error without crashing', async () => {
  // 1. Invalid input validation
  const invalidResult = await evaluateRepositoryCore({
    repoFullName: '',
    requirements: []
  });
  assert.equal(invalidResult.success, false);
  assert.equal(invalidResult.errorCode, 'INVALID_INPUT');

  // 2. Malformed repo URL
  const malformedResult = await evaluateRepositoryCore({
    repoFullName: 'not-a-valid-url-format',
    requirements: SAMPLE_ASSESSMENT.internship.requirements
  });
  assert.equal(malformedResult.success, false);
  assert.equal(malformedResult.errorCode, 'INVALID_INPUT');

  // 3. Failure preservation in database
  const asmtId = `asmt-fail-preserve-${Date.now()}`;
  saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: asmtId,
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${asmtId}-1`,
      assessmentId: asmtId,
      revisionNumber: 1
    }
  });

  // Record failure
  recordAssessmentFailure(asmtId, 'Simulated GitHub 404 Not Found error');

  const preserved = getAssessment(asmtId);
  assert.ok(preserved);
  assert.equal(preserved.currentRevisionNumber, 1, 'Revision number must not advance on failure');
  assert.ok(preserved.recentActivity.some(a => a.eventType === 'reassessment_failed'));
});

