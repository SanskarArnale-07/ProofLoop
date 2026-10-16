export type EvidenceStatus = 'demonstrated' | 'partial' | 'not_demonstrated';

export type AssessmentStatus = 'idle' | 'extracting' | 'analyzing' | 'completed' | 'failed';

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
  eventType: 'assessment_created' | 'commit_detected' | 'reassessment_started' | 'reassessment_completed' | 'skill_promoted' | 'skill_unchanged' | 'webhook_received';
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
