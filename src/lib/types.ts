export type EvidenceStatus = 'demonstrated' | 'partial' | 'not_demonstrated';

export type AssessmentStatus = 'idle' | 'extracting' | 'analyzing' | 'completed' | 'failed';

export type EvidenceType =
  | 'direct_implementation'
  | 'test_verification'
  | 'dependency_usage'
  | 'configuration'
  | 'documentation'
  | 'none';

export type EvidenceStrength = 'strong' | 'moderate' | 'weak' | 'none';

export interface InternshipRequirement {
  id: string;
  category: 'core' | 'backend' | 'frontend' | 'database' | 'devops' | 'testing' | 'architecture' | 'general';
  title: string;
  description: string;
  importance: 'required' | 'preferred';
  isInferred?: boolean;
}

export interface InternshipPosting {
  id: string;
  title: string;
  company: string;
  location?: string;
  sourceUrl: string;
  rawText?: string;
  requirements: InternshipRequirement[];
  createdAt: string;
}

export interface AnalysisScope {
  commitsAnalyzed: number;
  totalCommitsChecked: number;
  filesInspected: number;
  branch: string;
  truncated: boolean;
  scopeDescription: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  authorName: string;
  authorEmail?: string;
  committerName?: string;
  timestamp: string;
  filesChanged: string[];
  additions?: number;
  deletions?: number;
  patch?: string;
}

export interface TestResultSummary {
  testFilesCount: number;
  assertionsFound: number;
  verifiedPassing?: boolean;
  executionSummary?: string;
}

export interface AuthorAttribution {
  author: string;
  isDirectAuthor: boolean;
  attributionCertainty: 'verified' | 'probable' | 'uncertain' | 'shared';
  attributionNotes?: string;
}

export interface DeterministicScoreBreakdown {
  score: number; // 0 - 100
  rank: number; // 1-indexed relative rank
  ruleVersion: string;
  basePoints: number;
  testBonus: number;
  continuityBonus: number;
  factors: string[];
  tieBreakerReason?: string;
  calculationSummary?: string;
}

export interface RepositoryEvidence {
  requirementId: string;
  requirementTitle: string;
  status: EvidenceStatus;
  explanation: string;
  repoFullName: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeExcerpt?: string;
  commitSha: string;
  confidence: number; // 0 - 100
  uncertaintyNotes?: string;

  // Enhanced evidence properties
  category?: string;
  evidenceType?: EvidenceType;
  evidenceStrength?: EvidenceStrength;
  relevantCommits?: string[];
  relevantFiles?: string[];
  additionsOrPatterns?: string[];
  testResultsSummary?: TestResultSummary;
  limitations?: string[];
  contradictoryEvidence?: string[];
  missingInformation?: string[];
  humanReadableExplanation?: string;
  scoreBreakdown?: DeterministicScoreBreakdown;
  authorAttribution?: AuthorAttribution;
  sharedEvidenceWith?: string[];
  isInsufficientEvidence?: boolean;

  // Source-code retrieval and diagnostic verification properties
  sourceRetrievalStatus?: 'retrieved' | 'failed' | 'not_attempted' | 'missing_file';
  sourceRetrievalError?: string;
  detectedWhat?: string;
  evidenceSupports?: string;
  notVerified?: string;
  confidenceExplanation?: string;
  verificationLevel?: 'file_discovery' | 'source_inspected' | 'implementation_verified' | 'negative_verification';
}

export interface AISignalFinding {
  artifactType: 'commit_message' | 'code_comment' | 'documentation';
  sourceLocation: string; // e.g., commit SHA or file:line
  observedSignal: string;
  explanation: string;
  signalAssessment: 'weak' | 'moderate' | 'strong';
  limitation: string;
}

export interface AISignalAnalysisResult {
  overallAssessment: 'insufficient_evidence' | 'weak_signals' | 'moderate_signals' | 'strong_signals';
  findings: AISignalFinding[];
  summary: string;
  limitationNotice: string;
  analyzedArtifactsCount: {
    commits: number;
    comments: number;
    docFiles: number;
  };
}

export interface GapTask {
  id: string;
  requirementId: string;
  requirementTitle: string;
  category: string;
  title: string;
  description: string;
  expectedEvidence: string;
  acceptanceCriteria: string[];
  suggestedFiles: string[];
  projectBrief: {
    overview: string;
    suggestedScope: string;
    implementationHints: string[];
    verificationMethod: string;
  };
  status: 'pending' | 'in_progress' | 'verified';
}

export interface ActivityEvent {
  id: string;
  assessmentId: string;
  eventType:
    | 'assessment_created'
    | 'commit_detected'
    | 'reassessment_started'
    | 'reassessment_completed'
    | 'skill_promoted'
    | 'skill_unchanged'
    | 'webhook_received'
    | 'reassessment_failed'
    | 'developer_verification_completed';
  title: string;
  description: string;
  commitSha?: string;
  commitMessage?: string;
  affectedSkills?: string[];
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AssessmentRevision {
  id: string;
  assessmentId: string;
  revisionNumber: number;
  commitSha: string;
  commitMessage: string;
  triggerType: 'initial' | 'webhook' | 'manual';
  evidence: RepositoryEvidence[];
  demonstratedCount: number;
  partialCount: number;
  notDemonstratedCount: number;
  createdAt: string;

  // Enhanced audit & ranking properties
  scoringRuleVersion?: string;
  analysisScope?: AnalysisScope;
  aiSignals?: AISignalAnalysisResult;
  scoreBreakdownSummary?: {
    totalPoints: number;
    ruleVersion: string;
    rankedSkills: Array<{ requirementId: string; title: string; score: number; rank: number }>;
  };
}

export interface Assessment {
  id: string;
  internship: InternshipPosting;
  repository: {
    fullName: string;
    url: string;
    defaultBranch: string;
    isPrivate: boolean;
    language?: string;
    latestCommitSha: string;
  };
  currentRevisionNumber: number;
  status: AssessmentStatus;
  latestRevision: AssessmentRevision;
  tasks: GapTask[];
  recentActivity: ActivityEvent[];
  analysisScope?: AnalysisScope;
  aiSignals?: AISignalAnalysisResult;
  verificationSummary?: AssessmentVerificationSummary;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  deliveryId: string;
  eventType: string;
  repoFullName: string;
  commitSha: string;
  commitMessage: string;
  author: string;
  filesChanged: string[];
  signatureValid: boolean;
  affectedRequirements: string[];
  createdAt: string;
}

export interface EvaluationSummary {
  id: string;
  assessmentId: string;
  evaluationNumber: number;
  revisionNumber: number;
  commitSha: string;
  commitMessage: string;
  triggerType: 'initial' | 'webhook' | 'manual';
  timestamp: string;
  createdAt: string;
  overallScore: number;
  totalPoints: number;
  demonstratedCount: number;
  partialCount: number;
  notDemonstratedCount: number;
  totalRequirements: number;
  scoringRuleVersion: string;
  isLatest: boolean;
  evidence?: RepositoryEvidence[];
}

export interface RevisionComparison {
  assessmentId: string;
  fromRevisionNumber: number;
  toRevisionNumber: number;
  fromCommitSha: string;
  toCommitSha: string;
  fromEvaluationId?: string;
  toEvaluationId?: string;
  overallScoreChange?: {
    beforeScore: number;
    afterScore: number;
    delta: number;
  };
  newlyDemonstrated?: Array<{
    requirementId: string;
    requirementTitle: string;
    score: number;
  }>;
  categorizedRequirements?: {
    improved: Array<{
      requirementId: string;
      requirementTitle: string;
      beforeStatus: EvidenceStatus;
      afterStatus: EvidenceStatus;
      beforeScore: number;
      afterScore: number;
      delta: number;
    }>;
    regressed: Array<{
      requirementId: string;
      requirementTitle: string;
      beforeStatus: EvidenceStatus;
      afterStatus: EvidenceStatus;
      beforeScore: number;
      afterScore: number;
      delta: number;
    }>;
    unchanged: Array<{
      requirementId: string;
      requirementTitle: string;
      status: EvidenceStatus;
      score: number;
    }>;
  };
  evidenceChanges?: Array<{
    requirementId: string;
    requirementTitle: string;
    beforeFilePath?: string;
    afterFilePath?: string;
    beforeLines?: { start?: number; end?: number };
    afterLines?: { start?: number; end?: number };
    beforeAssertions?: number;
    afterAssertions?: number;
    description: string;
  }>;
  unavailableData?: string[];
  addedEvidence: Array<{
    requirementId: string;
    requirementTitle: string;
    detail: string;
  }>;
  removedEvidence: Array<{
    requirementId: string;
    requirementTitle: string;
    detail: string;
  }>;
  modifiedEvidence: Array<{
    requirementId: string;
    requirementTitle: string;
    beforeStatus: EvidenceStatus;
    afterStatus: EvidenceStatus;
    beforeScore?: number;
    afterScore?: number;
    changes: string[];
  }>;
  scoreChanges: Array<{
    requirementId: string;
    requirementTitle: string;
    beforeScore: number;
    afterScore: number;
    delta: number;
    reason: string;
  }>;
  scoringRuleChanges: {
    fromRuleVersion: string;
    toRuleVersion: string;
    isIdentical: boolean;
    differences?: string[];
  };
  summary: string;
}

// ============================================================================
// Developer Verification Types
// ============================================================================

export type VerificationAssessmentCondition =
  | 'ai_restricted_independent'
  | 'ai_assisted_disclosed'
  | 'unmonitored_takehome';

export type VerificationVerdict =
  | 'verified_demonstrated'
  | 'partial_verification'
  | 'unverified'
  | 'not_yet_verified';

export interface PracticalCodeReference {
  repoFullName: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  codeExcerpt: string;
  functionOrComponentName?: string;
  commitSha: string;
}

export interface VerificationTask {
  id: string;
  requirementId: string;
  requirementTitle: string;
  taskType:
    | 'edge_case_fix'
    | 'contract_preservation'
    | 'type_dataflow_decision'
    | 'test_addition'
    | 'defect_diagnosis';
  title: string;
  scenario: string;
  targetCode: PracticalCodeReference;
  instructions: string;
  expectedBehavior: string;
  evaluationCriteria: string[];
  permittedTools: string;
  allowedCondition: VerificationAssessmentCondition;
  isFallbackManual: boolean;
  limitationNote?: string;
}

export interface PracticalEvaluationResult {
  passed: boolean;
  syntaxValid: boolean;
  contractPreserved: boolean;
  testsPassed: number;
  totalTests: number;
  checksSummary: string[];
  strengths: string[];
  unresolvedGaps: string[];
  evaluatedAt: string;
}

export interface AdaptiveReasoningFollowup {
  id: string;
  taskId: string;
  question: string;
  contextWhyAsked: string;
  expectedCriteria: string[];
}

export interface ReasoningEvaluationResult {
  score: number; // 0 - 100
  criteriaMet: string[];
  missingReasoning: string[];
  unresolvedUncertainty: string[];
  overallEvaluation: string;
  evaluatedAt: string;
}

export interface MultidimensionalVerificationScore {
  repositoryEvidence: {
    status: EvidenceStatus;
    strength: EvidenceStrength;
    summary: string;
  };
  contributionEvidence: {
    commitFrequency: string;
    directAuthorship: boolean;
    attributionCertainty: string;
  };
  practicalPerformance: {
    passed: boolean;
    contractMaintained: boolean;
    summary: string;
  };
  reasoningEvidence: {
    depth: 'thorough' | 'adequate' | 'superficial' | 'inadequate';
    criteriaMetRatio: number; // 0.0 - 1.0
    summary: string;
  };
  verificationIntegrity: {
    condition: VerificationAssessmentCondition;
    permittedTools: string;
    environmentIntegrity: string;
  };
  confidenceAndLimitations: {
    confidenceLevel: 'high' | 'moderate' | 'low';
    limitations: string[];
    uncertaintyNotes: string;
  };
}

export interface DeveloperVerificationRecord {
  id: string;
  assessmentId: string;
  revisionId?: string;
  requirementId: string;
  requirementTitle: string;
  task: VerificationTask;
  assessmentCondition: VerificationAssessmentCondition;
  practicalSolution: string;
  practicalEvaluation: PracticalEvaluationResult;
  followupQuestion: AdaptiveReasoningFollowup;
  reasoningResponse: string;
  reasoningEvaluation: ReasoningEvaluationResult;
  dimensions: MultidimensionalVerificationScore;
  status: VerificationVerdict;
  overallVerdict: string;
  confidenceScore: number; // 0 - 100
  limitations: string[];
  createdAt: string;
}

export interface AssessmentVerificationSummary {
  assessmentId: string;
  totalRequirements: number;
  verifiedCount: number;
  partialCount: number;
  unverifiedCount: number;
  notYetVerifiedCount: number;
  overallStatus: 'all_verified' | 'partially_verified' | 'not_yet_verified';
  records: DeveloperVerificationRecord[];
  confidenceSummary: string;
  limitationsNotice: string;
}

