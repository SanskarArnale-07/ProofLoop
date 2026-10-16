import { NextRequest, NextResponse } from 'next/server';
import { fetchJobPosting, extractRequirementsFromText, validateUrlSafety } from '@/lib/scraper';
import { InternshipPosting } from '@/lib/types';
import { safeParseJson, validateString } from '@/lib/validation';
import { createErrorResponse } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const { data: body, errorResponse } = await safeParseJson(req);
    if (errorResponse) {
      return errorResponse;
    }

    const { url, manualText, manualTitle, manualCompany } = body as Record<string, unknown>;

    const cleanUrl = typeof url === 'string' && url.trim().length > 0 ? url.trim() : undefined;
    const cleanManualText = typeof manualText === 'string' && manualText.trim().length > 0 ? manualText.trim() : undefined;

    if (!cleanUrl && !cleanManualText) {
      return NextResponse.json(
        { error: 'A job posting URL or manual job description text is required.' },
        { status: 400 }
      );
    }

    if (cleanManualText && cleanManualText.length > 50000) {
      return NextResponse.json(
        { error: 'Manual job description text exceeds maximum limit of 50,000 characters.' },
        { status: 400 }
      );
    }

    const titleVal = validateString(manualTitle, 'Job title', 0, 200, false);
    const companyVal = validateString(manualCompany, 'Company name', 0, 200, false);

    let title = titleVal.cleanValue || '';
    let company = companyVal.cleanValue || '';
    let rawText = cleanManualText || '';
    let sourceUrl = cleanUrl || 'https://manual-entry.local';

    if (cleanUrl) {
      const safety = validateUrlSafety(cleanUrl);
      if (!safety.safe) {
        return NextResponse.json({ error: safety.error || 'Invalid or unsafe URL.' }, { status: 400 });
      }

      try {
        const fetched = await fetchJobPosting(cleanUrl);
        if (!title) title = fetched.title;
        if (!company) company = fetched.company;
        if (!rawText) rawText = fetched.rawText;
        sourceUrl = cleanUrl;
      } catch (err: unknown) {
        // If scraping failed but manualText was provided, fall back gracefully
        if (cleanManualText) {
          rawText = cleanManualText;
        } else {
          const message = err instanceof Error ? err.message : 'Could not retrieve job posting content.';
          return NextResponse.json(
            {
              error: message,
              suggestManualFallback: true
            },
            { status: 422 }
          );
        }
      }
    }

    if (!title) title = 'Software Engineering Intern';
    if (!company) company = 'Technology Company';

    const requirements = extractRequirementsFromText(rawText, title);

    const posting: InternshipPosting = {
      id: `job-${Date.now().toString(36)}`,
      title,
      company,
      sourceUrl,
      rawText: rawText.slice(0, 5000),
      requirements,
      createdAt: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      posting
    });
  } catch (error: unknown) {
    return createErrorResponse(error, 'Internal server error while extracting requirements.');
  }
}
