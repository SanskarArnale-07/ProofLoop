import { NextRequest, NextResponse } from 'next/server';
import { listAssessments, saveAssessment } from '@/lib/db';
import { ensureSampleDataSeeded } from '@/lib/sample-data';
import { parseGitHubRepoUrl, fetchRepoDetails, fetchRepoCommits, fetchRepoTree } from '@/lib/github';
import { analyzeRepositoryAgainstRequirements } from '@/lib/analyzer';
import { Assessment, AssessmentRevision, ActivityEvent, InternshipPosting } from '@/lib/types';
import { SCORING_RULE_VERSION } from '@/lib/scoring';
import { triggerBackgroundGapReportGeneration } from '@/lib/ai/gap-coach';

export async function GET() {
  try {
    await ensureSampleDataSeeded();
    const assessments = await listAssessments();
    return NextResponse.json({ success: true, assessments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list assessments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      console.warn('[Assessment Creation] Rejected request: Invalid JSON body');
      return NextResponse.json({ error: 'Invalid JSON request payload' }, { status: 400 });
    }

    const { internship, repoUrl, token } = body as {
      internship?: unknown;
      repoUrl?: unknown;
      token?: unknown;
    };

    if (!internship || typeof internship !== 'object') {
      console.warn('[Assessment Creation] Rejected request: Missing or invalid internship object');
      return NextResponse.json(
        { error: 'Valid internship posting with requirements is required.' },
        { status: 400 }
      );
    }

    const posting = internship as Record<string, unknown>;
    if (!posting.requirements || !Array.isArray(posting.requirements) || posting.requirements.length === 0) {
      console.warn('[Assessment Creation] Rejected request: Empty requirements array');
      return NextResponse.json(
        { error: 'Valid internship posting with requirements is required.' },
        { status: 400 }
      );
    }

    if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
      console.warn('[Assessment Creation] Rejected request: Missing repoUrl');
      return NextResponse.json(
        { error: 'Repository URL is required.' },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const authToken = (typeof token === 'string' && token.trim()) ? token.trim() : bearerToken;

    const parsed = parseGitHubRepoUrl(repoUrl.trim());
    if (!parsed) {
      console.warn(`[Assessment Creation] Rejected request: Could not parse repo URL "${repoUrl}"`);
      return NextResponse.json(
        { error: 'Invalid GitHub repository format. Expected: https://github.com/owner/repo or owner/repo' },
        { status: 400 }
      );
    }

    console.log(`[Assessment Creation] Starting assessment: repo=${parsed.owner}/${parsed.repo}, requirementsCount=${posting.requirements.length}, hasAuthToken=${Boolean(authToken)}`);

    // 1. Fetch Repository Details
    const tDetails = Date.now();
    const repoInfo = await fetchRepoDetails(parsed.owner, parsed.repo, authToken);
    console.log(`[Assessment Creation] Fetched repo details in ${Date.now() - tDetails}ms: defaultBranch="${repoInfo.defaultBranch}", commit=${repoInfo.latestCommitSha}, isPrivate=${repoInfo.isPrivate}`);

    // 2. Fetch Commits (multi-commit history)
    let commits = [];
    const tCommits = Date.now();
    try {
      commits = await fetchRepoCommits(parsed.owner, parsed.repo, repoInfo.defaultBranch, 25, authToken);
      console.log(`[Assessment Creation] Fetched ${commits.length} commits in ${Date.now() - tCommits}ms`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Assessment Creation] Could not fetch commit history (${errMsg}), proceeding with default commit info`);
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
    const tTree = Date.now();
    const fileTree = await fetchRepoTree(parsed.owner, parsed.repo, repoInfo.defaultBranch, authToken);
    console.log(`[Assessment Creation] Fetched tree with ${fileTree.length} files in ${Date.now() - tTree}ms`);

    // 4. Run Evidence-Based Analysis with Deterministic Ranking & AI Signal Analysis
    const tAnalysis = Date.now();
    console.log(`[Assessment Creation] Analyzing repository against ${posting.requirements.length} requirements...`);
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

    const demonstratedCount = analysis.evidenceList.filter(e => e.status === 'demonstrated').length;
    const partialCount = analysis.evidenceList.filter(e => e.status === 'partial').length;
    const notDemonstratedCount = analysis.evidenceList.filter(e => e.status === 'not_demonstrated').length;
    console.log(`[Assessment Creation] Analysis completed in ${Date.now() - tAnalysis}ms: demonstrated=${demonstratedCount}, partial=${partialCount}, notDemonstrated=${notDemonstratedCount}, tasks=${analysis.tasks.length}`);

    const assessmentId = `assess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

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

    // 5. Save to database
    const tPersist = Date.now();
    await saveAssessment(assessment);
    // Best-effort background AI Gap Coach generation for initial assessment
    triggerBackgroundGapReportGeneration(assessment, assessment.latestRevision);
    console.log(`[Assessment Creation] Persisted assessment "${assessmentId}" in ${Date.now() - tPersist}ms. Total request duration: ${Date.now() - startTime}ms`);

    return NextResponse.json({
      success: true,
      assessmentId,
      assessment
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error during assessment';
    console.error(`[Assessment Creation] Failed after ${Date.now() - startTime}ms:`, message);

    let status = 500;
    if (message.includes('rate limit exceeded') || message.includes('API rate limit')) {
      status = 429;
    } else if (message.includes('not found') || message.includes('is private without authorized')) {
      status = 404;
    } else if (message.includes('Invalid') || message.includes('required')) {
      status = 400;
    }

    return NextResponse.json({ error: message }, { status });
  }
}
