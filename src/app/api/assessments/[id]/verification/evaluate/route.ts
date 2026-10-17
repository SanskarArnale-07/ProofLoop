import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { ensureSampleDataSeeded } from '@/lib/sample-data';
import {
  generateVerificationTask,
  evaluatePracticalSolution,
  generateAdaptiveFollowup
} from '@/lib/developer-verification';
import { VerificationAssessmentCondition } from '@/lib/types';

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
    if (!body || !body.requirementId || typeof body.solutionCode !== 'string') {
      return NextResponse.json(
        { error: 'Missing required fields: requirementId, solutionCode' },
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

    const task = generateVerificationTask(evidence, requirement, condition);

    // 1. Evaluate practical solution deterministically (no unsandboxed execution)
    const practicalEvaluation = evaluatePracticalSolution(task, body.solutionCode);

    // 2. Generate adaptive follow-up question conditioned directly on the submitted code
    const followupQuestion = generateAdaptiveFollowup(task, body.solutionCode, practicalEvaluation);

    return NextResponse.json({
      success: true,
      task,
      practicalEvaluation,
      followupQuestion
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to evaluate practical solution';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
