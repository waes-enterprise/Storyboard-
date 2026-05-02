import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { scene, style, shotCount } = await request.json();

    if (!scene?.trim()) {
      return NextResponse.json({ error: 'Scene description is required' }, { status: 400 });
    }

    const systemPrompt = `You are an autonomous film director and cinematographer. You create professional shot lists for filmmakers.

Return ONLY a valid JSON array (no markdown, no code fences, no explanation). Each element must have exactly these fields:
- "shot_number": integer starting from 1
- "shot_type": one of WS, LS, MS, MCU, CU, OTS, POV, HA, LA, TI
- "action_description": what happens in this shot (2-3 sentences, specific visual actions)
- "camera_note": specific camera direction (e.g. "slow dolly left", " handheld push-in", "crane up revealing...", "static wide")
- "frame_description": detailed visual description of the frame composition for image generation (describe what we SEE, not what happens - include lighting, composition, character positions, setting details)

Style: ${style}
Shot count: exactly ${shotCount} shots

Apply real film grammar:
- Open with establishing shots (WS/LS)
- Vary shot sizes to create rhythm
- Include movement and angle changes
- Build dramatic tension through shot progression
- Consider the emotional arc across the sequence
- Frame descriptions should be evocative and specific enough for image generation`;

    const userPrompt = `Create a ${shotCount}-shot storyboard for this scene:

"${scene}"

Visual style: ${style}

Remember: return ONLY a JSON array with ${shotCount} shot objects. Each must have: shot_number, shot_type, action_description, camera_note, frame_description.`;

    // Strategy 1: Try z-ai-web-dev-sdk (works on local Z.ai server)
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
      // SDK not available, continue
    }

    // Strategy 2: Pollinations AI (free, no key needed, works everywhere)
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
        signal: AbortSignal.timeout(90000),
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

  return parsed.map((shot: Record<string, unknown>, index: number) => ({
    id: crypto.randomUUID(),
    shotNumber: Number(shot.shot_number) || index + 1,
    shotType: String(shot.shot_type || 'MS').toUpperCase().substring(0, 3),
    actionDescription: String(shot.action_description || ''),
    cameraNote: String(shot.camera_note || ''),
    frameDescription: String(shot.frame_description || ''),
    imageUrl: String(shot.imageUrl || ''),
    order: index,
  }));
}
