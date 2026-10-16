import { NextRequest, NextResponse } from 'next/server';
import { listAssessments, saveAssessment } from '@/lib/db';
import { ensureSampleDataSeeded } from '@/lib/sample-data';
import { parseGitHubRepoUrl, fetchRepoDetails, fetchRepoCommits, fetchRepoTree } from '@/lib/github';
import { analyzeRepositoryAgainstRequirements } from '@/lib/analyzer';
import { Assessment, AssessmentRevision, ActivityEvent, InternshipPosting } from '@/lib/types';
import { SCORING_RULE_VERSION } from '@/lib/scoring';
import { safeParseJson, validateInternshipPayload, validateRepoUrlInput, extractAuthToken } from '@/lib/validation';
import { createErrorResponse } from '@/lib/errors';

export async function GET() {
  try {
    ensureSampleDataSeeded();
    const assessments = listAssessments();
    return NextResponse.json({ success: true, assessments });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to list assessments');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data: body, errorResponse } = await safeParseJson<Record<string, unknown>>(req);
    if (errorResponse) {
      return errorResponse;
    }

    const { internship, repoUrl, token } = (body || {}) as {
      internship?: unknown;
      repoUrl?: unknown;
      token?: unknown;
    };

    const internshipVal = validateInternshipPayload(internship);
    if (!internshipVal.valid || !internshipVal.cleanPosting) {
      return NextResponse.json(
        { error: internshipVal.error || 'Valid internship posting with requirements is required.' },
        { status: 400 }
      );
    }

    const repoVal = validateRepoUrlInput(repoUrl);
    if (!repoVal.valid || !repoVal.cleanUrl) {
      return NextResponse.json(
        { error: repoVal.error || 'Valid repository URL is required.' },
        { status: 400 }
      );
    }

    const authToken = extractAuthToken(req, token);

    const parsed = parseGitHubRepoUrl(repoVal.cleanUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid GitHub repository format. Expected: https://github.com/owner/repo or owner/repo' },
        { status: 400 }
      );
    }

    // 1. Fetch Repository Details
    const repoInfo = await fetchRepoDetails(parsed.owner, parsed.repo, authToken);

    // 2. Fetch Commits (multi-commit history)
    let commits = [];
    try {
      commits = await fetchRepoCommits(parsed.owner, parsed.repo, repoInfo.defaultBranch, 25, authToken);
    } catch (err) {
      console.warn('Could not fetch commit history, proceeding with default commit info:', err);
      commits = [
        {
          sha: repoInfo.latestCommitSha,
          message: repoInfo.latestCommitMessage,
          authorName: repoInfo.owner,
          timestamp: new Date().toISOString(),
          filesChanged: []
        }
      ];
    }

    // 3. Fetch File Tree
    const fileTree = await fetchRepoTree(parsed.owner, parsed.repo, repoInfo.defaultBranch, authToken);

    // 4. Run Evidence-Based Analysis with Deterministic Ranking & AI Signal Analysis
    const analysis = await analyzeRepositoryAgainstRequirements(
      {
        owner: parsed.owner,
        repo: parsed.repo,
        defaultBranch: repoInfo.defaultBranch,
        commitSha: repoInfo.latestCommitSha,
        fileTree,
        commits,
        token: authToken
      },
      (internship as InternshipPosting).requirements
    );

    const assessmentId = `assess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const demonstratedCount = analysis.evidenceList.filter(e => e.status === 'demonstrated').length;
    const partialCount = analysis.evidenceList.filter(e => e.status === 'partial').length;
    const notDemonstratedCount = analysis.evidenceList.filter(e => e.status === 'not_demonstrated').length;

    const initialRevision: AssessmentRevision = {
      id: `rev-${assessmentId}-1`,
      assessmentId,
      revisionNumber: 1,
      commitSha: repoInfo.latestCommitSha,
      commitMessage: repoInfo.latestCommitMessage,
      triggerType: 'initial',
      evidence: analysis.evidenceList,
      demonstratedCount,
      partialCount,
      notDemonstratedCount,
      scoringRuleVersion: SCORING_RULE_VERSION,
      analysisScope: analysis.analysisScope,
      aiSignals: analysis.aiSignals,
      createdAt: now
    };

    const initialActivity: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assessmentId,
      eventType: 'assessment_created',
      title: 'Initial Repository Assessment Completed',
      description: `Evaluated ${analysis.evidenceList.length} internship requirements against ${repoInfo.fullName} (${repoInfo.latestCommitSha}).`,
      commitSha: repoInfo.latestCommitSha,
      timestamp: now
    };

    const assessment: Assessment = {
      id: assessmentId,
      internship: internship as InternshipPosting,
      repository: {
        fullName: repoInfo.fullName,
        url: repoInfo.url,
        defaultBranch: repoInfo.defaultBranch,
        isPrivate: repoInfo.isPrivate,
        language: repoInfo.language || undefined,
        latestCommitSha: repoInfo.latestCommitSha
      },
      currentRevisionNumber: 1,
      status: 'completed',
      latestRevision: initialRevision,
      tasks: analysis.tasks,
      recentActivity: [initialActivity],
      analysisScope: analysis.analysisScope,
      aiSignals: analysis.aiSignals,
      createdAt: now,
      updatedAt: now
    };

    // Save to SQLite database
    saveAssessment(assessment);

    return NextResponse.json({
      success: true,
      assessmentId,
      assessment
    }, { status: 201 });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Internal server error during assessment');
  }
}
