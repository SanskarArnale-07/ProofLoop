import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { ensureSampleDataSeeded } from '@/lib/sample-data';
import { generateVerificationTask } from '@/lib/developer-verification';
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
    if (!body || !body.requirementId) {
      return NextResponse.json(
        { error: 'Missing required field "requirementId"' },
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

    return NextResponse.json({
      success: true,
      task
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate verification task';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
