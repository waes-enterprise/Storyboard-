import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const storyboards = (db as any).storyboard.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { shots: true },
    });

    const formatted = storyboards.map((sb) => ({
      id: sb.id,
      title: sb.title,
      scene: sb.scene,
      style: sb.style,
      shotCount: sb.shotCount || (sb.shots || []).length,
      createdAt: sb.createdAt instanceof Date ? sb.createdAt.toISOString() : new Date(sb.createdAt).toISOString(),
      updatedAt: sb.updatedAt instanceof Date ? sb.updatedAt.toISOString() : new Date(sb.updatedAt).toISOString(),
      shots: (sb.shots || []).map((s) => ({
        id: s.id,
        shotNumber: s.shotNumber,
        shotType: s.shotType,
        actionDescription: s.actionDescription,
        cameraNote: s.cameraNote,
        frameDescription: s.frameDescription,
        imageUrl: s.imageUrl,
        order: s.order,
      })),
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('GET storyboards error:', error);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, scene, style, shotCount, shots } = body;

    if (!scene?.trim()) {
      return NextResponse.json({ error: 'Scene description is required' }, { status: 400 });
    }

    const storyboard = (db as any).storyboard.create({
      data: {
        title: title || 'Untitled Storyboard',
        scene,
        style: style || 'Cinematic',
        shotCount: shotCount || shots?.length || 0,
        shots: {
          create: (shots || []).map((shot: Record<string, unknown>) => ({
            shotNumber: shot.shotNumber,
            shotType: shot.shotType,
            actionDescription: shot.actionDescription,
            cameraNote: shot.cameraNote,
            frameDescription: shot.frameDescription,
            imageUrl: shot.imageUrl,
            order: shot.order,
          })),
        },
      },
      include: { shots: true },
    });

    return NextResponse.json({
      id: storyboard.id,
      title: storyboard.title,
      scene: storyboard.scene,
      style: storyboard.style,
      shotCount: storyboard.shotCount || (storyboard.shots || []).length,
      createdAt: storyboard.createdAt instanceof Date ? storyboard.createdAt.toISOString() : new Date(storyboard.createdAt).toISOString(),
      updatedAt: storyboard.updatedAt instanceof Date ? storyboard.updatedAt.toISOString() : new Date(storyboard.updatedAt).toISOString(),
      shots: (storyboard.shots || []).map((s) => ({
        id: s.id,
        shotNumber: s.shotNumber,
        shotType: s.shotType,
        actionDescription: s.actionDescription,
        cameraNote: s.cameraNote,
        frameDescription: s.frameDescription,
        imageUrl: s.imageUrl,
        order: s.order,
      })),
    });
  } catch (error) {
    console.error('POST storyboard error:', error);
    return NextResponse.json({ error: 'Failed to create storyboard' }, { status: 500 });
  }
}
