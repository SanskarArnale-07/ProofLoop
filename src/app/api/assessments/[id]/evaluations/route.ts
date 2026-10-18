import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, getEvaluationHistory, getRevisionByIdOrNumber, getRevisionByNumber, compareRevisions } from '@/lib/db';

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

    const assessment = await getAssessment(cleanId);
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');
    const fromType = searchParams.get('fromType') || 'number'; // number|id
    const toType = searchParams.get('toType') || 'number';   // number|id

    // If no from/to specified, return evaluation history
    if (!fromStr || !toStr) {
      const orderParam = searchParams.get('order')?.toLowerCase();
      const order: 'asc' | 'desc' = orderParam === 'desc' ? 'desc' : 'asc';

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

      const historyResult = await getEvaluationHistory(cleanId, {
        order,
        limit,
        offset,
        includeEvidence
      });

      // Enhance evaluation summaries with additional metadata
      const enhancedEvaluations = historyResult.evaluations.map((ev, index) => {
        const isLatest = ev.isLatest;
        const displayNumber = offset + index + 1;

        return {
          ...ev,
          displayNumber,
          isLatest,
          metadata: {
            hasFullScoring: !!ev.evidence?.length,
            hasCompleteEvidence: ev.evidence?.every(e => e.evidenceType && e.evidenceStrength),
            stabilityConfirmed: !!ev.id && ev.id.startsWith('rev-')
          }
        };
      });

      return NextResponse.json({
        success: true,
        assessmentId: cleanId,
        evaluations: enhancedEvaluations,
        latestEvaluation: historyResult.latestEvaluation,
        pagination: {
          total: historyResult.total,
          limit: historyResult.limit,
          offset: historyResult.offset,
          hasMore: historyResult.hasMore,
          displayStart: offset + 1,
          displayEnd: offset + enhancedEvaluations.length
        }
      });
    }

    // Perform comparison
    let fromParam: number | string = fromStr.trim();
    let toParam: number | string = toStr.trim();

    // Handle from parameter
    if (fromType === 'id') {
      // from is already an ID
    } else if (/^\d+$/.test(fromParam)) {
      const parsedNum = parseInt(fromParam, 10);
      if (isNaN(parsedNum) || parsedNum <= 0) {
        return NextResponse.json({ error: 'Invalid "from" evaluation number provided.' }, { status: 400 });
      }
      fromParam = parsedNum;
    }

    // Handle to parameter
    if (toType === 'id') {
      // to is already an ID
    } else if (/^\d+$/.test(toParam)) {
      const parsedNum = parseInt(toParam, 10);
      if (isNaN(parsedNum) || parsedNum <= 0) {
        return NextResponse.json({ error: 'Invalid "to" evaluation number provided.' }, { status: 400 });
      }
      toParam = parsedNum;
    }

    // Validate that both evaluations exist
    const fromRev = fromType === 'id' 
      ? await getRevisionByIdOrNumber(cleanId, fromParam)
      : await getRevisionByNumber(cleanId, fromParam as number);

    const toRev = toType === 'id'
      ? await getRevisionByIdOrNumber(cleanId, toParam)
      : await getRevisionByNumber(cleanId, toParam as number);

    if (!fromRev || !toRev) {
      return NextResponse.json(
        { error: `Evaluations not found. Check that both evaluation records exist for assessment ${cleanId}.` },
        { status: 404 }
      );
    }

    // Perform comparison
    const comparison = await compareRevisions(cleanId, fromRev.revisionNumber, toRev.revisionNumber);
    if (!comparison) {
      return NextResponse.json(
        { error: `Comparison could not be generated. Missing data or incompatible evaluations.` },
        { status: 400 }
      );
    }

    // Enhance comparison with additional context
    const enhancedComparison = {
      ...comparison,
      context: {
        fromEvaluation: {
          id: fromRev.id,
          revisionNumber: fromRev.revisionNumber,
          commitSha: fromRev.commitSha,
          commitMessage: fromRev.commitMessage,
          triggerType: fromRev.triggerType,
          createdAt: fromRev.createdAt,
          demonstratedCount: fromRev.demonstratedCount,
          partialCount: fromRev.partialCount,
          notDemonstratedCount: fromRev.notDemonstratedCount,
          totalRequirements: fromRev.evidence.length,
          evidenceAvailability: {
            total: fromRev.evidence.length,
            hasFullScoring: fromRev.evidence.some(e => e.scoreBreakdown),
            hasCompleteEvidence: fromRev.evidence.every(e => e.evidenceType && e.evidenceStrength),
            hasMissingInformation: fromRev.evidence.some(e => (e.missingInformation?.length ?? 0) > 0)
          }
        },
        toEvaluation: {
          id: toRev.id,
          revisionNumber: toRev.revisionNumber,
          commitSha: toRev.commitSha,
          commitMessage: toRev.commitMessage,
          triggerType: toRev.triggerType,
          createdAt: toRev.createdAt,
          demonstratedCount: toRev.demonstratedCount,
          partialCount: toRev.partialCount,
          notDemonstratedCount: toRev.notDemonstratedCount,
          totalRequirements: toRev.evidence.length,
          evidenceAvailability: {
            total: toRev.evidence.length,
            hasFullScoring: toRev.evidence.some(e => e.scoreBreakdown),
            hasCompleteEvidence: toRev.evidence.every(e => e.evidenceType && e.evidenceStrength),
            hasMissingInformation: toRev.evidence.some(e => (e.missingInformation?.length ?? 0) > 0)
          }
        }
      },
      comparisonQuality: {
        isComplete: comparison.addedEvidence.length + comparison.removedEvidence.length + comparison.modifiedEvidence.length > 0,
        hasInconsistentData: (comparison.unavailableData ?? []).length > 0,
        evidenceChangeRate: (comparison.evidenceChanges ?? []).length / (comparison.addedEvidence.length + comparison.removedEvidence.length + comparison.modifiedEvidence.length || 1)
      }
    };

    return NextResponse.json({ success: true, comparison: enhancedComparison });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process evaluation request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}