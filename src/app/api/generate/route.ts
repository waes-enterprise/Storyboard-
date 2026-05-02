import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

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

    // Use built-in z-ai-web-dev-sdk — no external API key needed
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const textContent = completion.choices?.[0]?.message?.content || '[]';

    // Try to parse JSON from the response - handle markdown code fences
    let cleanedText = textContent.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let shots;
    try {
      shots = JSON.parse(cleanedText);
    } catch {
      // Try to extract JSON array from the text
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
