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

    const systemPrompt = `You are an autonomous film director and cinematographer specializing in raw documentary-style filmmaking. You create professional shot lists that look like real footage captured on a real set with natural lighting.

CRITICAL STYLE RULES for ALL frame descriptions:
- Describe everything as RAW UNGRADED REAL FOOTAGE — like it was actually filmed on a real camera on a real set
- Natural sunlight and available practical lights ONLY — no studio lighting, no gels, no colored lights
- No color grading, no filters, no post-production effects
- No CGI, no VFX, no animation, no AI enhancement
- No text, no watermarks, no overlays, no graphics on screen
- Handheld documentary camera style — organic movement, slight natural shake
- No zoom in, no zoom out — fixed focal length, camera moves by physically moving
- Photorealistic, real photography aesthetic — like a behind-the-scenes photo on a real film set
- Describe real people, real locations, real props — nothing stylized or illustrated
- Mention natural details: skin texture, fabric wrinkles, dust particles, ambient shadows

Return ONLY a valid JSON array (no markdown, no code fences, no explanation). Each element must have exactly these fields:
- "shot_number": integer starting from 1
- "shot_type": one of WS, LS, MS, MCU, CU, OTS, POV, HA, LA, TI
- "action_description": what happens in this shot (2-3 sentences, specific visual actions)
- "camera_note": specific camera direction using handheld style (e.g. "handheld walk alongside subject", "operator steps backward revealing room", "static handheld slight drift", "shoulder-mounted follow shot") — NEVER use dolly, crane, slider, or zoom
- "frame_description": detailed photorealistic description for image generation. Describe EXACTLY what a real camera on set would capture — real lighting conditions, real textures, real environment. Include: time of day, light source direction, shadow patterns, clothing details, prop details, background elements. Write as if describing a photograph taken on a real film set.

Style: Raw Documentary ${style}
Shot count: exactly ${shotCount} shots

Apply real documentary film grammar:
- Open with wide establishing shots showing the full environment in natural light
- Vary shot sizes to create rhythm — get close for reaction, pull back for context
- Camera should feel like a documentary crew following real events
- Build tension through proximity and timing, not camera tricks
- Frame descriptions must be detailed enough to generate a photorealistic image that looks like raw footage`;

    const userPrompt = `Create a ${shotCount}-shot storyboard for this scene:

"${scene}"

Visual style: ${style}

Remember: return ONLY a JSON array with ${shotCount} shot objects. Each must have: shot_number, shot_type, action_description, camera_note, frame_description.`;

    // Strategy 1: Google Gemini API (primary — fast, works everywhere)
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
            temperature: 0.8,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (res.ok) {
        const data = await res.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (textContent) {
          const shots = parseAndNormalize(textContent);
          if (shots) return NextResponse.json({ shots });
        }
      } else {
        console.error('Gemini API error:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.error('Gemini API failed:', err);
    }

    // Strategy 2: z-ai-web-dev-sdk (local Z.ai server only — skip on Vercel)
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
        const shots = parseAndNormalize(textContent);
        if (shots) return NextResponse.json({ shots });
      } catch {
        // SDK not available, continue to fallback
      }
    }

    // Strategy 3: Pollinations AI (free fallback, no key needed)
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
        const shots = parseAndNormalize(textContent);
        if (shots) return NextResponse.json({ shots });
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

function parseAndNormalize(text: string) {
  let cleaned = text.trim();
  // Strip markdown code fences
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

  const STYLE_SUFFIX = ', raw ungraded footage, natural sunlight only, no color grading no filters no CGI no VFX no animation no AI enhancement, no text no watermarks no overlays, handheld documentary camera style, real photography, photorealistic, natural lens, no zoom, candid moment captured on set';
  const baseSeed = Date.now();

  return parsed.map((shot: Record<string, unknown>, index: number) => {
    const prompt = String(shot.frame_description || shot.action_description || '');
    const encodedPrompt = encodeURIComponent(prompt + STYLE_SUFFIX);
    const seed = baseSeed + index * 7919;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=432&nologo=true&seed=${seed}&model=turbo&nofeed=true`;

    return {
      id: crypto.randomUUID(),
      shotNumber: Number(shot.shot_number) || index + 1,
      shotType: String(shot.shot_type || 'MS').toUpperCase().substring(0, 3),
      actionDescription: String(shot.action_description || ''),
      cameraNote: String(shot.camera_note || ''),
      frameDescription: String(shot.frame_description || ''),
      imageUrl,
      order: index,
    };
  });
}
