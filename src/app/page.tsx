'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  GitCommit,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Radio,
  GitBranch,
  FolderTree,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  ArrowUpRight,
  Code2,
  User,
  Check
} from 'lucide-react';
import {
  PencilArrow,
  PencilCircle,
  PencilUnderline,
  BrassPaperclip,
  RubberStamp,
  NotebookSpiralRings,
  WashiTape
} from '@/components/scrapbook/Doodles';

export default function ScrapbookLandingPage() {
  // Interactive Webhook Simulation state for Chapter 3
  const [webhookSimulated, setWebhookSimulated] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Active section tracking for floating editorial table-of-contents
  const [activeChapter, setActiveChapter] = useState('cover');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 250;
      const sections = ['cover', 'resume', 'evidence', 'matching', 'cta'];
      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveChapter(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSimulatePush = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setWebhookSimulated(true);
      setIsSimulating(false);
    }, 1200);
  };

  const handleResetSimulation = () => {
    setWebhookSimulated(false);
  };

  return (
    <div className="min-h-screen bg-[#30251F] text-[#F5F0E5] selection:bg-[#DD5946] selection:text-[#29251F] relative overflow-x-hidden font-sans">
      {/* Editorial Floating Masthead / Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#09090c]/85 border-b border-zinc-800/80 px-6 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <span className="font-mono text-xs font-bold tracking-wider px-2 py-0.5 bg-[#d94834] text-white rounded-xs uppercase shadow-xs">
              PROOF&lt;LOOP&gt;
            </span>
            <span className="font-editorial text-lg tracking-tight font-medium text-zinc-300 hidden sm:inline">
              Engineering Dossier
            </span>
            <span className="text-zinc-600 font-mono text-xs hidden md:inline">•</span>
            <span className="font-mono text-[11px] text-zinc-400 hidden md:inline">
              Problem W-PS-2
            </span>
          </div>

          {/* Quick jump chapter tabs */}
          <nav className="hidden lg:flex items-center space-x-6 text-xs font-mono text-zinc-400">
            {[
              { id: 'cover', label: '00 Cover' },
              { id: 'resume', label: '01 Résumé' },
              { id: 'evidence', label: '02 GitHub Evidence' },
              { id: 'matching', label: '03 Requirements' },
              { id: 'cta', label: '04 Prove Fit' },
            ].map((tab) => (
              <a
                key={tab.id}
                href={`#${tab.id}`}
                className={`transition-colors hover:text-white ${
                  activeChapter === tab.id
                    ? 'text-[#d94834] font-bold underline decoration-1 underline-offset-4'
                    : 'text-zinc-400'
                }`}
              >
                {tab.label}
              </a>
            ))}
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard?id=sample-assessment-stripe"
              className="text-xs font-mono text-zinc-400 hover:text-zinc-100 transition-colors hidden sm:inline-flex items-center space-x-1 px-2.5 py-1.5 rounded hover:bg-zinc-800/60"
            >
              <span>Explore Sample</span>
            </Link>
            <Link
              href="/onboard"
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 bg-[#d94834] hover:bg-[#c63d2a] text-white text-xs font-mono font-medium rounded-xs shadow-sm transition-all"
            >
              <span>Check Internship Fit</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* =========================================================================
          CHAPTER 0: NOTEBOOK COVER (The Physical Notebook Opening)
          ========================================================================= */}
      <section
        id="cover"
        className="relative min-h-[92vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 lg:py-20 bg-dark-canvas"
      >
        {/* Subtle decorative desk items in the background */}
        <div className="absolute top-10 left-8 text-zinc-700/40 font-mono text-[11px] select-none pointer-events-none hidden lg:block">
          ARCHIVE REF: PL-2026-WPS2 // REVISION 04
        </div>
        <div className="absolute bottom-10 right-8 text-zinc-700/40 font-mono text-[11px] select-none pointer-events-none hidden lg:block">
          SURFACE: 300GSM WARM VELIN • SPIRAL BOUND
        </div>

        {/* The Physical Notebook Artifact */}
        <div className="relative w-full max-w-5xl mx-auto">
          {/* Outer binding edge shadow & red edge trim */}
          <div className="absolute -inset-2 bg-gradient-to-r from-zinc-950 via-[#d94834]/80 to-zinc-950 rounded-xl blur-xs opacity-60" />

          {/* The Notebook Body */}
          <div className="relative bg-[#fbf7ee] text-zinc-900 rounded-lg paper-shadow-lg border border-[#e3dac9] overflow-hidden">
            {/* Red / Coral outer binding edge band on left */}
            <div className="absolute left-0 top-0 bottom-0 w-3 bg-[#d94834]" />

            {/* Notebook Spiral Wire Coil Rings */}
            <NotebookSpiralRings count={22} />

            {/* Washi tape on top corner */}
            <WashiTape
              className="top-3 right-12"
              width="90px"
              color="coral"
              rotate={-3}
            />

            {/* Notebook Page Content Area with fine graph paper background */}
            <div className="bg-cream-paper pl-12 sm:pl-16 pr-6 sm:pr-12 py-10 sm:py-16 relative">
              {/* Top Editorial Metadata Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-8 border-b border-[#e2dbcb]/90">
                <div className="flex items-center space-x-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#d94834] animate-pulse" />
                  <span className="font-mono text-xs font-bold tracking-widest uppercase text-zinc-800">
                    AI CAREER COACH · PROBLEM W-PS-2
                  </span>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="font-mono text-[11px] text-zinc-500 uppercase tracking-wider">
                    FIELD DOSSIER · VOL. 01
                  </span>
                  <RubberStamp text="AUDIT GRADE" rotate={-4} />
                </div>
              </div>

              {/* Main Headline & Notebook Typography */}
              <div className="pt-10 pb-8 max-w-3xl space-y-6">
                <div className="inline-block relative">
                  <span className="font-handwriting text-2xl sm:text-3xl text-[#d94834] block -rotate-2 select-none">
                    the engineering proof standard
                  </span>
                </div>

                <h1 className="font-editorial text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-zinc-950 leading-[1.05]">
                  Don&apos;t just claim it. <br />
                  <span className="relative inline-block italic font-normal text-zinc-950 text-5xl sm:text-7xl lg:text-8xl pt-1">
                    Prove it.
                    <PencilUnderline className="absolute -bottom-3 left-0 w-full" />
                  </span>
                </h1>

                <p className="font-sans text-base sm:text-lg text-zinc-700 leading-relaxed max-w-2xl pt-4">
                  Your code is your evidence. Turn what you&apos;ve built into skills you can demonstrate.
                  ProofLoop matches real internship requirements against actual code in your GitHub repositories
                  and automatically updates your assessment as you push new commits.
                </p>
              </div>

              {/* Notebook Actions: Primary Buttons & Quick Badges */}
              <div className="pt-4 pb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Link
                  href="/onboard"
                  className="inline-flex items-center justify-center space-x-2.5 px-6 py-3.5 bg-zinc-950 hover:bg-zinc-800 text-white font-mono text-xs font-bold uppercase tracking-wider rounded transition-all shadow-md group"
                >
                  <span>Check My Internship Fit</span>
                  <ArrowRight className="w-4 h-4 text-[#d94834] group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link
                  href="/dashboard?id=sample-assessment-stripe"
                  className="inline-flex items-center justify-center space-x-2 px-5 py-3.5 bg-white hover:bg-[#f4efe2] text-zinc-900 border border-[#d5ccba] font-mono text-xs font-semibold uppercase tracking-wider rounded transition-all shadow-xs"
                >
                  <span>Explore Sample Mode</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                </Link>

                <div className="sm:ml-auto flex items-center space-x-2 text-xs font-mono text-zinc-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Verified Reassessment Engine</span>
                </div>
              </div>

              {/* Handcrafted Bottom Grid & Scroll Cue */}
              <div className="pt-8 mt-6 border-t border-[#e2dbcb] grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono text-xs text-zinc-600">
                <div className="space-y-1">
                  <div className="text-zinc-950 font-bold text-xs flex items-center space-x-1.5">
                    <span className="text-[#d94834]">§ 01</span>
                    <span>Real Job Postings</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 font-sans leading-relaxed">
                    Live URL ingestion with server-side extraction and SSRF protection.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-zinc-950 font-bold text-xs flex items-center space-x-1.5">
                    <span className="text-[#d94834]">§ 02</span>
                    <span>Line-Level Citations</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 font-sans leading-relaxed">
                    Exact file paths, AST handlers, and git SHAs backing every skill claim.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-zinc-950 font-bold text-xs flex items-center space-x-1.5">
                    <span className="text-[#d94834]">§ 03</span>
                    <span>Push Webhooks</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 font-sans leading-relaxed">
                    Closed loop reassessment with cryptographic HMAC SHA-256 verification.
                  </p>
                </div>
              </div>

              {/* Hand-drawn Scroll Prompt Arrow */}
              <div className="pt-10 flex items-center justify-center">
                <a
                  href="#resume"
                  className="group flex flex-col items-center space-y-1 text-zinc-600 hover:text-zinc-950 transition-colors"
                >
                  <span className="font-handwriting text-xl text-[#d94834] group-hover:scale-105 transition-transform">
                    Scroll down to open Chapter 01 ↓
                  </span>
                  <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-400">
                    UNPACK THE DOSSIER
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          CHAPTER 1: RÉSUMÉ PAGE (The Candidate Dossier & The Editorial Question)
          ========================================================================= */}
      <section
        id="resume"
        className="relative py-20 lg:py-32 px-4 sm:px-6 lg:px-8 bg-[#0e0e12] border-t border-zinc-800/80"
      >
        <div className="max-w-6xl mx-auto">
          {/* Chapter Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div>
              <div className="inline-flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-[#d94834] mb-2">
                <span>Chapter 01</span>
                <span>•</span>
                <span>The Traditional Résumé</span>
              </div>
              <h2 className="font-editorial text-3xl sm:text-5xl font-bold tracking-tight text-zinc-100">
                You&apos;ve listed your skills. <br />
                <span className="italic font-normal text-zinc-300">Can your code prove them?</span>
              </h2>
            </div>
            <p className="font-mono text-xs text-zinc-400 max-w-md leading-relaxed">
              Every résumé claims proficiency. Recruiters read lists of buzzwords, but engineering teams
              need concrete proof in production code.
            </p>
          </div>

          {/* Handcrafted Résumé Sheet & Margin Notes Container */}
          <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* The Physical Résumé Document (Spans 8 cols on desktop) */}
            <div className="lg:col-span-8 relative">
              {/* Brass Paperclip clipping sample tag */}
              <BrassPaperclip className="absolute -top-6 left-12 w-8 h-20 z-30" />

              {/* Ripped Washi Tape */}
              <WashiTape className="-top-3 right-8" width="100px" color="cream" rotate={2} />

              <div className="bg-[#fcf9f2] text-zinc-900 rounded-sm paper-shadow-lg border border-[#e0d6c2] p-6 sm:p-10 font-sans relative">
                {/* Sample Stamp watermark */}
                <div className="absolute top-6 right-6">
                  <RubberStamp text="SAMPLE CANDIDATE" subtext="ALEX CHEN // DOSSIER" rotate={6} />
                </div>

                {/* Candidate Header */}
                <div className="border-b border-[#e5decb] pb-6 mb-6">
                  <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest mb-1">
                    Applicant Profile
                  </div>
                  <h3 className="font-editorial text-2xl sm:text-3xl font-bold text-zinc-950">
                    Alex Chen
                  </h3>
                  <p className="font-mono text-xs text-zinc-600 mt-1">
                    B.S. Computer Science • Focus on Distributed Systems &amp; Backend Engineering
                  </p>
                  <div className="flex flex-wrap gap-4 text-[11px] font-mono text-zinc-500 mt-3">
                    <span>github.com/alexchen-dev</span>
                    <span>•</span>
                    <span>chen.alex@sample-dev.io</span>
                    <span>•</span>
                    <span>San Francisco, CA</span>
                  </div>
                </div>

                {/* Résumé Skills Section with Red Annotations */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-950 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-[#d94834] rounded-xs" />
                      <span>Technical Skills (Self-Reported Claims)</span>
                    </h4>
                    <span className="text-[10px] font-mono text-zinc-500">
                      Standard Résumé Self-Rating
                    </span>
                  </div>

                  <div className="space-y-4 font-mono text-xs">
                    {/* Skill 1: API Development */}
                    <div className="p-3 bg-white border border-[#e5decb] rounded-xs relative group hover:border-[#d94834] transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-zinc-900 text-sm">1. API Development</span>
                        <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 text-[10px] font-semibold border border-zinc-200">
                          Claimed: Advanced
                        </span>
                      </div>
                      <p className="text-[11px] font-sans text-zinc-600">
                        {'"Proficient in REST APIs, idempotent POST pipelines, HTTP RFC status conventions, and token auth."'}
                      </p>
                      {/* Red handwritten margin arrow badge */}
                      <div className="mt-2 text-[10px] text-[#d94834] font-mono flex items-center space-x-1.5 pt-1.5 border-t border-[#f0ebd9]">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="font-bold">Code Check:</span>
                        <span>Found in repo `pay-vault/src/routes/payments.ts:L34-58`</span>
                      </div>
                    </div>

                    {/* Skill 2: SQL */}
                    <div className="p-3 bg-white border border-[#e5decb] rounded-xs relative group hover:border-[#d94834] transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-zinc-900 text-sm">2. SQL &amp; Relational DBs</span>
                        <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 text-[10px] font-semibold border border-zinc-200">
                          Claimed: Proficient
                        </span>
                      </div>
                      <p className="text-[11px] font-sans text-zinc-600">
                        {'"Designed relational schemas, foreign keys, compound indexes, and database migration routines."'}
                      </p>
                      <div className="mt-2 text-[10px] text-[#d94834] font-mono flex items-center space-x-1.5 pt-1.5 border-t border-[#f0ebd9]">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="font-bold">Code Check:</span>
                        <span>Verified in `db/migrations/001_init.sql`</span>
                      </div>
                    </div>

                    {/* Skill 3: Automated Testing (The Gap!) */}
                    <div className="p-3 bg-white border-2 border-dashed border-[#d94834] rounded-xs relative group">
                      <PencilCircle className="absolute -top-3 right-6 w-36 h-12 pointer-events-none hidden sm:block" />
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-zinc-900 text-sm">3. Automated Testing</span>
                          <span className="px-1.5 py-0.2 bg-[#d94834]/15 text-[#d94834] text-[9px] font-bold uppercase rounded-xs">
                            Gap Identified!
                          </span>
                        </div>
                        <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 text-[10px] font-semibold border border-zinc-200">
                          Claimed: 90% Confidence
                        </span>
                      </div>
                      <p className="text-[11px] font-sans text-zinc-600">
                        {'"Experience writing comprehensive unit and integration suites with high code coverage."'}
                      </p>
                      <div className="mt-2 text-[10px] text-[#d94834] font-mono flex items-center space-x-1.5 pt-1.5 border-t border-[#f0ebd9]">
                        <AlertCircle className="w-3.5 h-3.5 text-[#d94834]" />
                        <span className="font-bold">Repo Audit:</span>
                        <span>0 test files detected in repository! No Jest or Supertest specs found.</span>
                      </div>
                    </div>

                    {/* Skill 4: Deployment */}
                    <div className="p-3 bg-white border border-[#e5decb] rounded-xs relative group">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-zinc-900 text-sm">4. Deployment &amp; CI/CD</span>
                        <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 text-[10px] font-semibold border border-zinc-200">
                          Claimed: Intermediate
                        </span>
                      </div>
                      <p className="text-[11px] font-sans text-zinc-600">
                        {'"Configured container builds and automated GitHub workflows for continuous integration."'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Selected Projects */}
                <div>
                  <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-950 mb-3 flex items-center space-x-2">
                    <span className="w-2 h-2 bg-zinc-400 rounded-xs" />
                    <span>Selected Projects</span>
                  </h4>
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 bg-white/70 border border-[#e5decb] rounded-xs">
                      <div className="flex justify-between font-bold text-zinc-900">
                        <span>pay-vault: Transactional Idempotency Gateway</span>
                        <span className="text-[10px] text-zinc-500">TypeScript / Postgres</span>
                      </div>
                      <p className="text-[11px] font-sans text-zinc-600 mt-1">
                        High-throughput payment orchestration engine with idempotency keys and webhook dispatch.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hand-drawn Editorial Margin Notes & Commentary Column (4 cols) */}
            <div className="lg:col-span-4 space-y-6 pt-4 lg:pt-8 relative">
              {/* Note 1: The Handwritten Callout Card */}
              <div
                className="bg-[#fbf7ee] text-zinc-900 p-6 rounded-sm paper-shadow-lg border border-[#e2dbcb] relative transform rotate-1 hover:rotate-0 transition-transform duration-300"
              >
                <WashiTape className="-top-3 left-1/3" width="70px" color="coral" rotate={-2} />
                <span className="font-handwriting text-2xl text-[#d94834] leading-snug block mb-3">
                  &quot;You&apos;ve listed your skills.
                  <br />
                  Can your code prove them?&quot;
                </span>
                <p className="font-mono text-xs text-zinc-700 leading-relaxed">
                  Anyone can list &quot;Automated Testing&quot; or &quot;API Development&quot; on a resume. ProofLoop connects
                  directly to your repositories and scans for syntactic evidence: actual test runners,
                  assertions, and route handlers.
                </p>
                <div className="mt-4 pt-3 border-t border-[#e2dbcb] flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>AUDITOR NOTE // DOSSIER</span>
                  <span className="text-[#d94834] font-bold">1 GAP FOUND</span>
                </div>
              </div>

              {/* Hand-drawn Pencil Arrow connecting the note across */}
              <div className="hidden lg:block absolute -left-8 top-44 w-28 h-16 pointer-events-none">
                <PencilArrow className="w-full h-full text-[#d94834]" />
              </div>

              {/* Note 2: Hand-drawn pencil diagram box */}
              <div className="bg-[#121217] border border-zinc-800 p-5 rounded-sm font-mono text-xs space-y-3 text-zinc-300">
                <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-800 pb-2">
                  <span className="uppercase tracking-wider text-[10px]">Verification Verdict</span>
                  <span className="text-[#d94834]">§ 1.3 AUDIT</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">API Development:</span>
                    <span className="text-emerald-400 font-bold">100% Demonstrated</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">SQL Database Design:</span>
                    <span className="text-emerald-400 font-bold">100% Demonstrated</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-800/80 pt-1">
                    <span className="text-zinc-400">Automated Testing:</span>
                    <span className="text-[#d94834] font-bold">0% (Evidence Gap)</span>
                  </div>
                </div>
                <p className="font-sans text-[11px] text-zinc-400 pt-1 leading-normal">
                  ProofLoop converts this missing evidence into an actionable <strong>Gap-to-Proof Roadmap Task</strong>.
                </p>
              </div>

              {/* Handcrafted Scroll Cue */}
              <div className="p-4 border border-dashed border-zinc-700 rounded-sm text-center font-mono text-xs text-zinc-400">
                <span className="block text-[11px] text-zinc-300 font-bold mb-1">
                  Ready to see the raw repository evidence?
                </span>
                <a
                  href="#evidence"
                  className="inline-flex items-center space-x-1 text-[#d94834] hover:underline"
                >
                  <span>Unfold Chapter 02: GitHub Evidence →</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          CHAPTER 2: GITHUB EVIDENCE (The Dark Scrapbook Canvas)
          ========================================================================= */}
      <section
        id="evidence"
        className="relative py-24 lg:py-36 px-4 sm:px-6 lg:px-8 bg-[#09090c] border-t border-zinc-800"
      >
        <div className="max-w-7xl mx-auto">
          {/* Chapter Title & Story Moment */}
          <div className="max-w-3xl mb-16 space-y-4">
            <div className="inline-flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-[#d94834]">
              <span>Chapter 02</span>
              <span>•</span>
              <span>The Ground Truth</span>
            </div>
            <h2 className="font-editorial text-4xl sm:text-6xl font-bold tracking-tight text-zinc-100 leading-tight">
              Your code tells a different story.
            </h2>
            <p className="font-sans text-base sm:text-lg text-zinc-400 leading-relaxed">
              No buzzwords, no keyword stuffing. ProofLoop assembles a dark scrapbook of raw repository artifacts:
              syntax trees, route declarations, database schemas, and git diffs.
            </p>
          </div>

          {/* The Scrapbook Canvas: Dynamic composition of 5 tilted, overlapping evidence cards */}
          <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-6 items-start">
            
            {/* EVIDENCE CARD 1: GitHub Profile (Rotated -3deg) */}
            <div className="lg:col-span-5 transform -rotate-2 hover:rotate-0 hover:z-40 transition-all duration-300">
              <div className="bg-[#121216] border border-zinc-700/80 rounded-lg paper-shadow-dark p-5 relative overflow-hidden group">
                <WashiTape className="-top-3 left-8" width="80px" color="coral" rotate={-2} />
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800 text-xs font-mono">
                  <div className="flex items-center space-x-2 text-zinc-300">
                    <User className="w-4 h-4 text-[#d94834]" />
                    <span className="font-bold">github.com/alexchen-dev</span>
                  </div>
                  <span className="px-1.5 py-0.5 bg-zinc-800 text-[10px] text-zinc-400 uppercase rounded">
                    Evidence #01
                  </span>
                </div>

                <div className="py-4 flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#d94834] to-amber-500 flex items-center justify-center text-white font-mono font-bold text-lg shadow-md shrink-0">
                    AC
                  </div>
                  <div className="space-y-1">
                    <div className="font-editorial font-bold text-lg text-zinc-100">
                      Alex Chen
                    </div>
                    <div className="font-mono text-xs text-zinc-400">
                      @alexchen-dev • 18 Public Repositories
                    </div>
                    <p className="font-sans text-[11px] text-zinc-500 leading-tight">
                      Systems, microservices, and reliable payment flows in TS/Go.
                    </p>
                  </div>
                </div>

                {/* Micro Contribution Grid */}
                <div className="pt-2 border-t border-zinc-800/80">
                  <div className="flex justify-between text-[10px] font-mono text-zinc-500 mb-1.5">
                    <span>948 Contributions in 2026</span>
                    <span className="text-emerald-400 font-semibold">Active Streak</span>
                  </div>
                  <div className="grid grid-cols-16 gap-1">
                    {Array.from({ length: 48 }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-2.5 rounded-xs ${
                          idx % 7 === 0
                            ? 'bg-emerald-400'
                            : idx % 4 === 0
                            ? 'bg-emerald-600'
                            : idx % 3 === 0
                            ? 'bg-emerald-900'
                            : 'bg-zinc-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Handcrafted annotation tag */}
                <div className="mt-3 pt-2 text-[10px] font-mono text-zinc-400 flex items-center justify-between border-t border-zinc-800/60">
                  <span className="text-amber-400">Auditor Note:</span>
                  <span>Commit frequency high; repo content requires AST audit</span>
                </div>
              </div>
            </div>

            {/* EVIDENCE CARD 2: Repository Overview (Rotated +2.5deg) */}
            <div className="lg:col-span-7 transform rotate-2 hover:rotate-0 hover:z-40 transition-all duration-300">
              <div className="bg-[#fbf7ee] text-zinc-900 border border-[#e2dbcb] rounded-lg paper-shadow-lg p-6 relative overflow-hidden">
                <BrassPaperclip className="absolute -top-5 right-12 w-7 h-16 z-30" />
                <div className="flex items-center justify-between pb-3 border-b border-[#e2dbcb] text-xs font-mono">
                  <div className="flex items-center space-x-2 text-zinc-800 font-bold">
                    <Code2 className="w-4 h-4 text-[#d94834]" />
                    <span>alexchen-dev / pay-vault</span>
                    <span className="px-1.5 py-0.2 bg-[#d94834]/10 text-[#d94834] text-[9px] uppercase rounded">
                      Target Repo
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-zinc-500 text-[11px]">
                    <span className="flex items-center space-x-1">
                      <GitBranch className="w-3 h-3" />
                      <span>main</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <GitCommit className="w-3 h-3 text-[#d94834]" />
                      <span className="font-bold">9e41b2c</span>
                    </span>
                  </div>
                </div>

                <div className="py-4 space-y-2">
                  <p className="font-sans text-xs text-zinc-700 leading-relaxed">
                    <strong>Repository Description:</strong> Resilient payment processing engine with strict idempotency
                    keys, Stripe webhook verification, and Postgres relational ledger.
                  </p>

                  {/* Languages Distribution Bar */}
                  <div className="pt-2">
                    <div className="flex justify-between text-[10px] font-mono text-zinc-600 mb-1">
                      <span>TypeScript 78.4%</span>
                      <span>SQL 15.2%</span>
                      <span>Shell 6.4%</span>
                    </div>
                    <div className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden flex">
                      <div className="bg-blue-600 h-full w-[78%]" />
                      <div className="bg-amber-600 h-full w-[15%]" />
                      <div className="bg-emerald-600 h-full w-[7%]" />
                    </div>
                  </div>
                </div>

                {/* Hand-drawn note */}
                <div className="bg-white/80 p-2.5 rounded border border-[#e2dbcb] font-mono text-[11px] text-zinc-800 flex items-center justify-between">
                  <span className="text-[#d94834] font-bold">✓ Repo Match:</span>
                  <span>Directly targets Stripe Backend Engineering requirements</span>
                </div>
              </div>
            </div>

            {/* EVIDENCE CARD 3: AST File Tree (Rotated -1.8deg) */}
            <div className="lg:col-span-5 transform -rotate-1 hover:rotate-0 hover:z-40 transition-all duration-300">
              <div className="bg-[#121217] border border-zinc-700/80 rounded-lg paper-shadow-dark p-5 font-mono text-xs text-zinc-300 relative">
                <WashiTape className="-top-3 right-10" width="75px" color="cream" rotate={1} />
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800 text-[11px] text-zinc-400">
                  <div className="flex items-center space-x-2">
                    <FolderTree className="w-3.5 h-3.5 text-[#d94834]" />
                    <span className="font-bold uppercase tracking-wider text-zinc-200">
                      AST File Tree Scan
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400">Scanned 34 Files</span>
                </div>

                <div className="py-3 space-y-1.5 text-[11px]">
                  <div className="text-zinc-500">pay-vault/</div>
                  <div className="pl-4 text-zinc-400">├── src/</div>
                  <div className="pl-8 text-zinc-300">├── routes/</div>
                  <div className="pl-12 flex items-center justify-between text-zinc-100 bg-zinc-800/50 p-1 rounded">
                    <div className="flex items-center space-x-1.5 truncate">
                      <FileCode className="w-3.5 h-3.5 text-[#d94834]" />
                      <span className="font-bold">payments.ts</span>
                    </div>
                    <span className="text-[9px] px-1 bg-emerald-500/20 text-emerald-400 uppercase font-bold rounded">
                      REST Proof
                    </span>
                  </div>
                  <div className="pl-12 flex items-center justify-between text-zinc-300 p-1">
                    <div className="flex items-center space-x-1.5 truncate">
                      <FileCode className="w-3.5 h-3.5 text-zinc-400" />
                      <span>webhooks.ts</span>
                    </div>
                    <span className="text-[9px] text-zinc-500">HMAC Check</span>
                  </div>
                  <div className="pl-8 text-zinc-300">├── db/migrations/</div>
                  <div className="pl-12 flex items-center justify-between text-zinc-100 bg-zinc-800/50 p-1 rounded">
                    <div className="flex items-center space-x-1.5 truncate">
                      <FileCode className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-bold">001_init.sql</span>
                    </div>
                    <span className="text-[9px] px-1 bg-amber-500/20 text-amber-400 uppercase font-bold rounded">
                      SQL Proof
                    </span>
                  </div>
                  <div className="pl-4 flex items-center justify-between text-[#d94834] bg-[#d94834]/10 p-1.5 rounded border border-dashed border-[#d94834]/40">
                    <div className="flex items-center space-x-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="font-bold">tests/ (Empty Directory)</span>
                    </div>
                    <span className="text-[9px] font-bold uppercase">GAP DETECTED</span>
                  </div>
                </div>

                <div className="pt-2 text-[10px] text-zinc-500 border-t border-zinc-800 flex items-center justify-between">
                  <span>PARSER: TypeScript AST Compiler</span>
                  <span className="text-zinc-400">AST Nodes: 1,842</span>
                </div>
              </div>
            </div>

            {/* EVIDENCE CARD 4: Source-Code Excerpt (Rotated +3.5deg) */}
            <div className="lg:col-span-7 transform rotate-2 hover:rotate-0 hover:z-40 transition-all duration-300">
              <div className="bg-[#0e0e12] border border-zinc-700 rounded-lg paper-shadow-dark p-5 relative font-mono text-xs">
                <WashiTape className="-top-3 left-10" width="90px" color="coral" rotate={-3} />
                
                {/* Editor Header */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    <span className="text-zinc-300 font-bold ml-2">
                      src/routes/payments.ts : L34-L58
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase">Line-Level Citation</span>
                </div>

                {/* Syntax-Highlighted Code Excerpt */}
                <div className="py-4 overflow-x-auto text-[11px] leading-relaxed">
                  <pre className="text-zinc-300">
                    <code>
                      <span className="text-zinc-600 select-none">34 </span>
                      <span className="text-purple-400">export async function</span>{' '}
                      <span className="text-blue-400">handlePaymentCharge</span>(req: Request, res: Response) {'{'}
                      {'\n'}
                      <span className="text-zinc-600 select-none">35 </span>  
                      <span className="text-purple-400">const</span> idempotencyKey = req.headers[{`'idempotency-key'`}];
                      {'\n'}
                      <span className="text-zinc-600 select-none">36 </span>  
                      <span className="text-purple-400">if</span> (!idempotencyKey) {'{'}
                      {'\n'}
                      <span className="text-zinc-600 select-none">37 </span>    
                      <span className="text-purple-400">return</span> res.status(<span className="text-amber-300">400</span>).json({'{'} error: {`'Missing Idempotency-Key header'`} {'}'});
                      {'\n'}
                      <span className="text-zinc-600 select-none">38 </span>  {'}'}
                      {'\n'}
                      <span className="text-zinc-600 select-none">39 </span>  
                      <span className="text-zinc-500">{'// Check database for previous execution of this key'}</span>
                      {'\n'}
                      <span className="text-zinc-600 select-none">40 </span>  
                      <span className="text-purple-400">const</span> cached = <span className="text-purple-400">await</span> db.charges.findByKey(idempotencyKey);
                      {'\n'}
                      <span className="text-zinc-600 select-none">41 </span>  
                      <span className="text-purple-400">if</span> (cached) {'{'}
                      {'\n'}
                      <span className="text-zinc-600 select-none">42 </span>    
                      <span className="text-purple-400">return</span> res.status(cached.statusCode).json(cached.body);
                      {'\n'}
                      <span className="text-zinc-600 select-none">43 </span>  {'}'}
                    </code>
                  </pre>
                </div>

                {/* Handcrafted Red Margin Flag */}
                <div className="bg-[#d94834]/15 border-l-2 border-[#d94834] p-2.5 rounded-r text-[10px] text-zinc-300 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Line 42: Verified RFC 7807 Idempotency contract mapping</span>
                  </div>
                  <span className="text-[#d94834] font-bold">MATCHED 100%</span>
                </div>
              </div>
            </div>

            {/* EVIDENCE CARD 5: Commit & Diff Card (Rotated -2.2deg) */}
            <div className="lg:col-span-12 transform -rotate-1 hover:rotate-0 hover:z-40 transition-all duration-300">
              <div className="bg-[#121217] border border-zinc-700/80 rounded-lg paper-shadow-dark p-6 font-mono text-xs relative">
                <BrassPaperclip className="absolute -top-5 left-16 w-7 h-16 z-30" />
                <div className="flex flex-wrap items-center justify-between pb-3 border-b border-zinc-800 gap-2">
                  <div className="flex items-center space-x-3">
                    <GitCommit className="w-4 h-4 text-[#d94834]" />
                    <span className="text-zinc-100 font-bold">
                      commit 9e41b2c8a77d3f8216
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                      Author: Alex Chen &lt;alex@chen.dev&gt;
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Verified Signature: GPG Key Validated
                  </div>
                </div>

                <div className="py-3 space-y-2">
                  <div className="font-bold text-zinc-200">
                    feat(api): implement idempotent charge pipeline and signature validation
                  </div>
                  <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80 font-mono text-[11px] overflow-x-auto text-zinc-400">
                    <div className="text-zinc-500">diff --git a/src/routes/payments.ts b/src/routes/payments.ts</div>
                    <div className="text-emerald-400">+ export async function handlePaymentCharge(req: Request, res: Response)</div>
                    <div className="text-emerald-400">{`+ const idempotencyKey = req.headers['idempotency-key'];`}</div>
                    <div className="text-emerald-400">+ if (!idempotencyKey) return res.status(400);</div>
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-zinc-400 flex items-center justify-between border-t border-zinc-800">
                  <span className="text-zinc-500">EVIDENCE AUDIT REV: #01</span>
                  <span className="text-emerald-400 font-bold">Traceable to GitHub Commit Object</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* =========================================================================
          CHAPTER 3: INTERNSHIP MATCHING & THE CLOSED LOOP (Interactive Webhook Simulator)
          ========================================================================= */}
      <section
        id="matching"
        className="relative py-24 lg:py-36 px-4 sm:px-6 lg:px-8 bg-[#0c0c10] border-t border-zinc-800"
      >
        <div className="max-w-6xl mx-auto">
          {/* Chapter Header */}
          <div className="max-w-3xl mb-16 space-y-4">
            <div className="inline-flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-[#d94834]">
              <span>Chapter 03</span>
              <span>•</span>
              <span>Requirements vs Reality</span>
            </div>
            <h2 className="font-editorial text-4xl sm:text-6xl font-bold tracking-tight text-zinc-100">
              Real requirements. Real code proof.
            </h2>
            <p className="font-sans text-base sm:text-lg text-zinc-400 leading-relaxed">
              ProofLoop doesn&apos;t just score your code once. Connect your GitHub repository, and an automated
              push webhook re-evaluates your technical fit every time you git push.
            </p>
          </div>

          {/* Side-by-side Scrapbook Matching Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
            {/* Left Column: Target Internship JD (Clipped onto cream paper) */}
            <div className="lg:col-span-5 relative">
              <BrassPaperclip className="absolute -top-5 left-10 w-7 h-16 z-30" />
              <div className="bg-[#fbf7ee] text-zinc-900 rounded-lg paper-shadow-lg border border-[#e2dbcb] p-6 relative">
                <div className="flex items-center justify-between pb-3 border-b border-[#e2dbcb] text-xs font-mono">
                  <span className="font-bold uppercase tracking-wider text-zinc-800">
                    Source Internship Posting
                  </span>
                  <RubberStamp text="TARGET JD" rotate={-4} />
                </div>

                <div className="py-4 space-y-3">
                  <div>
                    <div className="text-[11px] font-mono text-zinc-500 uppercase">Company</div>
                    <div className="font-editorial text-2xl font-bold text-zinc-950">
                      Stripe
                    </div>
                    <div className="font-mono text-xs text-zinc-700 font-semibold">
                      Software Engineering Intern — Backend Infrastructure
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#e2dbcb] space-y-2 text-xs font-sans text-zinc-700">
                    <div className="font-mono text-[11px] font-bold uppercase text-zinc-900">
                      Extracted Requirements:
                    </div>
                    <div className="p-2 bg-white rounded border border-[#e2dbcb] space-y-1">
                      <div className="font-bold text-zinc-900">1. REST API Architecture</div>
                      <p className="text-[11px] text-zinc-600">
                        Design resilient endpoints with strict idempotency and robust status code handling.
                      </p>
                    </div>
                    <div className="p-2 bg-white rounded border border-[#e2dbcb] space-y-1">
                      <div className="font-bold text-zinc-900">2. Relational Schema Design</div>
                      <p className="text-[11px] text-zinc-600">
                        Experience with SQL migrations, primary/foreign key modeling, and table indexing.
                      </p>
                    </div>
                    <div className="p-2 bg-white rounded border border-[#e2dbcb] space-y-1">
                      <div className="font-bold text-zinc-900">3. Automated Testing</div>
                      <p className="text-[11px] text-zinc-600">
                        Must write unit and integration tests to prevent regression in critical financial flows.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#e2dbcb] text-[10px] font-mono text-zinc-500 flex justify-between">
                  <span>PARSED VIA: Server-side Cheerio</span>
                  <span>SSRF PROTECTED ✓</span>
                </div>
              </div>
            </div>

            {/* Right Column: ProofLoop Audit & Live Interactive Webhook Loop */}
            <div className="lg:col-span-7 space-y-6">
              {/* Audit Verification Card */}
              <div className="bg-[#121217] border border-zinc-700 rounded-lg paper-shadow-dark p-6 text-xs font-mono text-zinc-300">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <div className="flex items-center space-x-2 text-zinc-100 font-bold">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>ProofLoop Ground Truth Audit</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    Revision #{webhookSimulated ? '02' : '01'}
                  </span>
                </div>

                {/* Audit Items */}
                <div className="py-4 space-y-3 font-mono text-xs">
                  {/* Skill 1: Demonstrated */}
                  <div className="p-3 bg-zinc-900/80 rounded border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-zinc-100 flex items-center space-x-2">
                        <span>REST API Development</span>
                        <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 text-[9px] uppercase font-bold rounded">
                          Demonstrated (100%)
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-sans mt-0.5">
                        Cited: <code>src/routes/payments.ts:L34-58</code>
                      </div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 hidden sm:block" />
                  </div>

                  {/* Skill 2: Demonstrated */}
                  <div className="p-3 bg-zinc-900/80 rounded border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-zinc-100 flex items-center space-x-2">
                        <span>SQL &amp; Schema Migrations</span>
                        <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 text-[9px] uppercase font-bold rounded">
                          Demonstrated (100%)
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-sans mt-0.5">
                        Cited: <code>db/migrations/001_init.sql</code>
                      </div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 hidden sm:block" />
                  </div>

                  {/* Skill 3: The Gap that turns into demonstrated when webhook fires */}
                  <div
                    className={`p-3 rounded border transition-all duration-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      webhookSimulated
                        ? 'bg-emerald-950/20 border-emerald-500/60 text-emerald-200'
                        : 'bg-[#d94834]/10 border-[#d94834]/40 text-zinc-200'
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center space-x-2">
                        <span className={webhookSimulated ? 'text-emerald-300' : 'text-zinc-100'}>
                          Automated Testing &amp; Coverage
                        </span>
                        <span
                          className={`px-1.5 py-0.2 text-[9px] uppercase font-bold rounded ${
                            webhookSimulated
                              ? 'bg-emerald-500 text-black'
                              : 'bg-[#d94834] text-white'
                          }`}
                        >
                          {webhookSimulated ? 'Demonstrated (100%)' : 'Gap Identified (0%)'}
                        </span>
                      </div>
                      <div className="text-[11px] font-sans mt-0.5">
                        {webhookSimulated ? (
                          <span className="text-emerald-400">
                            Newly Verified in commit <code>a410f9b</code>: <code>tests/charge.test.ts</code> (4 test specs passing)
                          </span>
                        ) : (
                          <span className="text-zinc-400">
                            No test specs found. Actionable Gap-to-Proof Roadmap task active.
                          </span>
                        )}
                      </div>
                    </div>
                    {webhookSimulated ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-[#d94834] shrink-0" />
                    )}
                  </div>
                </div>

                {/* INTERACTIVE WEBHOOK SIMULATOR BOX */}
                <div className="mt-2 p-4 bg-zinc-950 rounded-lg border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span className="font-bold text-zinc-200 text-xs">
                        Live GitHub Webhook Listener
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      HMAC SHA-256 Active
                    </span>
                  </div>

                  <p className="font-sans text-[11px] text-zinc-400 leading-normal">
                    Experience how ProofLoop closes the loop. Click below to simulate pushing a new commit with unit tests:
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {!webhookSimulated ? (
                      <button
                        onClick={handleSimulatePush}
                        disabled={isSimulating}
                        className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded transition-all shadow-md disabled:opacity-50 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {isSimulating ? 'Processing Webhook Event...' : 'Simulate Git Push (Commit a410f9b)'}
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center space-x-3">
                        <span className="text-emerald-400 text-xs font-bold flex items-center space-x-1.5">
                          <Check className="w-4 h-4" />
                          <span>Assessment Automatically Updated!</span>
                        </span>
                        <button
                          onClick={handleResetSimulation}
                          className="inline-flex items-center space-x-1 text-xs text-zinc-400 hover:text-white underline cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset Simulation</span>
                        </button>
                      </div>
                    )}

                    <Link
                      href="/dashboard/webhook-lab"
                      className="text-xs font-mono text-zinc-400 hover:text-zinc-200 underline decoration-zinc-600 ml-auto"
                    >
                      Open Full Webhook Lab →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          CHAPTER 4: FINAL CALL TO ACTION (The Dossier Seal & Action)
          ========================================================================= */}
      <section
        id="cta"
        className="relative py-28 lg:py-40 px-4 sm:px-6 lg:px-8 bg-dark-canvas border-t border-zinc-800 text-center"
      >
        <div className="max-w-4xl mx-auto relative">
          {/* Handcrafted Dossier Background Card */}
          <div className="bg-[#fbf7ee] text-zinc-950 rounded-xl paper-shadow-lg border border-[#e2dbcb] p-8 sm:p-16 relative overflow-hidden">
            {/* Washi tapes on corners */}
            <WashiTape className="-top-3 left-12" width="100px" color="coral" rotate={-3} />
            <WashiTape className="-top-3 right-12" width="90px" color="cream" rotate={2} />

            {/* Red Rubber Stamp */}
            <div className="mb-6 flex justify-center">
              <RubberStamp text="AUDIT READY" subtext="PROOFLOOP ENGINE // PROVE YOUR FIT" rotate={-3} />
            </div>

            <h2 className="font-editorial text-4xl sm:text-6xl font-bold tracking-tight text-zinc-950 leading-tight mb-4">
              Ready to prove your <br />
              <span className="italic font-normal">engineering fit?</span>
            </h2>

            <p className="font-sans text-base sm:text-lg text-zinc-700 max-w-xl mx-auto leading-relaxed mb-8">
              Paste your target internship URL, connect your repository, and get an evidence-backed assessment
              grounded in your actual code within seconds.
            </p>

            {/* Prominent Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link
                href="/onboard"
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2.5 px-8 py-4 bg-[#d94834] hover:bg-[#c63d2a] text-white font-mono text-sm font-bold uppercase tracking-wider rounded transition-all shadow-lg group"
              >
                <span>Check My Internship Fit</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href="/dashboard?id=sample-assessment-stripe"
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-7 py-4 bg-white hover:bg-[#f4efe2] text-zinc-900 border border-[#d5ccba] font-mono text-sm font-semibold uppercase tracking-wider rounded transition-all shadow-xs"
              >
                <span>Explore Sample Mode</span>
                <ArrowUpRight className="w-4 h-4 text-zinc-500" />
              </Link>
            </div>

            {/* Feature Pills */}
            <div className="mt-12 pt-8 border-t border-[#e2dbcb] flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-zinc-600">
              <span className="flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-[#d94834]" />
                <span>Real Job URLs Parsed</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-[#d94834]" />
                <span>Line-Level Source Citations</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-[#d94834]" />
                <span>Automated Push Webhook Updates</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-[#d94834]" />
                <span>SSRF Safe Architecture</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Editorial Scrapbook Footer */}
      <footer className="border-t border-zinc-800 py-10 px-6 bg-[#09090c] text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-wrap items-center space-x-3">
            <span className="font-bold text-zinc-200">ProofLoop</span>
            <span>•</span>
            <span className="text-zinc-400">Agentic AI Hackathon W-PS-2: AI Career Coach</span>
            <span>•</span>
            <span className="text-zinc-600">Editorial Scrapbook Edition</span>
          </div>

          <div className="flex items-center space-x-6 text-zinc-400">
            <Link
              href="/dashboard?id=sample-assessment-stripe"
              className="hover:text-white transition-colors"
            >
              Sample Assessment
            </Link>
            <Link
              href="/dashboard/webhook-lab"
              className="hover:text-white transition-colors"
            >
              Webhook Lab
            </Link>
            <Link
              href="/onboard"
              className="hover:text-white transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
