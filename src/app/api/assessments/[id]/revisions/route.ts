import { NextRequest, NextResponse } from 'next/server';
import { getRevisionHistory, getAssessment, compareRevisions } from '@/lib/db';

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

    // If comparison query parameters are provided, return the revision comparison
    if (from && to) {
      const fromRev = parseInt(from, 10);
      const toRev = parseInt(to, 10);
      if (isNaN(fromRev) || isNaN(toRev)) {
        return NextResponse.json({ error: 'Invalid revision numbers for comparison' }, { status: 400 });
      }

      const comparison = compareRevisions(id, fromRev, toRev);
      if (!comparison) {
        return NextResponse.json({ error: 'One or both revisions could not be found for comparison' }, { status: 404 });
      }

      return NextResponse.json({ success: true, comparison });
    }

    const revisions = getRevisionHistory(id);
    return NextResponse.json({ success: true, revisions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch revision history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
