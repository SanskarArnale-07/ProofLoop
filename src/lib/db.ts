import { Pool, PoolClient } from 'pg';
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
  AISignalAnalysisResult,
  DeveloperVerificationRecord,
  AssessmentVerificationSummary,
  VerificationVerdict,
  InternshipRequirement
} from './types';
import { SCORING_RULE_VERSION } from './scoring';

let poolInstance: Pool | null = null;

/**
 * Lazily initializes and returns the reusable PostgreSQL connection pool.
 * Throws a clear configuration error if DATABASE_URL is not configured.
 */
export function getPool(): Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !connectionString.trim()) {
    throw new Error(
      'DATABASE_URL is not configured. Please set the DATABASE_URL environment variable to connect to PostgreSQL / Neon.'
    );
  }

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  poolInstance = new Pool({
    connectionString,
    max: isServerless ? 5 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: isLocalhost ? false : { rejectUnauthorized: false }
  });

  poolInstance.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool client error:', err.message);
  });

  return poolInstance;
}

/**
 * Closes the connection pool. Useful for testing and standalone CLI scripts.
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

/**
 * Executes a function within an explicit PostgreSQL transaction on a dedicated client.
 * Automatically issues BEGIN, COMMIT, or ROLLBACK, and releases the client.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// Internship Operations
// ============================================================================

export async function saveInternship(
  internship: InternshipPosting,
  client?: PoolClient
): Promise<void> {
  const runner = client || getPool();
  const query = `
    INSERT INTO internships (
      id, title, company, location, source_url, raw_text, requirements_json, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      company = EXCLUDED.company,
      location = EXCLUDED.location,
      source_url = EXCLUDED.source_url,
      raw_text = EXCLUDED.raw_text,
      requirements_json = EXCLUDED.requirements_json;
  `;
  await runner.query(query, [
    internship.id,
    internship.title,
    internship.company,
    internship.location || null,
    internship.sourceUrl,
    internship.rawText || null,
    JSON.stringify(internship.requirements),
    internship.createdAt
  ]);
}

export async function getInternship(
  id: string,
  client?: PoolClient
): Promise<InternshipPosting | null> {
  const runner = client || getPool();
  const res = await runner.query('SELECT * FROM internships WHERE id = $1', [id]);
  const row = res.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location || undefined,
    sourceUrl: row.source_url,
    rawText: row.raw_text || undefined,
    requirements: JSON.parse(row.requirements_json),
    createdAt: row.created_at
  };
}

// ============================================================================
// Assessment Operations
// ============================================================================

export async function saveAssessment(assessment: Assessment): Promise<void> {
  await withTransaction(async (client) => {
    await saveInternship(assessment.internship, client);

    const stmt = `
      INSERT INTO assessments (
        id, internship_id, repo_full_name, repo_url, default_branch,
        latest_commit_sha, current_revision_number, status,
        analysis_scope_json, ai_signals_json, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        internship_id = EXCLUDED.internship_id,
        repo_full_name = EXCLUDED.repo_full_name,
        repo_url = EXCLUDED.repo_url,
        default_branch = EXCLUDED.default_branch,
        latest_commit_sha = EXCLUDED.latest_commit_sha,
        current_revision_number = EXCLUDED.current_revision_number,
        status = EXCLUDED.status,
        analysis_scope_json = EXCLUDED.analysis_scope_json,
        ai_signals_json = EXCLUDED.ai_signals_json,
        updated_at = EXCLUDED.updated_at;
    `;

    await client.query(stmt, [
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
    ]);

    if (assessment.latestRevision) {
      await saveRevisionInternal(client, assessment.latestRevision);
    }

    if (assessment.tasks && assessment.tasks.length > 0) {
      for (const task of assessment.tasks) {
        await saveRoadmapTaskInternal(client, assessment.id, task);
      }
    }

    if (assessment.recentActivity && assessment.recentActivity.length > 0) {
      for (const act of assessment.recentActivity) {
        await addActivityEventInternal(client, { ...act, assessmentId: assessment.id });
      }
    }
  });
}

export const MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT = 10;

/**
 * Enforces the evaluation history retention policy:
 * Retains at most maxRetained (default: 10) completed evaluations per assessment history.
 * Any older evaluations beyond the newest maxRetained are permanently deleted.
 * Must be executed within the active database transaction for atomicity.
 */
export async function enforceEvaluationRetentionInternal(
  client: PoolClient | Pool,
  assessmentId: string,
  maxRetained: number = MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT
): Promise<number> {
  if (!assessmentId || maxRetained <= 0) return 0;

  const staleRes = await client.query(
    `
    SELECT id FROM revisions
    WHERE assessment_id = $1
    ORDER BY revision_number DESC, created_at DESC
    OFFSET $2
    `,
    [assessmentId, maxRetained]
  );

  if (staleRes.rows.length === 0) {
    return 0;
  }

  const ids = staleRes.rows.map((r) => r.id);
  const deleteRes = await client.query(
    `DELETE FROM revisions WHERE assessment_id = $1 AND id = ANY($2::text[])`,
    [assessmentId, ids]
  );

  return deleteRes.rowCount || 0;
}

export async function enforceEvaluationRetention(
  assessmentId: string,
  maxRetained: number = MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT
): Promise<number> {
  return withTransaction(async (client) => {
    return enforceEvaluationRetentionInternal(client, assessmentId, maxRetained);
  });
}

async function saveRevisionInternal(
  client: PoolClient | Pool,
  rev: AssessmentRevision
): Promise<void> {
  const stmt = `
    INSERT INTO revisions (
      id, assessment_id, revision_number, commit_sha, commit_message,
      trigger_type, evidence_json, demonstrated_count, partial_count,
      not_demonstrated_count, scoring_rule_version, analysis_scope_json,
      ai_signals_json, score_breakdown_summary_json, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (id) DO UPDATE SET
      assessment_id = EXCLUDED.assessment_id,
      revision_number = EXCLUDED.revision_number,
      commit_sha = EXCLUDED.commit_sha,
      commit_message = EXCLUDED.commit_message,
      trigger_type = EXCLUDED.trigger_type,
      evidence_json = EXCLUDED.evidence_json,
      demonstrated_count = EXCLUDED.demonstrated_count,
      partial_count = EXCLUDED.partial_count,
      not_demonstrated_count = EXCLUDED.not_demonstrated_count,
      scoring_rule_version = EXCLUDED.scoring_rule_version,
      analysis_scope_json = EXCLUDED.analysis_scope_json,
      ai_signals_json = EXCLUDED.ai_signals_json,
      score_breakdown_summary_json = EXCLUDED.score_breakdown_summary_json,
      created_at = EXCLUDED.created_at;
  `;

  await client.query(stmt, [
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
  ]);

  const updateStmt = `
    UPDATE assessments
    SET latest_commit_sha = $1, current_revision_number = $2, updated_at = $3
    WHERE id = $4 AND ($5 >= current_revision_number);
  `;
  await client.query(updateStmt, [
    rev.commitSha,
    rev.revisionNumber,
    rev.createdAt,
    rev.assessmentId,
    rev.revisionNumber
  ]);

  // Enforce evaluation history retention policy: retain only the 10 most recent evaluations atomically
  await enforceEvaluationRetentionInternal(client, rev.assessmentId, MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT);
}

export async function hasRevisionForCommit(
  assessmentId: string,
  commitSha: string
): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(
    'SELECT 1 FROM revisions WHERE assessment_id = $1 AND commit_sha = $2 LIMIT 1',
    [assessmentId, commitSha]
  );
  return res.rows.length > 0;
}

export async function saveRevision(rev: AssessmentRevision): Promise<void> {
  await withTransaction(async (client) => {
    await saveRevisionInternal(client, rev);
  });
}

async function saveRoadmapTaskInternal(
  client: PoolClient | Pool,
  assessmentId: string,
  task: GapTask
): Promise<void> {
  const stmt = `
    INSERT INTO roadmap_tasks (id, assessment_id, requirement_id, task_data_json, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      assessment_id = EXCLUDED.assessment_id,
      requirement_id = EXCLUDED.requirement_id,
      task_data_json = EXCLUDED.task_data_json,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at;
  `;
  await client.query(stmt, [
    task.id,
    assessmentId,
    task.requirementId,
    JSON.stringify(task),
    task.status,
    new Date().toISOString()
  ]);
}

export async function saveRoadmapTask(assessmentId: string, task: GapTask): Promise<void> {
  const pool = getPool();
  await saveRoadmapTaskInternal(pool, assessmentId, task);
}

export async function updateRoadmapTaskStatus(
  taskId: string,
  status: 'pending' | 'in_progress' | 'verified'
): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE roadmap_tasks SET status = $1 WHERE id = $2', [status, taskId]);
}

async function addActivityEventInternal(
  client: PoolClient | Pool,
  event: ActivityEvent
): Promise<void> {
  const stmt = `
    INSERT INTO activity_events (
      id, assessment_id, event_type, title, description, commit_sha, commit_message, affected_skills_json, timestamp
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      assessment_id = EXCLUDED.assessment_id,
      event_type = EXCLUDED.event_type,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      commit_sha = EXCLUDED.commit_sha,
      commit_message = EXCLUDED.commit_message,
      affected_skills_json = EXCLUDED.affected_skills_json,
      timestamp = EXCLUDED.timestamp;
  `;
  await client.query(stmt, [
    event.id,
    event.assessmentId,
    event.eventType,
    event.title,
    event.description,
    event.commitSha || null,
    event.commitMessage || null,
    event.affectedSkills ? JSON.stringify(event.affectedSkills) : null,
    event.timestamp
  ]);
}

export async function addActivityEvent(event: ActivityEvent): Promise<void> {
  const pool = getPool();
  await addActivityEventInternal(pool, event);
}

/**
 * Safely preserves the previous assessment revision if an assessment or reassessment fails.
 */
export async function recordAssessmentFailure(
  assessmentId: string,
  errorMessage: string
): Promise<void> {
  try {
    await withTransaction(async (client) => {
      const actStmt = `
        INSERT INTO activity_events (id, assessment_id, event_type, title, description, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          assessment_id = EXCLUDED.assessment_id,
          event_type = EXCLUDED.event_type,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          timestamp = EXCLUDED.timestamp;
      `;
      await client.query(actStmt, [
        `act-err-${Date.now()}`,
        assessmentId,
        'reassessment_failed',
        'Reassessment Attempt Failed',
        `Analysis could not be completed: ${errorMessage}. Previous assessment revision preserved without modification.`,
        new Date().toISOString()
      ]);

      const countRes = await client.query(
        'SELECT COUNT(*)::int as count FROM revisions WHERE assessment_id = $1',
        [assessmentId]
      );
      const hasRevisions = (countRes.rows[0]?.count || 0) > 0;

      await client.query(
        'UPDATE assessments SET status = $1, updated_at = $2 WHERE id = $3',
        [hasRevisions ? 'completed' : 'failed', new Date().toISOString(), assessmentId]
      );
    });
  } catch (err) {
    console.error('Failed to record assessment failure:', err);
  }
}

export async function getAssessment(
  id: string,
  client?: PoolClient
): Promise<Assessment | null> {
  const runner = client || getPool();
  const res = await runner.query('SELECT * FROM assessments WHERE id = $1', [id]);
  const row = res.rows[0];
  if (!row) return null;

  const internship = await getInternship(row.internship_id, client);
  if (!internship) return null;

  // Get latest revision
  const revRes = await runner.query(
    'SELECT * FROM revisions WHERE assessment_id = $1 ORDER BY revision_number DESC LIMIT 1',
    [id]
  );
  const revRow = revRes.rows[0];

  let latestRevision: AssessmentRevision;
  if (revRow) {
    latestRevision = mapRevisionRow(revRow);
  } else {
    latestRevision = {
      id: 'rev-0',
      assessmentId: id,
      revisionNumber: 1,
      commitSha: row.latest_commit_sha,
      commitMessage: 'Initial inspection',
      triggerType: 'initial',
      evidence: [],
      demonstratedCount: 0,
      partialCount: 0,
      notDemonstratedCount: 0,
      scoringRuleVersion: SCORING_RULE_VERSION,
      createdAt: row.created_at
    };
  }

  // Get tasks
  const tasksRes = await runner.query(
    'SELECT task_data_json, status FROM roadmap_tasks WHERE assessment_id = $1',
    [id]
  );
  const tasks: GapTask[] = tasksRes.rows.map((r) => {
    const task = JSON.parse(r.task_data_json) as GapTask;
    task.status = r.status as 'pending' | 'in_progress' | 'verified';
    return task;
  });

  // Get activities
  const actRes = await runner.query(
    'SELECT * FROM activity_events WHERE assessment_id = $1 ORDER BY timestamp DESC LIMIT 50',
    [id]
  );
  const recentActivity: ActivityEvent[] = actRes.rows.map((r) => ({
    id: r.id,
    assessmentId: r.assessment_id,
    eventType: r.event_type as ActivityEvent['eventType'],
    title: r.title,
    description: r.description,
    commitSha: r.commit_sha || undefined,
    commitMessage: r.commit_message || undefined,
    affectedSkills: r.affected_skills_json ? JSON.parse(r.affected_skills_json) : undefined,
    timestamp: r.timestamp
  }));

  let analysisScope: AnalysisScope | undefined;
  if (row.analysis_scope_json) {
    try {
      analysisScope = JSON.parse(row.analysis_scope_json);
    } catch {}
  } else if (latestRevision.analysisScope) {
    analysisScope = latestRevision.analysisScope;
  }

  let aiSignals: AISignalAnalysisResult | undefined;
  if (row.ai_signals_json) {
    try {
      aiSignals = JSON.parse(row.ai_signals_json);
    } catch {}
  } else if (latestRevision.aiSignals) {
    aiSignals = latestRevision.aiSignals;
  }

  let verificationSummary: AssessmentVerificationSummary | undefined;
  try {
    verificationSummary = await getAssessmentVerificationSummary(row.id, internship.requirements, client);
  } catch {
    // Graceful fallback if verification tables are not yet queried
  }

  return {
    id: row.id,
    internship,
    repository: {
      fullName: row.repo_full_name,
      url: row.repo_url,
      defaultBranch: row.default_branch,
      isPrivate: false,
      latestCommitSha: row.latest_commit_sha
    },
    currentRevisionNumber: Number(row.current_revision_number),
    status: row.status as Assessment['status'],
    latestRevision,
    tasks,
    recentActivity,
    analysisScope,
    aiSignals,
    verificationSummary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
    revisionNumber: Number(row.revision_number),
    commitSha: row.commit_sha as string,
    commitMessage: row.commit_message as string,
    triggerType: row.trigger_type as 'initial' | 'webhook' | 'manual',
    evidence: JSON.parse(row.evidence_json as string) as RepositoryEvidence[],
    demonstratedCount: Number(row.demonstrated_count),
    partialCount: Number(row.partial_count),
    notDemonstratedCount: Number(row.not_demonstrated_count),
    scoringRuleVersion: (row.scoring_rule_version as string) || SCORING_RULE_VERSION,
    analysisScope,
    aiSignals,
    scoreBreakdownSummary,
    createdAt: row.created_at as string
  };
}

export async function listAssessments(): Promise<Assessment[]> {
  const pool = getPool();
  const res = await pool.query('SELECT id FROM assessments ORDER BY updated_at DESC');
  const results: Assessment[] = [];

  for (const r of res.rows) {
    const item = await getAssessment(r.id);
    if (item) results.push(item);
  }

  return results;
}

export async function findAssessmentByRepo(repoFullName: string): Promise<Assessment | null> {
  const pool = getPool();
  const res = await pool.query(
    'SELECT id FROM assessments WHERE LOWER(repo_full_name) = LOWER($1) ORDER BY updated_at DESC LIMIT 1',
    [repoFullName]
  );
  const row = res.rows[0];
  if (!row) return null;
  return getAssessment(row.id);
}

export function calculateOverallEvaluationScore(
  evidence: RepositoryEvidence[]
): { overallScore: number; totalPoints: number } {
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

export async function getRevisionHistory(assessmentId: string): Promise<AssessmentRevision[]> {
  const pool = getPool();
  const res = await pool.query(
    'SELECT * FROM revisions WHERE assessment_id = $1 ORDER BY revision_number DESC',
    [assessmentId]
  );
  return res.rows.map(mapRevisionRow);
}

export async function getRevisionByNumber(
  assessmentId: string,
  revisionNumber: number
): Promise<AssessmentRevision | null> {
  const pool = getPool();
  const res = await pool.query(
    'SELECT * FROM revisions WHERE assessment_id = $1 AND revision_number = $2 LIMIT 1',
    [assessmentId, revisionNumber]
  );
  const row = res.rows[0];
  if (!row) return null;
  return mapRevisionRow(row);
}

export async function getRevisionByIdOrNumber(
  assessmentId: string,
  identifier: number | string
): Promise<AssessmentRevision | null> {
  if (typeof identifier === 'number' || /^\d+$/.test(String(identifier).trim())) {
    const num = typeof identifier === 'number' ? identifier : parseInt(String(identifier).trim(), 10);
    return getRevisionByNumber(assessmentId, num);
  }
  const pool = getPool();
  const res = await pool.query(
    'SELECT * FROM revisions WHERE assessment_id = $1 AND id = $2 LIMIT 1',
    [assessmentId, String(identifier).trim()]
  );
  const row = res.rows[0];
  if (!row) return null;
  return mapRevisionRow(row);
}

export interface EvaluationHistoryOptions {
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeEvidence?: boolean;
}

export async function getEvaluationHistory(
  assessmentId: string,
  options: EvaluationHistoryOptions = {}
): Promise<{
  evaluations: EvaluationSummary[];
  latestEvaluation: EvaluationSummary | null;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const pool = getPool();
  const order = options.order === 'desc' ? 'DESC' : 'ASC'; // Default: chronological (oldest to newest)
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);

  // Total count of evaluations for this assessment
  const countRes = await pool.query(
    'SELECT COUNT(*)::int as count FROM revisions WHERE assessment_id = $1',
    [assessmentId]
  );
  const total = countRes.rows[0]?.count || 0;

  // Identify latest revision by revision_number DESC
  const latestRes = await pool.query(
    'SELECT * FROM revisions WHERE assessment_id = $1 ORDER BY revision_number DESC LIMIT 1',
    [assessmentId]
  );
  const latestRow = latestRes.rows[0];
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
  const rowsRes = await pool.query(
    `SELECT * FROM revisions WHERE assessment_id = $1 ORDER BY revision_number ${order} LIMIT $2 OFFSET $3`,
    [assessmentId, limit, offset]
  );
  const evaluations: EvaluationSummary[] = rowsRes.rows.map((r) => {
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
export async function compareRevisions(
  assessmentId: string,
  fromRevOrId: number | string,
  toRevOrId: number | string
): Promise<RevisionComparison | null> {
  const fromRev = await getRevisionByIdOrNumber(assessmentId, fromRevOrId);
  const toRev = await getRevisionByIdOrNumber(assessmentId, toRevOrId);

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

  const fromMap = new Map(fromRev.evidence.map((e) => [e.requirementId, e]));
  const toMap = new Map(toRev.evidence.map((e) => [e.requirementId, e]));

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

// ============================================================================
// Webhook Log Operations
// ============================================================================

export async function isWebhookDeliveryDuplicate(deliveryId: string): Promise<boolean> {
  if (!deliveryId) return false;
  const pool = getPool();
  const res = await pool.query('SELECT id FROM webhook_deliveries WHERE delivery_id = $1 LIMIT 1', [deliveryId]);
  return res.rows.length > 0;
}

export async function recordWebhookDelivery(log: WebhookDeliveryLog): Promise<void> {
  const pool = getPool();
  const stmt = `
    INSERT INTO webhook_deliveries (
      id, delivery_id, repo_full_name, event_type, commit_sha,
      commit_message, author, files_changed_json, signature_valid,
      affected_requirements_json, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET
      delivery_id = EXCLUDED.delivery_id,
      repo_full_name = EXCLUDED.repo_full_name,
      event_type = EXCLUDED.event_type,
      commit_sha = EXCLUDED.commit_sha,
      commit_message = EXCLUDED.commit_message,
      author = EXCLUDED.author,
      files_changed_json = EXCLUDED.files_changed_json,
      signature_valid = EXCLUDED.signature_valid,
      affected_requirements_json = EXCLUDED.affected_requirements_json,
      created_at = EXCLUDED.created_at;
  `;
  await pool.query(stmt, [
    log.id,
    log.deliveryId || null,
    log.repoFullName,
    log.eventType,
    log.commitSha || null,
    log.commitMessage || null,
    log.author || null,
    JSON.stringify(log.filesChanged),
    log.signatureValid ? 1 : 0,
    JSON.stringify(log.affectedRequirements),
    log.createdAt
  ]);
}

export async function listWebhookDeliveries(limit: number = 20): Promise<WebhookDeliveryLog[]> {
  const pool = getPool();
  const res = await pool.query(
    'SELECT * FROM webhook_deliveries ORDER BY created_at DESC LIMIT $1',
    [limit]
  );

  return res.rows.map((r) => ({
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

// ============================================================================
// Developer Verification Operations
// ============================================================================

export async function ensureDeveloperVerificationsTable(
  client?: PoolClient | Pool
): Promise<void> {
  const runner = client || getPool();
  await runner.query(`
    CREATE TABLE IF NOT EXISTS developer_verifications (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      revision_id TEXT REFERENCES revisions(id) ON DELETE SET NULL,
      requirement_id TEXT NOT NULL,
      requirement_title TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_title TEXT NOT NULL,
      task_type TEXT NOT NULL,
      code_reference_json TEXT NOT NULL,
      assessment_conditions_json TEXT NOT NULL,
      practical_solution TEXT NOT NULL,
      practical_evaluation_json TEXT NOT NULL,
      followup_question TEXT NOT NULL,
      reasoning_response TEXT NOT NULL,
      reasoning_evaluation_json TEXT NOT NULL,
      dimensions_json TEXT NOT NULL,
      status TEXT NOT NULL,
      overall_verdict TEXT NOT NULL,
      confidence_score INTEGER NOT NULL,
      limitations_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_verifications_assessment_id ON developer_verifications(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_verifications_requirement_id ON developer_verifications(assessment_id, requirement_id);
    CREATE INDEX IF NOT EXISTS idx_verifications_created_at ON developer_verifications(created_at DESC);
  `);
}

function mapVerificationRow(row: Record<string, unknown>): DeveloperVerificationRecord {
  const codeRef = row.code_reference_json ? JSON.parse(row.code_reference_json as string) : {};
  const cond = row.assessment_conditions_json ? JSON.parse(row.assessment_conditions_json as string) : {};
  const practicalEval = row.practical_evaluation_json ? JSON.parse(row.practical_evaluation_json as string) : {};
  const followupQ = row.followup_question ? JSON.parse(row.followup_question as string) : {};
  const reasoningEval = row.reasoning_evaluation_json ? JSON.parse(row.reasoning_evaluation_json as string) : {};
  const dimensions = row.dimensions_json ? JSON.parse(row.dimensions_json as string) : {};
  const limitations = row.limitations_json ? JSON.parse(row.limitations_json as string) : [];

  return {
    id: row.id as string,
    assessmentId: row.assessment_id as string,
    revisionId: (row.revision_id as string) || undefined,
    requirementId: row.requirement_id as string,
    requirementTitle: row.requirement_title as string,
    task: {
      id: row.task_id as string,
      requirementId: row.requirement_id as string,
      requirementTitle: row.requirement_title as string,
      taskType: (row.task_type as any) || 'edge_case_fix',
      title: row.task_title as string,
      scenario: '',
      targetCode: codeRef,
      instructions: '',
      expectedBehavior: '',
      evaluationCriteria: [],
      permittedTools: cond.permittedTools || 'Standard Tools',
      allowedCondition: cond.condition || 'ai_restricted_independent',
      isFallbackManual: false
    },
    assessmentCondition: cond.condition || 'ai_restricted_independent',
    practicalSolution: (row.practical_solution as string) || '',
    practicalEvaluation: practicalEval,
    followupQuestion: followupQ,
    reasoningResponse: (row.reasoning_response as string) || '',
    reasoningEvaluation: reasoningEval,
    dimensions,
    status: (row.status as VerificationVerdict) || 'unverified',
    overallVerdict: (row.overall_verdict as string) || '',
    confidenceScore: Number(row.confidence_score) || 0,
    limitations,
    createdAt: row.created_at as string
  };
}

export async function saveDeveloperVerification(
  record: DeveloperVerificationRecord,
  client?: PoolClient
): Promise<void> {
  const runner = client || getPool();
  await ensureDeveloperVerificationsTable(runner);

  const stmt = `
    INSERT INTO developer_verifications (
      id, assessment_id, revision_id, requirement_id, requirement_title,
      task_id, task_title, task_type, code_reference_json,
      assessment_conditions_json, practical_solution, practical_evaluation_json,
      followup_question, reasoning_response, reasoning_evaluation_json,
      dimensions_json, status, overall_verdict, confidence_score,
      limitations_json, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT (id) DO UPDATE SET
      assessment_id = EXCLUDED.assessment_id,
      revision_id = EXCLUDED.revision_id,
      requirement_id = EXCLUDED.requirement_id,
      requirement_title = EXCLUDED.requirement_title,
      task_id = EXCLUDED.task_id,
      task_title = EXCLUDED.task_title,
      task_type = EXCLUDED.task_type,
      code_reference_json = EXCLUDED.code_reference_json,
      assessment_conditions_json = EXCLUDED.assessment_conditions_json,
      practical_solution = EXCLUDED.practical_solution,
      practical_evaluation_json = EXCLUDED.practical_evaluation_json,
      followup_question = EXCLUDED.followup_question,
      reasoning_response = EXCLUDED.reasoning_response,
      reasoning_evaluation_json = EXCLUDED.reasoning_evaluation_json,
      dimensions_json = EXCLUDED.dimensions_json,
      status = EXCLUDED.status,
      overall_verdict = EXCLUDED.overall_verdict,
      confidence_score = EXCLUDED.confidence_score,
      limitations_json = EXCLUDED.limitations_json,
      created_at = EXCLUDED.created_at;
  `;

  await runner.query(stmt, [
    record.id,
    record.assessmentId,
    record.revisionId || null,
    record.requirementId,
    record.requirementTitle,
    record.task.id,
    record.task.title,
    record.task.taskType,
    JSON.stringify(record.task.targetCode || {}),
    JSON.stringify({
      condition: record.assessmentCondition,
      permittedTools: record.task.permittedTools
    }),
    record.practicalSolution,
    JSON.stringify(record.practicalEvaluation),
    JSON.stringify(record.followupQuestion),
    record.reasoningResponse,
    JSON.stringify(record.reasoningEvaluation),
    JSON.stringify(record.dimensions),
    record.status,
    record.overallVerdict,
    record.confidenceScore,
    JSON.stringify(record.limitations),
    record.createdAt
  ]);
}

export async function getDeveloperVerifications(
  assessmentId: string,
  client?: PoolClient
): Promise<DeveloperVerificationRecord[]> {
  const runner = client || getPool();
  await ensureDeveloperVerificationsTable(runner);

  const res = await runner.query(
    'SELECT * FROM developer_verifications WHERE assessment_id = $1 ORDER BY created_at DESC',
    [assessmentId]
  );

  return res.rows.map(mapVerificationRow);
}

export async function getVerificationForRequirement(
  assessmentId: string,
  requirementId: string,
  client?: PoolClient
): Promise<DeveloperVerificationRecord | null> {
  const runner = client || getPool();
  await ensureDeveloperVerificationsTable(runner);

  const res = await runner.query(
    'SELECT * FROM developer_verifications WHERE assessment_id = $1 AND requirement_id = $2 ORDER BY created_at DESC LIMIT 1',
    [assessmentId, requirementId]
  );

  if (res.rows.length === 0) return null;
  return mapVerificationRow(res.rows[0]);
}

export async function getAssessmentVerificationSummary(
  assessmentId: string,
  requirements?: InternshipRequirement[],
  client?: PoolClient
): Promise<AssessmentVerificationSummary> {
  const runner = client || getPool();
  await ensureDeveloperVerificationsTable(runner);

  const res = await runner.query(
    'SELECT * FROM developer_verifications WHERE assessment_id = $1 ORDER BY created_at DESC',
    [assessmentId]
  );

  const records = res.rows.map(mapVerificationRow);

  // Group latest record by requirementId
  const latestByReq = new Map<string, DeveloperVerificationRecord>();
  for (const rec of records) {
    if (!latestByReq.has(rec.requirementId)) {
      latestByReq.set(rec.requirementId, rec);
    }
  }

  const total = requirements && requirements.length > 0 ? requirements.length : latestByReq.size;
  let verifiedCount = 0;
  let partialCount = 0;
  let unverifiedCount = 0;

  for (const rec of latestByReq.values()) {
    if (rec.status === 'verified_demonstrated') {
      verifiedCount++;
    } else if (rec.status === 'partial_verification') {
      partialCount++;
    } else {
      unverifiedCount++;
    }
  }

  const notYetVerifiedCount = Math.max(0, total - (verifiedCount + partialCount + unverifiedCount));

  let overallStatus: AssessmentVerificationSummary['overallStatus'] = 'not_yet_verified';
  if (verifiedCount === total && total > 0) {
    overallStatus = 'all_verified';
  } else if (verifiedCount > 0 || partialCount > 0 || unverifiedCount > 0) {
    overallStatus = 'partially_verified';
  }

  return {
    assessmentId,
    totalRequirements: total,
    verifiedCount,
    partialCount,
    unverifiedCount,
    notYetVerifiedCount,
    overallStatus,
    records,
    confidenceSummary:
      verifiedCount > 0
        ? `${verifiedCount} requirement(s) verified through grounded practical tasks and adaptive reasoning.`
        : 'No practical verification checks have been completed yet. Repository evidence only.',
    limitationsNotice:
      'Verification assesses practical execution and reasoning under declared conditions. It does not claim 100% cheat detection or substitute for complete software lifecycle performance.'
  };
}
