async function run() {
  const res = await fetch('http://localhost:3000/api/webhooks/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assessmentId: 'sample-assessment-stripe',
      commitMessage: 'test(api): add automated test suite for payments',
      files: {
        'tests/payments.test.ts': `import { describe, it, expect } from "vitest";
describe("Payments", () => {
  it("processes charge correctly", () => {
    expect(200).toBe(200);
  });
});`
      }
    })
  });

  const data = await res.json();
  console.log('--- LIVE WEBHOOK SIMULATION TEST ---');
  console.log('Success:', data.success);
  console.log('Commit SHA:', data.commitSha);
  console.log('Signature Used:', data.signatureUsed);
  console.log('Signature Valid:', data.signatureValid);
  console.log('Previous Revision:', data.previousRevisionNumber);
  console.log('New Revision:', data.newRevisionNumber);
  console.log('Promoted Skills:', data.promotedSkills);
  console.log('Affected Requirements:', data.affectedRequirements);
}

run().catch(console.error);
