import { NextRequest, NextResponse } from 'next/server';
import { getEvaluationHistory, getAssessment } from '@/lib/db';

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
    const includeScoringBreakdown = searchParams.get('includeScoringBreakdown') === 'true';

    const historyResult = getEvaluationHistory(cleanId, {
      order,
      limit,
      offset,
      includeEvidence
    });

    return NextResponse.json({
      success: true,
      assessmentId: cleanId,
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
    const message = error instanceof Error ? error.message : 'Failed to fetch evaluation history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}