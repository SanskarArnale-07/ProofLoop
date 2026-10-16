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

### `GET /api/assessments/[id]/revisions`
Retrieves revision history or revision comparisons.

**Optional Query Parameters:**
- `from`: Start revision number (e.g., `?from=1&to=2`)
- `to`: Target revision number

**Response without query parameters (`200 OK`):**
```json
{
  "success": true,
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

---

### `GET /api/assessments/[id]/compare`
Compares two specific assessment revisions and generates an audit diff.

**Query Parameters:**
- `from` (required, integer)
- `to` (required, integer)

**Example:** `GET /api/assessments/sample-assessment-stripe/compare?from=1&to=2`

**Response (`200 OK`):**
```json
{
  "success": true,
  "comparison": {
    "assessmentId": "sample-assessment-stripe",
    "fromRevisionNumber": 1,
    "toRevisionNumber": 2,
    "fromCommitSha": "9e41b2c",
    "toCommitSha": "a2b3c4d",
    "addedEvidence": [],
    "removedEvidence": [],
    "modifiedEvidence": [
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
    "scoringRuleChanges": {
      "fromRuleVersion": "v2026.1",
      "toRuleVersion": "v2026.1",
      "isIdentical": true
    },
    "summary": "Comparison between Revision #1 (9e41b2c) and #2 (a2b3c4d): 1 score change(s), 0 requirement addition(s), 1 modified evidence item(s)."
  }
}
```

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
