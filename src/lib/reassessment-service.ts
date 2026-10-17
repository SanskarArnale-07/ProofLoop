import {
  getAssessment,
  saveRevision,
  addActivityEvent,
  recordAssessmentFailure
} from './db';
import { evaluateRepositoryCore } from './analyzer';
import {
  AssessmentRevision,
  ActivityEvent,
  Assessment
} from './types';
import { SCORING_RULE_VERSION } from './scoring';

export interface ReassessAssessmentInput {
  /** The assessment identifier to reassess */
  assessmentId: string;
  /** Trigger source: 'manual' (user action) or 'webhook' (GitHub push event) */
  triggerType: 'manual' | 'webhook';
  /** Human-readable trigger message */
  triggerMessage?: string;
  /** The commit SHA that triggered the reassessment (webhook) */
  commitSha?: string;
  /** The commit message (webhook) */
  commitMessage?: string;
  /** GitHub personal access token for API access (optional) */
  token?: string;
  /** Files changed in the push (webhook only, informational) */
  filesChanged?: string[];
}

export interface ReassessAssessmentOutput {
  success: boolean;
  assessmentId: string;
  newRevisionNumber?: number;
  commitSha?: string;
  commitMessage?: string;
  promotedSkills?: string[];
  evidenceCount?: number;
  demonstratedCount?: number;
  partialCount?: number;
  notDemonstratedCount?: number;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  errorCode?: string;
}

/**
 * In-memory guard to prevent concurrent reassessments for the same assessment.
 * JavaScript is single-threaded so the check-and-set is atomic within an event
 * loop tick; no external locking library is required.
 */
const activeReassessments = new Set<string>();

/**
 * Reusable reassessment service.
 *
 * This is the single entry point for both manual (user-initiated) and
 * webhook-triggered (GitHub push) reassessments. It reuses the existing
 * evaluation engine (evaluateRepositoryCore) and persistence layer (db.ts)
 * without duplicating scoring logic or creating a parallel database.
 *
 * Webhook-specific concerns (signature verification, delivery deduplication,
 * event parsing) are intentionally kept OUTSIDE this service. The webhook
 * handler should validate the event first, then call this function with the
 * validated inputs.
 */
export async function reassessAssessment(
  input: ReassessAssessmentInput
): Promise<ReassessAssessmentOutput> {
  const { assessmentId, triggerType } = input;

  // Concurrency guard: reject if a reassessment is already in flight
  if (activeReassessments.has(assessmentId)) {
    return {
      success: true,
      assessmentId,
      skipped: true,
      skipReason:
        'A reassessment is already in progress for this assessment. Please wait for it to complete before triggering another.'
    };
  }

  // Load the assessment from the database
  let assessment;
  try {
    assessment = await getAssessment(assessmentId);
  } catch (err) {
    return {
      success: false,
      assessmentId,
      error: `Failed to load assessment: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: 'INTERNAL_ERROR'
    };
  }

  if (!assessment) {
    return {
      success: false,
      assessmentId,
      error: `Assessment "${assessmentId}" not found.`,
      errorCode: 'ASSESSMENT_NOT_FOUND'
    };
  }

  // Duplicate detection: if the commit SHA matches the current revision,
  // there is nothing new to reassess (webhook-triggered only).
  const effectiveCommitSha =
    input.commitSha || assessment.repository.latestCommitSha;
  if (
    triggerType === 'webhook' &&
    effectiveCommitSha &&
    effectiveCommitSha === assessment.latestRevision.commitSha
  ) {
    return {
      success: true,
      assessmentId,
      skipped: true,
      skipReason: `Commit ${effectiveCommitSha.slice(0, 7)} is already the current revision. No new changes to reassess.`,
      commitSha: effectiveCommitSha
    };
  }

  // Acquire concurrency lock
  activeReassessments.add(assessmentId);

  try {
    return await performReassessment({
      assessmentId,
      triggerType,
      triggerMessage: input.triggerMessage,
      commitSha: effectiveCommitSha,
      commitMessage: input.commitMessage,
      token: input.token,
      assessment
    });
  } finally {
    activeReassessments.delete(assessmentId);
  }
}

async function performReassessment(input: {
  assessmentId: string;
  triggerType: 'manual' | 'webhook';
  triggerMessage?: string;
  commitSha: string;
  commitMessage?: string;
  token?: string;
  assessment: Assessment;
}): Promise<ReassessAssessmentOutput> {
  const {
    assessmentId,
    triggerType,
    triggerMessage,
    commitSha,
    commitMessage,
    token,
    assessment
  } = input;
  const now = new Date().toISOString();
  const newRevNumber = assessment.currentRevisionNumber + 1;

  // Run the core evaluation engine (evidence-based, deterministic scoring)
  const coreResult = await evaluateRepositoryCore({
    assessmentId,
    repoFullName: assessment.repository.fullName,
    defaultBranch: assessment.repository.defaultBranch,
    targetCommitSha: commitSha,
    requirements: assessment.internship.requirements,
    triggerType,
    triggerMessage: triggerMessage || commitMessage || `${triggerType} reassessment`,
    token
  });

  // Handle evaluation failure gracefully - preserve previous revision
  if (!coreResult.success) {
    const errMsg = coreResult.error || 'Reassessment failed';
    try {
      recordAssessmentFailure(assessmentId, errMsg);
    } catch {
      // Best-effort failure recording; don't mask the original error
    }
    return {
      success: false,
      assessmentId,
      error: errMsg,
      errorCode: coreResult.errorCode || 'ANALYSIS_FAILED',
      commitSha
    };
  }

  // Persist the new assessment revision
  const newRev: AssessmentRevision = {
    id: `rev-${assessmentId}-${newRevNumber}`,
    assessmentId,
    revisionNumber: newRevNumber,
    commitSha,
    commitMessage:
      commitMessage || triggerMessage || `${triggerType} reassessment`,
    triggerType,
    evidence: coreResult.evidenceList,
    demonstratedCount: coreResult.summary.demonstratedCount,
    partialCount: coreResult.summary.partialCount,
    notDemonstratedCount: coreResult.summary.notDemonstratedCount,
    scoringRuleVersion:
      coreResult.summary.scoringRuleVersion || SCORING_RULE_VERSION,
    analysisScope: coreResult.analysisScope,
    aiSignals: coreResult.aiSignals,
    createdAt: now
  };

  try {
    await saveRevision(newRev);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Failed to save revision';
    try {
      await recordAssessmentFailure(assessmentId, errMsg);
    } catch {
      // best effort
    }
    return {
      success: false,
      assessmentId,
      error: errMsg,
      errorCode: 'PERSISTENCE_FAILED',
      commitSha
    };
  }

  // Detect skill promotions (requirements newly marked as demonstrated)
  const previousEvidenceMap = new Map(
    assessment.latestRevision.evidence.map(e => [e.requirementId, e.status])
  );
  const promotedSkills: string[] = [];
  for (const newEv of coreResult.evidenceList) {
    const prevStatus = previousEvidenceMap.get(newEv.requirementId);
    if (newEv.status === 'demonstrated' && prevStatus !== 'demonstrated') {
      promotedSkills.push(newEv.requirementTitle);
    }
  }

  // Record activity event (non-critical; logging failure won't fail reassessment)
  const activity: ActivityEvent = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    assessmentId,
    eventType:
      promotedSkills.length > 0 ? 'skill_promoted' : 'reassessment_completed',
    title:
      promotedSkills.length > 0
        ? `Skill Verified: ${promotedSkills.join(', ')}`
        : triggerType === 'manual'
          ? `Manual Reassessment Completed (Rev #${newRevNumber})`
          : `Reassessment completed for commit ${commitSha.slice(0, 7)}`,
    description:
      promotedSkills.length > 0
        ? `Commit "${commitMessage || triggerMessage}" added verified evidence promoting: ${promotedSkills.join(', ')}.`
        : triggerType === 'manual'
          ? `Re-evaluated ${coreResult.evidenceList.length} internship requirements against repository state.`
          : `Analyzed commit "${commitMessage || triggerMessage}". Requirements remained consistent with existing evidence.`,
    commitSha,
    commitMessage: commitMessage || triggerMessage,
    timestamp: now
  };

  try {
    await addActivityEvent(activity);
  } catch {
    // Activity events are non-critical; don't fail reassessment if logging fails
  }

  return {
    success: true,
    assessmentId,
    newRevisionNumber: newRevNumber,
    commitSha,
    commitMessage: newRev.commitMessage,
    promotedSkills,
    evidenceCount: coreResult.evidenceList.length,
    demonstratedCount: coreResult.summary.demonstratedCount,
    partialCount: coreResult.summary.partialCount,
    notDemonstratedCount: coreResult.summary.notDemonstratedCount
  };
}
