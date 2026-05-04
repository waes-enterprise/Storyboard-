import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_API_KEY = 'AIzaSyDbKKOXXUlbNJiicthScSFTiaXOMwYIU9s';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`;

// Detect if we're on Vercel (no z-ai-web-dev-sdk available)
const IS_VERCEL = !!process.env.VERCEL;

export async function POST(request: NextRequest) {
  try {
    const { scene, style, shotCount } = await request.json();

    if (!scene?.trim()) {
      return NextResponse.json({ error: 'Scene description is required' }, { status: 400 });
    }

    const systemPrompt = `You are an elite film director and master cinematographer with 30 years of experience in documentary and narrative filmmaking. You create shot lists with ABSOLUTE visual continuity — every frame looks like it was captured on the same day, in the same location, with the same camera and lighting.

═══ CONTINUITY PROTOCOL ═══
Before planning any shot, you must internally lock these elements and NEVER deviate:

CHARACTER BIBLE — describe EVERY character in the scene in extreme detail:
- Full physical description: age, ethnicity, gender, height, build, body type
- Face: shape, skin tone, eye color, eyebrow shape, nose shape, lip shape, jawline
- Hair: style, length, color, texture, how it falls
- Clothing: exact outfit — shirt/top color and type, pants/skirt, jacket, shoes, accessories
- Distinguishing marks: scars, tattoos, glasses, jewelry, freckles
- YOU MUST use the EXACT SAME character description in EVERY shot's frame_description

ENVIRONMENT BIBLE — describe the location in extreme detail:
- Location type: interior/exterior, specific room or place
- Architecture: wall color/material, ceiling, floor material and color
- Furniture and props: specific items with placement, materials, colors
- Weather/atmosphere: clear, overcast, dust, humidity
- Lighting: direction of natural light, quality (soft/hard), color temperature
- Time of day: be specific (e.g. "mid-morning, 9:30 AM, golden hour light from east")
- YOU MUST use the EXACT SAME environment in EVERY shot's frame_description

═══ CRITICAL IMAGE RULES ═══
Every frame_description is a STANDALONE image generation prompt. It MUST include:
1. The full character bible (same exact words in every shot)
2. The full environment bible (same exact words in every shot)
3. The shot-specific action, framing, and composition
4. Lighting details (consistent across all shots)
5. Camera/lens info (e.g. "shot on 35mm prime lens, shallow depth of field")
6. Texture details: fabric weave, skin pores, wood grain, concrete texture, dust motes
7. Atmosphere: light rays, reflections, shadows, ambient particles

ABSOLUTE NEGATIVE PROMPT (never include in any frame):
- NO color grading, NO filters, NO post-production effects
- NO CGI, NO VFX, NO animation, NO illustration
- NO text, NO watermarks, NO overlays, NO graphics, NO subtitles
- NO studio lighting, NO gels, NO colored lights, NO ring lights
- NO zoom, NO dolly, NO crane, NO slider, NO gimbal, NO drone
- NO AI look, NO plastic skin, NO oversharpened details

═══ SHOT GRAMMAR (film school rules) ═══
Professional shot rhythm for ${shotCount} shots:
- Shots 1-2: Wide establishing — show full environment in natural light
- Shots 3-4: Medium shots — introduce characters in context
- Shots 5-7: Close-ups — capture emotion, reaction, detail
- Shots 8-9: Dynamic shots — movement, tension, energy shift
- Shot ${shotCount}: Resolution — wide or medium showing scene outcome

Camera directions use HANDHELD language ONLY:
- "handheld walk alongside subject tracking left"
- "operator steps backward revealing the full room"
- "shoulder-mounted follow shot, slight drift right"
- "static handheld, organic micro-movements"
- "operator crouches and tilts up slowly"
NEVER use: dolly, crane, slider, zoom, steadicam, jib, gimbal, drone, track

═══ OUTPUT FORMAT ═══
Return ONLY a valid JSON array with NO markdown fences, NO explanation.
Each element must have exactly these fields:

{
  "shot_number": 1,
  "shot_type": "WS",
  "action_description": "Specific visual actions in 2-3 sentences. What the character DOES, not what they feel.",
  "camera_note": "Handheld camera direction describing operator movement",
  "frame_description": "COMPLETE standalone image prompt. 4-6 sentences of extreme visual detail. MUST start with character description, then environment, then action/framing. This is used directly for AI image generation."
}

Shot types: WS (Wide Shot), LS (Long Shot), MS (Medium Shot), MCU (Medium Close-Up), CU (Close-Up), OTS (Over the Shoulder), POV (Point of View), HA (High Angle), LA (Low Angle), TI (Two Shot)

Style: ${style}
Shot count: EXACTLY ${shotCount} shots
Scene: "${scene}"

Remember: EVERY frame_description must contain the EXACT SAME character and environment descriptions. This is non-negotiable for visual continuity.`;

    const userPrompt = `Create a ${shotCount}-shot storyboard for this scene:

"${scene}"

Visual style: ${style}

CRITICAL CONTINUITY REQUIREMENT:
1. First, mentally create a detailed character bible (physical appearance, clothing, distinguishing features)
2. Mentally create an environment bible (location, lighting, time of day, props)
3. Write EVERY frame_description starting with the SAME character and environment descriptions
4. Only the action/framing/composition should differ between shots
5. This ensures all ${shotCount} images look like they're from the same scene

Return ONLY a JSON array with ${shotCount} shot objects.`;

    // Strategy 1: Google Gemini API (primary)
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `System instructions:\n${systemPrompt}\n\nUser request:\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (res.ok) {
        const data = await res.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (textContent) {
          const result = parseAndNormalize(textContent);
          if (result) return NextResponse.json(result);
        }
      } else {
        console.error('Gemini API error:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.error('Gemini API failed:', err);
    }

    // Strategy 2: z-ai-web-dev-sdk (local Z.ai server only)
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
        const result = parseAndNormalize(textContent);
        if (result) return NextResponse.json(result);
      } catch {
        // SDK not available
      }
    }

    // Strategy 3: Pollinations AI (free fallback)
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
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json();
        const textContent = data.choices?.[0]?.message?.content || '';
        const result = parseAndNormalize(textContent);
        if (result) return NextResponse.json(result);
      }
    } catch {
      // Pollinations not available
    }

    return NextResponse.json(
      { error: 'AI service is currently unavailable. Please try again.' },
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

const NEGATIVE_SUFFIX = ', raw ungraded documentary footage from real camera SD card, natural sunlight only, no color grading no filters no CGI no VFX no animation no AI enhancement, no text no watermarks no overlays no subtitles no graphics, handheld documentary camera style, real photography photorealistic, natural lens no zoom, candid moment captured on set, film grain, natural skin texture, no plastic skin';

function parseAndNormalize(text: string) {
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

  if (!Array.isArray(parsed)) return null;
  if (parsed.length === 0) return null;

  // Extract continuity anchor from the first shot's frame_description
  // This ensures all image prompts share the same character/environment base
  const firstFrame = String(parsed[0]?.frame_description || '');
  const continuityAnchor = extractContinuityAnchor(firstFrame);

  const baseSeed = Date.now();

  const shots = parsed.map((shot: Record<string, unknown>, index: number) => {
    const prompt = String(shot.frame_description || shot.action_description || '');
    // Build the full image prompt with continuity anchor
    const fullPrompt = continuityAnchor
      ? `${continuityAnchor}. ${prompt}`
      : prompt;
    const encodedPrompt = encodeURIComponent(fullPrompt + NEGATIVE_SUFFIX);
    // Use sequential seeds close together for visual consistency
    const seed = baseSeed + index * 100;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=432&nologo=true&seed=${seed}&model=turbo&nofeed=true`;

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
 * Extract the continuity anchor from the first frame description.
 * This captures the shared character and environment description
 * that should be prepended to all subsequent image prompts.
 */
function extractContinuityAnchor(frameDescription: string): string {
  if (!frameDescription) return '';

  // Split into sentences and take the first 2-3 which typically describe characters/environment
  const sentences = frameDescription.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 2) return frameDescription;

  // Take first 2-3 sentences as the continuity anchor
  // (these usually describe who the characters are and where they are)
  const anchorSentences = sentences.slice(0, Math.min(3, Math.ceil(sentences.length * 0.4)));
  return anchorSentences.join(' ');
}
