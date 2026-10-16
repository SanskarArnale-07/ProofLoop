import { NextRequest, NextResponse } from 'next/server';
import { fetchJobPosting, extractRequirementsFromText, validateUrlSafety } from '@/lib/scraper';
import { InternshipPosting } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, manualText, manualTitle, manualCompany } = body;

    if (!url && !manualText) {
      return NextResponse.json(
        { error: 'A job posting URL or manual job description text is required.' },
        { status: 400 }
      );
    }

    let title = manualTitle || '';
    let company = manualCompany || '';
    let rawText = manualText || '';
    let sourceUrl = url || 'https://manual-entry.local';

    if (url) {
      const safety = validateUrlSafety(url);
      if (!safety.safe) {
        return NextResponse.json({ error: safety.error || 'Invalid or unsafe URL.' }, { status: 400 });
      }

      try {
        const fetched = await fetchJobPosting(url);
        if (!title) title = fetched.title;
        if (!company) company = fetched.company;
        if (!rawText) rawText = fetched.rawText;
        sourceUrl = url;
      } catch (err: unknown) {
        // If scraping failed but manualText was provided, fall back gracefully
        if (manualText) {
          rawText = manualText;
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
    const message = error instanceof Error ? error.message : 'Internal server error while extracting requirements.';
    console.error('Job extract API error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
