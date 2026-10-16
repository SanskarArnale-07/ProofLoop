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
        { error: 'Query parameters "from" and "to" revision numbers are required (e.g. ?from=1&to=2).' },
        { status: 400 }
      );
    }

    const fromRev = parseInt(fromStr, 10);
    const toRev = parseInt(toStr, 10);
    if (isNaN(fromRev) || isNaN(toRev)) {
      return NextResponse.json({ error: 'Invalid revision numbers provided.' }, { status: 400 });
    }

    const comparison = compareRevisions(id, fromRev, toRev);
    if (!comparison) {
      return NextResponse.json(
        { error: `Could not compare revisions #${fromRev} and #${toRev}. Check that both revision numbers exist.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, comparison });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compare revisions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
