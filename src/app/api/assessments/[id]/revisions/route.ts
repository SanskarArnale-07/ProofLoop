import { NextRequest, NextResponse } from 'next/server';
import { getRevisionHistory, getAssessment, compareRevisions } from '@/lib/db';
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
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // If only one of the comparison query parameters is provided, reject with 400
    if ((from && !to) || (!from && to)) {
      return NextResponse.json(
        { error: 'Both "from" and "to" revision query parameters are required for revision comparison.' },
        { status: 400 }
      );
    }

    // If both comparison query parameters are provided, return the revision comparison
    if (from && to) {
      const fromVal = validatePositiveInteger(from, '"from" revision number', 1, 100000);
      if (!fromVal.valid || fromVal.value === undefined) {
        return NextResponse.json({ error: fromVal.error || 'Invalid revision numbers for comparison' }, { status: 400 });
      }

      const toVal = validatePositiveInteger(to, '"to" revision number', 1, 100000);
      if (!toVal.valid || toVal.value === undefined) {
        return NextResponse.json({ error: toVal.error || 'Invalid revision numbers for comparison' }, { status: 400 });
      }

      const comparison = compareRevisions(idVal.cleanId, fromVal.value, toVal.value);
      if (!comparison) {
        return NextResponse.json({ error: 'One or both revisions could not be found for comparison' }, { status: 404 });
      }

      return NextResponse.json({ success: true, comparison });
    }

    const revisions = getRevisionHistory(idVal.cleanId);
    return NextResponse.json({ success: true, revisions });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to fetch revision history');
  }
}
