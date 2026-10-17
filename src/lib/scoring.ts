import {
  RepositoryEvidence,
  DeterministicScoreBreakdown,
  EvidenceStatus
} from './types';

export const SCORING_RULE_VERSION = 'v2026.1';

export interface ScoringWeights {
  implementation: {
    strong: number;
    moderate: number;
    weak: number;
    none: number;
  };
  testVerification: {
    executableAssertions: number;
    scaffoldingOnly: number;
    none: number;
  };
  continuity: {
    threePlusCommits: number;
    twoCommits: number;
    singleCommit: number;
  };
  statusThresholds: {
    demonstrated: number;
    partial: number;
  };
}

export const DEFAULT_SCORING_CONFIG: ScoringWeights = {
  implementation: {
    strong: 55, // Verifiable working implementation logic with structured constructs
    moderate: 35, // Configuration, schema, or basic handler
    weak: 15, // Scaffolding or dependency presence without core logic
    none: 0
  },
  testVerification: {
    executableAssertions: 25, // Active test suites with assertion assertions (expect/assert)
    scaffoldingOnly: 10, // Test files present without verified assertions
    none: 0
  },
  continuity: {
    threePlusCommits: 20, // Repeated contributions across 3+ commits
    twoCommits: 15, // Contributions verified in 2 commits
    singleCommit: 5 // Single isolated commit
  },
  statusThresholds: {
    demonstrated: 70, // >= 70 points
    partial: 30 // 30 - 69 points
  }
};

export interface GroundedConfidenceCriteria {
  factor: string;
  impact: number;
}

export interface DetailedConfidenceResult {
  confidence: number;
  explanation: string;
  criteria: GroundedConfidenceCriteria[];
  verificationLevel: 'file_discovery' | 'source_inspected' | 'implementation_verified' | 'negative_verification';
}

/**
 * Evaluates detailed confidence metrics distinguishing:
 * 1. File discovery (filename matched in tree only)
 * 2. Source-code inspection (file content examined at commit)
 * 3. Implementation verification (concrete handler, schema, assertions verified)
 * 4. Requirement satisfaction (demonstrated, partial, not_demonstrated)
 */
export function evaluateConfidenceDetails(evidence: {
  evidenceType?: string;
  evidenceStrength?: string;
  hasAssertions?: boolean;
  commitCount?: number;
  hasDiff?: boolean;
  treeAnalyzed?: boolean;
  isInsufficientEvidence?: boolean;
  sourceRetrievalStatus?: 'retrieved' | 'failed' | 'not_attempted' | 'missing_file';
  verificationLevel?: 'file_discovery' | 'source_inspected' | 'implementation_verified' | 'negative_verification';
  isImplementationVerified?: boolean;
  codeExcerpt?: string;
  hasVerifiedExcerpt?: boolean;
}): DetailedConfidenceResult {
  const {
    evidenceType,
    evidenceStrength,
    hasAssertions,
    commitCount = 1,
    hasDiff,
    treeAnalyzed,
    isInsufficientEvidence,
    sourceRetrievalStatus,
    verificationLevel: explicitLevel,
    isImplementationVerified: explicitImplVerified,
    codeExcerpt,
    hasVerifiedExcerpt
  } = evidence;

  // 1. Inconclusive / Insufficient evidence
  if (isInsufficientEvidence) {
    return {
      confidence: 25,
      explanation: 'Inconclusive (25%): repository contains insufficient source files or commit history to evaluate technical implementation.',
      criteria: [{ factor: 'Empty or inaccessible repository scope', impact: 25 }],
      verificationLevel: 'file_discovery'
    };
  }

  // 2. Negative finding confidence: tree was analyzed and confirmed absence of matching constructs
  if (evidenceType === 'none' || evidenceStrength === 'none' || explicitLevel === 'negative_verification') {
    const isTreeAnalyzed = treeAnalyzed !== false && (
      treeAnalyzed === true ||
      sourceRetrievalStatus === 'missing_file' ||
      explicitLevel === 'negative_verification' ||
      Boolean(commitCount)
    );
    const score = isTreeAnalyzed ? 88 : 75;
    return {
      confidence: score,
      explanation: `High confidence in negative finding (${score}%): active tree inspection confirmed no matching files or endpoint implementations exist in the repository.`,
      criteria: [{ factor: isTreeAnalyzed ? 'Active tree scan confirmed absence of matching files' : 'Repository tree analyzed', impact: score }],
      verificationLevel: 'negative_verification'
    };
  }

  // Determine implementation verification state
  const hasConcreteExcerpt = Boolean((codeExcerpt && codeExcerpt.trim().length > 0) || hasVerifiedExcerpt);
  const isImplVerified = explicitImplVerified !== undefined
    ? explicitImplVerified
    : explicitLevel === 'implementation_verified'
      ? true
      : evidenceStrength === 'strong' && hasConcreteExcerpt;

  // 3. Source retrieval failed without prior verified implementation: cannot verify source
  if (sourceRetrievalStatus === 'failed' && !isImplVerified) {
    return {
      confidence: 25,
      explanation: 'Low confidence (25%): candidate file discovered in tree metadata, but source-code retrieval failed. An uninspected filename cannot prove implementation.',
      criteria: [{ factor: 'File path discovered in tree metadata only; source retrieval failed', impact: 25 }],
      verificationLevel: 'file_discovery'
    };
  }

  // 4. File discovery only: filename matched in tree, but no source inspection or verified implementation
  if (explicitLevel === 'file_discovery' || (!isImplVerified && evidenceStrength === 'weak')) {
    return {
      confidence: 25,
      explanation: 'Low confidence (25%): candidate file matched in tree metadata only. Detecting a filename or directory does not prove implementation.',
      criteria: [{ factor: 'File path matched in repository tree', impact: 25 }],
      verificationLevel: 'file_discovery'
    };
  }

  // 5. Source code inspected, but implementation unverified (e.g. schemas without route handlers, test scaffolding without assertions)
  if (!isImplVerified) {
    let score = 35;
    const criteria: GroundedConfidenceCriteria[] = [
      { factor: 'Candidate file inspected at commit; supporting schemas or scaffolding detected', impact: 35 }
    ];

    if (sourceRetrievalStatus === 'retrieved' || hasConcreteExcerpt) {
      score += 5;
      criteria.push({ factor: 'Source code verified and retrieved at analyzed commit', impact: 5 });
    }

    if (commitCount >= 2) {
      score += 5;
      criteria.push({ factor: 'Corroborated across 2+ commits', impact: 5 });
    }

    // Explicit cap: unverified implementation must never exceed 45% confidence
    const cappedScore = Math.min(45, score);
    return {
      confidence: cappedScore,
      explanation: `Moderate confidence (${cappedScore}%): source code was inspected at commit; supporting structures detected, but concrete implementation (e.g. HTTP route handlers) remains unverified (capped at 45%). Finding a file does not prove implementation.`,
      criteria,
      verificationLevel: 'source_inspected'
    };
  }

  // 6. Verified implementation: concrete constructs (endpoints, queries, assertions) verified in source code
  let base = 70;
  const criteria: GroundedConfidenceCriteria[] = [];

  switch (evidenceType) {
    case 'direct_implementation':
      base = 75;
      criteria.push({ factor: 'Verified concrete implementation with line-level source excerpt', impact: 75 });
      break;
    case 'test_verification':
      base = 75;
      criteria.push({ factor: 'Verified executable test suite with assertions', impact: 75 });
      break;
    case 'configuration':
      base = 70;
      criteria.push({ factor: 'Verified production configuration directives', impact: 70 });
      break;
    case 'documentation':
      base = 65;
      criteria.push({ factor: 'Verified repository documentation and hygiene', impact: 65 });
      break;
    default:
      base = 70;
      criteria.push({ factor: 'Verified implementation pattern', impact: 70 });
  }

  // Corroborations
  if (hasConcreteExcerpt && sourceRetrievalStatus !== 'failed') {
    base += 10;
    criteria.push({ factor: 'Verified source code excerpt retrieved at analyzed commit', impact: 10 });
  }
  if (hasAssertions) {
    base += 10;
    criteria.push({ factor: 'Automated test assertions present', impact: 10 });
  }
  if (commitCount >= 2) {
    base += 8;
    criteria.push({ factor: 'Corroborated across multiple commits', impact: 8 });
  }
  if (hasDiff && sourceRetrievalStatus !== 'failed') {
    base += 5;
    criteria.push({ factor: 'Verified code diff additions', impact: 5 });
  }

  // If source retrieval failed for an otherwise verified implementation, keep confidence grounded
  if (sourceRetrievalStatus === 'failed') {
    criteria.push({ factor: 'Full source excerpt retrieval failed, but implementation verified from commit artifacts', impact: 0 });
  }

  const finalScore = Math.min(98, Math.max(20, base));
  const explanation = sourceRetrievalStatus === 'failed'
    ? `High confidence (${finalScore}%): implementation verified from commit artifacts. Full excerpt retrieval encountered an error, but implementation verification succeeded.`
    : `High confidence (${finalScore}%): verified concrete implementation with line-level excerpt at analyzed commit, corroborated by repository artifacts.`;

  return {
    confidence: finalScore,
    explanation,
    criteria,
    verificationLevel: 'implementation_verified'
  };
}

/**
 * Calculates a statistically grounded confidence rating (0-100%)
 * based on explicit, documented, deterministic criteria.
 * Distinguishes file discovery, source inspection, implementation verification, and requirement satisfaction.
 */
export function calculateGroundedConfidence(evidence: {
  evidenceType?: string;
  evidenceStrength?: string;
  hasAssertions?: boolean;
  commitCount?: number;
  hasDiff?: boolean;
  treeAnalyzed?: boolean;
  isInsufficientEvidence?: boolean;
  sourceRetrievalStatus?: 'retrieved' | 'failed' | 'not_attempted' | 'missing_file';
  verificationLevel?: 'file_discovery' | 'source_inspected' | 'implementation_verified' | 'negative_verification';
  isImplementationVerified?: boolean;
  codeExcerpt?: string;
  hasVerifiedExcerpt?: boolean;
}): number {
  return evaluateConfidenceDetails(evidence).confidence;
}

/**
 * Computes deterministic score breakdown for a single evidence item.
 */
export function computeScoreForEvidence(
  ev: RepositoryEvidence,
  config: ScoringWeights = DEFAULT_SCORING_CONFIG
): DeterministicScoreBreakdown {
  const factors: string[] = [];
  let basePoints = 0;
  let testBonus = 0;
  let continuityBonus = 0;

  // 1. Implementation evaluation
  const strength = ev.evidenceStrength || (
    ev.status === 'demonstrated' ? 'strong' :
    ev.status === 'partial' ? 'moderate' : 'none'
  );

  switch (strength) {
    case 'strong':
      basePoints = config.implementation.strong;
      factors.push(`Verified concrete implementation pattern (+${basePoints} pts)`);
      break;
    case 'moderate':
      basePoints = config.implementation.moderate;
      factors.push(`Partial or configuration pattern discovered (+${basePoints} pts)`);
      break;
    case 'weak':
      basePoints = config.implementation.weak;
      factors.push(`Dependency or weak scaffolding evidence (+${basePoints} pts)`);
      break;
    default:
      basePoints = config.implementation.none;
      factors.push('No verifiable implementation discovered (0 pts)');
  }

  // Double-counting safeguard: if evidence overlaps with another requirement without independent proof,
  // cap base points so identical files/lines cannot inflate multiple requirement scores.
  if (ev.sharedEvidenceWith && ev.sharedEvidenceWith.length > 0) {
    basePoints = Math.min(basePoints, config.implementation.weak);
    factors.push(`Shared evidence with [${ev.sharedEvidenceWith.join(', ')}]: base points adjusted to ${basePoints} to prevent double-counting`);
  }

  // 2. Test verification evaluation
  const assertions = ev.testResultsSummary?.assertionsFound || 0;
  if (assertions > 0) {
    testBonus = config.testVerification.executableAssertions;
    factors.push(`Automated test verification with assertions (+${testBonus} pts)`);
  } else if (ev.testResultsSummary && ev.testResultsSummary.testFilesCount > 0) {
    testBonus = config.testVerification.scaffoldingOnly;
    factors.push(`Test files identified without assertion execution (+${testBonus} pts)`);
  }

  // 3. Multi-commit continuity evaluation
  const commits = ev.relevantCommits || (ev.commitSha ? [ev.commitSha] : []);
  const distinctCommits = Array.from(new Set(commits.filter(Boolean)));

  if (distinctCommits.length >= 3) {
    continuityBonus = config.continuity.threePlusCommits;
    factors.push(`Corroborated across ${distinctCommits.length} commits (+${continuityBonus} pts)`);
  } else if (distinctCommits.length === 2) {
    continuityBonus = config.continuity.twoCommits;
    factors.push(`Corroborated across 2 distinct commits (+${continuityBonus} pts)`);
  } else if (distinctCommits.length === 1 && strength !== 'none') {
    continuityBonus = config.continuity.singleCommit;
    factors.push(`Single commit verification (+${continuityBonus} pts)`);
  }

  const rawTotal = basePoints + testBonus + continuityBonus;
  const score = Math.min(100, Math.max(0, rawTotal));

  const calculationSummary = `Score: ${score}/100. Breakdown: ${basePoints} base pts (${strength}) + ${testBonus} test pts (${assertions} assertions) + ${continuityBonus} continuity pts (${distinctCommits.length} distinct commits). Rule: ${SCORING_RULE_VERSION}.`;

  return {
    score,
    rank: 0, // Assigned later across all skills
    ruleVersion: SCORING_RULE_VERSION,
    basePoints,
    testBonus,
    continuityBonus,
    factors,
    calculationSummary
  };
}

/**
 * Deterministically ranks all skills with consistent tie-breaking rules:
 * 1. Total score (descending)
 * 2. Test bonus points (descending)
 * 3. Base implementation points (descending)
 * 4. Continuity bonus points (descending)
 * 5. Requirement Title alphanumeric (ascending)
 */
export function rankEvidenceDeterministically(
  evidenceList: RepositoryEvidence[],
  config: ScoringWeights = DEFAULT_SCORING_CONFIG
): RepositoryEvidence[] {
  // Compute score for each item
  const scored = evidenceList.map(ev => {
    const breakdown = computeScoreForEvidence(ev, config);

    // Derive deterministic status from score
    let status: EvidenceStatus = 'not_demonstrated';
    if (breakdown.score >= config.statusThresholds.demonstrated) {
      status = 'demonstrated';
    } else if (breakdown.score >= config.statusThresholds.partial) {
      status = 'partial';
    }

    const hasExcerpt = Boolean(ev.codeExcerpt && ev.codeExcerpt.trim().length > 0);
    const isImplVerified = ev.verificationLevel === 'implementation_verified' ||
      (status === 'demonstrated' && ev.evidenceStrength === 'strong' && (hasExcerpt || ev.lineStart !== undefined));

    const detailedConfidence = evaluateConfidenceDetails({
      evidenceType: ev.evidenceType,
      evidenceStrength: ev.evidenceStrength,
      hasAssertions: (ev.testResultsSummary?.assertionsFound || 0) > 0,
      commitCount: ev.relevantCommits?.length || (ev.commitSha ? 1 : 0),
      hasDiff: Boolean(ev.additionsOrPatterns && ev.additionsOrPatterns.length > 0),
      treeAnalyzed: true,
      isInsufficientEvidence: ev.isInsufficientEvidence,
      sourceRetrievalStatus: ev.sourceRetrievalStatus,
      verificationLevel: ev.verificationLevel || (isImplVerified ? 'implementation_verified' : (ev.filePath ? 'source_inspected' : 'file_discovery')),
      isImplementationVerified: isImplVerified,
      codeExcerpt: ev.codeExcerpt,
      hasVerifiedExcerpt: hasExcerpt
    });

    return {
      ...ev,
      status,
      confidence: detailedConfidence.confidence,
      confidenceExplanation: ev.confidenceExplanation || detailedConfidence.explanation,
      verificationLevel: ev.verificationLevel || detailedConfidence.verificationLevel,
      scoreBreakdown: breakdown
    };
  });

  // Sort deterministically
  scored.sort((a, b) => {
    const aBreak = a.scoreBreakdown!;
    const bBreak = b.scoreBreakdown!;

    // 1. Total score
    if (bBreak.score !== aBreak.score) {
      return bBreak.score - aBreak.score;
    }
    // 2. Test bonus
    if (bBreak.testBonus !== aBreak.testBonus) {
      aBreak.tieBreakerReason = 'Tie broken by test verification points';
      bBreak.tieBreakerReason = 'Tie broken by test verification points';
      return bBreak.testBonus - aBreak.testBonus;
    }
    // 3. Base implementation
    if (bBreak.basePoints !== aBreak.basePoints) {
      aBreak.tieBreakerReason = 'Tie broken by implementation base points';
      bBreak.tieBreakerReason = 'Tie broken by implementation base points';
      return bBreak.basePoints - aBreak.basePoints;
    }
    // 4. Continuity bonus
    if (bBreak.continuityBonus !== aBreak.continuityBonus) {
      aBreak.tieBreakerReason = 'Tie broken by multi-commit continuity bonus';
      bBreak.tieBreakerReason = 'Tie broken by multi-commit continuity bonus';
      return bBreak.continuityBonus - aBreak.continuityBonus;
    }
    // 5. Alphanumeric title
    aBreak.tieBreakerReason = 'Tie broken by requirement title alphabetical ordering';
    bBreak.tieBreakerReason = 'Tie broken by requirement title alphabetical ordering';
    return a.requirementTitle.localeCompare(b.requirementTitle);
  });

  // Assign 1-indexed ranks
  return scored.map((item, index) => ({
    ...item,
    scoreBreakdown: {
      ...item.scoreBreakdown!,
      rank: index + 1
    }
  }));
}
