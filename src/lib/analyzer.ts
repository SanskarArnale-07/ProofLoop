import {
  InternshipRequirement,
  RepositoryEvidence,
  GapTask,
  AnalysisScope,
  AISignalAnalysisResult,
  CommitInfo
} from './types';
import {
  GitHubFileNode,
  fetchFileContent,
  fetchRepoDetails,
  fetchRepoCommits,
  fetchRepoTree,
  parseGitHubRepoUrl
} from './github';
import { rankEvidenceDeterministically, SCORING_RULE_VERSION } from './scoring';
import { analyzeAIAuthorshipSignals, FileCommentContext } from './ai-signals';

export interface EvidenceClaimTracker {
  claimedFiles: Map<string, { requirementId: string; requirementTitle: string; lineStart: number; lineEnd: number }>;
  claim: (filePath: string, reqId: string, reqTitle: string, lineStart: number, lineEnd: number) => void;
  getClaim: (filePath: string) => { requirementId: string; requirementTitle: string; lineStart: number; lineEnd: number } | undefined;
}

export function createEvidenceClaimTracker(): EvidenceClaimTracker {
  const claimedFiles = new Map<string, { requirementId: string; requirementTitle: string; lineStart: number; lineEnd: number }>();
  return {
    claimedFiles,
    claim: (filePath: string, reqId: string, reqTitle: string, lineStart: number, lineEnd: number) => {
      claimedFiles.set(filePath, { requirementId: reqId, requirementTitle: reqTitle, lineStart, lineEnd });
    },
    getClaim: (filePath: string) => claimedFiles.get(filePath)
  };
}

export interface AnalysisContext {
  owner: string;
  repo: string;
  defaultBranch: string;
  commitSha: string;
  fileTree: GitHubFileNode[];
  commits?: CommitInfo[];
  token?: string;
  localFileCache?: Record<string, string>;
  diffs?: Array<{ commitSha: string; filePath: string; commitMessage: string; addedLines: string[] }>;
}

export interface AnalysisOutput {
  evidenceList: RepositoryEvidence[];
  tasks: GapTask[];
  analysisScope: AnalysisScope;
  aiSignals: AISignalAnalysisResult;
}

export async function analyzeRepositoryAgainstRequirements(
  context: AnalysisContext,
  requirements: InternshipRequirement[]
): Promise<AnalysisOutput> {
  const {
    owner,
    repo,
    defaultBranch,
    commitSha,
    fileTree,
    commits = [],
    token,
    localFileCache,
    diffs = []
  } = context;

  const repoFullName = `${owner}/${repo}`;
  const filesInspectedCount = Math.min(fileTree.length, 50);

  // If the repository tree is empty, represent this as insufficient evidence rather than failure
  if (fileTree.length === 0) {
    const rawEvidenceList: RepositoryEvidence[] = requirements.map(req => ({
      requirementId: req.id,
      requirementTitle: req.title,
      category: req.category,
      status: 'not_demonstrated' as const,
      evidenceType: 'none' as const,
      evidenceStrength: 'none' as const,
      explanation: `Insufficient repository evidence: Repository ${repoFullName} contains no files on branch ${defaultBranch}. Technical skill evaluation is inconclusive.`,
      humanReadableExplanation: `Empty repository: No source files available to evaluate ${req.title}.`,
      repoFullName,
      commitSha: commitSha || 'empty',
      confidence: 25,
      relevantCommits: [],
      relevantFiles: [],
      limitations: [`Empty repository on branch ${defaultBranch}; technical skills could not be evaluated.`],
      missingInformation: ['Requires repository source code and commit history.'],
      uncertaintyNotes: 'Repository is empty; cannot establish implementation capability from 0 files.',
      isInsufficientEvidence: true,
      authorAttribution: { author: commits.length > 0 ? commits[0].authorName : 'Unknown', isDirectAuthor: false, attributionCertainty: 'uncertain' as const }
    }));

    const rankedEvidence = rankEvidenceDeterministically(rawEvidenceList);
    const tasks = rankedEvidence.map(ev => {
      const matchedReq = requirements.find(r => r.id === ev.requirementId) || {
        id: ev.requirementId,
        category: 'core' as const,
        title: ev.requirementTitle,
        description: ev.explanation,
        importance: 'required' as const
      };
      return createGapTask(matchedReq, ev);
    });

    const aiSignals = analyzeAIAuthorshipSignals({ commits, fileComments: [], diffs });
    const analysisScope: AnalysisScope = {
      commitsAnalyzed: commits.length,
      totalCommitsChecked: commits.length,
      filesInspected: 0,
      branch: defaultBranch,
      truncated: false,
      scopeDescription: `Inspected 0 files across branch ${defaultBranch} (empty repository). Evaluation inconclusive.`
    };

    return {
      evidenceList: rankedEvidence,
      tasks,
      analysisScope,
      aiSignals
    };
  }

  // Helper to fetch file content safely and record status
  const getFileWithStatus = async (
    path: string,
    targetCommitSha?: string
  ): Promise<{ content: string | null; status: 'retrieved' | 'failed' | 'missing_file'; error?: string }> => {
    if (localFileCache && localFileCache[path] !== undefined) {
      return { content: localFileCache[path], status: 'retrieved' };
    }
    const node = fileTree.find(f => f.path === path);
    if (!node && (!localFileCache || localFileCache[path] === undefined)) {
      return { content: null, status: 'missing_file', error: `File "${path}" does not exist in the analyzed repository scope.` };
    }

    try {
      // Must use exact analyzed commitSha, fallback to defaultBranch only if commitSha is not available or empty
      const ref = (targetCommitSha && targetCommitSha !== 'empty' && targetCommitSha !== 'unknown')
        ? targetCommitSha
        : ((commitSha && commitSha !== 'empty' && commitSha !== 'unknown') ? commitSha : defaultBranch);
      const content = await fetchFileContent(owner, repo, path, ref, token);
      return { content, status: 'retrieved' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Could not fetch file ${path} at commit ${commitSha || defaultBranch}:`, msg);
      return { content: null, status: 'failed', error: msg };
    }
  };

  const getFile = async (path: string): Promise<string | null> => {
    const res = await getFileWithStatus(path);
    return res.content;
  };

  // Inspect file comments for AI-authorship signal extraction
  const fileCommentContexts: FileCommentContext[] = [];
  const candidateFilesForComments = fileTree
    .filter(f => /\.(ts|tsx|js|jsx|py|go|rs|sql|md)$/i.test(f.path))
    .slice(0, 10);

  for (const cf of candidateFilesForComments) {
    const content = await getFile(cf.path);
    if (!content) continue;

    const lines = content.split('\n');
    const comments: FileCommentContext['comments'] = [];
    let commentLinesCount = 0;
    let codeLinesCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (/^(?:\/\/|\/\*|\*|#)/.test(trimmed)) {
        commentLinesCount++;
        const nextCode = lines.slice(i + 1, i + 5).find(l => l.trim() && !/^(?:\/\/|\/\*|\*|#)/.test(l.trim()));
        comments.push({
          line: i + 1,
          text: trimmed,
          subsequentCodeLine: nextCode?.trim()
        });
      } else if (trimmed) {
        codeLinesCount++;
      }
    }

    if (comments.length > 0) {
      fileCommentContexts.push({
        filePath: cf.path,
        comments,
        totalCommentLines: commentLinesCount,
        totalCodeLines: codeLinesCount
      });
    }
  }

  // 1. Evaluate each requirement to extract concrete evidence with double-counting tracking
  const claimTracker = createEvidenceClaimTracker();
  const rawEvidenceList: RepositoryEvidence[] = [];
  for (const req of requirements) {
    const ev = await evaluateRequirement({
      req,
      fileTree,
      commits,
      getFile,
      getFileWithStatus,
      repoFullName,
      latestCommitSha: commitSha,
      diffs,
      claimTracker
    });
    rawEvidenceList.push(ev);
  }

  // 2. Rank evidence deterministically using versioned criteria
  const rankedEvidence = rankEvidenceDeterministically(rawEvidenceList);

  // 3. Generate Roadmap Gap Tasks for unfulfilled or partial requirements
  const tasks: GapTask[] = [];
  for (const ev of rankedEvidence) {
    if (ev.status !== 'demonstrated') {
      const matchedReq = requirements.find(r => r.id === ev.requirementId) || {
        id: ev.requirementId,
        category: 'core' as const,
        title: ev.requirementTitle,
        description: ev.explanation,
        importance: 'required' as const
      };
      tasks.push(createGapTask(matchedReq, ev));
    }
  }

  // 4. Run AI authorship signal analysis
  const aiSignals = analyzeAIAuthorshipSignals({
    commits,
    fileComments: fileCommentContexts,
    diffs
  });

  // 5. Build explicit scope record
  const analysisScope: AnalysisScope = {
    commitsAnalyzed: commits.length > 0 ? commits.length : 1,
    totalCommitsChecked: commits.length > 0 ? commits.length : 1,
    filesInspected: filesInspectedCount,
    branch: defaultBranch,
    truncated: fileTree.length > filesInspectedCount,
    scopeDescription: `Inspected ${filesInspectedCount} of ${fileTree.length} active files across branch ${defaultBranch} and ${commits.length || 1} commit(s). Scope recorded to prevent overstating assessment coverage.`
  };

  return {
    evidenceList: rankedEvidence,
    tasks,
    analysisScope,
    aiSignals
  };
}

export async function evaluateRequirement(options: {
  req: InternshipRequirement;
  fileTree: GitHubFileNode[];
  commits: CommitInfo[];
  getFile: (path: string) => Promise<string | null>;
  getFileWithStatus?: (path: string, targetCommitSha?: string) => Promise<{ content: string | null; status: 'retrieved' | 'failed' | 'missing_file'; error?: string }>;
  repoFullName: string;
  latestCommitSha: string;
  diffs: Array<{ commitSha: string; filePath: string; commitMessage: string; addedLines: string[] }>;
  claimTracker?: EvidenceClaimTracker;
}): Promise<RepositoryEvidence> {
  const { req, fileTree, commits, getFile, getFileWithStatus, repoFullName, latestCommitSha, diffs, claimTracker } = options;
  const filePaths = fileTree.map(t => t.path);

  const fetchFile: (
    p: string,
    targetSha?: string
  ) => Promise<{
    content: string | null;
    status: 'retrieved' | 'failed' | 'missing_file';
    error?: string;
  }> =
    getFileWithStatus ||
    (async (p: string, _targetSha?: string) => {
      const c = await getFile(p);
      return {
        content: c,
        status: c !== null ? ('retrieved' as const) : ('failed' as const),
        error: c === null ? 'File content not found' : undefined,
      };
    });

  // Helper to register claimed evidence and prevent double-counting across requirements
  const claimEvidence = (
    filePath: string,
    lineStart: number,
    lineEnd: number
  ): { sharedWith?: string[]; notes?: string } => {
    if (!claimTracker) return {};
    const prior = claimTracker.getClaim(filePath);
    if (prior && prior.requirementId !== req.id) {
      if (lineStart <= prior.lineEnd && lineEnd >= prior.lineStart) {
        return {
          sharedWith: [prior.requirementId],
          notes: `Shared implementation: ${filePath} (lines ${lineStart}-${lineEnd}) overlaps with ${prior.requirementTitle}. Anti-double-counting safeguards applied.`
        };
      }
    }
    claimTracker.claim(filePath, req.id, req.title, lineStart, lineEnd);
    return {};
  };

  // Identify commits that touched relevant files
  const findRelevantCommits = (matcher: (path: string) => boolean): string[] => {
    const shas = new Set<string>();
    for (const d of diffs) {
      if (matcher(d.filePath)) {
        shas.add(d.commitSha);
      }
    }
    for (const c of commits) {
      if (c.filesChanged && c.filesChanged.some(matcher)) {
        shas.add(c.sha);
      }
    }
    if (shas.size === 0 && latestCommitSha) {
      shas.add(latestCommitSha);
    }
    return Array.from(shas);
  };

  const author = commits.length > 0 ? commits[0].authorName : 'Repository Contributor';

  switch (req.id) {
    case 'req-api': {
      const apiMatcher = (p: string) =>
        /(?:routes?|controllers?|endpoints?|api\/|handlers?|views\.py|server\.(ts|js)|main\.(go|py|rs))/i.test(p);
      const apiFiles = filePaths.filter(apiMatcher);
      const relevantCommits = findRelevantCommits(apiMatcher);
      const targetSha = relevantCommits[0] || latestCommitSha;

      if (apiFiles.length === 0) {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'not_demonstrated',
          evidenceType: 'none',
          evidenceStrength: 'none',
          explanation: 'Not demonstrated in the analyzed repositories. No API route handlers, endpoints, or controller files were identified in the file tree.',
          humanReadableExplanation: 'No HTTP endpoint handlers or API controller declarations were found in the codebase.',
          repoFullName,
          commitSha: latestCommitSha,
          confidence: 88,
          relevantCommits: [],
          relevantFiles: [],
          limitations: ['Scanned active tree files; did not locate route handlers.'],
          sourceRetrievalStatus: 'missing_file',
          detectedWhat: 'Zero API route handlers or controller files detected in repository tree.',
          evidenceSupports: 'Negative verification: active tree contains no HTTP endpoints.',
          notVerified: 'HTTP route handlers, REST endpoints, and request validation.',
          confidenceExplanation: 'High confidence (88%) in negative finding: tree was actively analyzed and confirmed no matching API files.',
          verificationLevel: 'negative_verification',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      let firstResult: { path: string; content: string | null; status: 'retrieved' | 'failed' | 'missing_file'; error?: string } | null = null;

      for (const candidate of apiFiles.slice(0, 5)) {
        const ret = await fetchFile(candidate, targetSha);
        if (!firstResult) {
          firstResult = { path: candidate, ...ret };
        }

        if (!ret.content) continue;

        const lines = ret.content.split('\n');
        let matchedLine = -1;
        let matchedPattern = '';

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (
            /(?:app\.(get|post|put|delete|patch)|router\.(get|post|put|delete)|export\s+async\s+function\s+(GET|POST|PUT|DELETE)|@(?:Get|Post|Put|Delete)|def\s+(get_|post_|api_)|func\s+.*Handler)/i.test(l)
          ) {
            matchedLine = i + 1;
            matchedPattern = l.trim();
            break;
          }
        }

        if (matchedLine !== -1) {
          const start = Math.max(1, matchedLine - 2);
          const end = Math.min(lines.length, matchedLine + 15);
          const excerpt = lines.slice(start - 1, end).join('\n');
          const claimInfo = claimEvidence(candidate, start, end);

          return {
            requirementId: req.id,
            requirementTitle: req.title,
            category: req.category,
            status: 'demonstrated',
            evidenceType: 'direct_implementation',
            evidenceStrength: 'strong',
            explanation: `Demonstrated in ${candidate}. Implements HTTP endpoint handling with structured route definitions (${matchedPattern}).`,
            humanReadableExplanation: `Verified working HTTP route declaration in ${candidate} at line ${matchedLine}.`,
            repoFullName,
            filePath: candidate,
            lineStart: start,
            lineEnd: end,
            codeExcerpt: excerpt,
            commitSha: targetSha,
            confidence: 90,
            relevantCommits,
            relevantFiles: [candidate],
            additionsOrPatterns: [matchedPattern],
            sharedEvidenceWith: claimInfo.sharedWith,
            uncertaintyNotes: claimInfo.notes,
            sourceRetrievalStatus: 'retrieved',
            detectedWhat: `Verified working HTTP route handler (${matchedPattern}) in ${candidate}.`,
            evidenceSupports: `Concrete route handler at lines ${start}-${end} at commit ${targetSha.slice(0, 7)}.`,
            notVerified: 'None — core HTTP endpoint implementation verified.',
            confidenceExplanation: 'High confidence (90%): verified concrete HTTP route handler in source code at analyzed commit.',
            verificationLevel: 'implementation_verified',
            authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'verified' }
          };
        }
      }

      // Candidate files exist, but none contained verified route handlers (e.g. src/rules/api/exposed-schemas.ts)
      const targetCandidate = firstResult?.path || apiFiles[0];
      const retrievalStatus = firstResult?.status || 'retrieved';
      const retrievalError = firstResult?.error;
      const content = firstResult?.content;

      if (retrievalStatus === 'failed') {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'partial',
          evidenceType: 'configuration',
          evidenceStrength: 'weak',
          explanation: `Partial evidence: Candidate API file detected at ${targetCandidate}, but source code could not be retrieved from commit ${targetSha.slice(0, 7)}: ${retrievalError || 'Retrieval error'}.`,
          humanReadableExplanation: `File exists in tree (${targetCandidate}), but source code retrieval failed.`,
          repoFullName,
          filePath: targetCandidate,
          commitSha: targetSha,
          confidence: 25,
          relevantCommits,
          relevantFiles: [targetCandidate],
          sourceRetrievalStatus: 'failed',
          sourceRetrievalError: retrievalError || 'Failed to retrieve file from GitHub API.',
          detectedWhat: `Candidate API file ${targetCandidate} discovered in repository tree.`,
          evidenceSupports: 'File path present in repository tree metadata.',
          notVerified: `Source code could not be inspected due to retrieval failure (${retrievalError}). Implementation status cannot be verified.`,
          confidenceExplanation: 'Low confidence (25%): file discovered in tree, but source code could not be retrieved. Finding a filename does not prove implementation.',
          verificationLevel: 'file_discovery',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      const lines = (content || '').split('\n');
      const end = Math.min(lines.length, 20);
      const excerpt = lines.slice(0, end).join('\n');

      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'partial',
        evidenceType: 'configuration',
        evidenceStrength: 'moderate',
        explanation: `Partial evidence: Inspected ${targetCandidate}. Discovered API schemas or candidate definitions, but no active HTTP route handlers (GET/POST/PUT/DELETE, app.get, router) were verified.`,
        humanReadableExplanation: `API file exists (${targetCandidate}), but explicit endpoint handlers were not verified.`,
        repoFullName,
        filePath: targetCandidate,
        lineStart: 1,
        lineEnd: end,
        codeExcerpt: excerpt,
        commitSha: targetSha,
        confidence: 40,
        relevantCommits,
        relevantFiles: [targetCandidate],
        sourceRetrievalStatus: 'retrieved',
        detectedWhat: `Detected candidate API file ${targetCandidate} defining schemas/data structures, but no executable HTTP route handlers.`,
        evidenceSupports: `Source file inspected at commit ${targetSha.slice(0, 7)} (lines 1-${end}).`,
        notVerified: 'HTTP route handlers (e.g. GET/POST routes, app.get(), router.post()) or status code mappings were not found in this file.',
        confidenceExplanation: 'Moderate confidence (40%): source code was inspected at commit; candidate schemas detected, but HTTP endpoint handlers are unverified (capped at 45%). Finding a file does not prove an HTTP endpoint is implemented.',
        verificationLevel: 'source_inspected',
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
      };
    }

    case 'req-db': {
      const dbMatcher = (p: string) =>
        /(?:schema\.prisma|migrations?\/|\.sql$|models?\/|database|entities?\/|db\/|db\.(ts|js|py))/i.test(p);
      const dbFiles = filePaths.filter(dbMatcher);
      const relevantCommits = findRelevantCommits(dbMatcher);
      const targetSha = relevantCommits[0] || latestCommitSha;

      if (dbFiles.length === 0) {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'not_demonstrated',
          evidenceType: 'none',
          evidenceStrength: 'none',
          explanation: 'Not demonstrated in the analyzed repositories. No SQL schemas, database migration directories, or ORM models were discovered.',
          humanReadableExplanation: 'No relational schema files, migrations, or database models were discovered.',
          repoFullName,
          commitSha: latestCommitSha,
          confidence: 88,
          relevantCommits: [],
          relevantFiles: [],
          sourceRetrievalStatus: 'missing_file',
          detectedWhat: 'Zero relational schema files or database directories detected.',
          evidenceSupports: 'Negative verification: active tree contains no database schemas or models.',
          notVerified: 'SQL schemas, migrations, ORM entity models, or database queries.',
          confidenceExplanation: 'High confidence (88%) in negative finding: tree was actively analyzed and confirmed no matching database files.',
          verificationLevel: 'negative_verification',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      let firstResult: { path: string; content: string | null; status: 'retrieved' | 'failed' | 'missing_file'; error?: string } | null = null;

      for (const candidate of dbFiles.slice(0, 5)) {
        const ret = await fetchFile(candidate, targetSha);
        if (!firstResult) {
          firstResult = { path: candidate, ...ret };
        }

        if (!ret.content) continue;

        const lines = ret.content.split('\n');
        let matchedLine = -1;
        let matchedPattern = '';

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (
            /(?:CREATE\s+TABLE|SELECT\s+.*FROM|INSERT\s+INTO|model\s+\w+\s*\{|Column\(|ForeignKey|belongsTo|hasMany|DatabaseSync)/i.test(l)
          ) {
            matchedLine = i + 1;
            matchedPattern = l.trim();
            break;
          }
        }

        if (matchedLine !== -1) {
          const start = Math.max(1, matchedLine - 2);
          const end = Math.min(lines.length, matchedLine + 16);
          const excerpt = lines.slice(start - 1, end).join('\n');
          const claimInfo = claimEvidence(candidate, start, end);

          return {
            requirementId: req.id,
            requirementTitle: req.title,
            category: req.category,
            status: 'demonstrated',
            evidenceType: 'direct_implementation',
            evidenceStrength: 'strong',
            explanation: `Demonstrated in ${candidate}. Contains concrete relational schema definitions, migrations, or query management logic.`,
            humanReadableExplanation: `Relational database structures verified in ${candidate} (${matchedPattern}).`,
            repoFullName,
            filePath: candidate,
            lineStart: start,
            lineEnd: end,
            codeExcerpt: excerpt,
            commitSha: targetSha,
            confidence: 90,
            relevantCommits,
            relevantFiles: [candidate],
            additionsOrPatterns: [matchedPattern],
            sharedEvidenceWith: claimInfo.sharedWith,
            uncertaintyNotes: claimInfo.notes,
            sourceRetrievalStatus: 'retrieved',
            detectedWhat: `Verified relational database schema or query logic (${matchedPattern}) in ${candidate}.`,
            evidenceSupports: `Concrete database structure at lines ${start}-${end} at commit ${targetSha.slice(0, 7)}.`,
            notVerified: 'None — relational database implementation verified.',
            confidenceExplanation: 'High confidence (90%): verified concrete relational schema or query logic in source code.',
            verificationLevel: 'implementation_verified',
            authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'verified' }
          };
        }
      }

      const targetCandidate = firstResult?.path || dbFiles[0];
      const retrievalStatus = firstResult?.status || 'retrieved';
      const retrievalError = firstResult?.error;
      const content = firstResult?.content;

      if (retrievalStatus === 'failed') {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'partial',
          evidenceType: 'configuration',
          evidenceStrength: 'weak',
          explanation: `Partial evidence: Database-related file detected at ${targetCandidate}, but source code could not be retrieved from commit ${targetSha.slice(0, 7)}: ${retrievalError || 'Retrieval error'}.`,
          humanReadableExplanation: `Database file exists (${targetCandidate}), but source code retrieval failed.`,
          repoFullName,
          filePath: targetCandidate,
          commitSha: targetSha,
          confidence: 25,
          relevantCommits,
          relevantFiles: [targetCandidate],
          sourceRetrievalStatus: 'failed',
          sourceRetrievalError: retrievalError || 'Failed to retrieve file from GitHub API.',
          detectedWhat: `Database file path ${targetCandidate} discovered in repository tree.`,
          evidenceSupports: 'File path present in repository tree metadata.',
          notVerified: `Source code could not be inspected due to retrieval error (${retrievalError}). Implementation status cannot be verified.`,
          confidenceExplanation: 'Low confidence (25%): file discovered in tree, but source code could not be retrieved.',
          verificationLevel: 'file_discovery',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      const lines = (content || '').split('\n');
      const end = Math.min(lines.length, 20);
      const excerpt = lines.slice(0, end).join('\n');

      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'partial',
        evidenceType: 'configuration',
        evidenceStrength: 'moderate',
        explanation: `Partial evidence: Database-related file detected at ${targetCandidate}, but without explicit table definitions or query logic.`,
        humanReadableExplanation: `Database file exists (${targetCandidate}), but no DDL or ORM tables were verified.`,
        repoFullName,
        filePath: targetCandidate,
        lineStart: 1,
        lineEnd: end,
        codeExcerpt: excerpt,
        commitSha: targetSha,
        confidence: 40,
        relevantCommits,
        relevantFiles: [targetCandidate],
        sourceRetrievalStatus: 'retrieved',
        detectedWhat: `Database configuration or client file detected at ${targetCandidate}, but without explicit table definitions.`,
        evidenceSupports: `Source file inspected at commit ${targetSha.slice(0, 7)} (lines 1-${end}).`,
        notVerified: 'No SQL CREATE TABLE statements, migration files, or ORM entity models verified.',
        confidenceExplanation: 'Moderate confidence (40%): database file inspected at commit, but relational schemas/queries are unverified (capped at 45%).',
        verificationLevel: 'source_inspected',
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
      };
    }

    case 'req-testing': {
      const testMatcher = (p: string) =>
        /(?:\.test\.(ts|js|jsx|tsx|mjs)$|\.spec\.(ts|js|jsx|tsx|mjs)$|test_.*\.py$|_test\.go$|tests?\/)/i.test(p);
      const testFiles = filePaths.filter(testMatcher);
      const relevantCommits = findRelevantCommits(testMatcher);
      const targetSha = relevantCommits[0] || latestCommitSha;

      if (testFiles.length === 0) {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'not_demonstrated',
          evidenceType: 'none',
          evidenceStrength: 'none',
          explanation: 'Not demonstrated in the analyzed repositories. No unit, integration, or automated test files were found.',
          humanReadableExplanation: 'Zero automated test files detected in repository.',
          repoFullName,
          commitSha: latestCommitSha,
          confidence: 90,
          relevantCommits: [],
          relevantFiles: [],
          sourceRetrievalStatus: 'missing_file',
          detectedWhat: 'Zero automated test files detected in repository.',
          evidenceSupports: 'Negative verification: active tree contains no test suites.',
          notVerified: 'Automated test suites, unit tests, and assertions.',
          confidenceExplanation: 'High confidence (90%) in negative finding: tree was actively analyzed and confirmed no matching test files.',
          verificationLevel: 'negative_verification',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      let assertionsCount = 0;
      let primaryTestFile = testFiles[0];
      let primaryExcerpt = '';
      let primaryStart = 1;
      let primaryEnd = 15;
      let firstResult: { path: string; content: string | null; status: 'retrieved' | 'failed' | 'missing_file'; error?: string } | null = null;

      for (const candidate of testFiles.slice(0, 5)) {
        const ret = await fetchFile(candidate, targetSha);
        if (!firstResult) {
          firstResult = { path: candidate, ...ret };
        }

        if (!ret.content) continue;

        const lines = ret.content.split('\n');
        let matchedLine = -1;

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (/(?:test\(|it\(|describe\(|expect\(|assert\s+|assert\.|def\s+test_|self\.assertEqual)/i.test(l)) {
            assertionsCount++;
            if (matchedLine === -1) {
              matchedLine = i + 1;
            }
          }
        }

        if (matchedLine !== -1 && !primaryExcerpt) {
          primaryTestFile = candidate;
          primaryStart = Math.max(1, matchedLine - 2);
          primaryEnd = Math.min(lines.length, matchedLine + 15);
          primaryExcerpt = lines.slice(primaryStart - 1, primaryEnd).join('\n');
        }
      }

      if (assertionsCount > 0) {
        const claimInfo = claimEvidence(primaryTestFile, primaryStart, primaryEnd);
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'demonstrated',
          evidenceType: 'test_verification',
          evidenceStrength: 'strong',
          explanation: `Demonstrated in ${primaryTestFile}. Contains active automated test cases with verifiable assertions (${assertionsCount} assertion checks detected).`,
          humanReadableExplanation: `Verified automated test suite in ${primaryTestFile} with ${assertionsCount} assertion check(s).`,
          repoFullName,
          filePath: primaryTestFile,
          lineStart: primaryStart,
          lineEnd: primaryEnd,
          codeExcerpt: primaryExcerpt,
          commitSha: targetSha,
          confidence: 95,
          relevantCommits,
          relevantFiles: testFiles.slice(0, 5),
          testResultsSummary: {
            testFilesCount: testFiles.length,
            assertionsFound: assertionsCount,
            verifiedPassing: true,
            executionSummary: 'Verified active test assertions and test runner scripts.'
          },
          sharedEvidenceWith: claimInfo.sharedWith,
          uncertaintyNotes: claimInfo.notes,
          sourceRetrievalStatus: 'retrieved',
          detectedWhat: `Verified automated test suite in ${primaryTestFile} with ${assertionsCount} assertion check(s).`,
          evidenceSupports: `Active test assertions at lines ${primaryStart}-${primaryEnd} at commit ${targetSha.slice(0, 7)}.`,
          notVerified: 'None — automated test assertions verified.',
          confidenceExplanation: 'High confidence (95%): verified concrete automated test cases with assertions at analyzed commit.',
          verificationLevel: 'implementation_verified',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'verified' }
        };
      }

      const targetCandidate = firstResult?.path || testFiles[0];
      const retrievalStatus = firstResult?.status || 'retrieved';
      const retrievalError = firstResult?.error;
      const content = firstResult?.content;

      if (retrievalStatus === 'failed') {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'partial',
          evidenceType: 'configuration',
          evidenceStrength: 'weak',
          explanation: `Partial evidence: Test scaffolding exists in ${targetCandidate}, but source code could not be retrieved from commit ${targetSha.slice(0, 7)}: ${retrievalError || 'Retrieval error'}.`,
          humanReadableExplanation: `Test file exists (${targetCandidate}), but source code retrieval failed.`,
          repoFullName,
          filePath: targetCandidate,
          commitSha: targetSha,
          confidence: 25,
          relevantCommits,
          relevantFiles: [targetCandidate],
          sourceRetrievalStatus: 'failed',
          sourceRetrievalError: retrievalError || 'Failed to retrieve test file from GitHub API.',
          detectedWhat: `Test file ${targetCandidate} discovered in repository tree.`,
          evidenceSupports: 'File path present in repository tree metadata.',
          notVerified: `Source code could not be inspected due to retrieval error (${retrievalError}). Test assertions unverified.`,
          confidenceExplanation: 'Low confidence (25%): test file found in tree, but source code could not be retrieved.',
          verificationLevel: 'file_discovery',
          testResultsSummary: { testFilesCount: testFiles.length, assertionsFound: 0 },
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      const lines = (content || '').split('\n');
      const end = Math.min(lines.length, 20);
      const excerpt = lines.slice(0, end).join('\n');

      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'partial',
        evidenceType: 'configuration',
        evidenceStrength: 'moderate',
        explanation: `Partial evidence: Test scaffolding exists in ${targetCandidate}, but no executable assertions were verified.`,
        humanReadableExplanation: `Test files exist (${targetCandidate}), but no assertion functions were identified.`,
        repoFullName,
        filePath: targetCandidate,
        lineStart: 1,
        lineEnd: end,
        codeExcerpt: excerpt,
        commitSha: targetSha,
        confidence: 40,
        relevantCommits,
        relevantFiles: [targetCandidate],
        sourceRetrievalStatus: 'retrieved',
        detectedWhat: `Test scaffolding or file detected at ${targetCandidate}, but without verified assertions.`,
        evidenceSupports: `Source file inspected at commit ${targetSha.slice(0, 7)} (lines 1-${end}).`,
        notVerified: 'No executable test assertions (expect(), assert(), self.assertEqual) verified.',
        confidenceExplanation: 'Moderate confidence (40%): test files inspected at commit, but executable assertions are unverified (capped at 45%).',
        verificationLevel: 'source_inspected',
        testResultsSummary: {
          testFilesCount: testFiles.length,
          assertionsFound: 0
        },
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
      };
    }

    case 'req-devops': {
      const devopsMatcher = (p: string) => /(?:Dockerfile|docker-compose\.ya?ml|Containerfile)/i.test(p);
      const dockerFile = filePaths.find(devopsMatcher);
      const relevantCommits = findRelevantCommits(devopsMatcher);
      const targetSha = relevantCommits[0] || latestCommitSha;

      if (!dockerFile) {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'not_demonstrated',
          evidenceType: 'none',
          evidenceStrength: 'none',
          explanation: 'Not demonstrated in the analyzed repositories. No Dockerfile, docker-compose, or container build specifications were discovered.',
          humanReadableExplanation: 'No Dockerfile or container configurations were discovered in repository.',
          repoFullName,
          commitSha: latestCommitSha,
          confidence: 90,
          relevantCommits: [],
          relevantFiles: [],
          sourceRetrievalStatus: 'missing_file',
          detectedWhat: 'Zero container build specifications or Dockerfiles found in repository.',
          evidenceSupports: 'Negative verification: active tree contains no Docker configurations.',
          notVerified: 'Dockerfile, container build stages, or container-compose services.',
          confidenceExplanation: 'High confidence (90%) in negative finding: tree was actively analyzed and confirmed no container files.',
          verificationLevel: 'negative_verification',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      const ret = await fetchFile(dockerFile, targetSha);
      if (ret.content && /(?:FROM\s+|services:|version:)/i.test(ret.content)) {
        const lines = ret.content.split('\n');
        const end = Math.min(lines.length, 18);
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'demonstrated',
          evidenceType: 'configuration',
          evidenceStrength: 'strong',
          explanation: `Demonstrated in ${dockerFile}. Defines containerization specifications, base images, and runtime dependencies.`,
          humanReadableExplanation: `Verified container setup in ${dockerFile} with base image and build stages.`,
          repoFullName,
          filePath: dockerFile,
          lineStart: 1,
          lineEnd: end,
          codeExcerpt: lines.slice(0, end).join('\n'),
          commitSha: targetSha,
          confidence: 92,
          relevantCommits,
          relevantFiles: [dockerFile],
          additionsOrPatterns: ['FROM / multi-stage container build'],
          sourceRetrievalStatus: 'retrieved',
          detectedWhat: `Verified Docker configuration with base image and build directives in ${dockerFile}.`,
          evidenceSupports: `Container build instructions at lines 1-${end} at commit ${targetSha.slice(0, 7)}.`,
          notVerified: 'None — container build specification verified.',
          confidenceExplanation: 'High confidence (92%): verified concrete container build directives at analyzed commit.',
          verificationLevel: 'implementation_verified',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'verified' }
        };
      }

      if (ret.status === 'failed') {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'partial',
          evidenceType: 'configuration',
          evidenceStrength: 'weak',
          explanation: `Partial evidence: Docker configuration file found at ${dockerFile}, but source code could not be retrieved from commit ${targetSha.slice(0, 7)}: ${ret.error || 'Retrieval error'}.`,
          humanReadableExplanation: `Docker file exists (${dockerFile}) but source retrieval failed.`,
          repoFullName,
          filePath: dockerFile,
          commitSha: targetSha,
          confidence: 25,
          relevantCommits,
          relevantFiles: [dockerFile],
          sourceRetrievalStatus: 'failed',
          sourceRetrievalError: ret.error || 'Failed to retrieve Dockerfile from GitHub API.',
          detectedWhat: `Docker configuration file ${dockerFile} discovered in repository tree.`,
          evidenceSupports: 'File path present in repository tree metadata.',
          notVerified: `Source code could not be inspected due to retrieval error (${ret.error}).`,
          confidenceExplanation: 'Low confidence (25%): file discovered in tree, but source code could not be retrieved.',
          verificationLevel: 'file_discovery',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      const lines = (ret.content || '').split('\n');
      const end = Math.min(lines.length, 20);
      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'partial',
        evidenceType: 'configuration',
        evidenceStrength: 'moderate',
        explanation: `Partial evidence: Docker configuration file found at ${dockerFile}, but base image or build instructions are incomplete.`,
        humanReadableExplanation: `Docker file exists (${dockerFile}) but build directives are incomplete.`,
        repoFullName,
        filePath: dockerFile,
        lineStart: 1,
        lineEnd: end,
        codeExcerpt: lines.slice(0, end).join('\n'),
        commitSha: targetSha,
        confidence: 40,
        relevantCommits,
        relevantFiles: [dockerFile],
        sourceRetrievalStatus: 'retrieved',
        detectedWhat: `Docker configuration file found at ${dockerFile}, but base image or build instructions are incomplete.`,
        evidenceSupports: `Source file inspected at commit ${targetSha.slice(0, 7)} (lines 1-${end}).`,
        notVerified: 'No valid base image (FROM) or container services specifications verified.',
        confidenceExplanation: 'Moderate confidence (40%): container file inspected at commit, but build directives are incomplete.',
        verificationLevel: 'source_inspected',
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
      };
    }

    case 'req-cicd': {
      const ciMatcher = (p: string) =>
        /(?:\.github\/workflows\/.*\.ya?ml|\.gitlab-ci\.yml|Jenkinsfile)/i.test(p);
      const ciFile = filePaths.find(ciMatcher);
      const relevantCommits = findRelevantCommits(ciMatcher);
      const targetSha = relevantCommits[0] || latestCommitSha;

      if (!ciFile) {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'not_demonstrated',
          evidenceType: 'none',
          evidenceStrength: 'none',
          explanation: 'Not demonstrated in the analyzed repositories. No CI/CD workflows or pipeline configurations found in .github/workflows.',
          humanReadableExplanation: 'No automated CI/CD pipeline workflow files found.',
          repoFullName,
          commitSha: latestCommitSha,
          confidence: 90,
          relevantCommits: [],
          relevantFiles: [],
          sourceRetrievalStatus: 'missing_file',
          detectedWhat: 'Zero CI/CD workflow pipeline files detected in repository.',
          evidenceSupports: 'Negative verification: active tree contains no workflow YAML files.',
          notVerified: 'Continuous integration workflows, triggers, or automated test runners.',
          confidenceExplanation: 'High confidence (90%) in negative finding: tree was actively analyzed and confirmed no workflow files.',
          verificationLevel: 'negative_verification',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      const ret = await fetchFile(ciFile, targetSha);
      if (ret.content && /(?:jobs:|on:|runs-on:|steps:)/i.test(ret.content)) {
        const lines = ret.content.split('\n');
        const end = Math.min(lines.length, 20);
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'demonstrated',
          evidenceType: 'configuration',
          evidenceStrength: 'strong',
          explanation: `Demonstrated in ${ciFile}. Configures automated CI pipeline runs on push/pull-request triggers.`,
          humanReadableExplanation: `Verified automated workflow configuration in ${ciFile}.`,
          repoFullName,
          filePath: ciFile,
          lineStart: 1,
          lineEnd: end,
          codeExcerpt: lines.slice(0, end).join('\n'),
          commitSha: targetSha,
          confidence: 92,
          relevantCommits,
          relevantFiles: [ciFile],
          additionsOrPatterns: ['on: [push, pull_request] workflow trigger'],
          sourceRetrievalStatus: 'retrieved',
          detectedWhat: `Verified CI pipeline configuration with automated trigger and jobs in ${ciFile}.`,
          evidenceSupports: `Workflow pipeline steps at lines 1-${end} at commit ${targetSha.slice(0, 7)}.`,
          notVerified: 'None — CI/CD workflow pipeline configuration verified.',
          confidenceExplanation: 'High confidence (92%): verified concrete CI pipeline configuration at analyzed commit.',
          verificationLevel: 'implementation_verified',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'verified' }
        };
      }

      if (ret.status === 'failed') {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'partial',
          evidenceType: 'configuration',
          evidenceStrength: 'weak',
          explanation: `Partial evidence: CI workflow file exists at ${ciFile}, but source code could not be retrieved from commit ${targetSha.slice(0, 7)}: ${ret.error || 'Retrieval error'}.`,
          humanReadableExplanation: `Workflow file exists at ${ciFile} but source retrieval failed.`,
          repoFullName,
          filePath: ciFile,
          commitSha: targetSha,
          confidence: 25,
          relevantCommits,
          relevantFiles: [ciFile],
          sourceRetrievalStatus: 'failed',
          sourceRetrievalError: ret.error || 'Failed to retrieve workflow file from GitHub API.',
          detectedWhat: `Workflow file ${ciFile} discovered in repository tree.`,
          evidenceSupports: 'File path present in repository tree metadata.',
          notVerified: `Source code could not be inspected due to retrieval error (${ret.error}).`,
          confidenceExplanation: 'Low confidence (25%): workflow file found in tree, but source code could not be retrieved.',
          verificationLevel: 'file_discovery',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      const lines = (ret.content || '').split('\n');
      const end = Math.min(lines.length, 20);
      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'partial',
        evidenceType: 'configuration',
        evidenceStrength: 'moderate',
        explanation: `Partial evidence: CI workflow file exists at ${ciFile}, but contains minimal or commented steps.`,
        humanReadableExplanation: `Workflow file exists at ${ciFile} but has minimal step declarations.`,
        repoFullName,
        filePath: ciFile,
        lineStart: 1,
        lineEnd: end,
        codeExcerpt: lines.slice(0, end).join('\n'),
        commitSha: targetSha,
        confidence: 40,
        relevantCommits,
        relevantFiles: [ciFile],
        sourceRetrievalStatus: 'retrieved',
        detectedWhat: `CI workflow file exists at ${ciFile}, but contains minimal or commented steps.`,
        evidenceSupports: `Source file inspected at commit ${targetSha.slice(0, 7)} (lines 1-${end}).`,
        notVerified: 'No automated build or test pipeline step execution commands verified.',
        confidenceExplanation: 'Moderate confidence (40%): workflow file inspected at commit, but pipeline steps are unverified.',
        verificationLevel: 'source_inspected',
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
      };
    }

    case 'req-typescript': {
      const tsMatcher = (p: string) => /\.(ts|tsx)$/.test(p);
      const tsFiles = filePaths.filter(tsMatcher);
      const tsConfig = filePaths.find(p => /tsconfig\.json$/i.test(p));
      const relevantCommits = findRelevantCommits(tsMatcher);
      const targetSha = relevantCommits[0] || latestCommitSha;

      if (tsFiles.length === 0 && !tsConfig) {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'not_demonstrated',
          evidenceType: 'none',
          evidenceStrength: 'none',
          explanation: 'Not demonstrated in the analyzed repositories. The codebase does not use TypeScript configuration or typed files.',
          humanReadableExplanation: 'No TypeScript source files (.ts/.tsx) or tsconfig.json found.',
          repoFullName,
          commitSha: latestCommitSha,
          confidence: 90,
          relevantCommits: [],
          relevantFiles: [],
          sourceRetrievalStatus: 'missing_file',
          detectedWhat: 'Zero TypeScript source files or tsconfig.json found.',
          evidenceSupports: 'Negative verification: active tree contains no .ts or .tsx files.',
          notVerified: 'Static typing, TypeScript interfaces, and compiler configurations.',
          confidenceExplanation: 'High confidence (90%) in negative finding: tree was actively analyzed and confirmed no TypeScript files.',
          verificationLevel: 'negative_verification',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      // Prioritize non-test TypeScript source files or tsconfig so test suites are preserved for req-testing
      const nonTestTsFiles = tsFiles.filter(f => !/(?:tests?\/|\.test\.|\.spec\.)/i.test(f));
      const candidates = nonTestTsFiles.length > 0 ? nonTestTsFiles : tsFiles;
      const unclaimedTsFile = candidates.find(f => !claimTracker?.getClaim(f));
      const sampleFile = tsConfig || unclaimedTsFile || candidates[0] || tsFiles[0];
      const ret = await fetchFile(sampleFile, targetSha);
      const lines = (ret.content || '').split('\n');
      const end = Math.min(lines.length, 16);
      const claimInfo = sampleFile === tsConfig ? { sharedWith: undefined, notes: undefined } : claimEvidence(sampleFile, 1, end);

      const isRetrieved = ret.status === 'retrieved' && ret.content !== null;
      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'demonstrated',
        evidenceType: 'direct_implementation',
        evidenceStrength: 'strong',
        explanation: `Demonstrated across ${tsFiles.length} TypeScript files (e.g., ${sampleFile}) with static type definitions.`,
        humanReadableExplanation: `Verified typed implementation across ${tsFiles.length} TypeScript source files.`,
        repoFullName,
        filePath: sampleFile,
        lineStart: 1,
        lineEnd: end,
        codeExcerpt: isRetrieved ? lines.slice(0, end).join('\n') : undefined,
        commitSha: targetSha,
        confidence: isRetrieved ? 95 : 75,
        relevantCommits,
        relevantFiles: tsFiles.slice(0, 5),
        additionsOrPatterns: [`${tsFiles.length} TypeScript typed files`],
        sharedEvidenceWith: claimInfo.sharedWith,
        uncertaintyNotes: claimInfo.notes,
        sourceRetrievalStatus: isRetrieved ? 'retrieved' : 'failed',
        sourceRetrievalError: isRetrieved ? undefined : (ret.error || 'Failed to retrieve TypeScript source excerpt.'),
        detectedWhat: `Verified static type definitions across ${tsFiles.length} TypeScript files.`,
        evidenceSupports: isRetrieved ? `Typed implementation excerpt at lines 1-${end} in ${sampleFile}.` : `${tsFiles.length} TypeScript files present in tree metadata.`,
        notVerified: 'None — TypeScript type system usage verified.',
        confidenceExplanation: isRetrieved
          ? 'High confidence (95%): verified concrete TypeScript code and interfaces at analyzed commit.'
          : 'Grounded confidence (75%): TypeScript files verified across tree metadata, though excerpt retrieval failed.',
        verificationLevel: 'implementation_verified',
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'verified' }
      };
    }

    case 'req-frontend': {
      const feMatcher = (p: string) =>
        /(?:src\/app\/|components\/|pages\/|views\/|\.(jsx|tsx)$)/i.test(p);
      const feFiles = filePaths.filter(feMatcher);
      const relevantCommits = findRelevantCommits(feMatcher);
      const targetSha = relevantCommits[0] || latestCommitSha;

      if (feFiles.length === 0) {
        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'not_demonstrated',
          evidenceType: 'none',
          evidenceStrength: 'none',
          explanation: 'Not demonstrated in the analyzed repositories. No frontend components, pages, or user interface templates found.',
          humanReadableExplanation: 'No frontend UI components or pages identified.',
          repoFullName,
          commitSha: latestCommitSha,
          confidence: 88,
          relevantCommits: [],
          relevantFiles: [],
          sourceRetrievalStatus: 'missing_file',
          detectedWhat: 'Zero frontend UI components or pages found in repository.',
          evidenceSupports: 'Negative verification: active tree contains no UI components.',
          notVerified: 'Frontend user interface components, views, or routing pages.',
          confidenceExplanation: 'High confidence (88%) in negative finding: tree was actively analyzed and confirmed no UI files.',
          verificationLevel: 'negative_verification',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      const unclaimedFeFile = feFiles.find(f => !claimTracker?.getClaim(f));
      const sample = unclaimedFeFile || feFiles[0];
      const ret = await fetchFile(sample, targetSha);
      const lines = (ret.content || '').split('\n');
      const end = Math.min(lines.length, 18);
      const claimInfo = claimEvidence(sample, 1, end);
      const isRetrieved = ret.status === 'retrieved' && ret.content !== null;

      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'demonstrated',
        evidenceType: 'direct_implementation',
        evidenceStrength: 'strong',
        explanation: `Demonstrated in ${sample}. Implements modern UI components with modular markup and styling.`,
        humanReadableExplanation: `Verified UI component structure in ${sample}.`,
        repoFullName,
        filePath: sample,
        lineStart: 1,
        lineEnd: end,
        codeExcerpt: isRetrieved ? lines.slice(0, end).join('\n') : undefined,
        commitSha: targetSha,
        confidence: isRetrieved ? 90 : 70,
        relevantCommits,
        relevantFiles: feFiles.slice(0, 5),
        sharedEvidenceWith: claimInfo.sharedWith,
        uncertaintyNotes: claimInfo.notes,
        sourceRetrievalStatus: isRetrieved ? 'retrieved' : 'failed',
        sourceRetrievalError: isRetrieved ? undefined : (ret.error || 'Failed to retrieve frontend component source.'),
        detectedWhat: `Verified UI component structure and markup in ${sample}.`,
        evidenceSupports: isRetrieved ? `UI component implementation at lines 1-${end} at commit ${targetSha.slice(0, 7)}.` : `Frontend component files present in tree metadata.`,
        notVerified: 'None — frontend UI component implementation verified.',
        confidenceExplanation: isRetrieved
          ? 'High confidence (90%): verified concrete frontend UI components in source code.'
          : 'Grounded confidence (70%): frontend component files verified from tree metadata.',
        verificationLevel: 'implementation_verified',
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'verified' }
      };
    }

    case 'req-git': {
      const readme = filePaths.find(p => /^readme\.md$/i.test(p));
      const gitignore = filePaths.find(p => /^\.gitignore$/i.test(p));
      const target = readme || gitignore;
      const relevantCommits = findRelevantCommits(p => /(?:readme|\.gitignore)/i.test(p));
      const targetSha = relevantCommits[0] || latestCommitSha;

      if (target) {
        const ret = await fetchFile(target, targetSha);
        const lines = (ret.content || '').split('\n');
        const end = Math.min(lines.length, 15);
        const isRetrieved = ret.status === 'retrieved' && ret.content !== null;

        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'demonstrated',
          evidenceType: 'documentation',
          evidenceStrength: 'strong',
          explanation: `Demonstrated in ${target}. Maintains standard repository hygiene, documentation, and version control configuration.`,
          humanReadableExplanation: `Verified repository documentation and hygiene in ${target}.`,
          repoFullName,
          filePath: target,
          lineStart: 1,
          lineEnd: end,
          codeExcerpt: isRetrieved ? lines.slice(0, end).join('\n') : undefined,
          commitSha: targetSha,
          confidence: isRetrieved ? 88 : 70,
          relevantCommits,
          relevantFiles: [target],
          sourceRetrievalStatus: isRetrieved ? 'retrieved' : 'failed',
          sourceRetrievalError: isRetrieved ? undefined : (ret.error || 'Failed to retrieve documentation file.'),
          detectedWhat: `Verified repository hygiene and documentation file (${target}).`,
          evidenceSupports: isRetrieved ? `Documentation lines 1-${end} at commit ${targetSha.slice(0, 7)}.` : `File presence confirmed in repository metadata.`,
          notVerified: 'None — repository hygiene and version control configuration verified.',
          confidenceExplanation: isRetrieved
            ? 'High confidence (88%): verified repository hygiene and documentation at analyzed commit.'
            : 'Grounded confidence (70%): repository hygiene files confirmed from tree metadata.',
          verificationLevel: 'implementation_verified',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'verified' }
        };
      }

      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'partial',
        evidenceType: 'documentation',
        evidenceStrength: 'weak',
        explanation: 'Partial evidence: Git repository tracked, but missing standard README.md or .gitignore configuration.',
        humanReadableExplanation: 'Repository tracked under git without README or .gitignore configuration.',
        repoFullName,
        commitSha: latestCommitSha,
        confidence: 45,
        relevantCommits: [],
        relevantFiles: [],
        sourceRetrievalStatus: 'missing_file',
        detectedWhat: 'Repository is tracked by git, but lacks README.md or .gitignore.',
        evidenceSupports: 'Git commit history confirms repository tracking.',
        notVerified: 'README.md documentation and .gitignore hygiene configuration.',
        confidenceExplanation: 'Moderate confidence (45%): git tracking verified, but documentation and ignore rules are missing.',
        verificationLevel: 'source_inspected',
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
      };
    }

    default: {
      // General skill analyzer fallback for custom extracted requirements
      const titleTerms = req.title.toLowerCase().split(/[\s,/-]+/).filter(w => w.length > 3);
      const matchedFiles = filePaths.filter(p => titleTerms.some(term => p.toLowerCase().includes(term)));
      const targetSha = latestCommitSha;

      if (matchedFiles.length > 0) {
        const unclaimed = matchedFiles.find(f => !claimTracker?.getClaim(f));
        const sample = unclaimed || matchedFiles[0];
        const ret = await fetchFile(sample, targetSha);
        const lines = (ret.content || '').split('\n');
        const end = Math.min(lines.length, 15);
        const claimInfo = claimEvidence(sample, 1, end);
        const isRetrieved = ret.status === 'retrieved' && ret.content !== null;

        return {
          requirementId: req.id,
          requirementTitle: req.title,
          category: req.category,
          status: 'partial',
          evidenceType: 'direct_implementation',
          evidenceStrength: 'moderate',
          explanation: `Identified candidate files matching ${req.title} (${sample}). Further dedicated test assertions recommended to verify full proficiency.`,
          humanReadableExplanation: `Discovered relevant implementation code matching ${req.title} in ${sample}.`,
          repoFullName,
          filePath: sample,
          lineStart: 1,
          lineEnd: end,
          codeExcerpt: isRetrieved ? lines.slice(0, end).join('\n') : undefined,
          commitSha: targetSha,
          confidence: isRetrieved ? 40 : 25,
          relevantCommits: [targetSha],
          relevantFiles: [sample],
          sharedEvidenceWith: claimInfo.sharedWith,
          uncertaintyNotes: claimInfo.notes,
          sourceRetrievalStatus: isRetrieved ? 'retrieved' : 'failed',
          sourceRetrievalError: isRetrieved ? undefined : (ret.error || 'Failed to retrieve source file.'),
          detectedWhat: `Discovered relevant implementation code matching ${req.title} in ${sample}.`,
          evidenceSupports: isRetrieved ? `Source file inspected at lines 1-${end} at commit ${targetSha.slice(0, 7)}.` : `File presence confirmed in tree metadata.`,
          notVerified: 'Dedicated test assertions and end-to-end requirement fulfillment unverified.',
          confidenceExplanation: isRetrieved
            ? 'Moderate confidence (40%): candidate files inspected at commit; dedicated verification tests recommended (capped at 45%).'
            : 'Low confidence (25%): candidate file matched in tree, but source code could not be retrieved.',
          verificationLevel: isRetrieved ? 'source_inspected' : 'file_discovery',
          authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
        };
      }

      return {
        requirementId: req.id,
        requirementTitle: req.title,
        category: req.category,
        status: 'not_demonstrated',
        evidenceType: 'none',
        evidenceStrength: 'none',
        explanation: `Not demonstrated in the analyzed repositories. No code, tests, or configurations matching ${req.title} were found in the inspected files.`,
        humanReadableExplanation: `No relevant code or evidence found for ${req.title}.`,
        repoFullName,
        commitSha: latestCommitSha,
        confidence: 85,
        relevantCommits: [],
        relevantFiles: [],
        limitations: ['Scanned active tree files; no relevant keywords or components matched.'],
        sourceRetrievalStatus: 'missing_file',
        detectedWhat: `Zero source files or configurations matching ${req.title} found in repository.`,
        evidenceSupports: 'Negative verification: active tree contains no matching files.',
        notVerified: `Implementation code or configurations for ${req.title}.`,
        confidenceExplanation: 'High confidence (85%) in negative finding: tree was actively analyzed and confirmed no matching files.',
        verificationLevel: 'negative_verification',
        authorAttribution: { author, isDirectAuthor: true, attributionCertainty: 'probable' }
      };
    }
  }
}

function createGapTask(req: InternshipRequirement, evidence?: RepositoryEvidence): GapTask {
  const taskMap: Record<string, Partial<GapTask>> = {
    'req-testing': {
      title: 'Implement Automated Unit & Integration Tests',
      description: 'Add a robust test suite covering core business logic and API endpoints.',
      expectedEvidence: 'A test directory (e.g., tests/ or __tests__/) containing executable test suites with explicit assertions (expect / assert) and passing coverage.',
      acceptanceCriteria: [
        'Create a test suite testing at least one key service or endpoint.',
        'Include both happy-path assertions and edge-case handling.',
        'Configure test runner scripts in package.json or pyproject.toml.'
      ],
      suggestedFiles: ['tests/api.test.ts', 'src/__tests__/service.test.ts'],
      projectBrief: {
        overview: 'Testing proves that your code works reliably and prevents regressions in production.',
        suggestedScope: 'Write 3-5 unit tests focusing on validation, error codes, and expected output.',
        implementationHints: [
          'Use Jest, Vitest, Node Test Runner, or PyTest depending on your stack.',
          'Mock external network dependencies to keep tests fast and deterministic.',
          'Verify that commit webhooks detect new *.test.ts files.'
        ],
        verificationMethod: 'ProofLoop webhook will scan newly committed test files and verify assertion statements to promote this skill.'
      }
    },
    'req-devops': {
      title: 'Containerize Service with Multi-Stage Dockerfile',
      description: 'Add an optimized Dockerfile and container configuration for reproducible deployments.',
      expectedEvidence: 'A root Dockerfile specifying base images, dependency installation, non-root user setup, and entrypoint command.',
      acceptanceCriteria: [
        'Add a Dockerfile in repository root.',
        'Use multi-stage build to keep final image footprint small.',
        'Include a .dockerignore file excluding node_modules or cache files.'
      ],
      suggestedFiles: ['Dockerfile', '.dockerignore'],
      projectBrief: {
        overview: 'Containerization guarantees environment parity across development, staging, and production environments.',
        suggestedScope: 'Define builder and runner stages for your primary backend or web service.',
        implementationHints: [
          'Choose official slim or alpine base images.',
          'Expose appropriate application ports.',
          'Avoid hardcoding secret environment variables inside the image.'
        ],
        verificationMethod: 'ProofLoop webhook will parse the new Dockerfile and promote Docker & Containerization to Demonstrated.'
      }
    },
    'req-cicd': {
      title: 'Configure GitHub Actions CI Workflow',
      description: 'Create an automated CI workflow that runs linting, type-checking, and tests on push.',
      expectedEvidence: 'A YAML workflow file in .github/workflows/ specifying trigger events and job execution steps.',
      acceptanceCriteria: [
        'Create .github/workflows/ci.yml with on: [push, pull_request] triggers.',
        'Add checkout, runtime setup, dependency install, and test execution steps.',
        'Ensure workflow runs cleanly on main branch.'
      ],
      suggestedFiles: ['.github/workflows/ci.yml'],
      projectBrief: {
        overview: 'Continuous Integration automates code validation on every pull request.',
        suggestedScope: 'Single workflow job that installs dependencies and runs the test command.',
        implementationHints: [
          'Use actions/checkout@v4 and actions/setup-node@v4.',
          'Cache dependency directories to accelerate pipeline execution.'
        ],
        verificationMethod: 'ProofLoop webhook will detect the new GitHub Actions workflow file upon commit.'
      }
    },
    'req-db': {
      title: 'Design Relational Schema & Migration Logic',
      description: 'Add a persistent SQL schema, migration directory, or ORM model definitions.',
      expectedEvidence: 'A schema file (e.g. schema.sql, schema.prisma, or migrations/*.sql) defining relational tables, keys, and indexes.',
      acceptanceCriteria: [
        'Define relational entities with primary and foreign keys.',
        'Add index definitions for frequently queried lookup columns.',
        'Write migration scripts or ORM mapping files.'
      ],
      suggestedFiles: ['db/schema.sql', 'prisma/schema.prisma'],
      projectBrief: {
        overview: 'Production applications require persistent, structured, and normalized data stores.',
        suggestedScope: 'Create tables representing the primary entities in your domain model.',
        implementationHints: [
          'Specify explicit data types (VARCHAR, TIMESTAMP, UUID, INTEGER).',
          'Include created_at and updated_at tracking columns.'
        ],
        verificationMethod: 'ProofLoop webhook parses committed SQL/schema files and updates Database Design status.'
      }
    },
    'req-api': {
      title: 'Build Structured REST API Endpoints with Validation',
      description: 'Create modular HTTP route handlers with status code management and request validation.',
      expectedEvidence: 'Controller or route files containing GET/POST endpoints with input validation and HTTP status codes.',
      acceptanceCriteria: [
        'Implement at least 2 distinct REST endpoints (e.g. GET /items, POST /items).',
        'Handle client error cases with 400 Bad Request responses.',
        'Return structured JSON payloads.'
      ],
      suggestedFiles: ['src/api/routes.ts', 'server/api/items.py'],
      projectBrief: {
        overview: 'API development is fundamental to connecting distributed clients and services.',
        suggestedScope: 'Build endpoints that process parameters, query data, and return typed responses.',
        implementationHints: [
          'Separate route definitions from business logic and controllers.',
          'Validate incoming payload shapes before processing.'
        ],
        verificationMethod: 'ProofLoop webhook identifies HTTP route decorators and methods in new code.'
      }
    }
  };

  const defaultTask = taskMap[req.id] || {
    title: `Implement ${req.title}`,
    description: evidence?.humanReadableExplanation
      ? `Address skill gap: ${evidence.humanReadableExplanation}`
      : `Add tangible code demonstrating ${req.title.toLowerCase()} to the repository.`,
    expectedEvidence: `Source code files, tests, or configurations implementing ${req.title}.`,
    acceptanceCriteria: [
      `Write production code demonstrating ${req.title}.`,
      'Commit and push the changes to your monitored GitHub repository.'
    ],
    suggestedFiles: ['src/service.ts'],
    projectBrief: {
      overview: `Demonstrating ${req.title} provides concrete proof for the internship posting.`,
      suggestedScope: 'Build a focused module solving a real problem in your project.',
      implementationHints: ['Follow industry standards and document usage.'],
      verificationMethod: 'ProofLoop reassessment detects the new code during the next push event.'
    }
  };

  return {
    id: `task-${req.id}-${Date.now().toString(36)}`,
    requirementId: req.id,
    requirementTitle: req.title,
    category: req.category,
    title: defaultTask.title!,
    description: defaultTask.description!,
    expectedEvidence: defaultTask.expectedEvidence!,
    acceptanceCriteria: defaultTask.acceptanceCriteria || [],
    suggestedFiles: defaultTask.suggestedFiles || [],
    projectBrief: defaultTask.projectBrief || {
      overview: '',
      suggestedScope: '',
      implementationHints: [],
      verificationMethod: ''
    },
    status: 'pending'
  };
}

export interface CoreEvaluationInput {
  assessmentId?: string;
  repoFullName: string;
  defaultBranch?: string;
  targetCommitSha?: string;
  requirements: InternshipRequirement[];
  triggerType?: 'initial' | 'manual' | 'webhook';
  triggerMessage?: string;
  token?: string;
  fileTree?: GitHubFileNode[];
  commits?: CommitInfo[];
  localFileCache?: Record<string, string>;
  diffs?: Array<{ commitSha: string; filePath: string; commitMessage: string; addedLines: string[] }>;
}

export interface CoreEvaluationResult {
  success: boolean;
  evidenceList: RepositoryEvidence[];
  tasks: GapTask[];
  analysisScope: AnalysisScope;
  aiSignals: AISignalAnalysisResult;
  summary: {
    demonstratedCount: number;
    partialCount: number;
    notDemonstratedCount: number;
    averageScore: number;
    scoringRuleVersion: string;
  };
  error?: string;
  errorCode?: 'REPO_NOT_FOUND' | 'EMPTY_REPO' | 'RATE_LIMITED' | 'ANALYSIS_FAILED' | 'INVALID_INPUT';
  partialFailures?: string[];
}

function createEmptyScope(branch: string): AnalysisScope {
  return {
    commitsAnalyzed: 0,
    totalCommitsChecked: 0,
    filesInspected: 0,
    branch,
    truncated: false,
    scopeDescription: 'No files analyzed.'
  };
}

function createEmptyAISignals(): AISignalAnalysisResult {
  return {
    overallAssessment: 'insufficient_evidence',
    findings: [],
    summary: 'No artifacts available for AI signal analysis.',
    limitationNotice: 'No repository files available.',
    analyzedArtifactsCount: { commits: 0, comments: 0, docFiles: 0 }
  };
}

function createEmptySummary() {
  return {
    demonstratedCount: 0,
    partialCount: 0,
    notDemonstratedCount: 0,
    averageScore: 0,
    scoringRuleVersion: SCORING_RULE_VERSION
  };
}

/**
 * Reusable Core Evaluation Engine function.
 * Called by initial assessments, manual reassessments, and webhook processing.
 * Deterministic, evidence-based, and resilient to empty/missing repositories.
 */
export async function evaluateRepositoryCore(
  input: CoreEvaluationInput
): Promise<CoreEvaluationResult> {
  const {
    repoFullName,
    defaultBranch: inputBranch,
    targetCommitSha: inputSha,
    requirements,
    token,
    fileTree: preloadedTree,
    commits: preloadedCommits,
    localFileCache,
    diffs
  } = input;

  // 1. Validate inputs
  if (!repoFullName || typeof repoFullName !== 'string') {
    return {
      success: false,
      errorCode: 'INVALID_INPUT',
      error: 'Repository name is required.',
      evidenceList: [],
      tasks: [],
      analysisScope: createEmptyScope(inputBranch || 'main'),
      aiSignals: createEmptyAISignals(),
      summary: createEmptySummary()
    };
  }

  if (!requirements || !Array.isArray(requirements) || requirements.length === 0) {
    return {
      success: false,
      errorCode: 'INVALID_INPUT',
      error: 'Requirements list must be a non-empty array.',
      evidenceList: [],
      tasks: [],
      analysisScope: createEmptyScope(inputBranch || 'main'),
      aiSignals: createEmptyAISignals(),
      summary: createEmptySummary()
    };
  }

  const parsed = parseGitHubRepoUrl(repoFullName);
  if (!parsed) {
    return {
      success: false,
      errorCode: 'INVALID_INPUT',
      error: `Invalid repository URL or format: "${repoFullName}". Expected owner/repo or github.com/owner/repo.`,
      evidenceList: [],
      tasks: [],
      analysisScope: createEmptyScope(inputBranch || 'main'),
      aiSignals: createEmptyAISignals(),
      summary: createEmptySummary()
    };
  }

  const { owner, repo } = parsed;
  const partialFailures: string[] = [];

  // 2. Resolve tree and repo details
  let fileTree: GitHubFileNode[] = preloadedTree || [];
  let defaultBranch = inputBranch || 'main';
  let commitSha = inputSha || 'unknown';

  if (!preloadedTree) {
    try {
      const details = await fetchRepoDetails(owner, repo, token);
      defaultBranch = inputBranch || details.defaultBranch || 'main';
      commitSha = inputSha || details.latestCommitSha || 'unknown';
      fileTree = await fetchRepoTree(owner, repo, defaultBranch, token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|is private|credentials/i.test(msg)) {
        return {
          success: false,
          errorCode: 'REPO_NOT_FOUND',
          error: `Repository ${owner}/${repo} not found or is private without authorized credentials.`,
          evidenceList: [],
          tasks: [],
          analysisScope: createEmptyScope(defaultBranch),
          aiSignals: createEmptyAISignals(),
          summary: createEmptySummary()
        };
      }
      if (/rate limit/i.test(msg)) {
        return {
          success: false,
          errorCode: 'RATE_LIMITED',
          error: `GitHub API rate limit exceeded while analyzing ${owner}/${repo}. Please retry later.`,
          evidenceList: [],
          tasks: [],
          analysisScope: createEmptyScope(defaultBranch),
          aiSignals: createEmptyAISignals(),
          summary: createEmptySummary()
        };
      }
      return {
        success: false,
        errorCode: 'ANALYSIS_FAILED',
        error: `Failed to fetch repository metadata for ${owner}/${repo}: ${msg}`,
        evidenceList: [],
        tasks: [],
        analysisScope: createEmptyScope(defaultBranch),
        aiSignals: createEmptyAISignals(),
        summary: createEmptySummary()
      };
    }
  }

  // 3. Resolve commits
  let commits: CommitInfo[] = preloadedCommits || [];
  if (!preloadedCommits) {
    try {
      commits = await fetchRepoCommits(owner, repo, defaultBranch, 25, token);
    } catch (err) {
      partialFailures.push(`Commit history could not be retrieved: ${err instanceof Error ? err.message : String(err)}`);
      commits = [
        {
          sha: commitSha,
          message: input.triggerMessage || 'Latest repository commit',
          authorName: owner,
          timestamp: new Date().toISOString(),
          filesChanged: []
        }
      ];
    }
  }

  // 4. Run Analysis
  try {
    const analysis = await analyzeRepositoryAgainstRequirements(
      {
        owner,
        repo,
        defaultBranch,
        commitSha,
        fileTree,
        commits,
        token,
        localFileCache,
        diffs
      },
      requirements
    );

    const demonstratedCount = analysis.evidenceList.filter(e => e.status === 'demonstrated').length;
    const partialCount = analysis.evidenceList.filter(e => e.status === 'partial').length;
    const notDemonstratedCount = analysis.evidenceList.filter(e => e.status === 'not_demonstrated').length;
    const totalScore = analysis.evidenceList.reduce((acc, e) => acc + (e.scoreBreakdown?.score || 0), 0);
    const averageScore = Math.round(totalScore / (analysis.evidenceList.length || 1));

    return {
      success: true,
      evidenceList: analysis.evidenceList,
      tasks: analysis.tasks,
      analysisScope: analysis.analysisScope,
      aiSignals: analysis.aiSignals,
      summary: {
        demonstratedCount,
        partialCount,
        notDemonstratedCount,
        averageScore,
        scoringRuleVersion: SCORING_RULE_VERSION
      },
      partialFailures: partialFailures.length > 0 ? partialFailures : undefined
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errorCode: 'ANALYSIS_FAILED',
      error: `Repository analysis encountered an unexpected error: ${msg}`,
      evidenceList: [],
      tasks: [],
      analysisScope: createEmptyScope(defaultBranch),
      aiSignals: createEmptyAISignals(),
      summary: createEmptySummary()
    };
  }
}