'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Clock,
  Database,
  ShieldAlert,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { AIGapReport, GapEffortLevel } from '@/lib/types';

interface AIGapCoachCardProps {
  assessmentId: string;
  revisionNumber?: number;
  onRefreshParent?: () => void;
}

export function AIGapCoachCard({
  assessmentId,
  revisionNumber,
  onRefreshParent
}: AIGapCoachCardProps) {
  const [report, setReport] = useState<AIGapReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);
  const [expandedGaps, setExpandedGaps] = useState<Record<string, boolean>>({});

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/assessments/${assessmentId}/gap-coach`);
      const data = await res.json();

      if (!res.ok) {
        if (data.migrationNeeded) {
          setMigrationNeeded(true);
        } else {
          setError(data.error || 'Failed to load AI Gap Coach report.');
        }
        return;
      }

      if (data.migrationNeeded) {
        setMigrationNeeded(true);
      } else {
        setMigrationNeeded(false);
        setReport(data.report || null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading AI Gap Coach advice.');
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport, revisionNumber]);

  // Countdown timer for rate limiting
  useEffect(() => {
    if (cooldownRemaining === null || cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const handleGenerate = async (forceRuleBased: boolean = false) => {
    if (generating || (cooldownRemaining && cooldownRemaining > 0)) return;

    try {
      setGenerating(true);
      setError(null);

      const res = await fetch(`/api/assessments/${assessmentId}/gap-coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRuleBased })
      });

      const data = await res.json();

      if (res.status === 429) {
        const retrySec = data.retryAfter || 60;
        setCooldownRemaining(retrySec);
        setError(data.error || `Please wait ${retrySec}s before regenerating.`);
        return;
      }

      if (!res.ok) {
        if (data.migrationNeeded) {
          setMigrationNeeded(true);
        } else {
          setError(data.error || 'Failed to generate Gap Coach advice.');
        }
        return;
      }

      if (data.success && data.report) {
        setReport(data.report);
        setCooldownRemaining(60); // 60s cooldown
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error generating report.');
    } finally {
      setGenerating(false);
    }
  };

  const toggleGapExpand = (reqId: string) => {
    setExpandedGaps((prev) => ({ ...prev, [reqId]: !prev[reqId] }));
  };

  const getEffortBadge = (effort: GapEffortLevel) => {
    switch (effort) {
      case 'small':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Small Effort (1-2 hrs)
          </span>
        );
      case 'large':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Large Effort (Full module)
          </span>
        );
      case 'medium':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Medium Effort (Half-day)
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
        </div>
        <div className="h-14 bg-zinc-100 dark:bg-zinc-900 rounded" />
        <div className="h-20 bg-zinc-100 dark:bg-zinc-900 rounded" />
      </div>
    );
  }

  // Database migration needed banner
  if (migrationNeeded) {
    return (
      <div className="p-6 bg-white dark:bg-zinc-950 border border-amber-500/30 rounded space-y-3">
        <div className="flex items-center space-x-2 text-amber-500 text-sm font-mono font-bold">
          <Database className="w-4 h-4" />
          <span>Database Migration Needed</span>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">
          The <code className="font-mono text-zinc-900 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-900 px-1 py-0.5 rounded">ai_gap_reports</code> table has not been created in PostgreSQL yet.
          Run the following migration command to enable stored AI Gap Coach reports:
        </p>
        <pre className="p-2.5 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200 rounded font-mono text-xs overflow-x-auto border border-zinc-200 dark:border-zinc-800">
          npm run db:migrate
        </pre>
      </div>
    );
  }

  // Generating in progress state
  if (generating) {
    return (
      <div className="p-8 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-center space-y-4">
        <div className="inline-flex p-3 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-spin">
          <RefreshCw className="w-6 h-6 text-zinc-900 dark:text-zinc-100" />
        </div>
        <h4 className="font-editorial text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Generating AI Gap Coach Advice...
        </h4>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans max-w-md mx-auto">
          Synthesizing your score breakdown and repository evidence to create prioritized engineering next steps.
        </p>
      </div>
    );
  }

  // Empty state (no report stored yet)
  if (!report) {
    return (
      <div className="p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="font-editorial text-xl font-bold text-zinc-900 dark:text-zinc-100">
              AI Gap Coach
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
            AI-generated advice. Does not affect your score.
          </span>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans leading-relaxed">
          Get plain-English advice tailored to this job posting, explaining what evidence is missing and concrete steps to take in your repository.
        </p>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-xs font-mono flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleGenerate(false)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-[#f4efe2] dark:text-[#2B211B] text-xs font-mono font-bold rounded transition-colors border border-transparent dark:border-[#d5ccba] cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-white dark:text-[#2B211B]" />
            <span>Generate AI Gap Advice</span>
          </button>
          <button
            onClick={() => handleGenerate(true)}
            className="inline-flex items-center space-x-1 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-mono font-semibold rounded border border-zinc-200 dark:border-zinc-800 cursor-pointer"
          >
            <span>Generate Rule-Based Advice</span>
          </button>
        </div>
      </div>
    );
  }

  // Active Report View
  return (
    <div className="p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="font-editorial text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              AI Gap Coach
            </h3>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                report.generatedBy === 'ai'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
              }`}
            >
              {report.generatedBy === 'ai' ? 'AI Assisted' : 'Rule-Based Fallback'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-1 block">
            Advisory for Revision #{report.revisionNumber} • Rule {report.scoringRuleVersion}
          </span>
        </div>

        {/* Action button & Disclaimer badge */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="text-[11px] font-mono px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 flex items-center space-x-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
            <span>AI-generated advice. Does not affect your score.</span>
          </div>

          <button
            onClick={() => handleGenerate(false)}
            disabled={generating || Boolean(cooldownRemaining && cooldownRemaining > 0)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1 bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-[#f4efe2] dark:text-[#2B211B] text-xs font-mono font-bold rounded transition-colors border border-transparent dark:border-[#d5ccba] ${
              cooldownRemaining ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            title={cooldownRemaining ? `Wait ${cooldownRemaining}s before regenerating` : 'Regenerate advice'}
          >
            <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
            <span>
              {cooldownRemaining ? `Regenerate (${cooldownRemaining}s)` : 'Regenerate'}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-xs font-mono flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Box */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
          Coach Synthesis
        </span>
        <p className="text-xs text-zinc-800 dark:text-zinc-200 font-sans leading-relaxed font-medium">
          {report.summary}
        </p>
      </div>

      {/* Revision Diff section if revision > 1 */}
      {report.revisionDiff && (
        (report.revisionDiff.improved.length > 0 || report.revisionDiff.stillMissing.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {report.revisionDiff.improved.length > 0 && (
              <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/20 rounded space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-emerald-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>What Improved Since Last Revision</span>
                </div>
                <ul className="space-y-1 text-xs font-sans text-zinc-700 dark:text-zinc-300">
                  {report.revisionDiff.improved.map((item, idx) => (
                    <li key={idx} className="flex items-start space-x-1.5">
                      <span className="text-emerald-500 font-mono">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.revisionDiff.stillMissing.length > 0 && (
              <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-amber-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Still Missing Evidence</span>
                </div>
                <ul className="space-y-1 text-xs font-sans text-zinc-700 dark:text-zinc-300">
                  {report.revisionDiff.stillMissing.map((item, idx) => (
                    <li key={idx} className="flex items-start space-x-1.5">
                      <span className="text-amber-500 font-mono">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}

      {/* Prioritized Gaps & Concrete Next Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-bold">
            Prioritized Engineering Gaps ({report.gaps.length})
          </h4>
        </div>

        {report.gaps.length === 0 ? (
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded flex items-center space-x-2 text-xs font-mono text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>No technical gaps identified. All target requirements are demonstrated!</span>
          </div>
        ) : (
          <div className="space-y-3">
            {report.gaps.map((gap) => {
              const isExpanded = expandedGaps[gap.requirementId] ?? true;
              return (
                <div
                  key={gap.requirementId}
                  className="p-4 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded transition-all space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                        #{gap.priority}
                      </span>
                      <h5 className="font-editorial text-base font-bold text-zinc-900 dark:text-zinc-100">
                        {gap.requirementTitle}
                      </h5>
                    </div>

                    <div className="flex items-center space-x-2">
                      {getEffortBadge(gap.effort)}
                      <button
                        onClick={() => toggleGapExpand(gap.requirementId)}
                        className="text-zinc-400 hover:text-zinc-100 p-1 cursor-pointer"
                        aria-label="Toggle details"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Grounded Gap Reason */}
                  <div className="text-xs font-sans text-zinc-700 dark:text-zinc-300">
                    <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wide mr-1.5 font-bold">
                      Grounded Finding:
                    </span>
                    <span>{gap.gapReason}</span>
                  </div>

                  {/* Concrete Next Steps */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/60 space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                        Recommended Next Steps:
                      </span>
                      <ul className="space-y-1">
                        {gap.nextSteps.map((step, idx) => (
                          <li
                            key={idx}
                            className="flex items-start space-x-2 text-xs font-sans text-zinc-700 dark:text-zinc-300"
                          >
                            <ArrowRight className="w-3 h-3 text-zinc-400 mt-0.5 shrink-0" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Strengths to Keep */}
      {report.strengths && report.strengths.length > 0 && (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-mono uppercase font-bold text-zinc-700 dark:text-zinc-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Demonstrated Strengths to Keep</span>
          </div>
          <ul className="space-y-1 text-xs font-sans text-zinc-600 dark:text-zinc-400">
            {report.strengths.map((str, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="font-mono text-emerald-500">•</span>
                <span>{str}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
