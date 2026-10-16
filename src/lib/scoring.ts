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

/**
 * Calculates a statistically grounded confidence rating (0-100%)
 * based on concrete evidence breadth, test verification, and commit corroboration.
 * Never inflates confidence based on stylistic conventions or AI assistance.
 */
export function calculateGroundedConfidence(evidence: {
  evidenceType?: string;
  evidenceStrength?: string;
  hasAssertions?: boolean;
  commitCount?: number;
  hasDiff?: boolean;
  treeAnalyzed?: boolean;
  isInsufficientEvidence?: boolean;
}): number {
  const {
    evidenceType,
    evidenceStrength,
    hasAssertions,
    commitCount = 1,
    hasDiff,
    treeAnalyzed,
    isInsufficientEvidence
  } = evidence;

  // If evidence is insufficient or unavailable (e.g. empty repository or inaccessible file contents),
  // confidence is intentionally low (25%) because the repository state is inconclusive.
  if (isInsufficientEvidence) {
    return 25;
  }

  // Negative finding confidence: if the tree was actively analyzed and nothing was found,
  // confidence in the negative finding is high (88%).
  if (evidenceType === 'none' || evidenceStrength === 'none') {
    return treeAnalyzed ? 88 : 75;
  }

  // Base confidence by evidence type
  let base = 50;
  switch (evidenceType) {
    case 'direct_implementation':
      base = evidenceStrength === 'strong' ? 75 : 60;
      break;
    case 'test_verification':
      base = 75;
      break;
    case 'configuration':
      base = 60;
      break;
    case 'dependency_usage':
      base = 40;
      break;
    case 'documentation':
      base = 30;
      break;
  }

  // Corroboration adjustments based on verifiable artifacts
  if (hasAssertions) base += 10;
  if (commitCount >= 2) base += 8;
  if (hasDiff) base += 5;

  return Math.min(98, Math.max(20, base));
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

    const calculatedConfidence = calculateGroundedConfidence({
      evidenceType: ev.evidenceType,
      evidenceStrength: ev.evidenceStrength,
      hasAssertions: (ev.testResultsSummary?.assertionsFound || 0) > 0,
      commitCount: ev.relevantCommits?.length || (ev.commitSha ? 1 : 0),
      hasDiff: Boolean(ev.additionsOrPatterns && ev.additionsOrPatterns.length > 0),
      treeAnalyzed: true,
      isInsufficientEvidence: ev.isInsufficientEvidence
    });

    return {
      ...ev,
      status,
      confidence: calculatedConfidence,
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
