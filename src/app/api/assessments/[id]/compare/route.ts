import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, compareRevisions } from '@/lib/db';
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
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    if (!fromStr || !toStr) {
      return NextResponse.json(
        { error: 'Query parameters "from" and "to" revision numbers are required (e.g. ?from=1&to=2).' },
        { status: 400 }
      );
    }

    const fromVal = validatePositiveInteger(fromStr, '"from" revision number', 1, 100000);
    if (!fromVal.valid || fromVal.value === undefined) {
      return NextResponse.json({ error: fromVal.error || 'Invalid revision numbers provided.' }, { status: 400 });
    }

    const toVal = validatePositiveInteger(toStr, '"to" revision number', 1, 100000);
    if (!toVal.valid || toVal.value === undefined) {
      return NextResponse.json({ error: toVal.error || 'Invalid revision numbers provided.' }, { status: 400 });
    }

    const comparison = compareRevisions(idVal.cleanId, fromVal.value, toVal.value);
    if (!comparison) {
      return NextResponse.json(
        { error: `Could not compare revisions #${fromVal.value} and #${toVal.value}. Check that both revision numbers exist.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, comparison });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to compare revisions');
  }
}
