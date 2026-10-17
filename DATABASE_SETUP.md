# ProofLoop — PostgreSQL / Neon Database Setup & Migration Guide

This document provides instructions for provisioning, configuring, migrating, importing, and verifying the PostgreSQL database for ProofLoop using [Neon](https://neon.tech).

---

## 1. Environment Variables Overview

ProofLoop uses PostgreSQL for persistent storage. Database access uses standard Node.js database pooling via `pg`. Two connection strings are supported:

| Variable | Description | Recommended Neon Endpoint |
|---|---|---|
| `DATABASE_URL` | **Required.** Primary database connection string used for all application queries. | **Pooled connection** (`-pooler.neon.tech`) — optimized for serverless architectures (Vercel functions). |
| `DATABASE_URL_UNPOOLED` | **Optional (Recommended for migrations/imports).** Direct connection string used by migration and batch import scripts. | **Direct connection** (`.neon.tech` without `-pooler`). Falls back to `DATABASE_URL` if not explicitly set. |

### Neon Connection String Formats

From your Neon Console project dashboard:
- **Pooled URL (`DATABASE_URL`)**:
  ```text
  postgresql://[user]:[password]@[endpoint-id]-pooler.[region].aws.neon.tech/[dbname]?sslmode=require
  ```
- **Direct / Unpooled URL (`DATABASE_URL_UNPOOLED`)**:
  ```text
  postgresql://[user]:[password]@[endpoint-id].[region].aws.neon.tech/[dbname]?sslmode=require
  ```

---

## 2. Local Environment Configuration

1. **Create or edit `.env.local`** (in the repository root):
   ```bash
   cp .env.example .env.local
   ```
2. **Set your Neon database credentials** in `.env.local`:
   ```ini
   DATABASE_URL="postgresql://<user>:<password>@<endpoint>-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
   DATABASE_URL_UNPOOLED="postgresql://<user>:<password>@<endpoint>.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```
   > [!IMPORTANT]
   > `.env.local` is listed in `.gitignore`. Never commit `.env.local`, connection strings, or credentials to version control.

---

## 3. Vercel Configuration (Production & Preview)

When deploying to Vercel, configure environment variables in your project settings:

1. Navigate to your project on **Vercel** > **Settings** > **Environment Variables**.
2. Add:
   - **`DATABASE_URL`**: Set to the Neon **pooled** connection string. Select **Production**, **Preview**, and **Development** environments.
   - **`DATABASE_URL_UNPOOLED`**: Set to the Neon **direct** connection string. Select **Production**, **Preview**, and **Development** environments.
   - **`GITHUB_WEBHOOK_SECRET`**: Set to your production webhook secret.
   - **`GITHUB_TOKEN`**: (Optional) Personal access token for higher GitHub API rate limits.
3. Save changes. Future deployments will automatically use the hosted PostgreSQL database.

---

## 4. Database Migrations

Database tables and indexes are managed via versioned, idempotent SQL migration scripts in `db/migrations/`:
- `001_create_tables.sql`: Creates `schema_migrations`, `internships`, `assessments`, `revisions`, `roadmap_tasks`, `activity_events`, and `webhook_deliveries`.
- `002_create_indexes.sql`: Creates performance indexes for repository lookups, revision histories, timestamps, and webhook deduplication.

### Running Migrations

To apply pending migrations to your database:

```bash
npm run db:migrate
```

The migration runner:
- Connects using `DATABASE_URL_UNPOOLED` (or `DATABASE_URL` if unpooled is unset).
- Tracks applied migrations in the `schema_migrations` table.
- Executes within transactions to ensure atomic application.
- Is idempotent: running it multiple times is safe and skips already applied migrations.

---

## 5. Local Database Backup & One-Time Data Import

ProofLoop previously stored data locally in SQLite at `data/proofloop.db`. To migrate all existing historical records into Neon:

### Step 5.1: Create a Local SQLite Backup
Before running the import, create a timestamped backup of the current SQLite database (including WAL files):

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "backups"
Copy-Item "data/proofloop.db*" -Destination "backups/"
```

**macOS / Linux:**
```bash
mkdir -p backups
cp data/proofloop.db* backups/
```

### Step 5.2: Run the One-Time Import Script
The import script reads `data/proofloop.db` in read-only mode and imports all tables into PostgreSQL in strict foreign-key dependency order:
1. `internships`
2. `assessments`
3. `revisions`
4. `roadmap_tasks`
5. `activity_events`
6. `webhook_deliveries`

Run the import script:
```bash
npm run db:import
```

#### Safety Guardrails
- **Read-Only SQLite Access**: The source SQLite file is never modified or deleted.
- **Empty-Target Protection**: The script refuses to import into a non-empty target database to prevent accidental overwrites.
- **Explicit Override**: To import into a database that already has records, pass `--force`:
  ```bash
  node scripts/import-sqlite-to-postgres.mjs --force
  ```
- **Atomic Transaction**: All table imports occur within a single PostgreSQL transaction (`BEGIN ... COMMIT`). If any table fails, the entire import is rolled back (`ROLLBACK`).
- **Privacy & Security**: Assessment contents, secret tokens, and raw credentials are never logged to stdout or error streams.

---

## 6. Verifying Connection & Data Post-Import

After running migrations and import:

1. **Run the Automated Test Suite**:
   ```bash
   npm test
   ```
   When `DATABASE_URL` is set, all dynamic database tests will execute against the live PostgreSQL database, testing:
   - Saving and retrieving assessments
   - Evaluation history and revision comparisons
   - Atomic 10-evaluation retention limits
   - Webhook delivery deduplication
   - Foreign-key integrity

2. **Verify Row Counts**:
   The `npm run db:import` output displays row count verification comparisons between SQLite and PostgreSQL:
   ```text
   Source counts vs Target counts:
     internships: source 157, target 157 (OK)
     assessments: source 315, target 315 (OK)
     revisions: source 866, target 866 (OK)
     roadmap_tasks: source 6, target 6 (OK)
     activity_events: source 100, target 100 (OK)
     webhook_deliveries: source 31, target 31 (OK)
   ```

3. **Verify in the ProofLoop UI**:
   Start the local Next.js development server:
   ```bash
   npm run dev
   ```
   - Open `http://localhost:3000/dashboard` to verify existing assessments load seamlessly.
   - Open `http://localhost:3000/dashboard/history` to verify evaluation history and revision comparison graphs display accurately.
