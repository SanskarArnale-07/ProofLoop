import { NextRequest, NextResponse } from 'next/server';
import { parseGitHubRepoUrl, fetchRepoDetails, fetchUserRepos } from '@/lib/github';
import { safeParseJson, validateRepoUrlInput, validateGitHubUsername, extractAuthToken } from '@/lib/validation';
import { createErrorResponse } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const { data: body, errorResponse } = await safeParseJson(req);
    if (errorResponse) {
      return errorResponse;
    }

    const { repoUrl, token: bodyToken } = body as Record<string, unknown>;

    const repoVal = validateRepoUrlInput(repoUrl);
    if (!repoVal.valid || !repoVal.cleanUrl) {
      return NextResponse.json({ error: repoVal.error || 'Repository URL is required.' }, { status: 400 });
    }

    const parsed = parseGitHubRepoUrl(repoVal.cleanUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid GitHub repository format. Expected: https://github.com/owner/repo or owner/repo' },
        { status: 400 }
      );
    }

    const token = extractAuthToken(req, bodyToken);
    const repoInfo = await fetchRepoDetails(parsed.owner, parsed.repo, token);

    return NextResponse.json({
      success: true,
      repo: repoInfo
    });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to inspect GitHub repository.', 400);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUsername = searchParams.get('username');

    const userVal = validateGitHubUsername(rawUsername);
    if (!userVal.valid || !userVal.cleanUsername) {
      return NextResponse.json({ error: userVal.error || 'Username parameter required.' }, { status: 400 });
    }

    const token = extractAuthToken(req, searchParams.get('token'));
    const repos = await fetchUserRepos(userVal.cleanUsername, token);
    return NextResponse.json({ success: true, repos });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to fetch repositories', 500);
  }
}
