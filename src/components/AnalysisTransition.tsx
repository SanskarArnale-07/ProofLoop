'use client';

import { Check, Loader2, AlertCircle } from 'lucide-react';

interface Stage {
  title: string;
  description: string;
}

interface AnalysisTransitionProps {
  currentStage: number; // 1, 2, 3
  error?: string | null;
  onRetry?: () => void;
}

export function AnalysisTransition({ currentStage, error, onRetry }: AnalysisTransitionProps) {
  const stages: Stage[] = [
    {
      title: '1. Extracting Internship Requirements',
      description: 'Scraping source posting URL, parsing role requirements, and structuring core skills.'
    },
    {
      title: '2. Analyzing Repository Evidence',
      description: 'Inspecting git tree, evaluating code patterns, routes, tests, and configuration files.'
    },
    {
      title: '3. Synthesizing Evidence-Backed Assessment',
      description: 'Mapping code lines to requirements, determining gap roadmap, and creating audit revision.'
    }
  ];

  return (
    <div className="min-h-[500px] flex flex-col justify-center items-center px-6 py-12 max-w-xl mx-auto">
      {/* Editorial Headline */}
      <div className="text-center mb-10">
        <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 block mb-2">
          {error ? 'Execution Interrupted' : 'Verification In Progress'}
        </span>
        <h2 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {error ? 'Analysis Encountered An Issue' : 'Verifying Code Evidence'}
        </h2>
        <p className="text-xs text-zinc-500 font-mono mt-2">
          {error ? 'The repository scan could not be completed.' : 'Inspecting real code files to substantiate requirements.'}
        </p>
      </div>

      {/* Error state */}
      {error ? (
        <div className="w-full p-6 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-zinc-800 dark:text-zinc-200 mx-auto" />
          <p className="text-xs font-mono text-zinc-800 dark:text-zinc-200 leading-relaxed">
            {error}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black text-xs font-mono rounded font-medium hover:opacity-90 transition-opacity"
            >
              Retry Analysis
            </button>
          )}
        </div>
      ) : (
        /* Progress stages */
        <div className="w-full space-y-5">
          {stages.map((stage, idx) => {
            const stepNum = idx + 1;
            const isCompleted = currentStage > stepNum;
            const isCurrent = currentStage === stepNum;
            const isPending = currentStage < stepNum;

            return (
              <div
                key={idx}
                className={`p-4 border rounded transition-all duration-300 ${
                  isCurrent
                    ? 'border-black dark:border-white bg-zinc-50 dark:bg-zinc-900/90 shadow-sm'
                    : isCompleted
                    ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 opacity-90'
                    : 'border-zinc-200 dark:border-zinc-800/60 bg-transparent opacity-40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-editorial text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {stage.title}
                  </span>
                  <div>
                    {isCompleted && (
                      <span className="inline-flex items-center space-x-1 text-[10px] font-mono uppercase font-bold text-zinc-900 dark:text-zinc-100">
                        <Check className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </span>
                    )}
                    {isCurrent && (
                      <span className="inline-flex items-center space-x-1.5 text-[10px] font-mono uppercase font-bold text-zinc-900 dark:text-zinc-100">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing</span>
                      </span>
                    )}
                    {isPending && (
                      <span className="text-[10px] font-mono uppercase text-zinc-400">
                        Queued
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-zinc-500 font-mono leading-relaxed">
                  {stage.description}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
