import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// 1. Test Webhook Signature Verification Logic
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret) return true;
  if (!signatureHeader) return false;
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(rawBody).digest('hex');
    const signatureBuffer = Buffer.from(signatureHeader, 'utf8');
    const digestBuffer = Buffer.from(digest, 'utf8');
    if (signatureBuffer.length !== digestBuffer.length) return false;
    return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
  } catch {
    return false;
  }
}

test('Webhook Signature Verification - Valid HMAC SHA-256', () => {
  const secret = 'super_secret_webhook_key_123';
  const payload = JSON.stringify({ event: 'push', ref: 'refs/heads/main' });
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const validHeader = `sha256=${hmac}`;

  const isValid = verifyWebhookSignature(payload, validHeader, secret);
  assert.equal(isValid, true, 'Valid signature must be accepted');
});

test('Webhook Signature Verification - Tampered Payload Rejected', () => {
  const secret = 'super_secret_webhook_key_123';
  const originalPayload = JSON.stringify({ commit: 'a1b2c3' });
  const tamperedPayload = JSON.stringify({ commit: 'evil_commit' });
  const hmac = crypto.createHmac('sha256', secret).update(originalPayload).digest('hex');
  const signatureHeader = `sha256=${hmac}`;

  const isValid = verifyWebhookSignature(tamperedPayload, signatureHeader, secret);
  assert.equal(isValid, false, 'Tampered payload must be rejected');
});

test('Webhook Signature Verification - Missing Signature Rejected', () => {
  const secret = 'super_secret_webhook_key_123';
  const payload = JSON.stringify({ commit: 'a1b2c3' });

  const isValid = verifyWebhookSignature(payload, null, secret);
  assert.equal(isValid, false, 'Null signature header must be rejected when secret is configured');
});

// 2. Test SSRF Protection Logic
function validateUrlSafety(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, error: 'Only HTTP and HTTPS URLs are permitted.' };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return { safe: false, error: 'Access to private or local network addresses is prohibited.' };
    }
    return { safe: true, parsedUrl: parsed };
  } catch {
    return { safe: false, error: 'Invalid URL format.' };
  }
}

test('SSRF Safety - Rejects Localhost and Loopback', () => {
  assert.equal(validateUrlSafety('http://localhost:3000/job').safe, false);
  assert.equal(validateUrlSafety('http://127.0.0.1:8080').safe, false);
  assert.equal(validateUrlSafety('http://192.168.1.1/admin').safe, false);
  assert.equal(validateUrlSafety('http://10.0.0.1/status').safe, false);
  assert.equal(validateUrlSafety('ftp://files.example.com').safe, false);
});

test('SSRF Safety - Accepts Public Job Posting URLs', () => {
  assert.equal(validateUrlSafety('https://stripe.com/jobs/listing/backend-engineering-intern').safe, true);
  assert.equal(validateUrlSafety('https://jobs.lever.co/vercel/frontend-engineer').safe, true);
});

// 3. Test GitHub Repo URL Parser
function parseGitHubRepoUrl(input) {
  if (!input) return null;
  const cleaned = input.trim().replace(/\.git$/, '');
  const webMatch = cleaned.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
  if (webMatch) return { owner: webMatch[1], repo: webMatch[2] };
  const shortMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  return null;
}

test('GitHub URL Parsing - Various Formats', () => {
  const expected = { owner: 'alexchen', repo: 'payment-orchestrator' };
  assert.deepEqual(parseGitHubRepoUrl('https://github.com/alexchen/payment-orchestrator'), expected);
  assert.deepEqual(parseGitHubRepoUrl('https://github.com/alexchen/payment-orchestrator.git'), expected);
  assert.deepEqual(parseGitHubRepoUrl('github.com/alexchen/payment-orchestrator'), expected);
  assert.deepEqual(parseGitHubRepoUrl('alexchen/payment-orchestrator'), expected);
  assert.equal(parseGitHubRepoUrl('invalid url string'), null);
});

// 4. Test Webhook Requirement Impact Mapping
function identifyAffectedRequirements(files) {
  const affected = new Set();
  for (const f of files) {
    if (/(?:test|spec|__tests__)/i.test(f)) affected.add('req-testing');
    if (/(?:docker|container)/i.test(f)) affected.add('req-devops');
    if (/(?:\.github\/workflows|ci)/i.test(f)) affected.add('req-cicd');
    if (/(?:routes?|controllers?|api|endpoints?)/i.test(f)) affected.add('req-api');
    if (/(?:sql|schema|migrations?|models?|db)/i.test(f)) affected.add('req-db');
  }
  return Array.from(affected);
}

test('Webhook Impact Mapping - Detects Affected Skills From File Changes', () => {
  const testFiles = ['tests/charge.test.ts'];
  assert.deepEqual(identifyAffectedRequirements(testFiles), ['req-testing']);

  const dockerFiles = ['Dockerfile', '.dockerignore'];
  assert.deepEqual(identifyAffectedRequirements(dockerFiles), ['req-devops']);

  const combined = ['src/routes/payments.ts', 'db/schema.sql', 'tests/api.test.ts'];
  const affected = identifyAffectedRequirements(combined);
  assert.ok(affected.includes('req-api'));
  assert.ok(affected.includes('req-db'));
  assert.ok(affected.includes('req-testing'));
});
