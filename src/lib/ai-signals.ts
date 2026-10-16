import {
  AISignalFinding,
  AISignalAnalysisResult,
  CommitInfo
} from './types';

export const AI_SIGNAL_DISCLAIMER =
  'Notice: Stylistic uniformity, comment verbosity, or template patterns cannot reliably establish authorship. ' +
  'Developers frequently employ standard linters, commit conventions (e.g., Conventional Commits), code generators, or IDE templates. ' +
  'Observed stylistic signals are auxiliary transparency heuristics and are NEVER used to deduct or penalize technical skill scores.';

export interface FileCommentContext {
  filePath: string;
  comments: Array<{
    line: number;
    text: string;
    subsequentCodeLine?: string;
  }>;
  totalCommentLines: number;
  totalCodeLines: number;
}

export function analyzeAIAuthorshipSignals(options: {
  commits: CommitInfo[];
  fileComments?: FileCommentContext[];
  diffs?: Array<{ commitSha: string; filePath: string; commitMessage: string; addedLines: string[] }>;
}): AISignalAnalysisResult {
  const { commits, fileComments = [], diffs = [] } = options;
  const findings: AISignalFinding[] = [];

  // =========================================================================
  // 1. Commit Message Analysis
  // =========================================================================
  const messageFrequency = new Map<string, number>();

  for (const c of commits) {
    const rawMsg = c.message.trim();
    const firstLine = rawMsg.split('\n')[0].trim();

    // Check for explicit unedited LLM conversational remnants (Strong Signal)
    const llmConversationalPattern =
      /(?:certainly!|as an ai language model|here is the (?:code|implementation|solution)|in this commit,? i have|let me know if you need anything else|here's the updated code)/i;
    if (llmConversationalPattern.test(rawMsg)) {
      findings.push({
        artifactType: 'commit_message',
        sourceLocation: `commit:${c.sha.slice(0, 7)}`,
        observedSignal: 'Unedited conversational assistant remnant in commit message',
        explanation: `Commit message contains conversational phrases typically output by chat-based LLM assistants: "${rawMsg.slice(0, 80)}..."`,
        signalAssessment: 'strong',
        limitation: 'Could occur if a developer directly copied assistance notes into git commit -m.'
      });
    }

    // Check for unusually generic or empty commit messages
    const genericShortPattern = /^(?:update(?:d)?(?: code)?|changes?|wip|test|commit|fix(?:ed)?)$/i;
    if (genericShortPattern.test(firstLine)) {
      findings.push({
        artifactType: 'commit_message',
        sourceLocation: `commit:${c.sha.slice(0, 7)}`,
        observedSignal: 'Unusually generic non-descriptive commit message',
        explanation: `Commit message "${firstLine}" contains no structural or contextual description of changes.`,
        signalAssessment: 'weak',
        limitation: 'Developers commonly use brief WIP or temporary commit messages during quick prototyping.'
      });
    }

    // Frequency tracking for repetitive commit messages
    const norm = firstLine.toLowerCase();
    messageFrequency.set(norm, (messageFrequency.get(norm) || 0) + 1);
  }

  // Detect repetitive identical commit messages across distinct commits
  for (const [msg, count] of messageFrequency.entries()) {
    // Exclude conventional commit prefixes with distinct bodies; check exact repeated messages
    if (count >= 3 && !msg.includes(':')) {
      findings.push({
        artifactType: 'commit_message',
        sourceLocation: 'multiple commits',
        observedSignal: 'Repetitive identical commit messages across commits',
        explanation: `The exact same commit message ("${msg}") was repeated across ${count} distinct commits without contextual differentiation.`,
        signalAssessment: 'moderate',
        limitation: 'Repetitive messages may indicate batch tooling or fast iterative local checkpoints.'
      });
    }
  }

  // =========================================================================
  // 2. Commit Message vs Diff Discrepancy Analysis
  // =========================================================================
  for (const diff of diffs) {
    const msg = diff.commitMessage.toLowerCase();
    // High-claim commit message vs trivial diff
    const claimsComplexFeature =
      /(?:implement|architect|refactor|design)\s+(?:database|auth|security|payment|encryption|streaming|engine)/i.test(msg);
    const touchesOnlyDocsOrComments =
      diff.addedLines.length < 5 &&
      (diff.filePath.endsWith('.md') || diff.addedLines.every(l => /^\s*(?:\/\/|\/\*|\*|#)/.test(l)));

    if (claimsComplexFeature && touchesOnlyDocsOrComments) {
      findings.push({
        artifactType: 'commit_message',
        sourceLocation: `commit:${diff.commitSha.slice(0, 7)}:${diff.filePath}`,
        observedSignal: 'Discrepancy between high-claim commit message and actual code diff',
        explanation: `Commit message claims significant architectural feature ("${diff.commitMessage}") but diff only introduced minimal comment or documentation lines.`,
        signalAssessment: 'moderate',
        limitation: 'Work may have been partially stashed, or the commit may have been a documentation preparation step.'
      });
    }
  }

  // =========================================================================
  // 3. Code Comment & Documentation Analysis
  // =========================================================================
  let totalCommentsChecked = 0;
  for (const file of fileComments) {
    totalCommentsChecked += file.comments.length;

    // Check comment-to-code ratio
    if (file.totalCodeLines > 0 && file.totalCommentLines > file.totalCodeLines * 3 && file.totalCommentLines > 30) {
      findings.push({
        artifactType: 'code_comment',
        sourceLocation: file.filePath,
        observedSignal: 'Disproportionately high comment-to-code boilerplate ratio',
        explanation: `${file.filePath} contains ${file.totalCommentLines} comment lines versus only ${file.totalCodeLines} code lines.`,
        signalAssessment: 'weak',
        limitation: 'Verbose documentation generators, legal headers, or tutorial projects intentionally maintain extensive explanations.'
      });
    }

    // Check for comments that merely restate trivial obvious syntax
    let trivialRestatementCount = 0;
    for (const c of file.comments) {
      const commentText = c.text.trim().toLowerCase();
      const code = (c.subsequentCodeLine || '').trim().toLowerCase();

      // Examples: // increment i by 1 -> i++
      // // return true -> return true;
      // // set name -> this.name = name;
      if (
        (commentText.includes('increment') && code.includes('++')) ||
        (commentText.includes('return') && code.startsWith('return ')) ||
        (commentText.includes('import') && code.startsWith('import ')) ||
        (commentText.includes('declare') && (code.startsWith('const ') || code.startsWith('let ')))
      ) {
        trivialRestatementCount++;
      }

      // Check for comments contradicting implementation
      if (
        (commentText.includes('throws') || commentText.includes('validat')) &&
        (code.includes('return true') || code.includes('pass') || code === '')
      ) {
        // Only if comment claims validation or throwing, but single-line code is empty return
        if (commentText.includes('throws error if') && !code.includes('throw')) {
          findings.push({
            artifactType: 'code_comment',
            sourceLocation: `${file.filePath}:${c.line}`,
            observedSignal: 'Comment asserts behavior not reflected in subsequent implementation',
            explanation: `Comment at line ${c.line} claims "${c.text}", but subsequent implementation does not throw or reject.`,
            signalAssessment: 'moderate',
            limitation: 'Could result from outdated code after refactoring where the comment was not updated.'
          });
        }
      }
    }

    if (trivialRestatementCount >= 4) {
      findings.push({
        artifactType: 'code_comment',
        sourceLocation: file.filePath,
        observedSignal: 'Repetitive syntax-restating comments without architectural reasoning',
        explanation: `${file.filePath} contains multiple comments that merely restate the immediate syntactic operation rather than providing technical rationale.`,
        signalAssessment: 'weak',
        limitation: 'Junior developers learning a language or educational codebases often annotate obvious steps.'
      });
    }
  }

  // =========================================================================
  // Overall Assessment Synthesis
  // =========================================================================
  let overallAssessment: AISignalAnalysisResult['overallAssessment'] = 'insufficient_evidence';
  let summary = 'No meaningful AI-authorship signals detected across analyzed commits and comments.';

  const strongCount = findings.filter(f => f.signalAssessment === 'strong').length;
  const moderateCount = findings.filter(f => f.signalAssessment === 'moderate').length;
  const weakCount = findings.filter(f => f.signalAssessment === 'weak').length;

  if (strongCount > 0) {
    overallAssessment = 'strong_signals';
    summary = `Detected ${strongCount} strong signal(s) suggesting potential direct generative AI artifact inclusion (e.g. unedited assistant conversational markers).`;
  } else if (moderateCount >= 2) {
    overallAssessment = 'moderate_signals';
    summary = `Detected ${moderateCount} moderate signal(s) regarding repetitive templates or commit-diff discrepancies.`;
  } else if (weakCount > 0 || moderateCount === 1) {
    overallAssessment = 'weak_signals';
    summary = `Detected minor stylistic observations (${weakCount + moderateCount} finding(s)). These are common in standard development and do not indicate AI generation.`;
  }

  return {
    overallAssessment,
    findings,
    summary,
    limitationNotice: AI_SIGNAL_DISCLAIMER,
    analyzedArtifactsCount: {
      commits: commits.length,
      comments: totalCommentsChecked,
      docFiles: fileComments.length
    }
  };
}
