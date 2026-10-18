'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  FileCode,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { RepositoryEvidence } from '@/lib/types';

interface CodeInspectorProps {
  evidence: RepositoryEvidence | null;
  onClose: () => void;
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript (React)',
  js: 'JavaScript',
  jsx: 'JavaScript (React)',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  rb: 'Ruby',
  php: 'PHP',
  cpp: 'C++',
  c: 'C',
  cs: 'C#',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  md: 'Markdown',
  sh: 'Shell',
  sql: 'SQL',
  txt: 'Text',
};

function detectLanguage(filePath?: string): string | null {
  if (!filePath) return null;
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext ? (LANGUAGE_BY_EXTENSION[ext] ?? null) : null;
}

function formatVerificationLevel(level?: string): string {
  switch (level) {
    case 'implementation_verified':
      return 'Implementation Verified';
    case 'source_inspected':
      return 'Source Inspected';
    case 'file_discovery':
      return 'File Discovery Only';
    case 'negative_verification':
      return 'Negative Verification';
    default:
      return 'Unverified';
  }
}

const KEYWORDS = new Set([
  'function','const','let','var','return','if','else','import','export','from',
  'async','await','class','new','this','true','false','null','undefined','try',
  'catch','throw','switch','case','break','continue','for','while','do','in',
  'of','typeof','instanceof','void','delete','public','private','protected',
  'static','extends','super','yield','generator','interface','type','enum',
]);

function tokenizeLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i] === '/' && line[i + 1] === '/') {
      parts.push(<span key={`c-${i}`} className="text-[#6E6B64]">{line.slice(i)}</span>);
      break;
    }

    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      parts.push(<span key={`s-${i}`} className="text-[#DD604C]">{line.slice(i, j + 1)}</span>);
      i = j + 1;
      continue;
    }

    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) {
        parts.push(<span key={`k-${i}`} className="text-[#5B6A9C] font-semibold">{word}</span>);
      } else {
        parts.push(word);
      }
      i = j;
      continue;
    }

    if (/\d/.test(line[i])) {
      let j = i;
      while (j < line.length && /[\d.]/.test(line[j])) j++;
      parts.push(<span key={`n-${i}`} className="text-[#9A7A4E]">{line.slice(i, j)}</span>);
      i = j;
      continue;
    }

    parts.push(line[i]);
    i++;
  }

  return parts;
}

export function CodeInspector({
  evidence,
  onClose,
}: CodeInspectorProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      requestAnimationFrame(() => lastFocused.current?.focus?.());
    };
  }, [onClose]);

  if (!evidence) return null;

  const language = detectLanguage(evidence.filePath);
  const lines = evidence.codeExcerpt ? evidence.codeExcerpt.split('\n') : [];
  const startLine = evidence.lineStart || 1;

  const handleCopyCode = () => {
    if (!evidence.codeExcerpt) return;
    navigator.clipboard.writeText(evidence.codeExcerpt);
    setCopied('code');
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyPath = () => {
    if (!evidence.filePath) return;
    navigator.clipboard.writeText(evidence.filePath);
    setCopied('path');
    setTimeout(() => setCopied(null), 2000);
  };

  const repoUrl = evidence.repoFullName
    ? `https://github.com/${evidence.repoFullName}`
    : null;
  const fileUrl = repoUrl && evidence.filePath
    ? `${repoUrl}/blob/${evidence.commitSha}/${evidence.filePath}`
    : null;

  const statusConfig = {
    demonstrated: {
      label: 'VERIFIED',
      icon: <Check className="w-3.5 h-3.5 shrink-0 text-[#2e5738]" />,
      border: 'border-[#2e5738]/50',
      text: 'text-[#2e5738]',
      bg: 'bg-[#2e5738]/10',
    },
    partial: {
      label: 'PARTIAL EVIDENCE',
      icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#854d0e]" />,
      border: 'border-[#854d0e]/50',
      text: 'text-[#854d0e]',
      bg: 'bg-[#854d0e]/10',
    },
    not_demonstrated: {
      label: 'INSUFFICIENT EVIDENCE',
      icon: <X className="w-3.5 h-3.5 shrink-0 text-[#5c554e]" />,
      border: 'border-[#5c554e]/50',
      text: 'text-[#5c554e]',
      bg: 'bg-[#5c554e]/10',
    },
  }[evidence.status] || {
    label: 'INSUFFICIENT EVIDENCE',
    icon: <X className="w-3.5 h-3.5 shrink-0 text-[#5c554e]" />,
    border: 'border-[#5c554e]/50',
    text: 'text-[#5c554e]',
    bg: 'bg-[#5c554e]/10',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clipboard-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-6 outline-none"
      tabIndex={-1}
    >
      {/* Translucent charcoal backdrop dimming the underlying page */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[61]"
        onClick={onClose}
      />

      {/* Clipboard backing board: deep walnut extending beyond paper */}
      <div
        className="relative z-[62] w-full max-w-[1150px] max-h-[90vh] overflow-hidden rounded-[30px] bg-[#423027] shadow-2xl flex flex-col"
        style={{
          boxShadow:
            '0 2px 10px rgba(0,0,0,0.45), 0 24px 64px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* Metallic clipboard clip centred at the top edge */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-[70]">
          <div className="w-24 h-2 rounded-full border border-zinc-400/60 bg-zinc-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
        </div>

        {/* Outer frame: thin inset border around paper sheet */}
        <div className="relative z-[63] border border-[#7A6654] bg-transparent p-2 rounded-[26px] flex flex-col h-full min-h-0">
          {/* Cream paper sheet */}
          <div className="relative flex flex-col h-full min-h-0 overflow-hidden border border-[#C5B9A5] bg-[#F5EFE3] rounded-[22px]">
            {/* Header */}
            <header className="relative px-8 py-6 border-b border-[#C5B9A5] bg-[#F5EFE3] flex flex-col gap-2 z-10">
              <div className="flex items-start justify-between gap-6">
                <div className="flex flex-col gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm border border-[#DD604C]/50 bg-[#DD604C]/12 text-[10px] font-mono font-bold uppercase tracking-wider text-[#DD604C]">
                    EVIDENCE / 01
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#4E4B44]">
                    EVIDENCE / CODE INSPECTION
                  </span>
                  <h2
                    id="clipboard-title"
                    className="font-editorial text-lg lg:text-xl font-bold text-[#252522] tracking-tight leading-snug"
                  >
                    {evidence.requirementTitle}
                  </h2>
                </div>

                <div className="flex items-start gap-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sm border text-[11px] font-mono font-bold uppercase tracking-wider leading-none shrink-0 ${statusConfig.border} ${statusConfig.text} ${statusConfig.bg}`}
                  >
                    {statusConfig.icon}
                    <span>{statusConfig.label}</span>
                  </span>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-sm hover:bg-[#D5D8D2] text-[#252522]/80 transition-colors focus-visible:ring-2 focus-visible:ring-[#252522] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5EFE3] cursor-pointer"
                    title="Close inspector (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </header>

            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Left metadata sidebar */}
              <aside className="flex-none w-[26%] max-w-[320px] border-r border-[#C5B9A5] bg-[#EDE3D2] p-6 overflow-y-auto min-h-0 flex flex-col gap-4">
                <div>
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                    File
                  </p>
                  <p className="text-sm font-mono text-[#252522] break-words leading-relaxed" title={evidence.filePath ?? ''}>
                    {evidence.filePath || 'No source file detected'}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#D5D8D2]">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                    Repository
                  </p>
                  <p className="text-sm font-mono text-[#252522] break-words leading-relaxed" title={evidence.repoFullName ?? ''}>
                    {evidence.repoFullName || '—'}
                  </p>
                </div>

                {evidence.lineStart && (
                  <div className="pt-2 border-t border-[#D5D8D2]">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                      Line Range
                    </p>
                    <p className="text-sm font-mono text-[#252522]">
                      :L{evidence.lineStart}-L{evidence.lineEnd}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-[#D5D8D2]">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                    Analyzed Commit
                  </p>
                  <p className="text-sm font-mono text-[#252522] truncate" title={evidence.commitSha}>
                    {evidence.commitSha.slice(0, 7)}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#D5D8D2]">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                    Verification Level
                  </p>
                  <p className="text-xs font-mono font-semibold text-[#252522]">
                    {formatVerificationLevel(evidence.verificationLevel)}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#D5D8D2]">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                    Confidence Score
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-mono font-bold text-[#252522]">
                      {evidence.confidence}%
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#C5B9A5] bg-[#F5EFE3] text-[#4E4B44] font-semibold">
                      {evidence.confidence >= 80 ? 'HIGH' : evidence.confidence >= 50 ? 'MODERATE' : 'LOW'}
                    </span>
                  </div>
                </div>

                {evidence.sourceRetrievalStatus && (
                  <div className="pt-2 border-t border-[#D5D8D2]">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                      Source Code Status
                    </p>
                    <p className="text-xs font-mono text-[#252522]">
                      {evidence.sourceRetrievalStatus === 'retrieved' && 'Retrieved from analyzed commit'}
                      {evidence.sourceRetrievalStatus === 'failed' && 'Retrieval failed'}
                      {evidence.sourceRetrievalStatus === 'missing_file' && 'File not present in tree'}
                      {evidence.sourceRetrievalStatus === 'not_attempted' && 'Inspection not attempted'}
                    </p>
                  </div>
                )}

                {language && (
                  <div className="pt-2 border-t border-[#D5D8D2]">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                      Language
                    </p>
                    <p className="text-sm font-mono text-[#252522]">{language}</p>
                  </div>
                )}
              </aside>

              {/* Main evidence document: explanation + diagnostic cards + code */}
              <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F5EFE3]">
                {/* Explanation and Diagnostic Breakdown */}
                <section className="p-6 border-b border-[#C5B9A5] overflow-y-auto bg-[#F5EFE3] max-h-[36vh] flex flex-col gap-3">
                  <div>
                    <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#4E4B44] mb-1">
                      EVIDENCE-LINKED FINDING
                    </p>
                    <p className="text-sm leading-relaxed text-[#252522] font-sans">
                      {evidence.explanation}
                    </p>
                  </div>

                  {/* 4 Structured Diagnostic Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                    {/* What was detected */}
                    <div className="rounded-md border border-[#C5B9A5] bg-[#EDE3D2]/70 p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44]">
                        <FileCode className="w-3 h-3 text-[#5B6A9C]" />
                        <span>What Was Detected</span>
                      </div>
                      <p className="text-xs text-[#252522] leading-relaxed font-sans">
                        {evidence.detectedWhat || (evidence.filePath ? `Discovered file ${evidence.filePath}` : 'No matching files or declarations discovered in repository.')}
                      </p>
                    </div>

                    {/* Supporting Evidence */}
                    <div className="rounded-md border border-[#C5B9A5] bg-[#EDE3D2]/70 p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44]">
                        <CheckCircle2 className="w-3 h-3 text-[#2e5738]" />
                        <span>Supporting Evidence</span>
                      </div>
                      <p className="text-xs text-[#252522] leading-relaxed font-sans">
                        {evidence.evidenceSupports || (evidence.status === 'demonstrated' ? 'Implementation verified with concrete declarations in repository tree.' : 'Partial or structural signals discovered without complete functional verification.')}
                      </p>
                    </div>

                    {/* What was not verified */}
                    <div className="rounded-md border border-[#C5B9A5] bg-[#EDE3D2]/70 p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44]">
                        <AlertTriangle className="w-3 h-3 text-[#854d0e]" />
                        <span>What Was Not Verified</span>
                      </div>
                      <p className="text-xs text-[#252522] leading-relaxed font-sans">
                        {evidence.notVerified || (evidence.status === 'demonstrated' ? 'No outstanding unverified verification requirements for this scope.' : 'Full requirement implementation not verified in analyzed tree.')}
                      </p>
                    </div>

                    {/* Confidence Basis */}
                    <div className="rounded-md border border-[#C5B9A5] bg-[#EDE3D2]/70 p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#4E4B44]">
                        <ShieldCheck className="w-3 h-3 text-[#5B6A9C]" />
                        <span>Confidence Basis ({evidence.confidence}%)</span>
                      </div>
                      <p className="text-xs text-[#252522] leading-relaxed font-sans">
                        {evidence.confidenceExplanation || `Calculated based on ${evidence.evidenceStrength || 'available'} ${evidence.evidenceType || 'repository'} evidence.`}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Code region */}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  {/* Source metadata bar: toolbar with own background + bottom border */}
                  <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#C5B9A5] bg-[#D5D8D2] flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#4E4B44]">
                      <FileCode className="w-3.5 h-3.5" />
                      <span className="font-semibold text-[#252522] truncate">
                        {evidence.filePath || 'No source file detected'}
                      </span>
                      {evidence.lineStart && (
                        <span className="text-[#4E4B44]">
                          :L{evidence.lineStart}-L{evidence.lineEnd}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {evidence.codeExcerpt && (
                        <button
                          onClick={handleCopyCode}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#C5B9A5] bg-[#F5EFE3] text-[11px] font-mono font-semibold text-[#252522] hover:bg-[#EDE3D2] transition-colors focus-visible:ring-2 focus-visible:ring-[#252522] disabled:opacity-40 disabled:cursor-not-allowed"
                          disabled={copied === 'code'}
                          title="Copy code"
                        >
                          {copied === 'code' ? (
                            <>
                              <Check className="w-3 h-3 text-[#426B4D]" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy code</span>
                            </>
                          )}
                        </button>
                      )}
                      {fileUrl && (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#C5B9A5] bg-[#F5EFE3] text-[11px] font-mono font-semibold text-[#252522] hover:bg-[#EDE3D2] transition-colors focus-visible:ring-2 focus-visible:ring-[#252522]"
                          title="Open on GitHub"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Open on GitHub</span>
                        </a>
                      )}
                      {evidence.filePath && (
                        <button
                          onClick={handleCopyPath}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#C5B9A5] bg-[#F5EFE3] text-[11px] font-mono font-semibold text-[#252522] hover:bg-[#EDE3D2] transition-colors focus-visible:ring-2 focus-visible:ring-[#252522] disabled:opacity-40 disabled:cursor-not-allowed"
                          disabled={copied === 'path'}
                          title="Copy file path"
                        >
                          <FileCode className="w-3 h-3" />
                          <span>Copy path</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Partial / Verified indicator banner */}
                  {lines.length > 0 && evidence.status === 'partial' && (
                    <div className="px-6 py-2 bg-[#854d0e]/10 border-b border-[#854d0e]/25 flex items-center gap-2 text-xs text-[#854d0e]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <strong>Partial Evidence:</strong> Displaying inspected source code from analyzed commit <span className="font-mono">{evidence.commitSha?.slice(0, 7)}</span>. The requirement was not fully verified in this file.
                      </span>
                    </div>
                  )}
                  {lines.length > 0 && evidence.status === 'demonstrated' && (
                    <div className="px-6 py-2 bg-[#2e5738]/10 border-b border-[#2e5738]/25 flex items-center gap-2 text-xs text-[#2e5738]">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <strong>Verified Excerpt:</strong> Retrieved from analyzed commit <span className="font-mono">{evidence.commitSha?.slice(0, 7)}</span>.
                      </span>
                    </div>
                  )}

                  {/* Framed code viewer */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-5 bg-[#E4E5E0] border border-[#A8AB9F] rounded-md">
                    {lines.length > 0 ? (
                      <div className="border-t border-[#C5B9A5] overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                          <tbody>
                            {lines.map((line, idx) => (
                              <tr key={idx} className="hover:bg-[#d7d8d0]/50 transition-colors">
                                <td className="pr-5 text-right align-top select-none text-[#4E4B44] text-[11px] w-9 font-mono bg-[#D9DAD2] font-semibold">
                                  {startLine + idx}
                                </td>
                                <td className="whitespace-pre break-all font-mono text-[12px] leading-relaxed text-[#252522]">
                                  {tokenizeLine(line)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-center rounded-md border border-dashed border-[#C5B9A5] bg-[#EDE3D2]/40 p-6">
                        {evidence.sourceRetrievalStatus === 'failed' || evidence.sourceRetrievalError ? (
                          <div className="flex flex-col items-center gap-2 max-w-md">
                            <AlertTriangle className="w-6 h-6 text-[#DD604C]" />
                            <h4 className="text-sm font-semibold text-[#252522]">Source Code Retrieval Failed</h4>
                            <p className="text-xs text-[#4E4B44] leading-relaxed">
                              {evidence.sourceRetrievalError || 'Unable to retrieve file contents from repository at the specified commit.'}
                            </p>
                            <p className="text-[11px] font-mono text-[#6E6B64]">
                              Commit: {evidence.commitSha?.slice(0, 7)} • File: {evidence.filePath || 'unknown'}
                            </p>
                            <p className="text-[11px] text-[#4E4B44] italic">
                              No fabricated code or unrelated excerpts are displayed.
                            </p>
                          </div>
                        ) : evidence.status === 'demonstrated' ? (
                          <div className="flex flex-col items-center gap-2 max-w-md">
                            <CheckCircle2 className="w-6 h-6 text-[#2e5738]" />
                            <h4 className="text-sm font-semibold text-[#252522]">Verified Implementation (Excerpt Render Unavailable)</h4>
                            <p className="text-xs text-[#4E4B44] leading-relaxed">
                              The requirement implementation was verified in repository tree analysis, but the specific code excerpt could not be rendered.
                            </p>
                            <p className="text-[11px] font-mono text-[#6E6B64]">
                              Confidence score of {evidence.confidence}% is preserved based on verified implementation.
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 max-w-md">
                            <FileCode className="w-6 h-6 text-[#6E6B64]" />
                            <h4 className="text-sm font-semibold text-[#252522]">No Code Excerpt Available</h4>
                            <p className="text-xs text-[#4E4B44] leading-relaxed">
                              This requirement was not demonstrated in the analyzed repository scope (commit <span className="font-mono">{evidence.commitSha?.slice(0, 7)}</span>).
                            </p>
                            {evidence.filePath ? (
                              <p className="text-[11px] text-[#6E6B64]">
                                Discovered path <span className="font-mono">{evidence.filePath}</span> did not satisfy implementation criteria.
                              </p>
                            ) : (
                              <p className="text-[11px] text-[#6E6B64]">
                                No corresponding source files were discovered in the repository tree.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </main>
            </div>

            {/* Bottom action bar */}
            <footer className="border-t border-[#C5B9A5] p-5 bg-[#EDE3D2] flex items-center gap-2.5 flex-wrap">
              <button
                onClick={handleCopyCode}
                disabled={!evidence.codeExcerpt}
                className="flex items-center gap-2 px-3.5 py-2 rounded border border-[#C5B9A5] bg-[#F5EFE3] text-[11px] font-mono font-semibold text-[#252522] hover:bg-[#EDE3D2] transition-colors focus-visible:ring-2 focus-visible:ring-[#252522] disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy code"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy code</span>
              </button>
              {evidence.filePath && (
                <button
                  onClick={handleCopyPath}
                  disabled={copied === 'path'}
                  className="flex items-center gap-2 px-3.5 py-2 rounded border border-[#C5B9A5] bg-[#F5EFE3] text-[11px] font-mono font-semibold text-[#252522] hover:bg-[#EDE3D2] transition-colors focus-visible:ring-2 focus-visible:ring-[#252522] disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Copy file path"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Copy path</span>
                </button>
              )}
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2 rounded border border-[#C5B9A5] bg-[#F5EFE3] text-[11px] font-mono font-semibold text-[#252522] hover:bg-[#EDE3D2] transition-colors focus-visible:ring-2 focus-visible:ring-[#252522]"
                  title="Open on GitHub"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open on GitHub</span>
                </a>
              )}
              <button
                onClick={onClose}
                className="flex items-center gap-2 px-3.5 py-2 rounded border border-[#C5B9A5] bg-[#252522] text-[11px] font-mono font-semibold text-white hover:bg-[#393732] transition-colors focus-visible:ring-2 focus-visible:ring-[#252522] ml-auto"
                title="Close inspector"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
