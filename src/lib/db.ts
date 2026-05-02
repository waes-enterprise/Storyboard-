// Smart database layer: uses real Prisma Client when DATABASE_URL is available,
// falls back to in-memory Map store for environments without a database (e.g. Vercel without Postgres)

import { randomUUID } from 'crypto';

// --- In-memory fallback store (mirrors Prisma API surface) ---

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

const memStoryboards = new Map<string, StoryboardRecord>();
const memShots = new Map<string, ShotRecord>();

function memShotsForStoryboard(storyboardId: string): ShotRecord[] {
  return Array.from(memShots.values())
    .filter((s) => s.storyboardId === storyboardId)
    .sort((a, b) => a.order - b.order);
}

function memApplyOrderBy(list: StoryboardRecord[], orderBy?: Record<string, string>): StoryboardRecord[] {
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

function memCreateShots(storyboardId: string, nestedShots: { create?: Array<Record<string, unknown>> } | undefined) {
  if (nestedShots?.create) {
    for (const shotData of nestedShots.create) {
      const shot: ShotRecord = {
        id: randomUUID(),
        storyboardId,
        shotNumber: (shotData.shotNumber as number) || 0,
        shotType: (shotData.shotType as string) || 'MS',
        actionDescription: (shotData.actionDescription as string) || '',
        cameraNote: (shotData.cameraNote as string) || '',
        frameDescription: (shotData.frameDescription as string) || '',
        imageUrl: (shotData.imageUrl as string) || '',
        order: (shotData.order as number) || 0,
      };
      memShots.set(shot.id, shot);
    }
  }
}

const memStoryboardDelegate = {
  findMany(args?: { orderBy?: Record<string, string>; include?: Record<string, unknown> }) {
    const ordered = memApplyOrderBy(Array.from(memStoryboards.values()), args?.orderBy);
    return ordered.map((r) => ({
      ...r,
      shots: args?.include?.shots ? memShotsForStoryboard(r.id) : [],
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
    memCreateShots(record.id, args.data.shots as { create?: Array<Record<string, unknown>> } | undefined);
    memStoryboards.set(record.id, record);
    return { ...record, shots: args?.include?.shots ? memShotsForStoryboard(record.id) : [] };
  },
  findUnique(args: { where: { id: string }; include?: Record<string, unknown> }) {
    const record = memStoryboards.get(args.where.id);
    if (!record) return null;
    return { ...record, shots: args?.include?.shots ? memShotsForStoryboard(record.id) : [] };
  },
  update(args: { where: { id: string }; data: Record<string, unknown>; include?: Record<string, unknown> }) {
    const existing = memStoryboards.get(args.where.id);
    if (!existing) throw new Error('Not found');
    for (const shot of memShotsForStoryboard(existing.id)) memShots.delete(shot.id);
    memCreateShots(existing.id, args.data.shots as { create?: Array<Record<string, unknown>> } | undefined);
    const updated: StoryboardRecord = {
      ...existing,
      title: (args.data.title as string) ?? existing.title,
      scene: (args.data.scene as string) ?? existing.scene,
      style: (args.data.style as string) ?? existing.style,
      shotCount: (args.data.shotCount as number) ?? existing.shotCount,
      updatedAt: new Date(),
    };
    memStoryboards.set(updated.id, updated);
    return { ...updated, shots: args?.include?.shots ? memShotsForStoryboard(updated.id) : [] };
  },
  delete(args: { where: { id: string } }) {
    const record = memStoryboards.get(args.where.id);
    if (!record) throw new Error('Not found');
    for (const shot of memShotsForStoryboard(record.id)) memShots.delete(shot.id);
    memStoryboards.delete(record.id);
    return record;
  },
};

const memShotDelegate = {
  deleteMany(args: { where: Record<string, unknown> }) {
    const result = Array.from(memShots.values()).filter((s) => s.storyboardId === args.where.storyboardId);
    for (const shot of result) memShots.delete(shot.id);
    return { count: result.length };
  },
};

// --- Real Prisma Client ---

let prismaClient: ReturnType<typeof importPrisma> | null = null;
let useRealDb = false;

async function importPrisma() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const client = new PrismaClient();
    await client.$connect();
    return client;
  } catch {
    return null;
  }
}

async function initDb() {
  if (process.env.DATABASE_URL) {
    try {
      const client = await importPrisma();
      if (client) {
        prismaClient = client as unknown as ReturnType<typeof importPrisma>;
        useRealDb = true;
        console.log('[DB] Connected to real database');
        return;
      }
    } catch (e) {
      console.warn('[DB] Failed to connect to database, using in-memory store:', e);
    }
  }
  console.log('[DB] No DATABASE_URL or connection failed, using in-memory store');
  useRealDb = false;
}

// Initialize immediately
initDb();

// --- Exported db interface ---

type DbDelegate = {
  storyboard: {
    findMany: (args?: { orderBy?: Record<string, string>; include?: Record<string, unknown> }) => any[];
    create: (args: { data: Record<string, unknown>; include?: Record<string, unknown> }) => any;
    findUnique: (args: { where: { id: string }; include?: Record<string, unknown> }) => any;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: Record<string, unknown> }) => any;
    delete: (args: { where: { id: string } }) => any;
  };
  shot: {
    deleteMany: (args: { where: Record<string, unknown> }) => { count: number };
  };
};

// Lazy getter that returns the right delegate based on connection status
export const db: DbDelegate = new Proxy({} as DbDelegate, {
  get(_target, prop) {
    if (prop === 'storyboard') {
      return new Proxy({} as DbDelegate['storyboard'], {
        get(_t, method) {
          return (...args: unknown[]) => {
            if (useRealDb && prismaClient) {
              return (prismaClient as any)[prop][method](...args);
            }
            return (memStoryboardDelegate as any)[method](...args);
          };
        },
      });
    }
    if (prop === 'shot') {
      return new Proxy({} as DbDelegate['shot'], {
        get(_t, method) {
          return (...args: unknown[]) => {
            if (useRealDb && prismaClient) {
              return (prismaClient as any)[prop][method](...args);
            }
            return (memShotDelegate as any)[method](...args);
          };
        },
      });
    }
    return undefined;
  },
});

export function isDatabaseAvailable(): boolean {
  return useRealDb;
}
