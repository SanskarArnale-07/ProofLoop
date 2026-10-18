import { NextRequest, NextResponse } from 'next/server';
import { parseGitHubUsername, executeProfileScan } from '@/lib/profile-scanner';
import { saveProfileScan, saveInternship } from '@/lib/db';
import { InternshipPosting, ProfileScanRecord } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      profileInput?: string;
      profileUrl?: string;
      username?: string;
      internship?: unknown;
      token?: string;
    } | null;

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const rawInput = body.profileInput || body.profileUrl || body.username;
    if (!rawInput || typeof rawInput !== 'string') {
      return NextResponse.json(
        { error: 'Please enter a GitHub profile URL or username.' },
        { status: 400 }
      );
    }

    const username = parseGitHubUsername(rawInput);
    if (!username) {
      return NextResponse.json(
        { error: 'Please enter a valid GitHub profile URL or username.' },
        { status: 400 }
      );
    }

    const posting = body.internship as InternshipPosting;
    if (!posting || !Array.isArray(posting.requirements) || posting.requirements.length === 0) {
      return NextResponse.json(
        { error: 'Valid job posting requirements are required.' },
        { status: 400 }
      );
    }

    // Save internship first so foreign key constraints in PostgreSQL are satisfied
    try {
      await saveInternship(posting);
    } catch (saveErr) {
      console.warn('[Profile Scan] Warning: could not persist internship:', saveErr);
    }

    const scanId = `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const initialScan: ProfileScanRecord = {
      id: scanId,
      username,
      internshipId: posting.id,
      scannedRepos: [],
      bestEvidence: [],
      suggestedRoles: [],
      status: 'scanning',
      progressMessage: 'Finding your public repositories...',
      isPartial: false,
      createdAt: now,
      updatedAt: now
    };

    await saveProfileScan(initialScan);

    // Fire-and-forget execution in background
    executeProfileScan({
      scanId,
      username,
      internship: posting,
      token: body.token
    }).catch((err) => {
      console.error('[Profile Scan Background Error]', err instanceof Error ? err.message : err);
    });

    return NextResponse.json({
      success: true,
      scanId,
      username
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to start profile scan.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
