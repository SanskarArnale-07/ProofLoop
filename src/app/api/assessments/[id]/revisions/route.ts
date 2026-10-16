import { NextRequest, NextResponse } from 'next/server';
import { getEvaluationHistory, getAssessment, compareRevisions, getRevisionHistory } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cleanId = id?.trim();
    if (!cleanId) {
      return NextResponse.json({ error: 'Assessment ID is required.' }, { status: 400 });
    }

    const assessment = getAssessment(cleanId);
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
      let fromParam: number | string = from.trim();
      if (/^\d+$/.test(fromParam)) {
        const parsedNum = parseInt(fromParam, 10);
        if (isNaN(parsedNum) || parsedNum <= 0) {
          return NextResponse.json({ error: 'Invalid revision numbers for comparison' }, { status: 400 });
        }
        fromParam = parsedNum;
      }

      let toParam: number | string = to.trim();
      if (/^\d+$/.test(toParam)) {
        const parsedNum = parseInt(toParam, 10);
        if (isNaN(parsedNum) || parsedNum <= 0) {
          return NextResponse.json({ error: 'Invalid revision numbers for comparison' }, { status: 400 });
        }
        toParam = parsedNum;
      }

      const comparison = compareRevisions(cleanId, fromParam, toParam);
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
      const parsedLimit = parseInt(limitStr.trim(), 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 100);
      }
    }

    let offset = 0;
    const offsetStr = searchParams.get('offset');
    const pageStr = searchParams.get('page');
    if (offsetStr) {
      const parsedOffset = parseInt(offsetStr.trim(), 10);
      if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset;
      }
    } else if (pageStr) {
      const parsedPage = parseInt(pageStr.trim(), 10);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        offset = (parsedPage - 1) * limit;
      }
    }

    const includeEvidence = searchParams.get('includeEvidence') === 'true';

    const historyResult = getEvaluationHistory(cleanId, {
      order,
      limit,
      offset,
      includeEvidence
    });

    // Also supply revisions array for backward compatibility with frontend
    const revisions = getRevisionHistory(cleanId);

    return NextResponse.json({
      success: true,
      assessmentId: cleanId,
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
