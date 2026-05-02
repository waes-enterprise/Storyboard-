// In-memory store that mimics Prisma API — works on Vercel (no filesystem DB needed)
// Falls back to empty arrays gracefully

import { randomUUID } from 'crypto';

interface ShotRecord {
  id: string;
  storyboardId: string;
  shotNumber: number;
  shotType: string;
  actionDescription: string;
  cameraNote: string;
  frameDescription: string;
  imageUrl: string;
  order: number;
}

interface StoryboardRecord {
  id: string;
  title: string;
  scene: string;
  style: string;
  shotCount: number;
  createdAt: Date;
  updatedAt: Date;
  shots?: ShotRecord[];
}

const storyboards = new Map<string, StoryboardRecord>();
const shots = new Map<string, ShotRecord>();

function shotsForStoryboard(storyboardId: string): ShotRecord[] {
  return Array.from(shots.values())
    .filter((s) => s.storyboardId === storyboardId)
    .sort((a, b) => a.order - b.order);
}

function applyOrderBy(list: StoryboardRecord[], orderBy?: Record<string, string>): StoryboardRecord[] {
  if (!orderBy) return list;
  const sorted = [...list];
  const key = Object.keys(orderBy)[0] as keyof StoryboardRecord;
  const dir = orderBy[key] === 'desc' ? -1 : 1;
  sorted.sort((a, b) => {
    const va = a[key]; const vb = b[key];
    if (va instanceof Date && vb instanceof Date) return (va.getTime() - vb.getTime()) * dir;
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return 0;
  });
  return sorted;
}

const storyboardDelegate = {
  findMany(args?: { orderBy?: Record<string, string>; include?: Record<string, unknown> }) {
    const ordered = applyOrderBy(Array.from(storyboards.values()), args?.orderBy);
    return ordered.map((r) => ({
      ...r,
      shots: args?.include?.shots ? shotsForStoryboard(r.id) : [],
    }));
  },

  create(args: { data: Record<string, unknown>; include?: Record<string, unknown> }) {
    const now = new Date();
    const record: StoryboardRecord = {
      id: (args.data.id as string) || randomUUID(),
      title: (args.data.title as string) || 'Untitled Storyboard',
      scene: (args.data.scene as string) || '',
      style: (args.data.style as string) || 'Cinematic',
      shotCount: (args.data.shotCount as number) || 0,
      createdAt: now,
      updatedAt: now,
    };
    // Handle nested shot creation (Prisma pattern: shots.create)
    const nestedShots = args.data.shots as { create?: Array<Record<string, unknown>> } | undefined;
    if (nestedShots?.create) {
      for (const shotData of nestedShots.create) {
        const shot: ShotRecord = {
          id: randomUUID(),
          storyboardId: record.id,
          shotNumber: (shotData.shotNumber as number) || 0,
          shotType: (shotData.shotType as string) || 'MS',
          actionDescription: (shotData.actionDescription as string) || '',
          cameraNote: (shotData.cameraNote as string) || '',
          frameDescription: (shotData.frameDescription as string) || '',
          imageUrl: (shotData.imageUrl as string) || '',
          order: (shotData.order as number) || 0,
        };
        shots.set(shot.id, shot);
      }
    }
    storyboards.set(record.id, record);
    return {
      ...record,
      shots: args?.include?.shots ? shotsForStoryboard(record.id) : [],
    };
  },

  findUnique(args: { where: { id: string }; include?: Record<string, unknown> }) {
    const record = storyboards.get(args.where.id);
    if (!record) return null;
    return { ...record, shots: args?.include?.shots ? shotsForStoryboard(record.id) : [] };
  },

  update(args: { where: { id: string }; data: Record<string, unknown>; include?: Record<string, unknown> }) {
    const existing = storyboards.get(args.where.id);
    if (!existing) throw new Error('Not found');
    // Delete old shots and recreate
    for (const shot of shotsForStoryboard(existing.id)) shots.delete(shot.id);
    const nestedShots = args.data.shots as { create?: Array<Record<string, unknown>> } | undefined;
    if (nestedShots?.create) {
      for (const shotData of nestedShots.create) {
        const shot: ShotRecord = {
          id: randomUUID(),
          storyboardId: existing.id,
          shotNumber: (shotData.shotNumber as number) || 0,
          shotType: (shotData.shotType as string) || 'MS',
          actionDescription: (shotData.actionDescription as string) || '',
          cameraNote: (shotData.cameraNote as string) || '',
          frameDescription: (shotData.frameDescription as string) || '',
          imageUrl: (shotData.imageUrl as string) || '',
          order: (shotData.order as number) || 0,
        };
        shots.set(shot.id, shot);
      }
    }
    const updated: StoryboardRecord = {
      ...existing,
      title: (args.data.title as string) ?? existing.title,
      scene: (args.data.scene as string) ?? existing.scene,
      style: (args.data.style as string) ?? existing.style,
      shotCount: (args.data.shotCount as number) ?? existing.shotCount,
      updatedAt: new Date(),
    };
    storyboards.set(updated.id, updated);
    return { ...updated, shots: args?.include?.shots ? shotsForStoryboard(updated.id) : [] };
  },

  delete(args: { where: { id: string } }) {
    const record = storyboards.get(args.where.id);
    if (!record) throw new Error('Not found');
    for (const shot of shotsForStoryboard(record.id)) shots.delete(shot.id);
    storyboards.delete(record.id);
    return record;
  },
};

const shotDelegate = {
  deleteMany(args: { where: Record<string, unknown> }) {
    const result = Array.from(shots.values()).filter((s) => s.storyboardId === args.where.storyboardId);
    for (const shot of result) shots.delete(shot.id);
    return { count: result.length };
  },
};

export const db = { storyboard: storyboardDelegate, shot: shotDelegate };
export function isDatabaseAvailable(): boolean { return true; }
