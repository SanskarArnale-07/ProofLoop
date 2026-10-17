import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, getAssessmentVerificationSummary } from '@/lib/db';
import { ensureSampleDataSeeded } from '@/lib/sample-data';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSampleDataSeeded();
    const { id } = await params;

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid or missing assessment ID' }, { status: 400 });
    }

    const assessment = await getAssessment(id);
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const summary = await getAssessmentVerificationSummary(
      id,
      assessment.internship.requirements
    );

    return NextResponse.json({
      success: true,
      summary
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch verification status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
