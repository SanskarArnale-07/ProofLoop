import { NextRequest, NextResponse } from 'next/server';
import { getAssessment, getRevisionByNumber, getRevisionByIdOrNumber, compareRevisions } from '@/lib/db';

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
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    if (!fromStr || !toStr) {
      return NextResponse.json(
        { error: 'Query parameters "from" and "to" evaluation numbers or IDs are required (e.g. ?from=1&to=2).' },
        { status: 400 }
      );
    }

    let fromParam: number | string = fromStr.trim();
    if (/^\d+$/.test(fromParam)) {
      const parsedNum = parseInt(fromParam, 10);
      if (isNaN(parsedNum) || parsedNum <= 0) {
        return NextResponse.json({ error: 'Invalid evaluation numbers provided.' }, { status: 400 });
      }
      fromParam = parsedNum;
    }

    let toParam: number | string = toStr.trim();
    if (/^\d+$/.test(toParam)) {
      const parsedNum = parseInt(toParam, 10);
      if (isNaN(parsedNum) || parsedNum <= 0) {
        return NextResponse.json({ error: 'Invalid evaluation numbers provided.' }, { status: 400 });
      }
      toParam = parsedNum;
    }

    const comparison = compareRevisions(cleanId, fromParam, toParam);
    if (!comparison) {
      return NextResponse.json(
        { error: `Could not compare evaluations "${fromParam}" and "${toParam}". Check that both evaluation records exist for this assessment.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, comparison });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compare evaluations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}