import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const {
  saveAssessment,
  saveRevision,
  getAssessment,
  getEvaluationHistory,
  compareRevisions,
  recordAssessmentFailure
} = jiti('../src/lib/db.ts');

const {
  SAMPLE_ASSESSMENT,
  ensureSampleDataSeeded
} = jiti('../src/lib/sample-data.ts');

const { SCORING_RULE_VERSION } = jiti('../src/lib/scoring.ts');

// Seed base sample data
ensureSampleDataSeeded();

function createTestAssessment(id, requirementsCount = 3) {
  const reqs = [];
  for (let i = 1; i <= requirementsCount; i++) {
    reqs.push({
      id: `req-test-${i}`,
      category: 'backend',
      title: `Requirement ${i}`,
      description: `Testing requirement ${i}`,
      importance: 'required'
    });
  }

  const initialEvidence = reqs.map((r, idx) => ({
    requirementId: r.id,
    requirementTitle: r.title,
    status: idx === 0 ? 'demonstrated' : idx === 1 ? 'partial' : 'not_demonstrated',
    evidenceType: 'direct_implementation',
    confidence: 85,
    filePath: `src/feature_${r.id}.ts`,
    lineStart: 10,
    lineEnd: 25,
    codeExcerpt: `export function feature_${r.id}() { return true; }`,
    scoreBreakdown: {
      score: idx === 0 ? 80 : idx === 1 ? 40 : 0,
      rank: idx + 1,
      ruleVersion: SCORING_RULE_VERSION,
      basePoints: idx === 0 ? 55 : idx === 1 ? 35 : 0,
      testBonus: idx === 0 ? 25 : 0,
      continuityBonus: 0,
      factors: []
    }
  }));

  const assessment = {
    ...SAMPLE_ASSESSMENT,
    id,
    internship: {
      ...SAMPLE_ASSESSMENT.internship,
      id: `internship-${id}`,
      requirements: reqs
    },
    latestRevision: {
      id: `rev-${id}-1`,
      assessmentId: id,
      revisionNumber: 1,
      commitSha: 'sha-001-init',
      commitMessage: 'Initial evaluation commit',
      triggerType: 'initial',
      evidence: initialEvidence,
      demonstratedCount: 1,
      partialCount: 1,
      notDemonstratedCount: 1,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: new Date('2026-10-14T10:00:00.000Z').toISOString()
    }
  };

  saveAssessment(assessment);
  return assessment;
}

// ============================================================================
// 1. Assessment with No Previous Evaluations / Empty History
// ============================================================================

test('Evaluation History: handles non-existent or empty assessments gracefully', () => {
  const nonExistentId = `asmt-empty-${Date.now()}`;
  const history = getEvaluationHistory(nonExistentId);

  assert.equal(history.evaluations.length, 0);
  assert.equal(history.latestEvaluation, null);
  assert.equal(history.total, 0);
  assert.equal(history.hasMore, false);
});

// ============================================================================
// 2. Single and Multiple Successful Evaluations with Stable IDs
// ============================================================================

test('Evaluation History: single evaluation returns correct metadata and latest pointer', () => {
  const asmtId = `asmt-single-${Date.now()}`;
  createTestAssessment(asmtId, 3);

  const history = getEvaluationHistory(asmtId);
  assert.equal(history.total, 1);
  assert.equal(history.evaluations.length, 1);
  assert.ok(history.latestEvaluation);

  const ev = history.evaluations[0];
  assert.equal(ev.id, `rev-${asmtId}-1`);
  assert.equal(ev.evaluationNumber, 1);
  assert.equal(ev.revisionNumber, 1);
  assert.equal(ev.triggerType, 'initial');
  assert.equal(ev.commitSha, 'sha-001-init');
  assert.equal(typeof ev.overallScore, 'number');
  assert.ok(ev.overallScore >= 0 && ev.overallScore <= 100);
  assert.equal(ev.demonstratedCount, 1);
  assert.equal(ev.partialCount, 1);
  assert.equal(ev.notDemonstratedCount, 1);
  assert.equal(ev.totalRequirements, 3);
  assert.equal(ev.isLatest, true);
});

test('Evaluation History: multiple evaluations retain stable database IDs and timestamps', () => {
  const asmtId = `asmt-multi-${Date.now()}`;
  const asmt = createTestAssessment(asmtId, 3);

  // Add revision 2
  saveRevision({
    id: `rev-${asmtId}-2`,
    assessmentId: asmtId,
    revisionNumber: 2,
    commitSha: 'sha-002-webhook',
    commitMessage: 'feat: add payment gateway',
    triggerType: 'webhook',
    evidence: asmt.latestRevision.evidence,
    demonstratedCount: 2,
    partialCount: 1,
    notDemonstratedCount: 0,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: new Date('2026-10-14T11:00:00.000Z').toISOString()
  });

  // Add revision 3
  saveRevision({
    id: `rev-${asmtId}-3`,
    assessmentId: asmtId,
    revisionNumber: 3,
    commitSha: 'sha-003-manual',
    commitMessage: 'chore: add comprehensive test suite',
    triggerType: 'manual',
    evidence: asmt.latestRevision.evidence,
    demonstratedCount: 3,
    partialCount: 0,
    notDemonstratedCount: 0,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: new Date('2026-10-14T12:00:00.000Z').toISOString()
  });

  const history = getEvaluationHistory(asmtId);
  assert.equal(history.total, 3);
  assert.equal(history.evaluations.length, 3);

  // Stable IDs must be preserved exactly
  assert.equal(history.evaluations[0].id, `rev-${asmtId}-1`);
  assert.equal(history.evaluations[1].id, `rev-${asmtId}-2`);
  assert.equal(history.evaluations[2].id, `rev-${asmtId}-3`);

  // Latest evaluation must point to revision 3
  assert.equal(history.latestEvaluation?.revisionNumber, 3);
  assert.equal(history.latestEvaluation?.id, `rev-${asmtId}-3`);
  assert.equal(history.evaluations[2].isLatest, true);
  assert.equal(history.evaluations[0].isLatest, false);
});

// ============================================================================
// 3. Chronological Ordering (Oldest to Newest) & Order Option
// ============================================================================

test('Evaluation History: chronological ordering (oldest to newest by default)', () => {
  const asmtId = `asmt-order-${Date.now()}`;
  const asmt = createTestAssessment(asmtId, 2);

  for (let rev = 2; rev <= 4; rev++) {
    saveRevision({
      id: `rev-${asmtId}-${rev}`,
      assessmentId: asmtId,
      revisionNumber: rev,
      commitSha: `sha-00${rev}`,
      commitMessage: `Rev ${rev}`,
      triggerType: 'webhook',
      evidence: asmt.latestRevision.evidence,
      demonstratedCount: 1,
      partialCount: 1,
      notDemonstratedCount: 0,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: new Date(Date.now() + rev * 1000).toISOString()
    });
  }

  // Default: chronological ASC (oldest to newest)
  const chrono = getEvaluationHistory(asmtId);
  assert.equal(chrono.evaluations[0].revisionNumber, 1);
  assert.equal(chrono.evaluations[1].revisionNumber, 2);
  assert.equal(chrono.evaluations[2].revisionNumber, 3);
  assert.equal(chrono.evaluations[3].revisionNumber, 4);

  // Explicit DESC option (newest to oldest)
  const desc = getEvaluationHistory(asmtId, { order: 'desc' });
  assert.equal(desc.evaluations[0].revisionNumber, 4);
  assert.equal(desc.evaluations[1].revisionNumber, 3);
  assert.equal(desc.evaluations[2].revisionNumber, 2);
  assert.equal(desc.evaluations[3].revisionNumber, 1);
});

// ============================================================================
// 4. Pagination
// ============================================================================

test('Evaluation History: pagination parameters limit and offset', () => {
  const asmtId = `asmt-page-${Date.now()}`;
  const asmt = createTestAssessment(asmtId, 2);

  for (let rev = 2; rev <= 5; rev++) {
    saveRevision({
      id: `rev-${asmtId}-${rev}`,
      assessmentId: asmtId,
      revisionNumber: rev,
      commitSha: `sha-${rev}`,
      commitMessage: `Rev ${rev}`,
      triggerType: 'webhook',
      evidence: asmt.latestRevision.evidence,
      demonstratedCount: 1,
      partialCount: 1,
      notDemonstratedCount: 0,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: new Date(Date.now() + rev * 1000).toISOString()
    });
  }

  // Page 1 (limit 2, offset 0)
  const page1 = getEvaluationHistory(asmtId, { limit: 2, offset: 0 });
  assert.equal(page1.evaluations.length, 2);
  assert.equal(page1.total, 5);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.evaluations[0].revisionNumber, 1);
  assert.equal(page1.evaluations[1].revisionNumber, 2);

  // Page 2 (limit 2, offset 2)
  const page2 = getEvaluationHistory(asmtId, { limit: 2, offset: 2 });
  assert.equal(page2.evaluations.length, 2);
  assert.equal(page2.hasMore, true);
  assert.equal(page2.evaluations[0].revisionNumber, 3);
  assert.equal(page2.evaluations[1].revisionNumber, 4);

  // Page 3 (limit 2, offset 4)
  const page3 = getEvaluationHistory(asmtId, { limit: 2, offset: 4 });
  assert.equal(page3.evaluations.length, 1);
  assert.equal(page3.hasMore, false);
  assert.equal(page3.evaluations[0].revisionNumber, 5);
});

// ============================================================================
// 5. Evaluation Comparison: Overall Score & Requirement Score Changes
// ============================================================================

test('Evaluation Comparison: calculates overall score delta and requirement score changes', () => {
  const asmtId = `asmt-cmp-score-${Date.now()}`;
  createTestAssessment(asmtId, 2);

  // Revision 2 with increased evidence scores
  saveRevision({
    id: `rev-${asmtId}-2`,
    assessmentId: asmtId,
    revisionNumber: 2,
    commitSha: 'sha-cmp-02',
    commitMessage: 'feat: add tested implementation',
    triggerType: 'webhook',
    evidence: [
      {
        requirementId: 'req-test-1',
        requirementTitle: 'Requirement 1',
        status: 'demonstrated',
        scoreBreakdown: {
          score: 95,
          rank: 1,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 55,
          testBonus: 25,
          continuityBonus: 15,
          factors: []
        }
      },
      {
        requirementId: 'req-test-2',
        requirementTitle: 'Requirement 2',
        status: 'demonstrated',
        scoreBreakdown: {
          score: 85,
          rank: 2,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 55,
          testBonus: 20,
          continuityBonus: 10,
          factors: []
        }
      }
    ],
    demonstratedCount: 2,
    partialCount: 0,
    notDemonstratedCount: 0,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: new Date().toISOString()
  });

  const comparison = compareRevisions(asmtId, 1, 2);
  assert.ok(comparison);
  assert.equal(comparison.fromRevisionNumber, 1);
  assert.equal(comparison.toRevisionNumber, 2);
  assert.ok(comparison.overallScoreChange);
  assert.ok(comparison.overallScoreChange.delta > 0, 'Overall score must improve');
  assert.equal(comparison.overallScoreChange.afterScore, 90); // (95 + 85) / 2 = 90
});

// ============================================================================
// 6. Improvements, Regressions, and Unchanged Classification
// ============================================================================

test('Evaluation Comparison: correctly categorizes improved, regressed, and unchanged requirements', () => {
  const asmtId = `asmt-cmp-cat-${Date.now()}`;

  // Revision 1
  saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: asmtId,
    latestRevision: {
      id: `rev-${asmtId}-1`,
      assessmentId: asmtId,
      revisionNumber: 1,
      commitSha: 'sha-1',
      commitMessage: 'rev 1',
      triggerType: 'initial',
      evidence: [
        {
          requirementId: 'req-improve',
          requirementTitle: 'Improve Skill',
          status: 'partial',
          scoreBreakdown: { score: 40, rank: 2, ruleVersion: SCORING_RULE_VERSION, basePoints: 40, testBonus: 0, continuityBonus: 0, factors: [] }
        },
        {
          requirementId: 'req-regress',
          requirementTitle: 'Regress Skill',
          status: 'demonstrated',
          scoreBreakdown: { score: 85, rank: 1, ruleVersion: SCORING_RULE_VERSION, basePoints: 55, testBonus: 20, continuityBonus: 10, factors: [] }
        },
        {
          requirementId: 'req-same',
          requirementTitle: 'Unchanged Skill',
          status: 'demonstrated',
          scoreBreakdown: { score: 80, rank: 3, ruleVersion: SCORING_RULE_VERSION, basePoints: 55, testBonus: 25, continuityBonus: 0, factors: [] }
        }
      ],
      demonstratedCount: 2,
      partialCount: 1,
      notDemonstratedCount: 0,
      createdAt: new Date('2026-10-14T10:00:00.000Z').toISOString()
    }
  });

  // Revision 2
  saveRevision({
    id: `rev-${asmtId}-2`,
    assessmentId: asmtId,
    revisionNumber: 2,
    commitSha: 'sha-2',
    commitMessage: 'rev 2',
    triggerType: 'webhook',
    evidence: [
      {
        requirementId: 'req-improve',
        requirementTitle: 'Improve Skill',
        status: 'demonstrated',
        scoreBreakdown: { score: 90, rank: 1, ruleVersion: SCORING_RULE_VERSION, basePoints: 55, testBonus: 25, continuityBonus: 10, factors: [] }
      },
      {
        requirementId: 'req-regress',
        requirementTitle: 'Regress Skill',
        status: 'partial',
        scoreBreakdown: { score: 45, rank: 3, ruleVersion: SCORING_RULE_VERSION, basePoints: 35, testBonus: 10, continuityBonus: 0, factors: [] }
      },
      {
        requirementId: 'req-same',
        requirementTitle: 'Unchanged Skill',
        status: 'demonstrated',
        scoreBreakdown: { score: 80, rank: 2, ruleVersion: SCORING_RULE_VERSION, basePoints: 55, testBonus: 25, continuityBonus: 0, factors: [] }
      }
    ],
    demonstratedCount: 2,
    partialCount: 1,
    notDemonstratedCount: 0,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: new Date('2026-10-14T11:00:00.000Z').toISOString()
  });

  const comparison = compareRevisions(asmtId, 1, 2);
  assert.ok(comparison);

  // Newly demonstrated
  assert.ok(comparison.newlyDemonstrated);
  assert.equal(comparison.newlyDemonstrated.length, 1);
  assert.equal(comparison.newlyDemonstrated[0].requirementId, 'req-improve');

  // Categorized requirements
  assert.ok(comparison.categorizedRequirements);
  assert.equal(comparison.categorizedRequirements.improved.length, 1);
  assert.equal(comparison.categorizedRequirements.improved[0].requirementId, 'req-improve');
  assert.equal(comparison.categorizedRequirements.improved[0].delta, 50);

  assert.equal(comparison.categorizedRequirements.regressed.length, 1);
  assert.equal(comparison.categorizedRequirements.regressed[0].requirementId, 'req-regress');
  assert.equal(comparison.categorizedRequirements.regressed[0].delta, -40);

  assert.equal(comparison.categorizedRequirements.unchanged.length, 1);
  assert.equal(comparison.categorizedRequirements.unchanged[0].requirementId, 'req-same');
});

// ============================================================================
// 7. Missing Evidence & Older Incomplete Data Explicitly Identified
// ============================================================================

test('Evaluation Comparison: explicitly flags unavailable data instead of guessing', () => {
  const asmtId = `asmt-cmp-missing-${Date.now()}`;

  // Revision 1 without codeExcerpt for requirement 1, and only tracks req-1
  saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: asmtId,
    latestRevision: {
      id: `rev-${asmtId}-1`,
      assessmentId: asmtId,
      revisionNumber: 1,
      commitSha: 'sha-old',
      commitMessage: 'old revision',
      triggerType: 'initial',
      evidence: [
        {
          requirementId: 'req-old',
          requirementTitle: 'Old Requirement',
          status: 'partial',
          scoreBreakdown: { score: 40, rank: 1, ruleVersion: SCORING_RULE_VERSION, basePoints: 40, testBonus: 0, continuityBonus: 0, factors: [] }
          // Note: no codeExcerpt and no filePath
        }
      ],
      demonstratedCount: 0,
      partialCount: 1,
      notDemonstratedCount: 0,
      createdAt: new Date('2026-10-14T10:00:00.000Z').toISOString()
    }
  });

  // Revision 2 tracks req-old and introduces new req-new
  saveRevision({
    id: `rev-${asmtId}-2`,
    assessmentId: asmtId,
    revisionNumber: 2,
    commitSha: 'sha-new',
    commitMessage: 'new revision',
    triggerType: 'webhook',
    evidence: [
      {
        requirementId: 'req-old',
        requirementTitle: 'Old Requirement',
        status: 'demonstrated',
        filePath: 'src/old.ts',
        codeExcerpt: 'export const old = 1;',
        scoreBreakdown: { score: 85, rank: 2, ruleVersion: SCORING_RULE_VERSION, basePoints: 55, testBonus: 20, continuityBonus: 10, factors: [] }
      },
      {
        requirementId: 'req-new',
        requirementTitle: 'Brand New Requirement',
        status: 'demonstrated',
        filePath: 'src/new.ts',
        codeExcerpt: 'export const brandNew = true;',
        scoreBreakdown: { score: 90, rank: 1, ruleVersion: SCORING_RULE_VERSION, basePoints: 55, testBonus: 25, continuityBonus: 10, factors: [] }
      }
    ],
    demonstratedCount: 2,
    partialCount: 0,
    notDemonstratedCount: 0,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: new Date('2026-10-14T11:00:00.000Z').toISOString()
  });

  const comparison = compareRevisions(asmtId, 1, 2);
  assert.ok(comparison);
  assert.ok(Array.isArray(comparison.unavailableData));
  assert.ok(comparison.unavailableData.length > 0, 'Unavailable data array must explicitly list missing points');

  // Should clearly notice that req-new was not tracked in revision 1
  assert.ok(comparison.unavailableData.some(d => d.includes('Brand New Requirement') || d.includes('req-new')));

  // Should notice code citation or file location missing in revision 1
  assert.ok(comparison.unavailableData.some(d => d.includes('Old Requirement')));
});

// ============================================================================
// 8. Evaluation Comparison by Stable ID as well as Revision Number
// ============================================================================

test('Evaluation Comparison: accepts both revision numbers and stable database IDs', () => {
  const asmtId = `asmt-cmp-ids-${Date.now()}`;
  const asmt = createTestAssessment(asmtId, 2);

  saveRevision({
    id: `rev-${asmtId}-2`,
    assessmentId: asmtId,
    revisionNumber: 2,
    commitSha: 'sha-2',
    commitMessage: 'rev 2',
    triggerType: 'webhook',
    evidence: asmt.latestRevision.evidence,
    demonstratedCount: 1,
    partialCount: 1,
    notDemonstratedCount: 0,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: new Date().toISOString()
  });

  // Compare using revision numbers: (1, 2)
  const cmpByNumbers = compareRevisions(asmtId, 1, 2);
  assert.ok(cmpByNumbers);

  // Compare using stable IDs: (`rev-${asmtId}-1`, `rev-${asmtId}-2`)
  const cmpByIds = compareRevisions(asmtId, `rev-${asmtId}-1`, `rev-${asmtId}-2`);
  assert.ok(cmpByIds);
  assert.equal(cmpByIds.fromRevisionNumber, 1);
  assert.equal(cmpByIds.toRevisionNumber, 2);
  assert.equal(cmpByIds.fromEvaluationId, `rev-${asmtId}-1`);
  assert.equal(cmpByIds.toEvaluationId, `rev-${asmtId}-2`);
});

// ============================================================================
// 9. Comparison Isolation: Rejects Cross-Assessment Comparison
// ============================================================================

test('Evaluation Comparison: rejects comparisons across different assessments', () => {
  const asmtA = `asmt-cross-A-${Date.now()}`;
  const asmtB = `asmt-cross-B-${Date.now()}`;

  createTestAssessment(asmtA, 2);
  createTestAssessment(asmtB, 2);

  // Attempting to compare revision from Assessment A with revision from Assessment B under Assessment A scope
  const invalidCross = compareRevisions(asmtA, `rev-${asmtA}-1`, `rev-${asmtB}-1`);
  assert.equal(invalidCross, null, 'Must reject cross-assessment comparison');
});

// ============================================================================
// 10. Failed Evaluations Do Not Appear in Evaluation History
// ============================================================================

test('Evaluation History: failed evaluations are recorded in activity events but NOT revisions', () => {
  const asmtId = `asmt-fail-isolation-${Date.now()}`;
  createTestAssessment(asmtId, 2);

  const initialHistory = getEvaluationHistory(asmtId);
  assert.equal(initialHistory.total, 1);

  // Record a failure
  recordAssessmentFailure(asmtId, 'Simulated GitHub 503 Service Unavailable');

  const afterFailure = getEvaluationHistory(asmtId);
  assert.equal(afterFailure.total, 1, 'Total successful evaluations must remain 1');
  assert.equal(afterFailure.evaluations[0].triggerType, 'initial');

  // Verify failure is documented in assessment activity log
  const asmt = getAssessment(asmtId);
  assert.ok(asmt);
  assert.ok(asmt.recentActivity.some(a => a.eventType === 'reassessment_failed'));
});

// ============================================================================
// 11. Retention Limit Compatibility (Max 10)
// ============================================================================

test('Evaluation Retention: enforces max 10 retained successful evaluations atomically', () => {
  const asmtId = `asmt-retention-spec-${Date.now()}`;
  const asmt = createTestAssessment(asmtId, 2);

  // Add 10 additional revisions (total 11)
  for (let i = 2; i <= 11; i++) {
    saveRevision({
      id: `rev-${asmtId}-${i}`,
      assessmentId: asmtId,
      revisionNumber: i,
      commitSha: `sha-${i}`,
      commitMessage: `feat: iteration ${i}`,
      triggerType: 'webhook',
      evidence: asmt.latestRevision.evidence,
      demonstratedCount: 1,
      partialCount: 1,
      notDemonstratedCount: 0,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: new Date(Date.now() + i * 1000).toISOString()
    });
  }

  const history = getEvaluationHistory(asmtId);
  assert.equal(history.total, 10, 'Exactly 10 evaluations must be retained');
  assert.equal(history.evaluations.length, 10);

  // Revision 1 must be pruned; oldest in history must be Revision 2
  const numbers = history.evaluations.map(e => e.evaluationNumber);
  assert.deepEqual(numbers, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(!numbers.includes(1), 'Revision 1 must have been deleted by retention policy');
});

// ============================================================================
// 12. Secret and Token Exposure Safeguard
// ============================================================================

test('Evaluation History & Comparison: never exposes secrets, tokens, or private credentials', () => {
  const asmtId = `asmt-secrets-${Date.now()}`;
  createTestAssessment(asmtId, 2);

  const history = getEvaluationHistory(asmtId, { includeEvidence: true });
  const serializedHistory = JSON.stringify(history);

  assert.ok(!serializedHistory.includes('token_ghp_'), 'Must never expose GitHub personal access tokens');
  assert.ok(!serializedHistory.includes('client_secret'), 'Must never expose client secrets');
  assert.ok(!serializedHistory.includes('PRIVATE KEY'), 'Must never expose private keys');
});
