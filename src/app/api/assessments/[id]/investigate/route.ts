import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { ensureSampleDataSeeded } from '@/lib/sample-data';
import { runAgenticInvestigation } from '@/lib/agent-investigator';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSampleDataSeeded();
    const { id } = await params;

    // Validation: assessment ID must be a non-empty string
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing assessment ID', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    // Authorization: verify assessment exists in trusted application database
    let assessment = null;
    try {
      assessment = await getAssessment(id);
    } catch {
      // In local dev/testing without database connection, fall back safely if requesting sample assessment
      if (id === 'sample-assessment-stripe') {
        const { SAMPLE_ASSESSMENT } = await import('@/lib/sample-data');
        assessment = SAMPLE_ASSESSMENT;
      }
    }

    if (!assessment) {
      return NextResponse.json(
        { success: false, error: 'Assessment not found or unauthorized access.', code: 'ASSESSMENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Parse optional request parameters safely
    const body = await req.json().catch(() => ({}));
    const requirementId =
      typeof body.requirementId === 'string' && body.requirementId.trim().length > 0
        ? body.requirementId.trim()
        : undefined;

    // Validate requirementId against assessment if provided
    if (requirementId) {
      const exists = assessment.internship?.requirements?.some((r) => r.id === requirementId);
      if (!exists) {
        return NextResponse.json(
          {
            success: false,
            error: `Requirement "${requirementId}" does not belong to this assessment.`,
            code: 'INVALID_REQUIREMENT',
          },
          { status: 400 }
        );
      }
    }

    const forceDeterministic = body.forceDeterministic === true;

    // Run the bounded agentic investigation
    const report = await runAgenticInvestigation({
      assessment,
      requirementId,
      forceDeterministic,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Investigation failed unexpectedly.';

    // Discriminate known error categories
    if (message.includes('rate limit')) {
      return NextResponse.json(
        { success: false, error: message, code: 'RATE_LIMITED' },
        { status: 429 }
      );
    }

    if (message.includes('timeout') || message.includes('abort')) {
      return NextResponse.json(
        { success: false, error: 'Investigation timed out. Bounded execution limit reached.', code: 'TIMEOUT' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { success: false, error: message, code: 'INVESTIGATION_ERROR' },
      { status: 500 }
    );
  }
}
