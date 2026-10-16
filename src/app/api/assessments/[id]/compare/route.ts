import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, compareRevisions } from '@/lib/db';

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
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    if (!fromStr || !toStr) {
      return NextResponse.json(
        { error: 'Query parameters "from" and "to" evaluation numbers or IDs are required (e.g. ?from=1&to=2).' },
        { status: 400 }
      );
    }

    let fromParam: number | string = fromStr;
    if (/^\d+$/.test(fromStr.trim())) {
      const fromVal = validatePositiveInteger(fromStr, '"from" evaluation number', 1, 100000);
      if (!fromVal.valid || fromVal.value === undefined) {
        return NextResponse.json({ error: fromVal.error || 'Invalid evaluation numbers provided.' }, { status: 400 });
      }
      fromParam = fromVal.value;
    } else {
      const idCheck = validateId(fromStr, '"from" evaluation ID');
      if (!idCheck.valid) {
        return NextResponse.json({ error: idCheck.error || 'Invalid evaluation ID format.' }, { status: 400 });
      }
      fromParam = idCheck.cleanId!;
    }

    let toParam: number | string = toStr;
    if (/^\d+$/.test(toStr.trim())) {
      const toVal = validatePositiveInteger(toStr, '"to" evaluation number', 1, 100000);
      if (!toVal.valid || toVal.value === undefined) {
        return NextResponse.json({ error: toVal.error || 'Invalid evaluation numbers provided.' }, { status: 400 });
      }
      toParam = toVal.value;
    } else {
      const idCheck = validateId(toStr, '"to" evaluation ID');
      if (!idCheck.valid) {
        return NextResponse.json({ error: idCheck.error || 'Invalid evaluation ID format.' }, { status: 400 });
      }
      toParam = idCheck.cleanId!;
    }

    const comparison = compareRevisions(idVal.cleanId, fromParam, toParam);
    if (!comparison) {
      return NextResponse.json(
        { error: `Could not compare evaluations "${fromParam}" and "${toParam}". Check that both evaluation records exist for this assessment.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, comparison });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Failed to compare evaluations');
  }
}
