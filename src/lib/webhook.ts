import crypto from 'node:crypto';
import {
  findAssessmentByRepo,
  saveRevision,
  addActivityEvent,
  isWebhookDeliveryDuplicate,
  recordWebhookDelivery,
  getAssessment
} from './db';
import { fetchRepoTree, fetchFileContent } from './github';
import { analyzeRepositoryAgainstRequirements } from './analyzer';
import { AssessmentRevision, ActivityEvent, WebhookDeliveryLog } from './types';

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
  // If no secret configured and no header, allow in unconfigured/demo environments with notice
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
    mockFiles?: Record<string, string>; // For local testing and interactive test lab
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

  // 2. Deduplication
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
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      success: false,
      message: 'Malformed JSON payload in webhook delivery.',
      deliveryId
    };
  }

  const repoFullName = payload.repository?.full_name || payload.repository?.name;
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

  const headCommit = payload.head_commit || (payload.commits && payload.commits[0]) || {
    id: payload.after || 'HEAD',
    message: 'Push commit',
    author: { name: 'Committer' },
    added: [],
    modified: [],
    removed: []
  };

  const commitSha = (headCommit.id || 'HEAD').substring(0, 7);
  const commitMessage = (headCommit.message || 'Push update').split('\n')[0];
  const author = headCommit.author?.name || 'Developer';

  const filesChanged: string[] = [
    ...(headCommit.added || []),
    ...(headCommit.modified || []),
    ...(headCommit.removed || [])
  ];

  // 4. Identify Affected Requirements
  const affectedReqs = identifyAffectedRequirements(filesChanged);

  // 5. Run Reassessment
  // Fetch updated file tree or combine with options.mockFiles
  const [owner, repoName] = repoFullName.split('/');
  let fileTree;
  try {
    fileTree = await fetchRepoTree(owner, repoName, assessment.repository.defaultBranch);
  } catch {
    // If external GitHub API is unreachable, build tree from existing evidence + changed files
    fileTree = assessment.latestRevision.evidence
      .filter(e => e.filePath)
      .map(e => ({ path: e.filePath!, mode: '100644', type: 'blob' as const, sha: 'sim' }));

    for (const f of filesChanged) {
      if (!fileTree.some(t => t.path === f)) {
        fileTree.push({ path: f, mode: '100644', type: 'blob' as const, sha: 'sim' });
      }
    }
  }

  // If mockFiles passed (from interactive test lab), inject them into tree
  if (options?.mockFiles) {
    for (const p of Object.keys(options.mockFiles)) {
      if (!fileTree.some(t => t.path === p)) {
        fileTree.push({ path: p, mode: '100644', type: 'blob' as const, sha: 'sim' });
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
      localFileCache: options?.mockFiles
    },
    assessment.internship.requirements
  );

  // 6. Compare with previous revision to detect skill promotions
  const previousEvidenceMap = new Map(assessment.latestRevision.evidence.map(e => [e.requirementId, e.status]));
  const promotedSkills: string[] = [];

  for (const newEv of analysis.evidenceList) {
    const prevStatus = previousEvidenceMap.get(newEv.requirementId);
    if (newEv.status === 'demonstrated' && prevStatus !== 'demonstrated') {
      promotedSkills.push(newEv.requirementTitle);
    }
  }

  // 7. Persist New Assessment Revision
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
    createdAt: new Date().toISOString()
  };

  saveRevision(newRevision);

  // 8. Record Activity Events
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

  // 9. Record Webhook Delivery Log
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
}

function identifyAffectedRequirements(files: string[]): string[] {
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
