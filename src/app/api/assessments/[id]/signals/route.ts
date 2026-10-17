import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { AI_SIGNAL_DISCLAIMER } from '@/lib/ai-signals';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = await getAssessment(id);
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
      assessmentId: id,
      signals: aiSignals
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve AI authorship signals';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
