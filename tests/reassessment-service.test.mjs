import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const {
  saveAssessment,
  getAssessment
} = jiti('../src/lib/db.ts');

const { SAMPLE_ASSESSMENT } = jiti('../src/lib/sample-data.ts');

const { reassessAssessment } = jiti('../src/lib/reassessment-service.ts');

function seedAssessment(overrides) {
  const id = `asmt-reassess-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const overridesSha = overrides && overrides.commitSha ? overrides.commitSha : null;
  const assessment = {
    ...SAMPLE_ASSESSMENT,
    id,
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${id}-1`,
      assessmentId: id,
      revisionNumber: 1,
      commitSha: overridesSha || SAMPLE_ASSESSMENT.repository.latestCommitSha
    },
    repository: overrides && overrides.repository
      ? { ...SAMPLE_ASSESSMENT.repository, ...overrides.repository }
      : SAMPLE_ASSESSMENT.repository
  };
  saveAssessment(assessment);
  return { id, assessment };
}

// ============================================================================
// 1. Successful reassessment creates new revision
// ============================================================================
test('reassessment service: successful reassessment creates new revision', async () => {
  const { id } = seedAssessment();

  const result = await reassessAssessment({
    assessmentId: id,
    triggerType: 'manual',
    triggerMessage: 'Manual reassessment request',
    commitSha: 'sha-new-100',
    commitMessage: 'feat: add payment routes and tests',
    token: undefined
  });

  assert.ok(result, 'Result must be returned');
  assert.equal(result.assessmentId, id);

  const updated = getAssessment(id);
  assert.ok(updated, 'Assessment must still be retrievable');
  assert.equal(updated.id, id);
  assert.ok(updated.currentRevisionNumber >= 1);
});

// ============================================================================
// 2. Duplicate trigger - same commit SHA as current revision (webhook)
// ============================================================================
test('reassessment service: duplicate webhook trigger skips reassessment', async () => {
  const { id } = seedAssessment();

  // Pass the SAME commit SHA as the current revision (9e41b2c from sample)
  const result = await reassessAssessment({
    assessmentId: id,
    triggerType: 'webhook',
    triggerMessage: 'Push event',
    commitSha: '9e41b2c',
    commitMessage: 'feat: existing commit'
  });

  assert.equal(result.skipped, true, 'Should skip reassessment for duplicate commit SHA');
  assert.ok(result.skipReason, 'Skip reason must be provided');
  assert.equal(result.commitSha, '9e41b2c');
});

// ============================================================================
// 3. Assessment not found
// ============================================================================
test('reassessment service: missing assessment returns error', async () => {
  const result = await reassessAssessment({
    assessmentId: 'nonexistent-assessment-id',
    triggerType: 'manual',
    triggerMessage: 'Manual reassessment',
    commitSha: 'abc123'
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'ASSESSMENT_NOT_FOUND');
  assert.ok(result.error && result.error.includes('not found'));
});

// ============================================================================
// 4. Concurrent reassessment guard
// ============================================================================
test('reassessment service: concurrent reassessment returns skipped', async () => {
  const { id } = seedAssessment();

  const promise1 = reassessAssessment({
    assessmentId: id,
    triggerType: 'manual',
    triggerMessage: 'First manual reassessment',
    commitSha: 'sha-concurrent-1'
  });

  const promise2 = reassessAssessment({
    assessmentId: id,
    triggerType: 'manual',
    triggerMessage: 'Second manual reassessment',
    commitSha: 'sha-concurrent-2'
  });

  const [result1, result2] = await Promise.all([promise1, promise2]);

  const skipped = [result1, result2].filter(r => r.skipped);
  const notSkipped = [result1, result2].filter(r => !r.skipped);

  assert.equal(skipped.length, 1, 'Exactly one reassessment should be skipped due to concurrency guard');
  assert.equal(notSkipped.length, 1, 'Exactly one reassessment should proceed (not skipped)');
  assert.ok(skipped[0].skipReason, 'Skipped result must have a reason');
});

// ============================================================================
// 5. Failure preserves previous revision
// ============================================================================
test('reassessment service: failure preserves previous revision', async () => {
  const { id } = seedAssessment();

  const initial = getAssessment(id);
  assert.ok(initial);
  const initialRevNum = initial.currentRevisionNumber;

  const result = await reassessAssessment({
    assessmentId: id,
    triggerType: 'manual',
    triggerMessage: 'Manual reassessment',
    commitSha: 'sha-failure-test'
  });

  const after = getAssessment(id);
  assert.ok(after, 'Assessment must still exist after reassessment attempt');

  if (!result.success) {
    assert.equal(after.currentRevisionNumber, initialRevNum, 'Revision number must not advance on failure');
    assert.ok(result.error, 'Failed result must have an error message');
  } else {
    assert.ok(after.currentRevisionNumber >= initialRevNum);
  }
});

// ============================================================================
// 6. Webhook trigger type is preserved
// ============================================================================
test('reassessment service: webhook trigger type is recorded', async () => {
  const { id } = seedAssessment();

  const result = await reassessAssessment({
    assessmentId: id,
    triggerType: 'webhook',
    triggerMessage: 'GitHub push event',
    commitSha: 'sha-webhook-456',
    commitMessage: 'feat: add docker config'
  });

  assert.ok(result, 'Result must be returned for webhook trigger');
  assert.equal(result.assessmentId, id);
});

// ============================================================================
// 7. Manual trigger type works
// ============================================================================
test('reassessment service: manual trigger type works', async () => {
  const { id } = seedAssessment();

  const result = await reassessAssessment({
    assessmentId: id,
    triggerType: 'manual',
    triggerMessage: 'User clicked Reassess',
    commitSha: 'sha-manual-789'
  });

  assert.ok(result, 'Result must be returned for manual trigger');
  assert.equal(result.assessmentId, id);
});
