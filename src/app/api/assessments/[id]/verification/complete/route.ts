import { NextRequest, NextResponse } from 'next/server';
import {
  getAssessment,
  saveDeveloperVerification,
  addActivityEvent,
  getAssessmentVerificationSummary
} from '@/lib/db';
import { ensureSampleDataSeeded } from '@/lib/sample-data';
import {
  generateVerificationTask,
  evaluatePracticalSolution,
  generateAdaptiveFollowup,
  evaluateReasoningResponse,
  computeMultidimensionalScore
} from '@/lib/developer-verification';
import {
  VerificationAssessmentCondition,
  DeveloperVerificationRecord
} from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSampleDataSeeded();
    const { id } = await params;

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid or missing assessment ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (
      !body ||
      !body.requirementId ||
      typeof body.solutionCode !== 'string' ||
      typeof body.reasoningResponse !== 'string'
    ) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: requirementId, solutionCode, reasoningResponse'
        },
        { status: 400 }
      );
    }

    const assessment = await getAssessment(id);
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const requirement = assessment.internship.requirements.find(
      (r) => r.id === body.requirementId
    );
    if (!requirement) {
      return NextResponse.json(
        { error: `Requirement "${body.requirementId}" not found in assessment` },
        { status: 404 }
      );
    }

    const evidence = assessment.latestRevision.evidence.find(
      (e) => e.requirementId === body.requirementId
    );

    const condition: VerificationAssessmentCondition =
      body.condition === 'ai_assisted_disclosed'
        ? 'ai_assisted_disclosed'
        : body.condition === 'unmonitored_takehome'
          ? 'unmonitored_takehome'
          : 'ai_restricted_independent';

    // 1. Regenerate / retrieve grounded task definition
    const task = generateVerificationTask(evidence, requirement, condition);

    // 2. Deterministic evaluation of practical solution
    const practicalEvaluation = evaluatePracticalSolution(task, body.solutionCode);

    // 3. Adaptive follow-up question
    const followupQuestion = generateAdaptiveFollowup(task, body.solutionCode, practicalEvaluation);

    // 4. Reasoning evaluation against explicit criteria
    const reasoningEvaluation = evaluateReasoningResponse(
      task,
      body.solutionCode,
      followupQuestion,
      body.reasoningResponse
    );

    // 5. Compute separated multidimensional scores and verdict
    const {
      dimensions,
      verdict,
      overallExplanation,
      confidenceScore,
      limitations
    } = computeMultidimensionalScore(
      evidence,
      practicalEvaluation,
      reasoningEvaluation,
      condition,
      evidence?.authorAttribution
    );

    const recordId = `verif-${id}-${body.requirementId}-${Date.now()}`;
    const record: DeveloperVerificationRecord = {
      id: recordId,
      assessmentId: id,
      revisionId: assessment.latestRevision?.id,
      requirementId: body.requirementId,
      requirementTitle: requirement.title,
      task,
      assessmentCondition: condition,
      practicalSolution: body.solutionCode,
      practicalEvaluation,
      followupQuestion,
      reasoningResponse: body.reasoningResponse,
      reasoningEvaluation,
      dimensions,
      status: verdict,
      overallVerdict: overallExplanation,
      confidenceScore,
      limitations,
      createdAt: new Date().toISOString()
    };

    // 6. Durable persistence into database
    await saveDeveloperVerification(record);

    // 7. Add activity event to audit timeline
    await addActivityEvent({
      id: `act-verif-${Date.now()}`,
      assessmentId: id,
      eventType: 'developer_verification_completed',
      title: `Developer Understanding Check: ${requirement.title}`,
      description: `${overallExplanation} (Condition: ${dimensions.verificationIntegrity.environmentIntegrity})`,
      commitSha: assessment.latestRevision?.commitSha,
      affectedSkills: [requirement.title],
      timestamp: new Date().toISOString()
    });

    // 8. Fetch updated summary
    const updatedSummary = await getAssessmentVerificationSummary(
      id,
      assessment.internship.requirements
    );

    return NextResponse.json({
      success: true,
      verificationRecord: record,
      summary: updatedSummary
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to complete developer verification';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
