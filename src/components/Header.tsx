'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Building2, CheckCircle2 } from 'lucide-react';
import { Assessment } from '@/lib/types';

interface HeaderProps {
  assessment: Assessment;
  onReassessed?: (updated: Assessment) => void;
  showReassess?: boolean;
}

export function Header({ assessment, onReassessed, showReassess = false }: HeaderProps) {
  const [isReassessing, setIsReassessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isSample = assessment.id.includes('sample');
  const isProfileAssessment = assessment.repository.fullName?.startsWith('profile/') || false;

  const handleManualReassessment = async () => {
    if (isProfileAssessment) {
      alert('Profile assessments combine multiple repositories. To update your evidence, run a fresh scan from the Onboard page.');
      return;
    }
    setIsReassessing(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/assessments/${assessment.id}/reassess`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.assessment) {
        setStatusMessage('Reassessment complete');
        if (onReassessed) onReassessed(data.assessment);
        setTimeout(() => setStatusMessage(null), 3500);
      } else {
        alert(data.error || 'Failed to trigger reassessment');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error triggering reassessment';
      alert(message);
    } finally {
      setIsReassessing(false);
    }
  };

  return (
    <header className="border-b border-[#584638] bg-[#211A16]/90 backdrop-blur-md sticky top-0 z-30 px-8 py-5">
      {isSample && (
        <div className="mb-3 px-3 py-1.5 bg-[#30251F] border border-[#584638] text-[11px] font-mono text-[#BDB0A2] rounded flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-bold uppercase tracking-wider text-white px-1.5 py-0.5 bg-[#DD5946] rounded">
              Sample Exploration Mode
            </span>
            <span>
              This is realistic illustrative data from Stripe Backend Engineering. To run your live data, click &quot;New Assessment&quot;.
            </span>
          </div>
          <Link href="/onboard" className="underline font-semibold hover:text-[#DD5946]">
            Run Live Analysis →
          </Link>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-[#BDB0A2] mb-1">
            <Building2 className="w-3.5 h-3.5" />
            <span className="font-semibold text-[#F5F0E5] uppercase tracking-wider">
              {assessment.internship.company}
            </span>
            {isProfileAssessment && (
              <span className="ml-2 px-2 py-0.5 bg-[#30251F] border border-[#584638] text-[10px] text-sky-400 rounded">
                Profile Scan ({assessment.repository.fullName.replace(/^profile\//, '')})
              </span>
            )}
          </div>

          <h1 className="font-editorial text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">
            {assessment.internship.title}
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          {statusMessage && (
            <span className="text-xs font-mono text-emerald-400 font-semibold flex items-center space-x-1 animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{statusMessage}</span>
            </span>
          )}

          {showReassess && (
            isProfileAssessment ? (
              <div className="relative group">
                <button
                  type="button"
                  disabled
                  className="flex items-center space-x-2 px-3.5 py-2 border border-[#584638] bg-[#30251F]/40 text-xs font-mono rounded font-medium text-[#BDB0A2] opacity-60 cursor-not-allowed"
                  title="Profile assessments combine multiple repos. To update, run a fresh scan from Onboard."
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reassess Scope</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleManualReassessment}
                disabled={isReassessing}
                className="flex items-center space-x-2 px-3.5 py-2 border border-[#584638] bg-[#30251F] hover:bg-[#3A2D26] text-xs font-mono rounded font-medium text-[#F5F0E5] transition-colors disabled:opacity-50"
                title="Re-run assessment against repository code"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReassessing ? 'animate-spin' : ''}`} />
                <span>{isReassessing ? 'Reassessing...' : 'Reassess Scope'}</span>
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
}
