import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { validateId } from '@/lib/validation';
import { createErrorResponse } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idVal = validateId(id, 'Assessment ID');
    if (!idVal.valid || !idVal.cleanId) {
      return NextResponse.json({ error: idVal.error || 'Invalid assessment ID format.' }, { status: 400 });
    }

    const assessment = getAssessment(idVal.cleanId);
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
