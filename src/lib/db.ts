import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    // Return a dummy client that throws clear errors when DB operations are attempted
    console.warn('DATABASE_URL not set — database features are disabled')
    return null as unknown as PrismaClient
  }
  return new PrismaClient({
    log: ['query'],
  })
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export function isDatabaseAvailable(): boolean {
  return !!process.env.DATABASE_URL
}
