# ProofLoop — Development Reference

> **AI Career Coach · Problem W-PS-2 · Agentic AI Hackathon**
> *Don't just claim it. Prove it.*

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Repository Structure](#repository-structure)
4. [Environment Setup](#environment-setup)
5. [Running Locally](#running-locally)
6. [Database](#database)
7. [API Routes](#api-routes)
8. [Core Libraries](#core-libraries)
9. [Frontend Architecture](#frontend-architecture)
10. [Testing](#testing)
11. [Known Issues and Limitations](#known-issues-and-limitations)

---

## Project Overview

ProofLoop is a code-evidence matching system that:

1. Accepts a real internship/job posting URL (or pasted text).
2. Extracts structured engineering requirements from the posting via server-side HTML scraping.
3. Fetches the candidate's GitHub repository file tree using the GitHub REST API.
4. Runs a deterministic static analysis engine over the repository, producing `demonstrated / partial / not_demonstrated` evidence for each requirement, with exact file path and line-number citations.
5. Persists the assessment to a local SQLite database.
6. Accepts GitHub Push Webhook events (`POST /api/webhooks/github`) to automatically trigger re-assessment when the candidate pushes new commits.
7. Exposes all results through a dashboard UI.

There is **no LLM dependency** at runtime. The evidence extraction engine (`src/lib/analyzer.ts`) is fully deterministic. Optional `OPENAI_API_KEY` / `GEMINI_API_KEY` variables are present in `.env.example` for future semantic enhancement but are not read by any current code path.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.4.2 |
| Bundler | Turbopack | bundled with Next.js |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS v4 | ^4 (via `@tailwindcss/turbopack`) |
| Database | Node.js built-in `node:sqlite` (DatabaseSync) | Node 22.5+ |
| Web Scraping | Cheerio | ^1.2.0 |
| UI Icons | Lucide React | ^1.58.0 |
| Testing | Node.js built-in `node:test` | (no extra deps) |
| React | React 19 | 19.3.0 |

> **Important:** The project uses `node:sqlite` DatabaseSync, which requires **Node.js >= 22.5.0**. Earlier Node versions will fail.

---

## Repository Structure

```
AI-Career-Coach/
├── data/                          # SQLite DB file (auto-created at runtime)
│   └── proofloop.db
├── public/                        # Static assets
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout — loads Google Fonts via <link>
│   │   ├── globals.css            # Global CSS + Tailwind import + scrapbook design tokens
│   │   ├── page.tsx               # Landing page (scrapbook editorial redesign, 1179 lines)
│   │   ├── onboard/
│   │   │   └── page.tsx           # Multi-step onboarding wizard
│   │   ├── dashboard/
│   │   │   ├── page.tsx           # Dashboard home — assessment list + sample mode
│   │   │   ├── assessments/       # Assessment detail: evidence table, skill cards
│   │   │   ├── evidence/          # Raw evidence drill-down with code excerpts
│   │   │   ├── history/           # Revision history timeline
│   │   │   ├── roadmap/           # Gap-to-Proof roadmap task list
│   │   │   └── webhook-lab/       # Interactive webhook test lab
│   │   └── api/
│   │       ├── assessments/
│   │       │   ├── route.ts       # GET (list), POST (create new assessment)
│   │       │   └── [id]/route.ts  # GET (single), DELETE
│   │       ├── internships/
│   │       │   └── extract/route.ts  # POST — scrape and parse internship URL
│   │       ├── github/
│   │       │   └── repos/route.ts    # GET — list candidate repos
│   │       └── webhooks/
│   │           ├── github/route.ts   # POST — receive GitHub push webhooks
│   │           ├── deliveries/route.ts # GET — webhook delivery history
│   │           └── simulate/route.ts  # POST — test webhook without real GitHub event
│   ├── components/
│   │   ├── scrapbook/
│   │   │   └── Doodles.tsx        # SVG hand-drawn illustration primitives
│   │   ├── Header.tsx
│   │   ├── Navigation.tsx
│   │   ├── ActivityFeed.tsx
│   │   ├── AnalysisTransition.tsx
│   │   ├── CodeInspector.tsx
│   │   ├── GithubIcon.tsx
│   │   ├── RoadmapCard.tsx
│   │   ├── SkillCard.tsx
│   │   └── WebhookSimulatorModal.tsx
│   ├── lib/
│   │   ├── types.ts               # All shared TypeScript interfaces
│   │   ├── db.ts                  # SQLite access layer (schema + CRUD helpers)
│   │   ├── github.ts              # GitHub REST API helpers
│   │   ├── scraper.ts             # Cheerio-based job posting scraper + SSRF guard
│   │   ├── analyzer.ts            # Core evidence engine (deterministic, no LLM)
│   │   ├── webhook.ts             # GitHub Push event processor
│   │   └── sample-data.ts         # Seed data for sample/demo mode
│   └── types/
├── tests/
│   ├── proofloop.test.mjs         # Node:test suite
│   └── test_simulation.mjs
├── .env.example
├── next.config.ts
├── package.json
├── tsconfig.json
└── DEVELOPMENT.md
```

---

## Environment Setup

### Prerequisites

- **Node.js >= 22.5.0** (required for `node:sqlite` DatabaseSync)
- **npm >= 10**

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Recommended | Personal Access Token. Without it: 60 req/hr. With it: 5,000 req/hr. Required for private repos. |
| `GITHUB_WEBHOOK_SECRET` | Optional | Shared secret for HMAC-SHA256 webhook signature verification. If absent, signature check is skipped. |
| `OPENAI_API_KEY` | Not used | Reserved for future semantic analysis. No current code reads this. |
| `GEMINI_API_KEY` | Not used | Reserved for future semantic analysis. No current code reads this. |

---

## Running Locally

```bash
# Development server (Turbopack)
npm run dev         # → http://localhost:3000

# Production build
npm run build
npm run start

# Lint
npm run lint

# Tests (Node built-in runner)
npm test
```

The database (`data/proofloop.db`) is auto-created on first request. No migration step required.

---

## Database

### Engine

`node:sqlite` DatabaseSync — synchronous, file-backed SQLite bundled with Node.js >= 22.5. No external DB process needed.

- **WAL mode** enabled (`PRAGMA journal_mode = WAL`)
- **Foreign keys** enforced (`PRAGMA foreign_keys = ON`)
- File: `data/proofloop.db`

### Schema (6 tables)

```sql
-- Job posting extracted from URL or text
CREATE TABLE internships (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  source_url TEXT NOT NULL,
  raw_text TEXT,
  requirements_json TEXT NOT NULL,  -- JSON: InternshipRequirement[]
  created_at TEXT NOT NULL
);

-- One assessment per (internship x repository)
CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  internship_id TEXT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  latest_commit_sha TEXT NOT NULL,
  current_revision_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,  -- idle | extracting | analyzing | completed | failed
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Immutable audit snapshots; one per commit assessed
CREATE TABLE revisions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  commit_message TEXT NOT NULL,
  trigger_type TEXT NOT NULL,  -- initial | webhook | manual
  evidence_json TEXT NOT NULL,  -- JSON: RepositoryEvidence[]
  demonstrated_count INTEGER NOT NULL,
  partial_count INTEGER NOT NULL,
  not_demonstrated_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Gap-to-proof roadmap tasks
CREATE TABLE roadmap_tasks (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  task_data_json TEXT NOT NULL,  -- JSON: GapTask
  status TEXT NOT NULL  -- pending | in_progress | verified
);

-- Activity log (timeline events)
CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  commit_sha TEXT,
  commit_message TEXT,
  affected_skills TEXT,  -- JSON: string[]
  timestamp TEXT NOT NULL,
  metadata TEXT          -- JSON: Record<string, unknown>
);

-- Idempotency log for webhook events
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  delivery_id TEXT UNIQUE NOT NULL,  -- X-GitHub-Delivery header value
  event_type TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  commit_message TEXT NOT NULL,
  author TEXT NOT NULL,
  files_changed TEXT NOT NULL,       -- JSON: string[]
  signature_valid INTEGER NOT NULL,  -- 0 or 1
  affected_requirements TEXT NOT NULL, -- JSON: string[]
  created_at TEXT NOT NULL
);
```

### Key DB Functions in `src/lib/db.ts`

| Function | Description |
|---|---|
| `getDatabase()` | Singleton — creates DB + schema on first call |
| `saveAssessment(assessment)` | Upserts assessment + all related rows |
| `getAssessment(id)` | Returns full hydrated Assessment object |
| `listAssessments()` | Returns all assessments with latest revision |
| `findAssessmentByRepo(fullName)` | Used by webhook handler to find matching assessment |
| `saveRevision(...)` | Appends new immutable revision, updates parent assessment |
| `isWebhookDeliveryDuplicate(deliveryId)` | Idempotency check — returns true if already processed |
| `recordWebhookDelivery(log)` | Persists webhook event metadata |
| `ensureSampleDataSeeded()` | Seeds sample Stripe assessment on first GET /api/assessments |

---

## API Routes

All routes are Next.js App Router Route Handlers.

### POST /api/internships/extract

Scrapes and parses a job posting URL.

Request body:
```json
{ "url": "https://stripe.com/jobs/listing/backend-engineering-intern" }
```

Response: InternshipPosting with structured `requirements[]`.

Notes:
- Protected by SSRF guard (rejects localhost, private IPs, non-HTTP protocols)
- Falls back to keyword extraction if structured HTML selectors fail
- 12-second fetch timeout via AbortSignal

---

### POST /api/assessments

Creates a new assessment (fetches repo + analyzes evidence).

Request body:
```json
{
  "internship": { /* InternshipPosting */ },
  "repoUrl": "https://github.com/owner/repo",
  "token": "ghp_optional",
  "options": { "mockFiles": { "path/to/file": "content" } }
}
```

Response: Full Assessment object.

Notes:
- Calls fetchRepoDetails -> fetchRepoTree -> analyzeRepositoryAgainstRequirements
- mockFiles enables offline/sample mode bypassing GitHub API

---

### GET /api/assessments

Returns all assessments. Seeds sample data if DB is empty.

---

### GET /api/assessments/[id]

Returns a single assessment by ID.

---

### GET /api/github/repos

Returns the authenticated user's public repositories.

Query param: `?token=ghp_...` (optional)

---

### POST /api/webhooks/github

Receives GitHub push events.

Security: Verifies X-Hub-Signature-256 HMAC SHA-256 with GITHUB_WEBHOOK_SECRET. Skips if no secret.

Idempotency: Deduplicates by X-GitHub-Delivery header.

Flow: Signature verify -> duplicate check -> find assessment -> re-analyze -> save revision -> log activity.

---

### POST /api/webhooks/simulate

Accepts a simulated push payload (no real GitHub event required). Used by Webhook Lab.

---

### GET /api/webhooks/deliveries

Returns webhook delivery history.

---

## Core Libraries

### src/lib/analyzer.ts — Evidence Engine

The most critical module. Performs deterministic static analysis of a GitHub repository file tree plus selective file content fetching.

Per-requirement evaluators:

| Requirement ID | Detection Strategy |
|---|---|
| req-api | File path regex for routes, controllers, endpoints, api/ directories |
| req-idempotency | Content scan for idempotency keys, UUID patterns, deduplication logic |
| req-db | Path scan for SQL files, migration dirs, ORM model files |
| req-auth | Content scan for JWT, OAuth, session tokens, auth middleware |
| req-testing | Path scan for test/spec/__tests__ dirs; content for describe/it/assert |
| req-error-handling | Content scan for try/catch, error middleware, HTTP status patterns |
| req-git-workflow | .github/workflows presence, branch naming patterns |
| req-devops | Dockerfile, docker-compose, CI workflow file presence |

Output per requirement:
```ts
{
  requirementId: string;
  status: 'demonstrated' | 'partial' | 'not_demonstrated';
  explanation: string;   // human-readable finding
  filePath?: string;     // e.g. "src/routes/payments.ts"
  lineStart?: number;
  lineEnd?: number;
  codeExcerpt?: string;
  confidence: number;    // 0–100
}
```

Gap Task generation: For any non-demonstrated requirement, createGapTask() generates a structured roadmap entry with acceptanceCriteria[], suggestedFiles[], and projectBrief.

---

### src/lib/scraper.ts — Job Posting Scraper

- Cheerio-based HTML extraction (no headless browser — static fetch only)
- SSRF protection: validates URL against loopback/private range blocklist
- Heuristic parsing: structured CSS selectors -> paragraph extraction -> keyword detection
- 12-second AbortSignal.timeout
- Maps extracted text to typed InternshipRequirement[] with category and importance fields

---

### src/lib/github.ts — GitHub API Client

| Function | Description |
|---|---|
| parseGitHubRepoUrl(input) | Accepts full URL, github.com/o/r, or o/r shorthand |
| fetchRepoDetails(owner, repo, token?) | GET /repos/{owner}/{repo} — repo metadata + latest commit SHA |
| fetchRepoTree(owner, repo, branch, token?) | GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1 |
| fetchFileContent(owner, repo, path, branch, token?) | GET /repos/{owner}/{repo}/contents/{path} — base64 decoded |
| listUserRepos(token?) | GET /user/repos — sorted by push date |

Rate limit detection: parses x-ratelimit-remaining: 0 header and surfaces helpful error.

---

### src/lib/webhook.ts — Push Webhook Processor

**verifyWebhookSignature(rawBody, header, secret)**
- Uses crypto.timingSafeEqual to prevent timing attacks
- Returns true if no secret configured (permissive demo mode)

**processPushWebhook(rawBody, headers, options?)**
1. Verify HMAC signature
2. Parse JSON payload (repository.full_name, after SHA, head_commit, commits[].modified)
3. isWebhookDeliveryDuplicate -> early return if already processed
4. findAssessmentByRepo -> locate existing assessment
5. fetchRepoTree + analyzeRepositoryAgainstRequirements -> new evidence
6. saveRevision with triggerType: 'webhook'
7. addActivityEvent with skill_promoted / skill_unchanged diff

---

### src/lib/sample-data.ts — Demo Mode Seed

Pre-built Assessment for fictional "Alex Chen" applying to a Stripe backend internship. Seeded on first GET /api/assessments if DB is empty. ID: `sample-assessment-stripe`.

---

## Frontend Architecture

### Landing Page (src/app/page.tsx)

1179-line Client Component with 5 narrative chapters:

| Anchor ID | Section | Design Notes |
|---|---|---|
| #cover | Notebook Cover | Cream paper bg, spiral rings, washi tape, pencil underline SVG |
| #resume | Resume Chapter | Paper card with skill annotations, margin callout column |
| #evidence | GitHub Evidence | Dark scrapbook canvas, tilted cards with rotate-2 hover:rotate-0 |
| #matching | Requirements Grid | SkillCard components, chapter labels, match percentage badges |
| #cta | Prove Fit CTA | Cream paper card, primary and secondary CTA buttons |

State: webhookSimulated, isSimulating, activeChapter (scroll-tracked via IntersectionObserver-equivalent scroll listener).

### Design Tokens (globals.css)

```css
--scrapbook-dark: #30251F;       /* Page dark background */
--scrapbook-paper: #F5F0E5;      /* Cream notebook paper */
--scrapbook-red: #DD5946;        /* ProofLoop red accent */
--scrapbook-pencil: #71695E;     /* Handwritten annotation color */
```

CSS utility classes: .bg-cream-paper, .bg-cream-ruled, .bg-dark-canvas, .washi-tape, .paper-shadow-lg, .font-editorial, .font-handwriting, .font-mono-code

### Fonts

Loaded via layout.tsx link tags (not CSS @import to avoid ordering errors):
- **Fraunces** — editorial serif headline font
- **Caveat** — handwritten annotation font
- **JetBrains Mono** — code and monospace label font
- **Newsreader** — secondary editorial body font

### Scrapbook SVG Doodles (src/components/scrapbook/Doodles.tsx)

| Component | Description |
|---|---|
| PencilArrow | Curved red pencil arrow |
| PencilArrowUpLeft | Upward-left curved variant |
| PencilCircle | Oval pencil highlight circle |
| PencilUnderline | Double-stroke underline scribble |
| BrassPaperclip | Metallic brass paperclip SVG with linear gradient |
| RubberStamp | Dashed-border stamp badge (accepts rotate prop) |
| NotebookSpiralRings | Repeating spiral binding on left spine |
| WashiTape | Translucent tape strip (cream / coral / kraft colors, rotatable) |

---

## Testing

### Test Suite: tests/proofloop.test.mjs

Uses Node.js built-in node:test — no external test runner required.

```bash
npm test
# runs: node --test tests/*.test.mjs
```

Coverage:

| Suite | Tests |
|---|---|
| Webhook Signature Verification | Valid HMAC accepted; tampered payload rejected; missing signature rejected |
| SSRF Protection | Localhost / private IPs / non-HTTP protocols rejected; public URLs accepted |
| GitHub URL Parser | All supported input formats; malformed URL returns null |
| Webhook Impact Mapping | File path to affected requirement ID detection |

Gap: isWebhookDeliveryDuplicate in db.ts has no direct unit test — only implicit integration coverage via webhook processing.

---

## Known Issues and Limitations

| Area | Issue | Severity |
|---|---|---|
| LLM Integration | OPENAI_API_KEY and GEMINI_API_KEY documented but no code reads them. Analyzer is 100% deterministic. | Low — by design |
| GitHub Rate Limits | Without GITHUB_TOKEN: only 60 unauthenticated req/hr. Large trees or frequent assessments hit this quickly. | Medium |
| Private Repositories | Require GITHUB_TOKEN with repo scope. Error surfaces correctly. | Expected behavior |
| Idempotency Unit Tests | isWebhookDeliveryDuplicate has no unit test. | Low |
| No Authentication | No user auth/sessions. All DB assessments visible to anyone with server access. | Low for hackathon |
| SQLite Concurrency | DatabaseSync is synchronous. Concurrent Next.js route execution may cause write contention. WAL mode mitigates reads. | Low for single-user |
| Scraper Reliability | SPA job boards requiring JavaScript will return incomplete text — no headless browser support. | Medium |
