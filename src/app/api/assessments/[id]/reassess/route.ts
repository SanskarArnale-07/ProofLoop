import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { reassessAssessment } from '@/lib/reassessment-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let assessmentId = '';
  try {
    const { id } = await params;
    assessmentId = id;

    const assessment = await getAssessment(id);
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const triggerMessage = (body.triggerMessage as string) || 'Manual reassessment request';

    const result = await reassessAssessment({
      assessmentId: assessment.id,
      triggerType: 'manual',
      triggerMessage,
      token: undefined
    });

    if (!result.success) {
      const statusCode =
        result.errorCode === 'ASSESSMENT_NOT_FOUND'
          ? 404
          : result.errorCode === 'PROFILE_ASSESSMENT_NOT_SINGLE_REPO'
            ? 400
            : 500;
      return NextResponse.json(
        {
          error: result.error || 'Reassessment failed',
          errorCode: result.errorCode,
          message: 'Reassessment failed. Previous assessment history was preserved.'
        },
        { status: statusCode }
      );
    }

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: result.skipReason || 'Reassessment skipped.',
        assessment: await getAssessment(assessmentId)
      });
    }

    const updated = await getAssessment(assessmentId);
    return NextResponse.json({
      success: true,
      assessment: updated,
      newRevisionNumber: result.newRevisionNumber,
      promotedSkills: result.promotedSkills || [],
      commitSha: result.commitSha
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to trigger reassessment';
    console.error('Manual reassessment error:', errMsg);

    if (assessmentId) {
      try {
        const { recordAssessmentFailure } = await import('@/lib/db');
        await recordAssessmentFailure(assessmentId, errMsg);
      } catch {
        // best effort
      }
    }

    return NextResponse.json(
      {
        error: errMsg,
        message: 'Reassessment failed. Previous assessment history was preserved.'
      },
      { status: 500 }
    );
  }
}
