import {
  InternshipRequirement,
  RepositoryEvidence,
  Assessment,
  AssessmentRevision,
  ScannedRepoInfo,
  SuggestedRole,
  ProfileScanRecord
} from './types';
import { SCORING_RULE_VERSION, rankEvidenceDeterministically } from './scoring';
import {
  fetchFileContent,
  fetchRepoTree,
  redactSensitiveContent,
  GitHubFileNode
} from './github';
import { evaluateRepositoryCore, createGapTask } from './analyzer';
import {
  saveAssessment,
  saveRepoScanCache,
  getRepoScanCache,
  saveProfileScan,
  updateProfileScanProgress
} from './db';
import { generateJson } from './ai/provider';
import { triggerBackgroundGapReportGeneration } from './ai/gap-coach';

const TOTAL_SCAN_BUDGET_MS = 90000; // 90-second total budget
const MAX_CONCURRENCY = 3;

/**
 * Validates and extracts a clean GitHub username from profile URLs or raw handles.
 * Accepts: "https://github.com/name", "github.com/name", "name"
 */
export function parseGitHubUsername(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/^@/, '').replace(/\/+$/, '');
  if (!cleaned) return null;

  // If it starts with http:// or https://, host must be github.com
  if (/^https?:\/\//i.test(cleaned)) {
    const urlMatch = cleaned.match(/^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})(?:\/|\?.*|$)/i);
    return urlMatch ? urlMatch[1] : null;
  }

  // If it starts with github.com/
  if (/^github\.com\//i.test(cleaned)) {
    const ghMatch = cleaned.match(/^github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})(?:\/|\?.*|$)/i);
    return ghMatch ? ghMatch[1] : null;
  }

  // If it contains slashes, spaces, or query marks not handled above, reject it
  if (/[/?#\s]/.test(cleaned)) {
    return null;
  }

  // Bare username: 1-39 alphanumeric chars, hyphens or underscores
  const handleMatch = cleaned.match(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,38}$/);
  if (handleMatch) {
    return handleMatch[0];
  }

  return null;
}

function getGitHubHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ProofLoop-Profile-Scanner/1.0'
  };
  const authToken = token || process.env.GITHUB_TOKEN;
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Fetches candidate's public, non-fork, non-archived repos sorted by recently pushed.
 * Capped at SCAN_MAX_REPOS (env or default 6).
 */
export async function fetchCandidateRepos(
  username: string,
  token?: string,
  maxCap?: number
): Promise<ScannedRepoInfo[]> {
  const envCap = parseInt(process.env.SCAN_MAX_REPOS || '6', 10);
  const limit = maxCap || (Number.isFinite(envCap) && envCap > 0 ? envCap : 6);

  const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&direction=desc&per_page=30`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: getGitHubHeaders(token)
    });
  } catch {
    throw new Error('Could not connect to GitHub. Please check your internet connection.');
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`GitHub user "${username}" was not found. Please check the spelling.`);
    }
    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        throw new Error('GitHub limit reached. Try again later or add a GITHUB_TOKEN.');
      }
      throw new Error('GitHub access forbidden. Check permissions or try again later.');
    }
    throw new Error('Could not load repositories from GitHub. Please try again.');
  }

  const rawList = await res.json();
  if (!Array.isArray(rawList)) return [];

  // Filter: non-fork, non-archived, public
  const eligible = rawList.filter(
    (r: Record<string, unknown>) => !r.fork && !r.archived && !r.private
  );

  return eligible.slice(0, limit).map((r: Record<string, unknown>) => ({
    fullName: (r.full_name as string) || `${username}/${r.name}`,
    name: (r.name as string) || 'unknown',
    description: (r.description as string) || null,
    pushedAt: (r.pushed_at as string) || (r.updated_at as string) || new Date().toISOString(),
    language: (r.language as string) || null,
    stars: (r.stargazers_count as number) || 0,
    defaultBranch: (r.default_branch as string) || 'main'
  }));
}

/**
 * Executes async tasks with limited concurrency.
 */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Verifies code proposals: the file must exist and the excerpt must literally be present in it.
 */
export function verifyCodeExcerptInContent(
  fileContent: string,
  proposedExcerpt: string
): { verified: boolean; lineStart?: number; lineEnd?: number } {
  if (!fileContent || !proposedExcerpt || !proposedExcerpt.trim()) {
    return { verified: false };
  }

  const normalizedContent = fileContent.replace(/\r\n/g, '\n');
  const normalizedExcerpt = proposedExcerpt.replace(/\r\n/g, '\n').trim();

  const idx = normalizedContent.indexOf(normalizedExcerpt);
  if (idx === -1) {
    return { verified: false };
  }

  const preLines = normalizedContent.substring(0, idx).split('\n');
  const excerptLines = normalizedExcerpt.split('\n');
  const lineStart = preLines.length;
  const lineEnd = lineStart + excerptLines.length - 1;

  return { verified: true, lineStart, lineEnd };
}

/**
 * Creates a validator for AI-suggested roles.
 * Strictly verifies that every suggested role references ONLY candidate's verified skills,
 * and reason does not exceed 12 words.
 */
export function createRoleSuggestionValidator(verifiedSkillTitles: string[]) {
  const verifiedSkillsSet = new Set(verifiedSkillTitles.map((s) => s.toLowerCase()));

  return (raw: unknown): { isValid: boolean; data?: { roles: SuggestedRole[] }; error?: string } => {
    if (!raw || typeof raw !== 'object') return { isValid: false, error: 'Invalid JSON' };
    const obj = raw as { roles?: unknown };
    if (!Array.isArray(obj.roles)) return { isValid: false, error: 'roles must be an array' };

    const validatedRoles: SuggestedRole[] = [];

    for (const r of obj.roles.slice(0, 4)) {
      if (!r || typeof r !== 'object') continue;
      const roleObj = r as Record<string, unknown>;
      const title = typeof roleObj.title === 'string' ? roleObj.title.trim() : '';
      const reason = typeof roleObj.reason === 'string' ? roleObj.reason.trim() : '';
      const matchedSkills = Array.isArray(roleObj.matchedSkills)
        ? (roleObj.matchedSkills as string[])
            .map((s) => (typeof s === 'string' ? s.trim() : ''))
            .filter(Boolean)
        : [];

      if (!title || !reason || matchedSkills.length === 0) continue;

      // Strictly enforce: matchedSkills must ONLY be from verifiedSkills
      const allSkillsVerified = matchedSkills.every((s) =>
        verifiedSkillsSet.has(s.toLowerCase())
      );
      if (!allSkillsVerified) {
        return { isValid: false, error: `Role "${title}" references unverified skills.` };
      }

      // Enforce 12-word max reason
      const words = reason.split(/\s+/).filter(Boolean);
      if (words.length > 12) {
        return { isValid: false, error: `Role reason exceeds 12 words: "${reason}"` };
      }

      validatedRoles.push({
        title,
        matchedSkills: matchedSkills.slice(0, 3),
        reason,
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(title + ' jobs')}`
      });
    }

    if (validatedRoles.length === 0) {
      return { isValid: false, error: 'No valid roles found' };
    }

    return { isValid: true, data: { roles: validatedRoles } };
  };
}

/**
 * Deterministic rule-based fallback for role suggestions based on verified evidence.
 */
export function buildRuleBasedRoleSuggestions(
  verifiedEvidence: RepositoryEvidence[]
): SuggestedRole[] {
  const verifiedSkills = verifiedEvidence
    .filter((e) => e.status === 'demonstrated' || (e.scoreBreakdown?.score || 0) >= 60)
    .map((e) => e.requirementTitle);

  if (verifiedSkills.length === 0) {
    return [];
  }

  const roleTemplates: Array<{
    title: string;
    matcher: (skills: string[]) => string[];
    defaultReason: string;
  }> = [
    {
      title: 'Backend Developer',
      matcher: (skills) => skills.filter((s) => /api|backend|database|sql|server|node|go|rest/i.test(s)),
      defaultReason: 'Proven hands-on work with server endpoints and databases.'
    },
    {
      title: 'Full-Stack Developer',
      matcher: (skills) => skills.filter((s) => /api|frontend|react|database|typescript|web/i.test(s)),
      defaultReason: 'Verified experience across both client interfaces and backend logic.'
    },
    {
      title: 'DevOps & Infrastructure Engineer',
      matcher: (skills) => skills.filter((s) => /docker|ci\/cd|devops|cloud|container|linux|git/i.test(s)),
      defaultReason: 'Demonstrated automated deployment scripts and container configurations.'
    },
    {
      title: 'QA & Test Automation Engineer',
      matcher: (skills) => skills.filter((s) => /test|assert|qa|coverage|unit/i.test(s)),
      defaultReason: 'Verified automated test suites with concrete assertions in code.'
    },
    {
      title: 'Frontend Developer',
      matcher: (skills) => skills.filter((s) => /frontend|react|typescript|css|ui|components/i.test(s)),
      defaultReason: 'Demonstrated component architecture and client-side styling.'
    }
  ];

  const suggested: SuggestedRole[] = [];
  for (const template of roleTemplates) {
    if (suggested.length >= 4) break;
    const matches = template.matcher(verifiedSkills);
    if (matches.length > 0) {
      suggested.push({
        title: template.title,
        matchedSkills: matches.slice(0, 3),
        reason: template.defaultReason,
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(template.title + ' jobs')}`
      });
    }
  }

  return suggested;
}

/**
 * Suggests up to 4 roles that fit the candidate based ONLY on verified skills.
 * Plain English, max 12-word reason per role, no fake salaries/companies.
 */
export async function suggestRolesFromVerifiedEvidence(
  verifiedEvidence: RepositoryEvidence[]
): Promise<SuggestedRole[]> {
  const verifiedSkills = verifiedEvidence
    .filter((e) => e.status === 'demonstrated' || (e.scoreBreakdown?.score || 0) >= 60)
    .map((e) => e.requirementTitle);

  if (verifiedSkills.length === 0) {
    return [];
  }

  const validator = createRoleSuggestionValidator(verifiedSkills);

  // Try cheap AI suggestion first
  try {
    const prompt = `
CRITICAL INSTRUCTION:
Candidate has verified code evidence for ONLY these skills: ${JSON.stringify(verifiedSkills)}
Suggest up to 4 software engineering roles they fit.
STRICT RULES:
1. Every role MUST list 1 to 3 "matchedSkills" chosen ONLY from the candidate's verified skills list above. Reject any other skills.
2. "reason": ONE short sentence, maximum 12 words. Plain friendly words only.
3. NEVER invent company names, salaries, hiring odds, or job postings.

Respond ONLY with valid JSON:
{
  "roles": [
    {
      "title": "Role Title",
      "matchedSkills": ["Skill 1", "Skill 2"],
      "reason": "Short reason under twelve words."
    }
  ]
}
`;

    const aiResult = await generateJson<{
      roles: SuggestedRole[];
    }>(
      prompt,
      (raw) => {
        const res = validator(raw);
        if (res.isValid) {
          // res.data is guaranteed to exist when isValid is true per validator implementation
          return { valid: true, data: res.data! };
        } else {
          return { valid: false, error: res.error ?? 'Validation failed' };
        }
      },
      { timeoutMs: 8000 }
    );

    if (aiResult?.roles && aiResult.roles.length > 0) {
      return aiResult.roles;
    }
  } catch {
    // Fall back to rule-based matching
  }

  return buildRuleBasedRoleSuggestions(verifiedEvidence);
}

export interface ProfileScanExecutionOptions {
  scanId: string;
  username: string;
  internship: Assessment['internship'];
  token?: string;
  maxRepos?: number;
}

/**
 * Runs the complete profile scan across the candidate's repositories:
 * 1. Discovers up to 6 non-fork public repositories.
 * 2. Checks per-repo cache to skip unchanged repos.
 * 3. Evaluates repos with concurrency limit 3.
 * 4. Merges best evidence across all repos.
 * 5. Saves a NORMAL Assessment so Dashboard, Roadmap, and AI Gap Coach all work seamlessly.
 */
export async function executeProfileScan(
  options: ProfileScanExecutionOptions
): Promise<ProfileScanRecord> {
  const { scanId, username, internship, token, maxRepos } = options;
  const startTime = Date.now();
  let isPartial = false;

  await updateProfileScanProgress(scanId, 'Finding your public repositories...');

  let repos: ScannedRepoInfo[];
  try {
    repos = await fetchCandidateRepos(username, token, maxRepos);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Failed to discover public repositories.';
    const failedScan: ProfileScanRecord = {
      id: scanId,
      username,
      internshipId: internship.id,
      scannedRepos: [],
      bestEvidence: [],
      suggestedRoles: [],
      status: 'failed',
      errorMessage: errMsg,
      isPartial: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await saveProfileScan(failedScan);
    return failedScan;
  }

  if (repos.length === 0) {
    const emptyScan: ProfileScanRecord = {
      id: scanId,
      username,
      internshipId: internship.id,
      scannedRepos: [],
      bestEvidence: [],
      suggestedRoles: [],
      status: 'failed',
      errorMessage: 'No public repositories found for this GitHub account.',
      isPartial: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await saveProfileScan(emptyScan);
    return emptyScan;
  }

  const repoEvidenceMap = new Map<string, RepositoryEvidence[]>();

  // Scan repositories concurrently with budget check
  let processedCount = 0;
  await mapConcurrent(repos, MAX_CONCURRENCY, async (repo) => {
    // Check 90s budget
    if (Date.now() - startTime >= TOTAL_SCAN_BUDGET_MS - 5000) {
      isPartial = true;
      return;
    }

    processedCount++;
    await updateProfileScanProgress(
      scanId,
      `Scanning repo ${processedCount} of ${repos.length} (${repo.name})...`
    );

    // 1. Check cache
    try {
      const cached = await getRepoScanCache(repo.fullName, repo.pushedAt);
      if (cached && cached.length > 0) {
        repoEvidenceMap.set(repo.fullName, cached);
        return;
      }
    } catch {
      // Non-critical cache check error
    }

    // 2. Fetch repo file tree & evaluate
    try {
      const [owner, name] = repo.fullName.split('/');
      let fileTree: GitHubFileNode[] = [];
      try {
        fileTree = await fetchRepoTree(owner, name, repo.defaultBranch, token);
      } catch {
        fileTree = [];
      }

      const coreResult = await evaluateRepositoryCore({
        repoFullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        requirements: internship.requirements,
        token,
        fileTree
      });

      if (coreResult.success && coreResult.evidenceList) {
        repoEvidenceMap.set(repo.fullName, coreResult.evidenceList);
        try {
          await saveRepoScanCache(repo.fullName, repo.pushedAt, coreResult.evidenceList);
        } catch {
          // Non-critical
        }
      }
    } catch (repoErr) {
      console.warn(`[Profile Scanner] Skipped repo ${repo.fullName}:`, repoErr instanceof Error ? repoErr.message : repoErr);
    }
  });

  await updateProfileScanProgress(scanId, 'Comparing skills across repositories...');

  // Merge: for each requirement, pick the SINGLE BEST evidence across all scanned repos
  const bestEvidenceList: RepositoryEvidence[] = [];

  for (const req of internship.requirements) {
    let bestEv: RepositoryEvidence | null = null;
    let highestScore = -1;

    for (const [repoFullName, evList] of repoEvidenceMap.entries()) {
      const ev = evList.find((e) => e.requirementId === req.id);
      if (!ev) continue;

      const score = ev.scoreBreakdown?.score ?? (ev.status === 'demonstrated' ? 80 : ev.status === 'partial' ? 40 : 0);
      if (score > highestScore) {
        highestScore = score;
        bestEv = {
          ...ev,
          repoFullName // explicitly ensure repoFullName is preserved
        };
      }
    }

    if (bestEv) {
      bestEvidenceList.push(bestEv);
    } else {
      // Not found in any repo
      bestEvidenceList.push({
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'not_demonstrated',
        evidenceType: 'none',
        evidenceStrength: 'none',
        explanation: `No verified evidence discovered across ${repos.length} public repositories scanned.`,
        humanReadableExplanation: `Not found across ${repos.length} scanned repositories.`,
        repoFullName: repos[0]?.fullName || `profile/${username}`,
        commitSha: 'profile-scan',
        confidence: 88,
        relevantCommits: [],
        relevantFiles: [],
        scoreBreakdown: {
          score: 0,
          rank: 0,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 0,
          testBonus: 0,
          continuityBonus: 0,
          factors: [`No evidence found in ${repos.length} scanned repositories.`]
        }
      });
    }
  }

  // Deterministically rank final merged evidence
  const rankedEvidence = rankEvidenceDeterministically(bestEvidenceList);

  await updateProfileScanProgress(scanId, 'Finding other roles that fit you...');

  // Suggest other matching roles based on verified evidence
  const suggestedRoles = await suggestRolesFromVerifiedEvidence(rankedEvidence);

  await updateProfileScanProgress(scanId, 'Saving your results...');

  // Create NORMAL Assessment so Dashboard, Roadmap, and AI Gap Coach all work seamlessly
  const assessmentId = `assess-profile-${username.toLowerCase()}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const demonstratedCount = rankedEvidence.filter((e) => e.status === 'demonstrated').length;
  const partialCount = rankedEvidence.filter((e) => e.status === 'partial').length;
  const notDemonstratedCount = rankedEvidence.filter((e) => e.status === 'not_demonstrated').length;

  const normalRevision: AssessmentRevision = {
    id: `rev-${assessmentId}-1`,
    assessmentId,
    revisionNumber: 1,
    commitSha: 'profile-scan',
    commitMessage: `profile: ${username}, ${repos.length} repos`,
    triggerType: 'initial',
    evidence: rankedEvidence,
    demonstratedCount,
    partialCount,
    notDemonstratedCount,
    scoringRuleVersion: SCORING_RULE_VERSION,
    createdAt: now
  };

  const tasks = rankedEvidence.map((ev) => {
    const matchedReq = internship.requirements.find((r) => r.id === ev.requirementId) || {
      id: ev.requirementId,
      category: 'core' as const,
      title: ev.requirementTitle,
      description: ev.explanation,
      importance: 'required' as const
    };
    return createGapTask(matchedReq, ev);
  });

  const normalAssessment: Assessment = {
    id: assessmentId,
    internship,
    repository: {
      fullName: `profile/${username}`,
      url: `https://github.com/${username}`,
      defaultBranch: 'main',
      isPrivate: false,
      language: 'Multiple',
      latestCommitSha: 'profile-scan'
    },
    currentRevisionNumber: 1,
    status: 'completed',
    latestRevision: normalRevision,
    tasks,
    recentActivity: [
      {
        id: `act-${Date.now()}`,
        assessmentId,
        eventType: 'assessment_created',
        title: `GitHub Profile Auto-Scan: ${username}`,
        description: `Scanned ${repos.length} public repositories and compiled best evidence across all projects.`,
        commitSha: 'profile-scan',
        timestamp: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  await saveAssessment(normalAssessment);

  // Trigger background AI Gap Coach generation for this new profile assessment
  triggerBackgroundGapReportGeneration(normalAssessment, normalRevision);

  const completedScan: ProfileScanRecord = {
    id: scanId,
    username,
    internshipId: internship.id,
    assessmentId,
    scannedRepos: repos,
    bestEvidence: rankedEvidence,
    suggestedRoles,
    status: isPartial ? 'partial' : 'completed',
    progressMessage: isPartial
      ? `Scan finished with partial results (${processedCount} of ${repos.length} repos scanned).`
      : `Scan complete: ${repos.length} repositories analyzed.`,
    isPartial,
    createdAt: now,
    updatedAt: now
  };

  await saveProfileScan(completedScan);
  return completedScan;
}
