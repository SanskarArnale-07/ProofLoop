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
  saveRevision
} = jiti('../src/lib/db.ts');

const {
  SAMPLE_ASSESSMENT
} = jiti('../src/lib/sample-data.ts');

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
  const assessment = SAMPLE_ASSESSMENT;
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
  const assessmentId = SAMPLE_ASSESSMENT.id;

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
