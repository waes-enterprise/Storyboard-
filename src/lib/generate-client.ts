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
      max_tokens: 8000,
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
  // NOTE: reasoning_content is the chain-of-thought, NOT the answer — never use it
  var choice0 = data && data.choices && Array.isArray(data.choices) && data.choices.length > 0
    ? data.choices[0] : null;
  var message = choice0 ? choice0.message : null;

  var textContent = '';
  if (message && typeof message.content === 'string' && message.content.trim().length > 10) {
    textContent = message.content;
  } else if (choice0 && typeof choice0.text === 'string' && choice0.text.trim().length > 10) {
    textContent = choice0.text;
  }

  // Log reasoning info for debugging (but don't use it as content)
  if (textContent.length < 10 && message) {
    var hasReasoning = (message.reasoning_content || '').length > 10;
    console.warn('[Storyboard] Empty content.', hasReasoning ? 'Has reasoning_content (ignored - it is thinking, not answer)' : 'No reasoning either');
  }

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
  // Step 1: Strip Pollinations ad content (anything after the JSON array)
  // The ad format is: \n\n---\n\n**Support Pollinations.AI:**\n...\n[Some link](url)
  // We must strip this BEFORE regex matching because [link](url) contains brackets
  let cleaned = text;

  // Split on "---" separator line (Pollinations always uses this before ads)
  var separatorIndex = cleaned.indexOf('\n---');
  if (separatorIndex > -1) {
    cleaned = cleaned.substring(0, separatorIndex);
  }

  // Also split on "\n\n---" in case of variant
  separatorIndex = cleaned.indexOf('\n\n---');
  if (separatorIndex > -1) {
    cleaned = cleaned.substring(0, separatorIndex);
  }

  cleaned = cleaned.trim();

  // Step 2: Strip markdown code fences
  if (cleaned.indexOf('```') === 0) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
    var lastFence = cleaned.lastIndexOf('```');
    if (lastFence > -1) {
      cleaned = cleaned.substring(0, lastFence);
    }
    cleaned = cleaned.trim();
  }

  // Step 3: Try direct JSON parse
  try {
    var parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return buildResult(parsed);
    }
  } catch (e) {
    // Step 3b: Try JSON repair — fix truncated responses
    var repaired = repairTruncatedJSON(cleaned);
    if (repaired) {
      try {
        var parsed = JSON.parse(repaired);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.warn('[Storyboard] Used repaired JSON');
          return buildResult(parsed);
        }
      } catch (e2) {
        console.warn('[Storyboard] Repaired JSON still invalid');
      }
    }
    console.warn('[Storyboard] Direct JSON parse failed:', e.message);
  }

  // Step 4: Extract JSON array with regex (now safe since ads are stripped)
  var match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      var parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return buildResult(parsed);
      }
    } catch (e) {
      console.warn('[Storyboard] Regex JSON parse failed:', e.message);
    }
  }

  // Step 5: Try removing control characters and re-parsing
  try {
    var sanitized = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    match = sanitized.match(/\[[\s\S]*\]/);
    if (match) {
      var parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return buildResult(parsed);
      }
    }
  } catch (e) {
    console.warn('[Storyboard] Sanitized JSON parse failed:', e.message);
  }

  console.error('[Storyboard] All parse strategies failed. Content length:', text.length, 'cleaned length:', cleaned.length);
  return null;
}

function buildResult(parsed: any[]): GenerateResult | null {
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return null;

  var firstFrame = String(parsed[0].frame_description || '');
  var continuityAnchor = extractContinuityAnchor(firstFrame);
  var baseSeed = Date.now();

  var shots = parsed.map(function(shot: any, index: number) {
    var prompt = String(shot.frame_description || shot.action_description || '');
    var fullPrompt = continuityAnchor ? continuityAnchor + '. ' + prompt : prompt;
    var encodedPrompt = encodeURIComponent(fullPrompt + NEGATIVE_SUFFIX);
    var seed = baseSeed + index * 100;
    var imageUrl = 'https://image.pollinations.ai/prompt/' + encodedPrompt + '?width=768&height=432&nologo=true&seed=' + seed + '&model=flux&nofeed=true';

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

/**
 * Repair truncated JSON array responses.
 * When max_tokens cuts off the response mid-stream, we get something like:
 * [{"shot_number":1,...,"frame_description":"some text that was cu
 * This function finds the last complete object and closes everything properly.
 */
function repairTruncatedJSON(text: string): string | null {
  // Find the start of the JSON array
  var start = text.indexOf('[');
  if (start === -1) return null;

  var content = text.substring(start);

  // Find all complete objects (ending with })
  var lastCompleteObj = -1;
  var depth = 0;
  var inString = false;
  var escaped = false;

  for (var i = 0; i < content.length; i++) {
    var ch = content[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        lastCompleteObj = i;
      }
    }
  }

  if (lastCompleteObj === -1) return null;

  // Check if there's a comma after the last complete object
  var after = content.substring(lastCompleteObj + 1).trim();
  var repaired: string;
  if (after.length > 0 && after[0] === ',') {
    // Remove trailing comma and close the array
    repaired = content.substring(0, lastCompleteObj + 1) + ']';
  } else {
    // Just close the array
    repaired = content.substring(0, lastCompleteObj + 1) + ']';
  }

  return repaired;
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
