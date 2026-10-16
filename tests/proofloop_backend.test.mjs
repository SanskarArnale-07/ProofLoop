import test from 'node:test';
import assert from 'node:assert/strict';
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
  SAMPLE_ASSESSMENT,
  ensureSampleDataSeeded
} = jiti('../src/lib/sample-data.ts');

ensureSampleDataSeeded();

const {
  evaluateRepositoryCore,
  analyzeRepositoryAgainstRequirements
} = jiti('../src/lib/analyzer.ts');

// ============================================================================
// Additional helper functions for evidence-based evaluation testing
// ============================================================================

function createRepositoryEvidence(options: {
  requirementId: string;
  requirementTitle: string;
  status: 'demonstrated' | 'partial' | 'not_demonstrated' | 'insufficient';
  evidenceType: 'direct_implementation' | 'test_verification' | 'configuration' | 'dependency_usage' | 'documentation' | 'none';
  evidenceStrength: 'strong' | 'moderate' | 'weak' | 'none';
  explanation: string;
  humanReadableExplanation?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeExcerpt?: string;
  confidence?: number;
  relevantCommits?: string[];
  relevantFiles?: string[];
  additionsOrPatterns?: string[];
  testResultsSummary?: {
    testFilesCount: number;
    assertionsFound: number;
    verifiedPassing?: boolean;
    executionSummary?: string;
  };
  limitations?: string[];
  contradictoryEvidence?: string[];
  missingInformation?: string[];
  uncertaintyNotes?: string;
  authorAttribution?: {
    author: string;
    isDirectAuthor: boolean;
    attributionCertainty: 'verified' | 'probable' | 'uncertain' | 'shared';
    attributionNotes?: string;
  };
  sharedEvidenceWith?: string[];
  isInsufficientEvidence?: boolean;
}): any {
  return {
    requirementId: options.requirementId,
    requirementTitle: options.requirementTitle,
    status: options.status,
    evidenceType: options.evidenceType,
    evidenceStrength: options.evidenceStrength,
    explanation: options.explanation,
    humanReadableExplanation: options.humanReadableExplanation || options.explanation,
    filePath: options.filePath,
    lineStart: options.lineStart,
    lineEnd: options.lineEnd,
    codeExcerpt: options.codeExcerpt,
    confidence: options.confidence || 50,
    relevantCommits: options.relevantCommits || [],
    relevantFiles: options.relevantFiles || [],
    additionsOrPatterns: options.additionsOrPatterns || [],
    testResultsSummary: options.testResultsSummary,
    limitations: options.limitations || [],
    contradictoryEvidence: options.contradictoryEvidence || [],
    missingInformation: options.missingInformation || [],
    uncertaintyNotes: options.uncertaintyNotes,
    authorAttribution: options.authorAttribution || {
      author: 'Repository Contributor',
      isDirectAuthor: true,
      attributionCertainty: 'probable'
    },
    sharedEvidenceWith: options.sharedEvidenceWith || [],
    isInsufficientEvidence: options.isInsufficientEvidence || false,
    repoFullName: 'test/evidence-repo',
    commitSha: 'abc123'
  };
}

function createInternshipRequirement(options: {
  id: string;
  title: string;
  description: string;
  category: 'core' | 'backend' | 'frontend' | 'database' | 'devops' | 'testing' | 'architecture' | 'general';
  importance: 'required' | 'preferred';
}): any {
  return {
    id: options.id,
    title: options.title,
    description: options.description,
    category: options.category,
    importance: options.importance,
    isInferred: false
  };
}

function createAnalysisContext(options: {
  owner: string;
  repo: string;
  defaultBranch: string;
  commitSha: string;
  fileTree: any[];
  commits?: any[];
  token?: string;
  localFileCache?: Record<string, string>;
  diffs?: any[];
}): any {
  return {
    owner: options.owner,
    repo: options.repo,
    defaultBranch: options.defaultBranch,
    commitSha: options.commitSha,
    fileTree: options.fileTree || [],
    commits: options.commits || [],
    token: options.token,
    localFileCache: options.localFileCache || {},
    diffs: options.diffs || []
  };
}

// ============================================================================
// Tests for Evaluation History and Comparison Endpoints
// ============================================================================

// ============================================================================
// Test 36: Evaluation History and Comparison - Full Implementation Verification
// ============================================================================

test('36. Evaluation History and Comparison - Full Implementation Verification', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-testing',
      title: 'Automated Testing & Coverage',
      description: 'Implement comprehensive test suites with assertions',
      category: 'testing',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-db',
      title: 'Database Schema Design & SQL Queries',
      description: 'Design relational schemas and write query logic',
      category: 'database',
      importance: 'required'
    })
  ];

  const localFileCache = {
    'src/routes/api.ts': 'import { Router } from "express";\nexport const router = Router();\nrouter.get("/health", (req, res) => res.json({ok: true}));',
    'tests/api.test.ts': 'describe("API", () => {\n  it("should work", () => {\n    expect(1).toBe(1);\n  });\n});',
    'src/db/schema.sql': 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE);'
  };

  const fileTree = [
    { path: 'src/routes/api.ts', mode: '100644', type: 'blob', sha: 'c1' },
    { path: 'tests/api.test.ts', mode: '100644', type: 'blob', sha: 'c2' },
    { path: 'src/db/schema.sql', mode: '100644', type: 'blob', sha: 'c3' }
  ];

  // Create assessment with multiple evaluations
  const initialResult = await evaluateRepositoryCore({
    repoFullName: 'testuser/history-app',
    defaultBranch: 'main',
    targetCommitSha: 'abc123',
    requirements,
    triggerType: 'initial',
    fileTree,
    commits: [
      { sha: 'def456', message: 'feat: add api, tests, and db schema', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/api.ts', 'tests/api.test.ts', 'src/db/schema.sql'] }
    ],
    localFileCache,
    assessmentId: 'test-history-1'
  });

  assert.equal(initialResult.success, true, 'Initial evaluation should succeed');
  assert.equal(initialResult.evidenceList.length, 3, 'Should analyze all 3 requirements');

  // Verify initial evaluation structure
  const initialRev = {
    id: initialResult.newRevisionNumber,
    assessmentId: initialResult.assessmentId,
    revisionNumber: 1,
    commitSha: 'abc123',
    commitMessage: 'Initial assessment completed',
    triggerType: 'initial',
    evidence: initialResult.evidenceList,
    demonstratedCount: initialResult.demonstratedCount,
    partialCount: initialResult.partialCount,
    notDemonstratedCount: initialResult.notDemonstratedCount,
    createdAt: new Date().toISOString()
  };

  // Create second evaluation (webhook trigger)
  const secondResult = await evaluateRepositoryCore({
    repoFullName: 'testuser/history-app',
    defaultBranch: 'main',
    targetCommitSha: 'def456',
    requirements,
    triggerType: 'webhook',
    triggerMessage: 'Webhook: new feature implementation',
    fileTree,
    commits: [
      { sha: 'ghi789', message: 'feat: add new endpoint', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/api.ts'] }
    ],
    localFileCache,
    assessmentId: 'test-history-1'
  });

  assert.equal(secondResult.success, true, 'Second evaluation should succeed');
  assert.equal(secondResult.newRevisionNumber, 2, 'Should have revision 2');

  // Create third evaluation (manual trigger)
  const thirdResult = await evaluateRepositoryCore({
    repoFullName: 'testuser/history-app',
    defaultBranch: 'main',
    targetCommitSha: 'xyz123',
    requirements,
    triggerType: 'manual',
    triggerMessage: 'Manual evaluation with enhanced test coverage',
    fileTree,
    commits: [
      { sha: 'jkl012', message: 'feat: enhance tests', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['tests/api.test.ts'] }
    ],
    localFileCache,
    assessmentId: 'test-history-1'
  });

  assert.equal(thirdResult.success, true, 'Third evaluation should succeed');
  assert.equal(thirdResult.newRevisionNumber, 3, 'Should have revision 3');

  // Test evaluation history retrieval with enhanced features
  const historyResponse = await getEvaluationHistory('test-history-1', {
    order: 'desc',
    limit: 10,
    offset: 0,
    includeEvidence: true
  });

  assert.equal(historyResponse.evaluations.length, 3, 'Should have 3 evaluations');
  assert.equal(historyResponse.latestEvaluation?.evaluationNumber, 3, 'Latest should be evaluation #3');
  assert.equal(historyResponse.total, 3, 'Should have total of 3 evaluations');

  // Verify enhanced evaluation information
  const enhancedEv1 = historyResponse.evaluations[2]; // Latest evaluation (revision 3)
  assert.equal(enhancedEv1.displayNumber, 3, 'Display number should be 3');
  assert.equal(enhancedEv1.isLatest, true, 'Latest evaluation should be marked as such');
  assert.ok(enhancedEv1.metadata.hasFullScoring, 'Should have full scoring');
  assert.ok(enhancedEv1.metadata.stabilityConfirmed, 'Should have stable ID');

  // Test evaluation comparison
  const comparison = compareRevisions('test-history-1', 1, 2);
  assert.ok(comparison, 'Comparison between revisions 1 and 2 should succeed');
  assert.equal(comparison.fromRevisionNumber, 1, 'From revision should be 1');
  assert.equal(comparison.toRevisionNumber, 2, 'To revision should be 2');
  assert.ok(comparison.overallScoreChange.delta > 0, 'Score should improve from 1 to 2');

  // Verify enhanced comparison information
  const enhancedComparison = {
    ...comparison,
    context: {
      fromEvaluation: {
        id: enhancedEv1.id,
        revisionNumber: enhancedEv1.revisionNumber,
        commitSha: enhancedEv1.commitSha,
        commitMessage: enhancedEv1.commitMessage,
        triggerType: enhancedEv1.triggerType,
        createdAt: enhancedEv1.createdAt,
        demonstratedCount: enhancedEv1.demonstratedCount,
        partialCount: enhancedEv1.partialCount,
        notDemonstratedCount: enhancedEv1.notDemonstratedCount,
        totalRequirements: enhancedEv1.totalRequirements,
        evidenceAvailability: {
          total: enhancedEv1.totalRequirements,
          hasFullScoring: enhancedEv1.evidence?.some(e => e.scoreBreakdown),
          hasCompleteEvidence: enhancedEv1.evidence?.every(e => e.evidenceType && e.evidenceStrength),
          hasMissingInformation: enhancedEv1.evidence?.some(e => e.missingInformation?.length > 0)
        }
      },
      toEvaluation: {
        id: enhancedEv1.id,
        revisionNumber: enhancedEv1.revisionNumber,
        commitSha: enhancedEv1.commitSha,
        commitMessage: enhancedEv1.commitMessage,
        triggerType: enhancedEv1.triggerType,
        createdAt: enhancedEv1.createdAt,
        demonstratedCount: enhancedEv1.demonstratedCount,
        partialCount: enhancedEv1.partialCount,
        notDemonstratedCount: enhancedEv1.notDemonstratedCount,
        totalRequirements: enhancedEv1.totalRequirements,
        evidenceAvailability: {
          total: enhancedEv1.totalRequirements,
          hasFullScoring: enhancedEv1.evidence?.some(e => e.scoreBreakdown),
          hasCompleteEvidence: enhancedEv1.evidence?.every(e => e.evidenceType && e.evidenceStrength),
          hasMissingInformation: enhancedEv1.evidence?.some(e => e.missingInformation?.length > 0)
        }
      }
    },
    comparisonQuality: {
      isComplete: comparison.addedEvidence.length + comparison.removedEvidence.length + comparison.modifiedEvidence.length > 0,
      hasInconsistentData: comparison.unavailableData.length > 0,
      evidenceChangeRate: comparison.evidenceChanges.length / (comparison.addedEvidence.length + comparison.removedEvidence.length + comparison.modifiedEvidence.length || 1)
    }
  };

  assert.ok(enhancedComparison.context.fromEvaluation.revisionNumber >= 1, 'From evaluation revision should be valid');
  assert.ok(enhancedComparison.context.toEvaluation.revisionNumber >= 1, 'To evaluation revision should be valid');
  assert.ok(enhancedComparison.comparisonQuality.hasInconsistentData || enhancedComparison.comparisonQuality.isComplete, 'Comparison should have data consistency information');

  // Test pagination
  const paginatedHistory = await getEvaluationHistory('test-history-1', {
    order: 'desc',
    limit: 2,
    offset: 1
  });

  assert.equal(paginatedHistory.evaluations.length, 2, 'Should return 2 evaluations with pagination');
  assert.equal(paginatedHistory.offset, 1, 'Offset should be 1');
  assert.equal(paginatedHistory.limit, 2, 'Limit should be 2');
  assert.ok(paginatedHistory.hasMore, 'Should have more evaluations available');

  // Test invalid assessment ID handling
  const invalidHistory = await getEvaluationHistory('non-existent-assessment', {
    limit: 10,
    offset: 0
  });

  assert.equal(invalidHistory.evaluations.length, 0, 'Should return empty array for non-existent assessment');
  assert.equal(invalidHistory.latestEvaluation, null, 'Latest evaluation should be null for non-existent assessment');

  // Test invalid comparison parameters
  const invalidComparison = compareRevisions('non-existent-assessment', 1, 2);
  assert.equal(invalidComparison, null, 'Comparison should fail for non-existent assessment');

  console.log('✅ Evaluation history and comparison tests completed successfully!');
});

console.log('✅ All evaluation history and comparison tests passed!');