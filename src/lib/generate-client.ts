/**
 * Client-side storyboard generation — calls Pollinations AI directly from the browser.
 * Bypasses Vercel serverless function network limitations.
 *
 * Features:
 * - Automatic retry with exponential backoff on 429 (rate limit) errors
 * - Request mutex prevents duplicate concurrent generations
 * - Clear error classification (rate limit, network, parsing, etc.)
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
  status: 'calling_ai' | 'parsing' | 'retrying';
  retryAttempt?: number;
  retryDelay?: number;
};

type ProgressCallback = (progress: GenerateProgress) => void;

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 10000, 20000]; // 5s, 10s, 20s

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

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Check if cancelled
      if (controller.signal.aborted) {
        throw new AbortGenerationError();
      }

      if (attempt > 0) {
        const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
        onProgress?.({ status: 'retrying', retryAttempt: attempt, retryDelay: delay / 1000 });
        await sleep(delay, controller.signal);
      }

      onProgress?.({ status: 'calling_ai', retryAttempt: attempt });

      try {
        const result = await callPollinations(
          systemPrompt,
          userPrompt,
          controller.signal
        );

        onProgress?.({ status: 'parsing' });

        if (!result.shots || result.shots.length === 0) {
          throw new Error('AI returned no valid shots. Try a different scene description.');
        }

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (lastError.name === 'AbortGenerationError' || controller.signal.aborted) {
          throw new AbortGenerationError();
        }

        // Only retry on 429 rate limit errors
        if (lastError instanceof RateLimitError) {
          if (attempt < MAX_RETRIES) {
            continue; // retry
          }
          // Exhausted retries
          throw new RateLimitError(
            'AI is busy right now. Please wait a moment and try again.',
            0
          );
        }

        // Non-retryable error — fail immediately
        throw lastError;
      }
    }

    throw lastError || new Error('Generation failed after retries.');
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
  signal: AbortSignal
): Promise<GenerateResult> {
  const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai-fast',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
    signal,
  });

  if (res.status === 429) {
    // Rate limited — extract retry-after if available
    const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
    throw new RateLimitError(
      'AI service is busy (rate limited). Retrying...',
      retryAfter
    );
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`AI service error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const textContent = data.choices?.[0]?.message?.content || '';

  if (!textContent) {
    throw new Error('AI returned empty response. Try a different scene.');
  }

  const result = parseAndNormalize(textContent);
  if (!result) {
    throw new Error('AI returned invalid format. Try again or simplify your scene.');
  }

  return result;
}

// ═══════════════════════════════════════════════════════
// Prompt builder
// ═══════════════════════════════════════════════════════

function buildPrompts(scene: string, style: string, shotCount: number) {
  const systemPrompt = `You are an expert film director and cinematographer. Create shot lists with PERFECT visual continuity — every frame looks like it was captured on the same day, same location, same camera.

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

Camera directions: handheld language only (e.g. "handheld walk alongside subject", "operator steps back", "shoulder-mounted follow shot"). Never use: dolly, crane, slider, zoom, steadicam, jib, gimbal, drone.

OUTPUT FORMAT:
Return ONLY a valid JSON array. NO markdown fences, NO explanation. Each element:
{"shot_number": 1, "shot_type": "WS", "action_description": "What happens visually in 2-3 sentences", "camera_note": "Handheld camera direction", "frame_description": "Complete standalone image prompt, 4-6 sentences"}

Shot types: WS, LS, MS, MCU, CU, OTS, POV, HA, LA, TI
Style: ${style}`;

  const userPrompt = `Create exactly ${shotCount} shots for this scene:

"${scene}"

Visual style: ${style}

CRITICAL: Every frame_description MUST start with the SAME character and environment descriptions. Only the action/framing changes between shots.

Return ONLY a JSON array with ${shotCount} shot objects. No markdown, no explanation.`;

  return { systemPrompt, userPrompt };
}

// ═══════════════════════════════════════════════════════
// Parse + normalize
// ═══════════════════════════════════════════════════════

function parseAndNormalize(text: string): GenerateResult | null {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

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
