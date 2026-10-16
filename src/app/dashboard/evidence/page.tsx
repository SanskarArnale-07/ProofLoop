'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Header } from '@/components/Header';
import { CodeInspector } from '@/components/CodeInspector';
import { Assessment, RepositoryEvidence } from '@/lib/types';
import { FileCode, GitCommit, ArrowUpRight, CheckCircle2, ShieldCheck } from 'lucide-react';

function EvidenceContent() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvidence, setSelectedEvidence] = useState<RepositoryEvidence | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/assessments/${assessmentId}`);
        const data = await res.json();
        if (data.success) {
          setAssessment(data.assessment);
        }
      } catch (err) {
        console.error('Error loading evidence:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assessmentId]);

  if (loading || !assessment) {
    return (
      <div className="flex-1 p-12 flex items-center justify-center font-mono text-xs text-zinc-500">
        Loading evidence matrix...
      </div>
    );
  }

  const demonstratedEvidence = (assessment.latestRevision.evidence || []).filter(
    e => e.filePath
  );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Header assessment={assessment} onReassessed={(up) => setAssessment(up)} />

      <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Provenance & Citations
          </span>
          <h2 className="font-editorial text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Repository Evidence Matrix
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans mt-1">
            Every substantiated requirement maps directly to verifiable files and line numbers in {assessment.repository.fullName}.
          </p>
        </div>

        {demonstratedEvidence.length === 0 ? (
          <div className="p-12 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-center text-xs font-mono text-zinc-500">
            No file evidence currently discovered. Push code to substantiate skills.
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden bg-white dark:bg-zinc-950 font-mono text-xs">
            <div className="grid grid-cols-12 p-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              <div className="col-span-4">File Path & Lines</div>
              <div className="col-span-4">Supported Requirement</div>
              <div className="col-span-2">Commit SHA</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {demonstratedEvidence.map((ev, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 p-4 items-center hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
                >
                  <div className="col-span-4 flex items-center space-x-2 truncate pr-2">
                    <FileCode className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {ev.filePath}
                    </span>
                    {ev.lineStart && (
                      <span className="text-zinc-400 text-[11px]">
                        :L{ev.lineStart}-L{ev.lineEnd}
                      </span>
                    )}
                  </div>

                  <div className="col-span-4 truncate pr-2">
                    <span className="text-zinc-800 dark:text-zinc-200 font-semibold block truncate">
                      {ev.requirementTitle}
                    </span>
                    <span className="text-[10px] text-zinc-400 uppercase font-mono">
                      Status: {ev.status}
                    </span>
                  </div>

                  <div className="col-span-2 flex items-center space-x-1 text-zinc-600 dark:text-zinc-400">
                    <GitCommit className="w-3.5 h-3.5" />
                    <span>{ev.commitSha}</span>
                  </div>

                  <div className="col-span-2 text-right">
                    <button
                      onClick={() => setSelectedEvidence(ev)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded text-[11px] font-mono transition-colors"
                    >
                      <span>Inspect</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedEvidence && (
        <CodeInspector
          evidence={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
        />
      )}
    </div>
  );
}

export default function EvidencePage() {
  return (
    <div className="min-h-screen bg-[#30251F] text-[#F5F0E5] flex">
      <Suspense fallback={<div className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" />}>
        <NavigationWithParam />
      </Suspense>
      <Suspense fallback={<div className="flex-1 p-12 text-xs font-mono text-zinc-500">Loading matrix...</div>}>
        <EvidenceContent />
      </Suspense>
    </div>
  );
}

function NavigationWithParam() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';
  return <Navigation currentAssessmentId={assessmentId} />;
}
