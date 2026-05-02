import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

    const sb = storyboard as Record<string, unknown>;
    const sbShots = (sb.shots || []) as Array<Record<string, unknown>>;
    const html = generateStoryboardHTML({
      title: sb.title as string,
      scene: sb.scene as string,
      style: sb.style as string,
      shots: sbShots,
    });

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="${(sb.title as string).replace(/\s+/g, '_')}_storyboard.html"`,
      },
    });
  } catch (error) {
    console.error('Export PDF error:', error);
    return NextResponse.json({ error: 'Failed to export storyboard' }, { status: 500 });
  }
}

function generateStoryboardHTML(storyboard: {
  title: string;
  scene: string;
  style: string;
  shots: Array<Record<string, unknown>>;
}): string {
  const shotCards = storyboard.shots
    .map((shot) => `
    <div class="shot-card">
      <div class="shot-header">
        <span class="shot-number">SHOT ${shot.shotNumber}</span>
        <span class="shot-type">${shot.shotType}</span>
      </div>
      ${shot.imageUrl ? `<img src="${shot.imageUrl}" alt="Shot ${shot.shotNumber}" class="shot-image" onerror="this.style.display='none'" />` : '<div class="shot-placeholder">No Image</div>'}
      <div class="shot-body">
        <p class="action">${shot.actionDescription}</p>
        <p class="camera">🎬 ${shot.cameraNote}</p>
      </div>
    </div>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <title>${storyboard.title} — Storyboard</title>
  <style>
    @page { size: landscape; margin: 0.5in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #111; padding: 40px; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #E8C547; padding-bottom: 20px; }
    .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .header .meta { font-size: 14px; color: #666; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .shot-card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
    .shot-header { display: flex; justify-content: space-between; padding: 10px 14px; background: #f8f8f8; border-bottom: 1px solid #ddd; }
    .shot-number { font-weight: 700; font-size: 13px; letter-spacing: 1px; }
    .shot-type { background: #E8C547; color: #111; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .shot-image { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
    .shot-placeholder { width: 100%; aspect-ratio: 16/9; background: #f0f0f0; display: flex; align-items: center; justify-content: center; color: #999; font-size: 14px; }
    .shot-body { padding: 12px 14px; }
    .action { font-size: 13px; line-height: 1.5; margin-bottom: 6px; }
    .camera { font-size: 12px; color: #E8C547; font-style: italic; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${storyboard.title}</h1>
    <div class="meta">Style: ${storyboard.style} &bull; ${storyboard.shots.length} Shots</div>
    <div class="meta" style="margin-top: 4px; font-style: italic;">${storyboard.scene}</div>
  </div>
  <div class="grid">${shotCards}</div>
</body>
</html>`;
}
