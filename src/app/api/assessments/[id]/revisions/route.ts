import { NextRequest, NextResponse } from 'next/server';
import { getRevisionHistory, getAssessment } from '@/lib/db';

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

    const revisions = getRevisionHistory(id);
    return NextResponse.json({ success: true, revisions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch revision history' }, { status: 500 });
  }
}
