import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, saveRevision, addActivityEvent, recordAssessmentFailure } from '@/lib/db';
import { fetchRepoTree, fetchRepoCommits } from '@/lib/github';
import { analyzeRepositoryAgainstRequirements } from '@/lib/analyzer';
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

    const [owner, repo] = assessment.repository.fullName.split('/');

    // 1. Fetch File Tree
    let fileTree = [];
    try {
      fileTree = await fetchRepoTree(owner, repo, assessment.repository.defaultBranch);
    } catch {
      fileTree = assessment.latestRevision.evidence
        .filter(e => e.filePath)
        .map(e => ({ path: e.filePath!, mode: '100644', type: 'blob' as const, sha: 'curr' }));
    }

    // 2. Fetch Commits
    let commits = [];
    try {
      commits = await fetchRepoCommits(owner, repo, assessment.repository.defaultBranch, 20);
    } catch {
      commits = [
        {
          sha: assessment.repository.latestCommitSha,
          message: assessment.latestRevision.commitMessage || 'Manual reassessment',
          authorName: owner,
          timestamp: new Date().toISOString(),
          filesChanged: []
        }
      ];
    }

    // 3. Run Analysis
    const analysis = await analyzeRepositoryAgainstRequirements(
      {
        owner,
        repo,
        defaultBranch: assessment.repository.defaultBranch,
        commitSha: assessment.repository.latestCommitSha,
        fileTree,
        commits
      },
      assessment.internship.requirements
    );

    const newRevNumber = assessment.currentRevisionNumber + 1;
    const demonstratedCount = analysis.evidenceList.filter(e => e.status === 'demonstrated').length;
    const partialCount = analysis.evidenceList.filter(e => e.status === 'partial').length;
    const notDemonstratedCount = analysis.evidenceList.filter(e => e.status === 'not_demonstrated').length;
    const now = new Date().toISOString();

    const newRev: AssessmentRevision = {
      id: `rev-${assessment.id}-${newRevNumber}`,
      assessmentId: assessment.id,
      revisionNumber: newRevNumber,
      commitSha: assessment.repository.latestCommitSha,
      commitMessage: 'Manual reassessment request',
      triggerType: 'manual',
      evidence: analysis.evidenceList,
      demonstratedCount,
      partialCount,
      notDemonstratedCount,
      scoringRuleVersion: SCORING_RULE_VERSION,
      analysisScope: analysis.analysisScope,
      aiSignals: analysis.aiSignals,
      createdAt: now
    };

    saveRevision(newRev);

    const activity: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assessmentId: assessment.id,
      eventType: 'reassessment_completed',
      title: `Manual Reassessment Completed (Rev #${newRevNumber})`,
      description: `Re-evaluated ${analysis.evidenceList.length} internship requirements against repository state.`,
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
