'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Header } from '@/components/Header';
import { Assessment, AssessmentRevision } from '@/lib/types';
import { History, GitCommit, Calendar, Radio, CheckCircle2, ChevronRight } from 'lucide-react';

function HistoryContent() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [revisions, setRevisions] = useState<AssessmentRevision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<AssessmentRevision | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [asmtRes, revRes] = await Promise.all([
          fetch(`/api/assessments/${assessmentId}`),
          fetch(`/api/assessments/${assessmentId}/revisions`)
        ]);

        const asmtData = await asmtRes.json();
        const revData = await revRes.json();

        if (asmtData.success) {
          setAssessment(asmtData.assessment);
        }
        if (revData.success) {
          setRevisions(revData.revisions || []);
          if (revData.revisions && revData.revisions.length > 0) {
            setSelectedRevision(revData.revisions[0]);
          }
        }
      } catch (err) {
        console.error('Error loading history:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assessmentId]);

  if (loading || !assessment) {
    return (
      <div className="flex-1 p-12 flex items-center justify-center font-mono text-xs text-zinc-500">
        Loading revision history...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Header assessment={assessment} onReassessed={(up) => setAssessment(up)} />

      <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Immutable Audit Trail
          </span>
          <h2 className="font-editorial text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Assessment Revisions & Evolution
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans mt-1">
            ProofLoop never rewrites past assessments. Inspect how your code evidence evolved across commits and webhook events.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Revision Timeline List */}
          <div className="lg:col-span-5 space-y-3 font-mono text-xs">
            {revisions.map((rev) => {
              const isSelected = selectedRevision?.id === rev.id;

              return (
                <div
                  key={rev.id}
                  onClick={() => setSelectedRevision(rev)}
                  className={`p-4 border rounded cursor-pointer transition-all ${
                    isSelected
                      ? 'border-black dark:border-white bg-white dark:bg-zinc-900 shadow-xs'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      Revision #{rev.revisionNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] uppercase font-bold text-zinc-600 dark:text-zinc-300">
                      {rev.triggerType}
                    </span>
                  </div>

                  <p className="text-zinc-700 dark:text-zinc-300 font-sans text-xs truncate mb-2">
                    {rev.commitMessage}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
                    <div className="flex items-center space-x-1">
                      <GitCommit className="w-3.5 h-3.5" />
                      <span>{rev.commitSha}</span>
                    </div>
                    <span>
                      {rev.demonstratedCount} Demonstrated • {rev.notDemonstratedCount} Gaps
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Revision Details */}
          <div className="lg:col-span-7">
            {selectedRevision ? (
              <div className="p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-mono text-xs space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <h3 className="font-editorial text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      Revision #{selectedRevision.revisionNumber} Details
                    </h3>
                    <span className="text-zinc-500 text-[11px]">
                      Created: {new Date(selectedRevision.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-800 dark:text-zinc-200 text-xs font-bold uppercase">
                    Trigger: {selectedRevision.triggerType}
                  </span>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded">
                  <span className="text-[10px] uppercase text-zinc-400 font-bold block mb-1">
                    Analyzed Commit
                  </span>
                  <div className="flex items-center space-x-2 text-zinc-800 dark:text-zinc-200">
                    <GitCommit className="w-4 h-4 text-zinc-400" />
                    <span className="font-bold">{selectedRevision.commitSha}</span>
                    <span>—</span>
                    <span className="truncate">{selectedRevision.commitMessage}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] uppercase font-bold text-zinc-500 mb-2">
                    Evidence Snapshot at Revision #{selectedRevision.revisionNumber}
                  </h4>
                  <div className="space-y-2">
                    {selectedRevision.evidence.map((ev, i) => (
                      <div
                        key={i}
                        className="p-3 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 block">
                            {ev.requirementTitle}
                          </span>
                          <span className="text-[11px] text-zinc-500 font-sans">
                            {ev.filePath ? `${ev.filePath} (:L${ev.lineStart || 1})` : 'Not demonstrated in scope'}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            ev.status === 'demonstrated'
                              ? 'bg-black text-white dark:bg-white dark:text-black'
                              : ev.status === 'partial'
                              ? 'border border-zinc-400 text-zinc-800 dark:text-zinc-200'
                              : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}
                        >
                          {ev.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 border border-zinc-200 dark:border-zinc-800 rounded text-center text-zinc-500 font-mono text-xs">
                Select a revision from the left to view details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-[#30251F] text-[#F5F0E5] flex">
      <Suspense fallback={<div className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" />}>
        <NavigationWithParam />
      </Suspense>
      <Suspense fallback={<div className="flex-1 p-12 text-xs font-mono text-zinc-500">Loading history...</div>}>
        <HistoryContent />
      </Suspense>
    </div>
  );
}

function NavigationWithParam() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';
  return <Navigation currentAssessmentId={assessmentId} />;
}
