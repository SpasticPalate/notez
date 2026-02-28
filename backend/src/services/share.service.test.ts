import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../lib/db.js', () => ({
  prisma: {
    note: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    noteShare: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Mock notification service
vi.mock('./notification.service.js', () => ({
  notifyUser: vi.fn().mockResolvedValue({}),
}));

import { checkNoteAccess, shareNote, unshareNote, updateSharePermission, listSharesForNote, listSharedWithMe, listSharedByMe, isNoteShared } from './share.service.js';
import { prisma } from '../lib/db.js';

const mockPrisma = vi.mocked(prisma);

describe('share.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkNoteAccess', () => {
    it('should return OWNER permission for note owner', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        userId: 'user-1',
      } as any);

      const result = await checkNoteAccess('note-1', 'user-1');
      expect(result).toEqual({ hasAccess: true, permission: 'OWNER' });
    });

    it('should return false for non-existent note', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      const result = await checkNoteAccess('note-999', 'user-1');
      expect(result).toEqual({ hasAccess: false, permission: null });
    });

    it('should return EDIT permission for shared EDIT user', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        userId: 'owner-1',
      } as any);
      mockPrisma.noteShare.findUnique.mockResolvedValue({
        permission: 'EDIT',
      } as any);

      const result = await checkNoteAccess('note-1', 'user-2');
      expect(result).toEqual({ hasAccess: true, permission: 'EDIT' });
    });

    it('should return VIEW permission for shared VIEW user', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        userId: 'owner-1',
      } as any);
      mockPrisma.noteShare.findUnique.mockResolvedValue({
        permission: 'VIEW',
      } as any);

      const result = await checkNoteAccess('note-1', 'user-3');
      expect(result).toEqual({ hasAccess: true, permission: 'VIEW' });
    });

    it('should return no access for non-shared user', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        userId: 'owner-1',
      } as any);
      mockPrisma.noteShare.findUnique.mockResolvedValue(null);

      const result = await checkNoteAccess('note-1', 'stranger');
      expect(result).toEqual({ hasAccess: false, permission: null });
    });
  });

  describe('shareNote', () => {
    it('should throw if note not found or not owned', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(shareNote('note-1', 'user-1', 'target@email.com', 'VIEW')).rejects.toThrow('Note not found');
    });

    it('should throw if target user not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({ id: 'note-1', title: 'Test' } as any);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(shareNote('note-1', 'user-1', 'nonexistent@email.com', 'VIEW')).rejects.toThrow('User not found');
    });

    it('should throw if sharing with yourself', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({ id: 'note-1', title: 'Test' } as any);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', username: 'me', email: 'me@test.com' } as any);

      await expect(shareNote('note-1', 'user-1', 'me@test.com', 'VIEW')).rejects.toThrow('Cannot share a note with yourself');
    });

    it('should create share and send notification', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({ id: 'note-1', title: 'My Note' } as any);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-2', username: 'bob', email: 'bob@test.com' } as any);
      mockPrisma.noteShare.upsert.mockResolvedValue({
        id: 'share-1',
        noteId: 'note-1',
        permission: 'EDIT',
        sharedWith: { id: 'user-2', username: 'bob', email: 'bob@test.com' },
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({ username: 'alice' } as any);

      const result = await shareNote('note-1', 'user-1', 'bob@test.com', 'EDIT');
      expect(result.id).toBe('share-1');
      expect(result.permission).toBe('EDIT');
      expect(mockPrisma.noteShare.upsert).toHaveBeenCalled();
    });
  });

  describe('unshareNote', () => {
    it('should throw if share not found', async () => {
      mockPrisma.noteShare.findFirst.mockResolvedValue(null);

      await expect(unshareNote('note-1', 'user-1', 'share-1')).rejects.toThrow('Share not found');
    });

    it('should delete the share', async () => {
      mockPrisma.noteShare.findFirst.mockResolvedValue({ id: 'share-1' } as any);
      mockPrisma.noteShare.delete.mockResolvedValue({} as any);

      const result = await unshareNote('note-1', 'user-1', 'share-1');
      expect(result).toEqual({ success: true });
      expect(mockPrisma.noteShare.delete).toHaveBeenCalledWith({ where: { id: 'share-1' } });
    });
  });

  describe('updateSharePermission', () => {
    it('should throw if share not found', async () => {
      mockPrisma.noteShare.findFirst.mockResolvedValue(null);

      await expect(updateSharePermission('note-1', 'user-1', 'share-1', 'EDIT')).rejects.toThrow('Share not found');
    });

    it('should update permission', async () => {
      mockPrisma.noteShare.findFirst.mockResolvedValue({ id: 'share-1' } as any);
      mockPrisma.noteShare.update.mockResolvedValue({
        id: 'share-1',
        permission: 'EDIT',
        sharedWith: { id: 'user-2', username: 'bob', email: 'bob@test.com' },
      } as any);

      const result = await updateSharePermission('note-1', 'user-1', 'share-1', 'EDIT');
      expect(result.permission).toBe('EDIT');
    });
  });

  describe('listSharesForNote', () => {
    it('should throw if not the owner', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(listSharesForNote('note-1', 'user-2')).rejects.toThrow('Note not found');
    });

    it('should return shares list', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({ id: 'note-1' } as any);
      mockPrisma.noteShare.findMany.mockResolvedValue([
        { id: 'share-1', permission: 'EDIT', sharedWith: { id: 'user-2', username: 'bob' } },
      ] as any);

      const result = await listSharesForNote('note-1', 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].permission).toBe('EDIT');
    });
  });

  describe('listSharedByMe', () => {
    it('should return empty when user has no shared notes', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      const result = await listSharedByMe('user-1');
      expect(result.notes).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return transformed notes with isShared: true and flattened tags', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        {
          id: 'note-1',
          title: 'Shared Note',
          content: 'content',
          userId: 'user-1',
          deleted: false,
          folder: { id: 'folder-1', name: 'Work' },
          tags: [{ tag: { id: 'tag-1', name: 'important' } }],
          shares: [{ id: 'share-1' }],
        },
      ] as any);
      mockPrisma.note.count.mockResolvedValue(1);

      const result = await listSharedByMe('user-1');
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].isShared).toBe(true);
      expect(result.notes[0].tags).toEqual([{ id: 'tag-1', name: 'important' }]);
      // shares should be stripped from the response
      expect((result.notes[0] as any).shares).toBeUndefined();
      expect(result.total).toBe(1);
    });

    it('should respect pagination parameters', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(5);

      const result = await listSharedByMe('user-1', { limit: 2, offset: 2 });
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(2);
      expect(result.total).toBe(5);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2, skip: 2 })
      );
    });
  });

  describe('isNoteShared', () => {
    it('should return true if note has shares', async () => {
      mockPrisma.noteShare.count.mockResolvedValue(2);

      const result = await isNoteShared('note-1');
      expect(result).toBe(true);
    });

    it('should return false if note has no shares', async () => {
      mockPrisma.noteShare.count.mockResolvedValue(0);

      const result = await isNoteShared('note-1');
      expect(result).toBe(false);
    });
  });
});
