import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const {
  SCORING_RULE_VERSION,
  DEFAULT_SCORING_CONFIG,
  computeScoreForEvidence,
  rankEvidenceDeterministically
} = jiti('../src/lib/scoring.ts');

const {
  analyzeAIAuthorshipSignals,
  AI_SIGNAL_DISCLAIMER
} = jiti('../src/lib/ai-signals.ts');

const {
  isSensitivePath,
  redactSensitiveContent,
  parseGitHubRepoUrl
} = jiti('../src/lib/github.ts');

const {
  verifyWebhookSignature,
  identifyAffectedRequirements
} = jiti('../src/lib/webhook.ts');

const {
  compareRevisions,
  recordAssessmentFailure,
  saveAssessment,
  getAssessment,
  saveRevision,
  getRevisionHistory,
  MAX_RETAINED_EVALUATIONS_PER_ASSESSMENT,
  enforceEvaluationRetention,
  recordWebhookDelivery
} = jiti('../src/lib/db.ts');

const {
  SAMPLE_ASSESSMENT,
  ensureSampleDataSeeded
} = jiti('../src/lib/sample-data.ts');

ensureSampleDataSeeded();

const {
  evaluateRepositoryCore,
  analyzeRepositoryAgainstRequirements
} = jiti('../src/lib/analyzer.ts');

// ============================================================================
// Additional helper functions for evidence-based evaluation testing
// ============================================================================

function createRepositoryEvidence(options: {
  requirementId: string;
  requirementTitle: string;
  status: 'demonstrated' | 'partial' | 'not_demonstrated' | 'insufficient';
  evidenceType: 'direct_implementation' | 'test_verification' | 'configuration' | 'dependency_usage' | 'documentation' | 'none';
  evidenceStrength: 'strong' | 'moderate' | 'weak' | 'none';
  explanation: string;
  humanReadableExplanation?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeExcerpt?: string;
  confidence?: number;
  relevantCommits?: string[];
  relevantFiles?: string[];
  additionsOrPatterns?: string[];
  testResultsSummary?: {
    testFilesCount: number;
    assertionsFound: number;
    verifiedPassing?: boolean;
    executionSummary?: string;
  };
  limitations?: string[];
  contradictoryEvidence?: string[];
  missingInformation?: string[];
  uncertaintyNotes?: string;
  authorAttribution?: {
    author: string;
    isDirectAuthor: boolean;
    attributionCertainty: 'verified' | 'probable' | 'uncertain' | 'shared';
    attributionNotes?: string;
  };
  sharedEvidenceWith?: string[];
  isInsufficientEvidence?: boolean;
}): any {
  return {
    requirementId: options.requirementId,
    requirementTitle: options.requirementTitle,
    status: options.status,
    evidenceType: options.evidenceType,
    evidenceStrength: options.evidenceStrength,
    explanation: options.explanation,
    humanReadableExplanation: options.humanReadableExplanation || options.explanation,
    filePath: options.filePath,
    lineStart: options.lineStart,
    lineEnd: options.lineEnd,
    codeExcerpt: options.codeExcerpt,
    confidence: options.confidence || 50,
    relevantCommits: options.relevantCommits || [],
    relevantFiles: options.relevantFiles || [],
    additionsOrPatterns: options.additionsOrPatterns || [],
    testResultsSummary: options.testResultsSummary,
    limitations: options.limitations || [],
    contradictoryEvidence: options.contradictoryEvidence || [],
    missingInformation: options.missingInformation || [],
    uncertaintyNotes: options.uncertaintyNotes,
    authorAttribution: options.authorAttribution || {
      author: 'Repository Contributor',
      isDirectAuthor: true,
      attributionCertainty: 'probable'
    },
    sharedEvidenceWith: options.sharedEvidenceWith || [],
    isInsufficientEvidence: options.isInsufficientEvidence || false,
    repoFullName: 'test/evidence-repo',
    commitSha: 'abc123'
  };
}

function createInternshipRequirement(options: {
  id: string;
  title: string;
  description: string;
  category: 'core' | 'backend' | 'frontend' | 'database' | 'devops' | 'testing' | 'architecture' | 'general';
  importance: 'required' | 'preferred';
}): any {
  return {
    id: options.id,
    title: options.title,
    description: options.description,
    category: options.category,
    importance: options.importance,
    isInferred: false
  };
}

function createAnalysisContext(options: {
  owner: string;
  repo: string;
  defaultBranch: string;
  commitSha: string;
  fileTree: any[];
  commits?: any[];
  token?: string;
  localFileCache?: Record<string, string>;
  diffs?: any[];
}): any {
  return {
    owner: options.owner,
    repo: options.repo,
    defaultBranch: options.defaultBranch,
    commitSha: options.commitSha,
    fileTree: options.fileTree || [],
    commits: options.commits || [],
    token: options.token,
    localFileCache: options.localFileCache || {},
    diffs: options.diffs || []
  };
}

// ============================================================================
// 23. Evidence-Based Repository Analysis (New Core Tests)
// ============================================================================

test('23. Evidence-Based Analysis - Strong Evidence Implementation', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-testing',
      title: 'Automated Testing & Coverage',
      description: 'Implement comprehensive test suites with assertions',
      category: 'testing',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-db',
      title: 'Database Schema Design & SQL Queries',
      description: 'Design relational schemas and write query logic',
      category: 'database',
      importance: 'required'
    })
  ];

  const localFileCache = {
    'src/routes/users.ts': `import { Router } from 'express';
const router = Router();

router.get('/users', async (req, res) => {
  const users = await getUsersFromDatabase();
  res.json({ success: true, data: users, count: users.length });
});

router.post('/users', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email required' });
  }
  const newUser = await createUser({ name, email });
  res.status(201).json({ success: true, data: newUser });
});

export default router;`,
    'tests/users.test.ts': `import request from 'supertest';
import app from '../src/app';

describe('User API', () => {
  it('should return all users', async () => {
    const response = await request(app).get('/users');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.count).toBeGreaterThan(0);
  });

  it('should create a new user', async () => {
    const userData = { name: 'Test User', email: 'test@example.com' };
    const response = await request(app).post('/users').send(userData);
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe(userData.name);
    expect(response.body.data.email).toBe(userData.email);
  });
});

expect(1 + 1).toBe(2);`,
    'src/db/schema.prisma': `model User {
  id    Int     @id @default(autoincrement())
  name  String
  email String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
}

generator client {
  provider = 'prisma-client'
}`
  };

  const fileTree = [
    { path: 'src/routes/users.ts', mode: '100644', type: 'blob', sha: 'c1' },
    { path: 'tests/users.test.ts', mode: '100644', type: 'blob', sha: 'c2' },
    { path: 'src/db/schema.prisma', mode: '100644', type: 'blob', sha: 'c3' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'ecommerce',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: implement users api and tests', authorName: 'Dev', timestamp: new Date(Date.now() - 3600000).toISOString(), filesChanged: ['src/routes/users.ts', 'tests/users.test.ts'] },
        { sha: 'ghi789', message: 'feat: create database schema', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/db/schema.prisma'] }
      ],
      localFileCache
    }),
    requirements
  );

  // Verify each requirement has evidence with clear explanations
  assert.ok(Array.isArray(analysis.evidenceList), 'Evidence list should be an array');
  assert.equal(analysis.evidenceList.length, 3, 'Should analyze all 3 requirements');

  // API requirement - should be demonstrated with concrete evidence
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  assert.ok(apiEv, 'API requirement evidence should be present');
  assert.equal(apiEv.status, 'demonstrated', 'API should be demonstrated with working implementation');
  assert.equal(apiEv.evidenceType, 'direct_implementation', 'Should have direct implementation evidence');
  assert.equal(apiEv.evidenceStrength, 'strong', 'Should have strong evidence');
  assert.ok(apiEv.filePath && apiEv.filePath.includes('src/routes/users.ts'), 'Should reference source file with HTTP endpoints');
  assert.ok(apiEv.codeExcerpt && apiEv.codeExcerpt.includes('router.get'), 'Should include code excerpt with route handlers');
  assert.ok(apiEv.relevantCommits && apiEv.relevantCommits.length > 0, 'Should have relevant commits');

  // Test requirement - should be demonstrated with assertions
  const testEv = analysis.evidenceList.find(e => e.requirementId === 'req-testing');
  assert.ok(testEv, 'Test requirement evidence should be present');
  assert.equal(testEv.status, 'demonstrated', 'Tests should be demonstrated with assertions');
  assert.equal(testEv.evidenceType, 'test_verification', 'Should have test verification evidence');
  assert.equal(testEv.evidenceStrength, 'strong', 'Should have strong evidence');
  assert.ok(testEv.testResultsSummary && testEv.testResultsSummary.assertionsFound > 0, 'Should have assertions found');
  assert.ok(testEv.relevantFiles && testEv.relevantFiles.length > 0, 'Should reference test files');

  // Database requirement - should be demonstrated with schema
  const dbEv = analysis.evidenceList.find(e => e.requirementId === 'req-db');
  assert.ok(dbEv, 'Database requirement evidence should be present');
  assert.equal(dbEv.status, 'demonstrated', 'Database should be demonstrated with schema');
  assert.equal(dbEv.evidenceType, 'direct_implementation', 'Should have direct implementation evidence');
  assert.equal(dbEv.evidenceStrength, 'strong', 'Should have strong evidence');
  assert.ok(dbEv.filePath && dbEv.filePath.includes('src/db/schema.prisma'), 'Should reference database schema file');
  assert.ok(dbEv.codeExcerpt && dbEv.codeExcerpt.includes('model User'), 'Should include model definitions');

  // Verify confidence levels are realistic based on evidence
  assert.ok(apiEv.confidence > 80, 'API evidence should have high confidence');
  assert.ok(testEv.confidence > 80, 'Test evidence should have high confidence');
  assert.ok(dbEv.confidence > 80, 'Database evidence should have high confidence');

  // Verify tasks are generated for any gaps (none in this case)
  assert.equal(analysis.tasks.length, 0, 'Should have no gap tasks since all requirements are demonstrated');
});

// ============================================================================
// 24. Evidence-Based Analysis - Partial Evidence Scenarios
// ============================================================================

test('24. Evidence-Based Analysis - Partial Evidence (Configuration Only)', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-devops',
      title: 'Containerization & DevOps Setup',
      description: 'Create Dockerfile and deployment configurations',
      category: 'devops',
      importance: 'preferred'
    })
  ];

  const localFileCache = {
    'package.json': JSON.stringify({
      name: 'partial-app',
      version: '1.0.0',
      scripts: {
        start: 'node server.js',
        test: 'jest'
      },
      dependencies: {
        express: '^4.18.0',
        prisma: '^5.0.0'
      }
    }),
    'Dockerfile': 'FROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nEXPOSE 3000\nCMD ["npm", "start"]'
  };

  const fileTree = [
    { path: 'package.json', mode: '100644', type: 'blob', sha: 'c1' },
    { path: 'Dockerfile', mode: '100644', type: 'blob', sha: 'c2' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'partial-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: setup project structure and config', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['package.json', 'Dockerfile'] }
      ],
      localFileCache
    }),
    requirements
  );

  // API requirement - should be partial (dependency analysis only)
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  assert.ok(apiEv, 'API requirement evidence should be present');
  assert.equal(apiEv.status, 'partial', 'API should be partial - only dependency evidence found');
  assert.equal(apiEv.evidenceType, 'dependency_usage', 'Should have dependency usage evidence');
  assert.equal(apiEv.evidenceStrength, 'weak', 'Should have weak evidence from dependencies only');
  assert.ok(apiEv.explanation.includes('Partial evidence: Detected potential server or handler file'), 'Should indicate partial implementation');

  // DevOps requirement - should be demonstrated (Dockerfile found)
  const devopsEv = analysis.evidenceList.find(e => e.requirementId === 'req-devops');
  assert.ok(devopsEv, 'DevOps requirement evidence should be present');
  assert.equal(devopsEv.status, 'demonstrated', 'DevOps should be demonstrated with Dockerfile');
  assert.equal(devopsEv.evidenceType, 'configuration', 'Should have configuration evidence');
  assert.equal(devEv.evidenceStrength, 'strong', 'Should have strong evidence from Dockerfile');

  // Verify task generation for partial requirements
  const apiTask = analysis.tasks.find(t => t.requirementId === 'req-api');
  assert.ok(apiTask, 'Should generate task for partial API requirement');
  assert.equal(apiTask.status, 'pending', 'Task should be pending');
});

// ============================================================================
// 25. Evidence-Based Analysis - Missing Evidence Scenarios
// ============================================================================

test('25. Evidence-Based Analysis - Missing Evidence (Backend API)', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-frontend',
      title: 'Frontend Application Development',
      description: 'Create modern user interface components',
      category: 'frontend',
      importance: 'required'
    })
  ];

  const localFileCache = {};
  const fileTree = [];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'backend-only-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [],
      localFileCache
    }),
    requirements
  );

  // Both requirements should be not_demonstrated with clear explanations
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  const frontendEv = analysis.evidenceList.find(e => e.requirementId === 'req-frontend');

  assert.ok(apiEv, 'API requirement evidence should be present');
  assert.equal(apiEv.status, 'not_demonstrated', 'API should be not demonstrated - no evidence found');
  assert.equal(apiEv.evidenceType, 'none', 'Should have no evidence type');
  assert.ok(apiEv.explanation.includes('No HTTP endpoint handlers or API controller declarations were found'), 'Should provide clear explanation for missing API');

  assert.ok(frontendEv, 'Frontend requirement evidence should be present');
  assert.equal(frontendEv.status, 'not_demonstrated', 'Frontend should be not demonstrated - no evidence found');
  assert.equal(frontendEv.evidenceType, 'none', 'Should have no evidence type');
  assert.ok(frontendEv.explanation.includes('No frontend UI components or pages identified'), 'Should provide clear explanation for missing frontend');

  // Verify high confidence in negative findings (actively scanned)
  assert.ok(apiEv.confidence > 85, 'Not demonstrated findings should have high confidence');
  assert.ok(frontendEv.confidence > 85, 'Not demonstrated findings should have high confidence');
});

// ============================================================================
// 26. Evidence-Based Analysis - Insufficient Evidence (Empty Repository)
// ============================================================================

test('26. Evidence-Based Analysis - Insufficient Evidence (Empty Repository)', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    })
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'empty-repo',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree: [],
      commits: [],
      localFileCache: {}
    }),
    requirements
  );

  // All requirements should be marked as insufficient evidence
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  assert.ok(apiEv, 'Requirement evidence should be present');
  assert.equal(apiEv.status, 'not_demonstrated', 'Empty repo requirements should be not demonstrated');
  assert.equal(apiEv.isInsufficientEvidence, true, 'Should be flagged as insufficient evidence');
  assert.equal(apiEv.evidenceType, 'none', 'Should have no evidence');
  assert.ok(apiEv.explanation.includes('Insufficient repository evidence'), 'Should indicate insufficient evidence, not failure');
  assert.ok(apiEv.confidence === 25, 'Empty repo should have low confidence (25%)');
  assert.ok(apiEv.limitations && apiEv.limitations.some(l => l.includes('Empty repository')), 'Should document empty repository limitation');
});

// ============================================================================
// 27. Evidence-Based Analysis - Unavailable Repository
// ============================================================================

test('27. Evidence-Based Analysis - Repository Not Found Error', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    })
  ];

  // Simulate repository not found scenario
  const result = await evaluateRepositoryCore({
    repoFullName: 'nonexistent-user/nonexistent-repo',
    defaultBranch: 'main',
    targetCommitSha: 'abc123',
    requirements,
    triggerType: 'manual'
  });

  // Should fail with appropriate error code
  assert.equal(result.success, false, 'Evaluation should fail for nonexistent repository');
  assert.equal(result.errorCode, 'REPO_NOT_FOUND', 'Should return REPO_NOT_FOUND error');
  assert.ok(result.error && result.error.includes('not found or is private'), 'Error message should indicate repository not found');
  assert.equal(result.evidenceList.length, 0, 'Should have no evidence for failed evaluation');
});

// ============================================================================
// 28. Evidence-Based Analysis - Duplicate Evidence and Anti-Double-Counting
// ============================================================================

test('28. Evidence-Based Analysis - Anti-Double-Counting for Same Code', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-typescript',
      title: 'TypeScript / Strict Static Typing',
      description: 'Implement TypeScript for type safety',
      category: 'core',
      importance: 'required'
    })
  ];

  const localFileCache = {
    'src/server.ts': `import express from 'express';
import { Router } from 'express';
const app = express();

const router = Router();
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', router);
app.listen(3000, () => {
  console.log('Server running on port 3000');
});

export { app, router };`
  };

  const fileTree = [
    { path: 'src/server.ts', mode: '100644', type: 'blob', sha: 'c1' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'single-file-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: implement api and typing in same file', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/server.ts'] }
      ],
      localFileCache
    }),
    requirements
  );

  // Both requirements should have evidence but one should be shared
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  const tsEv = analysis.evidenceList.find(e => e.requirementId === 'req-typescript');

  assert.ok(apiEv, 'API requirement evidence should be present');
  assert.ok(tsEv, 'TypeScript requirement evidence should be present');

  // Verify shared evidence detection
  const sharedEv = [apiEv, tsEv].find(e => e.sharedEvidenceWith && e.sharedEvidenceWith.length > 0);
  assert.ok(sharedEv, 'One requirement should detect shared evidence');
  assert.ok(sharedEv.uncertaintyNotes && sharedEv.uncertaintyNotes.includes('Anti-double-counting'), 'Should include anti-double-counting notes');

  // Verify base points are capped to prevent double-scoring
  assert.ok(sharedEv.scoreBreakdown.basePoints <= 15, 'Base points should be capped for duplicate/shared evidence');
  assert.ok(sharedEv.scoreBreakdown.factors.some(f => f.includes('prevent double-counting')), 'Should have anti-double-counting factor');
});

// ============================================================================
// 29. Evidence-Based Analysis - Repository Evidence Completeness
// ============================================================================

test('29. Evidence-Based Analysis - Comprehensive Evidence Tracking', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-db',
      title: 'Database Schema Design & SQL Queries',
      description: 'Design relational schemas and write query logic',
      category: 'database',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-devops',
      title: 'Containerization & DevOps Setup',
      description: 'Create Dockerfile and deployment configurations',
      category: 'devops',
      importance: 'preferred'
    })
  ];

  const localFileCache = {
    'src/routes/api.ts': 'import { Router } from "express";\nexport const router = Router();\nrouter.get("/health", (req, res) => res.json({ok: true}));',
    'src/db/schema.sql': 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE);\nCREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, content TEXT, user_id INTEGER);',
    'Dockerfile': 'FROM node:18\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nEXPOSE 3000\nCMD ["npm","start"]'
  };

  const fileTree = [
    { path: 'src/routes/api.ts', mode: '100644', type: 'blob', sha: 'c1' },
    { path: 'src/db/schema.sql', mode: '100644', type: 'blob', sha: 'c2' },
    { path: 'Dockerfile', mode: '100644', type: 'blob', sha: 'c3' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'evidence-complete-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: add api, db schema, and docker setup', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/api.ts', 'src/db/schema.sql', 'Dockerfile'] }
      ],
      localFileCache
    }),
    requirements
  );

  // All requirements should be demonstrated with clear evidence
  assert.equal(analysis.evidenceList.length, 3, 'Should analyze all 3 requirements');

  // Verify evidence completeness for each requirement
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  assert.ok(apiEv.filePath && apiEv.filePath.includes('src/routes/api.ts'), 'API evidence should reference source file');
  assert.ok(apiEv.codeExcerpt && apiEv.codeExcerpt.includes('router.get'), 'API evidence should include route handler code');
  assert.ok(apiEv.relevantCommits && apiEv.relevantCommits.length > 0, 'API evidence should have commit references');

  const dbEv = analysis.evidenceList.find(e => e.requirementId === 'req-db');
  assert.ok(dbEv.filePath && dbEv.filePath.includes('src/db/schema.sql'), 'Database evidence should reference schema file');
  assert.ok(dbEv.codeExcerpt && dbEv.codeExcerpt.includes('CREATE TABLE'), 'Database evidence should include table creation');
  assert.ok(dbEv.relevantFiles && dbEv.relevantFiles.length > 0, 'Database evidence should reference multiple files');

  const devopsEv = analysis.evidenceList.find(e => e.requirementId === 'req-devops');
  assert.ok(devopsEv.filePath && devopsEv.filePath.includes('Dockerfile'), 'DevOps evidence should reference Dockerfile');
  assert.ok(devopsEv.codeExcerpt && devopsEv.codeExcerpt.includes('FROM node:'), 'DevOps evidence should include Docker base image');
  assert.ok(devopsEv.relevantCommits && devopsEv.relevantCommits.length > 0, 'DevOps evidence should have commit references');

  // Verify summary statistics
  const demonstratedCount = analysis.evidenceList.filter(e => e.status === 'demonstrated').length;
  const partialCount = analysis.evidenceList.filter(e => e.status === 'partial').length;
  const notDemonstratedCount = analysis.evidenceList.filter(e => e.status === 'not_demonstrated').length;

  assert.equal(demonstratedCount, 3, 'All 3 requirements should be demonstrated');
  assert.equal(partialCount, 0, 'No requirements should be partial');
  assert.equal(notDemonstratedCount, 0, 'No requirements should be not demonstrated');

  // Verify average score calculation
  const averageScore = analysis.evidenceList.reduce((sum, ev) => sum + (ev.scoreBreakdown?.score || 0), 0) / analysis.evidenceList.length;
  assert.ok(averageScore > 60, 'Average score should be above 60 for strong evidence');
});

// ============================================================================
// 30. Evidence-Based Analysis - Deterministic Evidence Ranking
// ============================================================================

test('30. Evidence-Based Analysis - Deterministic Evidence Ranking Consistency', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-testing',
      title: 'Automated Testing & Coverage',
      description: 'Implement comprehensive test suites with assertions',
      category: 'testing',
      importance: 'required'
    })
  ];

  const localFileCache = {
    'src/routes/api.ts': 'import { Router } from "express";\nexport const router = Router();\nrouter.get("/api/health", (req, res) => res.json({ok: true}));',
    'tests/api.test.ts': 'describe("API tests", () => {\n  it("should return health", () => {\n    expect(1).toBe(1);\n  });\n});'
  };

  const fileTree = [
    { path: 'src/routes/api.ts', mode: '100644', type: 'blob', sha: 'c1' },
    { path: 'tests/api.test.ts', mode: '100644', type: 'blob', sha: 'c2' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'deterministic-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: implement api and tests', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/api.ts', 'tests/api.test.ts'] }
      ],
      localFileCache
    }),
    requirements
  );

  // Run the same analysis twice to ensure deterministic results
  const analysis2 = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'deterministic-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: implement api and tests', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/api.ts', 'tests/api.test.ts'] }
      ],
      localFileCache
    }),
    requirements
  );

  // Verify evidence lists are identical (deterministic)
  assert.deepEqual(
    analysis.evidenceList.map(e => ({
      requirementId: e.requirementId,
      status: e.status,
      score: e.scoreBreakdown?.score,
      rank: e.scoreBreakdown?.rank,
      confidence: e.confidence
    })),
    analysis2.evidenceList.map(e => ({
      requirementId: e.requirementId,
      status: e.status,
      score: e.scoreBreakdown?.score,
      rank: e.scoreBreakdown?.rank,
      confidence: e.confidence
    })),
    'Evidence lists should be identical between runs'
  );

  // Verify ranking is consistent (highest score first)
  const ranked1 = analysis.evidenceList;
  const ranked2 = analysis2.evidenceList;

  // Sort by score descending to verify ranking
  const sortedByScore = ranked1.slice().sort((a, b) => {
    const scoreA = a.scoreBreakdown?.score || 0;
    const scoreB = b.scoreBreakdown?.score || 0;
    return scoreB - scoreA;
  });

  // First requirement should have higher or equal score
  assert.ok(ranked1[0].scoreBreakdown?.score >= ranked1[1].scoreBreakdown?.score,
    'First ranked requirement should have highest or equal score');
});

// ============================================================================
// 31. Evidence-Based Analysis - Manual Reassessment Compatibility
// ============================================================================

test('31. Manual Reassessment - Core Evaluation Engine Reuse', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    })
  ];

  const localFileCache = {
    'src/routes/users.ts': 'import { Router } from "express";\nexport const router = Router();\nrouter.get("/users", (req, res) => res.json({users: []}));'
  };

  const fileTree = [
    { path: 'src/routes/users.ts', mode: '100644', type: 'blob', sha: 'c1' }
  ];

  // Simulate initial assessment
  const initialResult = await evaluateRepositoryCore({
    repoFullName: 'acme/manual-reassess-app',
    defaultBranch: 'main',
    targetCommitSha: 'abc123',
    requirements,
    triggerType: 'initial',
    fileTree,
    commits: [
      { sha: 'def456', message: 'feat: implement api route', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/users.ts'] }
    ],
    localFileCache,
    assessmentId: 'manual-test-initial'
  });

  assert.equal(initialResult.success, true, 'Initial assessment should succeed');
  assert.equal(initialResult.evidenceList.length, 1, 'Should have evidence for API requirement');

  const apiEvInitial = initialResult.evidenceList[0];
  assert.equal(apiEvInitial.status, 'demonstrated', 'API should be demonstrated');
  assert.ok(apiEvInitial.scoreBreakdown?.score > 0, 'Should have positive score');

  // Simulate manual reassessment with same repository (should reuse same evaluation engine)
  const reassessmentResult = await evaluateRepositoryCore({
    repoFullName: 'acme/manual-reassess-app',
    defaultBranch: 'main',
    targetCommitSha: 'def456', // Different commit
    requirements,
    triggerType: 'manual',
    triggerMessage: 'Manual reassessment to verify consistency',
    fileTree,
    commits: [
      { sha: 'ghi789', message: 'feat: update api route', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/users.ts'] }
    ],
    localFileCache,
    assessmentId: 'manual-test-reassessment'
  });

  assert.equal(reassessmentResult.success, true, 'Manual reassessment should succeed');
  assert.equal(reassessmentResult.evidenceList.length, 1, 'Should have evidence for API requirement');

  const apiEvReassessment = reassessmentResult.evidenceList[0];
  assert.equal(apiEvReassessment.status, 'demonstrated', 'API should remain demonstrated');

  // Verify same scoring logic is used (deterministic scoring)
  assert.equal(apiEvReassessment.scoreBreakdown?.score, apiEvInitial.scoreBreakdown?.score,
    'Manual reassessment should produce identical scores (same evaluation engine)');

  // Verify analysis scope and AI signals are present
  assert.ok(reassessmentResult.analysisScope, 'Should have analysis scope');
  assert.ok(reassessmentResult.aiSignals, 'Should have AI signals');
});

// ============================================================================
// 32. Evidence-Based Analysis - Enhanced Error Handling
// ============================================================================

test('32. Error Handling - Malformed Input Validation', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    })
  ];

  // Test invalid repository name
  const invalidRepoResult = await evaluateRepositoryCore({
    repoFullName: '',
    requirements
  });

  assert.equal(invalidRepoResult.success, false, 'Empty repo name should fail');
  assert.equal(invalidRepoResult.errorCode, 'INVALID_INPUT', 'Should be INVALID_INPUT error');

  // Test malformed repository URL
  const malformedRepoResult = await evaluateRepositoryCore({
    repoFullName: 'not-a-valid-url-format',
    requirements
  });

  assert.equal(malformedRepoResult.success, false, 'Malformed URL should fail');
  assert.equal(malformedRepoResult.errorCode, 'INVALID_INPUT', 'Should be INVALID_INPUT error');

  // Test empty requirements list
  const emptyReqResult = await evaluateRepositoryCore({
    repoFullName: 'valid/repo',
    requirements: []
  });

  assert.equal(emptyReqResult.success, false, 'Empty requirements should fail');
  assert.equal(emptyReqResult.errorCode, 'INVALID_INPUT', 'Should be INVALID_INPUT error');
});

// ============================================================================
// 33. Evidence-Based Analysis - Evidence Reference Quality
// ============================================================================

test('33. Evidence Reference - File Paths and Code References', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-db',
      title: 'Database Schema Design & SQL Queries',
      description: 'Design relational schemas and write query logic',
      category: 'database',
      importance: 'required'
    })
  ];

  const localFileCache = {
    'src/routes/users.ts': 'import { Router } from "express";\nexport const router = Router();\nrouter.get("/users", (req, res) => {\n  res.json({users: [], count: 0});\n});',
    'src/db/schema.sql': 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE);'
  };

  const fileTree = [
    { path: 'src/routes/users.ts', mode: '100644', type: 'blob', sha: 'c1' },
    { path: 'src/db/schema.sql', mode: '100644', type: 'blob', sha: 'c2' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'reference-quality-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: add api and db schema', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/users.ts', 'src/db/schema.sql'] }
      ],
      localFileCache
    }),
    requirements
  );

  // Verify all evidence has proper file path references
  for (const ev of analysis.evidenceList) {
    assert.ok(ev.filePath, `Evidence for ${ev.requirementId} should have filePath`);
    assert.ok(ev.filePath.startsWith('src/'), `File path ${ev.filePath} should be a source file`);
    assert.ok(ev.lineStart, `Evidence for ${ev.requirementId} should have lineStart`);
    assert.ok(ev.lineStart > 0, `lineStart should be positive for ${ev.requirementId}`);

    if (ev.codeExcerpt) {
      assert.ok(ev.codeExcerpt.length > 10, `Code excerpt should be substantial for ${ev.requirementId}`);
    }

    if (ev.status === 'demonstrated') {
      assert.ok(ev.confidence >= 85, `Demonstrated evidence should have high confidence (>=85) for ${ev.requirementId}`);
    }
  }

  // Verify specific evidence details
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  assert.ok(apiEv.codeExcerpt.includes('router.get'), 'API evidence should include router.get method');

  const dbEv = analysis.evidenceList.find(e => e.requirementId === 'req-db');
  assert.ok(dbEv.codeExcerpt.includes('CREATE TABLE'), 'Database evidence should include CREATE TABLE statement');
});

// ============================================================================
// 34. Evidence-Based Analysis - Rich Explanation Quality
// ============================================================================

test('34. Explanation Quality - Clear, Actionable Evidence Explanations', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    })
  ];

  const localFileCache = {
    'src/routes/users.ts': 'import { Router } from "express";\nexport const router = Router();\nrouter.get("/users", (req, res) => {\n  res.json({success: true, data: [], message: "User list retrieved"});\n});'
  };

  const fileTree = [
    { path: 'src/routes/users.ts', mode: '100644', type: 'blob', sha: 'c1' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'explanation-quality-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: implement users api route', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/users.ts'] }
      ],
      localFileCache
    }),
    requirements
  );

  const apiEv = analysis.evidenceList[0];

  // Verify explanation is clear and informative
  assert.ok(apiEv.explanation.length > 50, 'Explanation should be substantial');
  assert.ok(apiEv.explanation.includes('Demonstrated'), 'Explanation should indicate demonstration');
  assert.ok(apiEv.explanation.includes('src/routes/users.ts'), 'Explanation should reference source file');
  assert.ok(apiEv.explanation.includes('HTTP endpoint handling'), 'Explanation should describe the implementation');

  // Verify human-readable explanation is user-friendly
  assert.ok(apiEv.humanReadableExplanation, 'Should have human-readable explanation');
  assert.ok(apiEv.humanReadableExplanation.length > 20, 'Human-readable explanation should be meaningful');

  // Verify confidence is appropriate for the evidence strength
  assert.ok(apiEv.confidence >= 80, 'Strong implementation should have high confidence');

  // Verify uncertainty notes are only present when needed
  if (apiEv.uncertaintyNotes) {
    assert.ok(apiEv.uncertaintyNotes.includes('Anti-double-counting') || apiEv.uncertaintyNotes.includes('shared'),
      'Uncertainty notes should explain shared evidence or similar');
  }
});

// ============================================================================
// 35. Evidence-Based Analysis - Evidence Type Accuracy
// ============================================================================

test('35. Evidence Type Accuracy - Correct Evidence Classification', async () => {
  const requirements = [
    createInternshipRequirement({
      id: 'req-api',
      title: 'REST API Development & Validation',
      description: 'Build structured HTTP API endpoints with validation',
      category: 'backend',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-testing',
      title: 'Automated Testing & Coverage',
      description: 'Implement comprehensive test suites with assertions',
      category: 'testing',
      importance: 'required'
    }),
    createInternshipRequirement({
      id: 'req-devops',
      title: 'Containerization & DevOps Setup',
      description: 'Create Dockerfile and deployment configurations',
      category: 'devops',
      importance: 'preferred'
    })
  ];

  const localFileCache = {
    'src/routes/api.ts': 'import { Router } from "express";\nexport const router = Router();\nrouter.get("/health", (req, res) => res.json({ok: true}));',
    'tests/api.test.ts': 'describe("API", () => {\n  it("should work", () => {\n    expect(1).toBe(1);\n  });\n});',
    'Dockerfile': 'FROM node:18\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nEXPOSE 3000\nCMD ["npm","start"]'
  };

  const fileTree = [
    { path: 'src/routes/api.ts', mode: '100644', type: 'blob', sha: 'c1' },
    { path: 'tests/api.test.ts', mode: '100644', type: 'blob', sha: 'c2' },
    { path: 'Dockerfile', mode: '100644', type: 'blob', sha: 'c3' }
  ];

  const analysis = await analyzeRepositoryAgainstRequirements(
    createAnalysisContext({
      owner: 'acme',
      repo: 'evidence-type-app',
      defaultBranch: 'main',
      commitSha: 'abc123',
      fileTree,
      commits: [
        { sha: 'def456', message: 'feat: implement api, tests, and docker', authorName: 'Dev', timestamp: new Date().toISOString(), filesChanged: ['src/routes/api.ts', 'tests/api.test.ts', 'Dockerfile'] }
      ],
      localFileCache
    }),
    requirements
  );

  // Verify evidence types are correctly classified
  const apiEv = analysis.evidenceList.find(e => e.requirementId === 'req-api');
  assert.equal(apiEv.evidenceType, 'direct_implementation', 'API evidence should be direct_implementation');

  const testEv = analysis.evidenceList.find(e => e.requirementId === 'req-testing');
  assert.equal(testEv.evidenceType, 'test_verification', 'Test evidence should be test_verification');

  const devopsEv = analysis.evidenceList.find(e => e.requirementId === 'req-devops');
  assert.equal(devopsEv.evidenceType, 'configuration', 'DevOps evidence should be configuration');

  // Verify evidence strengths are appropriate
  assert.equal(apiEv.evidenceStrength, 'strong', 'API evidence should be strong');
  assert.equal(testEv.evidenceStrength, 'strong', 'Test evidence should be strong');
  assert.equal(devopsEv.evidenceStrength, 'strong', 'DevOps evidence should be strong');

  // Verify status reflects evidence strength
  assert.equal(apiEv.status, 'demonstrated', 'Strong evidence should result in demonstrated status');
  assert.equal(testEv.status, 'demonstrated', 'Strong evidence should result in demonstrated status');
  assert.equal(devopsEv.status, 'demonstrated', 'Strong evidence should result in demonstrated status');
});

console.log('Evidence-based evaluation tests completed successfully!');