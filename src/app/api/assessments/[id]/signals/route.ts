import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { AI_SIGNAL_DISCLAIMER } from '@/lib/ai-signals';
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

    const aiSignals = assessment.aiSignals || assessment.latestRevision?.aiSignals || {
      overallAssessment: 'insufficient_evidence',
      findings: [],
      summary: 'No meaningful AI-authorship signals detected across analyzed commits and comments.',
      limitationNotice: AI_SIGNAL_DISCLAIMER,
      analyzedArtifactsCount: {
        commits: 1,
        comments: 0,
        docFiles: 0
      }
    };

    return NextResponse.json({
      success: true,
      assessmentId: idVal.cleanId,
      signals: aiSignals
    });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to retrieve AI authorship signals');
  }
}
