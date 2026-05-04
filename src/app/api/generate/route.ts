import { NextRequest, NextResponse } from 'next/server';

// Detect if we're on Vercel (no z-ai-web-dev-sdk available)
const IS_VERCEL = !!process.env.VERCEL;

export async function POST(request: NextRequest) {
  try {
    const { scene, style, shotCount } = await request.json();

    if (!scene?.trim()) {
      return NextResponse.json({ error: 'Scene description is required' }, { status: 400 });
    }

    const { systemPrompt, userPrompt } = buildPrompts(scene, style, shotCount);

    // ═══════════════════════════════════════════════════════
    // Strategy 1: z-ai-web-dev-sdk (local Z.ai server — fastest, best quality)
    // ═══════════════════════════════════════════════════════
    if (!IS_VERCEL) {
      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default;
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        const textContent = completion.choices?.[0]?.message?.content || '';
        if (textContent) {
          const result = parseAndNormalize(textContent);
          if (result) return NextResponse.json(result);
        }
      } catch (err) {
        console.error('z-ai SDK failed:', err);
      }
    }

    // ═══════════════════════════════════════════════════════
    // Strategy 2: Pollinations AI (free, works everywhere — PRIMARY for Vercel)
    // ═══════════════════════════════════════════════════════
    try {
      const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (res.ok) {
        const data = await res.json();
        const textContent = data.choices?.[0]?.message?.content || '';
        if (textContent) {
          const result = parseAndNormalize(textContent);
          if (result) return NextResponse.json(result);
        }
      } else {
        const errBody = await res.text().catch(() => '');
        console.error('Pollinations API error:', res.status, errBody);
      }
    } catch (err) {
      console.error('Pollinations API failed:', err);
    }

    return NextResponse.json(
      { error: 'All AI services are currently unavailable. Please try again in a moment.' },
      { status: 503 }
    );
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate storyboard. Please try again.' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════
// Prompt builder — clean, focused, optimized for all LLMs
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// Parse + normalize — builds image URLs
// ═══════════════════════════════════════════════════════════

const NEGATIVE_SUFFIX = ', raw ungraded documentary footage from real camera SD card, natural sunlight only, no color grading no filters no CGI no VFX no animation no AI enhancement, no text no watermarks no overlays no subtitles no graphics, handheld documentary camera style, real photography photorealistic, natural lens no zoom, candid moment captured on set, film grain, natural skin texture, no plastic skin';

function parseAndNormalize(text: string) {
  let cleaned = text.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from the response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { return null; }
    } else {
      return null;
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  // Extract continuity anchor from the first shot's frame_description
  const firstFrame = String(parsed[0]?.frame_description || '');
  const continuityAnchor = extractContinuityAnchor(firstFrame);

  const baseSeed = Date.now();

  const shots = parsed.map((shot: Record<string, unknown>, index: number) => {
    const prompt = String(shot.frame_description || shot.action_description || '');
    // Prepend continuity anchor for visual consistency
    const fullPrompt = continuityAnchor
      ? `${continuityAnchor}. ${prompt}`
      : prompt;
    const encodedPrompt = encodeURIComponent(fullPrompt + NEGATIVE_SUFFIX);
    // Sequential seeds for consistency across shots
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

/**
 * Extract the continuity anchor (shared character + environment description)
 * from the first frame. This gets prepended to all subsequent image prompts.
 */
function extractContinuityAnchor(frameDescription: string): string {
  if (!frameDescription) return '';

  const sentences = frameDescription.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return frameDescription;

  // First 2-3 sentences typically describe characters + environment
  const anchorSentences = sentences.slice(0, Math.min(3, Math.ceil(sentences.length * 0.4)));
  return anchorSentences.join(' ');
}
