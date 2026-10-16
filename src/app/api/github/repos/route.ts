import { NextRequest, NextResponse } from 'next/server';
import { parseGitHubRepoUrl, fetchRepoDetails, fetchUserRepos } from '@/lib/github';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repoUrl, token } = body;

    if (!repoUrl) {
      return NextResponse.json({ error: 'Repository URL is required.' }, { status: 400 });
    }

    const parsed = parseGitHubRepoUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid GitHub repository format. Expected: https://github.com/owner/repo or owner/repo' },
        { status: 400 }
      );
    }

    const repoInfo = await fetchRepoDetails(parsed.owner, parsed.repo, token);

    return NextResponse.json({
      success: true,
      repo: repoInfo
    });
  } catch (error: any) {
    console.error('GitHub repo validation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to inspect GitHub repository.' },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const token = searchParams.get('token') || undefined;

    if (!username) {
      return NextResponse.json({ error: 'Username parameter required.' }, { status: 400 });
    }

    const repos = await fetchUserRepos(username, token);
    return NextResponse.json({ success: true, repos });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch repositories' }, { status: 500 });
  }
}
