import crypto from 'node:crypto';
import {
  findAssessmentByRepo,
  saveRevision,
  addActivityEvent,
  isWebhookDeliveryDuplicate,
  recordWebhookDelivery,
  recordAssessmentFailure
} from './db';
import { fetchRepoTree } from './github';
import { analyzeRepositoryAgainstRequirements } from './analyzer';
import { AssessmentRevision, ActivityEvent, WebhookDeliveryLog, CommitInfo } from './types';
import { SCORING_RULE_VERSION } from './scoring';

export interface ProcessWebhookResult {
  success: boolean;
  message: string;
  deliveryId?: string;
  assessmentId?: string;
  repoFullName?: string;
  commitSha?: string;
  affectedSkills?: string[];
  newRevisionNumber?: number;
  promotedSkills?: string[];
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) {
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(rawBody).digest('hex');

    const signatureBuffer = Buffer.from(signatureHeader, 'utf8');
    const digestBuffer = Buffer.from(digest, 'utf8');

    if (signatureBuffer.length !== digestBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

export async function processPushWebhook(
  rawBody: string,
  headers: Headers | Record<string, string>,
  options?: {
    mockFiles?: Record<string, string>;
  }
): Promise<ProcessWebhookResult> {
  const getHeader = (name: string): string | null => {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    return (headers as Record<string, string>)[name] || (headers as Record<string, string>)[name.toLowerCase()] || null;
  };

  const deliveryId = getHeader('X-GitHub-Delivery') || `delivery-${Date.now()}`;
  const eventType = getHeader('X-GitHub-Event') || 'push';
  const signature = getHeader('X-Hub-Signature-256');
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  // 1. Signature Verification
  const isSignatureValid = verifyWebhookSignature(rawBody, signature, secret);
  if (!isSignatureValid) {
    return {
      success: false,
      message: 'Invalid webhook signature: HMAC SHA-256 check failed.',
      deliveryId
    };
  }

  // 2. Deduplication: safe handling of duplicate webhook deliveries
  if (isWebhookDeliveryDuplicate(deliveryId)) {
    return {
      success: true,
      message: `Delivery ${deliveryId} has already been processed. Skipping duplicate.`,
      deliveryId
    };
  }

  // Only handle push events
  if (eventType !== 'push') {
    return {
      success: true,
      message: `Event type "${eventType}" ignored. ProofLoop only monitors push events.`,
      deliveryId
    };
  }

  // 3. Parse Payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return {
      success: false,
      message: 'Malformed JSON payload in webhook delivery.',
      deliveryId
    };
  }

  const repositoryObj = (payload.repository as Record<string, unknown>) || {};
  const repoFullName = (repositoryObj.full_name as string) || (repositoryObj.name as string);
  if (!repoFullName) {
    return {
      success: false,
      message: 'Missing repository information in webhook payload.',
      deliveryId
    };
  }

  // Find corresponding assessment in our database
  const assessment = findAssessmentByRepo(repoFullName);
  if (!assessment) {
    return {
      success: true,
      message: `No active ProofLoop assessment found for repository "${repoFullName}". Event logged.`,
      deliveryId,
      repoFullName
    };
  }

  const commitsArray = Array.isArray(payload.commits) ? (payload.commits as Array<Record<string, unknown>>) : [];
  const headCommit = (payload.head_commit as Record<string, unknown>) ||
    commitsArray[0] || {
      id: payload.after || 'HEAD',
      message: 'Push commit',
      author: { name: 'Committer' },
      added: [],
      modified: [],
      removed: []
    };

  const commitSha = ((headCommit.id as string) || 'HEAD').substring(0, 7);
  const commitMessage = (((headCommit.message as string) || 'Push update').split('\n')[0]);
  const authorObj = (headCommit.author as Record<string, unknown>) || {};
  const author = (authorObj.name as string) || 'Developer';

  const filesChanged: string[] = [
    ...((headCommit.added as string[]) || []),
    ...((headCommit.modified as string[]) || []),
    ...((headCommit.removed as string[]) || [])
  ];

  // 4. Identify Affected Requirements
  const affectedReqs = identifyAffectedRequirements(filesChanged);

  // 5. Build Commit Info list from payload commits for multi-commit analysis
  const commitInfos: CommitInfo[] = commitsArray.map(c => {
    const a = (c.author as Record<string, unknown>) || {};
    const comm = (c.committer as Record<string, unknown>) || {};
    return {
      sha: ((c.id as string) || '').substring(0, 7),
      message: (c.message as string) || '',
      authorName: (a.name as string) || 'Developer',
      authorEmail: (a.email as string) || undefined,
      committerName: (comm.name as string) || undefined,
      timestamp: (c.timestamp as string) || new Date().toISOString(),
      filesChanged: [
        ...((c.added as string[]) || []),
        ...((c.modified as string[]) || []),
        ...((c.removed as string[]) || [])
      ]
    };
  });

  if (commitInfos.length === 0) {
    commitInfos.push({
      sha: commitSha,
      message: commitMessage,
      authorName: author,
      timestamp: new Date().toISOString(),
      filesChanged
    });
  }

  // 6. Run Reassessment with failure safety
  const [owner, repoName] = repoFullName.split('/');
  let fileTree;
  try {
    try {
      fileTree = await fetchRepoTree(owner, repoName, assessment.repository.defaultBranch);
    } catch {
      fileTree = assessment.latestRevision.evidence
        .filter(e => e.filePath)
        .map(e => ({ path: e.filePath!, mode: '100644', type: 'blob' as const, sha: 'curr' }));

      for (const f of filesChanged) {
        if (!fileTree.some(t => t.path === f)) {
          fileTree.push({ path: f, mode: '100644', type: 'blob' as const, sha: 'curr' });
        }
      }
    }

    if (options?.mockFiles) {
      for (const p of Object.keys(options.mockFiles)) {
        if (!fileTree.some(t => t.path === p)) {
          fileTree.push({ path: p, mode: '100644', type: 'blob' as const, sha: 'mock' });
        }
      }
    }

    const analysis = await analyzeRepositoryAgainstRequirements(
      {
        owner,
        repo: repoName,
        defaultBranch: assessment.repository.defaultBranch,
        commitSha,
        fileTree,
        commits: commitInfos,
        localFileCache: options?.mockFiles
      },
      assessment.internship.requirements
    );

    // Compare with previous revision to detect skill promotions
    const previousEvidenceMap = new Map(assessment.latestRevision.evidence.map(e => [e.requirementId, e.status]));
    const promotedSkills: string[] = [];

    for (const newEv of analysis.evidenceList) {
      const prevStatus = previousEvidenceMap.get(newEv.requirementId);
      if (newEv.status === 'demonstrated' && prevStatus !== 'demonstrated') {
        promotedSkills.push(newEv.requirementTitle);
      }
    }

    // Persist New Assessment Revision
    const newRevisionNumber = assessment.currentRevisionNumber + 1;
    const demonstratedCount = analysis.evidenceList.filter(e => e.status === 'demonstrated').length;
    const partialCount = analysis.evidenceList.filter(e => e.status === 'partial').length;
    const notDemonstratedCount = analysis.evidenceList.filter(e => e.status === 'not_demonstrated').length;

    const newRevision: AssessmentRevision = {
      id: `rev-${assessment.id}-${newRevisionNumber}`,
      assessmentId: assessment.id,
      revisionNumber: newRevisionNumber,
      commitSha,
      commitMessage,
      triggerType: 'webhook',
      evidence: analysis.evidenceList,
      demonstratedCount,
      partialCount,
      notDemonstratedCount,
      scoringRuleVersion: SCORING_RULE_VERSION,
      analysisScope: analysis.analysisScope,
      aiSignals: analysis.aiSignals,
      createdAt: new Date().toISOString()
    };

    saveRevision(newRevision);

    // Record Activity Event
    const activityEvent: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assessmentId: assessment.id,
      eventType: promotedSkills.length > 0 ? 'skill_promoted' : 'reassessment_completed',
      title: promotedSkills.length > 0
        ? `Skill Verified: ${promotedSkills.join(', ')}`
        : `Reassessment completed for commit ${commitSha}`,
      description: promotedSkills.length > 0
        ? `Commit "${commitMessage}" added verified evidence promoting: ${promotedSkills.join(', ')}.`
        : `Analyzed commit "${commitMessage}". Requirements remained consistent with existing evidence.`,
      commitSha,
      commitMessage,
      affectedSkills: affectedReqs,
      timestamp: new Date().toISOString()
    };
    addActivityEvent(activityEvent);

    // Record Webhook Delivery Log
    const log: WebhookDeliveryLog = {
      id: `del-log-${Date.now()}`,
      deliveryId,
      eventType,
      repoFullName,
      commitSha,
      commitMessage,
      author,
      filesChanged,
      signatureValid: isSignatureValid,
      affectedRequirements: affectedReqs,
      createdAt: new Date().toISOString()
    };
    recordWebhookDelivery(log);

    return {
      success: true,
      message: `Reassessment completed successfully. Created revision #${newRevisionNumber}.`,
      deliveryId,
      assessmentId: assessment.id,
      repoFullName,
      commitSha,
      affectedSkills: affectedReqs,
      newRevisionNumber,
      promotedSkills
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Webhook reassessment failed:', errMsg);

    // Crucial: preserve previous assessment when new analysis fails
    recordAssessmentFailure(assessment.id, errMsg);

    const log: WebhookDeliveryLog = {
      id: `del-log-${Date.now()}`,
      deliveryId,
      eventType,
      repoFullName,
      commitSha,
      commitMessage,
      author,
      filesChanged,
      signatureValid: isSignatureValid,
      affectedRequirements: affectedReqs,
      createdAt: new Date().toISOString()
    };
    recordWebhookDelivery(log);

    return {
      success: false,
      message: `Reassessment failed: ${errMsg}. Previous successful revision was preserved.`,
      deliveryId,
      assessmentId: assessment.id,
      repoFullName,
      commitSha
    };
  }
}

export function identifyAffectedRequirements(files: string[]): string[] {
  const affected = new Set<string>();

  for (const f of files) {
    if (/(?:test|spec|__tests__)/i.test(f)) {
      affected.add('req-testing');
    }
    if (/(?:docker|container)/i.test(f)) {
      affected.add('req-devops');
    }
    if (/(?:\.github\/workflows|ci)/i.test(f)) {
      affected.add('req-cicd');
    }
    if (/(?:routes?|controllers?|api|endpoints?)/i.test(f)) {
      affected.add('req-api');
    }
    if (/(?:sql|schema|migrations?|models?|db)/i.test(f)) {
      affected.add('req-db');
    }
    if (/\.(ts|tsx)$/i.test(f)) {
      affected.add('req-typescript');
    }
    if (/(?:components?|pages?|app)/i.test(f)) {
      affected.add('req-frontend');
    }
  }

  return Array.from(affected);
}
