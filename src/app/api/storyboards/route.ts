import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const storyboards = await db.storyboard.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        shots: {
          orderBy: { order: 'asc' },
        },
      },
    });

    const formatted = storyboards.map((sb) => ({
      id: sb.id,
      title: sb.title,
      scene: sb.scene,
      style: sb.style,
      shotCount: sb.shotCount,
      createdAt: sb.createdAt.toISOString(),
      updatedAt: sb.updatedAt.toISOString(),
      shots: sb.shots.map((s) => ({
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
    return NextResponse.json({ error: 'Failed to fetch storyboards' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, scene, style, shotCount, shots } = body;

    if (!scene?.trim()) {
      return NextResponse.json({ error: 'Scene description is required' }, { status: 400 });
    }

    const storyboard = await db.storyboard.create({
      data: {
        title: title || 'Untitled Storyboard',
        scene,
        style: style || 'Cinematic',
        shotCount: shotCount || shots?.length || 0,
        shots: {
          create: (shots || []).map((shot: { shotNumber: number; shotType: string; actionDescription: string; cameraNote: string; frameDescription: string; imageUrl: string; order: number }) => ({
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
      include: { shots: { orderBy: { order: 'asc' } } },
    });

    return NextResponse.json({
      id: storyboard.id,
      title: storyboard.title,
      scene: storyboard.scene,
      style: storyboard.style,
      shotCount: storyboard.shotCount,
      createdAt: storyboard.createdAt.toISOString(),
      updatedAt: storyboard.updatedAt.toISOString(),
      shots: storyboard.shots.map((s) => ({
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
