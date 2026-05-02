// In-memory store mimicking the Prisma API for Vercel deployment (read-only filesystem)
// Provides: db.storyboard.findMany, .create, .findUnique, .update, .delete
//           db.shot.deleteMany

import { randomUUID } from "crypto";

// ---------- Types ----------

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
  shots: ShotRecord[];
}

// ---------- Storage ----------

const storyboards = new Map<string, StoryboardRecord>();
const shots = new Map<string, ShotRecord>();

// ---------- Helpers ----------

/** Filter shots by a `where` clause (currently supports `storyboardId`). */
function filterShots(where: Record<string, unknown>): ShotRecord[] {
  let result = Array.from(shots.values());
  if (where.storyboardId !== undefined) {
    result = result.filter((s) => s.storyboardId === where.storyboardId);
  }
  return result;
}

/** Resolve an `include` option – if `include.shots` is truthy, attach the related shots. */
function maybeIncludeShots(
  record: StoryboardRecord,
  include?: Record<string, unknown>,
): StoryboardRecord {
  if (!include?.shots) return record;
  return { ...record, shots: shotsForStoryboard(record.id) };
}

function shotsForStoryboard(storyboardId: string): ShotRecord[] {
  return Array.from(shots.values())
    .filter((s) => s.storyboardId === storyboardId)
    .sort((a, b) => a.order - b.order);
}

/** Apply `orderBy` to a list of storyboard records. */
function applyOrderBy(
  list: StoryboardRecord[],
  orderBy?: Record<string, string>,
): StoryboardRecord[] {
  if (!orderBy) return list;
  const sorted = [...list];
  const key = Object.keys(orderBy)[0] as keyof StoryboardRecord;
  const dir = orderBy[key] === "desc" ? -1 : 1;
  sorted.sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va instanceof Date && vb instanceof Date) {
      return (va.getTime() - vb.getTime()) * dir;
    }
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb) * dir;
    }
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }
    return 0;
  });
  return sorted;
}

// ---------- Storyboard delegate ----------

const storyboardDelegate = {
  findMany(args?: { orderBy?: Record<string, string>; include?: Record<string, unknown> }) {
    const ordered = applyOrderBy(Array.from(storyboards.values()), args?.orderBy);
    return ordered.map((r) => maybeIncludeShots(r, args?.include));
  },

  create(args: { data: Omit<StoryboardRecord, "id" | "createdAt" | "updatedAt" | "shots"> & { id?: string; shots?: { create: Omit<ShotRecord, "id" | "storyboardId">[] } }; include?: Record<string, unknown> }) {
    const now = new Date();
    const record: StoryboardRecord = {
      id: args.data.id ?? randomUUID(),
      title: args.data.title,
      scene: args.data.scene,
      style: args.data.style ?? "Cinematic",
      shotCount: args.data.shotCount ?? 6,
      createdAt: now,
      updatedAt: now,
      shots: [],
    };
    // Handle nested shot creation (Prisma pattern: shots.create)
    if (args.data.shots?.create) {
      for (const shotData of args.data.shots.create) {
        const shotRecord: ShotRecord = {
          ...shotData,
          id: randomUUID(),
          storyboardId: record.id,
        };
        shots.set(shotRecord.id, shotRecord);
      }
    }
    storyboards.set(record.id, record);
    return maybeIncludeShots(record, args?.include);
  },

  findUnique(args: { where: { id: string }; include?: Record<string, unknown> }) {
    const record = storyboards.get(args.where.id);
    if (!record) return null;
    return maybeIncludeShots(record, args?.include);
  },

  update(args: { where: { id: string }; data: Partial<Omit<StoryboardRecord, "id" | "createdAt">> & { shots?: { create: Omit<ShotRecord, "id" | "storyboardId">[] } }; include?: Record<string, unknown> }) {
    const existing = storyboards.get(args.where.id);
    if (!existing) throw new Error(`Storyboard with id "${args.where.id}" not found`);
    const updated: StoryboardRecord = {
      ...existing,
      ...args.data,
      id: existing.id, // id is immutable
      createdAt: existing.createdAt, // createdAt is immutable
      updatedAt: new Date(),
      shots: [],
    };
    // Handle nested shot creation (Prisma pattern: shots.create)
    if (args.data.shots?.create) {
      for (const shotData of args.data.shots.create) {
        const shotRecord: ShotRecord = {
          ...shotData,
          id: randomUUID(),
          storyboardId: updated.id,
        };
        shots.set(shotRecord.id, shotRecord);
      }
    }
    storyboards.set(updated.id, updated);
    return maybeIncludeShots(updated, args?.include);
  },

  delete(args: { where: { id: string } }) {
    const record = storyboards.get(args.where.id);
    if (!record) throw new Error(`Storyboard with id "${args.where.id}" not found`);
    // Cascade-delete related shots
    for (const shot of shotsForStoryboard(record.id)) {
      shots.delete(shot.id);
    }
    storyboards.delete(record.id);
    return record;
  },
};

// ---------- Shot delegate ----------

const shotDelegate = {
  deleteMany(args: { where: Record<string, unknown> }) {
    const toDelete = filterShots(args.where);
    for (const shot of toDelete) {
      shots.delete(shot.id);
    }
    return { count: toDelete.length };
  },
};

// ---------- Exported db object ----------

export const db = {
  storyboard: storyboardDelegate,
  shot: shotDelegate,
};
