import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function importSqliteToPostgres(options = {}) {
  const sqlitePath = options.sqlitePath || path.join(__dirname, '..', 'data', 'proofloop.db');
  const connectionString =
    options.connectionString ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL;

  const allowNonEmpty =
    options.allowNonEmpty ||
    process.argv.includes('--force') ||
    process.env.ALLOW_NON_EMPTY_TARGET === 'true';

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source database not found at ${sqlitePath}`);
  }

  if (!connectionString || !connectionString.trim()) {
    throw new Error(
      'DATABASE_URL (or DATABASE_URL_UNPOOLED) is not configured. Please set the environment variable before running import.'
    );
  }

  console.log(`[Import] Reading SQLite database from ${sqlitePath}...`);
  const sqlite = new DatabaseSync(sqlitePath);

  const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const pgClient = new Client({
    connectionString,
    ssl: isLocalhost ? false : { rejectUnauthorized: false }
  });

  await pgClient.connect();

  const tables = [
    'internships',
    'assessments',
    'revisions',
    'roadmap_tasks',
    'activity_events',
    'webhook_deliveries'
  ];

  try {
    // 1. Verify schema tables exist in destination
    for (const table of tables) {
      const tableCheck = await pgClient.query(
        `SELECT to_regclass('public.${table}') as exists;`
      );
      if (!tableCheck.rows[0]?.exists) {
        throw new Error(
          `Target table "${table}" does not exist in PostgreSQL. Please run migrations first (npm run db:migrate).`
        );
      }
    }

    // 2. Check if destination database is non-empty
    let totalTargetRows = 0;
    const initialTargetCounts = {};
    for (const table of tables) {
      const res = await pgClient.query(`SELECT COUNT(*)::int as count FROM ${table};`);
      const count = res.rows[0]?.count || 0;
      initialTargetCounts[table] = count;
      totalTargetRows += count;
    }

    if (totalTargetRows > 0 && !allowNonEmpty) {
      throw new Error(
        `Target database is not empty (${totalTargetRows} existing rows found across tables). ` +
        `To safely import without truncating existing data, supply the --force flag or set ALLOW_NON_EMPTY_TARGET=true.`
      );
    }

    // 3. Begin PostgreSQL transaction
    await pgClient.query('BEGIN;');
    console.log('[Import] Transaction started. Importing data in foreign-key dependency order...');

    const report = {};

    // --- Table 1: internships ---
    {
      const rows = sqlite.prepare('SELECT * FROM internships').all();
      const insertSql = `
        INSERT INTO internships (
          id, title, company, location, source_url, raw_text, requirements_json, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING;
      `;
      let inserted = 0;
      for (const row of rows) {
        const res = await pgClient.query(insertSql, [
          row.id,
          row.title,
          row.company,
          row.location ?? null,
          row.source_url,
          row.raw_text ?? null,
          row.requirements_json,
          row.created_at
        ]);
        if (res.rowCount && res.rowCount > 0) inserted++;
      }
      report['internships'] = { sourceCount: rows.length, insertedCount: inserted };
      console.log(`[Import] internships: ${rows.length} source rows -> ${inserted} new rows imported`);
    }

    // --- Table 2: assessments ---
    {
      const rows = sqlite.prepare('SELECT * FROM assessments').all();
      const insertSql = `
        INSERT INTO assessments (
          id, internship_id, repo_full_name, repo_url, default_branch,
          latest_commit_sha, current_revision_number, status,
          analysis_scope_json, ai_signals_json, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING;
      `;
      let inserted = 0;
      for (const row of rows) {
        const res = await pgClient.query(insertSql, [
          row.id,
          row.internship_id,
          row.repo_full_name,
          row.repo_url,
          row.default_branch,
          row.latest_commit_sha,
          row.current_revision_number,
          row.status,
          row.analysis_scope_json ?? null,
          row.ai_signals_json ?? null,
          row.created_at,
          row.updated_at
        ]);
        if (res.rowCount && res.rowCount > 0) inserted++;
      }
      report['assessments'] = { sourceCount: rows.length, insertedCount: inserted };
      console.log(`[Import] assessments: ${rows.length} source rows -> ${inserted} new rows imported`);
    }

    // --- Table 3: revisions ---
    {
      const rows = sqlite.prepare('SELECT * FROM revisions').all();
      const insertSql = `
        INSERT INTO revisions (
          id, assessment_id, revision_number, commit_sha, commit_message,
          trigger_type, evidence_json, demonstrated_count, partial_count,
          not_demonstrated_count, scoring_rule_version, analysis_scope_json,
          ai_signals_json, score_breakdown_summary_json, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO NOTHING;
      `;
      let inserted = 0;
      for (const row of rows) {
        const res = await pgClient.query(insertSql, [
          row.id,
          row.assessment_id,
          row.revision_number,
          row.commit_sha,
          row.commit_message,
          row.trigger_type,
          row.evidence_json,
          row.demonstrated_count,
          row.partial_count,
          row.not_demonstrated_count,
          row.scoring_rule_version ?? null,
          row.analysis_scope_json ?? null,
          row.ai_signals_json ?? null,
          row.score_breakdown_summary_json ?? null,
          row.created_at
        ]);
        if (res.rowCount && res.rowCount > 0) inserted++;
      }
      report['revisions'] = { sourceCount: rows.length, insertedCount: inserted };
      console.log(`[Import] revisions: ${rows.length} source rows -> ${inserted} new rows imported`);
    }

    // --- Table 4: roadmap_tasks ---
    {
      const rows = sqlite.prepare('SELECT * FROM roadmap_tasks').all();
      const insertSql = `
        INSERT INTO roadmap_tasks (
          id, assessment_id, requirement_id, task_data_json, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING;
      `;
      let inserted = 0;
      for (const row of rows) {
        const res = await pgClient.query(insertSql, [
          row.id,
          row.assessment_id,
          row.requirement_id,
          row.task_data_json,
          row.status,
          row.created_at
        ]);
        if (res.rowCount && res.rowCount > 0) inserted++;
      }
      report['roadmap_tasks'] = { sourceCount: rows.length, insertedCount: inserted };
      console.log(`[Import] roadmap_tasks: ${rows.length} source rows -> ${inserted} new rows imported`);
    }

    // --- Table 5: activity_events ---
    {
      const rows = sqlite.prepare('SELECT * FROM activity_events').all();
      const insertSql = `
        INSERT INTO activity_events (
          id, assessment_id, event_type, title, description,
          commit_sha, commit_message, affected_skills_json, timestamp
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING;
      `;
      let inserted = 0;
      for (const row of rows) {
        const res = await pgClient.query(insertSql, [
          row.id,
          row.assessment_id,
          row.event_type,
          row.title,
          row.description,
          row.commit_sha ?? null,
          row.commit_message ?? null,
          row.affected_skills_json ?? null,
          row.timestamp
        ]);
        if (res.rowCount && res.rowCount > 0) inserted++;
      }
      report['activity_events'] = { sourceCount: rows.length, insertedCount: inserted };
      console.log(`[Import] activity_events: ${rows.length} source rows -> ${inserted} new rows imported`);
    }

    // --- Table 6: webhook_deliveries ---
    {
      const rows = sqlite.prepare('SELECT * FROM webhook_deliveries').all();
      const insertSql = `
        INSERT INTO webhook_deliveries (
          id, delivery_id, repo_full_name, event_type, commit_sha,
          commit_message, author, files_changed_json, signature_valid,
          affected_requirements_json, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING;
      `;
      let inserted = 0;
      for (const row of rows) {
        const res = await pgClient.query(insertSql, [
          row.id,
          row.delivery_id ?? null,
          row.repo_full_name,
          row.event_type,
          row.commit_sha ?? null,
          row.commit_message ?? null,
          row.author ?? null,
          row.files_changed_json ?? null,
          row.signature_valid,
          row.affected_requirements_json ?? null,
          row.created_at
        ]);
        if (res.rowCount && res.rowCount > 0) inserted++;
      }
      report['webhook_deliveries'] = { sourceCount: rows.length, insertedCount: inserted };
      console.log(`[Import] webhook_deliveries: ${rows.length} source rows -> ${inserted} new rows imported`);
    }

    // 4. Verification of final counts and relationships
    console.log('[Import] Verifying imported data and relational integrity...');
    const finalCounts = {};
    for (const table of tables) {
      const res = await pgClient.query(`SELECT COUNT(*)::int as count FROM ${table};`);
      finalCounts[table] = res.rows[0]?.count || 0;
    }

    // Verify orphaned assessments
    const orphanAssessments = await pgClient.query(`
      SELECT COUNT(*)::int as count
      FROM assessments a
      LEFT JOIN internships i ON a.internship_id = i.id
      WHERE i.id IS NULL;
    `);
    if ((orphanAssessments.rows[0]?.count || 0) > 0) {
      throw new Error(`Data integrity violation: ${orphanAssessments.rows[0].count} orphaned assessments found.`);
    }

    // Verify orphaned revisions
    const orphanRevisions = await pgClient.query(`
      SELECT COUNT(*)::int as count
      FROM revisions r
      LEFT JOIN assessments a ON r.assessment_id = a.id
      WHERE a.id IS NULL;
    `);
    if ((orphanRevisions.rows[0]?.count || 0) > 0) {
      throw new Error(`Data integrity violation: ${orphanRevisions.rows[0].count} orphaned revisions found.`);
    }

    // Commit transaction
    await pgClient.query('COMMIT;');
    console.log('[Import] Transaction committed successfully!');

    console.log('\n======================================================');
    console.log('              IMPORT SUMMARY REPORT                   ');
    console.log('======================================================');
    for (const table of tables) {
      const { sourceCount, insertedCount } = report[table];
      const targetTotal = finalCounts[table];
      console.log(
        `Table: ${table.padEnd(20)} | SQLite: ${String(sourceCount).padStart(5)} | Imported: ${String(insertedCount).padStart(5)} | Total in PG: ${String(targetTotal).padStart(5)}`
      );
    }
    console.log('======================================================\n');

    return {
      success: true,
      report,
      finalCounts
    };
  } catch (err) {
    await pgClient.query('ROLLBACK;');
    console.error('[Import Error] Transaction rolled back. Reason:', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    sqlite.close();
    await pgClient.end();
  }
}

// Auto-run when executed directly via CLI
if (process.argv[1] === __filename) {
  importSqliteToPostgres()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Import Failed]', err.message);
      process.exit(1);
    });
}
