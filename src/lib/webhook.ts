import crypto from 'node:crypto';
import {
  findAssessmentByRepo,
  getAssessment,
  hasRevisionForCommit,
  saveRevision,
  addActivityEvent,
  isWebhookDeliveryDuplicate,
  recordWebhookDelivery,
  recordAssessmentFailure
} from './db';
import { fetchRepoTree } from './github';
import { evaluateRepositoryCore } from './analyzer';
import { AssessmentRevision, ActivityEvent, WebhookDeliveryLog, CommitInfo } from './types';
import { SCORING_RULE_VERSION } from './scoring';

export type WebhookOutcome =
  | 'processed'
  | 'ignored'
  | 'duplicate'
  | 'invalid_signature'
  | 'bad_payload'
  | 'error';

// Deliveries currently being analyzed. Prevents two identical deliveries that
// arrive at the same moment from both creating a revision.
const inFlightDeliveries = new Set<string>();

// Assessment queues to serialize evaluations per assessment so rapid successive pushes
// cannot race, produce out-of-order revisions, or allow an older result to overwrite a newer result.
const assessmentQueues = new Map<string, Promise<unknown>>();

/**
 * Unsigned webhooks are only ever accepted for local development, and only when
 * explicitly opted in. Production always requires GITHUB_WEBHOOK_SECRET.
 */
export function isUnsignedWebhookAllowed(): boolean {
  return (
    process.env.PROOFLOOP_ALLOW_UNSIGNED_WEBHOOKS === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

export interface ProcessWebhookResult {
  success: boolean;
  status: WebhookOutcome;
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
  // Fail closed: with no secret configured nothing can be verified, so reject.
  if (!secret) {
    return false;
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
    /** Used only by the in-app simulator, which signs its own payloads. */
    secretOverride?: string;
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
  const secret = options?.secretOverride ?? process.env.GITHUB_WEBHOOK_SECRET;

  // 1. Signature Verification (fails closed when no secret is configured)
  const unsignedAllowed = !secret && isUnsignedWebhookAllowed();
  const isSignatureValid = unsignedAllowed || verifyWebhookSignature(rawBody, signature, secret);
  if (!isSignatureValid) {
    return {
      success: false,
      status: 'invalid_signature',
      message: secret
        ? 'Invalid webhook signature: HMAC SHA-256 check failed.'
        : 'Webhook rejected: GITHUB_WEBHOOK_SECRET is not configured on the server.',
      deliveryId
    };
  }

  // GitHub sends a "ping" when a webhook is first created.
  if (eventType === 'ping') {
    return {
      success: true,
      status: 'ignored',
      message: 'Ping received. ProofLoop webhook is configured correctly.',
      deliveryId
    };
  }

  // 2. Deduplication: only deliveries that finished successfully are recorded,
  // so GitHub's "Redeliver" still works after a failure.
  if ((await isWebhookDeliveryDuplicate(deliveryId)) || inFlightDeliveries.has(deliveryId)) {
    return {
      success: true,
      status: 'duplicate',
      message: `Delivery ${deliveryId} has already been processed. Skipping duplicate.`,
      deliveryId
    };
  }

  // Only handle push events
  if (eventType !== 'push') {
    return {
      success: true,
      status: 'ignored',
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
      status: 'bad_payload',
      message: 'Malformed JSON payload in webhook delivery.',
      deliveryId
    };
  }

  const repositoryObj = (payload.repository as Record<string, unknown>) || {};
  const repoFullName = (repositoryObj.full_name as string) || (repositoryObj.name as string);
  if (!repoFullName) {
    return {
      success: false,
      status: 'bad_payload',
      message: 'Missing repository information in webhook payload.',
      deliveryId
    };
  }

  // Find corresponding assessment in our database
  const assessment = await findAssessmentByRepo(repoFullName);
  if (!assessment) {
    return {
      success: true,
      status: 'ignored',
      message: `No active ProofLoop assessment found for repository "${repoFullName}". Event ignored.`,
      deliveryId,
      repoFullName
    };
  }

  // Only the default branch counts: ignore branch deletions, tags, other branches.
  const pushedRef = typeof payload.ref === 'string' ? payload.ref : '';
  const defaultRef = `refs/heads/${assessment.repository.defaultBranch}`;
  if (payload.deleted === true) {
    return {
      success: true,
      status: 'ignored',
      message: `Branch deletion for "${pushedRef || 'unknown ref'}" ignored.`,
      deliveryId,
      repoFullName
    };
  }
  if (pushedRef !== defaultRef) {
    return {
      success: true,
      status: 'ignored',
      message: `Push to "${pushedRef || 'unknown ref'}" ignored. ProofLoop only reassesses pushes to ${defaultRef}.`,
      deliveryId,
      repoFullName
    };
  }
  if (!Array.isArray(payload.commits) || (payload.commits.length === 0 && !payload.head_commit)) {
    return {
      success: true,
      status: 'ignored',
      message: 'Push contained no commits. Nothing to reassess.',
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

  // 6. Run Reassessment with failure safety and assessment serialization
  const [owner, repoName] = repoFullName.split('/');
  inFlightDeliveries.add(deliveryId);

  // Queue execution for this assessment so rapid pushes run in deterministic sequence
  const previousQueuedTask = assessmentQueues.get(assessment.id) || Promise.resolve();
  let releaseQueue: () => void;
  const currentQueueTask = new Promise<void>(resolve => { releaseQueue = resolve; });
  assessmentQueues.set(assessment.id, previousQueuedTask.then(() => currentQueueTask).catch(() => {}));

  await previousQueuedTask.catch(() => {});

  try {
    // Re-fetch latest assessment state from DB in case a previous queued push completed
    const currentAssessment = (await getAssessment(assessment.id)) || assessment;

    // Check if commit has already been evaluated for this assessment
    if (
      currentAssessment.latestRevision?.commitSha === commitSha ||
      (await hasRevisionForCommit(currentAssessment.id, commitSha))
    ) {
      return {
        success: true,
        status: 'duplicate',
        message: `Commit ${commitSha} is already evaluated for assessment "${currentAssessment.id}". Skipping duplicate.`,
        deliveryId,
        assessmentId: currentAssessment.id,
        repoFullName,
        commitSha
      };
    }

    let fileTree;
    try {
      fileTree = await fetchRepoTree(owner, repoName, currentAssessment.repository.defaultBranch);
    } catch {
      fileTree = currentAssessment.latestRevision.evidence
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

    // Call the shared core evaluation engine (evaluateRepositoryCore)
    const coreResult = await evaluateRepositoryCore({
      assessmentId: currentAssessment.id,
      repoFullName: currentAssessment.repository.fullName,
      defaultBranch: currentAssessment.repository.defaultBranch,
      targetCommitSha: commitSha,
      requirements: currentAssessment.internship.requirements,
      triggerType: 'webhook',
      triggerMessage: commitMessage,
      fileTree,
      commits: commitInfos,
      localFileCache: options?.mockFiles
    });

    if (!coreResult.success) {
      throw new Error(coreResult.error || 'Repository core evaluation failed');
    }

    // Compare with previous revision to detect skill promotions
    const previousEvidenceMap = new Map(currentAssessment.latestRevision.evidence.map(e => [e.requirementId, e.status]));
    const promotedSkills: string[] = [];

    for (const newEv of coreResult.evidenceList) {
      const prevStatus = previousEvidenceMap.get(newEv.requirementId);
      if (newEv.status === 'demonstrated' && prevStatus !== 'demonstrated') {
        promotedSkills.push(newEv.requirementTitle);
      }
    }

    // Persist New Assessment Revision
    const newRevisionNumber = currentAssessment.currentRevisionNumber + 1;
    const demonstratedCount = coreResult.evidenceList.filter(e => e.status === 'demonstrated').length;
    const partialCount = coreResult.evidenceList.filter(e => e.status === 'partial').length;
    const notDemonstratedCount = coreResult.evidenceList.filter(e => e.status === 'not_demonstrated').length;

    const newRevision: AssessmentRevision = {
      id: `rev-${currentAssessment.id}-${newRevisionNumber}`,
      assessmentId: currentAssessment.id,
      revisionNumber: newRevisionNumber,
      commitSha,
      commitMessage,
      triggerType: 'webhook',
      evidence: coreResult.evidenceList,
      demonstratedCount,
      partialCount,
      notDemonstratedCount,
      scoringRuleVersion: SCORING_RULE_VERSION,
      analysisScope: coreResult.analysisScope,
      aiSignals: coreResult.aiSignals,
      createdAt: new Date().toISOString()
    };

    await saveRevision(newRevision);

    // Record Activity Event
    const activityEvent: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assessmentId: currentAssessment.id,
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
    await addActivityEvent(activityEvent);

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
      signatureValid: isSignatureValid && !unsignedAllowed,
      affectedRequirements: affectedReqs,
      createdAt: new Date().toISOString()
    };
    await recordWebhookDelivery(log);

    return {
      success: true,
      status: 'processed',
      message: `Reassessment completed successfully. Created revision #${newRevisionNumber}.`,
      deliveryId,
      assessmentId: currentAssessment.id,
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
    await recordAssessmentFailure(assessment.id, errMsg);

    // The delivery is deliberately NOT recorded as processed, so GitHub's
    // "Redeliver" button can retry it.
    return {
      success: false,
      status: 'error',
      message: `Reassessment failed: ${errMsg}. Previous successful revision was preserved.`,
      deliveryId,
      assessmentId: assessment.id,
      repoFullName,
      commitSha
    };
  } finally {
    releaseQueue!();
    inFlightDeliveries.delete(deliveryId);
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
