import { CommitInfo } from './types';

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

export interface CommitFileDiff {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface DetailedCommit extends CommitInfo {
  diffs?: CommitFileDiff[];
}

/**
 * Checks whether a given relative file path points to sensitive files,
 * tokens, private keys, or environment files that MUST NEVER be accessed or exposed.
 */
export function isSensitivePath(filePath: string): boolean {
  if (!filePath) return true;
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();

  // Directory traversal check
  if (normalized.includes('../') || normalized.startsWith('/')) {
    return true;
  }

  const sensitivePatterns = [
    /(?:^|\/)\.env(?:\..*)?$/i,
    /(?:^|\/)(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\..*)?$/i,
    /\.(?:pem|key|pkcs12|pfx|p12|keystore)$/i,
    /(?:^|\/)(?:secrets?|credentials?|passwords?)\.(?:json|ya?ml|txt|ini)$/i,
    /(?:^|\/)(?:service-account|client-secret)\.(?:json|ya?ml)$/i,
    /(?:^|\/)npmrc$/i,
    /(?:^|\/)dockercfg$/i
  ];

  return sensitivePatterns.some(pattern => pattern.test(normalized));
}

/**
 * Redacts potential secret keys, bearer tokens, or password strings from code snippets or diffs.
 */
export function redactSensitiveContent(content: string): string {
  if (!content) return '';
  return content
    .replace(/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{16,}/g, '[REDACTED_API_KEY]')
    .replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/(?:password|secret|apikey|api_key|access_token|auth_token)\s*[:=]\s*["'](?!(?:\[REDACTED))[^"'\n]{6,}["']/gi, match => {
      const parts = match.split(/[:=]/);
      return `${parts[0]}= "[REDACTED_API_KEY]"`;
    });
}

export function parseGitHubRepoUrl(input: string): { owner: string; repo: string } | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/\.git$/, '');

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

/**
 * Robust fetch wrapper with timeout, rate limit detection, and bounded retry for transient 5xx errors.
 */
async function fetchGitHubWithRetry(
  url: string,
  options: RequestInit,
  retries: number = 1
): Promise<Response> {
  const timeoutMs = 10000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Check rate limit
      if (response.status === 403) {
        const rateRemaining = response.headers.get('x-ratelimit-remaining');
        if (rateRemaining === '0') {
          const resetTime = response.headers.get('x-ratelimit-reset');
          const resetDate = resetTime ? new Date(parseInt(resetTime, 10) * 1000).toLocaleTimeString() : 'shortly';
          throw new Error(`GitHub API rate limit exceeded. Limit resets at ${resetDate}. Please provide a GITHUB_TOKEN or retry later.`);
        }
      }

      // Retry transient server errors
      if (response.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, 600));
        continue;
      }

      return response;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (attempt >= retries) {
        throw err;
      }
      await new Promise(r => setTimeout(r, 600));
    }
  }

  throw new Error(`Failed to request ${url} after ${retries} retries`);
}

export async function fetchRepoDetails(owner: string, repo: string, token?: string): Promise<GitHubRepoInfo> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetchGitHubWithRetry(url, {
    headers: getHeaders(token),
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repository ${owner}/${repo} not found or is private without authorized credentials.`);
    }
    if (response.status === 403) {
      throw new Error(`GitHub access forbidden: ${response.statusText}`);
    }
    throw new Error(`Failed to fetch repository ${owner}/${repo}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  let latestCommitSha = 'HEAD';
  let latestCommitMessage = 'Latest commit';
  try {
    const commits = await fetchRepoCommits(owner, repo, data.default_branch || 'main', 1, token);
    if (commits.length > 0) {
      latestCommitSha = commits[0].sha.substring(0, 7);
      latestCommitMessage = commits[0].message.split('\n')[0];
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

/**
 * Retrieves multiple commits with pagination support.
 */
export async function fetchRepoCommits(
  owner: string,
  repo: string,
  branch: string = 'main',
  limit: number = 20,
  token?: string
): Promise<CommitInfo[]> {
  const perPage = Math.min(100, Math.max(1, limit));
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`;

  const response = await fetchGitHubWithRetry(url, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 409) {
      // 409 Git Repository is empty
      return [];
    }
    throw new Error(`Failed to fetch commits for ${owner}/${repo}: ${response.status} ${response.statusText}`);
  }

  const list = await response.json();
  if (!Array.isArray(list)) return [];

  return list.map((item: Record<string, unknown>) => {
    const commitObj = (item.commit as Record<string, unknown>) || {};
    const authorObj = (commitObj.author as Record<string, unknown>) || {};
    const committerObj = (commitObj.committer as Record<string, unknown>) || {};

    return {
      sha: (item.sha as string) || '',
      message: (commitObj.message as string) || '',
      authorName: (authorObj.name as string) || 'Unknown Author',
      authorEmail: (authorObj.email as string) || undefined,
      committerName: (committerObj.name as string) || undefined,
      timestamp: (authorObj.date as string) || new Date().toISOString(),
      filesChanged: [] // Populated when fetching detailed commit
    };
  });
}

/**
 * Retrieves detailed commit data including file changes and diff patches.
 */
export async function fetchCommitDetails(
  owner: string,
  repo: string,
  sha: string,
  token?: string
): Promise<DetailedCommit> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
  const response = await fetchGitHubWithRetry(url, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch commit ${sha} for ${owner}/${repo}: ${response.statusText}`);
  }

  const data = await response.json();
  const commitObj = data.commit || {};
  const authorObj = commitObj.author || {};
  const committerObj = commitObj.committer || {};

  const files = Array.isArray(data.files) ? data.files : [];
  const diffs: CommitFileDiff[] = files.map((f: Record<string, unknown>) => ({
    filename: f.filename as string,
    status: (f.status as CommitFileDiff['status']) || 'modified',
    additions: (f.additions as number) || 0,
    deletions: (f.deletions as number) || 0,
    patch: f.patch ? redactSensitiveContent(f.patch as string) : undefined
  }));

  const filesChanged = diffs.map(d => d.filename);

  return {
    sha: data.sha || sha,
    message: commitObj.message || '',
    authorName: authorObj.name || 'Unknown',
    authorEmail: authorObj.email,
    committerName: committerObj.name,
    timestamp: authorObj.date || new Date().toISOString(),
    filesChanged,
    additions: data.stats?.additions,
    deletions: data.stats?.deletions,
    diffs
  };
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string = 'main',
  token?: string
): Promise<GitHubFileNode[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const response = await fetchGitHubWithRetry(url, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 409) {
      // Empty repo
      return [];
    }
    throw new Error(`Failed to fetch file tree for ${owner}/${repo} on branch ${branch}: ${response.statusText}`);
  }

  const data = await response.json();
  const tree: GitHubFileNode[] = data.tree || [];

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
    // Exclude noise
    if (excludedPatterns.some(pattern => pattern.test(node.path))) return false;
    // Exclude secrets from file tree inspection
    if (isSensitivePath(node.path)) return false;
    return true;
  });
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref: string = 'main',
  token?: string
): Promise<string> {
  // Reject sensitive files and traversal paths
  if (isSensitivePath(filePath)) {
    throw new Error(`Access to sensitive file or invalid path "${filePath}" is restricted.`);
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`;
  const response = await fetchGitHubWithRetry(url, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch file ${filePath} from ${owner}/${repo}: ${response.statusText}`);
  }

  const data = await response.json();
  let rawContent = '';

  if (data.encoding === 'base64' && data.content) {
    rawContent = Buffer.from(data.content, 'base64').toString('utf-8');
  } else if (typeof data === 'string') {
    rawContent = data;
  }

  return redactSensitiveContent(rawContent);
}

export async function fetchUserRepos(username: string, token?: string): Promise<GitHubRepoInfo[]> {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=15`;
  const response = await fetchGitHubWithRetry(url, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repositories for user ${username}: ${response.statusText}`);
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
