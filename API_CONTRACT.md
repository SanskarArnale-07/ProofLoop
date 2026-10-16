# ProofLoop API Contract Reference

This document specifies the complete REST API surface implemented by the ProofLoop backend, including request bodies, response schemas, status codes, and error formats.

---

## 1. Assessments API

### `GET /api/assessments`
Lists all technical skill assessments ordered by most recent update.

**Headers:**
`Accept: application/json`

**Response (`200 OK`):**
```json
{
  "success": true,
  "assessments": [
    {
      "id": "sample-assessment-stripe",
      "internship": {
        "id": "sample-stripe-backend",
        "title": "Backend Engineering Intern (Payments & Core Infra)",
        "company": "Stripe"
      },
      "repository": {
        "fullName": "alexchen/payment-orchestrator",
        "url": "https://github.com/alexchen/payment-orchestrator",
        "defaultBranch": "main",
        "latestCommitSha": "9e41b2c"
      },
      "currentRevisionNumber": 1,
      "status": "completed",
      "createdAt": "2026-10-14T10:15:00.000Z",
      "updatedAt": "2026-10-14T10:15:00.000Z"
    }
  ]
}
```

---

### `POST /api/assessments`
Initiates a new technical assessment against an authorized GitHub repository.

**Request Body:**
```json
{
  "internship": {
    "id": "job-stripe-2026",
    "title": "Backend Engineering Intern",
    "company": "Stripe",
    "sourceUrl": "https://stripe.com/jobs/backend-intern",
    "requirements": [
      {
        "id": "req-api",
        "category": "backend",
        "title": "REST API Development",
        "description": "Building validated HTTP endpoints",
        "importance": "required"
      }
    ],
    "createdAt": "2026-10-16T12:00:00.000Z"
  },
  "repoUrl": "https://github.com/alexchen/payment-orchestrator",
  "token": "optional_github_token"
}
```

**Response (`201 Created` or `200 OK`):**
```json
{
  "success": true,
  "assessmentId": "assess-m3x9-7a1b",
  "assessment": {
    "id": "assess-m3x9-7a1b",
    "internship": { "...": "..." },
    "repository": {
      "fullName": "alexchen/payment-orchestrator",
      "url": "https://github.com/alexchen/payment-orchestrator",
      "defaultBranch": "main",
      "latestCommitSha": "9e41b2c"
    },
    "currentRevisionNumber": 1,
    "status": "completed",
    "latestRevision": {
      "id": "rev-assess-m3x9-7a1b-1",
      "revisionNumber": 1,
      "commitSha": "9e41b2c",
      "scoringRuleVersion": "v2026.1",
      "demonstratedCount": 4,
      "partialCount": 1,
      "notDemonstratedCount": 2,
      "evidence": [
        {
          "requirementId": "req-api",
          "requirementTitle": "REST API Development",
          "status": "demonstrated",
          "evidenceType": "direct_implementation",
          "evidenceStrength": "strong",
          "filePath": "src/routes/payments.ts",
          "lineStart": 34,
          "lineEnd": 58,
          "confidence": 95,
          "scoreBreakdown": {
            "score": 85,
            "rank": 1,
            "ruleVersion": "v2026.1",
            "basePoints": 55,
            "testBonus": 15,
            "continuityBonus": 15,
            "factors": [
              "Verified concrete implementation pattern (+55 pts)",
              "Corroborated across 2 distinct commits (+15 pts)"
            ]
          }
        }
      ]
    },
    "tasks": [],
    "recentActivity": []
  }
}
```

**Error (`400 Bad Request`):**
```json
{
  "error": "Valid internship posting with requirements is required."
}
```

---

### `GET /api/assessments/[id]`
Retrieves full assessment state, latest revision, evidence items, gap tasks, and activity feed.

**Response (`200 OK`):**
```json
{
  "success": true,
  "assessment": {
    "id": "sample-assessment-stripe",
    "status": "completed",
    "currentRevisionNumber": 1,
    "latestRevision": { "...": "..." },
    "tasks": [ "...gap roadmap tasks..." ],
    "recentActivity": [ "...activity events..." ]
  }
}
```

**Error (`404 Not Found`):**
```json
{
  "error": "Assessment not found"
}
```

---

### `POST /api/assessments/[id]/reassess`
Triggers an immediate re-evaluation of the monitored repository code. If reassessment fails, existing historical records are preserved.

**Response (`200 OK`):**
```json
{
  "success": true,
  "assessment": {
    "id": "sample-assessment-stripe",
    "currentRevisionNumber": 2,
    "latestRevision": {
      "revisionNumber": 2,
      "triggerType": "manual"
    }
  }
}
```

**Failure Preservation Response (`500 Internal Server Error`):**
```json
{
  "error": "GitHub API access forbidden: rate limit exceeded",
  "message": "Reassessment failed. Previous assessment history was preserved."
}
```

---

### `GET /api/assessments/[id]/revisions` (and `GET /api/assessments/[id]/history`)
Retrieves the previous successful evaluations for a particular assessment in chronological order (oldest to newest by default), with pagination, overall score (0-100), requirement counts, and a separate pointer to the latest evaluation.

Also acts as an evaluation comparison endpoint if `from` and `to` query parameters are supplied.

**Query Parameters:**
- `order` (optional, string): Sort order by timestamp/number. Allowed values: `asc` (default, chronological oldest to newest for historical timeline display) or `desc` (newest first).
- `limit` (optional, integer): Maximum number of evaluations to return (default: 50, min: 1, max: 100).
- `offset` (optional, integer): Number of evaluations to skip for pagination (default: 0).
- `page` (optional, integer): Page number (1-indexed; alternate to `offset`).
- `includeEvidence` (optional, boolean): If `true`, includes full requirement-level evidence arrays for each evaluation (default: `false`).
- `from` (optional, integer or string): When comparing, the source evaluation revision number or stable ID.
- `to` (optional, integer or string): When comparing, the target evaluation revision number or stable ID.

**Response (`200 OK`):**
```json
{
  "success": true,
  "assessmentId": "sample-assessment-stripe",
  "total": 3,
  "limit": 50,
  "offset": 0,
  "hasMore": false,
  "latestEvaluation": {
    "id": "rev-sample-3",
    "evaluationNumber": 3,
    "revisionNumber": 3,
    "triggerType": "push",
    "commitSha": "c3d4e5f",
    "overallScore": 88,
    "totalPoints": 265,
    "scoringRuleVersion": "v2026.1",
    "demonstratedCount": 5,
    "partialCount": 1,
    "notDemonstratedCount": 1,
    "totalRequirements": 7,
    "isLatest": true,
    "createdAt": "2026-10-16T14:00:00.000Z"
  },
  "evaluations": [
    {
      "id": "rev-sample-1",
      "evaluationNumber": 1,
      "revisionNumber": 1,
      "triggerType": "initial",
      "commitSha": "9e41b2c",
      "overallScore": 57,
      "totalPoints": 170,
      "scoringRuleVersion": "v2026.1",
      "demonstratedCount": 4,
      "partialCount": 1,
      "notDemonstratedCount": 2,
      "totalRequirements": 7,
      "isLatest": false,
      "createdAt": "2026-10-14T10:15:00.000Z"
    },
    {
      "id": "rev-sample-2",
      "evaluationNumber": 2,
      "revisionNumber": 2,
      "triggerType": "push",
      "commitSha": "a2b3c4d",
      "overallScore": 71,
      "totalPoints": 215,
      "scoringRuleVersion": "v2026.1",
      "demonstratedCount": 5,
      "partialCount": 0,
      "notDemonstratedCount": 2,
      "totalRequirements": 7,
      "isLatest": false,
      "createdAt": "2026-10-15T11:30:00.000Z"
    },
    {
      "id": "rev-sample-3",
      "evaluationNumber": 3,
      "revisionNumber": 3,
      "triggerType": "push",
      "commitSha": "c3d4e5f",
      "overallScore": 88,
      "totalPoints": 265,
      "scoringRuleVersion": "v2026.1",
      "demonstratedCount": 5,
      "partialCount": 1,
      "notDemonstratedCount": 1,
      "totalRequirements": 7,
      "isLatest": true,
      "createdAt": "2026-10-16T14:00:00.000Z"
    }
  ],
  "revisions": [
    {
      "id": "rev-sample-1",
      "revisionNumber": 1,
      "commitSha": "9e41b2c",
      "demonstratedCount": 4,
      "partialCount": 1,
      "notDemonstratedCount": 2,
      "createdAt": "2026-10-14T10:15:00.000Z"
    }
  ]
}
```

**Error Responses:**
- `400 Bad Request`: Invalid assessment ID format or invalid pagination parameter.
- `404 Not Found`: Assessment does not exist.

---

### `GET /api/assessments/[id]/compare`
Compares two evaluations belonging to the same assessment. Accepts either evaluation revision numbers (e.g., `?from=1&to=2`) or stable database IDs (e.g., `?from=rev-xxx-1&to=rev-xxx-2`).

Outputs overall score deltas, requirement status and score changes, newly demonstrated skills, categorized requirements (`improved`, `regressed`, `unchanged`), concrete evidence modifications, and explicit notices for missing or unavailable comparison data.

**Query Parameters:**
- `from` (required, integer or string): Baseline evaluation revision number or stable ID.
- `to` (required, integer or string): Target evaluation revision number or stable ID.

**Example Request:**
`GET /api/assessments/sample-assessment-stripe/compare?from=1&to=2`

**Response (`200 OK`):**
```json
{
  "success": true,
  "comparison": {
    "assessmentId": "sample-assessment-stripe",
    "fromRevisionNumber": 1,
    "toRevisionNumber": 2,
    "fromRevisionId": "rev-sample-1",
    "toRevisionId": "rev-sample-2",
    "fromCommitSha": "9e41b2c",
    "toCommitSha": "a2b3c4d",
    "fromOverallScore": 57,
    "toOverallScore": 71,
    "overallScoreChange": 14,
    "newlyDemonstrated": ["req-testing"],
    "categorizedRequirements": {
      "improved": ["req-testing"],
      "regressed": [],
      "unchanged": ["req-api", "req-db", "req-auth"]
    },
    "statusChanges": [
      {
        "requirementId": "req-testing",
        "requirementTitle": "Automated Testing & Coverage",
        "beforeStatus": "not_demonstrated",
        "afterStatus": "demonstrated",
        "beforeScore": 0,
        "afterScore": 85,
        "changes": [
          "Status changed from not_demonstrated to demonstrated",
          "Score delta: +85 points",
          "Evidence file updated to tests/charge.test.ts"
        ]
      }
    ],
    "scoreChanges": [
      {
        "requirementId": "req-testing",
        "requirementTitle": "Automated Testing & Coverage",
        "beforeScore": 0,
        "afterScore": 85,
        "delta": 85,
        "reason": "Demonstrated implementation changes in commit a2b3c4d"
      }
    ],
    "evidenceChanges": [
      {
        "requirementId": "req-testing",
        "requirementTitle": "Automated Testing & Coverage",
        "beforeStatus": "not_demonstrated",
        "afterStatus": "demonstrated",
        "beforeEvidence": null,
        "afterEvidence": {
          "filePath": "tests/charge.test.ts",
          "lineStart": 10,
          "lineEnd": 45,
          "evidenceStrength": "strong",
          "evidenceType": "test_suite"
        },
        "description": "Evidence established in tests/charge.test.ts:10-45"
      }
    ],
    "unavailableData": [],
    "scoringRuleChanges": {
      "fromRuleVersion": "v2026.1",
      "toRuleVersion": "v2026.1",
      "isIdentical": true
    },
    "summary": "Comparison between Revision #1 (9e41b2c) and #2 (a2b3c4d): overall score changed by +14 (57 -> 71). 1 improved, 0 regressed, 3 unchanged. 1 newly demonstrated requirement(s)."
  }
}
```

**Handling Missing Data or Older Incomplete Evaluations:**
When comparing older evaluations where evidence or granular score breakdowns are unavailable, the API does **not** silently treat missing data as a regression. Instead, it maintains the requirement status and explicitly populates `unavailableData`:
```json
{
  "unavailableData": [
    {
      "requirementId": "req-legacy",
      "requirementTitle": "Legacy Skill",
      "issue": "Score breakdown unavailable in revision #1"
    }
  ]
}
```

**Error Responses:**
- `400 Bad Request`:
  - Missing `from` or `to` parameter (`"Both 'from' and 'to' query parameters are required for comparison."`).
  - Evaluations belong to different assessments (`"Cannot compare evaluations belonging to different assessments."`).
  - Invalid assessment ID or revision number format.
- `404 Not Found`:
  - Assessment not found (`"Assessment not found"`).
  - One or both evaluations not found (`"Baseline revision not found: 1"` or `"Target revision not found: 99"`).

---

### `GET /api/assessments/[id]/signals`
Retrieves AI-authorship signal transparency observations.

**Response (`200 OK`):**
```json
{
  "success": true,
  "assessmentId": "sample-assessment-stripe",
  "signals": {
    "overallAssessment": "insufficient_evidence",
    "findings": [],
    "summary": "No meaningful AI-authorship signals detected across analyzed commits and comments.",
    "limitationNotice": "Notice: Stylistic uniformity, comment verbosity, or template patterns cannot reliably establish authorship. Developers frequently employ standard linters, commit conventions (e.g., Conventional Commits), code generators, or IDE templates. Observed stylistic signals are auxiliary transparency heuristics and are NEVER used to deduct or penalize technical skill scores.",
    "analyzedArtifactsCount": {
      "commits": 12,
      "comments": 24,
      "docFiles": 2
    }
  }
}
```

---

## 2. GitHub Webhook API

### `POST /api/webhooks/github`
Receives GitHub `push` event payloads to update assessments in real-time.

**Headers:**
- `X-GitHub-Event: push`
- `X-GitHub-Delivery: [unique UUID]`
- `X-Hub-Signature-256: sha256=[hmac-hex-digest]`

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Reassessment completed successfully. Created revision #2.",
  "deliveryId": "del-8f2c-1a0e",
  "newRevisionNumber": 2,
  "promotedSkills": ["Automated Testing & Coverage"]
}
```

**Error (`401 Unauthorized`):**
```json
{
  "error": "Invalid webhook signature: HMAC SHA-256 check failed."
}
```

---

### `GET /api/webhooks/deliveries`
Lists the last 30 recorded webhook deliveries.

**Response (`200 OK`):**
```json
{
  "success": true,
  "deliveries": [
    {
      "id": "del-log-1730000000000",
      "deliveryId": "test-del-abc123",
      "eventType": "push",
      "repoFullName": "alexchen/payment-orchestrator",
      "commitSha": "a2b3c4d",
      "commitMessage": "test: add automated test suites",
      "signatureValid": true,
      "affectedRequirements": ["req-testing"],
      "createdAt": "2026-10-16T12:30:00.000Z"
    }
  ]
}
```

---

### `POST /api/webhooks/simulate`
Developer lab endpoint for dispatching simulated push events and observing live skill promotion.

**Request Body:**
```json
{
  "assessmentId": "sample-assessment-stripe",
  "commitMessage": "test(api): add automated integration test suite for payment endpoints",
  "author": "Alex Chen",
  "files": {
    "tests/payments.test.ts": "import { describe, it, expect } from 'vitest'; ..."
  },
  "simulateInvalidSignature": false
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "deliveryId": "test-del-m3x1",
  "commitSha": "f1a2b3c",
  "signatureValid": true,
  "previousRevisionNumber": 1,
  "newRevisionNumber": 2,
  "promotedSkills": ["Automated Testing & Coverage"],
  "affectedRequirements": ["req-testing"]
}
```

---

## 3. GitHub & Scraper Utility APIs

### `POST /api/github/repos`
Inspects and validates a GitHub repository URL.

**Request Body:**
```json
{
  "repoUrl": "https://github.com/alexchen/payment-orchestrator",
  "token": "optional_token"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "repo": {
    "name": "payment-orchestrator",
    "fullName": "alexchen/payment-orchestrator",
    "owner": "alexchen",
    "defaultBranch": "main",
    "isPrivate": false,
    "stars": 14,
    "latestCommitSha": "9e41b2c",
    "latestCommitMessage": "feat(api): add idempotency key handling"
  }
}
```

---

### `POST /api/internships/extract`
Scrapes public job listings or extracts skills from manual job descriptions with SSRF guards.

**Request Body:**
```json
{
  "url": "https://stripe.com/jobs/listing/backend-engineering-intern",
  "manualText": ""
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "posting": {
    "id": "job-m3x9a",
    "title": "Backend Engineering Intern",
    "company": "Stripe",
    "sourceUrl": "https://stripe.com/jobs/listing/backend-engineering-intern",
    "requirements": [
      {
        "id": "req-api",
        "category": "backend",
        "title": "REST API Development & Validation",
        "importance": "required"
      }
    ],
    "createdAt": "2026-10-16T12:00:00.000Z"
  }
}
```
