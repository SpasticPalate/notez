import { prisma } from '../lib/db.js';
import { notifyUser } from './notification.service.js';
import { safeFireAndForget } from '../utils/safe-notify.js';
import type { SharePermission, Prisma } from '@prisma/client';

export type NoteAccessResult = {
  hasAccess: boolean;
  permission: 'OWNER' | 'EDIT' | 'VIEW' | null;
};

/**
 * Check if a user has access to a note and what permission level
 */
export async function checkNoteAccess(noteId: string, userId: string): Promise<NoteAccessResult> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, deleted: false },
    select: { userId: true },
  });

  if (!note) {
    return { hasAccess: false, permission: null };
  }

  // Owner always has full access
  if (note.userId === userId) {
    return { hasAccess: true, permission: 'OWNER' };
  }

  // Check for share
  const share = await prisma.noteShare.findUnique({
    where: {
      noteId_sharedWithId: {
        noteId,
        sharedWithId: userId,
      },
    },
  });

  if (!share) {
    return { hasAccess: false, permission: null };
  }

  return { hasAccess: true, permission: share.permission };
}

/**
 * Share a note with another user
 */
export async function shareNote(
  noteId: string,
  ownerId: string,
  targetUsernameOrEmail: string,
  permission: SharePermission = 'VIEW'
) {
  // Verify the note exists and belongs to the owner
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId: ownerId },
  });

  if (!note) {
    throw new Error('Note not found');
  }

  // Look up the target user by username or email
  const targetUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: targetUsernameOrEmail },
        { email: targetUsernameOrEmail },
      ],
      isActive: true,
    },
    select: { id: true, username: true, email: true },
  });

  if (!targetUser) {
    throw new Error('User not found');
  }

  // Cannot share with yourself
  if (targetUser.id === ownerId) {
    throw new Error('Cannot share a note with yourself');
  }

  // Create or update the share (upsert to handle re-sharing)
  const share = await prisma.noteShare.upsert({
    where: {
      noteId_sharedWithId: {
        noteId,
        sharedWithId: targetUser.id,
      },
    },
    update: {
      permission,
    },
    create: {
      noteId,
      ownerId,
      sharedWithId: targetUser.id,
      permission,
    },
    include: {
      sharedWith: {
        select: { id: true, username: true, email: true },
      },
    },
  });

  // Send notification to the target user
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { username: true },
  });

  safeFireAndForget(
    notifyUser(
      targetUser.id,
      'NOTE_SHARED',
      `${owner?.username || 'Someone'} shared a note with you`,
      'note',
      noteId,
      `"${note.title}" was shared with you (${permission.toLowerCase()} access)`
    ),
    'NOTIFY_SHARE_FAILED',
  );

  return share;
}

/**
 * Remove a share (owner only)
 */
export async function unshareNote(noteId: string, ownerId: string, shareId: string) {
  const share = await prisma.noteShare.findFirst({
    where: {
      id: shareId,
      noteId,
      ownerId,
    },
  });

  if (!share) {
    throw new Error('Share not found');
  }

  await prisma.noteShare.delete({
    where: { id: shareId },
  });

  return { success: true };
}

/**
 * Update share permission (owner only)
 */
export async function updateSharePermission(
  noteId: string,
  ownerId: string,
  shareId: string,
  permission: SharePermission
) {
  const share = await prisma.noteShare.findFirst({
    where: {
      id: shareId,
      noteId,
      ownerId,
    },
  });

  if (!share) {
    throw new Error('Share not found');
  }

  const updated = await prisma.noteShare.update({
    where: { id: shareId },
    data: { permission },
    include: {
      sharedWith: {
        select: { id: true, username: true, email: true },
      },
    },
  });

  return updated;
}

/**
 * List all shares for a note (owner only)
 */
export async function listSharesForNote(noteId: string, ownerId: string) {
  // Verify ownership
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId: ownerId },
  });

  if (!note) {
    throw new Error('Note not found');
  }

  const shares = await prisma.noteShare.findMany({
    where: { noteId },
    include: {
      sharedWith: {
        select: { id: true, username: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return shares;
}

/**
 * List notes shared with the current user
 */
export async function listSharedWithMe(userId: string) {
  const shares = await prisma.noteShare.findMany({
    where: {
      sharedWithId: userId,
      note: {
        deleted: false,
      },
    },
    include: {
      note: {
        include: {
          folder: {
            select: { id: true, name: true },
          },
          tags: {
            include: {
              tag: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
      owner: {
        select: { id: true, username: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Transform to match the note list format with share info
  return shares.map((share) => ({
    ...share.note,
    tags: share.note.tags.map((nt) => nt.tag),
    shareInfo: {
      shareId: share.id,
      permission: share.permission,
      owner: share.owner,
      sharedAt: share.createdAt,
    },
  }));
}

/**
 * Get users the current user has previously shared notes with (for autocomplete).
 * Optionally filter by a search query on username or email.
 */
export async function getSharedContacts(userId: string, query?: string, limit = 10) {
  const sharedWithFilter: Prisma.UserWhereInput = query && query.trim()
    ? {
        isActive: true,
        OR: [
          { username: { contains: query.trim(), mode: 'insensitive' } },
          { email: { contains: query.trim(), mode: 'insensitive' } },
        ],
      }
    : { isActive: true };

  const where: Prisma.NoteShareWhereInput = {
    ownerId: userId,
    sharedWith: sharedWithFilter,
  };

  // Use Prisma distinct to deduplicate at the database level
  const shares = await prisma.noteShare.findMany({
    where,
    select: {
      sharedWithId: true,
      sharedWith: {
        select: { id: true, username: true, email: true },
      },
    },
    distinct: ['sharedWithId'],
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return shares.map((s) => s.sharedWith);
}

/**
 * List notes the current user has shared out to others
 */
export async function listSharedByMe(
  userId: string,
  options?: { limit?: number; offset?: number }
) {
  const { limit = 50, offset = 0 } = options || {};

  const where = {
    userId,
    deleted: false,
    shares: { some: {} } as const,
  };

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      include: {
        folder: {
          select: { id: true, name: true },
        },
        tags: {
          include: {
            tag: {
              select: { id: true, name: true },
            },
          },
        },
        shares: {
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.note.count({ where }),
  ]);

  const transformedNotes = notes.map((note) => {
    const { shares, ...rest } = note;
    return {
      ...rest,
      tags: note.tags.map((nt: any) => nt.tag),
      isShared: true,
    };
  });

  return { notes: transformedNotes, total, limit, offset };
}

/**
 * Check if a note has any active shares (used to determine collaborative mode)
 */
export async function isNoteShared(noteId: string): Promise<boolean> {
  const count = await prisma.noteShare.count({
    where: { noteId },
  });
  return count > 0;
}
