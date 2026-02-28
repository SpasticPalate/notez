import { prisma } from '../lib/db.js';
import { hashPassword } from './auth.service.js';
import type { CreateUserInput, UpdateUserInput } from '../utils/validation.schemas.js';
import { APP_VERSION, NODE_VERSION } from '../config/app.config.js';

/** Common select fields for user queries */
const userSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  isActive: true,
  isServiceAccount: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Get user by ID
 */
export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Get user by username
 */
export async function getUserByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: userSelect,
  });
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: userSelect,
  });
}

/**
 * List all users (admin only)
 */
export async function listUsers(includeInactive = false) {
  return prisma.user.findMany({
    where: includeInactive ? undefined : { isActive: true },
    select: userSelect,
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Create a new user (admin only)
 */
export async function createUser(data: CreateUserInput) {
  // Check if username or email already exists
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: data.username }, { email: data.email }],
    },
  });

  if (existing) {
    if (existing.username === data.username) {
      throw new Error('Username already exists');
    }
    if (existing.email === data.email) {
      throw new Error('Email already exists');
    }
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      passwordHash,
      role: data.role || 'user',
      isActive: true,
      isServiceAccount: data.isServiceAccount || false,
      mustChangePassword: true, // Force password change on first login
    },
    select: userSelect,
  });

  return user;
}

/**
 * Update user (admin only)
 * Note: isServiceAccount is deliberately excluded — it's immutable after creation.
 */
export async function updateUser(id: string, data: UpdateUserInput) {
  // Defensive strip: ensure isServiceAccount can never be changed via update
  const { isServiceAccount: _stripped, ...safeData } = data as UpdateUserInput & { isServiceAccount?: unknown };

  // Check if user exists
  const existing = await prisma.user.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('User not found');
  }

  // If user is being deactivated, update user and invalidate sessions atomically
  if (safeData.isActive === false) {
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: safeData,
        select: userSelect,
      }),
      prisma.session.deleteMany({
        where: { userId: id },
      }),
    ]);
    return user;
  }

  // Normal update without session invalidation
  return prisma.user.update({
    where: { id },
    data: safeData,
    select: userSelect,
  });
}

/**
 * Delete user (soft delete - deactivate)
 */
export async function deleteUser(id: string) {
  return updateUser(id, { isActive: false });
}

/**
 * Reset user password (admin only)
 */
export async function resetUserPassword(id: string, newPassword: string) {
  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password and invalidate all sessions atomically
  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
      select: userSelect,
    }),
    prisma.session.deleteMany({
      where: { userId: id },
    }),
  ]);

  return user;
}

/**
 * Get user statistics
 */
export async function getUserStats() {
  const [totalUsers, activeUsers, adminUsers, serviceAccounts] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: 'admin', isActive: true } }),
    prisma.user.count({ where: { isServiceAccount: true, isActive: true } }),
  ]);

  return {
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    adminUsers,
    serviceAccounts,
  };
}

/**
 * List all service account users
 */
export async function listServiceAccounts() {
  return prisma.user.findMany({
    where: { isServiceAccount: true },
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * List all notes from service account users (admin read-only)
 */
export async function listServiceAccountNotes(options?: { limit?: number; offset?: number }) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const where = { user: { isServiceAccount: true }, deleted: false };

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        folderId: true,
        user: { select: { id: true, username: true } },
        folder: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.note.count({ where }),
  ]);

  return { notes, total };
}

/**
 * Get a single note by ID from a service account (admin read-only, bypasses ownership check)
 */
export async function getServiceAccountNote(noteId: string) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      folderId: true,
      user: { select: { id: true, username: true, isServiceAccount: true } },
      folder: { select: { id: true, name: true } },
      tags: {
        select: {
          tag: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!note) {
    throw new Error('Note not found');
  }

  // Only allow access to notes owned by service accounts
  if (!note.user.isServiceAccount) {
    throw new Error('Note does not belong to a service account');
  }

  return note;
}

/**
 * List all tasks from service account users (admin read-only)
 */
export async function listServiceAccountTasks(options?: { limit?: number; offset?: number }) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const where = { user: { isServiceAccount: true } };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        noteId: true,
        noteTitle: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        user: { select: { id: true, username: true } },
        folder: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
        links: { select: { id: true, url: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.task.count({ where }),
  ]);

  return { tasks, total };
}

/**
 * Get system information
 */
export async function getSystemInfo() {
  // Check database connection
  let databaseStatus = 'connected';
  let databaseInfo = 'PostgreSQL';

  try {
    await prisma.$queryRaw`SELECT 1`;

    // Try to get database version
    try {
      const result = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
      if (result && result.length > 0) {
        // Extract PostgreSQL version from version string
        const versionMatch = result[0].version.match(/PostgreSQL ([\d.]+)/);
        if (versionMatch) {
          databaseInfo = `PostgreSQL ${versionMatch[1]}`;
        }
      }
    } catch {
      // Ignore version query errors
    }
  } catch {
    databaseStatus = 'disconnected';
  }

  // Get content statistics
  const [totalNotes, totalFolders, totalTags] = await Promise.all([
    prisma.note.count(),
    prisma.folder.count(),
    prisma.tag.count(),
  ]);

  // Calculate uptime
  const uptimeSeconds = process.uptime();
  const uptimeHours = Math.floor(uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptime = `${uptimeHours}h ${uptimeMinutes}m`;

  return {
    version: APP_VERSION,
    nodeVersion: NODE_VERSION,
    database: {
      status: databaseStatus,
      info: databaseInfo,
    },
    uptime,
    statistics: {
      totalNotes,
      totalFolders,
      totalTags,
    },
  };
}
