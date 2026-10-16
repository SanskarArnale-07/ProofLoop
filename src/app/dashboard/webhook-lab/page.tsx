'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Header } from '@/components/Header';
import { WebhookSimulatorModal } from '@/components/WebhookSimulatorModal';
import { Assessment, WebhookDeliveryLog } from '@/lib/types';
import { Radio, ShieldCheck, ShieldAlert, GitCommit, RefreshCw, Send, CheckCircle2, Clock } from 'lucide-react';

function WebhookLabContent() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [asmtRes, delRes] = await Promise.all([
        fetch(`/api/assessments/${assessmentId}`),
        fetch('/api/webhooks/deliveries')
      ]);

      const asmtData = await asmtRes.json();
      const delData = await delRes.json();

      if (asmtData.success) {
        setAssessment(asmtData.assessment);
      }
      if (delData.success) {
        setDeliveries(delData.deliveries || []);
      }
    } catch (err) {
      console.error('Error loading webhook lab:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [assessmentId]);

  if (loading || !assessment) {
    return (
      <div className="flex-1 p-12 flex items-center justify-center font-mono text-xs text-zinc-500">
        Loading Webhook Lab...
      </div>
    );
  }

  const handleWebhookSuccess = (updated: Assessment) => {
    setAssessment(updated);
    setSimulatorOpen(false);
    loadData();
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Header assessment={assessment} onReassessed={(up) => setAssessment(up)} />

      <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-500 block mb-1">
              Real Event Pipeline
            </span>
            <h2 className="font-editorial text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Webhook Infrastructure & Test Lab
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans mt-1">
              ProofLoop verifies cryptographic HMAC-SHA256 signatures, deduplicates payloads, and executes incremental reassessments.
            </p>
          </div>

          <button
            onClick={() => setSimulatorOpen(true)}
            className="self-start sm:self-auto inline-flex items-center space-x-2 px-4 py-2.5 bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-mono text-xs font-bold rounded transition-colors shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Launch Webhook Dispatch Simulator</span>
          </button>
        </div>

        {/* Integration Instructions */}
        <div className="p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-mono text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <Radio className="w-4 h-4 text-emerald-500" />
              <span>Real GitHub Webhook Configuration</span>
            </h3>
            <span className="text-[10px] uppercase font-bold text-zinc-500">
              Target: {assessment.repository.fullName}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase font-bold mb-1">Payload URL</span>
              <code className="text-zinc-900 dark:text-zinc-100 block break-all font-semibold">
                /api/webhooks/github
              </code>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase font-bold mb-1">Content Type</span>
              <code className="text-zinc-900 dark:text-zinc-100 block font-semibold">
                application/json
              </code>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase font-bold mb-1">Signature Header</span>
              <code className="text-zinc-900 dark:text-zinc-100 block font-semibold">
                X-Hub-Signature-256 (HMAC SHA-256)
              </code>
            </div>
          </div>
        </div>

        {/* Delivery History Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-editorial text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Recent Webhook Deliveries & Audit Trail
            </h3>
            <button
              onClick={loadData}
              className="inline-flex items-center space-x-1 text-xs font-mono text-zinc-500 hover:text-black dark:hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Log</span>
            </button>
          </div>

          {deliveries.length === 0 ? (
            <div className="p-8 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-center text-xs font-mono text-zinc-500">
              No webhook events recorded yet. Click "Launch Webhook Dispatch Simulator" above to test the pipeline.
            </div>
          ) : (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden bg-white dark:bg-zinc-950 font-mono text-xs">
              <div className="grid grid-cols-12 p-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                <div className="col-span-3">Delivery ID & Event</div>
                <div className="col-span-4">Commit Message</div>
                <div className="col-span-2">HMAC Signature</div>
                <div className="col-span-3 text-right">Processed At</div>
              </div>

              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {deliveries.map((del) => (
                  <div
                    key={del.id}
                    className="grid grid-cols-12 p-4 items-center hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <div className="col-span-3 truncate pr-2">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 block truncate">
                        {del.deliveryId}
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase">
                        Event: {del.eventType} • {del.repoFullName}
                      </span>
                    </div>

                    <div className="col-span-4 truncate pr-2">
                      <div className="flex items-center space-x-1.5 text-zinc-800 dark:text-zinc-200 truncate">
                        <GitCommit className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate">{del.commitMessage || 'Push update'}</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        Files: {del.filesChanged.join(', ') || 'none'}
                      </div>
                    </div>

                    <div className="col-span-2 flex items-center space-x-1">
                      {del.signatureValid ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Valid (256)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-red-500 font-bold text-[11px]">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Invalid</span>
                        </span>
                      )}
                    </div>

                    <div className="col-span-3 text-right text-zinc-500 text-[11px]">
                      {new Date(del.createdAt).toLocaleTimeString()} {new Date(del.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {simulatorOpen && (
        <WebhookSimulatorModal
          assessment={assessment}
          onClose={() => setSimulatorOpen(false)}
          onSuccess={handleWebhookSuccess}
        />
      )}
    </div>
  );
}

export default function WebhookLabPage() {
  return (
    <div className="min-h-screen bg-[#30251F] text-[#F5F0E5] flex">
      <Suspense fallback={<div className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" />}>
        <NavigationWithParam />
      </Suspense>
      <Suspense fallback={<div className="flex-1 p-12 text-xs font-mono text-zinc-500">Loading Webhook Lab...</div>}>
        <WebhookLabContent />
      </Suspense>
    </div>
  );
}

function NavigationWithParam() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';
  return <Navigation currentAssessmentId={assessmentId} />;
}
