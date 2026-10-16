import {
  InternshipRequirement,
  RepositoryEvidence,
  EvidenceStatus,
  GapTask
} from './types';
import { GitHubFileNode, fetchFileContent } from './github';

interface AnalysisContext {
  owner: string;
  repo: string;
  defaultBranch: string;
  commitSha: string;
  fileTree: GitHubFileNode[];
  token?: string;
  // Optional pre-loaded file cache for offline/sample mode
  localFileCache?: Record<string, string>;
}

export async function analyzeRepositoryAgainstRequirements(
  context: AnalysisContext,
  requirements: InternshipRequirement[]
): Promise<{
  evidenceList: RepositoryEvidence[];
  tasks: GapTask[];
}> {
  const { owner, repo, defaultBranch, commitSha, fileTree, token, localFileCache } = context;
  const repoFullName = `${owner}/${repo}`;
  const evidenceList: RepositoryEvidence[] = [];
  const tasks: GapTask[] = [];

  // Helper to fetch file content safely
  const getFile = async (path: string): Promise<string | null> => {
    if (localFileCache && localFileCache[path]) {
      return localFileCache[path];
    }
    try {
      const content = await fetchFileContent(owner, repo, path, defaultBranch, token);
      return content;
    } catch (err) {
      console.warn(`Could not fetch file ${path}:`, err);
      return null;
    }
  };

  for (const req of requirements) {
    const analysis = await evaluateRequirement(req, fileTree, getFile, repoFullName, commitSha);
    evidenceList.push(analysis.evidence);

    if (analysis.evidence.status !== 'demonstrated') {
      tasks.push(createGapTask(req, analysis.evidence));
    }
  }

  return { evidenceList, tasks };
}

async function evaluateRequirement(
  req: InternshipRequirement,
  tree: GitHubFileNode[],
  getFile: (path: string) => Promise<string | null>,
  repoFullName: string,
  commitSha: string
): Promise<{ evidence: RepositoryEvidence }> {
  const filePaths = tree.map(t => t.path);

  switch (req.id) {
    case 'req-api': {
      const apiFiles = filePaths.filter(p =>
        /(?:routes?|controllers?|endpoints?|api\/|handlers?|views\.py|server\.(ts|js)|main\.(go|py|rs))/i.test(p)
      );

      if (apiFiles.length === 0) {
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'not_demonstrated',
            explanation: 'Not demonstrated in the analyzed repositories. No API route handlers, endpoints, or controller files were identified in the file tree.',
            repoFullName,
            commitSha,
            confidence: 90
          }
        };
      }

      // Check first 3 candidate files for actual route declarations
      for (const candidate of apiFiles.slice(0, 3)) {
        const content = await getFile(candidate);
        if (!content) continue;

        const lines = content.split('\n');
        let matchedLine = -1;
        let matchedPattern = '';

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (
            /(?:app\.(get|post|put|delete|patch)|router\.(get|post|put|delete)|export\s+async\s+function\s+(GET|POST|PUT|DELETE)|@(?:Get|Post|Put|Delete)|def\s+(get_|post_|api_)|func\s+.*Handler)/i.test(l)
          ) {
            matchedLine = i + 1;
            matchedPattern = l.trim();
            break;
          }
        }

        if (matchedLine !== -1) {
          const start = Math.max(1, matchedLine - 2);
          const end = Math.min(lines.length, matchedLine + 15);
          const excerpt = lines.slice(start - 1, end).join('\n');

          return {
            evidence: {
              requirementId: req.id,
              requirementTitle: req.title,
              status: 'demonstrated',
              explanation: `Demonstrated in ${candidate}. Implements HTTP endpoint handling with structured route definitions (${matchedPattern}).`,
              repoFullName,
              filePath: candidate,
              lineStart: start,
              lineEnd: end,
              codeExcerpt: excerpt,
              commitSha,
              confidence: 95
            }
          };
        }
      }

      // Found candidate files but without route definitions
      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'partial',
          explanation: `Partial evidence: Detected potential server or handler files (${apiFiles[0]}), but no verified HTTP endpoint implementations or status code mappings were discovered.`,
          repoFullName,
          filePath: apiFiles[0],
          commitSha,
          confidence: 70
        }
      };
    }

    case 'req-db': {
      const dbFiles = filePaths.filter(p =>
        /(?:schema\.prisma|migrations?\/|\.sql$|models?\/|database|entities?\/|db\.(ts|js|py))/i.test(p)
      );

      if (dbFiles.length === 0) {
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'not_demonstrated',
            explanation: 'Not demonstrated in the analyzed repositories. No SQL schemas, database migration directories, or ORM models were discovered.',
            repoFullName,
            commitSha,
            confidence: 90
          }
        };
      }

      for (const candidate of dbFiles.slice(0, 3)) {
        const content = await getFile(candidate);
        if (!content) continue;

        const lines = content.split('\n');
        let matchedLine = -1;

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (
            /(?:CREATE\s+TABLE|SELECT\s+.*FROM|INSERT\s+INTO|model\s+\w+\s*\{|Column\(|ForeignKey|belongsTo|hasMany|DatabaseSync)/i.test(l)
          ) {
            matchedLine = i + 1;
            break;
          }
        }

        if (matchedLine !== -1) {
          const start = Math.max(1, matchedLine - 2);
          const end = Math.min(lines.length, matchedLine + 16);
          const excerpt = lines.slice(start - 1, end).join('\n');

          return {
            evidence: {
              requirementId: req.id,
              requirementTitle: req.title,
              status: 'demonstrated',
              explanation: `Demonstrated in ${candidate}. Contains concrete relational schema definitions, migrations, or query management logic.`,
              repoFullName,
              filePath: candidate,
              lineStart: start,
              lineEnd: end,
              codeExcerpt: excerpt,
              commitSha,
              confidence: 94
            }
          };
        }
      }

      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'partial',
          explanation: `Partial evidence: Database-related file detected at ${dbFiles[0]}, but without explicit table definitions or query logic.`,
          repoFullName,
          filePath: dbFiles[0],
          commitSha,
          confidence: 65
        }
      };
    }

    case 'req-testing': {
      const testFiles = filePaths.filter(p =>
        /(?:\.test\.(ts|js|jsx|tsx)$|\.spec\.(ts|js|jsx|tsx)$|test_.*\.py$|_test\.go$|tests?\/)/i.test(p)
      );

      if (testFiles.length === 0) {
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'not_demonstrated',
            explanation: 'Not demonstrated in the analyzed repositories. No unit, integration, or automated test files were found.',
            repoFullName,
            commitSha,
            confidence: 95
          }
        };
      }

      for (const candidate of testFiles.slice(0, 3)) {
        const content = await getFile(candidate);
        if (!content) continue;

        const lines = content.split('\n');
        let matchedLine = -1;

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (/(?:test\(|it\(|describe\(|expect\(|assert\s+|def\s+test_|self\.assertEqual)/i.test(l)) {
            matchedLine = i + 1;
            break;
          }
        }

        if (matchedLine !== -1) {
          const start = Math.max(1, matchedLine - 2);
          const end = Math.min(lines.length, matchedLine + 15);
          const excerpt = lines.slice(start - 1, end).join('\n');

          return {
            evidence: {
              requirementId: req.id,
              requirementTitle: req.title,
              status: 'demonstrated',
              explanation: `Demonstrated in ${candidate}. Contains active automated test cases with verifiable assertions and test suites.`,
              repoFullName,
              filePath: candidate,
              lineStart: start,
              lineEnd: end,
              codeExcerpt: excerpt,
              commitSha,
              confidence: 96
            }
          };
        }
      }

      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'partial',
          explanation: `Partial evidence: Test scaffolding exists in ${testFiles[0]}, but no executable assertions or test suites were verified.`,
          repoFullName,
          filePath: testFiles[0],
          commitSha,
          confidence: 60
        }
      };
    }

    case 'req-devops': {
      const dockerFile = filePaths.find(p => /(?:Dockerfile|docker-compose\.ya?ml|Containerfile)/i.test(p));

      if (!dockerFile) {
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'not_demonstrated',
            explanation: 'Not demonstrated in the analyzed repositories. No Dockerfile, docker-compose, or container build specifications were discovered.',
            repoFullName,
            commitSha,
            confidence: 95
          }
        };
      }

      const content = await getFile(dockerFile);
      if (content && /(?:FROM\s+|services:|version:)/i.test(content)) {
        const lines = content.split('\n');
        const start = 1;
        const end = Math.min(lines.length, 18);
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'demonstrated',
            explanation: `Demonstrated in ${dockerFile}. Defines containerization specifications, base images, and runtime dependencies.`,
            repoFullName,
            filePath: dockerFile,
            lineStart: start,
            lineEnd: end,
            codeExcerpt: lines.slice(0, end).join('\n'),
            commitSha,
            confidence: 95
          }
        };
      }

      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'partial',
          explanation: `Partial evidence: Docker configuration file found at ${dockerFile}, but base image or build instructions are incomplete.`,
          repoFullName,
          filePath: dockerFile,
          commitSha,
          confidence: 70
        }
      };
    }

    case 'req-cicd': {
      const ciFile = filePaths.find(p => /(?:\.github\/workflows\/.*\.ya?ml|\.gitlab-ci\.yml|Jenkinsfile)/i.test(p));

      if (!ciFile) {
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'not_demonstrated',
            explanation: 'Not demonstrated in the analyzed repositories. No CI/CD workflows or pipeline configurations found in .github/workflows.',
            repoFullName,
            commitSha,
            confidence: 95
          }
        };
      }

      const content = await getFile(ciFile);
      if (content && /(?:jobs:|on:|runs-on:|steps:)/i.test(content)) {
        const lines = content.split('\n');
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'demonstrated',
            explanation: `Demonstrated in ${ciFile}. Configures automated CI pipeline runs on push/pull-request triggers.`,
            repoFullName,
            filePath: ciFile,
            lineStart: 1,
            lineEnd: Math.min(lines.length, 20),
            codeExcerpt: lines.slice(0, 20).join('\n'),
            commitSha,
            confidence: 96
          }
        };
      }

      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'partial',
          explanation: `Partial evidence: CI workflow file exists at ${ciFile}, but contains minimal or commented steps.`,
          repoFullName,
          filePath: ciFile,
          commitSha,
          confidence: 65
        }
      };
    }

    case 'req-typescript': {
      const tsFiles = filePaths.filter(p => /\.(ts|tsx)$/.test(p));
      const tsConfig = filePaths.find(p => /tsconfig\.json$/i.test(p));

      if (tsFiles.length === 0 && !tsConfig) {
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'not_demonstrated',
            explanation: 'Not demonstrated in the analyzed repositories. The codebase does not use TypeScript configuration or typed files.',
            repoFullName,
            commitSha,
            confidence: 95
          }
        };
      }

      // Check tsconfig or first ts file
      const sampleFile = tsFiles[0] || tsConfig!;
      const content = await getFile(sampleFile);
      const lines = (content || '').split('\n');

      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'demonstrated',
          explanation: `Demonstrated across ${tsFiles.length} TypeScript files (e.g., ${sampleFile}) with static type definitions.`,
          repoFullName,
          filePath: sampleFile,
          lineStart: 1,
          lineEnd: Math.min(lines.length, 16),
          codeExcerpt: lines.slice(0, 16).join('\n'),
          commitSha,
          confidence: 98
        }
      };
    }

    case 'req-frontend': {
      const feFiles = filePaths.filter(p =>
        /(?:src\/app\/|components\/|pages\/|views\/|\.(jsx|tsx)$)/i.test(p)
      );

      if (feFiles.length === 0) {
        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'not_demonstrated',
            explanation: 'Not demonstrated in the analyzed repositories. No frontend components, pages, or user interface templates found.',
            repoFullName,
            commitSha,
            confidence: 90
          }
        };
      }

      const sample = feFiles[0];
      const content = await getFile(sample);
      const lines = (content || '').split('\n');

      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'demonstrated',
          explanation: `Demonstrated in ${sample}. Implements modern UI components with modular markup and styling.`,
          repoFullName,
          filePath: sample,
          lineStart: 1,
          lineEnd: Math.min(lines.length, 18),
          codeExcerpt: lines.slice(0, 18).join('\n'),
          commitSha,
          confidence: 92
        }
      };
    }

    case 'req-git': {
      const readme = filePaths.find(p => /^readme\.md$/i.test(p));
      const gitignore = filePaths.find(p => /^\.gitignore$/i.test(p));

      if (readme || gitignore) {
        const target = readme || gitignore!;
        const content = await getFile(target);
        const lines = (content || '').split('\n');

        return {
          evidence: {
            requirementId: req.id,
            requirementTitle: req.title,
            status: 'demonstrated',
            explanation: `Demonstrated in ${target}. Maintains standard repository hygiene, documentation, and version control configuration.`,
            repoFullName,
            filePath: target,
            lineStart: 1,
            lineEnd: Math.min(lines.length, 15),
            codeExcerpt: lines.slice(0, 15).join('\n'),
            commitSha,
            confidence: 90
          }
        };
      }

      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'partial',
          explanation: 'Partial evidence: Git repository tracked, but missing standard README.md or .gitignore configuration.',
          repoFullName,
          commitSha,
          confidence: 70
        }
      };
    }

    default: {
      return {
        evidence: {
          requirementId: req.id,
          requirementTitle: req.title,
          status: 'not_demonstrated',
          explanation: 'Not demonstrated in the analyzed repositories.',
          repoFullName,
          commitSha,
          confidence: 80
        }
      };
    }
  }
}

function createGapTask(req: InternshipRequirement, evidence: RepositoryEvidence): GapTask {
  const taskMap: Record<string, Partial<GapTask>> = {
    'req-testing': {
      title: 'Implement Automated Unit & Integration Tests',
      description: 'Add a robust test suite covering core business logic and API endpoints.',
      expectedEvidence: 'A test directory (e.g., tests/ or __tests__/) containing executable test suites with explicit assertions (expect / assert) and passing coverage.',
      acceptanceCriteria: [
        'Create a test suite testing at least one key service or endpoint.',
        'Include both happy-path assertions and edge-case handling.',
        'Configure test runner scripts in package.json or pyproject.toml.'
      ],
      suggestedFiles: ['tests/api.test.ts', 'src/__tests__/service.test.ts'],
      projectBrief: {
        overview: 'Testing proves that your code works reliably and prevents regressions in production.',
        suggestedScope: 'Write 3-5 unit tests focusing on validation, error codes, and expected output.',
        implementationHints: [
          'Use Jest, Vitest, or PyTest depending on your stack.',
          'Mock external network dependencies to keep tests fast and deterministic.',
          'Verify that commit webhooks detect new *.test.ts files.'
        ],
        verificationMethod: 'ProofLoop webhook will scan newly committed test files and verify assertion statements to promote this skill.'
      }
    },
    'req-devops': {
      title: 'Containerize Service with Multi-Stage Dockerfile',
      description: 'Add an optimized Dockerfile and container configuration for reproducible deployments.',
      expectedEvidence: 'A root Dockerfile specifying base images, dependency installation, non-root user setup, and entrypoint command.',
      acceptanceCriteria: [
        'Add a Dockerfile in repository root.',
        'Use multi-stage build to keep final image footprint small.',
        'Include a .dockerignore file excluding node_modules or cache files.'
      ],
      suggestedFiles: ['Dockerfile', '.dockerignore'],
      projectBrief: {
        overview: 'Containerization guarantees environment parity across development, staging, and production environments.',
        suggestedScope: 'Define builder and runner stages for your primary backend or web service.',
        implementationHints: [
          'Choose official slim or alpine base images.',
          'Expose appropriate application ports.',
          'Avoid hardcoding secret environment variables inside the image.'
        ],
        verificationMethod: 'ProofLoop webhook will parse the new Dockerfile and promote Docker & Containerization to Demonstrated.'
      }
    },
    'req-cicd': {
      title: 'Configure GitHub Actions CI Workflow',
      description: 'Create an automated CI workflow that runs linting, type-checking, and tests on push.',
      expectedEvidence: 'A YAML workflow file in .github/workflows/ specifying trigger events and job execution steps.',
      acceptanceCriteria: [
        'Create .github/workflows/ci.yml with on: [push, pull_request] triggers.',
        'Add checkout, runtime setup, dependency install, and test execution steps.',
        'Ensure workflow runs cleanly on main branch.'
      ],
      suggestedFiles: ['.github/workflows/ci.yml'],
      projectBrief: {
        overview: 'Continuous Integration automates code validation on every pull request.',
        suggestedScope: 'Single workflow job that installs dependencies and runs the test command.',
        implementationHints: [
          'Use actions/checkout@v4 and actions/setup-node@v4.',
          'Cache dependency directories to accelerate pipeline execution.'
        ],
        verificationMethod: 'ProofLoop webhook will detect the new GitHub Actions workflow file upon commit.'
      }
    },
    'req-db': {
      title: 'Design Relational Schema & Migration Logic',
      description: 'Add a persistent SQL schema, migration directory, or ORM model definitions.',
      expectedEvidence: 'A schema file (e.g. schema.sql, schema.prisma, or migrations/*.sql) defining relational tables, keys, and indexes.',
      acceptanceCriteria: [
        'Define relational entities with primary and foreign keys.',
        'Add index definitions for frequently queried lookup columns.',
        'Write migration scripts or ORM mapping files.'
      ],
      suggestedFiles: ['db/schema.sql', 'prisma/schema.prisma'],
      projectBrief: {
        overview: 'Production applications require persistent, structured, and normalized data stores.',
        suggestedScope: 'Create tables representing the primary entities in your domain model.',
        implementationHints: [
          'Specify explicit data types (VARCHAR, TIMESTAMP, UUID, INTEGER).',
          'Include created_at and updated_at tracking columns.'
        ],
        verificationMethod: 'ProofLoop webhook parses committed SQL/schema files and updates Database Design status.'
      }
    },
    'req-api': {
      title: 'Build Structured REST API Endpoints with Validation',
      description: 'Create modular HTTP route handlers with status code management and request validation.',
      expectedEvidence: 'Controller or route files containing GET/POST endpoints with input validation and HTTP status codes.',
      acceptanceCriteria: [
        'Implement at least 2 distinct REST endpoints (e.g. GET /items, POST /items).',
        'Handle client error cases with 400 Bad Request responses.',
        'Return structured JSON payloads.'
      ],
      suggestedFiles: ['src/api/routes.ts', 'server/api/items.py'],
      projectBrief: {
        overview: 'API development is fundamental to connecting distributed clients and services.',
        suggestedScope: 'Build endpoints that process parameters, query data, and return typed responses.',
        implementationHints: [
          'Separate route definitions from business logic and controllers.',
          'Validate incoming payload shapes before processing.'
        ],
        verificationMethod: 'ProofLoop webhook identifies HTTP route decorators and methods in new code.'
      }
    }
  };

  const defaultTask = taskMap[req.id] || {
    title: `Implement ${req.title}`,
    description: `Add tangible code demonstrating ${req.title.toLowerCase()} to the repository.`,
    expectedEvidence: `Source code files, tests, or configurations implementing ${req.title}.`,
    acceptanceCriteria: [
      `Write production code demonstrating ${req.title}.`,
      'Commit and push the changes to your monitored GitHub repository.'
    ],
    suggestedFiles: ['src/service.ts'],
    projectBrief: {
      overview: `Demonstrating ${req.title} provides concrete proof for the internship posting.`,
      suggestedScope: 'Build a focused module solving a real problem in your project.',
      implementationHints: ['Follow industry standards and document usage.'],
      verificationMethod: 'ProofLoop reassessment detects the new code during the next push event.'
    }
  };

  return {
    id: `task-${req.id}-${Date.now().toString(36)}`,
    requirementId: req.id,
    requirementTitle: req.title,
    category: req.category,
    title: defaultTask.title!,
    description: defaultTask.description!,
    expectedEvidence: defaultTask.expectedEvidence!,
    acceptanceCriteria: defaultTask.acceptanceCriteria || [],
    suggestedFiles: defaultTask.suggestedFiles || [],
    projectBrief: defaultTask.projectBrief || {
      overview: '',
      suggestedScope: '',
      implementationHints: [],
      verificationMethod: ''
    },
    status: 'pending'
  };
}
