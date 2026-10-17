import { Assessment, InternshipPosting } from './types';
import { saveAssessment, getAssessment } from './db';
import { SCORING_RULE_VERSION } from './scoring';
import { AI_SIGNAL_DISCLAIMER } from './ai-signals';

export const SAMPLE_INTERNSHIP: InternshipPosting = {
  id: 'sample-stripe-backend',
  title: 'Backend Engineering Intern (Payments & Core Infra)',
  company: 'Stripe',
  location: 'San Francisco, CA / Remote',
  sourceUrl: 'https://stripe.com/jobs/listing/backend-engineering-intern',
  rawText: `
    As a Backend Engineering Intern at Stripe, you will work alongside experienced engineers to design, build, and deploy mission-critical systems that move billions of dollars worldwide.
    Requirements:
    - Solid understanding of API development (REST, HTTP methods, status codes, payload serialization).
    - Working knowledge of relational databases (PostgreSQL/SQL), transaction semantics, and index optimization.
    - Strong proficiency in modern statically typed languages (TypeScript, Go, Java, or Rust).
    - Experience writing comprehensive automated tests (unit, integration, regression testing).
    - Familiarity with containerization (Docker) and Continuous Integration (GitHub Actions).
    - Clear communication and disciplined git version control habits.
  `,
  requirements: [
    {
      id: 'req-api',
      category: 'backend',
      title: 'REST API Development & Validation',
      description: 'Designing, building, and maintaining robust backend endpoints with input validation.',
      importance: 'required'
    },
    {
      id: 'req-db',
      category: 'database',
      title: 'Database Schema Design & SQL Queries',
      description: 'Relational database schema design, ACID transactions, and query optimization.',
      importance: 'required'
    },
    {
      id: 'req-typescript',
      category: 'core',
      title: 'TypeScript / Strict Static Typing',
      description: 'Writing statically typed code with strict type contracts and compile-time safety.',
      importance: 'required'
    },
    {
      id: 'req-testing',
      category: 'testing',
      title: 'Automated Testing & Coverage',
      description: 'Writing automated test suites (unit, integration) with verifiable assertions.',
      importance: 'required'
    },
    {
      id: 'req-devops',
      category: 'devops',
      title: 'Docker & Containerization',
      description: 'Containerizing services and isolating dependencies with multi-stage Docker builds.',
      importance: 'preferred'
    },
    {
      id: 'req-cicd',
      category: 'devops',
      title: 'CI/CD Pipelines & Automation',
      description: 'Configuring automated build and test validation via GitHub Actions workflows.',
      importance: 'preferred'
    },
    {
      id: 'req-git',
      category: 'general',
      title: 'Git Version Control & Documentation',
      description: 'Maintaining clear git commit hygiene, branching discipline, and project documentation.',
      importance: 'required'
    }
  ],
  createdAt: '2026-10-14T08:00:00.000Z'
};

const sampleScope = {
  commitsAnalyzed: 12,
  totalCommitsChecked: 12,
  filesInspected: 18,
  branch: 'main',
  truncated: false,
  scopeDescription: 'Inspected 18 repository files and 12 commits on branch main.'
};

const sampleAiSignals = {
  overallAssessment: 'insufficient_evidence' as const,
  findings: [],
  summary: 'No meaningful AI-authorship signals detected across analyzed commits and comments.',
  limitationNotice: AI_SIGNAL_DISCLAIMER,
  analyzedArtifactsCount: {
    commits: 12,
    comments: 24,
    docFiles: 2
  }
};

export const SAMPLE_ASSESSMENT: Assessment = {
  id: 'sample-assessment-stripe',
  internship: SAMPLE_INTERNSHIP,
  repository: {
    fullName: 'alexchen/payment-orchestrator',
    url: 'https://github.com/alexchen/payment-orchestrator',
    defaultBranch: 'main',
    isPrivate: false,
    language: 'TypeScript',
    latestCommitSha: '9e41b2c'
  },
  currentRevisionNumber: 1,
  status: 'completed',
  latestRevision: {
    id: 'rev-sample-1',
    assessmentId: 'sample-assessment-stripe',
    revisionNumber: 1,
    commitSha: '9e41b2c',
    commitMessage: 'feat(api): add idempotency key handling to refund endpoint',
    triggerType: 'initial',
    demonstratedCount: 4,
    partialCount: 1,
    notDemonstratedCount: 2,
    scoringRuleVersion: SCORING_RULE_VERSION,
    analysisScope: sampleScope,
    aiSignals: sampleAiSignals,
    createdAt: '2026-10-14T10:15:00.000Z',
    evidence: [
      {
        requirementId: 'req-api',
        requirementTitle: 'REST API Development & Validation',
        status: 'demonstrated',
        evidenceType: 'direct_implementation',
        evidenceStrength: 'strong',
        explanation: 'Demonstrated in src/routes/payments.ts. Implements structured HTTP POST/GET route handlers with strict request body validation, idempotency headers, and explicit HTTP error mapping.',
        humanReadableExplanation: 'Demonstrated in src/routes/payments.ts with strict request body validation and idempotency handling.',
        repoFullName: 'alexchen/payment-orchestrator',
        filePath: 'src/routes/payments.ts',
        lineStart: 34,
        lineEnd: 58,
        codeExcerpt: `export async function handleCreateCharge(req: Request): Promise<Response> {
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return new Response(JSON.stringify({ error: "Missing required Idempotency-Key header" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const body = await req.json();
  const validation = ChargeRequestSchema.safeParse(body);
  if (!validation.success) {
    return new Response(JSON.stringify({ error: "Validation failed", details: validation.error.format() }), {
      status: 422,
      headers: { "Content-Type": "application/json" }
    });
  }

  const charge = await chargeService.process({
    amount: validation.data.amount,
    currency: validation.data.currency,
    customerId: validation.data.customerId,
    idempotencyKey
  });

  return new Response(JSON.stringify(charge), { status: 201 });
}`,
        commitSha: '9e41b2c',
        confidence: 96,
        relevantCommits: ['9e41b2c', '7d22a10'],
        relevantFiles: ['src/routes/payments.ts'],
        scoreBreakdown: {
          score: 85,
          rank: 1,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 55,
          testBonus: 15,
          continuityBonus: 15,
          factors: [
            'Verified concrete implementation pattern (+55 pts)',
            'Corroborated across 2 distinct commits (+15 pts)'
          ]
        }
      },
      {
        requirementId: 'req-db',
        requirementTitle: 'Database Schema Design & SQL Queries',
        status: 'demonstrated',
        evidenceType: 'direct_implementation',
        evidenceStrength: 'strong',
        explanation: 'Demonstrated in db/migrations/001_initial_ledger.sql. Contains normalized relational schemas with foreign key constraints, composite unique indexes, and audit timestamps.',
        humanReadableExplanation: 'Normalized SQL relational schemas with foreign key constraints in db/migrations/001_initial_ledger.sql.',
        repoFullName: 'alexchen/payment-orchestrator',
        filePath: 'db/migrations/001_initial_ledger.sql',
        lineStart: 1,
        lineEnd: 24,
        codeExcerpt: `CREATE TABLE IF NOT EXISTS ledger_entries (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL,
    transaction_id VARCHAR(36) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL,
    entry_type VARCHAR(10) CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_txn_entry ON ledger_entries (transaction_id, entry_type);
CREATE INDEX idx_account_created ON ledger_entries (account_id, created_at DESC);`,
        commitSha: '9e41b2c',
        confidence: 94,
        relevantCommits: ['9e41b2c'],
        relevantFiles: ['db/migrations/001_initial_ledger.sql'],
        scoreBreakdown: {
          score: 75,
          rank: 2,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 55,
          testBonus: 15,
          continuityBonus: 5,
          factors: [
            'Verified concrete implementation pattern (+55 pts)',
            'Single commit verification (+5 pts)'
          ]
        }
      },
      {
        requirementId: 'req-typescript',
        requirementTitle: 'TypeScript / Strict Static Typing',
        status: 'demonstrated',
        evidenceType: 'direct_implementation',
        evidenceStrength: 'strong',
        explanation: 'Demonstrated across tsconfig.json and codebase with strictNullChecks and noImplicitAny enabled.',
        humanReadableExplanation: 'Strict TypeScript configuration with strictNullChecks and typed interfaces.',
        repoFullName: 'alexchen/payment-orchestrator',
        filePath: 'tsconfig.json',
        lineStart: 1,
        lineEnd: 15,
        codeExcerpt: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}`,
        commitSha: '9e41b2c',
        confidence: 98,
        relevantCommits: ['9e41b2c'],
        relevantFiles: ['tsconfig.json'],
        scoreBreakdown: {
          score: 75,
          rank: 3,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 55,
          testBonus: 15,
          continuityBonus: 5,
          factors: ['Verified concrete implementation pattern (+55 pts)']
        }
      },
      {
        requirementId: 'req-cicd',
        requirementTitle: 'CI/CD Pipelines & Automation',
        status: 'demonstrated',
        evidenceType: 'configuration',
        evidenceStrength: 'strong',
        explanation: 'Demonstrated in .github/workflows/ci.yml. Configures automated pull-request validation including type-checking, linting, and build steps.',
        humanReadableExplanation: 'Automated CI workflow in .github/workflows/ci.yml with multi-step pipeline.',
        repoFullName: 'alexchen/payment-orchestrator',
        filePath: '.github/workflows/ci.yml',
        lineStart: 1,
        lineEnd: 20,
        codeExcerpt: `name: CI Validation
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit`,
        commitSha: '9e41b2c',
        confidence: 95,
        relevantCommits: ['9e41b2c'],
        relevantFiles: ['.github/workflows/ci.yml'],
        scoreBreakdown: {
          score: 75,
          rank: 4,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 55,
          testBonus: 15,
          continuityBonus: 5,
          factors: ['Verified concrete configuration pattern (+55 pts)']
        }
      },
      {
        requirementId: 'req-git',
        requirementTitle: 'Git Version Control & Documentation',
        status: 'partial',
        evidenceType: 'documentation',
        evidenceStrength: 'weak',
        explanation: 'Partial evidence: Maintains .gitignore and clean git commits, but project README lacks architecture notes, deployment guides, or contribution workflow.',
        humanReadableExplanation: 'Basic repository tracked under git; README lacks full architectural documentation.',
        repoFullName: 'alexchen/payment-orchestrator',
        filePath: 'README.md',
        lineStart: 1,
        lineEnd: 8,
        codeExcerpt: `# Payment Orchestrator
Internal proof of concept payment gateway integration.
WIP.`,
        commitSha: '9e41b2c',
        confidence: 70,
        relevantCommits: ['9e41b2c'],
        relevantFiles: ['README.md'],
        scoreBreakdown: {
          score: 40,
          rank: 5,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 35,
          testBonus: 0,
          continuityBonus: 5,
          factors: ['Documentation presence without comprehensive architecture notes (+35 pts)']
        }
      },
      {
        requirementId: 'req-testing',
        requirementTitle: 'Automated Testing & Coverage',
        status: 'not_demonstrated',
        evidenceType: 'none',
        evidenceStrength: 'none',
        explanation: 'Not demonstrated in the analyzed repositories. No automated unit tests, integration test suites, or test runner frameworks (Jest, Vitest) were found in the analyzed tree.',
        humanReadableExplanation: 'No automated test files or assertions detected.',
        repoFullName: 'alexchen/payment-orchestrator',
        commitSha: '9e41b2c',
        confidence: 96,
        relevantCommits: [],
        relevantFiles: [],
        scoreBreakdown: {
          score: 0,
          rank: 6,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 0,
          testBonus: 0,
          continuityBonus: 0,
          factors: ['No verifiable implementation discovered (0 pts)']
        }
      },
      {
        requirementId: 'req-devops',
        requirementTitle: 'Docker & Containerization',
        status: 'not_demonstrated',
        evidenceType: 'none',
        evidenceStrength: 'none',
        explanation: 'Not demonstrated in the analyzed repositories. No Dockerfile, docker-compose configuration, or container build specs were discovered.',
        humanReadableExplanation: 'No Dockerfile or container configuration discovered.',
        repoFullName: 'alexchen/payment-orchestrator',
        commitSha: '9e41b2c',
        confidence: 95,
        relevantCommits: [],
        relevantFiles: [],
        scoreBreakdown: {
          score: 0,
          rank: 7,
          ruleVersion: SCORING_RULE_VERSION,
          basePoints: 0,
          testBonus: 0,
          continuityBonus: 0,
          factors: ['No verifiable implementation discovered (0 pts)']
        }
      }
    ]
  },
  tasks: [
    {
      id: 'task-testing-sample',
      requirementId: 'req-testing',
      requirementTitle: 'Automated Testing & Coverage',
      category: 'testing',
      title: 'Add Automated Test Suite for Charge Processing Endpoint',
      description: 'Implement end-to-end and unit tests verifying payment validation, idempotency caching, and HTTP 422/201 responses.',
      expectedEvidence: 'A test file at tests/charge.test.ts utilizing assertions (expect().toBe()) with mock database state.',
      acceptanceCriteria: [
        'Write test cases asserting that missing Idempotency-Key returns HTTP 400.',
        'Assert that invalid currency or negative amounts return HTTP 422.',
        'Assert that successful charge returns HTTP 201 and persists transaction record.'
      ],
      suggestedFiles: ['tests/charge.test.ts', 'vitest.config.ts'],
      projectBrief: {
        overview: 'Stripe strongly values testing hygiene. Demonstrating unit test suites covering charge endpoints provides decisive evidence.',
        suggestedScope: 'Add 3 targeted test cases using Vitest or Jest.',
        implementationHints: [
          'Create a tests/ directory.',
          'Import your route handler directly and pass mock Request objects.',
          'Push commit to your repository to trigger the ProofLoop reassessment webhook.'
        ],
        verificationMethod: 'ProofLoop webhook will scan tests/charge.test.ts, verify assertions, and promote Automated Testing to Demonstrated.'
      },
      status: 'pending'
    },
    {
      id: 'task-docker-sample',
      requirementId: 'req-devops',
      requirementTitle: 'Docker & Containerization',
      category: 'devops',
      title: 'Create Multi-Stage Dockerfile for Payment Service',
      description: 'Containerize the Node/TypeScript service with a hardened non-root container image.',
      expectedEvidence: 'A root Dockerfile with builder and runner stages and exposed port 8080.',
      acceptanceCriteria: [
        'Add Dockerfile using node:22-alpine base image.',
        'Include multi-stage build separating devDependencies from runtime.',
        'Configure non-root user (USER node).'
      ],
      suggestedFiles: ['Dockerfile', '.dockerignore'],
      projectBrief: {
        overview: 'Containerization guarantees environment parity across development and cloud environments.',
        suggestedScope: 'Create a lightweight Dockerfile and .dockerignore file.',
        implementationHints: [
          'Copy only production node_modules in the final runner stage.',
          'Specify EXPOSE 8080 and CMD ["node", "dist/server.js"].'
        ],
        verificationMethod: 'ProofLoop webhook will detect the new Dockerfile and update Docker & Containerization status.'
      },
      status: 'pending'
    }
  ],
  recentActivity: [
    {
      id: 'act-sample-1',
      assessmentId: 'sample-assessment-stripe',
      eventType: 'assessment_created',
      title: 'Initial ProofLoop Assessment Completed',
      description: 'Analyzed 18 files across alexchen/payment-orchestrator. Verified 4 requirements, identified 2 evidence gaps.',
      commitSha: '9e41b2c',
      commitMessage: 'feat(api): add idempotency key handling to refund endpoint',
      affectedSkills: ['REST API Development', 'Database Schema Design', 'TypeScript', 'CI/CD Pipelines'],
      timestamp: '2026-10-14T10:15:00.000Z'
    }
  ],
  analysisScope: sampleScope,
  aiSignals: sampleAiSignals,
  createdAt: '2026-10-14T10:15:00.000Z',
  updatedAt: '2026-10-14T10:15:00.000Z'
};

export async function ensureSampleDataSeeded(): Promise<void> {
  try {
    const existing = await getAssessment(SAMPLE_ASSESSMENT.id);
    if (!existing) {
      await saveAssessment(SAMPLE_ASSESSMENT);
    }
  } catch (err) {
    console.warn('Could not seed sample data into PostgreSQL DB:', err instanceof Error ? err.message : err);
  }
}
