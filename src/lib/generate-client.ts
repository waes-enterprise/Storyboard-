/**
 * Client-side storyboard generation — calls Pollinations AI directly from the browser.
 *
 * Key improvements over previous version:
 * - All fetch calls have a 15-second timeout (AbortSignal.timeout)
 * - Fast path: try openai-fast first with 1 retry only
 * - Fallback: try openai with 15s timeout, no retries (it's slow)
 * - Server fallback via /api/generate as last resort
 * - Ultra-robust JSON parsing that handles markdown, ads, and malformed responses
 */

const NEGATIVE_SUFFIX =
  ', raw ungraded documentary footage from real camera SD card, natural sunlight only, no color grading no filters no CGI no VFX no animation no AI enhancement, no text no watermarks no overlays no subtitles no graphics, handheld documentary camera style, real photography photorealistic, natural lens no zoom, candid moment captured on set, film grain, natural skin texture, no plastic skin';

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
  status: 'calling_ai' | 'parsing' | 'retrying' | 'trying_server';
  message?: string;
};

type ProgressCallback = (progress: GenerateProgress) => void;

const FETCH_TIMEOUT_MS = 20_000; // 20 second timeout for all API calls
const FAST_FETCH_TIMEOUT_MS = 15_000; // 15s for the fast model

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

    // Strategy: try openai-fast (fast, usually works) → retry once → openai (slower, reliable)
    const models = [
      { name: 'openai-fast', retries: 1, timeout: FAST_FETCH_TIMEOUT_MS },
      { name: 'openai', retries: 0, timeout: FETCH_TIMEOUT_MS },
    ];

    for (const { name: model, retries, timeout } of models) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (controller.signal.aborted) {
          throw new AbortGenerationError();
        }

        if (attempt > 0) {
          onProgress?.({ status: 'retrying', message: `Retrying with ${model}...` });
          await sleep(2000, controller.signal);
        }

        onProgress?.({ status: 'calling_ai', message: `AI Director is working (${model})...` });

        try {
          const result = await callPollinations(
            systemPrompt,
            userPrompt,
            controller.signal,
            model,
            timeout
          );

          onProgress?.({ status: 'parsing', message: 'Building your storyboard...' });

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

          // Don't retry on 429 rate limit - move to next model
          if (msg.includes('rate_limited') || msg.includes('429')) {
            break;
          }
        }
      }
    }

    // Server fallback
    onProgress?.({ status: 'trying_server', message: 'Trying backup server...' });
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
    console.error('[Storyboard] All generation strategies failed:', errors);
    throw new Error(`Generation failed after all retries. Please try again in a moment.`);
  } finally {
    activeGeneration = null;
  }
}

// ═══════════════════════════════════════════════════════
// Pollinations API call with timeout
// ═══════════════════════════════════════════════════════
async function callPollinations(
  systemPrompt: string,
  userPrompt: string,
  userSignal: AbortSignal,
  model: string,
  timeoutMs: number
): Promise<GenerateResult> {
  // Create a combined signal: user abort OR timeout
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  // If user aborts, also clear timeout
  const onUserAbort = () => {
    clearTimeout(timeoutId);
  };
  userSignal.addEventListener('abort', onUserAbort, { once: true });

  try {
    const combinedSignal = userSignal.aborted
      ? userSignal
      : anySignal(userSignal, timeoutController.signal);

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
        max_tokens: 4000,
      }),
      signal: combinedSignal,
    });

    if (res.status === 429) {
      throw new Error('rate_limited');
    }

    if (!res.ok) {
      throw new Error(`http_${res.status}`);
    }

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
    } catch {
      console.error('[Storyboard] JSON parse error, raw:', responseText.slice(0, 300));
      throw new Error('invalid_json_response');
    }

    // Extract text content from response
    const choice0 = data?.choices?.[0];
    const message = choice0?.message;

    let textContent = '';
    if (typeof message?.content === 'string' && message.content.trim().length > 10) {
      textContent = message.content;
    } else if (typeof choice0?.text === 'string' && choice0.text.trim().length > 10) {
      textContent = choice0.text;
    }

    if (textContent.trim().length < 10) {
      throw new Error('empty_response');
    }

    // Parse the JSON from the text
    let result = parseAndNormalize(textContent);
    if (!result) {
      // Try reasoning_content as last resort
      const reasoning = message?.reasoning_content || message?.reasoning || '';
      if (typeof reasoning === 'string' && reasoning.length > 100) {
        result = parseAndNormalize(reasoning);
      }
      if (!result) {
        throw new Error('parse_failed');
      }
    }

    return result;
  } finally {
    clearTimeout(timeoutId);
    userSignal.removeEventListener('abort', onUserAbort);
  }
}

/**
 * Combine multiple AbortSignals into one - aborts if ANY signal aborts.
 */
function anySignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// ═══════════════════════════════════════════════════════
// Server-side fallback with timeout
// ═══════════════════════════════════════════════════════
async function callServerFallback(
  scene: string,
  style: string,
  shotCount: number,
  userSignal: AbortSignal
): Promise<GenerateResult | null> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), FETCH_TIMEOUT_MS);
  const onUserAbort = () => clearTimeout(timeoutId);
  userSignal.addEventListener('abort', onUserAbort, { once: true });

  try {
    const combinedSignal = anySignal(userSignal, timeoutController.signal);
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene, style, shotCount }),
      signal: combinedSignal,
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.shots || !Array.isArray(data.shots) || data.shots.length === 0) return null;
    return data as GenerateResult;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    userSignal.removeEventListener('abort', onUserAbort);
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
  let cleaned = text;

  // Strip Pollinations ad content (after "---" separator)
  const sepIdx1 = cleaned.indexOf('\n---');
  if (sepIdx1 > -1) cleaned = cleaned.substring(0, sepIdx1);
  const sepIdx2 = cleaned.indexOf('\n\n---');
  if (sepIdx2 > -1) cleaned = cleaned.substring(0, sepIdx2);

  cleaned = cleaned.trim();

  // Strip markdown code fences
  if (cleaned.indexOf('```') === 0) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence > -1) cleaned = cleaned.substring(0, lastFence);
    cleaned = cleaned.trim();
  }

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return buildResult(parsed);
    }
  } catch {
    // Try JSON repair for truncated responses
    const repaired = repairTruncatedJSON(cleaned);
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed) && parsed.length > 0) return buildResult(parsed);
      } catch { /* fall through */ }
    }
  }

  // Extract JSON array with regex
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) return buildResult(parsed);
    } catch {
      // Try sanitized version
      try {
        const sanitized = match[0].replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        const parsed = JSON.parse(sanitized);
        if (Array.isArray(parsed) && parsed.length > 0) return buildResult(parsed);
      } catch { /* all parse strategies failed */ }
    }
  }

  return null;
}

function buildResult(parsed: any[]): GenerateResult | null {
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return null;

  const firstFrame = String(parsed[0].frame_description || '');
  const continuityAnchor = extractContinuityAnchor(firstFrame);
  const baseSeed = Date.now();

  const shots = parsed.map((shot: any, index: number) => {
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

  return { shots, continuityAnchor };
}

function extractContinuityAnchor(frameDescription: string): string {
  if (!frameDescription) return '';
  const sentences = frameDescription.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return frameDescription;
  const count = Math.min(3, Math.ceil(sentences.length * 0.4));
  return sentences.slice(0, count).join(' ');
}

function repairTruncatedJSON(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;

  const content = text.substring(start);
  let lastCompleteObj = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) lastCompleteObj = i; }
  }

  if (lastCompleteObj === -1) return null;
  return content.substring(0, lastCompleteObj + 1) + ']';
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(function(resolve, reject) {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', function() {
        clearTimeout(timer);
        reject(new AbortGenerationError());
      }, { once: true });
    }
  });
}
