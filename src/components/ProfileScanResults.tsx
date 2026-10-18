'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { ProfileScanRecord, RepositoryEvidence } from '@/lib/types';

interface ProfileScanResultsProps {
  scan: ProfileScanRecord;
  onReset: () => void;
}

export function ProfileScanResults({ scan, onReset }: ProfileScanResultsProps) {
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({});

  const toggleSkill = (id: string) => {
    setExpandedSkills((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const strongMatches = scan.bestEvidence.filter((e) => e.status === 'demonstrated');
  const partialMatches = scan.bestEvidence.filter((e) => e.status === 'partial');
  const notFound = scan.bestEvidence.filter((e) => e.status === 'not_demonstrated');

  const renderSkillRow = (ev: RepositoryEvidence, groupColor: string) => {
    const isExpanded = expandedSkills[ev.requirementId] || false;
    const cleanRepo = ev.repoFullName ? ev.repoFullName.replace(/^profile\//, '') : '';
    const hasFile = Boolean(ev.filePath);
    const githubFileUrl = hasFile && cleanRepo
      ? `https://github.com/${cleanRepo}/blob/HEAD/${ev.filePath}${ev.lineStart ? `#L${ev.lineStart}` : ''}`
      : undefined;

    return (
      <div
        key={ev.requirementId}
        className="p-3 bg-[#211A16] border border-[#584638] rounded text-xs transition-colors"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${groupColor}`} />
            <span className="font-bold text-[#F5F0E5] truncate">{ev.requirementTitle}</span>
            <span className="text-[#BDB0A2] text-[11px] truncate">
              {ev.status !== 'not_demonstrated' ? `• found in ${cleanRepo}` : '• not found in scanned repos'}
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {githubFileUrl && (
              <a
                href={githubFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-[11px] font-mono text-sky-400 hover:text-sky-300"
              >
                <span>View on GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {hasFile && (
              <button
                onClick={() => toggleSkill(ev.requirementId)}
                className="inline-flex items-center space-x-1 text-[11px] font-mono text-[#BDB0A2] hover:text-[#F5F0E5] cursor-pointer"
              >
                <span>{isExpanded ? 'Hide' : 'Details'}</span>
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>

        {ev.status === 'not_demonstrated' && (
          <div className="mt-1.5 text-[11px] text-[#BDB0A2] font-sans">
            <span className="font-semibold text-amber-400">What to build:</span> Add code or tests showing {ev.requirementTitle.toLowerCase()} in a repository.
          </div>
        )}

        {isExpanded && hasFile && (
          <div className="mt-2.5 pt-2 border-t border-[#584638]/60 space-y-1.5 text-[11px] font-mono text-[#BDB0A2]">
            <div className="truncate">
              File: <span className="text-[#F5F0E5]">{ev.filePath}</span>
              {ev.lineStart ? ` (lines ${ev.lineStart}-${ev.lineEnd || ev.lineStart})` : ''}
            </div>
            {ev.codeExcerpt && (
              <pre className="p-2 bg-[#1A1412] border border-[#584638]/40 rounded text-[10px] text-[#E0D8D0] overflow-x-auto whitespace-pre-wrap font-mono">
                {ev.codeExcerpt}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#584638]">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs uppercase font-bold tracking-wider text-[#BDB0A2]">
              Profile Scan Complete
            </span>
            {scan.isPartial && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Partial (90s limit)
              </span>
            )}
          </div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F0E5]">
            Best Evidence for @{scan.username}
          </h2>
          <p className="text-xs text-[#BDB0A2] font-sans mt-1">
            Scanned {scan.scannedRepos.length} public repositories and compiled the strongest proof for each skill.
          </p>
        </div>

        {scan.assessmentId && (
          <Link
            href={`/dashboard?id=${encodeURIComponent(scan.assessmentId)}`}
            className="inline-flex items-center space-x-2 px-5 py-2.5 bg-white hover:bg-[#f4efe2] text-[#2B211B] text-xs font-bold rounded shadow-sm border border-[#d5ccba] transition-colors shrink-0"
          >
            <span>Open Full Dashboard & Roadmap</span>
            <ArrowRight className="w-4 h-4 text-[#2B211B]" />
          </Link>
        )}
      </div>

      {/* Skills Grouped: Strong / Partial / Not found */}
      <div className="space-y-6">
        {/* Strong Matches */}
        <div className="space-y-2.5">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="font-editorial text-lg font-bold text-[#F5F0E5]">
              Strong Match ({strongMatches.length})
            </h3>
          </div>
          {strongMatches.length === 0 ? (
            <p className="text-xs text-[#BDB0A2] italic pl-6">No skills fully demonstrated yet.</p>
          ) : (
            <div className="space-y-2">{strongMatches.map((ev) => renderSkillRow(ev, 'bg-emerald-400'))}</div>
          )}
        </div>

        {/* Partial Evidence */}
        <div className="space-y-2.5">
          <div className="flex items-center space-x-2">
            <CircleDashed className="w-4 h-4 text-sky-400" />
            <h3 className="font-editorial text-lg font-bold text-[#F5F0E5]">
              Partial Evidence ({partialMatches.length})
            </h3>
          </div>
          {partialMatches.length === 0 ? (
            <p className="text-xs text-[#BDB0A2] italic pl-6">No partial skills.</p>
          ) : (
            <div className="space-y-2">{partialMatches.map((ev) => renderSkillRow(ev, 'bg-sky-400'))}</div>
          )}
        </div>

        {/* Not Found Yet */}
        <div className="space-y-2.5">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-[#BDB0A2]" />
            <h3 className="font-editorial text-lg font-bold text-[#F5F0E5]">
              Not Found Yet ({notFound.length})
            </h3>
          </div>
          {notFound.length === 0 ? (
            <p className="text-xs text-[#BDB0A2] italic pl-6">All target skills demonstrated across your repositories!</p>
          ) : (
            <div className="space-y-2">{notFound.map((ev) => renderSkillRow(ev, 'bg-zinc-500'))}</div>
          )}
        </div>
      </div>

      {/* FEATURE 2: Other roles that fit you */}
      {scan.suggestedRoles && scan.suggestedRoles.length > 0 && (
        <div className="p-6 bg-[#211A16] border border-[#584638] rounded space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#584638]">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="font-editorial text-xl font-bold text-[#F5F0E5]">
                Other Roles That Fit You
              </h3>
            </div>
            <span className="text-[11px] text-[#BDB0A2] font-mono">
              AI suggestions. Does not affect your score.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {scan.suggestedRoles.map((role, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-[#30251F] border border-[#584638] rounded space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#F5F0E5]">{role.title}</span>
                  <a
                    href={role.searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 text-[11px] font-bold text-sky-400 hover:text-sky-300"
                  >
                    <span>Search jobs</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <p className="text-xs text-[#BDB0A2] font-sans leading-relaxed">
                  {role.reason}
                </p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {role.matchedSkills.map((skill, sIdx) => (
                    <span
                      key={sIdx}
                      className="px-2 py-0.5 rounded text-[10px] bg-[#211A16] text-emerald-400 border border-emerald-500/20"
                    >
                      ✓ {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#584638]">
        <button
          onClick={onReset}
          className="text-xs text-[#BDB0A2] hover:text-[#F5F0E5] underline cursor-pointer"
        >
          ← Scan another profile or repository
        </button>

        {scan.assessmentId && (
          <Link
            href={`/dashboard?id=${encodeURIComponent(scan.assessmentId)}`}
            className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-[#f4efe2] text-[#2B211B] text-xs font-bold rounded flex items-center justify-center space-x-2 border border-[#d5ccba] transition-colors cursor-pointer"
          >
            <span>Open Full Dashboard & Roadmap</span>
            <ArrowRight className="w-4 h-4 text-[#2B211B]" />
          </Link>
        )}
      </div>
    </div>
  );
}
