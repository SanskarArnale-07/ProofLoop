import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import {
  Assessment,
  AssessmentRevision,
  ActivityEvent,
  GapTask,
  InternshipPosting,
  WebhookDeliveryLog,
  RepositoryEvidence
} from './types';

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'proofloop.db');
  const db = new DatabaseSync(dbPath);

  // Enable WAL mode and foreign keys for performance and data safety
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS internships (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      source_url TEXT NOT NULL,
      raw_text TEXT,
      requirements_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      internship_id TEXT NOT NULL,
      repo_full_name TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      default_branch TEXT NOT NULL,
      latest_commit_sha TEXT NOT NULL,
      current_revision_number INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (internship_id) REFERENCES internships(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL,
      commit_sha TEXT NOT NULL,
      commit_message TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      demonstrated_count INTEGER NOT NULL,
      partial_count INTEGER NOT NULL,
      not_demonstrated_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS roadmap_tasks (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      requirement_id TEXT NOT NULL,
      task_data_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      commit_sha TEXT,
      commit_message TEXT,
      affected_skills_json TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      delivery_id TEXT UNIQUE,
      repo_full_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      commit_sha TEXT,
      commit_message TEXT,
      author TEXT,
      files_changed_json TEXT,
      signature_valid INTEGER NOT NULL,
      affected_requirements_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  dbInstance = db;
  return db;
}

// Internship operations
export function saveInternship(internship: InternshipPosting): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO internships (id, title, company, location, source_url, raw_text, requirements_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    internship.id,
    internship.title,
    internship.company,
    internship.location || null,
    internship.sourceUrl,
    internship.rawText || null,
    JSON.stringify(internship.requirements),
    internship.createdAt
  );
}

export function getInternship(id: string): InternshipPosting | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM internships WHERE id = ?`);
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    id: row.id as string,
    title: row.title as string,
    company: row.company as string,
    location: (row.location as string) || undefined,
    sourceUrl: row.source_url as string,
    rawText: (row.raw_text as string) || undefined,
    requirements: JSON.parse(row.requirements_json as string),
    createdAt: row.created_at as string
  };
}

// Assessment operations
export function saveAssessment(assessment: Assessment): void {
  const db = getDatabase();

  // Save internship first
  saveInternship(assessment.internship);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO assessments (id, internship_id, repo_full_name, repo_url, default_branch, latest_commit_sha, current_revision_number, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    assessment.id,
    assessment.internship.id,
    assessment.repository.fullName,
    assessment.repository.url,
    assessment.repository.defaultBranch,
    assessment.repository.latestCommitSha,
    assessment.currentRevisionNumber,
    assessment.status,
    assessment.createdAt,
    assessment.updatedAt
  );

  // Save latest revision
  if (assessment.latestRevision) {
    saveRevision(assessment.latestRevision);
  }

  // Save tasks
  if (assessment.tasks && assessment.tasks.length > 0) {
    for (const task of assessment.tasks) {
      saveRoadmapTask(assessment.id, task);
    }
  }

  // Save initial activities if any
  if (assessment.recentActivity && assessment.recentActivity.length > 0) {
    for (const act of assessment.recentActivity) {
      addActivityEvent(act);
    }
  }
}

export function saveRevision(rev: AssessmentRevision): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO revisions (id, assessment_id, revision_number, commit_sha, commit_message, trigger_type, evidence_json, demonstrated_count, partial_count, not_demonstrated_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    rev.id,
    rev.assessmentId,
    rev.revisionNumber,
    rev.commitSha,
    rev.commitMessage,
    rev.triggerType,
    JSON.stringify(rev.evidence),
    rev.demonstratedCount,
    rev.partialCount,
    rev.notDemonstratedCount,
    rev.createdAt
  );

  // Update latest commit on assessment
  const updateStmt = db.prepare(`
    UPDATE assessments
    SET latest_commit_sha = ?, current_revision_number = ?, updated_at = ?
    WHERE id = ?
  `);
  updateStmt.run(rev.commitSha, rev.revisionNumber, rev.createdAt, rev.assessmentId);
}

export function saveRoadmapTask(assessmentId: string, task: GapTask): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO roadmap_tasks (id, assessment_id, requirement_id, task_data_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    task.id,
    assessmentId,
    task.requirementId,
    JSON.stringify(task),
    task.status,
    new Date().toISOString()
  );
}

export function updateRoadmapTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'verified'): void {
  const db = getDatabase();
  const stmt = db.prepare(`UPDATE roadmap_tasks SET status = ? WHERE id = ?`);
  stmt.run(status, taskId);
}

export function addActivityEvent(event: ActivityEvent): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO activity_events (id, assessment_id, event_type, title, description, commit_sha, commit_message, affected_skills_json, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    event.id,
    event.assessmentId,
    event.eventType,
    event.title,
    event.description,
    event.commitSha || null,
    event.commitMessage || null,
    event.affectedSkills ? JSON.stringify(event.affectedSkills) : null,
    event.timestamp
  );
}

export function getAssessment(id: string): Assessment | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM assessments WHERE id = ?`);
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  const internship = getInternship(row.internship_id as string);
  if (!internship) return null;

  // Get latest revision
  const revStmt = db.prepare(`
    SELECT * FROM revisions 
    WHERE assessment_id = ? 
    ORDER BY revision_number DESC 
    LIMIT 1
  `);
  const revRow = revStmt.get(id) as Record<string, unknown> | undefined;

  let latestRevision: AssessmentRevision;
  if (revRow) {
    latestRevision = {
      id: revRow.id as string,
      assessmentId: revRow.assessment_id as string,
      revisionNumber: revRow.revision_number as number,
      commitSha: revRow.commit_sha as string,
      commitMessage: revRow.commit_message as string,
      triggerType: revRow.trigger_type as 'initial' | 'webhook' | 'manual',
      evidence: JSON.parse(revRow.evidence_json as string),
      demonstratedCount: revRow.demonstrated_count as number,
      partialCount: revRow.partial_count as number,
      notDemonstratedCount: revRow.not_demonstrated_count as number,
      createdAt: revRow.created_at as string
    };
  } else {
    latestRevision = {
      id: 'rev-0',
      assessmentId: id,
      revisionNumber: 1,
      commitSha: row.latest_commit_sha as string,
      commitMessage: 'Initial inspection',
      triggerType: 'initial',
      evidence: [],
      demonstratedCount: 0,
      partialCount: 0,
      notDemonstratedCount: 0,
      createdAt: row.created_at as string
    };
  }

  // Get tasks
  const tasksStmt = db.prepare(`SELECT task_data_json, status FROM roadmap_tasks WHERE assessment_id = ?`);
  const taskRows = tasksStmt.all(id) as Array<{ task_data_json: string; status: string }>;
  const tasks: GapTask[] = taskRows.map(r => {
    const task = JSON.parse(r.task_data_json) as GapTask;
    task.status = r.status as 'pending' | 'in_progress' | 'verified';
    return task;
  });

  // Get activities
  const actStmt = db.prepare(`
    SELECT * FROM activity_events 
    WHERE assessment_id = ? 
    ORDER BY timestamp DESC 
    LIMIT 50
  `);
  const actRows = actStmt.all(id) as Array<Record<string, unknown>>;
  const recentActivity: ActivityEvent[] = actRows.map(r => ({
    id: r.id as string,
    assessmentId: r.assessment_id as string,
    eventType: r.event_type as ActivityEvent['eventType'],
    title: r.title as string,
    description: r.description as string,
    commitSha: (r.commit_sha as string) || undefined,
    commitMessage: (r.commit_message as string) || undefined,
    affectedSkills: r.affected_skills_json ? JSON.parse(r.affected_skills_json as string) : undefined,
    timestamp: r.timestamp as string
  }));

  return {
    id: row.id as string,
    internship,
    repository: {
      fullName: row.repo_full_name as string,
      url: row.repo_url as string,
      defaultBranch: row.default_branch as string,
      isPrivate: false,
      latestCommitSha: row.latest_commit_sha as string
    },
    currentRevisionNumber: row.current_revision_number as number,
    status: row.status as Assessment['status'],
    latestRevision,
    tasks,
    recentActivity,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

export function listAssessments(): Assessment[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT id FROM assessments ORDER BY updated_at DESC`);
  const rows = stmt.all() as Array<{ id: string }>;
  const results: Assessment[] = [];

  for (const r of rows) {
    const item = getAssessment(r.id);
    if (item) results.push(item);
  }

  return results;
}

export function findAssessmentByRepo(repoFullName: string): Assessment | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id FROM assessments 
    WHERE LOWER(repo_full_name) = LOWER(?) 
    ORDER BY updated_at DESC 
    LIMIT 1
  `);
  const row = stmt.get(repoFullName) as { id: string } | undefined;
  if (!row) return null;
  return getAssessment(row.id);
}

export function getRevisionHistory(assessmentId: string): AssessmentRevision[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM revisions 
    WHERE assessment_id = ? 
    ORDER BY revision_number DESC
  `);
  const rows = stmt.all(assessmentId) as Array<Record<string, unknown>>;

  return rows.map(row => ({
    id: row.id as string,
    assessmentId: row.assessment_id as string,
    revisionNumber: row.revision_number as number,
    commitSha: row.commit_sha as string,
    commitMessage: row.commit_message as string,
    triggerType: row.trigger_type as 'initial' | 'webhook' | 'manual',
    evidence: JSON.parse(row.evidence_json as string) as RepositoryEvidence[],
    demonstratedCount: row.demonstrated_count as number,
    partialCount: row.partial_count as number,
    notDemonstratedCount: row.not_demonstrated_count as number,
    createdAt: row.created_at as string
  }));
}

// Webhook log operations
export function isWebhookDeliveryDuplicate(deliveryId: string): boolean {
  if (!deliveryId) return false;
  const db = getDatabase();
  const stmt = db.prepare(`SELECT id FROM webhook_deliveries WHERE delivery_id = ?`);
  const row = stmt.get(deliveryId);
  return !!row;
}

export function recordWebhookDelivery(log: WebhookDeliveryLog): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO webhook_deliveries (id, delivery_id, repo_full_name, event_type, commit_sha, commit_message, author, files_changed_json, signature_valid, affected_requirements_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    log.id,
    log.deliveryId,
    log.repoFullName,
    log.eventType,
    log.commitSha || null,
    log.commitMessage || null,
    log.author || null,
    JSON.stringify(log.filesChanged),
    log.signatureValid ? 1 : 0,
    JSON.stringify(log.affectedRequirements),
    log.createdAt
  );
}

export function listWebhookDeliveries(limit: number = 20): WebhookDeliveryLog[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM webhook_deliveries 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  const rows = stmt.all(limit) as Array<Record<string, unknown>>;

  return rows.map(r => ({
    id: r.id as string,
    deliveryId: r.delivery_id as string,
    eventType: r.event_type as string,
    repoFullName: r.repo_full_name as string,
    commitSha: (r.commit_sha as string) || '',
    commitMessage: (r.commit_message as string) || '',
    author: (r.author as string) || '',
    filesChanged: r.files_changed_json ? JSON.parse(r.files_changed_json as string) : [],
    signatureValid: Boolean(r.signature_valid),
    affectedRequirements: r.affected_requirements_json ? JSON.parse(r.affected_requirements_json as string) : [],
    createdAt: r.created_at as string
  }));
}
