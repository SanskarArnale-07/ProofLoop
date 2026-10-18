'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Header } from '@/components/Header';
import { RoadmapCard } from '@/components/RoadmapCard';
import { AIGapCoachCard } from '@/components/AIGapCoachCard';
import { WebhookSimulatorModal } from '@/components/WebhookSimulatorModal';
import { Assessment, GapTask } from '@/lib/types';
import { CheckCircle2 } from 'lucide-react';

function RoadmapContent() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<GapTask | null>(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [promotedNotification, setPromotedNotification] = useState<string | null>(null);

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
        console.error('Error loading roadmap:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assessmentId]);

  if (loading || !assessment) {
    return (
      <div className="flex-1 p-12 flex items-center justify-center font-mono text-xs text-zinc-500">
        Loading Gap-to-Proof roadmap...
      </div>
    );
  }

  const tasks = assessment.tasks || [];

  const handleSimulatePush = (task: GapTask) => {
    setSelectedTask(task);
    setSimulatorOpen(true);
  };

  const handleWebhookSuccess = (updated: Assessment, promoted: string[]) => {
    setAssessment(updated);
    setSimulatorOpen(false);
    if (promoted.length > 0) {
      setPromotedNotification(`Skill promoted: ${promoted.join(', ')} is now Demonstrated!`);
      setTimeout(() => setPromotedNotification(null), 5000);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Header assessment={assessment} onReassessed={(up) => setAssessment(up)} />

      <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-600 dark:text-zinc-400 font-semibold block mb-1">
              Actionable Extension
            </span>
            <h2 className="font-editorial text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Gap-to-Proof Roadmap
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans mt-1">
              Concrete engineering tasks designed to produce demonstrable code for missing requirements.
            </p>
          </div>

          <div className="font-mono text-xs text-zinc-600 dark:text-zinc-400 font-medium bg-white dark:bg-zinc-950 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded">
            <span>{tasks.length} Actionable Tasks</span>
          </div>
        </div>

        {promotedNotification && (
          <div className="p-4 bg-zinc-100 dark:bg-zinc-900 border border-black dark:border-white rounded flex items-center space-x-2 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{promotedNotification}</span>
          </div>
        )}

        {/* AI Gap Coach Card */}
        <AIGapCoachCard
          assessmentId={assessment.id}
          revisionNumber={assessment.currentRevisionNumber}
        />

        {tasks.length === 0 ? (
          <div className="p-12 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-center space-y-3 font-mono text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              All Target Requirements Demonstrated
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400 font-sans max-w-md mx-auto">
              Your repository contains verifiable code evidence for all extracted requirements from this internship posting.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {tasks.map((task) => (
              <RoadmapCard
                key={task.id}
                task={task}
                onSimulatePush={handleSimulatePush}
              />
            ))}
          </div>
        )}
      </div>

      {simulatorOpen && (
        <WebhookSimulatorModal
          assessment={assessment}
          preselectedTask={selectedTask}
          onClose={() => setSimulatorOpen(false)}
          onSuccess={handleWebhookSuccess}
        />
      )}
    </div>
  );
}

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-[#30251F] text-[#F5F0E5] flex">
      <Suspense fallback={<div className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" />}>
        <NavigationWithParam />
      </Suspense>
      <Suspense fallback={<div className="flex-1 p-12 text-xs font-mono text-zinc-500">Loading roadmap...</div>}>
        <RoadmapContent />
      </Suspense>
    </div>
  );
}

function NavigationWithParam() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id') || 'sample-assessment-stripe';
  return <Navigation currentAssessmentId={assessmentId} />;
}
