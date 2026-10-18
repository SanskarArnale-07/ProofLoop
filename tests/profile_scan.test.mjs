import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);

const {
  parseGitHubUsername,
  verifyCodeExcerptInContent,
  buildRuleBasedRoleSuggestions,
  createRoleSuggestionValidator,
  suggestRolesFromVerifiedEvidence
} = jiti('../src/lib/profile-scanner.ts');

const {
  saveAssessment
} = jiti('../src/lib/db.ts');

const { SAMPLE_ASSESSMENT } = jiti('../src/lib/sample-data.ts');
const { reassessAssessment } = jiti('../src/lib/reassessment-service.ts');

function skipIfNoDb(t) {
  if (!process.env.DATABASE_URL) {
    t.skip('Skipping live database test: DATABASE_URL is not set.');
    return true;
  }
  return false;
}

test('parseGitHubUsername correctly extracts username from multiple formats', () => {
  assert.equal(parseGitHubUsername('https://github.com/alexchen'), 'alexchen');
  assert.equal(parseGitHubUsername('https://github.com/alexchen/'), 'alexchen');
  assert.equal(parseGitHubUsername('http://github.com/alexchen'), 'alexchen');
  assert.equal(parseGitHubUsername('github.com/alexchen'), 'alexchen');
  assert.equal(parseGitHubUsername('alexchen'), 'alexchen');
  assert.equal(parseGitHubUsername('@alexchen'), 'alexchen');
  assert.equal(parseGitHubUsername('https://github.com/alexchen?tab=repositories'), 'alexchen');
  assert.equal(parseGitHubUsername('  alex-chen_01  '), 'alex-chen_01');
});

test('parseGitHubUsername rejects invalid usernames and paths', () => {
  assert.equal(parseGitHubUsername(''), null);
  assert.equal(parseGitHubUsername('   '), null);
  assert.equal(parseGitHubUsername('https://notgithub.com/alexchen'), null);
  assert.equal(parseGitHubUsername('alex/repo/extra/path'), null);
  assert.equal(parseGitHubUsername('invalid username with spaces'), null);
});

test('verifyCodeExcerptInContent verifies exact and whitespace-normalized excerpts', () => {
  const fileContent = `
import { db } from './db';

export async function processPayment(id: string, amount: number) {
  if (amount <= 0) throw new Error('Invalid amount');
  return db.query('INSERT INTO transactions (id, amount) VALUES ($1, $2)', [id, amount]);
}
`;

  // Exact match
  const res1 = verifyCodeExcerptInContent(fileContent, "if (amount <= 0) throw new Error('Invalid amount');");
  assert.equal(res1.verified, true);
  assert.equal(typeof res1.lineStart, 'number');

  // Multiline match
  const res2 = verifyCodeExcerptInContent(
    fileContent,
    "export async function processPayment(id: string, amount: number) {\n  if (amount <= 0)"
  );
  assert.equal(res2.verified, true);

  // Hallucinated / fake excerpt
  const res3 = verifyCodeExcerptInContent(fileContent, "redis.set('payment:' + id, amount);");
  assert.equal(res3.verified, false);
});

test('createRoleSuggestionValidator validates roles against verified skills only', () => {
  const verifiedSkillTitles = ['REST API Development', 'PostgreSQL Database'];
  const validator = createRoleSuggestionValidator(verifiedSkillTitles);

  // Valid role matching only verified skills
  const validOutput = {
    roles: [
      {
        title: 'Backend Engineer',
        matchedSkills: ['REST API Development', 'PostgreSQL Database'],
        reason: 'Strong foundation in API design and relational database queries.'
      }
    ]
  };

  const validationResult = validator(validOutput);
  assert.equal(validationResult.isValid, true);
  assert.equal(validationResult.data?.roles.length, 1);

  // Invalid role matching an unverified skill
  const invalidOutput = {
    roles: [
      {
        title: 'Cloud Architect',
        matchedSkills: ['Kubernetes Cluster Management'], // Not in verifiedSkillTitles!
        reason: 'Demonstrated infrastructure skills in cloud environments.'
      }
    ]
  };

  const failedResult = validator(invalidOutput);
  assert.equal(failedResult.isValid, false);
  assert.match(failedResult.error || '', /references unverified skills/i);
});

test('createRoleSuggestionValidator enforces reason word limit of 12 words', () => {
  const verifiedSkillTitles = ['REST API Development'];
  const validator = createRoleSuggestionValidator(verifiedSkillTitles);

  const longReasonOutput = {
    roles: [
      {
        title: 'Backend Developer',
        matchedSkills: ['REST API Development'],
        reason: 'This reason is intentionally made extraordinarily long so that it significantly exceeds twelve words and fails validation.'
      }
    ]
  };

  const result = validator(longReasonOutput);
  assert.equal(result.isValid, false);
  assert.match(result.error || '', /exceeds 12 words/i);
});

test('buildRuleBasedRoleSuggestions creates valid role recommendations from verified skills', () => {
  const verifiedEvidence = [
    {
      requirementId: 'req-api',
      requirementTitle: 'REST API & Endpoints',
      status: 'demonstrated',
      explanation: 'Verified endpoints in Express/Next.js',
      repoFullName: 'alex/payment-api',
      commitSha: 'sha1',
      confidence: 90
    },
    {
      requirementId: 'req-db',
      requirementTitle: 'Database & SQL',
      status: 'demonstrated',
      explanation: 'PostgreSQL migrations and query handlers',
      repoFullName: 'alex/payment-api',
      commitSha: 'sha1',
      confidence: 85
    }
  ];

  const suggestions = buildRuleBasedRoleSuggestions(verifiedEvidence);
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.length <= 4);

  for (const role of suggestions) {
    assert.ok(role.title);
    assert.ok(role.matchedSkills.length > 0);
    assert.ok(role.searchUrl.startsWith('https://www.google.com/search?q='));
    const wordCount = role.reason.trim().split(/\s+/).length;
    assert.ok(wordCount <= 12, `Reason word count ${wordCount} should be <= 12`);
  }
});

test('reassessAssessment rejects profile assessments with plain-English error code', async (t) => {
  if (skipIfNoDb(t)) return;

  const profileAssessmentId = `asmt-profile-test-${Date.now()}`;
  const mockProfileAssessment = {
    ...SAMPLE_ASSESSMENT,
    id: profileAssessmentId,
    repository: {
      ...SAMPLE_ASSESSMENT.repository,
      fullName: 'profile/alexchen, 6 repos',
      latestCommitSha: 'profile-scan'
    },
    latestRevision: {
      ...SAMPLE_ASSESSMENT.latestRevision,
      id: `rev-${profileAssessmentId}-1`,
      assessmentId: profileAssessmentId,
      commitSha: 'profile-scan'
    }
  };

  await saveAssessment(mockProfileAssessment);

  const result = await reassessAssessment({
    assessmentId: profileAssessmentId,
    triggerType: 'manual'
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'PROFILE_ASSESSMENT_NOT_SINGLE_REPO');
  assert.match(result.error || '', /Profile assessments combine multiple repositories/);
});
