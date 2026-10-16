'use client';

import { useState } from 'react';
import { X, Send, ShieldAlert, CheckCircle2, Radio } from 'lucide-react';
import { Assessment, GapTask } from '@/lib/types';

interface WebhookSimulatorModalProps {
  assessment: Assessment;
  preselectedTask?: GapTask | null;
  onClose: () => void;
  onSuccess: (updatedAssessment: Assessment, promotedSkills: string[]) => void;
}

export function WebhookSimulatorModal({
  assessment,
  preselectedTask,
  onClose,
  onSuccess
}: WebhookSimulatorModalProps) {
  const [selectedTaskType, setSelectedTaskType] = useState<string>(
    preselectedTask?.requirementId || 'req-testing'
  );
  const [commitMessage, setCommitMessage] = useState(
    preselectedTask
      ? `feat: ${preselectedTask.title.toLowerCase()}`
      : 'test: add automated integration test suite for payment endpoints'
  );
interface WebhookSimResult {
  success?: boolean;
  deliveryId?: string;
  commitSha?: string;
  newRevisionNumber?: number;
  promotedSkills?: string[];
  [key: string]: unknown;
}

  const [author] = useState('Student Developer');
  const [tamperSignature, setTamperSignature] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultLog, setResultLog] = useState<WebhookSimResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const presets: Record<string, { label: string; commit: string; file: string; code: string }> = {
    'req-testing': {
      label: 'Add Automated Tests (req-testing)',
      commit: 'test(api): add automated test suite for payment endpoints',
      file: 'tests/payments.test.ts',
      code: `import { describe, it, expect } from "vitest";
import { handleCreateCharge } from "../src/routes/payments";

describe("Payment Endpoints", () => {
  it("rejects missing Idempotency-Key header with 400", async () => {
    const req = new Request("https://api.test/charges", {
      method: "POST",
      body: JSON.stringify({ amount: 1000, currency: "usd" })
    });
    const res = await handleCreateCharge(req);
    expect(res.status).toBe(400);
  });

  it("processes valid charge and returns 201", async () => {
    const req = new Request("https://api.test/charges", {
      method: "POST",
      headers: { "Idempotency-Key": "test-key-123" },
      body: JSON.stringify({ amount: 2000, currency: "usd", customerId: "cus_123" })
    });
    const res = await handleCreateCharge(req);
    expect(res.status).toBe(201);
  });
});`
    },
    'req-devops': {
      label: 'Add Dockerfile (req-devops)',
      commit: 'chore(docker): add hardened multi-stage Dockerfile',
      file: 'Dockerfile',
      code: `FROM node:22-alpine AS builder
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
CMD ["node", "dist/server.js"]`
    },
    'req-db': {
      label: 'Add Database Migrations (req-db)',
      commit: 'feat(db): add ledger and idempotency schema migrations',
      file: 'db/migrations/002_add_idempotency_table.sql',
      code: `CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  response_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_idempotency_created ON idempotency_keys (created_at);`
    }
  };

  const handleSelectPreset = (key: string) => {
    setSelectedTaskType(key);
    if (presets[key]) {
      setCommitMessage(presets[key].commit);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setResultLog(null);
    setErrorMsg(null);

    const preset = presets[selectedTaskType] || presets['req-testing'];
    const files: Record<string, string> = {
      [preset.file]: preset.code
    };

    try {
      const res = await fetch('/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: assessment.id,
          commitMessage,
          author,
          files,
          simulateInvalidSignature: tamperSignature
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || data.message || 'Webhook simulation was rejected.');
        setResultLog(data);
      } else {
        setResultLog(data);
        if (data.assessment) {
          onSuccess(data.assessment, data.promotedSkills || []);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error simulating webhook.';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in font-mono">
        {/* Top bar */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
            <h3 className="font-editorial text-lg font-bold text-zinc-900 dark:text-zinc-100">
              GitHub Webhook Dispatch & Test Lab
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans">
            This simulator demonstrates the exact end-to-end GitHub webhook pipeline: it creates a real push payload, generates an HMAC-SHA256 signature, deduplicates the delivery, incrementally re-scans affected requirements, and updates your assessment in real-time.
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Presets */}
            <div>
              <label className="block text-[11px] font-semibold uppercase text-zinc-500 mb-2">
                Simulated Push Action (Gap Solution)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(presets).map(([k, p]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleSelectPreset(k)}
                    className={`p-2.5 text-left border rounded transition-colors ${
                      selectedTaskType === k
                        ? 'border-black dark:border-white bg-zinc-100 dark:bg-zinc-900 font-bold text-zinc-900 dark:text-zinc-100'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <span className="block truncate">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Commit Message */}
            <div>
              <label className="block text-[11px] font-semibold uppercase text-zinc-500 mb-1">
                Commit Message
              </label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-hidden focus:border-black dark:focus:border-white"
              />
            </div>

            {/* Simulated File to Push */}
            <div>
              <label className="block text-[11px] font-semibold uppercase text-zinc-500 mb-1">
                Committed File & Excerpt Preview
              </label>
              <div className="rounded border border-zinc-800 bg-[#0d0d0e] p-3 text-zinc-300 text-[11px] font-mono max-h-36 overflow-y-auto">
                <div className="text-zinc-500 mb-1 font-bold">
                  {presets[selectedTaskType]?.file}
                </div>
                <pre className="whitespace-pre overflow-x-auto text-zinc-300">
                  {presets[selectedTaskType]?.code}
                </pre>
              </div>
            </div>

            {/* Tamper signature toggle */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded flex items-center justify-between">
              <div>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">
                  Simulate Tampered HMAC Signature
                </span>
                <span className="text-[11px] text-zinc-500 block font-sans">
                  Tests that the server correctly rejects unauthorized or tampered webhook deliveries (HTTP 401).
                </span>
              </div>
              <input
                type="checkbox"
                checked={tamperSignature}
                onChange={(e) => setTamperSignature(e.target.checked)}
                className="w-4 h-4 accent-black dark:accent-white"
              />
            </div>

            {/* Result Log */}
            {errorMsg && (
              <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-600 rounded flex items-start space-x-2 text-zinc-900 dark:text-zinc-100">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <div>
                  <span className="font-bold block">Webhook Rejected</span>
                  <span className="text-xs">{errorMsg}</span>
                </div>
              </div>
            )}

            {resultLog?.success ? (
              <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-600 rounded space-y-1">
                <div className="flex items-center space-x-1.5 text-zinc-900 dark:text-zinc-100 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Webhook Verified & Reassessment Succeeded!</span>
                </div>
                <div className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-0.5 font-mono">
                  <div>Delivery ID: {resultLog.deliveryId}</div>
                  <div>Commit SHA: {resultLog.commitSha}</div>
                  <div>Created Revision: #{resultLog.newRevisionNumber}</div>
                  {resultLog.promotedSkills && resultLog.promotedSkills.length > 0 ? (
                    <div className="font-bold text-zinc-950 dark:text-zinc-100 mt-1">
                      Promoted Skills: {resultLog.promotedSkills.join(', ')}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black rounded font-bold flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Verifying & Reassessing...' : 'Dispatch Webhook Push'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
