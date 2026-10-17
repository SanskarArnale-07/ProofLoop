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
  onBack?: () => void;
}

export function AnalysisTransition({ currentStage, error, onRetry, onBack }: AnalysisTransitionProps) {
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
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#BDB0A2] block mb-2 font-semibold">
          {error ? 'Execution Interrupted' : 'Verification In Progress'}
        </span>
        <h2 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[#F5F0E5]">
          {error ? 'Analysis Encountered An Issue' : 'Verifying Code Evidence'}
        </h2>
        <p className="text-xs text-[#BDB0A2] font-mono mt-2">
          {error ? 'The repository scan could not be completed.' : 'Inspecting real code files to substantiate requirements.'}
        </p>
      </div>

      {/* Error state */}
      {error ? (
        <div className="w-full p-6 bg-[#211A16] border border-red-500/60 rounded text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-xs font-mono text-[#F5F0E5] leading-relaxed">
            {error}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 bg-white hover:bg-[#f4efe2] text-[#2B211B] text-xs font-mono rounded font-bold border border-[#d5ccba] transition-colors cursor-pointer"
              >
                Retry Analysis
              </button>
            )}
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 bg-transparent border border-[#584638] text-[#F5F0E5] text-xs font-mono rounded font-medium hover:bg-[#30251F] transition-colors cursor-pointer"
              >
                Back to Scope Review
              </button>
            )}
          </div>
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
                    ? 'border-[#DD5946] bg-[#211A16] shadow-md'
                    : isCompleted
                    ? 'border-[#584638] bg-[#211A16]/90'
                    : 'border-[#584638]/40 bg-[#211A16]/40 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-editorial text-base font-bold text-[#F5F0E5]">
                    {stage.title}
                  </span>
                  <div>
                    {isCompleted && (
                      <span className="inline-flex items-center space-x-1 text-[10px] font-mono uppercase font-bold text-emerald-400">
                        <Check className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </span>
                    )}
                    {isCurrent && (
                      <span className="inline-flex items-center space-x-1.5 text-[10px] font-mono uppercase font-bold text-[#DD5946]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing</span>
                      </span>
                    )}
                    {isPending && (
                      <span className="text-[10px] font-mono uppercase text-[#BDB0A2]">
                        Queued
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#BDB0A2] font-mono leading-relaxed">
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
