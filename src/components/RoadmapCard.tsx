'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Code2, CheckSquare, Sparkles, ArrowRight } from 'lucide-react';
import { GapTask } from '@/lib/types';

interface RoadmapCardProps {
  task: GapTask;
  onSimulatePush?: (task: GapTask) => void;
}

export function RoadmapCard({ task, onSimulatePush }: RoadmapCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded transition-all">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center space-x-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
            <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-700 dark:text-zinc-300">
              Gap: {task.requirementTitle}
            </span>
            <span>•</span>
            <span className="text-zinc-400">Category: {task.category}</span>
          </div>

          <h3 className="font-editorial text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {task.title}
          </h3>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium">
            Pending Code Evidence
          </span>
        </div>
      </div>

      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans mb-4">
        {task.description}
      </p>

      {/* Expected Evidence Box */}
      <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded mb-4">
        <div className="flex items-center space-x-1.5 text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          <Code2 className="w-3.5 h-3.5" />
          <span>Expected Evidence Criteria</span>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 font-mono leading-relaxed">
          {task.expectedEvidence}
        </p>
      </div>

      {/* Expandable Project Brief */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center space-x-1 text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors"
        >
          <span>{expanded ? 'Hide Project Brief' : 'Expand Project Brief & Acceptance Criteria'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4 animate-fade-in">
            {/* Acceptance Criteria */}
            <div>
              <h4 className="text-xs font-mono font-semibold uppercase text-zinc-500 mb-2 flex items-center space-x-1.5">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Acceptance Criteria</span>
              </h4>
              <ul className="space-y-1.5">
                {task.acceptanceCriteria.map((crit, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-xs font-sans text-zinc-700 dark:text-zinc-300">
                    <span className="font-mono text-zinc-400 mt-0.5">•</span>
                    <span>{crit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Implementation hints & verification */}
            {task.projectBrief && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-3 bg-zinc-100 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 text-xs">
                  <span className="font-mono uppercase text-[10px] text-zinc-500 block mb-1">
                    Suggested Scope & Hints
                  </span>
                  <p className="text-zinc-700 dark:text-zinc-300 font-sans mb-2">
                    {task.projectBrief.suggestedScope}
                  </p>
                  <ul className="space-y-1">
                    {task.projectBrief.implementationHints.map((hint, i) => (
                      <li key={i} className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono">
                        → {hint}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 bg-zinc-100 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 text-xs">
                  <span className="font-mono uppercase text-[10px] text-zinc-500 block mb-1">
                    Verification Method (ProofLoop Webhook)
                  </span>
                  <p className="text-zinc-700 dark:text-zinc-300 font-sans leading-relaxed">
                    {task.projectBrief.verificationMethod}
                  </p>
                  <div className="mt-2 text-[11px] font-mono text-zinc-500">
                    Suggested files: {task.suggestedFiles.join(', ')}
                  </div>
                </div>
              </div>
            )}

            {/* Simulate push trigger for demonstration */}
            {onSimulatePush && (
              <div className="pt-3 flex justify-end">
                <button
                  onClick={() => onSimulatePush(task)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-mono font-medium rounded transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Simulate Pushing Code for This Task</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
