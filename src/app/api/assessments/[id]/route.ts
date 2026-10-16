import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { validateId } from '@/lib/validation';
import { createErrorResponse } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureSampleDataSeeded();
    const { id } = await params;
    const assessment = getAssessment(id);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      assessment
    });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to fetch assessment');
  }
}
