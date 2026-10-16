import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getAssessment } from '@/lib/db';
import { processPushWebhook } from '@/lib/webhook';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      assessmentId,
      commitMessage = 'feat(tests): add automated integration tests for charge endpoint',
      author = 'Student Developer',
      files = {},
      simulateInvalidSignature = false
    } = body;

    const assessment = getAssessment(assessmentId);
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const commitSha = crypto.randomBytes(4).toString('hex');
    const deliveryId = `test-del-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const changedFilePaths = Object.keys(files).length > 0
      ? Object.keys(files)
      : ['tests/api.test.ts'];

    // If no custom file contents provided, create realistic content based on filename
    const mockFiles: Record<string, string> = { ...files };
    for (const path of changedFilePaths) {
      if (!mockFiles[path]) {
        if (/test/i.test(path)) {
          mockFiles[path] = `import { describe, it, expect } from "vitest";
import { handleCreateCharge } from "../src/routes/payments";

describe("Payments API Endpoints", () => {
  it("rejects requests missing Idempotency-Key with 400", async () => {
    const req = new Request("https://api.test/charges", {
      method: "POST",
      body: JSON.stringify({ amount: 1000, currency: "usd" })
    });
    const res = await handleCreateCharge(req);
    expect(res.status).toBe(400);
  });

  it("successfully creates charge with valid parameters", async () => {
    const req = new Request("https://api.test/charges", {
      method: "POST",
      headers: { "Idempotency-Key": "test-key-123" },
      body: JSON.stringify({ amount: 2500, currency: "usd", customerId: "cus_123" })
    });
    const res = await handleCreateCharge(req);
    expect(res.status).toBe(201);
  });
});`;
        } else if (/docker/i.test(path)) {
          mockFiles[path] = `FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
USER node
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/server.js"]`;
        } else if (/sql|schema/i.test(path)) {
          mockFiles[path] = `CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  response_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_idempotency_created ON idempotency_keys (created_at);`;
        }
      }
    }

    const payload = {
      ref: `refs/heads/${assessment.repository.defaultBranch}`,
      before: assessment.repository.latestCommitSha,
      after: commitSha,
      repository: {
        name: assessment.repository.fullName.split('/')[1] || 'repo',
        full_name: assessment.repository.fullName,
        html_url: assessment.repository.url,
        default_branch: assessment.repository.defaultBranch
      },
      head_commit: {
        id: commitSha,
        message: commitMessage,
        timestamp: new Date().toISOString(),
        author: { name: author, email: 'student@example.edu' },
        added: changedFilePaths,
        modified: [],
        removed: []
      },
      commits: [
        {
          id: commitSha,
          message: commitMessage,
          timestamp: new Date().toISOString(),
          author: { name: author, email: 'student@example.edu' },
          added: changedFilePaths,
          modified: [],
          removed: []
        }
      ]
    };

    const rawPayload = JSON.stringify(payload);
    const secret = process.env.GITHUB_WEBHOOK_SECRET || 'proofloop_demo_secret';

    let signature = 'sha256=' + crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
    if (simulateInvalidSignature) {
      signature = 'sha256=invalid_tampered_signature_deadbeef';
    }

    const headers = {
      'x-github-delivery': deliveryId,
      'x-github-event': 'push',
      'x-hub-signature-256': signature,
      'content-type': 'application/json'
    };

    const previousRevision = assessment.latestRevision;

    const result = await processPushWebhook(rawPayload, headers, {
      mockFiles
    });

    const updatedAssessment = getAssessment(assessmentId);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      deliveryId,
      commitSha,
      commitMessage,
      signatureUsed: signature.slice(0, 15) + '...',
      signatureValid: !simulateInvalidSignature,
      previousRevisionNumber: previousRevision.revisionNumber,
      newRevisionNumber: updatedAssessment?.currentRevisionNumber,
      promotedSkills: result.promotedSkills || [],
      affectedRequirements: result.affectedSkills || [],
      filesSimulated: Object.keys(mockFiles),
      assessment: updatedAssessment
    });
  } catch (error: any) {
    console.error('Webhook simulation error:', error);
    return NextResponse.json({ error: error.message || 'Simulation failed' }, { status: 500 });
  }
}
