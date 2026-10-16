'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Header } from '@/components/Header';
import { SkillCard } from '@/components/SkillCard';
import { CodeInspector } from '@/components/CodeInspector';
import { ActivityFeed } from '@/components/ActivityFeed';
import { WebhookSimulatorModal } from '@/components/WebhookSimulatorModal';
import { Assessment, RepositoryEvidence, EvidenceStatus } from '@/lib/types';
import {
  ShieldCheck,
  CircleDashed,
  AlertCircle,
  Radio,
  FileCheck2,
  Sparkles,
  GitCommit,
  Filter
} from 'lucide-react';

function DashboardContent() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector state
  const [selectedEvidence, setSelectedEvidence] = useState<RepositoryEvidence | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | EvidenceStatus>('all');

  // Webhook Simulator Modal
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const fetchAssessment = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to load assessment data.');
      } else {
        setAssessment(data.assessment);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching assessment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessment();
  }, [assessmentId]);

  if (loading) {
    return (
      <div className="flex-1 p-12 flex items-center justify-center font-mono text-xs text-zinc-500">
        Loading assessment evidence...
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="flex-1 p-12 flex flex-col items-center justify-center font-mono text-xs text-zinc-600 space-y-4">
        <p>{error || 'Assessment not found.'}</p>
        <button
          onClick={fetchAssessment}
          className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  const evidenceList = assessment.latestRevision.evidence || [];
  const filteredEvidence = statusFilter === 'all'
    ? evidenceList
    : evidenceList.filter(e => e.status === statusFilter);

  const demonstratedCount = evidenceList.filter(e => e.status === 'demonstrated').length;
  const partialCount = evidenceList.filter(e => e.status === 'partial').length;
  const notDemonstratedCount = evidenceList.filter(e => e.status === 'not_demonstrated').length;

  const handleInspect = (ev: RepositoryEvidence) => {
    setSelectedEvidence(ev);
  };

  const handleCloseInspector = () => {
    setSelectedEvidence(null);
  };

  const handleReassessed = (updated: Assessment) => {
    setAssessment(updated);
  };

  const handleWebhookSuccess = (updated: Assessment, promoted: string[]) => {
    setAssessment(updated);
    setSimulatorOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Header assessment={assessment} onReassessed={handleReassessed} />

      <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Top Readiness Summary Strip */}
        <section className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                Evidence-Led Readiness Summary
              </span>
              <h2 className="font-editorial text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Scope Evaluation for {assessment.internship.company}
              </h2>
              <p className="text-xs text-zinc-500 font-sans mt-1">
                Reflects traceable evidence found in the analyzed repository scope, not your entire engineering ability.
              </p>
            </div>

            <button
              onClick={() => setSimulatorOpen(true)}
              className="self-start md:self-auto inline-flex items-center space-x-2 px-3.5 py-2 bg-zinc-900 hover:bg-black text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 text-xs font-mono font-medium rounded transition-colors shadow-xs"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Simulate Commit Webhook</span>
            </button>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 font-mono text-xs">
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded">
              <div className="flex items-center justify-between text-zinc-500 mb-1">
                <span className="uppercase text-[10px] font-bold">Demonstrated</span>
                <ShieldCheck className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
              </div>
              <div className="text-3xl font-editorial font-bold text-zinc-900 dark:text-zinc-100">
                {demonstratedCount}
              </div>
              <span className="text-[11px] text-zinc-500 font-sans mt-1 block">
                Requirements verified by active code or tests
              </span>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded">
              <div className="flex items-center justify-between text-zinc-500 mb-1">
                <span className="uppercase text-[10px] font-bold">Partial Evidence</span>
                <CircleDashed className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              <div className="text-3xl font-editorial font-bold text-zinc-900 dark:text-zinc-100">
                {partialCount}
              </div>
              <span className="text-[11px] text-zinc-500 font-sans mt-1 block">
                Candidate files present but incomplete
              </span>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded">
              <div className="flex items-center justify-between text-zinc-500 mb-1">
                <span className="uppercase text-[10px] font-bold">Not Yet Demonstrated</span>
                <AlertCircle className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="text-3xl font-editorial font-bold text-zinc-900 dark:text-zinc-100">
                {notDemonstratedCount}
              </div>
              <span className="text-[11px] text-zinc-500 font-sans mt-1 block">
                No code proof discovered in repo scope
              </span>
            </div>
          </div>
        </section>

        {/* Main 2-Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Column: Requirement Breakdown */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center space-x-2">
                <h3 className="font-editorial text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  Evaluated Requirements ({filteredEvidence.length})
                </h3>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center space-x-1 font-mono text-[11px]">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-black text-white dark:bg-white dark:text-black font-bold'
                      : 'text-zinc-500 hover:text-black dark:hover:text-white'
                  }`}
                >
                  All ({evidenceList.length})
                </button>
                <button
                  onClick={() => setStatusFilter('demonstrated')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    statusFilter === 'demonstrated'
                      ? 'bg-black text-white dark:bg-white dark:text-black font-bold'
                      : 'text-zinc-500 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Demonstrated ({demonstratedCount})
                </button>
                <button
                  onClick={() => setStatusFilter('not_demonstrated')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    statusFilter === 'not_demonstrated'
                      ? 'bg-black text-white dark:bg-white dark:text-black font-bold'
                      : 'text-zinc-500 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Gaps ({notDemonstratedCount})
                </button>
              </div>
            </div>

            {/* List of Skill Cards */}
            <div className="space-y-4">
              {filteredEvidence.map((ev) => (
                <SkillCard
                  key={ev.requirementId}
                  evidence={ev}
                  onInspect={handleInspect}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Recent Activity Feed */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="font-editorial text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Recent Activity
              </h3>
              <span className="text-[11px] font-mono text-zinc-400">
                Revision #{assessment.currentRevisionNumber}
              </span>
            </div>

            <ActivityFeed activities={assessment.recentActivity} />

            {/* Gap-to-Proof Roadmap Shortcut Box */}
            {assessment.tasks && assessment.tasks.length > 0 && (
              <div className="p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-mono text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    Gap-to-Proof Roadmap
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                    {assessment.tasks.length} Actionable Tasks
                  </span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 font-sans text-xs leading-relaxed">
                  Turn missing requirements into demonstrable proof with guided implementation tasks.
                </p>
                <a
                  href={`/dashboard/roadmap?id=${assessment.id}`}
                  className="block text-center py-2 px-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded text-zinc-800 dark:text-zinc-200 font-medium transition-colors"
                >
                  View Complete Roadmap →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Split Panel Code Inspector */}
      {selectedEvidence && (
        <CodeInspector
          evidence={selectedEvidence}
          onClose={handleCloseInspector}
        />
      )}

      {/* Webhook Simulator Modal */}
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

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#30251F] text-[#F5F0E5] flex">
      <Suspense fallback={<div className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" />}>
        <NavigationWithParam />
      </Suspense>
      <Suspense fallback={<div className="flex-1 p-12 text-xs font-mono text-zinc-500">Loading overview...</div>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function NavigationWithParam() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';
  return <Navigation currentAssessmentId={assessmentId} />;
}
