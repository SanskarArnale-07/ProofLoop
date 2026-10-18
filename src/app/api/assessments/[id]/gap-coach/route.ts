import { NextRequest, NextResponse } from 'next/server';
import {
  getAssessment,
  getAIGapReportByRevision,
  getLatestReportTimestamp,
  isTableNotFoundError
} from '@/lib/db';
import { generateAndStoreGapReport } from '@/lib/ai/gap-coach';

const RATE_LIMIT_SECONDS = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = await getAssessment(id);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    try {
      const report = await getAIGapReportByRevision(
        assessment.latestRevision.id,
        assessment.latestRevision.scoringRuleVersion
      );

      return NextResponse.json({
        success: true,
        report,
        latestRevisionNumber: assessment.latestRevision.revisionNumber,
        migrationNeeded: false
      });
    } catch (dbErr: unknown) {
      const isMigrationNeeded =
        isTableNotFoundError(dbErr) ||
        (dbErr instanceof Error && 'code' in dbErr && (dbErr as Error & { code?: string }).code === 'MIGRATION_NEEDED');
      if (isMigrationNeeded) {
        return NextResponse.json({
          success: true,
          report: null,
          migrationNeeded: true,
          message: 'Database migration needed: please run npm run db:migrate'
        });
      }
      throw dbErr;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch gap coach report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assessment = await getAssessment(id);

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // 1. Rate-limit check using the database (refuse if latest report is < 60 seconds old)
    try {
      const lastTimestamp = await getLatestReportTimestamp(assessment.id);
      if (lastTimestamp) {
        const elapsedSec = Math.floor((Date.now() - lastTimestamp.getTime()) / 1000);
        if (elapsedSec < RATE_LIMIT_SECONDS) {
          const waitTime = RATE_LIMIT_SECONDS - elapsedSec;
          return NextResponse.json(
            {
              error: `Report was generated recently. Please wait ${waitTime}s before regenerating advice.`,
              retryAfter: waitTime
            },
            { status: 429 }
          );
        }
      }
    } catch (checkErr) {
      if (isTableNotFoundError(checkErr)) {
        return NextResponse.json(
          {
            error: 'Database migration needed: table ai_gap_reports does not exist. Please run npm run db:migrate.',
            migrationNeeded: true
          },
          { status: 503 }
        );
      }
      // Non-fatal check error; proceed
    }

    // Parse body for optional flags e.g. forceRuleBased
    const body = (await req.json().catch(() => ({}))) as { forceRuleBased?: boolean };

    // 2. Generate and store report (AI with 20s budget, fallback to rule-based on failure/timeout)
    const report = await generateAndStoreGapReport(assessment, assessment.latestRevision, {
      forceRegenerate: true,
      forceRuleBased: body.forceRuleBased
    });

    return NextResponse.json({
      success: true,
      report
    });
  } catch (error: unknown) {
    let message = error instanceof Error ? error.message : 'Failed to generate gap coach report';
    // Cleanse any potential API key or secret leakage
    if (process.env.AI_API_KEY) {
      message = message.replaceAll(process.env.AI_API_KEY, '[REDACTED]');
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
