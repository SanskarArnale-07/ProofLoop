import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const {
  saveAssessment,
  getAssessment,
  saveRevision,
  getEvaluationHistory,
  compareRevisions,
  isWebhookDeliveryDuplicate,
  recordWebhookDelivery,
  withTransaction
} = jiti('../src/lib/db.ts');

const { SAMPLE_ASSESSMENT } = jiti('../src/lib/sample-data.ts');

function skipIfNoDb(t) {
  if (!process.env.DATABASE_URL) {
    t.skip('Live PostgreSQL database required: DATABASE_URL is not set.');
    return true;
  }
  return false;
}

// ============================================================================
// PART 1: STATIC & LOCAL VERIFICATIONS (Run unconditionally without live DB)
// ============================================================================

test('Static Verification: Migration SQL files exist, are valid and idempotent', () => {
  const migrationsDir = path.resolve('db/migrations');
  assert.ok(fs.existsSync(migrationsDir), 'Migrations directory must exist');

  const m1 = fs.readFileSync(path.join(migrationsDir, '001_create_tables.sql'), 'utf8');
  assert.match(m1, /CREATE TABLE IF NOT EXISTS schema_migrations/i);
  assert.match(m1, /CREATE TABLE IF NOT EXISTS internships/i);
  assert.match(m1, /CREATE TABLE IF NOT EXISTS assessments/i);
  assert.match(m1, /CREATE TABLE IF NOT EXISTS revisions/i);
  assert.match(m1, /CREATE TABLE IF NOT EXISTS roadmap_tasks/i);
  assert.match(m1, /CREATE TABLE IF NOT EXISTS activity_events/i);
  assert.match(m1, /CREATE TABLE IF NOT EXISTS webhook_deliveries/i);

  const m2 = fs.readFileSync(path.join(migrationsDir, '002_create_indexes.sql'), 'utf8');
  assert.match(m2, /CREATE INDEX IF NOT EXISTS idx_assessments_repo_full_name/i);
  assert.match(m2, /CREATE INDEX IF NOT EXISTS idx_revisions_assessment_revision/i);
  assert.match(m2, /CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_delivery_id/i);
});

test('Static Verification: Import script foreign-key ordering and safety checks', () => {
  const scriptPath = path.resolve('scripts/import-sqlite-to-postgres.mjs');
  assert.ok(fs.existsSync(scriptPath), 'Import script must exist');
  const content = fs.readFileSync(scriptPath, 'utf8');

  // Verify foreign-key dependency order
  const orderIndex = [
    content.indexOf("'internships'"),
    content.indexOf("'assessments'"),
    content.indexOf("'revisions'"),
    content.indexOf("'roadmap_tasks'"),
    content.indexOf("'activity_events'"),
    content.indexOf("'webhook_deliveries'")
  ];
  for (let i = 0; i < orderIndex.length - 1; i++) {
    assert.ok(orderIndex[i] !== -1, 'Table must be in import list');
    assert.ok(orderIndex[i] < orderIndex[i + 1], `FK order violated at index ${i}`);
  }

  // Verify refusal to overwrite non-empty target without explicit override
  assert.match(content, /ALLOW_NON_EMPTY_TARGET|--force/i);
  // Verify transaction usage
  assert.match(content, /BEGIN/i);
  assert.match(content, /COMMIT/i);
  assert.match(content, /ROLLBACK/i);
});

test('Static Verification: Source SQLite database data/proofloop.db is readable and intact', () => {
  const dbPath = path.resolve('data/proofloop.db');
  assert.ok(fs.existsSync(dbPath), 'data/proofloop.db must exist');

  const sqlite = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = ['internships', 'assessments', 'revisions', 'roadmap_tasks', 'activity_events', 'webhook_deliveries'];
    for (const table of tables) {
      const row = sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      assert.ok(typeof row.count === 'number' || typeof row.count === 'bigint');
      assert.ok(Number(row.count) >= 0);
    }
  } finally {
    sqlite.close();
  }
});

test('Static Verification: No application code imports DatabaseSync or node:sqlite (except migration scripts)', () => {
  const srcDir = path.resolve('src');
  const findSqliteImports = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
        findSqliteImports(full);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
        const text = fs.readFileSync(full, 'utf8');
        assert.ok(
          !text.includes("from 'node:sqlite'") && !text.includes('from "node:sqlite"'),
          `Forbidden node:sqlite import found in ${full}`
        );
      }
    }
  };
  findSqliteImports(srcDir);
});

test('Static Verification: DATABASE_URL missing causes safe configuration error', async () => {
  const prev = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    await assert.rejects(
      async () => {
        await getAssessment('any-id');
      },
      /DATABASE_URL is not configured/i
    );
  } finally {
    if (prev) process.env.DATABASE_URL = prev;
  }
});

// ============================================================================
// PART 2: DYNAMIC DATABASE OPERATIONS (Run when live Neon DATABASE_URL is set)
// ============================================================================

test('Live DB: Saving and retrieving an assessment preserves complete schema', async (t) => {
  if (skipIfNoDb(t)) return;

  const testId = `live-test-asmt-${Date.now()}`;
  const customAssessment = {
    ...SAMPLE_ASSESSMENT,
    id: testId,
    internshipId: `internship-${testId}`,
    internship: {
      ...SAMPLE_ASSESSMENT.internship,
      id: `internship-${testId}`,
      roleTitle: 'Live Test Role'
    },
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${testId}-1`,
      assessmentId: testId,
      revisionNumber: 1
    }
  };

  await saveAssessment(customAssessment);
  const retrieved = await getAssessment(testId);

  assert.ok(retrieved);
  assert.equal(retrieved.id, testId);
  assert.equal(retrieved.internship.roleTitle, 'Live Test Role');
  assert.equal(retrieved.currentRevisionNumber, 1);
});

test('Live DB: Retrieving evaluation history and comparing revisions', async (t) => {
  if (skipIfNoDb(t)) return;

  const testId = `live-test-history-${Date.now()}`;
  await saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: testId,
    internshipId: `internship-${testId}`,
    internship: { ...SAMPLE_ASSESSMENT.internship, id: `internship-${testId}` },
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${testId}-1`,
      assessmentId: testId,
      revisionNumber: 1
    }
  });

  await saveRevision({
    ...SAMPLE_ASSESSMENT.latestRevision,
    id: `rev-${testId}-2`,
    assessmentId: testId,
    revisionNumber: 2,
    commitSha: 'sha-002-live'
  });

  const history = await getEvaluationHistory(testId);
  assert.equal(history.total, 2);
  assert.equal(history.evaluations.length, 2);

  const cmp = await compareRevisions(testId, 1, 2);
  assert.ok(cmp);
  assert.equal(cmp.fromRevisionNumber, 1);
  assert.equal(cmp.toRevisionNumber, 2);
});

test('Live DB: Revision retention (max 10) and transactional rollback', async (t) => {
  if (skipIfNoDb(t)) return;

  const testId = `live-test-retention-${Date.now()}`;
  await saveAssessment({
    ...SAMPLE_ASSESSMENT,
    id: testId,
    internshipId: `internship-${testId}`,
    internship: { ...SAMPLE_ASSESSMENT.internship, id: `internship-${testId}` },
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${testId}-1`,
      assessmentId: testId,
      revisionNumber: 1
    }
  });

  // Insert revisions 2 through 12 (12 total revisions)
  for (let i = 2; i <= 12; i++) {
    await saveRevision({
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${testId}-${i}`,
      assessmentId: testId,
      revisionNumber: i,
      commitSha: `sha-${i}`
    });
  }

  const history = await getEvaluationHistory(testId);
  assert.equal(history.total, 10, 'Must retain at most 10 evaluations');
  assert.equal(history.evaluations[0].revisionNumber, 3, 'Oldest must now be revision 3');

  // Test transactional rollback
  await assert.rejects(async () => {
    await withTransaction(async (client) => {
      await client.query("INSERT INTO activity_events (id, assessment_id, event_type, created_at) VALUES ($1, $2, 'test_event', NOW())", [
        `act-rollback-${testId}`,
        testId
      ]);
      throw new Error('Simulated failure inside transaction');
    });
  }, /Simulated failure/i);

  const asmt = await getAssessment(testId);
  assert.ok(!asmt.recentActivity.some(a => a.id === `act-rollback-${testId}`), 'Rolled back event must not persist');
});

test('Live DB: Webhook delivery deduplication', async (t) => {
  if (skipIfNoDb(t)) return;

  const deliveryId = `live-webhook-delivery-${Date.now()}`;
  assert.equal(await isWebhookDeliveryDuplicate(deliveryId), false);

  await recordWebhookDelivery({
    deliveryId,
    eventType: 'push',
    assessmentId: SAMPLE_ASSESSMENT.id,
    repoFullName: 'test/repo',
    status: 'processed'
  });

  assert.equal(await isWebhookDeliveryDuplicate(deliveryId), true);
});
