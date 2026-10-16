# ProofLoop End-to-End Data Flow

This document details the complete end-to-end data pipelines in ProofLoop: from repository inspection and webhook reception through evidence extraction, deterministic scoring, atomic persistence, and client response.

---

## 1. Initial Assessment Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer / Candidate
    participant API as /api/assessments (POST)
    participant Scraper as Job Extractor (lib/scraper.ts)
    participant GH as GitHub API (lib/github.ts)
    participant Analyzer as Skill Analyzer (lib/analyzer.ts)
    participant Scoring as Scoring Engine (lib/scoring.ts)
    participant AI as AI Signal Analyzer (lib/ai-signals.ts)
    participant DB as SQLite DB (lib/db.ts)

    User->>API: Submit job posting URL + GitHub repo URL
    API->>Scraper: Validate URL safety (SSRF guard) & extract requirements
    Scraper-->>API: Structured InternshipPosting (req-api, req-db, etc.)
    API->>GH: Validate repository & fetch repository metadata
    GH-->>API: GitHubRepoInfo (defaultBranch, stars, latest commit)
    API->>GH: Fetch multi-commit history (pagination up to 25 commits)
    GH-->>API: CommitInfo[] (author, committer, timestamps, SHAs)
    API->>GH: Fetch file tree (recursive, excluding node_modules/secrets)
    GH-->>API: GitHubFileNode[] (file paths, modes, blobs)
    API->>Analyzer: evaluateRequirement(req, fileTree, commits, getFile)
    Analyzer->>GH: Inspect candidate code files (routes, schemas, tests)
    GH-->>Analyzer: Redacted file content (secrets stripped)
    Analyzer-->>API: Raw evidence candidates with code excerpts & line ranges
    API->>Scoring: rankEvidenceDeterministically(evidenceList, config)
    Scoring-->>API: Ranked evidence with points, tie-breaker, and grounded confidence
    API->>AI: analyzeAIAuthorshipSignals(commits, fileComments, diffs)
    AI-->>API: AISignalAnalysisResult (findings, cautious assessments, limitations)
    API->>DB: saveAssessment(assessment) [SQLite BEGIN ... COMMIT Transaction]
    DB-->>API: Persisted (Internship, Assessment, Revision #1, RoadmapTasks, Activities)
    API-->>User: HTTP 201 / 200 { success: true, assessmentId, assessment }
```

---

## 2. GitHub Push Webhook & Reassessment Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant GitHub as GitHub Webhook Engine
    participant Endpoint as /api/webhooks/github (POST)
    participant WebhookLib as Webhook Processor (lib/webhook.ts)
    participant DB as SQLite DB (lib/db.ts)
    participant Analyzer as Skill Analyzer (lib/analyzer.ts)
    participant Client as Frontend Dashboard

    GitHub->>Endpoint: HTTP POST push payload (X-Hub-Signature-256, X-GitHub-Delivery)
    Endpoint->>WebhookLib: processPushWebhook(rawBody, headers)
    WebhookLib->>WebhookLib: verifyWebhookSignature(rawBody, signature, secret)
    alt Signature Invalid
        WebhookLib-->>Endpoint: 401 Unauthorized (Invalid HMAC signature)
        Endpoint-->>GitHub: 401
    end
    WebhookLib->>DB: isWebhookDeliveryDuplicate(deliveryId)
    alt Duplicate Delivery
        WebhookLib-->>Endpoint: 200 OK (Skipping duplicate delivery)
        Endpoint-->>GitHub: 200
    end
    WebhookLib->>DB: findAssessmentByRepo(repoFullName)
    WebhookLib->>WebhookLib: identifyAffectedRequirements(filesChanged)
    WebhookLib->>Analyzer: Reassess repository against requirements with new files
    alt Reassessment Throws / Network Fails
        WebhookLib->>DB: recordAssessmentFailure(assessmentId, error)
        WebhookLib->>DB: recordWebhookDelivery(log)
        WebhookLib-->>Endpoint: 200/500 (Previous revision #N preserved intact)
    else Reassessment Succeeds
        WebhookLib->>WebhookLib: Compare with Revision #N to identify promoted skills
        WebhookLib->>DB: saveRevision(Revision #N+1) [SQLite Transaction]
        WebhookLib->>DB: addActivityEvent(skill_promoted / reassessment_completed)
        WebhookLib->>DB: recordWebhookDelivery(log)
        WebhookLib-->>Endpoint: 200 OK { success: true, newRevisionNumber, promotedSkills }
        Endpoint-->>GitHub: 200 OK
    end
    Client->>Endpoint: Poll or Refresh /api/assessments/[id]
    Endpoint-->>Client: Updated assessment with latest revision and activity feed
```

---

## 3. Revision Comparison & Audit Trail Pipeline

1. **Request:** `GET /api/assessments/[id]/revisions/compare?from=1&to=2` (or `/api/assessments/[id]/compare?from=1&to=2`).
2. **Lookup:** `getRevisionByNumber(assessmentId, 1)` and `getRevisionByNumber(assessmentId, 2)`.
3. **Diff Analysis:**
   - **Added Evidence:** Requirements evaluated in Rev 2 that were not in Rev 1.
   - **Removed Evidence:** Requirements tracked in Rev 1 absent in Rev 2.
   - **Modified Evidence:** Requirements whose status (`partial` -> `demonstrated`), code file, or score changed.
   - **Score Delta:** Point variance per skill with clear attribution (code change vs scoring rule version update).
   - **Rule Version:** Compares `scoringRuleVersion` between revisions.
4. **Response:** Structured `RevisionComparison` object returned to client.

---

## 4. Deterministic Scoring Logic (`src/lib/scoring.ts`)

Every skill score is computed deterministically from versioned weights (`v2026.1`):

$$\text{Total Score} = \min(100, \text{BasePoints} + \text{TestBonus} + \text{ContinuityBonus})$$

- **Base Points:**
  - Strong implementation (active route handler, schema, component): **55 pts**
  - Moderate configuration (scaffolding, incomplete handler): **35 pts**
  - Weak dependency / documentation: **15 pts**
  - None: **0 pts**
- **Test Verification Bonus:**
  - Active test suite with assertions (`expect()`, `assert.`): **+25 pts**
  - Test files without verified assertion statements: **+10 pts**
- **Continuity Bonus:**
  - Corroborated across 3+ commits: **+20 pts**
  - Corroborated across 2 distinct commits: **+15 pts**
  - Single commit: **+5 pts**
- **Status Classification:**
  - $\text{Score} \ge 70 \implies \mathbf{demonstrated}$
  - $30 \le \text{Score} < 70 \implies \mathbf{partial}$
  - $\text{Score} < 30 \implies \mathbf{not\_demonstrated}$
- **Tie-Breaking Hierarchy:**
  1. Primary: Total Score (descending)
  2. Secondary: Test Verification Bonus (descending)
  3. Tertiary: Base Implementation Points (descending)
  4. Quaternary: Multi-commit Continuity Bonus (descending)
  5. Quinquennial: Requirement Title Alphanumeric (ascending)
