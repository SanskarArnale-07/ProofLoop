'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Sparkles,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Terminal,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';
import {
  InvestigationReport,
  InvestigationFinding,
  InvestigationToolCall,
  InvestigationEvidenceItem,
} from '@/lib/types';

interface AIInvestigatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  repoFullName?: string;
  requirementId?: string;
}

export function AIInvestigatorModal({
  isOpen,
  onClose,
  assessmentId,
  repoFullName,
  requirementId,
}: AIInvestigatorModalProps) {
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('Initializing evidence investigation...');
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({});
  const [showToolsUsed, setShowToolsUsed] = useState<boolean>(false);
  const lastFocused = useRef<HTMLElement | null>(null);
  const prevAssessmentId = useRef<string>(assessmentId);
  const prevReqId = useRef<string | undefined>(requirementId);

  // Clear cached report if assessment or target requirement changes
  useEffect(() => {
    if (prevAssessmentId.current !== assessmentId || prevReqId.current !== requirementId) {
      setReport(null);
      setError(null);
      prevAssessmentId.current = assessmentId;
      prevReqId.current = requirementId;
    }
  }, [assessmentId, requirementId]);

  const fetchInvestigation = useCallback(async (forceDeterministic = false) => {
    setLoading(true);
    setError(null);

    // Staged step updates during investigation
    const steps = forceDeterministic
      ? [
          'Searching verified repository evidence...',
          'Inspecting code excerpts at analyzed commit...',
          'Synthesizing deterministic findings & verification tasks...',
        ]
      : [
          'Retrieving verified assessment requirements...',
          'Executing read-only repository evidence search...',
          'Inspecting code excerpts at analyzed commit...',
          'Synthesizing grounded findings & verification tasks...',
        ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      setLoadingStep(steps[stepIndex]);
    }, 1800);

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceRefresh: true,
          ...(requirementId ? { requirementId } : {}),
          ...(forceDeterministic ? { forceDeterministic: true } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Investigation failed to complete.');
      }

      setReport(data.report);
      // Expand all findings by default
      const initialExpanded: Record<string, boolean> = {};
      data.report.findings?.forEach((f: InvestigationFinding) => {
        initialExpanded[f.requirementId] = true;
      });
      setExpandedFindings(initialExpanded);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute AI investigation.';
      setError(msg);
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }, [assessmentId, requirementId]);

  useEffect(() => {
    if (isOpen && !report && !loading && !error) {
      const timer = setTimeout(() => {
        fetchInvestigation();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, report, loading, error, fetchInvestigation]);

  useEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', onKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      requestAnimationFrame(() => lastFocused.current?.focus?.());
    };
  }, [isOpen, onClose, loading]);

  if (!isOpen) return null;

  const toggleFinding = (reqId: string) => {
    setExpandedFindings((prev) => ({
      ...prev,
      [reqId]: !prev[reqId],
    }));
  };

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'supported':
        return {
          label: 'SUPPORTED',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-[#2e5738]" />,
          border: 'border-[#2e5738]/50',
          text: 'text-[#2e5738]',
          bg: 'bg-[#2e5738]/10',
        };
      case 'partial':
        return {
          label: 'PARTIAL EVIDENCE',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-[#854d0e]" />,
          border: 'border-[#854d0e]/50',
          text: 'text-[#854d0e]',
          bg: 'bg-[#854d0e]/10',
        };
      case 'missing':
        return {
          label: 'MISSING PROOF',
          icon: <AlertCircle className="w-3.5 h-3.5 text-[#78716c]" />,
          border: 'border-[#78716c]/50',
          text: 'text-[#44403c]',
          bg: 'bg-[#78716c]/10',
        };
      default:
        return {
          label: 'UNCERTAIN',
          icon: <HelpCircle className="w-3.5 h-3.5 text-[#5B6A9C]" />,
          border: 'border-[#5B6A9C]/50',
          text: 'text-[#5B6A9C]',
          bg: 'bg-[#5B6A9C]/10',
        };
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="investigator-title"
      className="fixed inset-0 z-60 flex items-center justify-center p-4 md:p-6 outline-none"
      tabIndex={-1}
    >
      {/* Translucent charcoal backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-61"
        onClick={() => {
          if (!loading) onClose();
        }}
      />

      {/* Clipboard backing board: deep walnut */}
      <div
        className="relative z-62 w-full max-w-275 max-h-[92vh] overflow-hidden rounded-[30px] bg-[#423027] shadow-2xl flex flex-col"
        style={{
          boxShadow:
            '0 2px 10px rgba(0,0,0,0.45), 0 24px 64px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* Metallic clipboard clip at top */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-70">
          <div className="w-28 h-2 rounded-full border border-zinc-400/60 bg-zinc-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
        </div>

        {/* Outer frame border around paper sheet */}
        <div className="relative z-63 border border-[#7A6654] bg-transparent p-2 rounded-[26px] flex flex-col h-full min-h-0">
          {/* Cream paper sheet */}
          <div className="relative flex flex-col h-full min-h-0 overflow-hidden border border-[#C5B9A5] bg-[#F5EFE3] rounded-[22px]">
            {/* Header */}
            <header className="relative px-8 py-6 border-b border-[#C5B9A5] bg-[#F5EFE3] flex flex-col gap-2 z-10 shrink-0">
              <div className="flex items-start justify-between gap-6">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm border text-[10px] font-mono font-bold uppercase tracking-wider ${
                        report?.providerModel?.startsWith('deterministic')
                          ? 'border-[#5B6A9C]/50 bg-[#5B6A9C]/12 text-[#5B6A9C]'
                          : 'border-[#DD604C]/50 bg-[#DD604C]/12 text-[#DD604C]'
                      }`}
                    >
                      {report?.providerModel?.startsWith('deterministic') ? (
                        <Terminal className="w-3 h-3 text-[#5B6A9C]" />
                      ) : (
                        <Sparkles className="w-3 h-3 text-[#DD604C]" />
                      )}
                      <span>
                        {report?.providerModel?.startsWith('deterministic')
                          ? 'DETERMINISTIC INVESTIGATOR'
                          : 'AGENTIC AI INVESTIGATOR'}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#4E4B44]">
                      {report?.providerModel?.startsWith('deterministic')
                        ? 'TOOL-GROUNDED REPOSITORY INSPECTION (FALLBACK)'
                        : `MODEL-DRIVEN REPOSITORY INSPECTION (${report?.providerModel || 'Gemini'})`}
                    </span>
                  </div>
                  <h2
                    id="investigator-title"
                    className="font-editorial text-xl lg:text-2xl font-bold text-[#252522] tracking-tight leading-snug"
                  >
                    AI Evidence Investigation
                  </h2>
                  <p className="text-xs font-mono text-[#4E4B44]">
                    Repository: <span className="font-semibold text-[#252522]">{repoFullName || 'Analyzed Repository'}</span>
                    {report?.commitSha && ` • Commit: ${report.commitSha.slice(0, 7)}`}
                    {requirementId && ` • Target: ${requirementId}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchInvestigation()}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#C5B9A5] bg-[#EDE3D2] hover:bg-[#E4D7C2] text-xs font-mono font-bold text-[#252522] transition-colors disabled:opacity-40 cursor-pointer"
                    title="Re-run investigation"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>{loading ? 'Investigating...' : 'Re-investigate'}</span>
                  </button>

                  <button
                    onClick={onClose}
                    disabled={loading}
                    className="p-2 rounded hover:bg-[#D5D8D2] text-[#252522]/80 transition-colors focus-visible:ring-2 focus-visible:ring-[#252522] cursor-pointer"
                    title="Close (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </header>

            {/* Modal Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 space-y-6 bg-[#F5EFE3]">
              {/* Official Score Preserved Notice */}
              <div className="rounded-lg border border-[#C5B9A5] bg-[#EDE3D2]/70 px-4 py-3 flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-[#2e5738] shrink-0 mt-0.5" />
                <div className="text-xs text-[#252522] leading-relaxed">
                  <strong>Deterministic Integrity Preserved:</strong> This AI investigation provides explanatory findings and practical tasks. It does not alter your official assessment score, roadmap tasks, or ranking thresholds.
                </div>
              </div>

              {/* Loading State */}
              {loading && (
                <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-[#C5B9A5] bg-[#EDE3D2]/40 space-y-4">
                  <div className="w-10 h-10 rounded-full border-3 border-[#DD604C] border-t-transparent animate-spin" />
                  <div className="space-y-1">
                    <h3 className="font-editorial text-lg font-bold text-[#252522]">
                      Investigating Repository Evidence
                    </h3>
                    <p className="text-xs font-mono text-[#DD604C] animate-pulse">
                      {loadingStep}
                    </p>
                    <p className="text-[11px] font-sans text-[#4E4B44] pt-1">
                      Executing bounded tool loop across repository commits and source excerpts.
                    </p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {!loading && error && (
                <div className="rounded-xl border border-[#DD604C]/40 bg-[#DD604C]/10 p-6 space-y-3">
                  <div className="flex items-center gap-2 text-[#DD604C]">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <h3 className="font-editorial text-base font-bold">Investigation Encountered an Error</h3>
                  </div>
                  <p className="text-xs text-[#252522] font-sans leading-relaxed">
                    {error}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      onClick={() => fetchInvestigation(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#C5B9A5] bg-[#F5EFE3] hover:bg-[#EDE3D2] text-xs font-mono font-bold text-[#252522] transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry AI Investigation</span>
                    </button>
                    <button
                      onClick={() => fetchInvestigation(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#5B6A9C]/40 bg-[#5B6A9C]/10 hover:bg-[#5B6A9C]/20 text-xs font-mono font-bold text-[#5B6A9C] transition-colors cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Run Deterministic Tool Investigation</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Success Report State */}
              {!loading && !error && report && (
                <div className="space-y-6">
                  {/* Summary Card */}
                  <section className="rounded-xl border border-[#C5B9A5] bg-[#EDE3D2] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44]">
                        EXECUTIVE INVESTIGATION SUMMARY
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#C5B9A5] bg-[#F5EFE3] text-[#4E4B44]">
                        {report.providerModel || 'Bounded Tools'} • {report.iterationsCount} Iterations
                      </span>
                    </div>
                    <p className="font-sans text-sm leading-relaxed text-[#252522]">
                      {report.summary}
                    </p>
                  </section>

                  {/* Tools Used Inspector Toggle */}
                  <div className="rounded-lg border border-[#C5B9A5] bg-[#EDE3D2]/40 overflow-hidden">
                    <button
                      onClick={() => setShowToolsUsed(!showToolsUsed)}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-mono font-bold text-[#252522] hover:bg-[#EDE3D2] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-[#5B6A9C]" />
                        <span>Tools Executed by Agent ({report.toolsUsed.length})</span>
                      </div>
                      {showToolsUsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showToolsUsed && (
                      <div className="p-4 border-t border-[#C5B9A5] space-y-2 bg-[#F5EFE3]">
                        {report.toolsUsed.map((tool: InvestigationToolCall, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 rounded border border-[#C5B9A5] bg-[#EDE3D2]/70 font-mono text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-[#4E4B44]">
                              <span className="font-bold text-[#252522]">
                                Iteration {tool.iteration}: {tool.toolName}()
                              </span>
                            </div>
                            <div className="text-[11px] text-[#4E4B44] bg-[#E4DCCF] p-2 rounded break-all">
                              Args: {JSON.stringify(tool.arguments)}
                            </div>
                            {tool.resultSnippet && (
                              <div className="text-[11px] text-[#252522] line-clamp-2">
                                Result: {tool.resultSnippet}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Evidence-Grounded Findings List */}
                  <div className="space-y-4">
                    <h3 className="font-editorial text-lg font-bold text-[#252522]">
                      Requirement Findings ({report.findings.length})
                    </h3>

                    <div className="space-y-4">
                      {report.findings.map((finding: InvestigationFinding) => {
                        const badge = getClassificationBadge(finding.classification);
                        const isExpanded = expandedFindings[finding.requirementId] ?? true;

                        return (
                          <div
                            key={finding.requirementId}
                            className="rounded-xl border border-[#C5B9A5] bg-[#EDE3D2]/40 overflow-hidden shadow-xs"
                          >
                            {/* Finding Header */}
                            <div
                              onClick={() => toggleFinding(finding.requirementId)}
                              className="px-5 py-4 bg-[#EDE3D2] border-b border-[#C5B9A5] flex items-center justify-between gap-4 cursor-pointer hover:bg-[#E4DCCF] transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-[10px] font-mono font-bold uppercase tracking-wider ${badge.border} ${badge.text} ${badge.bg}`}
                                >
                                  {badge.icon}
                                  <span>{badge.label}</span>
                                </span>
                                <h4 className="font-editorial text-base font-bold text-[#252522]">
                                  {finding.requirementTitle}
                                </h4>
                              </div>

                              <button className="text-[#4E4B44] p-1">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>

                            {/* Finding Content */}
                            {isExpanded && (
                              <div className="p-5 space-y-4 bg-[#F5EFE3]">
                                {/* Reasoning */}
                                <div>
                                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] block mb-1">
                                    Agent Reasoning
                                  </span>
                                  <p className="text-xs font-sans text-[#252522] leading-relaxed">
                                    {finding.reasoning}
                                  </p>
                                </div>

                                {/* Evidence Excerpt */}
                                {finding.evidence && finding.evidence.length > 0 && (
                                  <div>
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] block mb-1.5">
                                      Discovered Evidence ({finding.evidence.length})
                                    </span>
                                    <div className="space-y-2">
                                      {finding.evidence.map((ev: InvestigationEvidenceItem, evIdx: number) => (
                                        <div
                                          key={evIdx}
                                          className="rounded border border-[#A8AB9F] bg-[#E4E5E0] p-3 text-xs font-mono"
                                        >
                                          <div className="flex items-center gap-2 text-[#4E4B44] mb-2 font-semibold">
                                            <FileCode className="w-3.5 h-3.5" />
                                            <span>{ev.filePath}</span>
                                            {ev.lineStart && (
                                              <span className="text-[11px] text-[#6E6B64]">
                                                :L{ev.lineStart}{ev.lineEnd ? `-L${ev.lineEnd}` : ''}
                                              </span>
                                            )}
                                          </div>
                                          <pre className="text-[11px] text-[#252522] overflow-x-auto whitespace-pre font-mono p-2 bg-[#D9DAD2] rounded leading-relaxed">
                                            {ev.excerpt}
                                          </pre>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Uncertainty / What could not be verified */}
                                <div className="rounded-md border border-[#C5B9A5] bg-[#EDE3D2]/70 p-3">
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#854d0e] mb-1">
                                    <AlertTriangle className="w-3 h-3 text-[#854d0e]" />
                                    <span>Uncertainty & Scope Limitations</span>
                                  </div>
                                  <p className="text-xs font-sans text-[#252522] leading-relaxed">
                                    {finding.uncertainty}
                                  </p>
                                </div>

                                {/* Suggested Verification Task */}
                                <div className="rounded-md border border-[#2e5738]/40 bg-[#2e5738]/10 p-3">
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#2e5738] mb-1">
                                    <CheckCircle2 className="w-3 h-3 text-[#2e5738]" />
                                    <span>Suggested Verification Task</span>
                                  </div>
                                  <p className="text-xs font-sans text-[#252522] leading-relaxed">
                                    {finding.verificationTask}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Limitations Footer */}
                  {report.limitations && report.limitations.length > 0 && (
                    <div className="p-4 rounded-lg border border-[#C5B9A5] bg-[#EDE3D2]/50 text-xs font-mono text-[#4E4B44] space-y-1">
                      <span className="font-bold uppercase tracking-wider text-[10px]">
                        Investigation Boundaries & Disclaimers:
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                        {report.limitations.map((lim: string, lIdx: number) => (
                          <li key={lIdx}>{lim}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <footer className="border-t border-[#C5B9A5] p-5 bg-[#EDE3D2] flex items-center justify-between shrink-0">
              <span className="text-[11px] font-mono text-[#4E4B44]">
                ProofLoop Evidence Engine • Read-Only Inspection
              </span>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded border border-[#C5B9A5] bg-[#252522] text-xs font-mono font-semibold text-white hover:bg-[#393732] transition-colors cursor-pointer"
              >
                Close Investigator
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
