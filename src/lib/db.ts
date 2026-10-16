import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import {
  Assessment,
  AssessmentRevision,
  ActivityEvent,
  GapTask,
  InternshipPosting,
  InternshipRequirement,
  WebhookDeliveryLog,
  RepositoryEvidence,
  RevisionComparison,
  AnalysisScope,
  AISignalAnalysisResult
} from './types';
import { SCORING_RULE_VERSION } from './scoring';

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

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
      analysis_scope_json TEXT,
      ai_signals_json TEXT,
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
      scoring_rule_version TEXT,
      analysis_scope_json TEXT,
      ai_signals_json TEXT,
      score_breakdown_summary_json TEXT,
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

  // Safe idempotent column additions for existing SQLite databases
  const safeAlterColumn = (table: string, columnDef: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
    } catch {
      // Column already exists or table structure matches
    }
  };

  safeAlterColumn('assessments', 'analysis_scope_json TEXT');
  safeAlterColumn('assessments', 'ai_signals_json TEXT');
  safeAlterColumn('revisions', 'scoring_rule_version TEXT');
  safeAlterColumn('revisions', 'analysis_scope_json TEXT');
  safeAlterColumn('revisions', 'ai_signals_json TEXT');
  safeAlterColumn('revisions', 'score_breakdown_summary_json TEXT');

  dbInstance = db;
  return db;
}

export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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
    requirements: safeJsonParse<InternshipRequirement[]>(row.requirements_json, []),
    createdAt: row.created_at as string
  };
}

// Assessment operations
export function saveAssessment(assessment: Assessment): void {
  const db = getDatabase();

  db.exec('BEGIN IMMEDIATE');
  try {
    saveInternship(assessment.internship);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO assessments (
        id, internship_id, repo_full_name, repo_url, default_branch,
        latest_commit_sha, current_revision_number, status,
        analysis_scope_json, ai_signals_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      assessment.analysisScope ? JSON.stringify(assessment.analysisScope) : null,
      assessment.aiSignals ? JSON.stringify(assessment.aiSignals) : null,
      assessment.createdAt,
      assessment.updatedAt
    );

    if (assessment.latestRevision) {
      saveRevisionInternal(db, assessment.latestRevision);
    }

    if (assessment.tasks && assessment.tasks.length > 0) {
      for (const task of assessment.tasks) {
        saveRoadmapTaskInternal(db, assessment.id, task);
      }
    }

    if (assessment.recentActivity && assessment.recentActivity.length > 0) {
      for (const act of assessment.recentActivity) {
        addActivityEventInternal(db, act);
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function saveRevisionInternal(db: DatabaseSync, rev: AssessmentRevision): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO revisions (
      id, assessment_id, revision_number, commit_sha, commit_message,
      trigger_type, evidence_json, demonstrated_count, partial_count,
      not_demonstrated_count, scoring_rule_version, analysis_scope_json,
      ai_signals_json, score_breakdown_summary_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    rev.scoringRuleVersion || SCORING_RULE_VERSION,
    rev.analysisScope ? JSON.stringify(rev.analysisScope) : null,
    rev.aiSignals ? JSON.stringify(rev.aiSignals) : null,
    rev.scoreBreakdownSummary ? JSON.stringify(rev.scoreBreakdownSummary) : null,
    rev.createdAt
  );

  const updateStmt = db.prepare(`
    UPDATE assessments
    SET latest_commit_sha = ?, current_revision_number = ?, updated_at = ?
    WHERE id = ?
  `);
  updateStmt.run(rev.commitSha, rev.revisionNumber, rev.createdAt, rev.assessmentId);
}

export function saveRevision(rev: AssessmentRevision): void {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    saveRevisionInternal(db, rev);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function saveRoadmapTaskInternal(db: DatabaseSync, assessmentId: string, task: GapTask): void {
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

export function saveRoadmapTask(assessmentId: string, task: GapTask): void {
  const db = getDatabase();
  saveRoadmapTaskInternal(db, assessmentId, task);
}

export function updateRoadmapTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'verified'): void {
  const db = getDatabase();
  const stmt = db.prepare(`UPDATE roadmap_tasks SET status = ? WHERE id = ?`);
  stmt.run(status, taskId);
}

function addActivityEventInternal(db: DatabaseSync, event: ActivityEvent): void {
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

export function addActivityEvent(event: ActivityEvent): void {
  const db = getDatabase();
  addActivityEventInternal(db, event);
}

/**
 * Safely preserves the previous assessment revision if an assessment or reassessment fails.
 */
export function recordAssessmentFailure(assessmentId: string, errorMessage: string): void {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const actStmt = db.prepare(`
      INSERT OR REPLACE INTO activity_events (id, assessment_id, event_type, title, description, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    actStmt.run(
      `act-err-${Date.now()}`,
      assessmentId,
      'reassessment_failed',
      'Reassessment Attempt Failed',
      `Analysis could not be completed: ${errorMessage}. Previous assessment revision preserved without modification.`,
      new Date().toISOString()
    );

    // Keep the assessment in 'completed' state if it already has valid revisions,
    // only update timestamp. If no revisions exist, set to 'failed'.
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM revisions WHERE assessment_id = ?`);
    const countRow = countStmt.get(assessmentId) as { count: number } | undefined;
    const hasRevisions = (countRow?.count || 0) > 0;

    const updateStmt = db.prepare(`
      UPDATE assessments
      SET status = ?, updated_at = ?
      WHERE id = ?
    `);
    updateStmt.run(hasRevisions ? 'completed' : 'failed', new Date().toISOString(), assessmentId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Failed to record assessment failure:', err);
  }
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
    latestRevision = mapRevisionRow(revRow);
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
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: row.created_at as string
    };
  }

  // Get tasks
  const tasksStmt = db.prepare(`SELECT task_data_json, status FROM roadmap_tasks WHERE assessment_id = ?`);
  const taskRows = tasksStmt.all(id) as Array<{ task_data_json: string; status: string }>;
  const tasks: GapTask[] = taskRows.map(r => {
    const task = safeJsonParse<GapTask | null>(r.task_data_json, null);
    if (task) {
      task.status = r.status as 'pending' | 'in_progress' | 'verified';
      return task;
    }
    return {
      id: `task-fallback-${id}`,
      requirementId: 'unknown',
      requirementTitle: 'Engineering Task',
      category: 'general',
      title: 'Gap Task',
      description: 'Engineering task',
      expectedEvidence: '',
      acceptanceCriteria: [],
      suggestedFiles: [],
      projectBrief: {
        overview: '',
        suggestedScope: '',
        implementationHints: [],
        verificationMethod: ''
      },
      status: r.status as 'pending' | 'in_progress' | 'verified'
    };
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
    affectedSkills: r.affected_skills_json ? safeJsonParse<string[]>(r.affected_skills_json, []) : undefined,
    timestamp: r.timestamp as string
  }));

  let analysisScope: AnalysisScope | undefined;
  if (row.analysis_scope_json) {
    try {
      analysisScope = JSON.parse(row.analysis_scope_json as string);
    } catch {}
  } else if (latestRevision.analysisScope) {
    analysisScope = latestRevision.analysisScope;
  }

  let aiSignals: AISignalAnalysisResult | undefined;
  if (row.ai_signals_json) {
    try {
      aiSignals = JSON.parse(row.ai_signals_json as string);
    } catch {}
  } else if (latestRevision.aiSignals) {
    aiSignals = latestRevision.aiSignals;
  }

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
    analysisScope,
    aiSignals,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

function mapRevisionRow(row: Record<string, unknown>): AssessmentRevision {
  let analysisScope: AnalysisScope | undefined;
  if (row.analysis_scope_json) {
    try {
      analysisScope = JSON.parse(row.analysis_scope_json as string);
    } catch {}
  }

  let aiSignals: AISignalAnalysisResult | undefined;
  if (row.ai_signals_json) {
    try {
      aiSignals = JSON.parse(row.ai_signals_json as string);
    } catch {}
  }

  let scoreBreakdownSummary;
  if (row.score_breakdown_summary_json) {
    try {
      scoreBreakdownSummary = JSON.parse(row.score_breakdown_summary_json as string);
    } catch {}
  }

  return {
    id: row.id as string,
    assessmentId: row.assessment_id as string,
    revisionNumber: row.revision_number as number,
    commitSha: row.commit_sha as string,
    commitMessage: row.commit_message as string,
    triggerType: row.trigger_type as 'initial' | 'webhook' | 'manual',
    evidence: safeJsonParse<RepositoryEvidence[]>(row.evidence_json, []),
    demonstratedCount: row.demonstrated_count as number,
    partialCount: row.partial_count as number,
    notDemonstratedCount: row.not_demonstrated_count as number,
    scoringRuleVersion: (row.scoring_rule_version as string) || SCORING_RULE_VERSION,
    analysisScope,
    aiSignals,
    scoreBreakdownSummary,
    createdAt: row.created_at as string
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
  return rows.map(mapRevisionRow);
}

export function getRevisionByNumber(assessmentId: string, revisionNumber: number): AssessmentRevision | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM revisions 
    WHERE assessment_id = ? AND revision_number = ?
    LIMIT 1
  `);
  const row = stmt.get(assessmentId, revisionNumber) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapRevisionRow(row);
}

/**
 * Compares two assessment revisions and produces an audit trail of:
 * - Evidence additions, removals, and changes
 * - Score and status changes
 * - Impact of scoring rule versions vs code changes
 */
export function compareRevisions(
  assessmentId: string,
  fromRevNumber: number,
  toRevNumber: number
): RevisionComparison | null {
  const fromRev = getRevisionByNumber(assessmentId, fromRevNumber);
  const toRev = getRevisionByNumber(assessmentId, toRevNumber);

  if (!fromRev || !toRev) {
    return null;
  }

  const fromMap = new Map(fromRev.evidence.map(e => [e.requirementId, e]));
  const toMap = new Map(toRev.evidence.map(e => [e.requirementId, e]));

  const addedEvidence: RevisionComparison['addedEvidence'] = [];
  const removedEvidence: RevisionComparison['removedEvidence'] = [];
  const modifiedEvidence: RevisionComparison['modifiedEvidence'] = [];
  const scoreChanges: RevisionComparison['scoreChanges'] = [];

  // Check additions & modifications
  for (const [reqId, toEv] of toMap.entries()) {
    const fromEv = fromMap.get(reqId);
    if (!fromEv) {
      addedEvidence.push({
        requirementId: reqId,
        requirementTitle: toEv.requirementTitle,
        detail: `New requirement evaluated with status "${toEv.status}" in revision #${toRevNumber}.`
      });
    } else {
      const fromScore = fromEv.scoreBreakdown?.score ?? (fromEv.status === 'demonstrated' ? 80 : fromEv.status === 'partial' ? 40 : 0);
      const toScore = toEv.scoreBreakdown?.score ?? (toEv.status === 'demonstrated' ? 80 : toEv.status === 'partial' ? 40 : 0);

      const statusChanged = fromEv.status !== toEv.status;
      const scoreDiff = toScore - fromScore;

      if (statusChanged || scoreDiff !== 0 || fromEv.codeExcerpt !== toEv.codeExcerpt) {
        const changes: string[] = [];
        if (statusChanged) {
          changes.push(`Status changed from ${fromEv.status} to ${toEv.status}`);
        }
        if (scoreDiff !== 0) {
          changes.push(`Score delta: ${scoreDiff > 0 ? '+' : ''}${scoreDiff} points`);
        }
        if (fromEv.filePath !== toEv.filePath && toEv.filePath) {
          changes.push(`Evidence file updated to ${toEv.filePath}`);
        }

        modifiedEvidence.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          beforeStatus: fromEv.status,
          afterStatus: toEv.status,
          beforeScore: fromScore,
          afterScore: toScore,
          changes
        });
      }

      if (scoreDiff !== 0) {
        scoreChanges.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          beforeScore: fromScore,
          afterScore: toScore,
          delta: scoreDiff,
          reason: statusChanged
            ? `Demonstrated implementation changes in commit ${toRev.commitSha}`
            : 'Evidence criteria refinement'
        });
      }
    }
  }

  // Check removals
  for (const [reqId, fromEv] of fromMap.entries()) {
    if (!toMap.has(reqId)) {
      removedEvidence.push({
        requirementId: reqId,
        requirementTitle: fromEv.requirementTitle,
        detail: `Requirement was present in revision #${fromRevNumber} but not in revision #${toRevNumber}.`
      });
    }
  }

  const fromRule = fromRev.scoringRuleVersion || 'v2026.1';
  const toRule = toRev.scoringRuleVersion || 'v2026.1';
  const isIdenticalRules = fromRule === toRule;

  const summary = `Comparison between Revision #${fromRevNumber} (${fromRev.commitSha.slice(0, 7)}) and #${toRevNumber} (${toRev.commitSha.slice(0, 7)}): ` +
    `${scoreChanges.length} score change(s), ${addedEvidence.length} requirement addition(s), ${modifiedEvidence.length} modified evidence item(s).`;

  return {
    assessmentId,
    fromRevisionNumber: fromRevNumber,
    toRevisionNumber: toRevNumber,
    fromCommitSha: fromRev.commitSha,
    toCommitSha: toRev.commitSha,
    addedEvidence,
    removedEvidence,
    modifiedEvidence,
    scoreChanges,
    scoringRuleChanges: {
      fromRuleVersion: fromRule,
      toRuleVersion: toRule,
      isIdentical: isIdenticalRules,
      differences: isIdenticalRules ? undefined : [`Scoring rule migrated from ${fromRule} to ${toRule}`]
    },
    summary
  };
}

// Webhook log operations
export function isWebhookDeliveryDuplicate(deliveryId: string): boolean {
  if (!deliveryId) return false;
  const db = getDatabase();
  const stmt = db.prepare(`SELECT id FROM webhook_deliveries WHERE delivery_id = ?`);
  const row = stmt.get(deliveryId);
  return Boolean(row);
}

export function recordWebhookDelivery(log: WebhookDeliveryLog): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO webhook_deliveries (
      id, delivery_id, repo_full_name, event_type, commit_sha,
      commit_message, author, files_changed_json, signature_valid,
      affected_requirements_json, created_at
    )
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
    filesChanged: safeJsonParse<string[]>(r.files_changed_json, []),
    signatureValid: Boolean(r.signature_valid),
    affectedRequirements: safeJsonParse<string[]>(r.affected_requirements_json, []),
    createdAt: r.created_at as string
  }));
}
