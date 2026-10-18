'use client';

import { useState } from 'react';
import { AssessmentVerificationSummary } from '@/lib/types';
import {
  Award,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Brain,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

interface VerificationSummaryBannerProps {
  summary: AssessmentVerificationSummary | null | undefined;
  onVerifyClick: (requirementId?: string) => void;
}

export function VerificationSummaryBanner({
  summary,
  onVerifyClick
}: VerificationSummaryBannerProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const total = summary?.totalRequirements || 0;
  const verifiedCount = summary?.verifiedCount || 0;
  const partialCount = summary?.partialCount || 0;
  const notYetVerifiedCount = summary?.notYetVerifiedCount ?? total;
  const records = summary?.records || [];

  const isAllNotYetVerified = verifiedCount === 0 && partialCount === 0;

  return (
    <section className="bg-[#211A16] border border-[#584638] rounded-xl p-6 shadow-sm relative overflow-hidden text-[#F5F0E5]">
      {/* Decorative Warm Banner Top Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#584638]/70">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#DD5946]/20 text-[#DD5946] border border-[#DD5946]/40">
              <Award className="w-3 h-3" />
              <span>Evidence-Based Developer Verification</span>
            </span>
            <span className="text-xs font-mono text-[#BDB0A2]">
              · Separate from Repository Scanning
            </span>
          </div>

          <h2 className="font-editorial text-2xl font-bold tracking-tight text-[#F5F0E5]">
            Practical Understanding & Reasoning Audit
          </h2>
          <p className="text-xs text-[#BDB0A2] font-sans max-w-3xl leading-relaxed">
            Repository scanning evaluates what exists in code, but cannot distinguish between AI-generated files and genuine developer understanding. This optional check assesses real problem-solving through bounded practical tasks, contract tests, and adaptive follow-up reasoning under declared conditions.
          </p>
        </div>

        <button
          onClick={() => onVerifyClick()}
          className="self-start lg:self-auto inline-flex items-center space-x-2 px-4 py-2.5 bg-white hover:bg-[#f4efe2] text-[#2B211B] text-xs font-mono font-bold rounded shadow-md border border-[#d5ccba] transition-all cursor-pointer"
        >
          <Brain className="w-4 h-4 text-[#2B211B]" />
          <span>Verify My Skills</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#2B211B]" />
        </button>
      </div>

      {/* Metric Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-5 font-mono text-xs">
        <div className="p-3.5 bg-[#17120E] border border-[#584638]/60 rounded">
          <div className="flex items-center justify-between text-[#BDB0A2] mb-1">
            <span className="uppercase text-[10px] font-bold">Understanding Verified</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-editorial font-bold text-emerald-400">
            {verifiedCount}
          </div>
          <span className="text-[10px] text-[#BDB0A2] font-sans mt-0.5 block">
            Passed practical tests & reasoned explanations
          </span>
        </div>

        <div className="p-3.5 bg-[#17120E] border border-[#584638]/60 rounded">
          <div className="flex items-center justify-between text-[#BDB0A2] mb-1">
            <span className="uppercase text-[10px] font-bold">Partial Verification</span>
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-editorial font-bold text-amber-400">
            {partialCount}
          </div>
          <span className="text-[10px] text-[#BDB0A2] font-sans mt-0.5 block">
            Code passed but reasoning criteria missing (or vice versa)
          </span>
        </div>

        <div className="p-3.5 bg-[#17120E] border border-[#584638]/60 rounded">
          <div className="flex items-center justify-between text-[#BDB0A2] mb-1">
            <span className="uppercase text-[10px] font-bold">Not Yet Verified</span>
            <AlertCircle className="w-3.5 h-3.5 text-[#BDB0A2]" />
          </div>
          <div className="text-2xl font-editorial font-bold text-[#F5F0E5]">
            {notYetVerifiedCount}
          </div>
          <span className="text-[10px] text-[#BDB0A2] font-sans mt-0.5 block">
            Repository evidence only; no practical check taken
          </span>
        </div>

        <div className="p-3.5 bg-[#17120E] border border-[#584638]/60 rounded flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[#BDB0A2] mb-1">
              <span className="uppercase text-[10px] font-bold">Verification State</span>
              <FileCheck className="w-3.5 h-3.5 text-[#DD5946]" />
            </div>
            <div className="text-sm font-editorial font-bold text-[#F5F0E5]">
              {isAllNotYetVerified
                ? 'Not yet verified'
                : `${verifiedCount} of ${total} verified`}
            </div>
          </div>
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="mt-2 text-[10px] uppercase font-bold text-[#BDB0A2] hover:text-[#F5F0E5] inline-flex items-center gap-1 cursor-pointer"
          >
            <span>{detailsOpen ? 'Hide Audit Criteria' : 'View Separate Dimensions'}</span>
            {detailsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Expandable Dimensions & Audit Details */}
      {detailsOpen && (
        <div className="mt-5 pt-5 border-t border-[#584638]/60 space-y-4 animate-fade-in text-xs font-sans">
          <div className="bg-[#17120E] border border-[#584638] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-editorial font-bold text-[#F5F0E5]">
              <ShieldAlert className="w-4 h-4 text-[#DD5946]" />
              <span>Independent Assessment Dimensions (WCAG / Bias Protected)</span>
            </div>
            <p className="text-[#BDB0A2] text-xs leading-relaxed">
              ProofLoop evaluates developer readiness across 6 distinct, independent dimensions. We never compute a single opaque percentage or assume missing evidence implies inability:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono pt-1">
              <div className="p-3 bg-[#211A16] border border-[#584638]/50 rounded">
                <span className="font-bold text-[#F5F0E5] block mb-1">1. Repository Evidence</span>
                <p className="text-[#BDB0A2] font-sans text-[11px]">
                  What the committed source code and automated tests in the repository actively demonstrate.
                </p>
              </div>

              <div className="p-3 bg-[#211A16] border border-[#584638]/50 rounded">
                <span className="font-bold text-[#F5F0E5] block mb-1">2. Practical Performance</span>
                <p className="text-[#BDB0A2] font-sans text-[11px]">
                  How the developer&apos;s solution handles real boundary conditions, contract preservation, and syntax.
                </p>
              </div>

              <div className="p-3 bg-[#211A16] border border-[#584638]/50 rounded">
                <span className="font-bold text-[#F5F0E5] block mb-1">3. Adaptive Reasoning</span>
                <p className="text-[#BDB0A2] font-sans text-[11px]">
                  How the developer justifies their architectural decisions and answers targeted edge-case questions.
                </p>
              </div>

              <div className="p-3 bg-[#211A16] border border-[#584638]/50 rounded">
                <span className="font-bold text-[#F5F0E5] block mb-1">4. Contribution History</span>
                <p className="text-[#BDB0A2] font-sans text-[11px]">
                  Commit frequency, author attribution certainty, and temporal development patterns.
                </p>
              </div>

              <div className="p-3 bg-[#211A16] border border-[#584638]/50 rounded">
                <span className="font-bold text-[#F5F0E5] block mb-1">5. Verification Integrity</span>
                <p className="text-[#BDB0A2] font-sans text-[11px]">
                  Explicitly declared assessment condition: AI-restricted independent vs AI-assisted with disclosure.
                </p>
              </div>

              <div className="p-3 bg-[#211A16] border border-[#584638]/50 rounded">
                <span className="font-bold text-[#F5F0E5] block mb-1">6. Limitations & Scope</span>
                <p className="text-[#BDB0A2] font-sans text-[11px]">
                  Explicit disclaimers regarding unmonitored conditions and bounded task boundaries.
                </p>
              </div>
            </div>
          </div>

          {/* List of Verified Records if any */}
          {records.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#BDB0A2] font-bold block">
                Completed Verification Records ({records.length})
              </span>
              <div className="space-y-2">
                {records.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3.5 bg-[#17120E] border border-[#584638] rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#F5F0E5] text-sm font-editorial">
                          {rec.requirementTitle}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                            rec.status === 'verified_demonstrated'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                              : rec.status === 'partial_verification'
                                ? 'bg-amber-950/80 text-amber-400 border border-amber-800'
                                : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          {rec.status === 'verified_demonstrated'
                            ? 'VERIFIED'
                            : rec.status === 'partial_verification'
                              ? 'PARTIAL'
                              : 'UNVERIFIED'}
                        </span>
                        <span className="text-[10px] font-mono text-[#BDB0A2]">
                          {rec.dimensions.verificationIntegrity.environmentIntegrity}
                        </span>
                      </div>
                      <p className="text-[#BDB0A2] text-xs mt-1">
                        {rec.overallVerdict}
                      </p>
                    </div>

                    <button
                      onClick={() => onVerifyClick(rec.requirementId)}
                      className="shrink-0 px-3 py-1.5 bg-[#211A16] hover:bg-[#30251F] text-[#F5F0E5] border border-[#584638] text-[11px] font-mono rounded font-semibold cursor-pointer"
                    >
                      Re-Assess / View
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
