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
    | 'reassessment_failed';
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

export interface RevisionComparison {
  assessmentId: string;
  fromRevisionNumber: number;
  toRevisionNumber: number;
  fromCommitSha: string;
  toCommitSha: string;
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
