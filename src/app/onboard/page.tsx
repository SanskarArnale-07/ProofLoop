'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Globe,
  Sparkles
} from 'lucide-react';
import { GithubIcon } from '@/components/GithubIcon';
import { InternshipPosting } from '@/lib/types';
import { AnalysisTransition } from '@/components/AnalysisTransition';

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Internship
  const [jobUrl, setJobUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [manualFallbackOpen, setManualFallbackOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualText, setManualText] = useState('');
  const [internshipData, setInternshipData] = useState<InternshipPosting | null>(null);

interface VerifiedRepoDetails {
  fullName?: string;
  defaultBranch?: string;
  latestCommitSha?: string;
  latestCommitMessage?: string;
  url?: string;
  html_url?: string;
  [key: string]: unknown;
}

  // Step 2: GitHub
  const [repoInput, setRepoInput] = useState('');
  const [isVerifyingRepo, setIsVerifyingRepo] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoDetails, setRepoDetails] = useState<VerifiedRepoDetails | null>(null);

  // Step 3: Analysis Transition
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(1);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Presets for instant realistic testing
  const presets = [
    {
      title: 'Stripe — Backend Engineering Intern',
      company: 'Stripe',
      url: 'https://stripe.com/jobs/listing/backend-engineering-intern',
      desc: 'Building payment infrastructure, REST APIs, idempotency handlers, PostgreSQL migrations, and automated test suites.'
    },
    {
      title: 'Vercel — Frontend Infrastructure Intern',
      company: 'Vercel',
      url: 'https://vercel.com/careers/frontend-infra-intern',
      desc: 'Next.js App Router, React Server Components, TypeScript static analysis, automated CI testing, and UI performance.'
    },
    {
      title: 'Datadog — Systems & Cloud Intern',
      company: 'Datadog',
      url: 'https://careers.datadoghq.com/detail/cloud-systems-intern',
      desc: 'Docker containers, distributed tracing, backend services in Go/TypeScript, CI/CD pipeline automation, and git workflows.'
    }
  ];

  const handleApplyPreset = (preset: typeof presets[0]) => {
    setJobUrl(preset.url);
    setManualTitle(preset.title);
    setManualCompany(preset.company);
    setManualText(preset.desc);
    setExtractError(null);
  };

  const handleExtractJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExtracting(true);
    setExtractError(null);

    try {
      const res = await fetch('/api/internships/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: jobUrl.trim(),
          manualText: manualText ? manualText.trim() : undefined,
          manualTitle: manualTitle ? manualTitle.trim() : undefined,
          manualCompany: manualCompany ? manualCompany.trim() : undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setExtractError(data.error || 'Failed to extract requirements from posting URL.');
        if (data.suggestManualFallback) {
          setManualFallbackOpen(true);
        }
      } else {
        setInternshipData(data.posting);
        setStep(2);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error extracting posting.';
      setExtractError(message);
      setManualFallbackOpen(true);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleVerifyRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingRepo(true);
    setRepoError(null);

    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoInput.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setRepoError(data.error || 'Failed to verify GitHub repository.');
      } else {
        setRepoDetails(data.repo);
        setStep(3);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error communicating with GitHub validation API.';
      setRepoError(message);
    } finally {
      setIsVerifyingRepo(false);
    }
  };

  const handleBackToStep3 = () => {
    setIsAnalyzing(false);
    setAnalysisError(null);
    setStep(3);
  };

  const handleStartAnalysis = async () => {
    if (isSubmitting || (isAnalyzing && !analysisError)) return;
    if (!internshipData || !repoDetails) return;

    setIsSubmitting(true);
    setIsAnalyzing(true);
    setAnalysisStage(1);
    setAnalysisError(null);

    const stage2Timer = setTimeout(() => {
      setAnalysisStage(prev => (prev === 1 ? 2 : prev));
    }, 1200);

    try {
      const targetRepoUrl =
        (typeof repoDetails.url === 'string' && repoDetails.url.trim()) ||
        (typeof repoDetails.html_url === 'string' && repoDetails.html_url.trim()) ||
        repoInput.trim();

      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internship: internshipData,
          repoUrl: targetRepoUrl
        })
      });

      let data: { success?: boolean; assessmentId?: string; error?: string; message?: string } | null = null;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        clearTimeout(stage2Timer);
        const errMsg =
          data?.error ||
          data?.message ||
          (text && text.length < 300 ? text : `Server returned HTTP ${res.status}: ${res.statusText || 'Analysis request failed'}`);
        setAnalysisError(errMsg);
        return;
      }

      if (!data || !data.success || !data.assessmentId || typeof data.assessmentId !== 'string') {
        clearTimeout(stage2Timer);
        const errMsg = data?.error || 'Server response did not include a valid assessment ID.';
        setAnalysisError(errMsg);
        return;
      }

      clearTimeout(stage2Timer);
      setAnalysisStage(3);

      const targetId = encodeURIComponent(data.assessmentId.trim());
      setTimeout(() => {
        router.push(`/dashboard?id=${targetId}`);
      }, 800);
    } catch (err: unknown) {
      clearTimeout(stage2Timer);
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected network failure or timeout during repository analysis.';
      setAnalysisError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-[#30251F] flex items-center justify-center">
        <AnalysisTransition
          currentStage={analysisStage}
          error={analysisError}
          onRetry={handleStartAnalysis}
          onBack={handleBackToStep3}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#30251F] text-[#F5F0E5] flex flex-col justify-between font-mono">
      {/* Top Header */}
      <header className="border-b border-[#584638] bg-[#211A16]/90 backdrop-blur-md px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xs font-bold tracking-tighter uppercase px-2 py-0.5 bg-white text-[#2B211B] rounded-xs shadow-xs">
              PROOF&lt;LOOP&gt;
            </span>
            <span className="font-editorial text-lg font-bold tracking-tight text-[#F5F0E5] hidden sm:inline">
              ProofLoop
            </span>
          </Link>

          {/* Progress Indicator */}
          <div className="flex items-center space-x-3 text-xs text-[#BDB0A2]">
            <span className={step >= 1 ? 'text-[#F5F0E5] font-bold' : ''}>
              1. Job Posting
            </span>
            <span>→</span>
            <span className={step >= 2 ? 'text-[#F5F0E5] font-bold' : ''}>
              2. GitHub Repository
            </span>
            <span>→</span>
            <span className={step >= 3 ? 'text-[#F5F0E5] font-bold' : ''}>
              3. Scope & Analyze
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-6 py-12 flex-1 w-full">
        {/* STEP 1: INTERNSHIP POSTING */}
        {step === 1 && (
          <div className="space-y-8 animate-fade-in">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#BDB0A2] block mb-2 font-semibold">
                Step 1 of 3
              </span>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[#F5F0E5]">
                Where are you applying?
              </h1>
              <p className="text-xs text-[#BDB0A2] font-sans mt-2 leading-relaxed">
                Provide a real job or internship posting URL. We fetch the page server-side, preserve the source URL,
                and extract the technical requirements you&apos;ll need to demonstrate in code.
              </p>
            </div>

            {/* Presets */}
            <div className="p-4 bg-[#211A16] border border-[#584638] rounded">
              <span className="text-[11px] uppercase font-bold text-[#BDB0A2] block mb-2">
                Quick Real-World Presets (Click to Auto-Fill)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {presets.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="p-2.5 text-left bg-[#30251F] border border-[#584638] hover:border-[#F5F0E5] rounded transition-colors text-xs cursor-pointer"
                  >
                    <span className="font-bold text-[#F5F0E5] block truncate">
                      {p.company}
                    </span>
                    <span className="text-[11px] text-[#BDB0A2] truncate block">
                      {p.title.split('—')[1]?.trim() || p.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleExtractJob} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#BDB0A2] mb-1">
                  Internship Posting URL
                </label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <Globe className="w-4 h-4 absolute left-3 top-3 text-[#BDB0A2]" />
                    <input
                      type="url"
                      value={jobUrl}
                      onChange={(e) => setJobUrl(e.target.value)}
                      placeholder="https://jobs.lever.co/company/internship-id..."
                      required={!manualFallbackOpen}
                      className="w-full pl-9 pr-3 py-2.5 bg-[#211A16] border border-[#584638] rounded text-xs font-mono text-[#F5F0E5] placeholder:text-[#BDB0A2]/60 focus:outline-hidden focus:border-[#DD5946]"
                    />
                  </div>
                </div>
              </div>

              {extractError && (
                <div className="p-4 bg-[#211A16] border border-red-500/60 rounded space-y-2">
                  <div className="flex items-center space-x-2 text-[#F5F0E5] font-bold text-xs">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>Inaccessible or Protected Job Page</span>
                  </div>
                  <p className="text-xs text-[#BDB0A2] font-sans">
                    {extractError} We never fabricate job descriptions. Please paste the job description text below.
                  </p>
                </div>
              )}

              {/* Manual fallback toggler */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setManualFallbackOpen(!manualFallbackOpen)}
                  className="text-xs text-[#BDB0A2] underline hover:text-[#F5F0E5] cursor-pointer"
                >
                  {manualFallbackOpen ? 'Hide Manual Requirements Entry' : 'Job behind login wall or paywall? Enter or paste text manually →'}
                </button>
              </div>

              {manualFallbackOpen && (
                <div className="p-4 bg-[#211A16] border border-[#584638] rounded space-y-3 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase font-bold text-[#BDB0A2] mb-1">
                        Role Title
                      </label>
                      <input
                        type="text"
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="e.g. Backend Engineering Intern"
                        className="w-full px-3 py-2 bg-[#30251F] border border-[#584638] rounded text-xs text-[#F5F0E5] placeholder:text-[#BDB0A2]/60"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase font-bold text-[#BDB0A2] mb-1">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={manualCompany}
                        onChange={(e) => setManualCompany(e.target.value)}
                        placeholder="e.g. Stripe, Vercel, Datadog"
                        className="w-full px-3 py-2 bg-[#30251F] border border-[#584638] rounded text-xs text-[#F5F0E5] placeholder:text-[#BDB0A2]/60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-[#BDB0A2] mb-1">
                      Job Description & Requirements Text
                    </label>
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      rows={5}
                      placeholder="Paste the requirements section here (API, SQL, Docker, testing, etc.)..."
                      className="w-full px-3 py-2 bg-[#30251F] border border-[#584638] rounded text-xs font-mono text-[#F5F0E5] placeholder:text-[#BDB0A2]/60"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isExtracting}
                  className="px-6 py-3 bg-white hover:bg-[#f4efe2] text-[#2B211B] font-mono text-xs font-bold rounded flex items-center space-x-2 border border-[#d5ccba] disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  <span className="text-[#2B211B] font-bold">{isExtracting ? 'Extracting Requirements...' : 'Continue to GitHub Setup'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#2B211B]" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 2: GITHUB REPOSITORY */}
        {step === 2 && internshipData && (
          <div className="space-y-8 animate-fade-in">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center space-x-1 text-xs text-[#BDB0A2] hover:text-[#F5F0E5] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#BDB0A2]" />
              <span>Back to Step 1</span>
            </button>

            <div>
              <span className="text-xs uppercase tracking-widest text-[#BDB0A2] block mb-2 font-semibold">
                Step 2 of 3
              </span>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[#F5F0E5]">
                Connect your code evidence
              </h1>
              <p className="text-xs text-[#BDB0A2] font-sans mt-2 leading-relaxed">
                Provide a public GitHub repository URL or repository identifier (e.g., <code className="font-mono bg-[#211A16] px-1 py-0.5 rounded text-[#F5F0E5]">owner/repo</code>).
                ProofLoop validates that the repository is accessible and checks commit history before analysis.
              </p>
            </div>

            {/* Extracted Requirements Preview */}
            <div className="p-4 bg-[#211A16] border border-[#584638] rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#F5F0E5]">
                  {internshipData.company} — {internshipData.title}
                </span>
                <span className="text-[11px] text-[#BDB0A2]">
                  {internshipData.requirements.length} Requirements Extracted
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {internshipData.requirements.map(req => (
                  <span
                    key={req.id}
                    className="px-2 py-0.5 bg-[#30251F] border border-[#584638] rounded text-[10px] text-[#F5F0E5]"
                  >
                    {req.title}
                  </span>
                ))}
              </div>
            </div>

            {/* Repo Input Form */}
            <form onSubmit={handleVerifyRepo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#BDB0A2] mb-1">
                  Public GitHub Repository URL
                </label>
                <div className="relative">
                  <GithubIcon className="w-4 h-4 absolute left-3 top-3 text-[#BDB0A2]" />
                  <input
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="https://github.com/alexchen/payment-orchestrator or alexchen/payment-orchestrator"
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-[#211A16] border border-[#584638] rounded text-xs font-mono text-[#F5F0E5] placeholder:text-[#BDB0A2]/60 focus:outline-hidden focus:border-[#DD5946]"
                  />
                </div>
              </div>

              {/* Sample repos for instant demonstration */}
              <div className="text-[11px] text-[#BDB0A2] space-y-1">
                <span className="font-bold text-[#F5F0E5]">Quick Test Repositories:</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRepoInput('alexchen/payment-orchestrator')}
                    className="px-2.5 py-1 bg-[#211A16] hover:bg-[#3d3028] text-[#F5F0E5] border border-[#584638] rounded text-[10px] cursor-pointer transition-colors"
                  >
                    alexchen/payment-orchestrator (Sample Backend)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepoInput('vercel/next.js')}
                    className="px-2.5 py-1 bg-[#211A16] hover:bg-[#3d3028] text-[#F5F0E5] border border-[#584638] rounded text-[10px] cursor-pointer transition-colors"
                  >
                    vercel/next.js (Public Open Source)
                  </button>
                </div>
              </div>

              {repoError && (
                <div className="p-3 bg-[#211A16] border border-red-500/60 rounded flex items-center space-x-2 text-xs text-[#F5F0E5]">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{repoError}</span>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isVerifyingRepo}
                  className="px-6 py-3 bg-white hover:bg-[#f4efe2] text-[#2B211B] font-mono text-xs font-bold rounded flex items-center space-x-2 border border-[#d5ccba] disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  <span className="text-[#2B211B] font-bold">{isVerifyingRepo ? 'Verifying GitHub Access...' : 'Review Scope & Analyze'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#2B211B]" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: SCOPE REVIEW & ANALYZE */}
        {step === 3 && internshipData && repoDetails && (
          <div className="space-y-8 animate-fade-in">
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center space-x-1 text-xs text-[#BDB0A2] hover:text-[#F5F0E5] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#BDB0A2]" />
              <span>Back to Step 2</span>
            </button>

            <div>
              <span className="text-xs uppercase tracking-widest text-[#BDB0A2] block mb-2 font-semibold">
                Step 3 of 3
              </span>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[#F5F0E5]">
                Confirm scope & run assessment
              </h1>
              <p className="text-xs text-[#BDB0A2] font-sans mt-2 leading-relaxed">
                Review the selected internship and verified repository. ProofLoop will scan the repository tree,
                evaluate candidate evidence, and compute demonstrated skills and evidence gaps.
              </p>
            </div>

            {/* Scope Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-5 bg-[#211A16] border border-[#584638] rounded space-y-2">
                <span className="text-[10px] uppercase text-[#BDB0A2] font-bold block">
                  Target Internship
                </span>
                <div className="font-bold text-sm text-[#F5F0E5]">
                  {internshipData.title}
                </div>
                <div className="text-[#BDB0A2]">
                  Company: <span className="text-[#F5F0E5] font-semibold">{internshipData.company}</span>
                </div>
                <div className="text-[#BDB0A2] truncate text-[11px]">
                  Source: {internshipData.sourceUrl}
                </div>
                <div className="pt-2 text-[11px] text-[#BDB0A2]">
                  {internshipData.requirements.length} requirements queued for matching.
                </div>
              </div>

              <div className="p-5 bg-[#211A16] border border-[#584638] rounded space-y-2">
                <span className="text-[10px] uppercase text-[#BDB0A2] font-bold block">
                  Verified Repository
                </span>
                <div className="font-bold text-sm text-[#F5F0E5]">
                  {repoDetails.fullName}
                </div>
                <div className="text-[#BDB0A2]">
                  Branch: <span className="text-[#F5F0E5] font-semibold">{repoDetails.defaultBranch}</span>
                </div>
                <div className="text-[#BDB0A2] text-[11px]">
                  Commit: <span className="font-bold text-[#F5F0E5]">{repoDetails.latestCommitSha}</span> ({repoDetails.latestCommitMessage})
                </div>
                <div className="pt-2 text-emerald-400 text-[11px] flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Access verified & ready for scan</span>
                </div>
              </div>
            </div>

            {analysisError && (
              <div className="p-4 bg-[#211A16] border border-red-500/60 rounded flex items-center justify-between text-xs text-[#F5F0E5]">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Previous attempt failed: {analysisError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAnalysisError(null)}
                  className="text-[10px] uppercase font-bold text-[#BDB0A2] hover:text-[#F5F0E5] cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Run Button */}
            <div className="pt-4 flex items-center justify-between border-t border-[#584638]">
              <span className="text-xs text-[#BDB0A2] font-sans">
                Evidence results will be persisted and monitored for commit updates.
              </span>

              <button
                type="button"
                disabled={isSubmitting || isAnalyzing}
                onClick={handleStartAnalysis}
                className="px-8 py-3.5 bg-white hover:bg-[#f4efe2] text-[#2B211B] font-mono text-xs font-bold rounded flex items-center space-x-2 shadow-md transition-all border border-[#d5ccba] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#2B211B]" />
                <span className="text-[#2B211B] font-bold">{isSubmitting || isAnalyzing ? 'Starting Assessment...' : 'Start Evidence Assessment'}</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
