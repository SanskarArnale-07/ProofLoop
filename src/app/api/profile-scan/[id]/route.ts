import { NextRequest, NextResponse } from 'next/server';
import { getProfileScan, saveProfileScan } from '@/lib/db';

const STALE_TIMEOUT_MS = 180000; // 3 minutes

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const scan = await getProfileScan(id);

    if (!scan) {
      return NextResponse.json({ error: 'Profile scan not found.' }, { status: 404 });
    }

    // Check if scan has been stuck in 'scanning' for more than 3 minutes
    if (scan.status === 'scanning') {
      const elapsed = Date.now() - new Date(scan.updatedAt).getTime();
      if (elapsed > STALE_TIMEOUT_MS) {
        scan.status = 'failed';
        scan.errorMessage = 'Scan timed out. Please try again.';
        scan.updatedAt = new Date().toISOString();
        try {
          await saveProfileScan(scan);
        } catch {
          // best-effort
        }
      }
    }

    return NextResponse.json({
      success: true,
      scan
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve scan status.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
