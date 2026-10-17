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
  RepositoryEvidence,
  RevisionComparison,
  EvaluationSummary,
  AnalysisScope,
  AISignalAnalysisResult
} from './types';
import { SCORING_RULE_VERSION } from './scoring';

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  let dataDir = path.join(process.cwd(), 'data');
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    dataDir = path.join('/tmp', 'proofloop-data');
  } else {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch {
      dataDir = path.join('/tmp', 'proofloop-data');
    }
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'proofloop.db');
  const db = new DatabaseSync(dbPath);

  // Enable WAL mode, busy timeout, and foreign keys for performance and data safety
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

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

// Internship operations
export function saveInternship(internship: InternshipPosting): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO internships (id, title, company, location, source_url, raw_text, requirements_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      location = excluded.location,
      source_url = excluded.source_url,
      raw_text = excluded.raw_text,
      requirements_json = excluded.requirements_json
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

  db.exec('BEGIN IMMEDIATE');
  try {
    saveInternship(assessment.internship);

    const stmt = db.prepare(`
      INSERT INTO assessments (
        id, internship_id, repo_full_name, repo_url, default_branch,
        latest_commit_sha, current_revision_number, status,
        analysis_scope_json, ai_signals_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        internship_id = excluded.internship_id,
        repo_full_name = excluded.repo_full_name,
        repo_url = excluded.repo_url,
        default_branch = excluded.default_branch,
        latest_commit_sha = excluded.latest_commit_sha,
        current_revision_number = excluded.current_revision_number,
        status = excluded.status,
        analysis_scope_json = excluded.analysis_scope_json,
        ai_signals_json = excluded.ai_signals_json,
        updated_at = excluded.updated_at
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
        addActivityEventInternal(db, { ...act, assessmentId: assessment.id });
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT = 10;

/**
 * Enforces the evaluation history retention policy:
 * Retains at most maxRetained (default: 10) completed evaluations per assessment history.
 * Any older evaluations beyond the newest maxRetained are permanently deleted.
 * Must be executed within the active database transaction for atomicity.
 */
export function enforceEvaluationRetentionInternal(
  db: DatabaseSync,
  assessmentId: string,
  maxRetained: number = MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT
): number {
  if (!assessmentId || maxRetained <= 0) return 0;

  // Retrieve IDs of revisions exceeding the retention threshold for this specific assessment
  const staleStmt = db.prepare(`
    SELECT id FROM revisions
    WHERE assessment_id = ?
    ORDER BY revision_number DESC, created_at DESC
    LIMIT -1 OFFSET ?
  `);
  const staleRows = staleStmt.all(assessmentId, maxRetained) as Array<{ id: string }>;

  if (staleRows.length === 0) {
    return 0;
  }

  const deleteStmt = db.prepare(`DELETE FROM revisions WHERE id = ? AND assessment_id = ?`);
  let deletedCount = 0;
  for (const row of staleRows) {
    deleteStmt.run(row.id, assessmentId);
    deletedCount++;
  }

  return deletedCount;
}

export function enforceEvaluationRetention(
  assessmentId: string,
  maxRetained: number = MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT
): number {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const count = enforceEvaluationRetentionInternal(db, assessmentId, maxRetained);
    db.exec('COMMIT');
    return count;
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
    WHERE id = ? AND (? >= current_revision_number)
  `);
  updateStmt.run(rev.commitSha, rev.revisionNumber, rev.createdAt, rev.assessmentId, rev.revisionNumber);

  // Enforce evaluation history retention policy: retain only the 10 most recent evaluations atomically
  enforceEvaluationRetentionInternal(db, rev.assessmentId, MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT);
}

export function hasRevisionForCommit(assessmentId: string, commitSha: string): boolean {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT 1 FROM revisions
    WHERE assessment_id = ? AND commit_sha = ?
    LIMIT 1
  `).get(assessmentId, commitSha);
  return Boolean(row);
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
    evidence: JSON.parse(row.evidence_json as string) as RepositoryEvidence[],
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

export function calculateOverallEvaluationScore(evidence: RepositoryEvidence[]): { overallScore: number; totalPoints: number } {
  if (!evidence || evidence.length === 0) {
    return { overallScore: 0, totalPoints: 0 };
  }
  const totalPoints = evidence.reduce((sum, e) => {
    const score = e.scoreBreakdown?.score ?? (e.status === 'demonstrated' ? 80 : e.status === 'partial' ? 40 : 0);
    return sum + score;
  }, 0);
  const overallScore = Math.round(totalPoints / evidence.length);
  return { overallScore, totalPoints };
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

export function getRevisionByIdOrNumber(
  assessmentId: string,
  identifier: number | string
): AssessmentRevision | null {
  const db = getDatabase();
  if (typeof identifier === 'number' || /^\d+$/.test(String(identifier).trim())) {
    const num = typeof identifier === 'number' ? identifier : parseInt(String(identifier).trim(), 10);
    return getRevisionByNumber(assessmentId, num);
  }
  const stmt = db.prepare(`
    SELECT * FROM revisions 
    WHERE assessment_id = ? AND id = ?
    LIMIT 1
  `);
  const row = stmt.get(assessmentId, String(identifier).trim()) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapRevisionRow(row);
}

export interface EvaluationHistoryOptions {
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeEvidence?: boolean;
}

export function getEvaluationHistory(
  assessmentId: string,
  options: EvaluationHistoryOptions = {}
): {
  evaluations: EvaluationSummary[];
  latestEvaluation: EvaluationSummary | null;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
} {
  const db = getDatabase();
  const order = options.order === 'desc' ? 'DESC' : 'ASC'; // Default: chronological (oldest to newest)
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);

  // Total count of evaluations for this assessment
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM revisions WHERE assessment_id = ?`);
  const countRow = countStmt.get(assessmentId) as { count: number } | undefined;
  const total = countRow?.count || 0;

  // Identify latest revision by revision_number DESC
  const latestStmt = db.prepare(`
    SELECT * FROM revisions 
    WHERE assessment_id = ? 
    ORDER BY revision_number DESC 
    LIMIT 1
  `);
  const latestRow = latestStmt.get(assessmentId) as Record<string, unknown> | undefined;
  let latestEvaluation: EvaluationSummary | null = null;
  if (latestRow) {
    const rev = mapRevisionRow(latestRow);
    const { overallScore, totalPoints } = calculateOverallEvaluationScore(rev.evidence);
    latestEvaluation = {
      id: rev.id,
      assessmentId: rev.assessmentId,
      evaluationNumber: rev.revisionNumber,
      revisionNumber: rev.revisionNumber,
      commitSha: rev.commitSha,
      commitMessage: rev.commitMessage,
      triggerType: rev.triggerType,
      timestamp: rev.createdAt,
      createdAt: rev.createdAt,
      overallScore,
      totalPoints,
      demonstratedCount: rev.demonstratedCount,
      partialCount: rev.partialCount,
      notDemonstratedCount: rev.notDemonstratedCount,
      totalRequirements: rev.evidence.length,
      scoringRuleVersion: rev.scoringRuleVersion || SCORING_RULE_VERSION,
      isLatest: true,
      evidence: options.includeEvidence ? rev.evidence : undefined
    };
  }

  // Fetch paginated evaluations ordered chronologically (or desc if requested)
  const stmt = db.prepare(`
    SELECT * FROM revisions 
    WHERE assessment_id = ? 
    ORDER BY revision_number ${order}
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(assessmentId, limit, offset) as Array<Record<string, unknown>>;
  const evaluations: EvaluationSummary[] = rows.map(r => {
    const rev = mapRevisionRow(r);
    const { overallScore, totalPoints } = calculateOverallEvaluationScore(rev.evidence);
    return {
      id: rev.id,
      assessmentId: rev.assessmentId,
      evaluationNumber: rev.revisionNumber,
      revisionNumber: rev.revisionNumber,
      commitSha: rev.commitSha,
      commitMessage: rev.commitMessage,
      triggerType: rev.triggerType,
      timestamp: rev.createdAt,
      createdAt: rev.createdAt,
      overallScore,
      totalPoints,
      demonstratedCount: rev.demonstratedCount,
      partialCount: rev.partialCount,
      notDemonstratedCount: rev.notDemonstratedCount,
      totalRequirements: rev.evidence.length,
      scoringRuleVersion: rev.scoringRuleVersion || SCORING_RULE_VERSION,
      isLatest: latestEvaluation ? rev.id === latestEvaluation.id : false,
      evidence: options.includeEvidence ? rev.evidence : undefined
    };
  });

  return {
    evaluations,
    latestEvaluation,
    total,
    limit,
    offset,
    hasMore: offset + evaluations.length < total
  };
}

/**
 * Compares two assessment evaluations belonging to the same assessment.
 * Accepts either evaluation revision numbers (1, 2) or stable evaluation IDs (rev-xxx-1).
 */
export function compareRevisions(
  assessmentId: string,
  fromRevOrId: number | string,
  toRevOrId: number | string
): RevisionComparison | null {
  const fromRev = getRevisionByIdOrNumber(assessmentId, fromRevOrId);
  const toRev = getRevisionByIdOrNumber(assessmentId, toRevOrId);

  if (!fromRev || !toRev) {
    return null;
  }

  // Ensure both evaluations belong to the same assessment
  if (fromRev.assessmentId !== assessmentId || toRev.assessmentId !== assessmentId) {
    return null;
  }

  const fromOverall = calculateOverallEvaluationScore(fromRev.evidence);
  const toOverall = calculateOverallEvaluationScore(toRev.evidence);
  const overallScoreChange = {
    beforeScore: fromOverall.overallScore,
    afterScore: toOverall.overallScore,
    delta: toOverall.overallScore - fromOverall.overallScore
  };

  const fromMap = new Map(fromRev.evidence.map(e => [e.requirementId, e]));
  const toMap = new Map(toRev.evidence.map(e => [e.requirementId, e]));

  const addedEvidence: RevisionComparison['addedEvidence'] = [];
  const removedEvidence: RevisionComparison['removedEvidence'] = [];
  const modifiedEvidence: RevisionComparison['modifiedEvidence'] = [];
  const scoreChanges: RevisionComparison['scoreChanges'] = [];
  const newlyDemonstrated: NonNullable<RevisionComparison['newlyDemonstrated']> = [];
  const improved: NonNullable<NonNullable<RevisionComparison['categorizedRequirements']>['improved']> = [];
  const regressed: NonNullable<NonNullable<RevisionComparison['categorizedRequirements']>['regressed']> = [];
  const unchanged: NonNullable<NonNullable<RevisionComparison['categorizedRequirements']>['unchanged']> = [];
  const evidenceChanges: NonNullable<RevisionComparison['evidenceChanges']> = [];
  const unavailableData: string[] = [];

  const statusRank = (s: string) => (s === 'demonstrated' ? 2 : s === 'partial' ? 1 : 0);

  // Check additions & modifications
  for (const [reqId, toEv] of toMap.entries()) {
    const fromEv = fromMap.get(reqId);
    const toScore = toEv.scoreBreakdown?.score ?? (toEv.status === 'demonstrated' ? 80 : toEv.status === 'partial' ? 40 : 0);

    if (!fromEv) {
      addedEvidence.push({
        requirementId: reqId,
        requirementTitle: toEv.requirementTitle,
        detail: `New requirement evaluated with status "${toEv.status}" in evaluation #${toRev.revisionNumber}.`
      });

      unavailableData.push(
        `Requirement "${toEv.requirementTitle}" (${reqId}) was evaluated in evaluation #${toRev.revisionNumber} (${toRev.commitSha.slice(0, 7)}) but was not tracked in earlier evaluation #${fromRev.revisionNumber} (${fromRev.commitSha.slice(0, 7)}).`
      );

      if (toEv.status === 'demonstrated') {
        newlyDemonstrated.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          score: toScore
        });
      }

      if (toScore > 0) {
        improved.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          beforeStatus: 'not_demonstrated',
          afterStatus: toEv.status,
          beforeScore: 0,
          afterScore: toScore,
          delta: toScore
        });
      } else {
        unchanged.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          status: toEv.status,
          score: toScore
        });
      }
    } else {
      const fromScore = fromEv.scoreBreakdown?.score ?? (fromEv.status === 'demonstrated' ? 80 : fromEv.status === 'partial' ? 40 : 0);
      const statusChanged = fromEv.status !== toEv.status;
      const scoreDiff = toScore - fromScore;
      const fromR = statusRank(fromEv.status);
      const toR = statusRank(toEv.status);

      // Check newly demonstrated
      if (fromEv.status !== 'demonstrated' && toEv.status === 'demonstrated') {
        newlyDemonstrated.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          score: toScore
        });
      }

      // Categorize into improved, regressed, or unchanged
      if (toR > fromR || scoreDiff > 0) {
        improved.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          beforeStatus: fromEv.status,
          afterStatus: toEv.status,
          beforeScore: fromScore,
          afterScore: toScore,
          delta: scoreDiff
        });
      } else if (toR < fromR || scoreDiff < 0) {
        regressed.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          beforeStatus: fromEv.status,
          afterStatus: toEv.status,
          beforeScore: fromScore,
          afterScore: toScore,
          delta: scoreDiff
        });
      } else {
        unchanged.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          status: toEv.status,
          score: toScore
        });
      }

      // Check evidence-level changes
      const fileChanged = fromEv.filePath !== toEv.filePath;
      const linesChanged = fromEv.lineStart !== toEv.lineStart || fromEv.lineEnd !== toEv.lineEnd;
      const fromAsserts = fromEv.testResultsSummary?.assertionsFound;
      const toAsserts = toEv.testResultsSummary?.assertionsFound;
      const assertionsChanged = fromAsserts !== toAsserts;

      if (fileChanged || linesChanged || assertionsChanged || fromEv.codeExcerpt !== toEv.codeExcerpt) {
        const descParts: string[] = [];
        if (fileChanged) descParts.push(`File changed from ${fromEv.filePath || 'none'} to ${toEv.filePath || 'none'}`);
        if (linesChanged && toEv.lineStart && toEv.lineEnd) descParts.push(`Citations lines changed to L${toEv.lineStart}-L${toEv.lineEnd}`);
        if (assertionsChanged) descParts.push(`Assertions changed from ${fromAsserts ?? 0} to ${toAsserts ?? 0}`);
        if (fromEv.codeExcerpt !== toEv.codeExcerpt && toEv.codeExcerpt) descParts.push('Code excerpt updated');

        evidenceChanges.push({
          requirementId: reqId,
          requirementTitle: toEv.requirementTitle,
          beforeFilePath: fromEv.filePath,
          afterFilePath: toEv.filePath,
          beforeLines: { start: fromEv.lineStart, end: fromEv.lineEnd },
          afterLines: { start: toEv.lineStart, end: toEv.lineEnd },
          beforeAssertions: fromAsserts,
          afterAssertions: toAsserts,
          description: descParts.join('; ')
        });
      }

      // Missing evidence checks in older evaluation
      if (!fromEv.codeExcerpt && toEv.codeExcerpt) {
        unavailableData.push(`Code citation excerpt for requirement "${toEv.requirementTitle}" was not captured in earlier evaluation #${fromRev.revisionNumber}.`);
      }
      if (!fromEv.filePath && toEv.filePath) {
        unavailableData.push(`File location for requirement "${toEv.requirementTitle}" was not recorded in evaluation #${fromRev.revisionNumber}.`);
      }

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
        detail: `Requirement was present in evaluation #${fromRev.revisionNumber} but not in evaluation #${toRev.revisionNumber}.`
      });
      unavailableData.push(
        `Requirement "${fromEv.requirementTitle}" (${reqId}) was tracked in evaluation #${fromRev.revisionNumber} but removed or omitted in evaluation #${toRev.revisionNumber}.`
      );
    }
  }

  const fromRule = fromRev.scoringRuleVersion || 'v2026.1';
  const toRule = toRev.scoringRuleVersion || 'v2026.1';
  const isIdenticalRules = fromRule === toRule;

  const summary = `Comparison between Evaluation #${fromRev.revisionNumber} (${fromRev.commitSha.slice(0, 7)}) and #${toRev.revisionNumber} (${toRev.commitSha.slice(0, 7)}): ` +
    `Overall score change: ${overallScoreChange.delta >= 0 ? '+' : ''}${overallScoreChange.delta} pts (${overallScoreChange.beforeScore} -> ${overallScoreChange.afterScore}), ` +
    `${newlyDemonstrated.length} newly demonstrated, ${improved.length} improved, ${regressed.length} regressed, ${unchanged.length} unchanged, ` +
    `${evidenceChanges.length} evidence update(s).`;

  return {
    assessmentId,
    fromRevisionNumber: fromRev.revisionNumber,
    toRevisionNumber: toRev.revisionNumber,
    fromCommitSha: fromRev.commitSha,
    toCommitSha: toRev.commitSha,
    fromEvaluationId: fromRev.id,
    toEvaluationId: toRev.id,
    overallScoreChange,
    newlyDemonstrated,
    categorizedRequirements: {
      improved,
      regressed,
      unchanged
    },
    evidenceChanges,
    unavailableData,
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
    filesChanged: r.files_changed_json ? JSON.parse(r.files_changed_json as string) : [],
    signatureValid: Boolean(r.signature_valid),
    affectedRequirements: r.affected_requirements_json ? JSON.parse(r.affected_requirements_json as string) : [],
    createdAt: r.created_at as string
  }));
}
