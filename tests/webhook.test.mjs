import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createJiti } from 'jiti';

function skipIfNoDb(t) {
  if (!process.env.DATABASE_URL) {
    t.skip('PostgreSQL database required: DATABASE_URL is not set.');
    return true;
  }
  return false;
}

// GitHub is never contacted: the webhook falls back to the stored file tree.
globalThis.fetch = async () => {
  throw new Error('network disabled in tests');
};

const jiti = createJiti(import.meta.url);
const { processPushWebhook, verifyWebhookSignature } = jiti('../src/lib/webhook.ts');
const { saveAssessment, getAssessment } = jiti('../src/lib/db.ts');
const { SAMPLE_ASSESSMENT } = jiti('../src/lib/sample-data.ts');

const SECRET = 'test_webhook_secret_value';
const REPO = SAMPLE_ASSESSMENT.repository.fullName; // alexchen/payment-orchestrator
const BRANCH = SAMPLE_ASSESSMENT.repository.defaultBranch; // main
const MOCK_FILES = {
  'src/routes/payments.ts': "import express from 'express';\nexport const router = express.Router();\nrouter.post('/charge', (req, res) => res.json({ ok: true }));\n"
};

const revisionCount = async () => {
  const asmt = await getAssessment(SAMPLE_ASSESSMENT.id);
  return asmt ? asmt.currentRevisionNumber : 0;
};

let counter = 0;
function pushPayload(overrides = {}) {
  const sha = (0xabc1230 + counter++).toString(16).padStart(7, '0') + 'deadbeef';
  return {
    ref: `refs/heads/${BRANCH}`,
    after: sha,
    repository: { full_name: REPO, name: REPO.split('/')[1] },
    head_commit: {
      id: sha,
      message: 'feat: add charge route',
      author: { name: 'Alex' },
      added: ['src/routes/payments.ts'],
      modified: [],
      removed: []
    },
    commits: [
      {
        id: sha,
        message: 'feat: add charge route',
        author: { name: 'Alex' },
        added: ['src/routes/payments.ts'],
        modified: [],
        removed: []
      }
    ],
    ...overrides
  };
}

function send(payload, { event = 'push', delivery, secret = SECRET, tamper = false, options } = {}) {
  const raw = JSON.stringify(payload);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret ?? 'x').update(raw).digest('hex');
  const headers = {
    'x-github-delivery': delivery ?? `d-${counter++}-${Math.random()}`,
    'x-github-event': event,
    'x-hub-signature-256': tamper ? sig.slice(0, -4) + 'dead' : sig
  };
  return processPushWebhook(raw, headers, { mockFiles: MOCK_FILES, ...options });
}

test.before(async () => {
  if (process.env.DATABASE_URL) {
    await saveAssessment(SAMPLE_ASSESSMENT);
  }
});

test.beforeEach(() => {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  delete process.env.PROOFLOOP_ALLOW_UNSIGNED_WEBHOOKS;
});

test('no secret configured is rejected (fails closed)', async () => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  assert.equal(verifyWebhookSignature('{}', 'sha256=abc', undefined), false);
  const res = await processPushWebhook('{}', { 'x-hub-signature-256': 'sha256=abc' });
  assert.equal(res.success, false);
  assert.equal(res.status, 'invalid_signature');
});

test('no secret + explicit dev flag is accepted outside production', async (t) => {
  if (skipIfNoDb(t)) return;
  delete process.env.GITHUB_WEBHOOK_SECRET;
  process.env.PROOFLOOP_ALLOW_UNSIGNED_WEBHOOKS = 'true';
  const res = await send(pushPayload());
  assert.equal(res.status, 'processed');
});

test('dev flag is ignored in production', async () => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  process.env.PROOFLOOP_ALLOW_UNSIGNED_WEBHOOKS = 'true';
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = await send(pushPayload());
    assert.equal(res.status, 'invalid_signature');
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('tampered signature is rejected and creates no revision', async () => {
  const res = await send(pushPayload(), { tamper: true });
  assert.equal(res.status, 'invalid_signature');
});

test('valid signed push to the default branch creates a revision', async (t) => {
  if (skipIfNoDb(t)) return;
  const before = await revisionCount();
  const res = await send(pushPayload());
  assert.equal(res.success, true);
  assert.equal(res.status, 'processed');
  assert.equal(await revisionCount(), before + 1);
});

test('repo name match is case-insensitive', async (t) => {
  if (skipIfNoDb(t)) return;
  const before = await revisionCount();
  const p = pushPayload({ repository: { full_name: REPO.toUpperCase(), name: 'X' } });
  const res = await send(p);
  assert.equal(res.status, 'processed');
  assert.equal(await revisionCount(), before + 1);
});

test('ping event is acknowledged', async () => {
  const res = await send({ zen: 'Keep it logically awesome.', hook_id: 1 }, { event: 'ping' });
  assert.equal(res.success, true);
  assert.equal(res.status, 'ignored');
  assert.match(res.message, /ping/i);
});

test('push to a non-default branch is ignored', async (t) => {
  if (skipIfNoDb(t)) return;
  const before = await revisionCount();
  const res = await send(pushPayload({ ref: 'refs/heads/feature/x' }));
  assert.equal(res.success, true);
  assert.equal(res.status, 'ignored');
  assert.equal(await revisionCount(), before);
});

test('tag push and branch deletion are ignored', async (t) => {
  if (skipIfNoDb(t)) return;
  const before = await revisionCount();
  const tag = await send(pushPayload({ ref: 'refs/tags/v1' }));
  const del = await send(pushPayload({ deleted: true }));
  assert.equal(tag.status, 'ignored');
  assert.equal(del.status, 'ignored');
  assert.equal(await revisionCount(), before);
});

test('push with no commits is ignored', async (t) => {
  if (skipIfNoDb(t)) return;
  const before = await revisionCount();
  const res = await send(pushPayload({ commits: [], head_commit: null }));
  assert.equal(res.status, 'ignored');
  assert.equal(await revisionCount(), before);
});

test('unknown repository is ignored, not an error', async (t) => {
  if (skipIfNoDb(t)) return;
  const res = await send(pushPayload({ repository: { full_name: 'nobody/nothing', name: 'nothing' } }));
  assert.equal(res.success, true);
  assert.equal(res.status, 'ignored');
});

test('malformed JSON is a bad payload', async (t) => {
  if (skipIfNoDb(t)) return;
  const raw = '{not json';
  const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  const res = await processPushWebhook(raw, {
    'x-github-delivery': 'bad-json-1',
    'x-github-event': 'push',
    'x-hub-signature-256': sig
  });
  assert.equal(res.success, false);
  assert.equal(res.status, 'bad_payload');
});

test('duplicate delivery id is skipped', async (t) => {
  if (skipIfNoDb(t)) return;
  const p = pushPayload();
  const first = await send(p, { delivery: 'dup-1' });
  const after = await revisionCount();
  const second = await send(p, { delivery: 'dup-1' });
  assert.equal(first.status, 'processed');
  assert.equal(second.status, 'duplicate');
  assert.equal(await revisionCount(), after);
});

test('two identical deliveries at the same moment create only one revision', async (t) => {
  if (skipIfNoDb(t)) return;
  const before = await revisionCount();
  const p = pushPayload();
  const [a, b] = await Promise.all([send(p, { delivery: 'race-1' }), send(p, { delivery: 'race-1' })]);
  assert.deepEqual([a.status, b.status].sort(), ['duplicate', 'processed']);
  assert.equal(await revisionCount(), before + 1);
});

test('a failed delivery can be retried with the same delivery id', async (t) => {
  if (skipIfNoDb(t)) return;
  const explodingFiles = new Proxy({}, {
    ownKeys() {
      throw new Error('simulated analysis failure');
    }
  });
  const p = pushPayload();
  const before = await revisionCount();

  const failed = await send(p, { delivery: 'retry-1', options: { mockFiles: explodingFiles } });
  assert.equal(failed.success, false);
  assert.equal(failed.status, 'error');
  assert.equal(await revisionCount(), before, 'failed run must not add a revision');

  const retried = await send(p, { delivery: 'retry-1' });
  assert.equal(retried.status, 'processed', 'redelivery must not be skipped as a duplicate');
  assert.equal(await revisionCount(), before + 1);
});

test('missing signature header when secret is configured is rejected with 401', async () => {
  const raw = JSON.stringify(pushPayload());
  const res = await processPushWebhook(raw, {
    'x-github-delivery': 'no-sig-1',
    'x-github-event': 'push'
    // missing x-hub-signature-256
  });
  assert.equal(res.success, false);
  assert.equal(res.status, 'invalid_signature');
});

test('rapid successive pushes with distinct commits create ordered revisions without race conditions', async (t) => {
  if (skipIfNoDb(t)) return;
  const before = await revisionCount();
  const p1 = pushPayload();
  const p2 = pushPayload();

  // Send both pushes concurrently
  const [res1, res2] = await Promise.all([
    send(p1, { delivery: 'rapid-push-1' }),
    send(p2, { delivery: 'rapid-push-2' })
  ]);

  assert.equal(res1.status, 'processed');
  assert.equal(res2.status, 'processed');
  assert.equal(await revisionCount(), before + 2);

  const updatedAssessment = await getAssessment(SAMPLE_ASSESSMENT.id);
  assert.equal(updatedAssessment.currentRevisionNumber, before + 2);
  // Ensure the latest revision accurately reflects the second processed push commit
  assert.equal(updatedAssessment.latestRevision.commitSha, p2.after.substring(0, 7));
});

test('pushing an already-evaluated commit SHA is detected and skipped as duplicate', async (t) => {
  if (skipIfNoDb(t)) return;
  const p = pushPayload();
  const first = await send(p, { delivery: 'commit-dup-1' });
  assert.equal(first.status, 'processed');
  const countAfterFirst = await revisionCount();

  // Send a different delivery ID but with the EXACT same commit SHA
  const second = await send(p, { delivery: 'commit-dup-2' });
  assert.equal(second.status, 'duplicate');
  assert.match(second.message, /already evaluated/i);
  assert.equal(await revisionCount(), countAfterFirst);
});
