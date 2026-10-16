'use client';

import { useSyncExternalStore } from 'react';
import { FileCode, CheckCircle, AlertCircle, CircleDashed, Paperclip } from 'lucide-react';
import { RepositoryEvidence } from '@/lib/types';

interface SkillCardProps {
  evidence: RepositoryEvidence;
  onInspect: (evidence: RepositoryEvidence) => void;
  index?: number;
}

const VARIANTS = [
  'torn-corner',
  'ruled-note',
  'clipped-doc',
  'layered-card',
  'red-underline',
  'sticker-card',
] as const;

const STATUS_LABELS: Record<string, string> = {
  demonstrated: 'DEMONSTRATED',
  partial: 'PARTIAL EVIDENCE',
  not_demonstrated: 'NOT YET DEMONSTRATED',
};

const ANNOTATIONS: Record<string, string> = {
  demonstrated: 'Evidence found',
  partial: 'Review this',
  not_demonstrated: 'More proof needed',
};

function categoryLabel(title: string): string {
  return (title.split(/\s+/)[0] || 'REQUIREMENT').toUpperCase().slice(0, 14);
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (subscribe) => {
      const mq = window.matchMedia(query);
      const handler = () => subscribe();
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function SkillCard({ evidence, onInspect, index = 0 }: SkillCardProps) {
  const isDemonstrated = evidence.status === 'demonstrated';
  const isPartial = evidence.status === 'partial';
  const isNotDemonstrated = evidence.status === 'not_demonstrated';

  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const isMobile = useMedia('(max-width: 767px)');
  const variant = VARIANTS[index % VARIANTS.length];
  // Keep rotations subtle so side-by-side cards never collide.
  const rotate = reducedMotion || isMobile ? 0 : ((index % 3) - 1) * 0.5;

  const annotation = ANNOTATIONS[evidence.status];

  return (
    <div
      className={`skill-card relative align-self-stretch rounded-2xl border deckle-border p-5 min-w-0 min-h-0 transition-all duration-300`}
      style={{
        backgroundColor: 'var(--scrapbook-paper)',
        backgroundImage:
          variant === 'ruled-note'
            ? 'repeating-linear-gradient(transparent, transparent 27px, rgba(190, 180, 165, 0.45) 28px)'
            : 'linear-gradient(rgba(70, 50, 30, 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(70, 50, 30, 0.045) 1px, transparent 1px)',
        backgroundSize:
          variant === 'ruled-note' ? '100% 28px' : '20px 20px',
        borderColor: 'rgba(195, 185, 168, 0.7)',
        transform: `rotate(${rotate}deg)`,
        boxShadow:
          variant === 'layered-card'
            ? '0 1px 2px rgba(0,0,0,0.06), 0 12px 30px -6px rgba(0,0,0,0.22), 0 24px 50px -12px rgba(0,0,0,0.30)'
            : '0 1px 2px rgba(0,0,0,0.06), 0 10px 24px -5px rgba(0,0,0,0.12), 0 18px 36px -10px rgba(0,0,0,0.18)',
      }}
    >
      {/* Top band: category sticker + status stamp side by side */}
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider leading-none shrink-0"
          style={{
            backgroundColor: 'rgba(217, 72, 52, 0.92)',
            borderColor: 'rgba(160, 40, 28, 0.55)',
            color: '#ffffff',
          }}
          title={categoryLabel(evidence.requirementTitle)}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white/70 block shrink-0" />
          <span>{`${String(index + 1).padStart(2, '0')} / ${categoryLabel(evidence.requirementTitle)}`}</span>
        </span>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono font-bold uppercase tracking-wider leading-none shrink-0 ${
            isDemonstrated
              ? 'border-[#166534]/50 text-[#166534] bg-[#166534]/10'
              : isPartial
                ? 'border-[#92400e]/50 text-[#92400e] bg-[#92400e]/10'
                : 'border-[#71717a]/50 text-[#71717a] bg-transparent'
          }`}
        >
          {isDemonstrated && <CheckCircle className="w-3 h-3 shrink-0 text-[#166534]" />}
          {isPartial && <CircleDashed className="w-3 h-3 shrink-0 text-[#92400e]" />}
          {isNotDemonstrated && <AlertCircle className="w-3 h-3 shrink-0 text-[#71717a]" />}
          <span>{STATUS_LABELS[evidence.status]}</span>
        </span>

        {annotation && (
          <span
            className="font-handwriting text-xs text-[var(--scrapbook-pencil)] italic opacity-70 select-none mt-[0.25rem] lg:mt-0 shrink-0"
            aria-hidden="true"
          >
            “{annotation}”
          </span>
        )}
      </div>

      {variant === 'clipped-doc' && (
        <Paperclip
          className="absolute top-4 right-4 z-10 text-[var(--scrapbook-pencil-light)] opacity-50"
          style={{ transform: 'rotate(6deg)' }}
          width={16}
          height={16}
        />
      )}

      <div className="flex flex-col h-full pt-2 pb-8 relative z-10">
        <h3
          className="font-editorial text-base lg:text-lg font-bold text-zinc-900 leading-snug tracking-tight mb-1"
          style={{ letterSpacing: '-0.015em' }}
        >
          {evidence.requirementTitle}
        </h3>

        {/* Red underline accent for red-underline variant */}
        {variant === 'red-underline' && (
          <span className="mt-1 h-0.5 w-16 rounded-full opacity-60" style={{ backgroundColor: 'var(--scrapbook-red-muted)' }} />
        )}

        {/* Explanation */}
        <p className="mt-2 text-sm leading-relaxed text-zinc-800/90 font-sans">
          {evidence.explanation}
        </p>

        {/* Evidence reference strip (bottom, pushed by mt-auto) */}
        {evidence.filePath ? (
          <button
            onClick={() => onInspect(evidence)}
            className="mt-auto pt-5 flex items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-[#39332a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#211F1A] active:scale-[0.995]"
            style={{
              backgroundColor: '#292929',
              borderColor: '#46413A',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileCode className="w-4 h-4 shrink-0 text-[#DDD5C8]" />
              <div className="min-w-0">
                <span
                  className="block text-xs font-mono text-[#F5F0E6] truncate"
                  title={evidence.filePath}
                >
                  {evidence.filePath}
                </span>
                {evidence.lineStart && (
                  <span className="block text-[11px] font-mono text-[#B9B1A5] mt-0.5">
                    :L{evidence.lineStart}-L{evidence.lineEnd}{' · '}
                    {evidence.commitSha.slice(0, 7)}
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 text-[11px] font-mono text-[#FFFFFF]">Inspect code ↗</span>
          </button>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed p-3 text-left">
            <p className="text-xs font-mono text-zinc-600 mb-2">
              No supporting code files found in analyzed scope.
            </p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider text-[#DD5946] border border-[#DD5946]/40 bg-[#DD5946]/10">
              Gap Identified
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
