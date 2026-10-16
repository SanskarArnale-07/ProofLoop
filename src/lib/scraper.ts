import * as cheerio from 'cheerio';
import { InternshipRequirement } from './types';

// Validate URL for SSRF protection
export function validateUrlSafety(inputUrl: string): { safe: boolean; error?: string; parsedUrl?: URL } {
  try {
    const parsed = new URL(inputUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, error: 'Only HTTP and HTTPS URLs are permitted.' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check loopback, private ranges, internal hostnames
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return { safe: false, error: 'Access to private or local network addresses is prohibited.' };
    }

    return { safe: true, parsedUrl: parsed };
  } catch {
    return { safe: false, error: 'Invalid URL format.' };
  }
}

export async function fetchJobPosting(url: string): Promise<{
  title: string;
  company: string;
  location?: string;
  rawText: string;
}> {
  const safety = validateUrlSafety(url);
  if (!safety.safe || !safety.parsedUrl) {
    throw new Error(safety.error || 'Unsafe URL');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ProofLoop/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 401) {
      throw new Error(`The job posting at this URL is protected by authentication or access controls (HTTP ${response.status}). Please paste the job description text directly.`);
    }
    throw new Error(`Failed to fetch job posting (HTTP ${response.status} ${response.statusText}).`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove scripts, styles, noscript, svg, navigation
  $('script, style, noscript, svg, nav, footer, header, iframe, link').remove();

  // Try to find title
  let title = $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim();

  // Clean title
  if (title.includes('|')) {
    title = title.split('|')[0].trim();
  } else if (title.includes(' - ')) {
    title = title.split(' - ')[0].trim();
  }

  // Try to find company
  let company = $('meta[property="og:site_name"]').attr('content') ||
    $('meta[name="author"]').attr('content') ||
    $('.company-name, [class*="company"], [class*="employer"]').first().text().trim();

  if (!company) {
    // Derive from domain
    const hostParts = safety.parsedUrl.hostname.split('.');
    if (hostParts.length >= 2) {
      company = hostParts[hostParts.length - 2];
      company = company.charAt(0).toUpperCase() + company.slice(1);
    } else {
      company = 'Engineering Team';
    }
  }

  // Extract main readable text
  let rawText = '';
  const mainContent = $('main, article, [role="main"], .job-description, #job-description, .posting-description').first();
  if (mainContent.length > 0) {
    rawText = mainContent.text().replace(/\s+/g, ' ').trim();
  } else {
    rawText = $('body').text().replace(/\s+/g, ' ').trim();
  }

  // Limit raw text to 15,000 chars to avoid memory bloat
  if (rawText.length > 15000) {
    rawText = rawText.slice(0, 15000) + '...';
  }

  if (rawText.length < 50) {
    throw new Error('Could not extract sufficient text from the job page. The page may require JavaScript or login. Please use the manual requirements input.');
  }

  return {
    title: title || 'Software Engineering Intern',
    company: company || 'Technology Company',
    rawText
  };
}

export function extractRequirementsFromText(
  text: string,
  roleTitle: string
): InternshipRequirement[] {
  const requirements: InternshipRequirement[] = [];

  const patterns: Array<{
    id: string;
    category: InternshipRequirement['category'];
    title: string;
    description: string;
    regex: RegExp;
    importance: 'required' | 'preferred';
  }> = [
    {
      id: 'req-api',
      category: 'backend',
      title: 'REST / GraphQL API Development',
      description: 'Designing, building, and maintaining robust backend APIs and endpoints.',
      regex: /\b(api|apis|rest|restful|graphql|endpoints?|http|grpc|fastapi|express|django|flask|spring)\b/i,
      importance: 'required'
    },
    {
      id: 'req-db',
      category: 'database',
      title: 'Database Design & SQL',
      description: 'Relational or document database schema design, migrations, and query optimization.',
      regex: /\b(sql|database|postgres|postgresql|mysql|sqlite|mongodb|redis|prisma|typeorm|sequelize|sqlalchemy)\b/i,
      importance: 'required'
    },
    {
      id: 'req-testing',
      category: 'testing',
      title: 'Automated Testing & Coverage',
      description: 'Writing unit, integration, or end-to-end tests to prevent regressions.',
      regex: /\b(testing|unit tests?|integration tests?|jest|pytest|junit|cypress|playwright|mocha|test coverage)\b/i,
      importance: 'required'
    },
    {
      id: 'req-devops',
      category: 'devops',
      title: 'Docker & Containerization',
      description: 'Containerizing services and managing environment dependencies.',
      regex: /\b(docker|container|containers|dockerfile|docker-compose|kubernetes|k8s)\b/i,
      importance: 'preferred'
    },
    {
      id: 'req-cicd',
      category: 'devops',
      title: 'CI/CD Pipelines & Automation',
      description: 'Configuring continuous integration workflows for automated build and test.',
      regex: /\b(ci\/cd|github actions|gitlab ci|jenkins|pipeline|workflows?|continuous integration)\b/i,
      importance: 'preferred'
    },
    {
      id: 'req-typescript',
      category: 'core',
      title: 'TypeScript / Static Typing',
      description: 'Writing statically typed code with strict type safety and interface definitions.',
      regex: /\b(typescript|typed python|mypy|static typing|type safe)\b/i,
      importance: 'required'
    },
    {
      id: 'req-frontend',
      category: 'frontend',
      title: 'Modern Frontend (React / Next.js)',
      description: 'Building responsive, accessible web user interfaces with component state management.',
      regex: /\b(react|next\.js|vue|angular|frontend|ui|tailwind|css|html|state management)\b/i,
      importance: 'preferred'
    },
    {
      id: 'req-git',
      category: 'general',
      title: 'Git Version Control & Collaboration',
      description: 'Proficiency in git workflows, branching strategies, and clear commit hygiene.',
      regex: /\b(git|github|version control|pull requests?|code reviews?)\b/i,
      importance: 'required'
    },
    {
      id: 'req-async',
      category: 'backend',
      title: 'Async Processing & Background Jobs',
      description: 'Managing asynchronous operations, message queues, or event-driven workers.',
      regex: /\b(async|asynchronous|queues?|celery|kafka|rabbitmq|bull|redis queue|event-driven)\b/i,
      importance: 'preferred'
    },
    {
      id: 'req-auth',
      category: 'backend',
      title: 'Authentication & Security Best Practices',
      description: 'Implementing secure user authentication, token verification, or input sanitization.',
      regex: /\b(auth|authentication|authorization|jwt|oauth|security|encryption|hash)\b/i,
      importance: 'preferred'
    }
  ];

  for (const item of patterns) {
    if (item.regex.test(text) || item.regex.test(roleTitle)) {
      requirements.push({
        id: item.id,
        category: item.category,
        title: item.title,
        description: item.description,
        importance: item.importance,
        isInferred: !item.regex.test(text) && item.regex.test(roleTitle)
      });
    }
  }

  // Ensure at least 4 core engineering requirements if the posting text was brief
  if (requirements.length < 3) {
    requirements.push(
      {
        id: 'req-api',
        category: 'backend',
        title: 'REST / GraphQL API Development',
        description: 'Designing and building structured HTTP endpoints with validation.',
        importance: 'required'
      },
      {
        id: 'req-db',
        category: 'database',
        title: 'Database Schema & Query Handling',
        description: 'Writing database queries, schemas, or relational data models.',
        importance: 'required'
      },
      {
        id: 'req-testing',
        category: 'testing',
        title: 'Automated Testing',
        description: 'Writing automated test suites for critical application code.',
        importance: 'required'
      },
      {
        id: 'req-git',
        category: 'general',
        title: 'Git & Code Quality',
        description: 'Clean repository organization, commit history, and code structure.',
        importance: 'required'
      }
    );
  }

  return requirements;
}
