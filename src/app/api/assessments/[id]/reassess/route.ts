import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, saveRevision, addActivityEvent } from '@/lib/db';
import { fetchRepoTree } from '@/lib/github';
import { analyzeRepositoryAgainstRequirements } from '@/lib/analyzer';
import { AssessmentRevision, ActivityEvent } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = getAssessment(id);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const [owner, repo] = assessment.repository.fullName.split('/');
    let fileTree = [];
    try {
      fileTree = await fetchRepoTree(owner, repo, assessment.repository.defaultBranch);
    } catch {
      fileTree = assessment.latestRevision.evidence
        .filter(e => e.filePath)
        .map(e => ({ path: e.filePath!, mode: '100644', type: 'blob' as const, sha: 'curr' }));
    }

    const analysis = await analyzeRepositoryAgainstRequirements(
      {
        owner,
        repo,
        defaultBranch: assessment.repository.defaultBranch,
        commitSha: assessment.repository.latestCommitSha,
        fileTree
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
  } catch (error: any) {
    console.error('Manual reassessment error:', error);
    return NextResponse.json({ error: error.message || 'Failed to trigger reassessment' }, { status: 500 });
  }
}
