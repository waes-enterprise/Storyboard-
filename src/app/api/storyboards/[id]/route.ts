import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storyboard = await db.storyboard.findUnique({
      where: { id },
      include: { shots: { orderBy: { order: 'asc' } } },
    });

    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    }

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
    console.error('GET storyboard by id error:', error);
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

    // Delete existing shots and recreate
    await db.shot.deleteMany({ where: { storyboardId: id } });

    const storyboard = await db.storyboard.update({
      where: { id },
      data: {
        title: title || undefined,
        scene: scene || undefined,
        style: style || undefined,
        shotCount: shotCount || undefined,
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
    await db.storyboard.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE storyboard error:', error);
    return NextResponse.json({ error: 'Failed to delete storyboard' }, { status: 500 });
  }
}
