'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Header } from '@/components/Header';
import { SkillCard } from '@/components/SkillCard';
import { CodeInspector } from '@/components/CodeInspector';
import { Assessment, RepositoryEvidence } from '@/lib/types';
import { ExternalLink } from 'lucide-react';

function AssessmentsContent() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvidence, setSelectedEvidence] = useState<RepositoryEvidence | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const singleRes = await fetch(`/api/assessments/${assessmentId}`);

        const singleData = await singleRes.json();

        if (singleData.success) {
          setAssessment(singleData.assessment);
        }
      } catch (err) {
        console.error('Error loading assessments:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [assessmentId]);

  if (loading || !assessment) {
    return (
      <div className="flex-1 p-12 flex items-center justify-center font-mono text-xs text-zinc-500">
        Loading assessment report...
      </div>
    );
  }

  const evidenceList = assessment.latestRevision.evidence || [];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Header assessment={assessment} onReassessed={(up) => setAssessment(up)} />

      <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Editorial Report Header */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-zinc-600 dark:text-zinc-400 font-semibold block mb-2">
                Official Evidence Report
              </span>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {assessment.internship.title}
              </h1>
              <div className="flex items-center space-x-3 text-xs font-mono text-zinc-600 dark:text-zinc-400 mt-2">
                <span>Employer: <strong className="text-zinc-800 dark:text-zinc-200">{assessment.internship.company}</strong></span>
                <span>•</span>
                <a
                  href={assessment.internship.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-black dark:hover:text-white flex items-center space-x-1"
                >
                  <span>Source URL</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Full List of Requirements with Explanations */}
          <div className="space-y-6">
            <h3 className="font-editorial text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Requirements Evaluation ({evidenceList.length})
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 align-items-stretch">
              {evidenceList.map((ev, idx) => (
                <SkillCard
                  key={ev.requirementId}
                  index={idx}
                  evidence={ev}
                  onInspect={(e) => setSelectedEvidence(e)}
                />
              ))}
            </div>
          </div>
        </div>
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

export default function AssessmentsPage() {
  return (
    <div className="min-h-screen bg-[#30251F] text-[#F5F0E5] flex">
      <Suspense fallback={<div className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" />}>
        <NavigationWithParam />
      </Suspense>
      <Suspense fallback={<div className="flex-1 p-12 text-xs font-mono text-zinc-500">Loading reports...</div>}>
        <AssessmentsContent />
      </Suspense>
    </div>
  );
}

function NavigationWithParam() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';
  return <Navigation currentAssessmentId={assessmentId} />;
}
