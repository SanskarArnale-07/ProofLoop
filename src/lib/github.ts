export interface GitHubFileNode {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  url: string;
  defaultBranch: string;
  isPrivate: boolean;
  language: string | null;
  stars: number;
  latestCommitSha: string;
  latestCommitMessage: string;
  relevanceScore?: number;
  relevanceReason?: string;
}

export function parseGitHubRepoUrl(input: string): { owner: string; repo: string } | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/\.git$/, '');

  // Handle formats:
  // https://github.com/owner/repo
  // http://github.com/owner/repo
  // github.com/owner/repo
  // owner/repo
  const webMatch = cleaned.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
  if (webMatch) {
    return { owner: webMatch[1], repo: webMatch[2] };
  }

  const shortMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}

function getHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ProofLoop-Career-Coach/1.0'
  };

  const authToken = token || process.env.GITHUB_TOKEN;
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return headers;
}

export async function fetchRepoDetails(owner: string, repo: string, token?: string): Promise<GitHubRepoInfo> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetch(url, {
    headers: getHeaders(token),
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repository ${owner}/${repo} not found or is private without authorized credentials.`);
    }
    if (response.status === 403) {
      const rateRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateRemaining === '0') {
        throw new Error('GitHub API rate limit exceeded. Please provide a GITHUB_TOKEN in your environment or retry shortly.');
      }
      throw new Error(`GitHub access forbidden: ${response.statusText}`);
    }
    throw new Error(`Failed to fetch repository ${owner}/${repo}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Fetch latest commit on default branch
  let latestCommitSha = 'HEAD';
  let latestCommitMessage = 'Latest commit';
  try {
    const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${data.default_branch || 'main'}`, {
      headers: getHeaders(token)
    });
    if (commitsRes.ok) {
      const commitData = await commitsRes.json();
      latestCommitSha = commitData.sha ? commitData.sha.substring(0, 7) : 'HEAD';
      latestCommitMessage = commitData.commit?.message?.split('\n')[0] || 'Commit';
    }
  } catch (err) {
    console.warn('Could not fetch latest commit SHA, falling back to HEAD', err);
  }

  return {
    name: data.name,
    fullName: data.full_name,
    owner: data.owner?.login || owner,
    description: data.description,
    url: data.html_url,
    defaultBranch: data.default_branch || 'main',
    isPrivate: data.private || false,
    language: data.language,
    stars: data.stargazers_count || 0,
    latestCommitSha,
    latestCommitMessage
  };
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string = 'main',
  token?: string
): Promise<GitHubFileNode[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(url, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch file tree for ${owner}/${repo} on branch ${branch}: ${response.statusText}`);
  }

  const data = await response.json();
  const tree: GitHubFileNode[] = data.tree || [];

  // Filter out noise files to conserve bandwidth & focus on meaningful evidence
  const excludedPatterns = [
    /^node_modules\//i,
    /^\.next\//i,
    /^\.git\//i,
    /^dist\//i,
    /^build\//i,
    /^vendor\//i,
    /^target\//i,
    /^__pycache__\//i,
    /\.min\.(js|css)$/i,
    /\.(png|jpe?g|gif|svg|ico|webp|ttf|woff2?|eot|lock|mp4|zip|tar\.gz)$/i,
    /package-lock\.json$/i,
    /yarn\.lock$/i,
    /pnpm-lock\.yaml$/i
  ];

  return tree.filter(node => {
    if (node.type !== 'blob') return false;
    return !excludedPatterns.some(pattern => pattern.test(node.path));
  });
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref: string = 'main',
  token?: string
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(url, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch file ${filePath} from ${owner}/${repo}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.encoding === 'base64' && data.content) {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  if (typeof data === 'string') {
    return data;
  }

  return '';
}

export async function fetchUserRepos(username: string, token?: string): Promise<GitHubRepoInfo[]> {
  const url = `https://api.github.com/users/${username}/repos?sort=updated&per_page=15`;
  const response = await fetch(url, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repositories for user ${username}`);
  }

  const list = await response.json();
  return list.map((item: Record<string, unknown>) => ({
    name: item.name as string,
    fullName: item.full_name as string,
    owner: (item.owner as Record<string, unknown>)?.login as string || username,
    description: (item.description as string) || null,
    url: item.html_url as string,
    defaultBranch: (item.default_branch as string) || 'main',
    isPrivate: Boolean(item.private),
    language: (item.language as string) || null,
    stars: (item.stargazers_count as number) || 0,
    latestCommitSha: 'HEAD',
    latestCommitMessage: 'Latest'
  }));
}
