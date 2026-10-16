import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, saveRevision, addActivityEvent, recordAssessmentFailure } from '@/lib/db';
import { evaluateRepositoryCore } from '@/lib/analyzer';
import { AssessmentRevision, ActivityEvent } from '@/lib/types';
import { SCORING_RULE_VERSION } from '@/lib/scoring';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let assessmentId = '';
  try {
    const { id } = await params;
    assessmentId = id;
    const assessment = getAssessment(id);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Run core evidence evaluation engine
    const coreResult = await evaluateRepositoryCore({
      assessmentId: assessment.id,
      repoFullName: assessment.repository.fullName,
      defaultBranch: assessment.repository.defaultBranch,
      targetCommitSha: assessment.repository.latestCommitSha,
      requirements: assessment.internship.requirements,
      triggerType: 'manual',
      triggerMessage: 'Manual reassessment request'
    });

    if (!coreResult.success) {
      const errMsg = coreResult.error || 'Reassessment failed';
      recordAssessmentFailure(assessment.id, errMsg);
      const statusCode = coreResult.errorCode === 'REPO_NOT_FOUND' ? 404 : 500;
      return NextResponse.json(
        {
          error: errMsg,
          errorCode: coreResult.errorCode,
          message: 'Reassessment failed. Previous assessment history was preserved.'
        },
        { status: statusCode }
      );
    }

    const newRevNumber = assessment.currentRevisionNumber + 1;
    const now = new Date().toISOString();

    const newRev: AssessmentRevision = {
      id: `rev-${assessment.id}-${newRevNumber}`,
      assessmentId: assessment.id,
      revisionNumber: newRevNumber,
      commitSha: assessment.repository.latestCommitSha,
      commitMessage: 'Manual reassessment request',
      triggerType: 'manual',
      evidence: coreResult.evidenceList,
      demonstratedCount: coreResult.summary.demonstratedCount,
      partialCount: coreResult.summary.partialCount,
      notDemonstratedCount: coreResult.summary.notDemonstratedCount,
      scoringRuleVersion: coreResult.summary.scoringRuleVersion || SCORING_RULE_VERSION,
      analysisScope: coreResult.analysisScope,
      aiSignals: coreResult.aiSignals,
      createdAt: now
    };

    saveRevision(newRev);

    const activity: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assessmentId: assessment.id,
      eventType: 'reassessment_completed',
      title: `Manual Reassessment Completed (Rev #${newRevNumber})`,
      description: `Re-evaluated ${coreResult.evidenceList.length} internship requirements against repository state.`,
      commitSha: assessment.repository.latestCommitSha,
      timestamp: now
    };
    addActivityEvent(activity);

    const updated = getAssessment(id);
    return NextResponse.json({ success: true, assessment: updated });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to trigger reassessment';
    console.error('Manual reassessment error:', errMsg);

    // Preserve previous assessment upon reassessment failure
    if (assessmentId) {
      recordAssessmentFailure(assessmentId, errMsg);
    }

    return NextResponse.json(
      {
        error: errMsg,
        message: 'Reassessment failed. Previous assessment history was preserved.'
      },
      { status: 500 }
    );
  }
}
