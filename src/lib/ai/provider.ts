// Server-side Gemini AI provider
// Adheres strictly to:
// 1. Model configured ONLY through process.env.AI_MODEL (never hardcoded)
// 2. 20-second total time budget across calls
// 3. Retry only on network error, NEVER after a timeout
// 4. API keys and full prompts are never logged; server-side only

export type ValidatorResult<T> =
  | { valid: true; data: T }
  | { valid: false; error: string };

export type JsonValidator<T> = (raw: unknown) => ValidatorResult<T>;

export interface AIProviderOptions {
  timeoutMs?: number;
}

const TOTAL_TIMEOUT_MS = 20000; // 20 seconds total budget

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; code?: string };
  return (
    e.name === 'TimeoutError' ||
    e.name === 'AbortError' ||
    (typeof e.message === 'string' && (e.message.includes('timeout') || e.message.includes('aborted')))
  );
}

function cleanJsonText(rawText: string): string {
  let text = rawText.trim();
  // Strip optional markdown code block wrapping e.g. ```json ... ```
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '');
    text = text.replace(/\s*```$/, '');
  }
  return text.trim();
}

/**
 * Executes a structured JSON generation request against the configured AI model.
 * Server-side only; API key is never sent to browser or logged.
 */
export async function generateJson<T>(
  prompt: string,
  validator: JsonValidator<T>,
  options?: AIProviderOptions
): Promise<T> {
  if (typeof window !== 'undefined') {
    throw new Error('AI calls are server-side only and must never run in the browser.');
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('AI_API_KEY is not configured in environment variables.');
  }

  const model = process.env.AI_MODEL;
  if (!model || !model.trim()) {
    throw new Error('AI_MODEL is not configured in environment variables.');
  }

  const totalBudgetMs = options?.timeoutMs ?? TOTAL_TIMEOUT_MS;
  const startTime = Date.now();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.trim())}:generateContent`;

  const makeRequest = async (attemptNumber: number): Promise<T> => {
    const elapsed = Date.now() - startTime;
    const remainingMs = Math.max(1000, totalBudgetMs - elapsed);

    if (elapsed >= totalBudgetMs) {
      throw new Error(`AI generation timed out after ${totalBudgetMs}ms total budget.`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remainingMs);

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
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const status = response.status;
        let errorDetail = 'Unknown API error';
        try {
          const errBody = (await response.json()) as { error?: { message?: string } };
          if (errBody?.error?.message) {
            errorDetail = errBody.error.message;
          }
        } catch {
          errorDetail = `HTTP ${status}`;
        }

        // Retry once only on 5xx or transient gateway network errors, never on 4xx (client error)
        if (attemptNumber === 1 && (status === 502 || status === 503 || status === 504)) {
          const remainingForRetry = totalBudgetMs - (Date.now() - startTime);
          if (remainingForRetry > 3000) {
            console.warn(`[AI Provider] Transient status ${status}, retrying once with remaining ${remainingForRetry}ms...`);
            return await makeRequest(2);
          }
        }

        throw new Error(`Gemini API error (status ${status}): ${errorDetail}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
          finishReason?: string;
        }>;
      };

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText || !rawText.trim()) {
        throw new Error('Gemini API returned empty candidate response.');
      }

      let parsed: unknown;
      try {
        const cleaned = cleanJsonText(rawText);
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        throw new Error(`Failed to parse AI output as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      }

      const validation = validator(parsed);
      if (!validation.valid) {
        throw new Error(`AI output failed validation: ${validation.error}`);
      }

      return validation.data;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      // Never retry after a timeout or if signal aborted due to timeout
      if (isTimeoutError(err) || controller.signal.aborted) {
        throw new Error(`AI generation timed out after ${totalBudgetMs}ms.`);
      }

      // Retry once on network connection error (e.g. fetch failed) if budget remains
      if (attemptNumber === 1) {
        const remainingForRetry = totalBudgetMs - (Date.now() - startTime);
        if (remainingForRetry > 3000) {
          console.warn(`[AI Provider] Network error, retrying once with remaining ${remainingForRetry}ms...`);
          return await makeRequest(2);
        }
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`AI request failed: ${errMsg}`);
    }
  };

  return makeRequest(1);
}
