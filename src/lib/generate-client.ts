/**
 * Client-side storyboard generation — calls Pollinations AI directly from the browser.
 * Bypasses Vercel serverless function network limitations.
 *
 * Features:
 * - Automatic retry with exponential backoff on ALL transient errors (429, 500, empty response, parse failure)
 * - Model fallback: openai-fast → openai → mistral
 * - Server-side fallback via /api/generate if all client-side attempts fail
 * - Request mutex prevents duplicate concurrent generations
 * - Clear error classification (rate limit, network, parsing, etc.)
 */

const NEGATIVE_SUFFIX =
  ', raw ungraded documentary footage from real camera SD card, natural sunlight only, no color grading no filters no CGI no VFX no animation no AI enhancement, no text no watermarks no overlays no subtitles no graphics, handheld documentary camera style, real photography photorealistic, natural lens no zoom, candid moment captured on set, film grain, natural skin texture, no plastic skin';

// Models to try, in order of preference (fastest first)
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

class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
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

const MAX_RETRIES = 3;
const RETRY_DELAYS = [3000, 6000, 10000]; // 3s, 6s, 10s

export async function generateStoryboard(
  scene: string,
  style: string,
  shotCount: number,
  onProgress?: ProgressCallback
): Promise<GenerateResult> {
  // Enforce single request at a time
  if (activeGeneration) {
    throw new Error('A generation is already in progress. Please wait for it to finish.');
  }

  const controller = new AbortController();
  activeGeneration = controller;

  try {
    const { systemPrompt, userPrompt } = buildPrompts(scene, style, shotCount);

    // ── Phase 1: Try each AI model with retries ──
    for (const model of AI_MODELS) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // Check if cancelled
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

          if (!result.shots || result.shots.length === 0) {
            throw new TransientError('AI returned no valid shots');
          }

          return result;
        } catch (err) {
          if (controller.signal.aborted || err instanceof AbortGenerationError) {
            throw new AbortGenerationError();
          }

          const error = err instanceof Error ? err : new Error(String(err));

          // Transient errors that should trigger retry
          if (
            error instanceof RateLimitError ||
            error instanceof TransientError ||
            error.message.includes('empty response') ||
            error.message.includes('invalid format') ||
            error.message.includes('AI service error (5') ||
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('Load failed')
          ) {
            // If this is the last retry for this model, try the next model instead
            if (attempt >= MAX_RETRIES) {
              console.warn(`Model ${model} failed after ${MAX_RETRIES + 1} attempts, trying next model...`);
              break; // break inner retry loop, continue to next model
            }
            continue; // retry with same model
          }

          // Fatal error — don't retry
          throw error;
        }
      }
    }

    // ── Phase 2: Server-side fallback ──
    onProgress?.({ status: 'trying_server' });

    try {
      const result = await callServerFallback(scene, style, shotCount, controller.signal);
      if (result && result.shots && result.shots.length > 0) {
        return result;
      }
    } catch (err) {
      console.warn('Server fallback also failed:', err);
    }

    throw new Error('All AI services are busy. Please wait 30 seconds and try again.');
  } finally {
    activeGeneration = null;
  }
}

// ═══════════════════════════════════════════════════════
// Pollinations API call with error handling
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
    const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
    throw new RateLimitError(
      'AI service is busy (rate limited)',
      retryAfter
    );
  }

  if (res.status >= 500) {
    throw new TransientError(`AI service error (${res.status})`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`AI service error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();

  // Handle both standard OpenAI format and Pollinations extended format
  const textContent =
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.text ||
    '';

  if (!textContent || textContent.trim().length < 10) {
    throw new TransientError('AI returned empty response');
  }

  const result = parseAndNormalize(textContent);
  if (!result) {
    throw new TransientError('AI returned invalid format');
  }

  return result;
}

// ═══════════════════════════════════════════════════════
// Server-side fallback — calls our own /api/generate endpoint
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
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) return null;

    const data = await res.json();

    if (!data.shots || !Array.isArray(data.shots) || data.shots.length === 0) {
      return null;
    }

    return data as GenerateResult;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// Prompt builder
// ═══════════════════════════════════════════════════════

function buildPrompts(scene: string, style: string, shotCount: number) {
  const systemPrompt = `You are an expert film director and cinematographer. Create shot lists with PERFECT visual continuity.

CONTINUITY PROTOCOL:
1. CHARACTER BIBLE: Describe every character exactly the same way in EVERY shot (age, ethnicity, gender, height, build, face, skin tone, eye color, hair style/color/length, exact clothing/outfit, distinguishing marks).
2. ENVIRONMENT BIBLE: Describe the location exactly the same way in EVERY shot (interior/exterior, architecture, materials, colors, lighting direction, time of day, weather, props and furniture).
3. The ONLY thing that changes between shots is the camera angle, framing, and character action.

IMAGE RULES for every frame_description:
- Must be a STANDALONE image generation prompt (4-6 sentences of extreme visual detail)
- Always start with the character description, then environment, then action/framing
- Include: lighting details, camera/lens info (e.g. "35mm prime, shallow DOF"), texture details, atmosphere
- NEVER include: color grading, filters, CGI, VFX, animation, illustration, text, watermarks, overlays, subtitles, studio lighting, zoom, dolly, crane, drone

SHOT GRAMMAR for ${shotCount} shots:
- Shots 1-2: Wide establishing shots (full environment, natural light)
- Shots 3-4: Medium shots (characters in context)
- Shots 5-${Math.min(shotCount - 2, 7)}: Close-ups (emotion, reaction, detail)
- Shots ${shotCount > 4 ? shotCount - 1 : 5}-${shotCount}: Dynamic + resolution shots

Camera directions: handheld language only. Never use: dolly, crane, slider, zoom, steadicam, jib, gimbal, drone.

OUTPUT FORMAT:
Return ONLY a valid JSON array. NO markdown fences, NO explanation. Each element:
{"shot_number": 1, "shot_type": "WS", "action_description": "What happens visually", "camera_note": "Handheld camera direction", "frame_description": "Complete standalone image prompt, 4-6 sentences"}

Shot types: WS, LS, MS, MCU, CU, OTS, POV, HA, LA, TI
Style: ${style}

IMPORTANT: Return the raw JSON array only. Do NOT wrap it in markdown code fences.`;

  const userPrompt = `Create exactly ${shotCount} shots for: "${scene}"

Visual style: ${style}

Every frame_description MUST start with the SAME character and environment descriptions. Only the action/framing changes.

Return ONLY a JSON array. No markdown, no explanation, no code fences.`;

  return { systemPrompt, userPrompt };
}

// ═══════════════════════════════════════════════════════
// Parse + normalize
// ═══════════════════════════════════════════════════════

function parseAndNormalize(text: string): GenerateResult | null {
  let cleaned = text.trim();

  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Strip any trailing ad/note content (Pollinations adds these sometimes)
  cleaned = cleaned.split(/\n---\n/)[0].trim();
  cleaned = cleaned.split(/\n\n---\n/)[0].trim();
  // Remove any "Powered by" or "Support" ad lines
  cleaned = cleaned.replace(/\n*🌸.*$/s, '').trim();
  cleaned = cleaned.replace(/\n*\*\*Support.*$/s, '').trim();
  cleaned = cleaned.replace(/\n*Powered by.*$/s, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { return null; }
    } else {
      return null;
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const firstFrame = String(parsed[0]?.frame_description || '');
  const continuityAnchor = extractContinuityAnchor(firstFrame);

  const baseSeed = Date.now();

  const shots = parsed.map((shot: Record<string, unknown>, index: number) => {
    const prompt = String(shot.frame_description || shot.action_description || '');
    const fullPrompt = continuityAnchor
      ? `${continuityAnchor}. ${prompt}`
      : prompt;
    const encodedPrompt = encodeURIComponent(fullPrompt + NEGATIVE_SUFFIX);
    const seed = baseSeed + index * 100;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=432&nologo=true&seed=${seed}&model=flux&nofeed=true`;

    return {
      id: crypto.randomUUID(),
      shotNumber: Number(shot.shot_number) || index + 1,
      shotType: String(shot.shot_type || 'MS').toUpperCase().substring(0, 3),
      actionDescription: String(shot.action_description || ''),
      cameraNote: String(shot.camera_note || ''),
      frameDescription: fullPrompt,
      imageUrl,
      order: index,
    };
  });

  return { shots, continuityAnchor };
}

function extractContinuityAnchor(frameDescription: string): string {
  if (!frameDescription) return '';

  const sentences = frameDescription.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return frameDescription;

  const anchorSentences = sentences.slice(0, Math.min(3, Math.ceil(sentences.length * 0.4)));
  return anchorSentences.join(' ');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new AbortGenerationError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
