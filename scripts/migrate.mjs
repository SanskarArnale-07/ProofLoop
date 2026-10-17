import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

export async function runMigrations(customConnectionString) {
  const connectionString =
    customConnectionString ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL;

  if (!connectionString || !connectionString.trim()) {
    throw new Error(
      'DATABASE_URL (or DATABASE_URL_UNPOOLED) is not configured. Please set the environment variable before running migrations.'
    );
  }

  const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const client = new Client({
    connectionString,
    ssl: isLocalhost ? false : { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    // 1. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch already applied migrations
    const res = await client.query('SELECT name FROM schema_migrations ORDER BY id ASC;');
    const appliedSet = new Set(res.rows.map((r) => r.name));

    // 3. Discover migration files
    if (!fs.existsSync(migrationsDir)) {
      console.log(`No migrations directory found at ${migrationsDir}`);
      return { applied: [], skipped: [] };
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const newlyApplied = [];
    const skipped = [];

    for (const file of files) {
      if (appliedSet.has(file)) {
        skipped.push(file);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`[Migration] Applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1);', [file]);
        await client.query('COMMIT');
        newlyApplied.push(file);
        console.log(`[Migration] Successfully applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migration] Failed applying ${file}:`, err instanceof Error ? err.message : err);
        throw err;
      }
    }

    if (newlyApplied.length === 0) {
      console.log(`[Migration] Database is already up to date (${skipped.length} migrations applied).`);
    } else {
      console.log(`[Migration] Finished. Applied ${newlyApplied.length} new migration(s).`);
    }

    return { applied: newlyApplied, skipped };
  } finally {
    await client.end();
  }
}

// Auto-run when executed directly via CLI
if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration Error]', err.message);
      process.exit(1);
    });
}
