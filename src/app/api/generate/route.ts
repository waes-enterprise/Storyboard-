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

    // Call the backend generate API (hosted on the Z.ai server)
    // AI_PROXY_URL should be set to the Cloudflare tunnel URL of the local server
    const proxyUrl = process.env.AI_PROXY_URL;
    
    let textContent: string;
    
    if (proxyUrl) {
      // Forward the request to the backend server via Cloudflare tunnel
      const response = await fetch(`${proxyUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, style, shotCount }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend proxy error:', response.status, errorText);
        return NextResponse.json({ error: 'AI backend unavailable', details: errorText }, { status: 502 });
      }

      const data = await response.json();
      textContent = JSON.stringify(data.shots || []);
    } else {
      // Fallback: try z-ai-web-dev-sdk (only works in Z.ai container)
      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default;
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        textContent = completion.choices?.[0]?.message?.content || '[]';
      } catch (sdkError) {
        console.error('SDK fallback error:', sdkError);
        return NextResponse.json(
          { error: 'AI service not configured. Please set the AI_PROXY_URL environment variable.' },
          { status: 500 }
        );
      }
    }

    // Try to parse JSON from the response
    let cleanedText = textContent.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let shots;
    try {
      shots = JSON.parse(cleanedText);
    } catch {
      const match = cleanedText.match(/\[[\s\S]*\]/);
      if (match) {
        shots = JSON.parse(match[0]);
      } else {
        return NextResponse.json({ error: 'Failed to parse shot list from AI response. Please try again.' }, { status: 500 });
      }
    }

    if (!Array.isArray(shots)) {
      return NextResponse.json({ error: 'AI response was not in expected format. Please try again.' }, { status: 500 });
    }

    // Normalize the shots
    const normalizedShots = shots.map((shot: Record<string, unknown>, index: number) => ({
      id: crypto.randomUUID(),
      shotNumber: (shot.shot_number as number) || index + 1,
      shotType: (shot.shot_type as string) || 'MS',
      actionDescription: (shot.action_description as string) || '',
      cameraNote: (shot.camera_note as string) || '',
      frameDescription: (shot.frame_description as string) || '',
      imageUrl: '',
      order: index,
    }));

    return NextResponse.json({ shots: normalizedShots });
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate storyboard. Please try again.' },
      { status: 500 }
    );
  }
}
