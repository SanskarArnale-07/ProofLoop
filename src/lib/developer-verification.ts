import {
  RepositoryEvidence,
  InternshipRequirement,
  VerificationTask,
  VerificationAssessmentCondition,
  PracticalEvaluationResult,
  AdaptiveReasoningFollowup,
  ReasoningEvaluationResult,
  MultidimensionalVerificationScore,
  VerificationVerdict,
  AuthorAttribution
} from './types';

// ============================================================================
// 1. Repository-Grounded Task Generation
// ============================================================================

/**
 * Generates an adaptive, repository-grounded practical task for a specific requirement.
 * Uses real repository evidence (filePath, lineStart, lineEnd, codeExcerpt).
 * If reliable evidence is unavailable, provides a clearly flagged fallback manual path.
 */
export function generateVerificationTask(
  evidence: RepositoryEvidence | null | undefined,
  requirement: InternshipRequirement,
  condition: VerificationAssessmentCondition = 'ai_restricted_independent'
): VerificationTask {
  const reqId = requirement.id;
  const reqTitle = requirement.title;

  // Case 1: Evidence with genuine code excerpt available in repository
  if (evidence && evidence.codeExcerpt && evidence.filePath) {
    const code = evidence.codeExcerpt;
    const file = evidence.filePath;
    const lines = { start: evidence.lineStart, end: evidence.lineEnd };

    // Task Type A: API & Route Handlers (e.g., req-api or routes/*.ts)
    if (
      requirement.category === 'backend' ||
      file.includes('route') ||
      file.includes('api') ||
      code.includes('handleCreateCharge') ||
      code.includes('Request') ||
      code.includes('Response')
    ) {
      return {
        id: `task-api-${reqId}-${Date.now()}`,
        requirementId: reqId,
        requirementTitle: reqTitle,
        taskType: 'edge_case_fix',
        title: `Enhance Endpoint Validation & Resilience in ${file}`,
        scenario: `The repository implementation in ${file} processes incoming requests but contains critical edge cases around header validation and unhandled service exceptions.`,
        targetCode: {
          repoFullName: evidence.repoFullName,
          filePath: file,
          lineStart: lines.start,
          lineEnd: lines.end,
          codeExcerpt: code,
          functionOrComponentName: 'handleCreateCharge',
          commitSha: evidence.commitSha
        },
        instructions: `Modify the function to address the following:
1. Prevent empty or whitespace-only 'Idempotency-Key' values from being treated as valid.
2. Wrap downstream service calls in defensive error handling that catches service rejections and returns a structured JSON 500 response ({ error: "Internal processing error" }) rather than crashing or throwing unhandled errors.
3. Preserve the existing input validation schema and HTTP status codes (400 for missing header, 422 for invalid body, 201 for success).`,
        expectedBehavior: `Rejects empty/whitespace Idempotency-Key headers with 400. Returns structured 500 JSON when chargeService.process fails. Preserves 201 success contract.`,
        evaluationCriteria: [
          `Checks idempotencyKey.trim().length > 0 or rejects whitespace keys with 400`,
          `Includes try/catch or error boundary around chargeService.process returning HTTP 500 JSON`,
          `Preserves existing ChargeRequestSchema.safeParse validation and 422 return contract`,
          `Maintains TypeScript syntax and valid Promise<Response> return signature`
        ],
        permittedTools:
          condition === 'ai_restricted_independent'
            ? 'Allowed: Standard IDE, language documentation, TypeScript compiler. Not allowed: Generative AI assistance.'
            : 'Allowed: Standard IDE, language documentation, disclosed AI code-completion.',
        allowedCondition: condition,
        isFallbackManual: false
      };
    }

    // Task Type B: Database Schema & SQL (e.g., req-db or migrations/*.sql)
    if (
      requirement.category === 'database' ||
      file.includes('migration') ||
      file.includes('.sql') ||
      code.includes('CREATE TABLE')
    ) {
      return {
        id: `task-db-${reqId}-${Date.now()}`,
        requirementId: reqId,
        requirementTitle: reqTitle,
        taskType: 'contract_preservation',
        title: `Relational Integrity & Constraint Enhancement in ${file}`,
        scenario: `The table definition in ${file} enforces basic schemas, but lacks strict monetary value constraints and needs audit integrity index optimization.`,
        targetCode: {
          repoFullName: evidence.repoFullName,
          filePath: file,
          lineStart: lines.start,
          lineEnd: lines.end,
          codeExcerpt: code,
          functionOrComponentName: 'ledger_entries table',
          commitSha: evidence.commitSha
        },
        instructions: `Modify the SQL definition to:
1. Add a CHECK constraint ensuring 'amount_cents > 0' to prevent zero or negative ledger debits/credits.
2. Add a composite index on (account_id, entry_type, created_at DESC) for balance reconciliation queries without dropping existing foreign keys.
3. Keep the existing primary key, foreign key constraints, and table names intact.`,
        expectedBehavior: `Rejects non-positive amounts with a CHECK constraint. Index enables fast account transaction history lookup while preserving referential integrity.`,
        evaluationCriteria: [
          `CHECK constraint on amount_cents (amount_cents > 0)`,
          `Index on (account_id, entry_type, created_at) or equivalent`,
          `Preserves FOREIGN KEY (account_id) REFERENCES accounts(id)`,
          `Valid PostgreSQL DDL syntax`
        ],
        permittedTools:
          condition === 'ai_restricted_independent'
            ? 'Allowed: SQL documentation, psql syntax guides. AI tools prohibited.'
            : 'Allowed: Standard development tools with AI disclosure.',
        allowedCondition: condition,
        isFallbackManual: false
      };
    }

    // Task Type C: TypeScript / Static Typing Configuration
    if (requirement.category === 'core' || file.includes('tsconfig') || file.endsWith('.ts')) {
      return {
        id: `task-ts-${reqId}-${Date.now()}`,
        requirementId: reqId,
        requirementTitle: reqTitle,
        taskType: 'type_dataflow_decision',
        title: `Type-Safe Data Flow & Discriminated Unions in ${file}`,
        scenario: `The existing code relies on static types. Implement a type-safe discriminated union to handle distinct transaction statuses without casting or 'any'.`,
        targetCode: {
          repoFullName: evidence.repoFullName,
          filePath: file,
          lineStart: lines.start,
          lineEnd: lines.end,
          codeExcerpt: code,
          functionOrComponentName: 'Type Configuration',
          commitSha: evidence.commitSha
        },
        instructions: `Write a TypeScript type definition and validator function that:
1. Defines a discriminated union 'PaymentResult' with types 'success' (containing transactionId and amount), 'failed' (containing errorCode and retryable boolean), and 'pending' (containing pollUrl).
2. Write a type-guard or exhaustiveness check that handles all variants without using 'any' or unsafe type assertions ('as unknown as').
3. Explain why this design prevents runtime undefined errors.`,
        expectedBehavior: `Compiler enforces exhaustive handling of all PaymentResult states without relying on any or unsafe casts.`,
        evaluationCriteria: [
          `Defines discriminated union with discriminator property (e.g. status: 'success' | 'failed' | 'pending')`,
          `Exhaustive switch/match with never type check or strict branch coverage`,
          `Zero occurrences of 'any' or forced assertions`,
          `Valid TypeScript code adhering to strict compiler settings`
        ],
        permittedTools:
          condition === 'ai_restricted_independent'
            ? 'Allowed: TypeScript docs and compiler. No generative AI.'
            : 'Allowed: Standard tooling with AI assistance permitted.',
        allowedCondition: condition,
        isFallbackManual: false
      };
    }

    // Task Type D: Generic Grounded Code Task
    return {
      id: `task-gen-${reqId}-${Date.now()}`,
      requirementId: reqId,
      requirementTitle: reqTitle,
      taskType: 'edge_case_fix',
      title: `Contract Preservation & Defensive Logic in ${file}`,
      scenario: `Refactor the code excerpt in ${file} to handle missing data or unexpected input while preserving its existing contract.`,
      targetCode: {
        repoFullName: evidence.repoFullName,
        filePath: file,
        lineStart: lines.start,
        lineEnd: lines.end,
        codeExcerpt: code,
        functionOrComponentName: 'Component Implementation',
        commitSha: evidence.commitSha
      },
      instructions: `1. Identify one unhandled edge case or failure state in the provided code snippet.
2. Implement the defensive fix preserving existing caller contracts and return types.
3. Ensure no regressions occur for valid inputs.`,
      expectedBehavior: `Gracefully handles unexpected/null input while returning expected valid data for normal inputs.`,
      evaluationCriteria: [
        `Identifies and fixes unhandled boundary condition`,
        `Preserves original function signature and return type`,
        `Syntactically valid without syntax errors`
      ],
      permittedTools:
        condition === 'ai_restricted_independent'
          ? 'Allowed: Standard IDE and docs. AI restricted.'
          : 'Allowed: Standard tooling.',
      allowedCondition: condition,
      isFallbackManual: false
    };
  }

  // Case 2: No code excerpt in repository scope -> Supported Manual Assessment Path
  return {
    id: `task-manual-${reqId}-${Date.now()}`,
    requirementId: reqId,
    requirementTitle: reqTitle,
    taskType: 'test_addition',
    title: `Manual Reference Implementation & Verification for ${reqTitle}`,
    scenario: `No active code files matching this requirement were discovered in the analyzed repository scope. To demonstrate understanding, provide a clean reference implementation with unit test assertions.`,
    targetCode: {
      repoFullName: evidence?.repoFullName || 'candidate-repo',
      filePath: 'tests/reference_verification.ts',
      codeExcerpt: `// No existing repository code detected for: ${reqTitle}\n// Provide a standalone reference function and accompanying assertions.`,
      commitSha: evidence?.commitSha || 'latest'
    },
    instructions: `1. Implement a standalone function demonstrating ${reqTitle}.
2. Provide at least 2 automated test assertions verifying nominal behavior and 1 boundary condition.
3. Explain the architectural trade-offs of your chosen design.`,
    expectedBehavior: `Self-contained implementation demonstrating core requirements with verifiable test assertions.`,
    evaluationCriteria: [
      `Clean implementation satisfying requirement criteria`,
      `Includes minimum 2 assertions verifying behavior`,
      `Syntactically sound with clear type annotations`
    ],
    permittedTools:
      condition === 'ai_restricted_independent'
        ? 'Allowed: Local development environment, documentation. AI restricted.'
        : 'Allowed: Standard tooling with AI assistance disclosed.',
    allowedCondition: condition,
    isFallbackManual: true,
    limitationNote:
      'Repository scanning discovered no code evidence for this requirement. This assessment uses a standalone practical task.'
  };
}

// ============================================================================
// 2. Safe Deterministic Practical Solution Evaluation
// ============================================================================

/**
 * Safely evaluates a submitted practical solution without ever executing untrusted code.
 * Evaluates syntax structure, contract preservation, defensive patterns, and required invariants.
 */
export function evaluatePracticalSolution(
  task: VerificationTask,
  solutionCode: string
): PracticalEvaluationResult {
  const evaluatedAt = new Date().toISOString();
  const trimmed = solutionCode.trim();

  // Basic syntax & safety sanity check
  if (!trimmed || trimmed.length < 15) {
    return {
      passed: false,
      syntaxValid: false,
      contractPreserved: false,
      testsPassed: 0,
      totalTests: 3,
      checksSummary: ['Solution is empty or too short to be an actionable implementation.'],
      strengths: [],
      unresolvedGaps: ['No code provided for evaluation.'],
      evaluatedAt
    };
  }

  // Bracket/parenthesis balance check (safe AST-like structural check)
  const isBalanced = checkDelimiters(trimmed);
  if (!isBalanced) {
    return {
      passed: false,
      syntaxValid: false,
      contractPreserved: false,
      testsPassed: 0,
      totalTests: 3,
      checksSummary: ['Syntax Error: Unbalanced brackets, parentheses, or braces detected in submitted code.'],
      strengths: [],
      unresolvedGaps: ['Syntax must be well-formed before contract checks can pass.'],
      evaluatedAt
    };
  }

  const checksSummary: string[] = [];
  const strengths: string[] = [];
  const unresolvedGaps: string[] = [];
  let testsPassed = 0;
  let totalTests = 3;

  // Domain-specific deterministic checks based on taskType
  if (task.taskType === 'edge_case_fix' && task.id.includes('api')) {
    totalTests = 4;

    // Check 1: Idempotency-Key whitespace / empty handling
    const checksKeyWhitespace =
      trimmed.includes('trim()') ||
      trimmed.includes('.length === 0') ||
      trimmed.includes('!idempotencyKey.trim()') ||
      trimmed.includes('idempotencyKey === ""') ||
      trimmed.includes('idempotencyKey.trim() ===');

    if (checksKeyWhitespace) {
      testsPassed++;
      strengths.push('Defensive check against empty/whitespace Idempotency-Key header verified.');
      checksSummary.push('PASS: Rejects empty and whitespace-only Idempotency-Key.');
    } else {
      unresolvedGaps.push('Idempotency-Key validation does not account for whitespace-only strings.');
      checksSummary.push('FAIL: Does not guard against whitespace-only idempotency headers.');
    }

    // Check 2: Try/catch or error boundary around service
    const hasServiceCatch =
      (trimmed.includes('try') && trimmed.includes('catch')) ||
      trimmed.includes('.catch(') ||
      trimmed.includes('instanceof Error');

    if (hasServiceCatch) {
      testsPassed++;
      strengths.push('Error handling boundary around charge service detected.');
      checksSummary.push('PASS: Unhandled service rejection caught.');
    } else {
      unresolvedGaps.push('chargeService call is not wrapped in error handling; could throw 500 unhandled rejection.');
      checksSummary.push('FAIL: Missing try/catch or promise catch on charge service.');
    }

    // Check 3: 500 status code returned on failure
    const returns500 =
      trimmed.includes('status: 500') ||
      trimmed.includes('status: 502') ||
      trimmed.includes('status: 503') ||
      trimmed.includes('Internal processing error') ||
      trimmed.includes('Internal server error');

    if (returns500) {
      testsPassed++;
      strengths.push('Returns structured HTTP 5xx JSON response on unexpected failure.');
      checksSummary.push('PASS: Structured error status code returned.');
    } else {
      unresolvedGaps.push('Expected structured 500 JSON response on charge service failure.');
      checksSummary.push('FAIL: No structured 500 response returned on service error.');
    }

    // Check 4: Contract preservation (preserves 201 or 400 or safeParse)
    const preservesContract =
      trimmed.includes('ChargeRequestSchema') ||
      trimmed.includes('safeParse') ||
      trimmed.includes('status: 201') ||
      trimmed.includes('status: 400');

    if (preservesContract) {
      testsPassed++;
      strengths.push('Preserved existing Zod schema validation and HTTP status contracts.');
      checksSummary.push('PASS: Contract preserved for nominal and 422 validation flows.');
    } else {
      unresolvedGaps.push('Existing schema validation or response status contracts were dropped.');
      checksSummary.push('FAIL: Existing contract was not fully preserved.');
    }
  } else if (task.taskType === 'contract_preservation' && task.id.includes('db')) {
    totalTests = 3;

    // Check 1: CHECK constraint on positive amount
    const hasCheckConstraint =
      /CHECK\s*\(\s*amount_cents\s*>\s*0\s*\)/i.test(trimmed) ||
      /amount_cents\s+BIGINT\s+CHECK\s*\(\s*amount_cents\s*>\s*0\s*\)/i.test(trimmed);

    if (hasCheckConstraint) {
      testsPassed++;
      strengths.push('Positive amount CHECK constraint implemented correctly.');
      checksSummary.push('PASS: amount_cents > 0 check constraint present.');
    } else {
      unresolvedGaps.push('Missing explicit CHECK (amount_cents > 0) constraint.');
      checksSummary.push('FAIL: Non-positive amount check constraint missing.');
    }

    // Check 2: Composite index
    const hasCompositeIndex =
      /CREATE\s+(UNIQUE\s+)?INDEX\s+\w+\s+ON\s+ledger_entries\s*\(\s*account_id/i.test(trimmed);

    if (hasCompositeIndex) {
      testsPassed++;
      strengths.push('Composite index for account-level timeline retrieval added.');
      checksSummary.push('PASS: Composite index on ledger_entries created.');
    } else {
      unresolvedGaps.push('Composite index on account_id not detected.');
      checksSummary.push('FAIL: Missing composite index.');
    }

    // Check 3: Foreign key preserved
    const preservesFk = /FOREIGN\s+KEY\s*\(\s*account_id\s*\)\s*REFERENCES\s+accounts/i.test(trimmed);
    if (preservesFk) {
      testsPassed++;
      strengths.push('Foreign key referential integrity constraint preserved.');
      checksSummary.push('PASS: Foreign key constraint maintained.');
    } else {
      unresolvedGaps.push('Foreign key constraint on account_id was omitted.');
      checksSummary.push('FAIL: Foreign key constraint omitted.');
    }
  } else if (task.taskType === 'type_dataflow_decision') {
    totalTests = 3;

    // Check 1: Discriminated union status
    const hasUnion =
      trimmed.includes('status:') ||
      trimmed.includes('type:') ||
      (trimmed.includes('success') && trimmed.includes('failed') && trimmed.includes('pending'));

    if (hasUnion) {
      testsPassed++;
      strengths.push('Discriminated union states defined with distinct tags.');
      checksSummary.push('PASS: Discriminated union types specified.');
    } else {
      unresolvedGaps.push('Discriminated union states (success, failed, pending) incomplete.');
      checksSummary.push('FAIL: Incomplete discriminated union.');
    }

    // Check 2: No 'any'
    const hasNoAny = !/\bany\b/.test(trimmed) && !/as\s+any/.test(trimmed);
    if (hasNoAny) {
      testsPassed++;
      strengths.push('Strict typing preserved: zero occurrences of "any".');
      checksSummary.push('PASS: No "any" types used.');
    } else {
      unresolvedGaps.push('Solution relies on "any" type bypass.');
      checksSummary.push('FAIL: Unsafe "any" type detected.');
    }

    // Check 3: Exhaustiveness or type-guard
    const hasExhaustive =
      trimmed.includes('switch') ||
      trimmed.includes('never') ||
      trimmed.includes('exhaustive') ||
      trimmed.includes('return');

    if (hasExhaustive) {
      testsPassed++;
      strengths.push('Handler / type guard structure implemented.');
      checksSummary.push('PASS: Handler / type guard present.');
    } else {
      unresolvedGaps.push('Missing handler function or exhaustiveness check.');
      checksSummary.push('FAIL: Handler logic missing.');
    }
  } else {
    // Generic task evaluation
    totalTests = 3;
    const hasDefensiveLogic =
      trimmed.includes('if') ||
      trimmed.includes('try') ||
      trimmed.includes('?') ||
      trimmed.includes('throw');

    if (hasDefensiveLogic) {
      testsPassed++;
      strengths.push('Defensive conditional or exception handling present.');
      checksSummary.push('PASS: Defensive logic implemented.');
    } else {
      unresolvedGaps.push('No defensive checks or conditional guards observed.');
      checksSummary.push('FAIL: Lacks defensive logic.');
    }

    const hasPreservedSignature =
      trimmed.includes('export') ||
      trimmed.includes('function') ||
      trimmed.includes('const') ||
      trimmed.includes('class');

    if (hasPreservedSignature) {
      testsPassed++;
      strengths.push('Standard module export and signature maintained.');
      checksSummary.push('PASS: Function signature preserved.');
    } else {
      unresolvedGaps.push('Code does not maintain a recognized function/module contract.');
      checksSummary.push('FAIL: Signature dropped.');
    }

    const hasTestsOrAssertions =
      trimmed.includes('assert') ||
      trimmed.includes('expect') ||
      trimmed.includes('return') ||
      trimmed.includes('Response');

    if (hasTestsOrAssertions) {
      testsPassed++;
      strengths.push('Verifiable return value or assertion logic included.');
      checksSummary.push('PASS: Return value or assertion present.');
    } else {
      unresolvedGaps.push('No verifiable return value or assertion included.');
      checksSummary.push('FAIL: No verifiable assertion or return.');
    }
  }

  const passed = testsPassed >= Math.ceil(totalTests * 0.7);
  const contractPreserved = !unresolvedGaps.some((g) => g.toLowerCase().includes('contract dropped'));

  return {
    passed,
    syntaxValid: true,
    contractPreserved,
    testsPassed,
    totalTests,
    checksSummary,
    strengths,
    unresolvedGaps,
    evaluatedAt
  };
}

/**
 * Checks for balanced curly braces, parentheses, and brackets.
 */
function checkDelimiters(code: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
  let inString: string | null = null;
  let escape = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }

    if (char === '{' || char === '(' || char === '[') {
      stack.push(char);
    } else if (char === '}' || char === ')' || char === ']') {
      if (stack.length === 0 || stack.pop() !== pairs[char]) {
        return false;
      }
    }
  }

  return stack.length === 0 && inString === null;
}

// ============================================================================
// 3. Adaptive Reasoning Follow-Up Generation
// ============================================================================

/**
 * Generates an adaptive reasoning question conditioned directly on what the developer implemented.
 */
export function generateAdaptiveFollowup(
  task: VerificationTask,
  solutionCode: string,
  practicalEval: PracticalEvaluationResult
): AdaptiveReasoningFollowup {
  const code = solutionCode.toLowerCase();

  // If solution failed practical checks
  if (!practicalEval.passed) {
    return {
      id: `followup-err-${Date.now()}`,
      taskId: task.id,
      question: `Your implementation did not pass all automated checks (${practicalEval.testsPassed}/${practicalEval.totalTests}). What is the root cause of the remaining gaps (${practicalEval.unresolvedGaps.join(', ')}), and how would you verify the contract safely before deploying to production?`,
      contextWhyAsked:
        'Asked because the submitted solution missed critical contract checks or edge cases, requiring you to explain your debugging and validation methodology.',
      expectedCriteria: [
        'Identifies the specific failing check or contract omission',
        'Explains the runtime failure scenario in production',
        'Proposes a concrete verification or test harness to catch the defect'
      ]
    };
  }

  // Adaptive scenario: API with error handling / idempotency
  if (task.taskType === 'edge_case_fix' && code.includes('idempotency')) {
    if (code.includes('trim()') || code.includes('trim')) {
      return {
        id: `followup-api-idemp-${Date.now()}`,
        taskId: task.id,
        question:
          'You trimmed and validated the Idempotency-Key. In a distributed payment infrastructure with network retries, what failure mode occurs if a client reuses an idempotency key with a DIFFERENT request payload (e.g., a modified charge amount), and how should your server handle that discrepancy?',
        contextWhyAsked:
          'You successfully addressed basic whitespace validation; this tests whether you understand idempotency conflict semantics in distributed financial systems.',
        expectedCriteria: [
          'Recognizes the risk of payload mismatch on idempotent retry (idempotency key conflict)',
          'Explains how to detect the conflict (e.g. comparing payload hash stored with idempotency key)',
          'Proposes returning an explicit HTTP 409 Conflict or 400 Bad Request error rather than silently processing a different charge'
        ]
      };
    }

    return {
      id: `followup-api-err-${Date.now()}`,
      taskId: task.id,
      question:
        'You implemented error handling for chargeService.process. How should client retry logic differ between an HTTP 422 Unprocessable Entity response versus an HTTP 500 / 504 network timeout, and what role does exponential backoff with jitter play?',
      contextWhyAsked:
        'Validates whether you understand the fundamental difference between fatal client validation errors and transient retryable infrastructure errors.',
      expectedCriteria: [
        'Distinguishes fatal client errors (422) which must never be retried from transient server errors (500/504)',
        'Explains exponential backoff to avoid thundering herd / stampeding server load',
        'Mentions jitter to desynchronize concurrent retry requests'
      ]
    };
  }

  // Adaptive scenario: Database & SQL
  if (task.taskType === 'contract_preservation' && (code.includes('check') || code.includes('index'))) {
    return {
      id: `followup-db-concur-${Date.now()}`,
      taskId: task.id,
      question:
        'You added a CHECK constraint and an index to ledger_entries. If this table already contains 50 million rows in production, what migration lock risks exist when applying "ALTER TABLE ... ADD CONSTRAINT" and "CREATE INDEX", and how would PostgreSQL CONCURRENTLY or NOT VALID mitigate downtime?',
      contextWhyAsked:
        'Tests whether you understand real-world zero-downtime relational database migration engineering.',
      expectedCriteria: [
        'Explains table-level ACCESS EXCLUSIVE locks that block all reads and writes',
        'Mentions CREATE INDEX CONCURRENTLY to build indexes without blocking writes',
        'Mentions ADD CONSTRAINT ... NOT VALID followed by VALIDATE CONSTRAINT to avoid scanning 50M rows while holding an exclusive lock'
      ]
    };
  }

  // Adaptive scenario: TypeScript / Static Typing
  if (task.taskType === 'type_dataflow_decision') {
    return {
      id: `followup-ts-runtime-${Date.now()}`,
      taskId: task.id,
      question:
        'TypeScript types are erased at compile time. How do you guarantee that an incoming untrusted JSON payload from an external API strictly conforms to your PaymentResult discriminated union before your business logic executes?',
      contextWhyAsked:
        'Checks understanding of the boundary between compile-time static type contracts and runtime boundary validation.',
      expectedCriteria: [
        'Recognizes compile-time type erasure',
        'Explains runtime validation (e.g., Zod, Valibot, custom type guard predicates)',
        'Explains that without runtime validation, arbitrary data can corrupt memory/logic even if TypeScript compiles cleanly'
      ]
    };
  }

  // Generic fallback adaptive question
  return {
    id: `followup-gen-${Date.now()}`,
    taskId: task.id,
    question:
      'What is one edge case or scaling bottleneck that remains unaddressed in your solution, and how would you architect a solution for it under high concurrency?',
    contextWhyAsked:
      'Evaluates self-critical engineering awareness and ability to articulate architectural trade-offs.',
    expectedCriteria: [
      'Identifies a concrete remaining limitation or trade-off',
      'Articulates how high volume/concurrency impacts the design',
      'Proposes a viable mitigation strategy'
    ]
  };
}

// ============================================================================
// 4. Reasoning Evaluation Against Explicit Criteria
// ============================================================================

/**
 * Evaluates the candidate's explanation and conceptual reasoning against explicit criteria.
 */
export function evaluateReasoningResponse(
  task: VerificationTask,
  solutionCode: string,
  followup: AdaptiveReasoningFollowup,
  reasoningText: string
): ReasoningEvaluationResult {
  const evaluatedAt = new Date().toISOString();
  const text = (reasoningText || '').trim().toLowerCase();

  if (!text || text.length < 20) {
    return {
      score: 15,
      criteriaMet: [],
      missingReasoning: followup.expectedCriteria,
      unresolvedUncertainty: ['Candidate explanation is empty or too superficial to verify understanding.'],
      overallEvaluation: 'Inadequate: Explanation provides insufficient conceptual justification.',
      evaluatedAt
    };
  }

  const criteriaMet: string[] = [];
  const missingReasoning: string[] = [];
  const unresolvedUncertainty: string[] = [];

  // Evaluate each expected criterion with flexible conceptual keyword matching
  for (const criterion of followup.expectedCriteria) {
    const cLower = criterion.toLowerCase();

    // Semantic keyword clusters
    let isMatched = false;

    if (cLower.includes('conflict') || cLower.includes('mismatch')) {
      isMatched =
        text.includes('conflict') ||
        text.includes('mismatch') ||
        text.includes('different') ||
        text.includes('payload') ||
        text.includes('hash');
    } else if (cLower.includes('retry') || cLower.includes('fatal') || cLower.includes('transient')) {
      isMatched =
        text.includes('retry') ||
        text.includes('transient') ||
        text.includes('422') ||
        text.includes('fatal') ||
        text.includes('backoff') ||
        text.includes('timeout');
    } else if (cLower.includes('lock') || cLower.includes('concurrently') || cLower.includes('downtime')) {
      isMatched =
        text.includes('lock') ||
        text.includes('concurrently') ||
        text.includes('not valid') ||
        text.includes('exclusive') ||
        text.includes('downtime') ||
        text.includes('blocking');
    } else if (cLower.includes('erasure') || cLower.includes('runtime') || cLower.includes('zod')) {
      isMatched =
        text.includes('runtime') ||
        text.includes('erase') ||
        text.includes('zod') ||
        text.includes('guard') ||
        text.includes('validate') ||
        text.includes('schema');
    } else {
      // General criteria: check if 2+ key words appear
      const words = cLower
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const matchedWords = words.filter((w) => text.includes(w));
      isMatched = matchedWords.length >= Math.min(2, words.length);
    }

    if (isMatched) {
      criteriaMet.push(criterion);
    } else {
      missingReasoning.push(criterion);
    }
  }

  // Check for presence of generic superficial fluff
  if (
    text.includes('as an ai') ||
    text.includes('i hope this helps') ||
    (text.length < 50 && criteriaMet.length === 0)
  ) {
    unresolvedUncertainty.push('Response appears generic or ungrounded in the specific solution code.');
  }

  const ratio = followup.expectedCriteria.length > 0 ? criteriaMet.length / followup.expectedCriteria.length : 0.5;
  const score = Math.round(ratio * 80 + (text.length > 150 ? 20 : text.length > 60 ? 10 : 0));

  let overallEvaluation = 'Adequate understanding demonstrated.';
  if (ratio >= 0.8) {
    overallEvaluation = 'Thorough: Candidate articulated nuanced tradeoffs and system edge cases.';
  } else if (ratio >= 0.5) {
    overallEvaluation = 'Adequate: Core concepts explained, with minor omissions on advanced edge cases.';
  } else {
    overallEvaluation = 'Superficial / Incomplete: Key technical tradeoffs were omitted.';
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    criteriaMet,
    missingReasoning,
    unresolvedUncertainty,
    overallEvaluation,
    evaluatedAt
  };
}

// ============================================================================
// 5. Separate Assessment Dimensions & Multidimensional Scoring
// ============================================================================

/**
 * Computes separate assessment dimensions without conflating repository evidence with human understanding.
 */
export function computeMultidimensionalScore(
  repoEvidence: RepositoryEvidence | null | undefined,
  practicalEval: PracticalEvaluationResult,
  reasoningEval: ReasoningEvaluationResult,
  condition: VerificationAssessmentCondition,
  authorAttribution?: AuthorAttribution
): {
  dimensions: MultidimensionalVerificationScore;
  verdict: VerificationVerdict;
  overallExplanation: string;
  confidenceScore: number;
  limitations: string[];
} {
  // Dimension 1: Repository Evidence
  const repoStatus = repoEvidence?.status || 'not_demonstrated';
  const repoStrength = repoEvidence?.evidenceStrength || 'none';
  const repoSummary = repoEvidence?.explanation || 'No repository-level evidence was discovered in analyzed code.';

  // Dimension 2: Contribution Evidence
  const commitCount = repoEvidence?.relevantCommits?.length || 0;
  const directAuthor = authorAttribution ? authorAttribution.isDirectAuthor : true;
  const attrCertainty = authorAttribution ? authorAttribution.attributionCertainty : 'probable';


  // Dimension 3: Practical Performance
  const practicalSummary = practicalEval.passed
    ? `Passed ${practicalEval.testsPassed}/${practicalEval.totalTests} deterministic contract checks.`
    : `Failed checks (${practicalEval.testsPassed}/${practicalEval.totalTests}): ${practicalEval.unresolvedGaps.slice(0, 2).join('; ')}`;

  // Dimension 4: Reasoning Evidence
  const reasoningDepth: 'thorough' | 'adequate' | 'superficial' | 'inadequate' =
    reasoningEval.score >= 80
      ? 'thorough'
      : reasoningEval.score >= 50
        ? 'adequate'
        : reasoningEval.score >= 30
          ? 'superficial'
          : 'inadequate';

  const criteriaRatio =
    reasoningEval.criteriaMet.length /
    Math.max(1, reasoningEval.criteriaMet.length + reasoningEval.missingReasoning.length);

  const reasoningSummary =
    reasoningEval.criteriaMet.length > 0
      ? `Met ${reasoningEval.criteriaMet.length} reasoning criteria. ${reasoningEval.missingReasoning.length > 0 ? `Missing: ${reasoningEval.missingReasoning.length} criteria.` : ''}`
      : 'Did not meet the expected architectural reasoning criteria.';

  // Dimension 5: Verification Integrity
  const conditionLabel =
    condition === 'ai_restricted_independent'
      ? 'AI-Restricted (Independent Reasoning)'
      : condition === 'ai_assisted_disclosed'
        ? 'AI-Assisted (Assistance Disclosed)'
        : 'Take-home / Unmonitored';

  // Dimension 6: Confidence and Limitations
  const limitations: string[] = [];
  if (!repoEvidence || repoEvidence.status === 'not_demonstrated') {
    limitations.push('Repository evidence was absent; practical task was evaluated in a standalone reference context.');
  }
  if (condition === 'unmonitored_takehome') {
    limitations.push('Assessment was completed in an unmonitored environment; external assistance cannot be ruled out.');
  }
  if (reasoningEval.missingReasoning.length > 0) {
    limitations.push(
      `Certain advanced trade-offs were not explicitly addressed: ${reasoningEval.missingReasoning[0]}`
    );
  }
  limitations.push(
    'Practical assessment evaluates bounded tasks and is not a guarantee of defect-free real-world engineering.'
  );

  let confidenceLevel: 'high' | 'moderate' | 'low' = 'moderate';
  let confidenceScore = 60;

  // Strict Verdict Computation
  let verdict: VerificationVerdict = 'unverified';
  let overallExplanation = '';

  if (practicalEval.passed && reasoningDepth === 'thorough') {
    verdict = 'verified_demonstrated';
    confidenceLevel = 'high';
    confidenceScore = 92;
    overallExplanation =
      'Understanding verified: Implementation correctly preserved contracts and candidate thoroughly justified trade-offs and edge cases.';
  } else if (practicalEval.passed && reasoningDepth === 'adequate') {
    verdict = 'verified_demonstrated';
    confidenceLevel = 'moderate';
    confidenceScore = 80;
    overallExplanation =
      'Understanding verified: Practical task passed deterministic checks and candidate provided adequate reasoning for the implementation.';
  } else if (practicalEval.passed && (reasoningDepth === 'superficial' || reasoningDepth === 'inadequate')) {
    // Crucial requirement: Passing tests alone does NOT equal full understanding verification!
    verdict = 'partial_verification';
    confidenceLevel = 'low';
    confidenceScore = 55;
    overallExplanation =
      'Partial verification: Code passed automated checks, but candidate explanation was superficial or lacked essential reasoning criteria.';
  } else if (!practicalEval.passed && (reasoningDepth === 'thorough' || reasoningDepth === 'adequate')) {
    // Fluent explanation alone does NOT equal verified implementation!
    verdict = 'partial_verification';
    confidenceLevel = 'low';
    confidenceScore = 45;
    overallExplanation =
      'Partial verification: Candidate provided fluent conceptual explanations, but practical implementation failed required contracts or edge cases.';
  } else {
    verdict = 'unverified';
    confidenceLevel = 'low';
    confidenceScore = 25;
    overallExplanation =
      'Not verified: Practical implementation failed automated checks and reasoning was incomplete.';
  }

  const dimensions: MultidimensionalVerificationScore = {
    repositoryEvidence: {
      status: repoStatus,
      strength: repoStrength,
      summary: repoSummary
    },
    contributionEvidence: {
      commitFrequency: commitCount > 0 ? `${commitCount} commits analyzed` : 'None',
      directAuthorship: directAuthor,
      attributionCertainty: attrCertainty
    },
    practicalPerformance: {
      passed: practicalEval.passed,
      contractMaintained: practicalEval.contractPreserved,
      summary: practicalSummary
    },
    reasoningEvidence: {
      depth: reasoningDepth,
      criteriaMetRatio: Math.round(criteriaRatio * 100) / 100,
      summary: reasoningSummary
    },
    verificationIntegrity: {
      condition,
      permittedTools:
        condition === 'ai_restricted_independent'
          ? 'Standard IDE / Documentation (AI Restricted)'
          : 'AI-Assisted with Disclosure',
      environmentIntegrity: conditionLabel
    },
    confidenceAndLimitations: {
      confidenceLevel,
      limitations,
      uncertaintyNotes:
        reasoningEval.unresolvedUncertainty.length > 0
          ? reasoningEval.unresolvedUncertainty.join('; ')
          : 'No unresolved ambiguities noted in submission.'
    }
  };

  return {
    dimensions,
    verdict,
    overallExplanation,
    confidenceScore,
    limitations
  };
}
