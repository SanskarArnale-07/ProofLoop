import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, saveRevision, addActivityEvent, recordAssessmentFailure } from '@/lib/db';
import { fetchRepoTree, fetchRepoCommits } from '@/lib/github';
import { analyzeRepositoryAgainstRequirements } from '@/lib/analyzer';
import { AssessmentRevision, ActivityEvent } from '@/lib/types';
import { SCORING_RULE_VERSION } from '@/lib/scoring';
import { validateId, extractAuthToken } from '@/lib/validation';
import { createErrorResponse, sanitizeErrorMessage } from '@/lib/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let assessmentId = '';
  try {
    const { id } = await params;
    const idVal = validateId(id, 'Assessment ID');
    if (!idVal.valid || !idVal.cleanId) {
      return NextResponse.json({ error: idVal.error || 'Invalid assessment ID format.' }, { status: 400 });
    }

    assessmentId = idVal.cleanId;
    const assessment = getAssessment(assessmentId);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Optional JSON body parsing (for optional token)
    let bodyToken: unknown;
    try {
      const rawText = await req.text();
      if (rawText && rawText.trim().length > 0) {
        const parsedBody = JSON.parse(rawText) as Record<string, unknown>;
        if (typeof parsedBody === 'object' && parsedBody !== null) {
          bodyToken = parsedBody.token;
        }
      }
    } catch {
      return NextResponse.json(
        { error: 'Malformed JSON payload in request body.' },
        { status: 400 }
      );
    }

    // Extract authorization token from header or optional body
    const token = extractAuthToken(req, bodyToken);

    const [owner, repo] = assessment.repository.fullName.split('/');

    // 1. Fetch File Tree
    let fileTree = [];
    try {
      fileTree = await fetchRepoTree(owner, repo, assessment.repository.defaultBranch, token);
    } catch {
      fileTree = assessment.latestRevision.evidence
        .filter(e => e.filePath)
        .map(e => ({ path: e.filePath!, mode: '100644', type: 'blob' as const, sha: 'curr' }));
    }

    // 2. Fetch Commits
    let commits = [];
    try {
      commits = await fetchRepoCommits(owner, repo, assessment.repository.defaultBranch, 20, token);
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
        commits,
        token
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

    const updated = getAssessment(assessmentId);
    return NextResponse.json({ success: true, assessment: updated });
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : 'Failed to trigger reassessment';
    const sanitizedMsg = sanitizeErrorMessage(rawMsg);
    console.error('Manual reassessment error:', sanitizedMsg);

    // Preserve previous assessment upon reassessment failure
    if (assessmentId) {
      recordAssessmentFailure(assessmentId, sanitizedMsg);
    }

    return createErrorResponse(
      error,
      sanitizedMsg,
      500,
      { message: 'Reassessment failed. Previous assessment history was preserved.' }
    );
  }
}
