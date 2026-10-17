import { NextRequest, NextResponse } from 'next/server';
import { getAssessment } from '@/lib/db';
import { ensureSampleDataSeeded } from '@/lib/sample-data';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSampleDataSeeded();
    const { id } = await params;
    const assessment = await getAssessment(id);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      assessment
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch assessment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
