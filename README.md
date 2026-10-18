# ProofLoop — Evidence-Based AI Career Coach & Skill Assessment Engine

ProofLoop is an **evidence-based technical career coach and developer skill assessment platform**. Rather than functioning as a generic conversational chatbot that guesses someone's engineering competency from resumes or text prompts, ProofLoop verifies skills directly against **actual GitHub repository activity, multi-commit history, unified patch diffs, test implementations, and code quality evidence**.

ProofLoop provides **traceable evidence**, **explainable deterministic rankings**, **deep diagnostic code inspection**, **agentic investigations**, **plain-English AI gap coaching**, and **GitHub profile multi-repo auto-scanning**.

---

## Key Highlights

- **Implementation Over Declaration**: A dependency declaration alone (e.g., `"react"`, `"pg"`, or `"pydantic"`) is weak evidence. ProofLoop rewards actual implementation patterns, state management, error handling, and active test assertions.
- **Traceable Code Findings**: Every detected skill references real repository paths, commit SHAs, line-level diff additions/modifications, and active test assertions with line numbers.
- **Deterministic & Auditable Scoring**: Skill rankings are driven by an explicit, versioned mathematical engine (`v2026.1`) with deterministic tie-breaking. Scores are reproducible and explainable—no opaque LLM hallucinating points.
- **Autonomous Agentic Investigator**: A sandboxed agentic tool suite that autonomously dives deep into source files, AST patterns, commit histories, and test suites to verify implementation claims.
- **AI Gap Coach (Advisory & Guardrailed)**: Actionable, plain-English advice and prioritized next steps to close skill gaps, powered by Gemini. Strictly bounded to declared job posting requirements with zero hallucinated hiring odds or score mutations.
- **GitHub Profile Multi-Repository Auto-Scanning**: Auto-scans an entire user's GitHub profile across all their active public repositories, compiling the best verified evidence into a unified assessment and suggesting matched career roles.
- **Developer Verification System**: Repository-grounded practical understanding tasks (edge cases, contracts, test additions) paired with adaptive reasoning evaluations and multidimensional scoring.
- **Non-Penalizing AI Heuristics**: Auxiliary AI-authorship signal detection analyzes commit message variance, templated comments, and code-comment drift. Conventional commits (`feat:`, `fix:`) and polished comments are **never** treated as AI generation, and signals **never** deduct skill points.
- **Append-Only Revision History**: Reassessments and webhook updates create versioned audit records. Failed reassessments preserve previous successful revisions intact with zero data loss.
- **Enterprise-Grade Ingestion & Security**: Hardened HMAC-SHA256 signature verification, idempotent delivery deduplication, sensitive credential redaction, SSRF prevention, and rate-limit backoff.
- **PostgreSQL / Neon Architecture**: Fully migrated to PostgreSQL with connection pooling (`pg`), transaction rollbacks, and sequential idempotent migrations.

---

## Architecture & Technology Stack

| Layer                 | Technology                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**         | [Next.js 16](https://nextjs.org) (App Router, Server Components & Route Handlers)                                                                  |
| **Language**          | [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode)                                                                                      |
| **Styling & UI**      | [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/) + Three.js / React Three Fiber                                   |
| **Database**          | [PostgreSQL](https://www.postgresql.org/) (supports [Neon](https://neon.tech/) Serverless Pooler via `pg` connection pool with SSL & transactions) |
| **AI / LLM Provider** | [Google Gemini](https://ai.google.dev/) (via server-side REST API with bounded timeouts, schema validation, and zero client key exposure)          |
| **API Client**        | Native Fetch with bounded retries, exponential backoff, and GitHub REST API integration                                                            |
| **Testing**           | Node.js native test runner (`node --test`) with 100+ automated test cases across 12 test suites                                                    |

---

## Core Capabilities & Features

### 1. Multi-Commit & Real Diff Analysis

- Traverses commit history with pagination support rather than inspecting only `HEAD`.
- Inspects unified patch diffs to isolate actual line additions, modifications, and deletions.
- Distinguishes between repository ownership and author/committer attribution.
- Declares explicit `analysisScope` (commit count, file count, commit date range, omitted sensitive files) so evaluations never overstate what was inspected.

### 2. Evidence-Based Skill Detection & Code Excerpt Verification

- **Dependency Detection**: Catches declared packages across `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, and `Cargo.toml`.
- **Implementation Verification**: Detects architectural constructs (e.g., custom React hooks, database repositories, API route handlers, concurrent pipelines).
- **Test Evidence**: Verifies unit/integration test suites and active assertions (`expect`, `assert`, `test`, `it`). Test files with zero assertions produce partial status capped at $\le 45\%$ confidence.
- **Exact Line-Number Excerpts**: Pulls exact source code snippets bounded by `lineStart` and `lineEnd` with source retrieval status tracking (`retrieved`, `missing_file`, `failed`).

### 3. Transparent, Deterministic Ranking Engine

- **Engine Version**: `SCORING_RULE_VERSION = 'v2026.1'`
- **Component Weights**:
  - Implementation Evidence: `40%`
  - Test Quality & Assertions: `25%`
  - Contribution Depth across multi-commits: `20%`
  - Architecture & Complexity: `15%`
- **Normalized Scale**: Normalized 0–100 integer scores with explicit point tiering (`Junior` / `Mid-Level` / `Senior` / `Staff+`).
- **Grounded Confidence**: Calculated strictly from observable sample size, verifiable commits, and test presence. ProofLoop never claims arbitrary 95%+ confidence without justification.
- **5-Tier Deterministic Tie-Breaking**: Resolves identical scores without randomness via:
  1. Verified test assertion count
  2. Multi-commit contribution count
  3. Implementation code line additions
  4. Alphabetical skill name
  5. Deterministic hash

### 4. GitHub Profile Multi-Repository Auto-Scanning

- Scans an entire user's GitHub profile across all their active public repositories (`/api/profile-scan/start`).
- Intelligently extracts the best verified evidence for each target job skill across multiple projects.
- Caches per-repo scan evidence in `repo_scan_cache` using repository push timestamps (`pushed_at`) to avoid redundant GitHub API consumption.
- Generates evidence-grounded role recommendations based strictly on verified skills.
- Handles partial scans gracefully within a bounded 90-second total execution budget and bounded concurrency.

### 5. Autonomous Agentic Evidence Investigator

- Read-only agentic tool suite (`/api/assessments/:id/investigate`) for deep diagnostic verification:
  - `search_repository_evidence`: queries existing repository assessment evidence.
  - `inspect_repository_file`: inspects up to 80 lines of source code at the analyzed commit.
  - `get_requirement_details`: retrieves full requirement criteria.
  - `get_commit_history`: retrieves recent commit messages and changed file lists.
- **Sandbox Bounds**: Max 5 iterations, 30-second timeout, sensitive credential redaction, SSRF prevention.
- Produces category-specific practical verification tasks (e.g., idempotency tests for backend, relational schema migrations for DB, state management for frontend).

### 6. AI Gap Coach (Advisory & Guardrailed)

- Analyzes candidate gaps and generates plain-English advice and prioritized next steps (`/api/assessments/:id/gap-coach`).
- **Strict Integrity Guardrails**:
  - Bounded strictly to declared job posting requirements; never invents skills.
  - Zero prediction of hiring probabilities or selection odds (enforces forbidden pattern filtering against phrases like _"chance of being selected"_ or _"hireability"_).
  - Rate-limited with a 60-second cooldown per assessment revision.
  - Revision diffs automatically compare progress against prior evaluations (identifying _improved_ vs. _still missing_ requirements).
  - Purely advisory: never modifies deterministic skill scores or rankings.
  - Deterministic rule-based fallback if the AI provider is unconfigured or unavailable.

### 7. Developer Verification System

- Evaluates practical developer understanding using repository-grounded scenarios:
  - Edge-case bug fixing
  - API contract preservation
  - Type dataflow decisions
  - Test suite additions
  - Defect diagnosis
- Adaptive follow-up questioning tests technical reasoning behind implementation decisions.
- Tracks verification integrity across distinct assessment conditions:
  - `ai_restricted_independent`
  - `ai_assisted_disclosed`
  - `unmonitored_takehome`

### 8. AI-Authorship Signal Analysis (Auxiliary & Non-Penalizing)

- Analyzes commit message repetition, templated boilerplate, and comment-to-code contradictions.
- **Strict Guardrails**:
  - Conventional commit prefixes (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`) are classified as standard software engineering practice, **not** AI generation.
  - Well-written, grammatical, or verbose comments are classified as professional documentation, **not** AI generation.
  - AI signals are strictly auxiliary transparency disclosures and **never alter skill scores or rankings**.

### 9. Append-Only Audit Trail & Historical Comparisons

- Preserves every assessment as an immutable revision (`assessment_revisions`).
- Compares revisions (`/api/assessments/:id/compare?from=1&to=2`) to surface:
  - Skill score deltas and tier changes.
  - Newly demonstrated, improved, regressed, and unchanged skills.
  - Added or removed commit and implementation evidence.
  - Scoring rule version transitions.
- Failed reassessments record the error reason while leaving prior successful revisions untouched.

### 10. Webhook Security & Idempotency

- **HMAC-SHA256**: Validates GitHub webhook payload signatures using `X-Hub-Signature-256` and timing-safe comparisons.
- **Delivery Deduplication**: Tracks `X-GitHub-Delivery` IDs in an idempotent ledger. Duplicate deliveries return cached `200 OK` responses without triggering duplicate revisions.
- **Multi-Commit Push Ingestion**: Ingests up to 20 pushed commits per payload, analyzing diffs and updating assessments automatically.

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher (compatible with Node.js 20, 22, 24)
- **npm**: `v10.0.0` or higher
- **PostgreSQL Database**: A running PostgreSQL instance (local or hosted, e.g. [Neon](https://neon.tech/), Supabase)
- **Git**

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/SanskarArnale-07/careercoach.git
   cd careercoach
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   Configure the following variables in `.env.local`:

   ```env
   # ==========================================
   # DATABASE CONFIGURATION (PostgreSQL / Neon)
   # ==========================================
   # Pooled connection string used for runtime queries
   DATABASE_URL=postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require

   # Direct/unpooled connection string used for schema migrations (optional, falls back to DATABASE_URL)
   DATABASE_URL_UNPOOLED=postgresql://user:password@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require

   # ==========================================
   # GITHUB INTEGRATION
   # ==========================================
   # Personal Access Token (PAT) raises rate limits from 60 req/hr to 5,000 req/hr
   GITHUB_TOKEN=your_github_personal_access_token_here

   # Webhook HMAC-SHA256 secret for push notifications
   GITHUB_WEBHOOK_SECRET=your_webhook_hmac_secret_here

   # ==========================================
   # AI PROVIDER CONFIGURATION (Gemini)
   # ==========================================
   # Google Gemini API key for AI Gap Coach and Agentic Investigator
   AI_API_KEY=your_gemini_api_key_here

   # Model name (e.g., gemini-2.5-flash or gemini-1.5-flash)
   AI_MODEL=gemini-2.5-flash

   # ==========================================
   # APPLICATION CONFIGURATION
   # ==========================================
   PORT=3000
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_DEMO_MODE=true
   ```

4. **Run Database Migrations**:
   Run the sequential PostgreSQL migrations (tables, indexes, developer verifications, AI gap reports, and profile scan tables):

   ```bash
   npm run db:migrate
   ```

5. **Verify AI Provider Connectivity (Optional)**:
   Verify that your Gemini API key and model configuration are working:

   ```bash
   npm run ai:check
   ```

6. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## REST API Contract

| Method | Endpoint                                   | Description                                                             |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| `GET`  | `/api/assessments`                         | List all assessments with metadata and current revision pointers        |
| `POST` | `/api/assessments`                         | Create a new single-repository assessment against a job posting         |
| `GET`  | `/api/assessments/:id`                     | Retrieve assessment details with latest revision, tasks, and scope      |
| `POST` | `/api/assessments/:id/reassess`            | Re-run evidence evaluation against the repository                       |
| `GET`  | `/api/assessments/:id/revisions`           | Fetch immutable revision history for an assessment                      |
| `GET`  | `/api/assessments/:id/compare?from=1&to=2` | Compare two revisions to surface score deltas, added/removed evidence   |
| `GET`  | `/api/assessments/:id/verification`        | Fetch multidimensional developer verification summary                   |
| `POST` | `/api/assessments/:id/investigate`         | Run autonomous agentic evidence investigation on a requirement          |
| `GET`  | `/api/assessments/:id/gap-coach`           | Retrieve AI Gap Coach report for the current revision                   |
| `POST` | `/api/assessments/:id/gap-coach`           | Trigger on-demand generation/refresh of AI Gap Coach advice             |
| `POST` | `/api/profile-scan/start`                  | Start an asynchronous multi-repository GitHub profile auto-scan         |
| `GET`  | `/api/profile-scan/:id`                    | Poll progress, scanned repositories, best evidence, and suggested roles |
| `POST` | `/api/webhooks/github`                     | Ingest HMAC-SHA256 signed GitHub push webhook deliveries                |

---

## Verification & Testing

ProofLoop features an automated test suite containing **over 100 tests** covering core deterministic scoring, security, agentic tools, and database compatibility:

```bash
# Run all automated tests
npm test

# Run AI provider diagnostic check
npm run ai:check

# Run TypeScript type-checking
npx tsc --noEmit

# Run ESLint linting
npm run lint

# Build production Next.js bundle
npm run build
```

### Automated Test Coverage Matrix

| Test Suite                               | Validated Areas                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ai_evidence_investigator.test.mjs`      | Agentic tool context, file inspection (80-line cap), AST detection, classification (`supported`/`partial`/`unverified`), SSRF prevention, sensitive path redaction |
| `ai_gap_coach.test.mjs`                  | Schema validation, forbidden hiring prediction filters, rate limiting, revision-diff calculation, rule-based fallback                                              |
| `profile_scan.test.mjs`                  | GitHub username parsing, multi-format URLs, excerpt verification, role suggestion rules, profile assessment guardrails                                             |
| `developer_verification.test.mjs`        | Multi-dimensional scoring, practical tasks, contract preservation, adaptive reasoning evaluation, condition tracking                                               |
| `evidence_viewer_confidence.test.mjs`    | Verified implementations, line numbers, partial status confidence capping ($\le 45\%$), missing assertion detection                                                |
| `evaluation_history_comparison.test.mjs` | Immutable revision comparisons, overall score deltas, improved/regressed/unchanged categorization, retention                                                       |
| `postgres_migration.test.mjs`            | Migration SQL validity, schema migrations runner, connection pool configuration, transaction rollback                                                              |
| `webhook.test.mjs`                       | HMAC-SHA256 signature verification, replay prevention, duplicate `X-GitHub-Delivery` deduplication, push event ingestion                                           |
| `reassessment-service.test.mjs`          | Reassessment workflows, single vs profile assessment validation, failure isolation (old revisions untouched)                                                       |
| `proofloop_backend.test.mjs`             | Multi-commit pagination, real diff extraction, conventional commits immunity, contradictory comment detection                                                      |

---

## Database Migrations & CLI Scripts

ProofLoop uses sequential SQL migrations in `db/migrations/`:

- `001_create_tables.sql`: Base tables (`internships`, `assessments`, `revisions`, `tasks`, `activity_events`, `webhook_deliveries`).
- `002_create_indexes.sql`: Performance indexes on foreign keys, commit SHAs, and delivery IDs.
- `003_create_developer_verifications.sql`: Tables for practical code references, adaptive reasoning, and verification verdicts.
- `004_create_ai_gap_reports.sql`: Caching table for AI Gap Coach reports with unique revision + scoring version index.
- `005_create_profile_scans.sql`: Profile scan records and multi-repo evidence cache (`repo_scan_cache`).

### Available NPM Scripts

```bash
# Apply pending database migrations
npm run db:migrate

# Test Gemini AI API credentials and model configuration
npm run ai:check

# Import existing SQLite data to PostgreSQL (migration helper)
npm run db:import
```

---

## System Limitations & Disclosures

1. **Analysis Scope Boundaries**: ProofLoop analyzes up to a configured number of recent commits (default: 20) and non-binary source files. The declared `analysisScope` explicitly states what was analyzed and must not be interpreted as an exhaustive historical audit of a developer's entire career.
2. **Attribution Uncertainty**: Git commit author metadata can be spoofed or reflect co-authored commits. ProofLoop notes when commits are co-authored or authored by third-party bot accounts.
3. **AI Gap Coach is Strictly Advisory**: AI Gap Coach recommendations are directional learning suggestions. ProofLoop never alters mathematical scores based on AI advice, and explicitly forbids probabilistic hiring predictions.
4. **Stylistic Signals vs. Provenance**: AI-authorship heuristics detect stylistic variance and templating patterns, but **cannot definitively prove authorship**. Stylistic findings are auxiliary transparency signals and are never used to penalize skill scores.
5. **Grounded Confidence**: Confidence metrics represent observable sample size and test coverage depth—they are not a probabilistic guarantee of future job performance.
6. **Rate Limits**: Unauthenticated GitHub API calls are subject to GitHub's 60 req/hr limit; configuring `GITHUB_TOKEN` raises this limit to 5,000 req/hr.

---

## Made by

- **Sanskar Arnale** — [@SanskarArnale-07](https://github.com/SanskarArnale-07)
- **Srushti Patil** — [@Srushti07-del](https://github.com/Srushti07-del)
- **Sarthak Dhawas** — [@sarthak-dhawas](https://github.com/sarthak-dhawas)
- **Prathmesh Pawar** — [@PrathmeshVPawar](https://github.com/PrathmeshVPawar)

---

## License

This project is licensed under the MIT License.
