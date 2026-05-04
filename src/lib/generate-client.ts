/**
 * Client-side storyboard generation — calls Pollinations AI directly from the browser.
 * Bypasses Vercel serverless function network limitations.
 *
 * Resilience strategy:
 * 1. Try openai-fast model with retries on any transient error
 * 2. Fall back to openai model with retries
 * 3. Fall back to server-side /api/generate
 * 4. Ultra-robust JSON parsing that handles markdown, ads, and malformed responses
 */

const NEGATIVE_SUFFIX =
  ', raw ungraded documentary footage from real camera SD card, natural sunlight only, no color grading no filters no CGI no VFX no animation no AI enhancement, no text no watermarks no overlays no subtitles no graphics, handheld documentary camera style, real photography photorealistic, natural lens no zoom, candid moment captured on set, film grain, natural skin texture, no plastic skin';

const AI_MODELS = ['openai-fast', 'openai'];

// ═══════════════════════════════════════════════════════
// Request mutex — only one generation at a time
// ═══════════════════════════════════════════════════════
let activeGeneration: AbortController | null = null;

export function isGenerating(): boolean {
  return activeGeneration !== null;
}

export function cancelGeneration(): void {
  if (activeGeneration) {
    activeGeneration.abort();
    activeGeneration = null;
  }
}

// ═══════════════════════════════════════════════════════
// Error types
// ═══════════════════════════════════════════════════════
export class RateLimitError extends Error {
  public retryAfter: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfterSeconds;
  }
}

export class AbortGenerationError extends Error {
  constructor() {
    super('Generation was cancelled');
    this.name = 'AbortGenerationError';
  }
}

// ═══════════════════════════════════════════════════════
// Main generation function
// ═══════════════════════════════════════════════════════
interface GeneratedShot {
  id: string;
  shotNumber: number;
  shotType: string;
  actionDescription: string;
  cameraNote: string;
  frameDescription: string;
  imageUrl: string;
  order: number;
}

export interface GenerateResult {
  shots: GeneratedShot[];
  continuityAnchor: string;
}

export type GenerateProgress = {
  status: 'calling_ai' | 'parsing' | 'retrying' | 'trying_model' | 'trying_server';
  retryAttempt?: number;
  retryDelay?: number;
  model?: string;
};

type ProgressCallback = (progress: GenerateProgress) => void;

const MAX_RETRIES = 2;
const RETRY_DELAYS = [3000, 8000];

export async function generateStoryboard(
  scene: string,
  style: string,
  shotCount: number,
  onProgress?: ProgressCallback
): Promise<GenerateResult> {
  if (activeGeneration) {
    throw new Error('A generation is already in progress. Please wait for it to finish.');
  }

  const controller = new AbortController();
  activeGeneration = controller;
  const errors: string[] = [];

  try {
    const { systemPrompt, userPrompt } = buildPrompts(scene, style, shotCount);

    for (const model of AI_MODELS) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (controller.signal.aborted) {
          throw new AbortGenerationError();
        }

        if (attempt > 0) {
          const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
          onProgress?.({ status: 'retrying', retryAttempt: attempt, retryDelay: delay / 1000, model });
          await sleep(delay, controller.signal);
        }

        onProgress?.({ status: 'calling_ai', retryAttempt: attempt, model });

        try {
          const result = await callPollinations(
            systemPrompt,
            userPrompt,
            controller.signal,
            model
          );

          onProgress?.({ status: 'parsing' });

          if (!result || !result.shots || result.shots.length === 0) {
            throw new Error('Parse returned empty shots');
          }

          return result;
        } catch (err) {
          if (controller.signal.aborted || err instanceof AbortGenerationError) {
            throw new AbortGenerationError();
          }

          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[Storyboard] ${model} attempt ${attempt + 1} failed:`, msg);
          errors.push(`${model}:${msg}`);

          if (attempt >= MAX_RETRIES) {
            break;
          }
        }
      }
    }

    // Server fallback
    onProgress?.({ status: 'trying_server' });
    console.warn('[Storyboard] All client models failed, trying server fallback');

    try {
      const result = await callServerFallback(scene, style, shotCount, controller.signal);
      if (result && result.shots && result.shots.length > 0) {
        return result;
      }
    } catch (err) {
      console.warn('[Storyboard] Server fallback failed:', err);
    }

    const errorDetail = errors.length > 0 ? errors[errors.length - 1] : 'unknown';
    throw new Error(`AI generation failed (${errorDetail}). Please try again.`);
  } finally {
    activeGeneration = null;
  }
}

// ═══════════════════════════════════════════════════════
// Pollinations API call
// ═══════════════════════════════════════════════════════
async function callPollinations(
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
  model: string
): Promise<GenerateResult> {
  const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
    signal,
  });

  if (res.status === 429) {
    throw new Error('rate_limited');
  }

  if (!res.ok) {
    throw new Error(`http_${res.status}`);
  }

  // Use text() first for maximum compatibility, then manually parse
  let responseText: string;
  try {
    responseText = await res.text();
  } catch {
    throw new Error('failed_to_read_response');
  }

  console.log('[Storyboard] Raw response length:', responseText.length);

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('[Storyboard] JSON parse error:', e, 'raw:', responseText.slice(0, 500));
    throw new Error('invalid_json_response');
  }

  // Safely extract content from various response formats
  const textContent =
    (data && data.choices && Array.isArray(data.choices) && data.choices.length > 0 &&
     data.choices[0] && data.choices[0].message && typeof data.choices[0].message.content === 'string' &&
     data.choices[0].message.content) ||
    (data && data.choices && Array.isArray(data.choices) && data.choices.length > 0 &&
     data.choices[0] && typeof data.choices[0].text === 'string' &&
     data.choices[0].text) ||
    '';

  console.log('[Storyboard] AI content length:', textContent.length);
  console.log('[Storyboard] AI content preview:', textContent.slice(0, 200));

  if (!textContent || textContent.trim().length < 10) {
    throw new Error('empty_response');
  }

  const result = parseAndNormalize(textContent);
  if (!result) {
    throw new Error('parse_failed');
  }

  return result;
}

// ═══════════════════════════════════════════════════════
// Server-side fallback
// ═══════════════════════════════════════════════════════
async function callServerFallback(
  scene: string,
  style: string,
  shotCount: number,
  signal: AbortSignal
): Promise<GenerateResult | null> {
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene, style, shotCount }),
      signal,
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.shots || !Array.isArray(data.shots) || data.shots.length === 0) return null;
    return data as GenerateResult;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// Prompt builder
// ═══════════════════════════════════════════════════════

function buildPrompts(scene: string, style: string, shotCount: number) {
  const systemPrompt = `You are an expert film director and cinematographer. Create a shot list.

For each shot provide: shot_number, shot_type (WS/LS/MS/MCU/CU/OTS/POV), action_description (2-3 sentences), camera_note (handheld direction), frame_description (4-6 sentence standalone image prompt with character details, environment, lighting, camera/lens).

Every frame_description must start with the same character and environment description. Only the action/framing changes between shots.

Visual style: ${style}
Shot count: ${shotCount}

Return ONLY a JSON array. Example:
[{"shot_number":1,"shot_type":"WS","action_description":"...","camera_note":"...","frame_description":"..."}]

Do NOT use markdown code fences. Return raw JSON only.`;

  const userPrompt = `Create ${shotCount} shots for: "${scene}"\n\nReturn ONLY a JSON array with ${shotCount} objects. Raw JSON, no code fences.`;

  return { systemPrompt, userPrompt };
}

// ═══════════════════════════════════════════════════════
// Ultra-robust JSON parser
// ═══════════════════════════════════════════════════════

function parseAndNormalize(text: string): GenerateResult | null {
  // Strategy 1: Direct JSON parse
  let parsed: any = null;

  try {
    parsed = JSON.parse(text.trim());
  } catch {
    // Strategy 2: Extract JSON array from text using regex
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        // Strategy 3: Try to clean and parse
        try {
          const cleaned = text
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .replace(/[\u0000-\u001F\u007F]/g, '') // remove control chars
            .trim();
          const match2 = cleaned.match(/\[[\s\S]*\]/);
          if (match2) {
            parsed = JSON.parse(match2[0]);
          }
        } catch {
          return null;
        }
      }
    }
  }

  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return null;

  const firstFrame = String(parsed[0].frame_description || '');
  const continuityAnchor = extractContinuityAnchor(firstFrame);
  const baseSeed = Date.now();

  const shots = parsed.map(function(shot: any, index: number) {
    const prompt = String(shot.frame_description || shot.action_description || '');
    const fullPrompt = continuityAnchor ? continuityAnchor + '. ' + prompt : prompt;
    const encodedPrompt = encodeURIComponent(fullPrompt + NEGATIVE_SUFFIX);
    const seed = baseSeed + index * 100;
    const imageUrl = 'https://image.pollinations.ai/prompt/' + encodedPrompt + '?width=768&height=432&nologo=true&seed=' + seed + '&model=flux&nofeed=true';

    return {
      id: crypto.randomUUID(),
      shotNumber: Number(shot.shot_number) || index + 1,
      shotType: String(shot.shot_type || 'MS').toUpperCase().substring(0, 3),
      actionDescription: String(shot.action_description || ''),
      cameraNote: String(shot.camera_note || ''),
      frameDescription: fullPrompt,
      imageUrl: imageUrl,
      order: index,
    };
  });

  return { shots: shots, continuityAnchor: continuityAnchor };
}

function extractContinuityAnchor(frameDescription: string): string {
  if (!frameDescription) return '';

  var sentences = frameDescription.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return frameDescription;

  var count = Math.min(3, Math.ceil(sentences.length * 0.4));
  return sentences.slice(0, count).join(' ');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(resolve, ms);
    if (signal) {
      var onAbort = function() {
        clearTimeout(timer);
        reject(new AbortGenerationError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
