import { NextRequest, NextResponse } from 'next/server';
import { getEvaluationHistory, getAssessment, compareRevisions, getRevisionHistory } from '@/lib/db';
import { validateId, validatePositiveInteger } from '@/lib/validation';
import { createErrorResponse } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = getAssessment(id);
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // If only one of the comparison query parameters is provided, reject with 400
    if ((from && !to) || (!from && to)) {
      return NextResponse.json(
        { error: 'Both "from" and "to" revision query parameters are required for revision comparison.' },
        { status: 400 }
      );
    }

    // If both comparison query parameters are provided, return the evaluation comparison
    if (from && to) {
      let fromParam: number | string = from;
      if (/^\d+$/.test(from.trim())) {
        const fromVal = validatePositiveInteger(from, '"from" revision number', 1, 100000);
        if (!fromVal.valid || fromVal.value === undefined) {
          return NextResponse.json({ error: fromVal.error || 'Invalid revision numbers for comparison' }, { status: 400 });
        }
        fromParam = fromVal.value;
      } else {
        const idCheck = validateId(from, '"from" revision ID');
        if (!idCheck.valid) {
          return NextResponse.json({ error: idCheck.error || 'Invalid revision ID format' }, { status: 400 });
        }
        fromParam = idCheck.cleanId!;
      }

      let toParam: number | string = to;
      if (/^\d+$/.test(to.trim())) {
        const toVal = validatePositiveInteger(to, '"to" revision number', 1, 100000);
        if (!toVal.valid || toVal.value === undefined) {
          return NextResponse.json({ error: toVal.error || 'Invalid revision numbers for comparison' }, { status: 400 });
        }
        toParam = toVal.value;
      } else {
        const idCheck = validateId(to, '"to" revision ID');
        if (!idCheck.valid) {
          return NextResponse.json({ error: idCheck.error || 'Invalid revision ID format' }, { status: 400 });
        }
        toParam = idCheck.cleanId!;
      }

      const comparison = compareRevisions(idVal.cleanId, fromParam, toParam);
      if (!comparison) {
        return NextResponse.json({ error: 'One or both revisions could not be found for comparison' }, { status: 404 });
      }

      return NextResponse.json({ success: true, comparison });
    }

    // Evaluation history parameters
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

    // Also supply revisions array for backward compatibility with frontend
    const revisions = getRevisionHistory(idVal.cleanId);

    return NextResponse.json({
      success: true,
      assessmentId: idVal.cleanId,
      evaluations: historyResult.evaluations,
      latestEvaluation: historyResult.latestEvaluation,
      revisions,
      pagination: {
        total: historyResult.total,
        limit: historyResult.limit,
        offset: historyResult.offset,
        hasMore: historyResult.hasMore
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch revision history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
