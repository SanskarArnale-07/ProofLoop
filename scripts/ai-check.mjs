// Standalone test script for Gemini AI provider
// Run with: node --env-file=.env.local scripts/ai-check.mjs
// Or: npm run ai:check

async function main() {
  const provider = process.env.AI_PROVIDER || 'gemini';
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!apiKey || !apiKey.trim()) {
    console.error('Failure: AI_API_KEY is not set in environment.');
    process.exit(1);
  }

  if (!model || !model.trim()) {
    console.error('Failure: AI_MODEL is not set in environment.');
    process.exit(1);
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.trim())}:generateContent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: 'Respond with valid JSON: {"status": "ok"}' }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error?.message) {
          detail = body.error.message;
        }
      } catch {}

      // Sanitize key if it ever appears in error message
      const sanitized = detail.replaceAll(apiKey.trim(), '[REDACTED_KEY]');
      console.error(`Failure: Gemini API responded with status ${response.status}: ${sanitized}`);
      process.exit(1);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      console.error('Failure: Gemini API returned an empty candidate.');
      process.exit(1);
    }

    let parsed;
    try {
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failure: Gemini API output could not be parsed as JSON.');
      process.exit(1);
    }

    if (parsed && typeof parsed === 'object') {
      console.log('AI OK');
      process.exit(0);
    } else {
      console.error('Failure: AI returned unexpected JSON structure.');
      process.exit(1);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    let errMsg = err instanceof Error ? err.message : String(err);
    if (apiKey) {
      errMsg = errMsg.replaceAll(apiKey.trim(), '[REDACTED_KEY]');
    }
    if (controller.signal.aborted) {
      console.error('Failure: AI request timed out after 20 seconds.');
    } else {
      console.error(`Failure: ${errMsg}`);
    }
    process.exit(1);
  }
}

main();
