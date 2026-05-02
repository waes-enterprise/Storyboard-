import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function formatStoryboard(sb: Record<string, unknown>) {
  const sbShots = (sb.shots || []) as Array<Record<string, unknown>>;
  return {
    id: sb.id,
    title: sb.title,
    scene: sb.scene,
    style: sb.style,
    shotCount: sb.shotCount || sbShots.length,
    createdAt: sb.createdAt instanceof Date ? sb.createdAt.toISOString() : new Date(sb.createdAt as string).toISOString(),
    updatedAt: sb.updatedAt instanceof Date ? sb.updatedAt.toISOString() : new Date(sb.updatedAt as string).toISOString(),
    shots: sbShots.map((s) => ({
      id: s.id,
      shotNumber: s.shotNumber,
      shotType: s.shotType,
      actionDescription: s.actionDescription,
      cameraNote: s.cameraNote,
      frameDescription: s.frameDescription,
      imageUrl: s.imageUrl,
      order: s.order,
    })),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storyboard = db.storyboard.findUnique({
      where: { id },
      include: { shots: true },
    });
    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    }
    return NextResponse.json(formatStoryboard(storyboard));
  } catch (error) {
    console.error('GET storyboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch storyboard' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, scene, style, shotCount, shots } = body;

    const storyboard = db.storyboard.update({
      where: { id },
      data: {
        title: title || undefined,
        scene: scene || undefined,
        style: style || undefined,
        shotCount: shotCount || undefined,
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

    return NextResponse.json(formatStoryboard(storyboard));
  } catch (error) {
    console.error('PUT storyboard error:', error);
    return NextResponse.json({ error: 'Failed to update storyboard' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    db.storyboard.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE storyboard error:', error);
    return NextResponse.json({ error: 'Failed to delete storyboard' }, { status: 500 });
  }
}
