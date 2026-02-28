import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma Client instance
 *
 * Using a single instance prevents exhausting database connections
 * and improves performance across the application.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

/**
 * Gracefully disconnect Prisma on application shutdown
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}
