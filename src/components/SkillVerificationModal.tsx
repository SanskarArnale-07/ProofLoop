'use client';

import { useState, useEffect } from 'react';
import {
  InternshipRequirement,
  RepositoryEvidence,
  VerificationTask,
  VerificationAssessmentCondition,
  PracticalEvaluationResult,
  AdaptiveReasoningFollowup,
  DeveloperVerificationRecord
} from '@/lib/types';
import {
  X,
  Brain,
  Code,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Info,
  HelpCircle
} from 'lucide-react';

interface SkillVerificationModalProps {
  assessmentId: string;
  requirement: InternshipRequirement;
  evidence?: RepositoryEvidence | null;
  existingRecord?: DeveloperVerificationRecord | null;
  onClose: () => void;
  onSuccess: (updatedRecord: DeveloperVerificationRecord) => void;
}

export function SkillVerificationModal({
  assessmentId,
  requirement,
  evidence,
  existingRecord,
  onClose,
  onSuccess
}: SkillVerificationModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(existingRecord ? 4 : 1);
  const [condition, setCondition] = useState<VerificationAssessmentCondition>(
    existingRecord?.assessmentCondition || 'ai_restricted_independent'
  );

  // Task generation state
  const [task, setTask] = useState<VerificationTask | null>(existingRecord?.task || null);
  const [loadingTask, setLoadingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Practical solution state
  const [solutionCode, setSolutionCode] = useState<string>(
    existingRecord?.practicalSolution || ''
  );
  const [evaluatingPractical, setEvaluatingPractical] = useState(false);
  const [practicalEval, setPracticalEval] = useState<PracticalEvaluationResult | null>(
    existingRecord?.practicalEvaluation || null
  );
  const [followupQuestion, setFollowupQuestion] = useState<AdaptiveReasoningFollowup | null>(
    existingRecord?.followupQuestion || null
  );

  // Reasoning state
  const [reasoningResponse, setReasoningResponse] = useState<string>(
    existingRecord?.reasoningResponse || ''
  );
  const [completingVerification, setCompletingVerification] = useState(false);
  const [completedRecord, setCompletedRecord] = useState<DeveloperVerificationRecord | null>(
    existingRecord || null
  );

  // Load task on initial mount if not existing
  useEffect(() => {
    if (existingRecord) return;

    let isMounted = true;
    async function fetchTask() {
      setLoadingTask(true);
      setTaskError(null);
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/verification/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requirementId: requirement.id,
            condition
          })
        });
        const data = await res.json();
        if (isMounted) {
          if (!res.ok || !data.success) {
            setTaskError(data.error || 'Failed to generate practical task.');
          } else {
            setTask(data.task);
            if (!solutionCode && data.task?.targetCode?.codeExcerpt) {
              setSolutionCode(data.task.targetCode.codeExcerpt);
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setTaskError(err instanceof Error ? err.message : 'Error generating verification task.');
        }
      } finally {
        if (isMounted) {
          setLoadingTask(false);
        }
      }
    }

    fetchTask();
    return () => {
      isMounted = false;
    };
  }, [assessmentId, requirement.id, condition, existingRecord]);

  const handleEvaluatePractical = async () => {
    if (!solutionCode.trim()) return;
    setEvaluatingPractical(true);
    setTaskError(null);

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/verification/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: requirement.id,
          solutionCode,
          condition
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTaskError(data.error || 'Failed to evaluate practical code.');
      } else {
        setPracticalEval(data.practicalEvaluation);
        setFollowupQuestion(data.followupQuestion);
        setStep(3);
      }
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Error evaluating practical code.');
    } finally {
      setEvaluatingPractical(false);
    }
  };

  const handleCompleteVerification = async () => {
    if (!reasoningResponse.trim()) return;
    setCompletingVerification(true);
    setTaskError(null);

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/verification/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: requirement.id,
          solutionCode,
          followupId: followupQuestion?.id,
          reasoningResponse,
          condition
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTaskError(data.error || 'Failed to complete verification evaluation.');
      } else {
        setCompletedRecord(data.verificationRecord);
        onSuccess(data.verificationRecord);
        setStep(4);
      }
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Error completing verification.');
    } finally {
      setCompletingVerification(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#211A16] border border-[#584638] rounded-xl max-w-4xl w-full my-8 overflow-hidden shadow-2xl flex flex-col text-[#F5F0E5] max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#17120E] border-b border-[#584638] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-[#DD5946]/20 rounded border border-[#DD5946]/40 text-[#DD5946]">
              <Brain className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#BDB0A2] font-bold">
                  Step {step} of 4 · Developer Understanding Check
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#30251F] text-[#F5F0E5] border border-[#584638]">
                  {requirement.category.toUpperCase()}
                </span>
              </div>
              <h3 className="font-editorial text-lg font-bold text-[#F5F0E5]">
                {requirement.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#BDB0A2] hover:text-[#F5F0E5] rounded transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs font-sans">
          {taskError && (
            <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 rounded flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{taskError}</span>
            </div>
          )}

          {/* STEP 1: Task Briefing & Grounding */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              {loadingTask ? (
                <div className="py-12 flex flex-col items-center justify-center font-mono text-xs text-[#BDB0A2] space-y-2">
                  <Brain className="w-6 h-6 animate-pulse text-[#DD5946]" />
                  <span>Grounding task in repository code...</span>
                </div>
              ) : task ? (
                <>
                  {/* Task Overview */}
                  <div className="p-4 bg-[#17120E] border border-[#584638] rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase text-[#DD5946]">
                        {task.taskType.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {task.isFallbackManual && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          Manual Reference Mode
                        </span>
                      )}
                    </div>
                    <h4 className="font-editorial text-base font-bold text-[#F5F0E5]">
                      {task.title}
                    </h4>
                    <p className="text-[#BDB0A2] leading-relaxed">
                      {task.scenario}
                    </p>
                  </div>

                  {/* Grounded Code Reference */}
                  {task.targetCode?.codeExcerpt && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-mono text-[11px] text-[#BDB0A2]">
                        <span className="flex items-center gap-1.5">
                          <FileCode className="w-3.5 h-3.5 text-[#DD5946]" />
                          <span className="font-bold text-[#F5F0E5]">{task.targetCode.filePath}</span>
                          {task.targetCode.lineStart && (
                            <span>:L{task.targetCode.lineStart}-L{task.targetCode.lineEnd}</span>
                          )}
                        </span>
                        <span className="text-[10px] text-[#BDB0A2]">
                          Commit {task.targetCode.commitSha?.slice(0, 7)}
                        </span>
                      </div>
                      <pre className="p-3 bg-zinc-950 border border-[#584638] rounded-md font-mono text-[11px] overflow-x-auto text-zinc-300 leading-normal max-h-48">
                        <code>{task.targetCode.codeExcerpt}</code>
                      </pre>
                    </div>
                  )}

                  {/* Instructions & Acceptance Criteria */}
                  <div className="p-4 bg-[#17120E] border border-[#584638] rounded-lg space-y-2">
                    <span className="font-bold text-[#F5F0E5] font-mono text-[11px] block">
                      Instructions & Expected Invariants:
                    </span>
                    <p className="text-[#BDB0A2] whitespace-pre-line leading-relaxed">
                      {task.instructions}
                    </p>
                    <div className="pt-2 border-t border-[#584638]/50 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-[#BDB0A2] block">
                        Evaluation Criteria:
                      </span>
                      <ul className="list-disc list-inside space-y-1 text-[#F5F0E5]">
                        {task.evaluationCriteria.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Assessment Condition Selector */}
                  <div className="p-4 bg-[#17120E] border border-[#584638] rounded-lg space-y-2">
                    <span className="font-bold text-[#F5F0E5] font-mono text-[11px] block">
                      Assessment Condition (Declared Environment):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label
                        className={`p-2.5 rounded border cursor-pointer flex flex-col justify-between transition-colors ${
                          condition === 'ai_restricted_independent'
                            ? 'bg-[#30251F] border-[#DD5946] text-[#F5F0E5]'
                            : 'bg-[#211A16] border-[#584638] text-[#BDB0A2]'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="condition"
                            value="ai_restricted_independent"
                            checked={condition === 'ai_restricted_independent'}
                            onChange={() => setCondition('ai_restricted_independent')}
                            className="text-[#DD5946]"
                          />
                          <span className="font-bold font-mono text-[11px]">AI-Restricted (Independent)</span>
                        </div>
                        <span className="text-[10px] mt-1 text-[#BDB0A2]">
                          Independent reasoning. Standard docs allowed.
                        </span>
                      </label>

                      <label
                        className={`p-2.5 rounded border cursor-pointer flex flex-col justify-between transition-colors ${
                          condition === 'ai_assisted_disclosed'
                            ? 'bg-[#30251F] border-[#DD5946] text-[#F5F0E5]'
                            : 'bg-[#211A16] border-[#584638] text-[#BDB0A2]'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="condition"
                            value="ai_assisted_disclosed"
                            checked={condition === 'ai_assisted_disclosed'}
                            onChange={() => setCondition('ai_assisted_disclosed')}
                            className="text-[#DD5946]"
                          />
                          <span className="font-bold font-mono text-[11px]">AI-Assisted (Disclosed)</span>
                        </div>
                        <span className="text-[10px] mt-1 text-[#BDB0A2]">
                          AI-assistance disclosed. Evaluates human oversight.
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setStep(2)}
                      className="px-5 py-2.5 bg-white hover:bg-[#f4efe2] text-[#2B211B] text-xs font-mono font-bold rounded shadow-md border border-[#d5ccba] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Start Practical Task</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#2B211B]" />
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* STEP 2: Practical Solution Input */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[#F5F0E5] font-editorial text-sm">
                    Enter Your Refactored Code / Solution
                  </span>
                  <p className="text-[#BDB0A2] text-[11px] mt-0.5">
                    Modify the code to resolve the edge case and satisfy the expected invariants. Safe deterministic checks will verify syntax and contract preservation.
                  </p>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-[#BDB0A2] hover:text-[#F5F0E5] cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Review Task</span>
                </button>
              </div>

              <div className="space-y-1">
                <textarea
                  rows={14}
                  value={solutionCode}
                  onChange={(e) => setSolutionCode(e.target.value)}
                  placeholder="// Paste or write your implementation here..."
                  className="w-full p-3.5 bg-zinc-950 border border-[#584638] rounded-md font-mono text-xs text-zinc-100 focus:outline-hidden focus:border-[#DD5946] focus:ring-1 focus:ring-[#DD5946] leading-relaxed resize-y"
                  spellCheck={false}
                />
                <div className="flex items-center justify-between text-[10px] font-mono text-[#BDB0A2]">
                  <span>{solutionCode.length} characters</span>
                  <span>Untrusted code is statically validated; never executed unsandboxed.</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-3.5 py-2 text-xs font-mono text-[#BDB0A2] hover:text-[#F5F0E5] cursor-pointer"
                >
                  Back
                </button>

                <button
                  onClick={handleEvaluatePractical}
                  disabled={evaluatingPractical || solutionCode.trim().length < 15}
                  className="px-5 py-2.5 bg-white hover:bg-[#f4efe2] text-[#2B211B] text-xs font-mono font-bold rounded shadow-md border border-[#d5ccba] inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {evaluatingPractical ? (
                    <>
                      <Brain className="w-3.5 h-3.5 animate-pulse text-[#2B211B]" />
                      <span>Checking Contracts...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Solution for Check</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#2B211B]" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Automated Checks & Adaptive Follow-Up Question */}
          {step === 3 && practicalEval && followupQuestion && (
            <div className="space-y-5 animate-fade-in">
              {/* Practical Check Results Strip */}
              <div
                className={`p-4 rounded-lg border space-y-2 ${
                  practicalEval.passed
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                    : 'bg-amber-950/40 border-amber-800 text-amber-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold font-mono text-xs uppercase flex items-center gap-1.5">
                    {practicalEval.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                    )}
                    <span>
                      {practicalEval.passed
                        ? 'Automated Contract Checks Passed'
                        : 'Contract Checks Incomplete'}
                    </span>
                  </span>
                  <span className="font-mono text-xs font-bold">
                    {practicalEval.testsPassed} / {practicalEval.totalTests} Checks
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  {practicalEval.checksSummary.map((chk, i) => (
                    <div key={i} className="font-mono text-[11px]">
                      {chk}
                    </div>
                  ))}
                </div>
              </div>

              {/* Adaptive Question Box */}
              <div className="p-4 bg-[#17120E] border border-[#584638] rounded-lg space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-mono text-[#DD5946] font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Adaptive Reasoning Follow-Up (Based on Your Actual Solution)</span>
                </div>

                <h4 className="font-editorial text-base font-bold text-[#F5F0E5] leading-snug">
                  {followupQuestion.question}
                </h4>

                <p className="text-[11px] text-[#BDB0A2] italic bg-[#211A16] p-2.5 rounded border border-[#584638]/50">
                  <span className="font-bold not-italic">Why asked: </span>
                  {followupQuestion.contextWhyAsked}
                </p>

                <div className="space-y-1">
                  <textarea
                    rows={6}
                    value={reasoningResponse}
                    onChange={(e) => setReasoningResponse(e.target.value)}
                    placeholder="Explain your technical rationale, architectural tradeoffs, and how your design handles the edge case..."
                    className="w-full p-3 bg-zinc-950 border border-[#584638] rounded-md font-sans text-xs text-zinc-100 focus:outline-hidden focus:border-[#DD5946] leading-relaxed resize-y"
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#BDB0A2]">
                    <span>Minimum 20 characters for meaningful evaluation</span>
                    <span>Evaluates conceptual depth, criteria met, and trade-offs.</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="px-3.5 py-2 text-xs font-mono text-[#BDB0A2] hover:text-[#F5F0E5] cursor-pointer"
                >
                  Edit Solution
                </button>

                <button
                  onClick={handleCompleteVerification}
                  disabled={completingVerification || reasoningResponse.trim().length < 20}
                  className="px-5 py-2.5 bg-white hover:bg-[#f4efe2] text-[#2B211B] text-xs font-mono font-bold rounded shadow-md border border-[#d5ccba] inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {completingVerification ? (
                    <>
                      <Brain className="w-3.5 h-3.5 animate-pulse text-[#2B211B]" />
                      <span>Computing Multi-Dimensions...</span>
                    </>
                  ) : (
                    <>
                      <span>Complete Verification</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#2B211B]" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Multidimensional Verification Results */}
          {step === 4 && completedRecord && (
            <div className="space-y-5 animate-fade-in">
              {/* Overall Verdict Banner */}
              <div
                className={`p-5 rounded-lg border space-y-2 ${
                  completedRecord.status === 'verified_demonstrated'
                    ? 'bg-emerald-950/40 border-emerald-800'
                    : completedRecord.status === 'partial_verification'
                      ? 'bg-amber-950/40 border-amber-800'
                      : 'bg-zinc-950/50 border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${
                      completedRecord.status === 'verified_demonstrated'
                        ? 'bg-emerald-900 text-emerald-300 border-emerald-700'
                        : completedRecord.status === 'partial_verification'
                          ? 'bg-amber-900 text-amber-300 border-amber-700'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {completedRecord.status === 'verified_demonstrated'
                      ? 'DEMONSTRATED (PRACTICAL & REASONING VERIFIED)'
                      : completedRecord.status === 'partial_verification'
                        ? 'PARTIAL EVIDENCE (FURTHER UNDERSTANDING NEEDED)'
                        : 'NOT YET DEMONSTRATED'}
                  </span>
                  <span className="text-[11px] font-mono text-[#BDB0A2]">
                    Condition: {completedRecord.dimensions.verificationIntegrity.environmentIntegrity}
                  </span>
                </div>

                <p className="text-sm font-editorial font-bold text-[#F5F0E5] pt-1">
                  {completedRecord.overallVerdict}
                </p>
              </div>

              {/* Six Separate Dimensions */}
              <div className="space-y-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#BDB0A2] font-bold block">
                  Separated Evaluation Dimensions
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Dim 1: Repository Evidence */}
                  <div className="p-3 bg-[#17120E] border border-[#584638] rounded space-y-1">
                    <span className="font-bold text-[#F5F0E5] block font-mono text-[11px]">
                      1. Repository Evidence
                    </span>
                    <p className="text-[#BDB0A2] text-[11px]">
                      {completedRecord.dimensions.repositoryEvidence.summary}
                    </p>
                  </div>

                  {/* Dim 2: Practical Performance */}
                  <div className="p-3 bg-[#17120E] border border-[#584638] rounded space-y-1">
                    <span className="font-bold text-[#F5F0E5] block font-mono text-[11px]">
                      2. Practical Performance
                    </span>
                    <p className="text-[#BDB0A2] text-[11px]">
                      {completedRecord.dimensions.practicalPerformance.summary}
                    </p>
                  </div>

                  {/* Dim 3: Reasoning Evidence */}
                  <div className="p-3 bg-[#17120E] border border-[#584638] rounded space-y-1">
                    <span className="font-bold text-[#F5F0E5] block font-mono text-[11px]">
                      3. Reasoning Evidence ({completedRecord.dimensions.reasoningEvidence.depth})
                    </span>
                    <p className="text-[#BDB0A2] text-[11px]">
                      {completedRecord.dimensions.reasoningEvidence.summary}
                    </p>
                    {completedRecord.reasoningEvaluation.criteriaMet.length > 0 && (
                      <div className="text-[10px] text-emerald-400">
                        Met: {completedRecord.reasoningEvaluation.criteriaMet.join('; ')}
                      </div>
                    )}
                    {completedRecord.reasoningEvaluation.missingReasoning.length > 0 && (
                      <div className="text-[10px] text-amber-400">
                        Missing: {completedRecord.reasoningEvaluation.missingReasoning.join('; ')}
                      </div>
                    )}
                  </div>

                  {/* Dim 4: Contribution Evidence */}
                  <div className="p-3 bg-[#17120E] border border-[#584638] rounded space-y-1">
                    <span className="font-bold text-[#F5F0E5] block font-mono text-[11px]">
                      4. Contribution History
                    </span>
                    <p className="text-[#BDB0A2] text-[11px]">
                      {completedRecord.dimensions.contributionEvidence.commitFrequency} (
                      {completedRecord.dimensions.contributionEvidence.attributionCertainty} attribution)
                    </p>
                  </div>

                  {/* Dim 5: Verification Integrity */}
                  <div className="p-3 bg-[#17120E] border border-[#584638] rounded space-y-1">
                    <span className="font-bold text-[#F5F0E5] block font-mono text-[11px]">
                      5. Verification Integrity
                    </span>
                    <p className="text-[#BDB0A2] text-[11px]">
                      Tools: {completedRecord.dimensions.verificationIntegrity.permittedTools}
                    </p>
                  </div>

                  {/* Dim 6: Confidence and Limitations */}
                  <div className="p-3 bg-[#17120E] border border-[#584638] rounded space-y-1">
                    <span className="font-bold text-[#F5F0E5] block font-mono text-[11px]">
                      6. Confidence & Limitations
                    </span>
                    <ul className="list-disc list-inside text-[10px] text-[#BDB0A2] space-y-0.5">
                      {completedRecord.limitations.map((lim, i) => (
                        <li key={i}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-white hover:bg-[#f4efe2] text-[#2B211B] text-xs font-mono font-bold rounded shadow-md border border-[#d5ccba] cursor-pointer"
                >
                  Done / Return to Results
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
