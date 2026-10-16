import { NextRequest, NextResponse } from 'next/server';
import { getEvaluationHistory, getAssessment } from '@/lib/db';
import { validateId, validatePositiveInteger } from '@/lib/validation';
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

    const { searchParams } = new URL(req.url);
    const orderParam = searchParams.get('order')?.toLowerCase();
    const order: 'asc' | 'desc' = orderParam === 'desc' ? 'desc' : 'asc'; // Default: chronological (oldest to newest)

    let limit = 50;
    const limitStr = searchParams.get('limit');
    if (limitStr) {
      const limitVal = validatePositiveInteger(limitStr, 'limit', 1, 100);
      if (!limitVal.valid || limitVal.value === undefined) {
        return NextResponse.json({ error: limitVal.error || 'Invalid limit parameter' }, { status: 400 });
      }
      limit = limitVal.value;
    }

    let offset = 0;
    const offsetStr = searchParams.get('offset');
    const pageStr = searchParams.get('page');
    if (offsetStr) {
      const offsetVal = validatePositiveInteger(offsetStr, 'offset', 0, 100000);
      if (!offsetVal.valid || offsetVal.value === undefined) {
        return NextResponse.json({ error: offsetVal.error || 'Invalid offset parameter' }, { status: 400 });
      }
      offset = offsetVal.value;
    } else if (pageStr) {
      const pageVal = validatePositiveInteger(pageStr, 'page', 1, 10000);
      if (!pageVal.valid || pageVal.value === undefined) {
        return NextResponse.json({ error: pageVal.error || 'Invalid page parameter' }, { status: 400 });
      }
      offset = (pageVal.value - 1) * limit;
    }

    const includeEvidence = searchParams.get('includeEvidence') === 'true';

    const historyResult = getEvaluationHistory(idVal.cleanId, {
      order,
      limit,
      offset,
      includeEvidence
    });

    return NextResponse.json({
      success: true,
      assessmentId: idVal.cleanId,
      evaluations: historyResult.evaluations,
      latestEvaluation: historyResult.latestEvaluation,
      pagination: {
        total: historyResult.total,
        limit: historyResult.limit,
        offset: historyResult.offset,
        hasMore: historyResult.hasMore
      }
    });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to fetch evaluation history');
  }
}
