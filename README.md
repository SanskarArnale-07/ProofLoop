# ProofLoop — Evidence-Based AI Career Coach

ProofLoop is an **evidence-based technical career coach and skill assessment platform**. Rather than functioning as a generic conversational chatbot that guesses someone's developer competency based on resumes or text prompts, ProofLoop verifies skills directly against **actual GitHub repository activity, multi-commit history, diffs, test implementations, and code quality evidence**.

ProofLoop provides **traceable evidence**, **explainable deterministic rankings**, **historical revision tracking**, and **transparent limitations**.

---

## Key Highlights

- **Implementation Over Declaration**: A dependency declaration alone (e.g., `"react"` or `"pydantic"`) is weak evidence. ProofLoop rewards actual implementation patterns, state management, error handling, and test coverage.
- **Traceable Code Findings**: Every detected skill references real repository paths, commit SHAs, line-level diff additions/modifications, and active test assertions.
- **Deterministic & Auditable Scoring**: Skill rankings are driven by an explicit, versioned mathematical engine (`v2026.1`) with deterministic tie-breaking. Scores are reproducible and explainable—no opaque generative LLM hallucinating points.
- **Non-Penalizing AI Heuristics**: Auxiliary AI-authorship signal detection analyzes commit message variance, templated comments, and code-comment drift. Crucially, conventional commits (`feat:`, `fix:`) and polished comments are **never** treated as proof of AI generation, and signals **never** deduct skill points.
- **Append-Only Revision History**: Reassessments and webhook updates create versioned audit records. Failed reassessments preserve previous successful revisions intact with zero data loss.
- **Enterprise-Grade Ingestion & Security**: Hardened HMAC-SHA256 signature verification, idempotent delivery deduplication, sensitive credential redaction, SSRF prevention, and rate-limit backoff.

---

## Architecture & Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router, Server Components & Route Handlers) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/) |
| **Database** | Embedded [SQLite WAL](https://sqlite.org/) via Node.js 24 native `node:sqlite` (`DatabaseSync`) |
| **API Client** | Native Fetch with bounded retries, exponential backoff, and GitHub REST API integration |
| **Testing** | Node.js native test runner (`node --test`) with automated 22-suite test suite |

---

## Core Features

### 1. Multi-Commit & Real Diff Analysis
- Traverses commit history with pagination support rather than inspecting only `HEAD`.
- Inspects unified patch diffs to isolate actual line additions, modifications, and deletions.
- Distinguishes between repository ownership and author/committer attribution.
- Declares explicit `analysisScope` (commit count, file count, commit date range, omitted sensitive files) so evaluations never overstate what was inspected.

### 2. Evidence-Based Skill Detection
- **Dependency Detection**: Catches declared packages across `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, and `Cargo.toml`.
- **Implementation Verification**: Detects architectural constructs (e.g., custom React hooks, database repositories, API route handlers, concurrent pipelines).
- **Test Evidence**: Verifies unit/integration test suites and active assertions (`expect`, `assert`, `test`, `it`).
- **Traceable Attribution**: Binds findings to specific file paths, commit hashes, and implementation patterns.

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

### 4. AI-Authorship Signal Analysis (Auxiliary & Non-Penalizing)
- Analyzes commit message repetition, templated boilerplate, and comment-to-code contradictions.
- **Strict Guardrails**:
  - Conventional commit prefixes (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`) are classified as standard software engineering practice, **not** AI generation.
  - Well-written, grammatical, or verbose comments are classified as professional documentation, **not** AI generation.
  - AI signals are strictly auxiliary transparency disclosures and **never alter skill scores or rankings**.

### 5. Append-Only Audit Trail & Historical Comparisons
- Preserves every assessment as an immutable revision (`assessment_revisions`).
- Compares revisions (`/api/assessments/:id/compare?from=1&to=2`) to surface:
  - Skill score deltas and tier changes.
  - Newly added and retired skills.
  - Added or removed commit and implementation evidence.
  - Scoring rule version transitions.
- Failed reassessments record the error reason while leaving prior successful revisions untouched.

### 6. Webhook Security & Idempotency
- **HMAC-SHA256**: Validates GitHub webhook payload signatures using `X-Hub-Signature-256` and timing-safe comparisons.
- **Delivery Deduplication**: Tracks `X-GitHub-Delivery` IDs in an idempotent ledger. Duplicate deliveries return cached `200 OK` responses without triggering re-analysis or duplicate revisions.
- **Multi-Commit Push Ingestion**: Ingests up to 20 pushed commits per payload, analyzing diffs and updating assessments automatically.

---

## Getting Started

### Prerequisites
- **Node.js**: `v24.0.0` or higher (required for native `node:sqlite` DatabaseSync support)
- **npm**: `v10.0.0` or higher
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
   Copy `.env.example` to `.env.local` (or `.env`):
   ```bash
   cp .env.example .env.local
   ```
   Configure the following variables:
   ```env
   # GitHub Integration
   GITHUB_PAT=your_github_personal_access_token_here
   GITHUB_WEBHOOK_SECRET=your_webhook_hmac_secret_here

   # Database (defaults to data/proofloop.db)
   DATABASE_PATH=data/proofloop.db

   # App Configuration
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_DEMO_MODE=true
   ```

4. **Initialize Database & Seed Data**:
   The SQLite database is initialized automatically on first API or test request with WAL journaling enabled.
   ```bash
   npm run seed
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification & Testing

ProofLoop includes an automated test suite covering all 15 core architectural areas:

```bash
# Run all automated backend tests
npm test

# Run TypeScript type-checking
npx tsc --noEmit

# Run Next.js ESLint verification
npm run lint

# Build production bundle
npm run build
```

### Automated Test Coverage Matrix

| Test Suite | Validated Behaviors |
|---|---|
| **1. Multi-Commit Pagination** | Multi-page commit retrieval, author metadata, rate-limit headers |
| **2. Real Diff Extraction** | Patch additions, modifications, deletions, file status inspection |
| **3. Implementation vs Dependency** | Implementation patterns and test assertions score higher than dependencies alone |
| **4. Deterministic Ranking** | Identical inputs produce identical rankings; deterministic tie-breaking |
| **5. Webhook Idempotency** | Duplicate `X-GitHub-Delivery` deliveries are deduplicated |
| **6. Conventional Commits** | `feat:`, `fix:`, `chore:` are never treated as AI-generated |
| **7. Generic & Polished Comments** | Professional, grammatical comments are never treated as AI-generated |
| **8. Contradictory Comments** | Documentation claiming behavior opposite to code is flagged cautiously |
| **9. Missing Files & Inaccessible Repos** | Graceful error handling for missing branches, 404s, and empty repositories |
| **10. Failed Reassessments** | Previous successful assessment revisions remain intact on failure |
| **11. Revision Comparisons** | Accurate detection of added/removed skills, score deltas, and evidence changes |
| **12. Webhook Signature Verification** | Valid HMAC-SHA256 accepted; altered/tampered payloads rejected |
| **13. Repository Access Controls** | Tokenless/unauthorized access safely handled without exceptions |
| **14. Schema & Data Compatibility** | Upgrades legacy records without data loss |
| **15. API Contract Compatibility** | All REST endpoint schemas match expected request/response contracts |

---

## Documentation Index

Detailed architectural and integration guides are available in the repository:

- 📘 [DEVELOPMENT.md](file:///c:/Users/Sanskar%20Arnale/OneDrive/Desktop/careercoach/DEVELOPMENT.md) — Local setup, environment variable reference, database schema details, and scripts.
- 🔄 [FLOW.md](file:///c:/Users/Sanskar%20Arnale/OneDrive/Desktop/careercoach/FLOW.md) — Comprehensive end-to-end data flow diagrams from GitHub event ingestion to deterministic scoring and client response.
- 🔌 [API_CONTRACT.md](file:///c:/Users/Sanskar%20Arnale/OneDrive/Desktop/careercoach/API_CONTRACT.md) — Complete REST API specifications with request/response schemas, error handling, and parameter definitions.

---

## System Limitations & Disclosures

1. **Analysis Scope Boundaries**: ProofLoop analyzes up to a configured number of recent commits (default: 20) and non-binary source files. The declared `analysisScope` explicitly states what was analyzed and must not be interpreted as an exhaustive historical audit of a developer's entire career.
2. **Attribution Uncertainty**: Git commit author metadata can be spoofed or reflect co-authored commits. ProofLoop notes when commits are co-authored or authored by third-party bot accounts.
3. **Stylistic Signals vs. Provenance**: AI-authorship heuristics detect stylistic variance and templating patterns, but **cannot definitively prove authorship**. Stylistic findings are auxiliary transparency signals and are never used to penalize skill scores.
4. **Grounded Confidence**: Confidence metrics represent observable sample size and test coverage depth—they are not a probabilistic guarantee of future job performance.
5. **Rate Limits**: Unauthenticated GitHub API calls are subject to GitHub's 60 req/hr limit; configuring `GITHUB_PAT` raises this limit to 5,000 req/hr.

---

## License

This project is licensed under the MIT License.