import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../lib/db.js', () => ({
  prisma: {
    folder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  getFolderById,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getFolderStats,
} from './folder.service.js';
import { prisma } from '../lib/db.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

const mockPrisma = vi.mocked(prisma);

describe('folder.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getFolderById ────────────────────────────────────────────────────
  describe('getFolderById', () => {
    it('should return folder with noteCount when found', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue({
        id: 'folder-1',
        name: 'Work',
        icon: 'folder',
        userId: 'user-1',
        _count: { notes: 5 },
      } as any);

      const result = await getFolderById('folder-1', 'user-1');

      expect(result.id).toBe('folder-1');
      expect(result.name).toBe('Work');
      expect(result.noteCount).toBe(5);
      expect((result as any)._count).toBeUndefined();
    });

    it('should throw NotFoundError when folder not found', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue(null);

      await expect(getFolderById('folder-999', 'user-1')).rejects.toThrow(NotFoundError);
      await expect(getFolderById('folder-999', 'user-1')).rejects.toThrow('Folder not found');
    });

    it('should only return folders belonging to the requesting user', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue(null);

      await expect(getFolderById('folder-1', 'wrong-user')).rejects.toThrow(NotFoundError);

      expect(mockPrisma.folder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'folder-1', userId: 'wrong-user' },
        })
      );
    });
  });

  // ─── listFolders ──────────────────────────────────────────────────────
  describe('listFolders', () => {
    it('should return empty array when user has no folders', async () => {
      mockPrisma.folder.findMany.mockResolvedValue([]);

      const result = await listFolders('user-1');

      expect(result).toEqual([]);
    });

    it('should return folders with noteCount and no _count', async () => {
      mockPrisma.folder.findMany.mockResolvedValue([
        { id: 'folder-1', name: 'Alpha', icon: 'folder', userId: 'user-1', _count: { notes: 3 } },
        { id: 'folder-2', name: 'Beta', icon: 'star', userId: 'user-1', _count: { notes: 0 } },
      ] as any);

      const result = await listFolders('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].noteCount).toBe(3);
      expect(result[1].noteCount).toBe(0);
      expect((result[0] as any)._count).toBeUndefined();
    });

    it('should query only the specified user folders sorted by name', async () => {
      mockPrisma.folder.findMany.mockResolvedValue([]);

      await listFolders('user-42');

      expect(mockPrisma.folder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-42' },
          orderBy: { name: 'asc' },
        })
      );
    });
  });

  // ─── createFolder ─────────────────────────────────────────────────────
  describe('createFolder', () => {
    beforeEach(() => {
      // Mock $transaction to invoke the callback with the mock prisma client
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
    });

    it('should create a folder and return it with noteCount', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue(null);
      mockPrisma.folder.create.mockResolvedValue({
        id: 'folder-new',
        name: 'My Folder',
        icon: 'folder',
        userId: 'user-1',
        _count: { notes: 0 },
      } as any);

      const result = await createFolder('user-1', { name: 'My Folder', icon: 'folder' });

      expect(result.id).toBe('folder-new');
      expect(result.name).toBe('My Folder');
      expect(result.noteCount).toBe(0);
      expect((result as any)._count).toBeUndefined();
    });

    it('should throw ConflictError for duplicate folder name', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue({
        id: 'existing-folder',
        name: 'My Folder',
      } as any);

      await expect(createFolder('user-1', { name: 'My Folder' })).rejects.toThrow(ConflictError);
      await expect(createFolder('user-1', { name: 'My Folder' })).rejects.toThrow(
        'A folder with this name already exists'
      );
    });

    it('should use default icon when icon is not provided', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue(null);
      mockPrisma.folder.create.mockResolvedValue({
        id: 'folder-new',
        name: 'No Icon Folder',
        icon: 'folder',
        userId: 'user-1',
        _count: { notes: 0 },
      } as any);

      await createFolder('user-1', { name: 'No Icon Folder' });

      expect(mockPrisma.folder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ icon: 'folder' }),
        })
      );
    });
  });

  // ─── updateFolder ─────────────────────────────────────────────────────
  describe('updateFolder', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
    });

    it('should throw NotFoundError if folder not found', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue(null);

      await expect(updateFolder('folder-999', 'user-1', { name: 'New Name' })).rejects.toThrow(
        NotFoundError
      );
      await expect(updateFolder('folder-999', 'user-1', { name: 'New Name' })).rejects.toThrow(
        'Folder not found'
      );
    });

    it('should throw ConflictError if renaming to an existing folder name', async () => {
      // First call: find the folder being updated
      // Second call: find duplicate with new name
      mockPrisma.folder.findFirst
        .mockResolvedValueOnce({ id: 'folder-1', name: 'Old Name', userId: 'user-1' } as any)
        .mockResolvedValueOnce({ id: 'folder-2', name: 'New Name' } as any);

      await expect(updateFolder('folder-1', 'user-1', { name: 'New Name' })).rejects.toThrow(
        'A folder with this name already exists'
      );
    });

    it('should update folder and return with noteCount', async () => {
      mockPrisma.folder.findFirst
        .mockResolvedValueOnce({ id: 'folder-1', name: 'Old Name', userId: 'user-1' } as any)
        .mockResolvedValueOnce(null); // no duplicate

      mockPrisma.folder.update.mockResolvedValue({
        id: 'folder-1',
        name: 'New Name',
        icon: 'star',
        userId: 'user-1',
        _count: { notes: 2 },
      } as any);

      const result = await updateFolder('folder-1', 'user-1', { name: 'New Name', icon: 'star' });

      expect(result.name).toBe('New Name');
      expect(result.noteCount).toBe(2);
      expect((result as any)._count).toBeUndefined();
    });

    it('should not check for duplicate name when name is unchanged', async () => {
      mockPrisma.folder.findFirst.mockResolvedValueOnce({
        id: 'folder-1',
        name: 'Same Name',
        userId: 'user-1',
      } as any);

      mockPrisma.folder.update.mockResolvedValue({
        id: 'folder-1',
        name: 'Same Name',
        icon: 'new-icon',
        userId: 'user-1',
        _count: { notes: 0 },
      } as any);

      await updateFolder('folder-1', 'user-1', { name: 'Same Name', icon: 'new-icon' });

      // findFirst called once (for ownership check), not twice (would be twice if duplicate check ran)
      expect(mockPrisma.folder.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ─── deleteFolder ─────────────────────────────────────────────────────
  describe('deleteFolder', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
    });

    it('should throw NotFoundError if folder not found', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue(null);

      await expect(deleteFolder('folder-999', 'user-1')).rejects.toThrow(NotFoundError);
      await expect(deleteFolder('folder-999', 'user-1')).rejects.toThrow('Folder not found');
    });

    it('should delete folder and return message with note count when notes exist', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue({
        id: 'folder-1',
        _count: { notes: 3 },
      } as any);
      mockPrisma.folder.delete.mockResolvedValue({} as any);

      const result = await deleteFolder('folder-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.noteCount).toBe(3);
      expect(result.message).toContain('3 note(s) moved to unfiled');
    });

    it('should delete folder and return simple message when no notes exist', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue({
        id: 'folder-1',
        _count: { notes: 0 },
      } as any);
      mockPrisma.folder.delete.mockResolvedValue({} as any);

      const result = await deleteFolder('folder-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.noteCount).toBe(0);
      expect(result.message).toBe('Folder deleted.');
    });

    it('should call folder.delete with correct id', async () => {
      mockPrisma.folder.findFirst.mockResolvedValue({
        id: 'folder-1',
        _count: { notes: 0 },
      } as any);
      mockPrisma.folder.delete.mockResolvedValue({} as any);

      await deleteFolder('folder-1', 'user-1');

      expect(mockPrisma.folder.delete).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
      });
    });
  });

  // ─── getFolderStats ───────────────────────────────────────────────────
  describe('getFolderStats', () => {
    it('should return zero stats when user has no folders', async () => {
      mockPrisma.folder.findMany.mockResolvedValue([]);

      const result = await getFolderStats('user-1');

      expect(result.totalFolders).toBe(0);
      expect(result.emptyFolders).toBe(0);
      expect(result.totalNotes).toBe(0);
      expect(result.folders).toEqual([]);
    });

    it('should compute totalFolders, emptyFolders, and totalNotes correctly', async () => {
      mockPrisma.folder.findMany.mockResolvedValue([
        { id: 'f1', name: 'Alpha', icon: 'folder', _count: { notes: 4 } },
        { id: 'f2', name: 'Beta', icon: 'star', _count: { notes: 0 } },
        { id: 'f3', name: 'Gamma', icon: 'folder', _count: { notes: 2 } },
      ] as any);

      const result = await getFolderStats('user-1');

      expect(result.totalFolders).toBe(3);
      expect(result.emptyFolders).toBe(1);
      expect(result.totalNotes).toBe(6);
    });

    it('should return folders array with noteCount (not _count)', async () => {
      mockPrisma.folder.findMany.mockResolvedValue([
        { id: 'f1', name: 'Work', icon: 'briefcase', _count: { notes: 7 } },
      ] as any);

      const result = await getFolderStats('user-1');

      expect(result.folders).toHaveLength(1);
      expect(result.folders[0]).toEqual({
        id: 'f1',
        name: 'Work',
        icon: 'briefcase',
        noteCount: 7,
      });
    });
  });
});
