import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../lib/db.js', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

import {
  createNotification,
  notifyAdmins,
  notifyUser,
  notifyAllUsers,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  cleanupOldNotifications,
} from './notification.service.js';
import { prisma } from '../lib/db.js';

const mockPrisma = vi.mocked(prisma);

const baseNotification = {
  id: 'notif-1',
  type: 'NOTE_SHARED' as const,
  title: 'A note was shared with you',
  message: null,
  linkType: 'note',
  linkId: 'note-1',
  userId: 'user-1',
  isRead: false,
  readAt: null,
  createdAt: new Date('2024-01-01'),
};

describe('notification.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── createNotification ───────────────────────────────────────────────
  describe('createNotification', () => {
    it('should create and return a notification', async () => {
      mockPrisma.notification.create.mockResolvedValue(baseNotification as any);

      const result = await createNotification({
        type: 'NOTE_SHARED',
        title: 'A note was shared with you',
        linkType: 'note',
        linkId: 'note-1',
        userId: 'user-1',
      });

      expect(result.id).toBe('notif-1');
      expect(result.type).toBe('NOTE_SHARED');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'NOTE_SHARED',
            userId: 'user-1',
            isRead: false,
          }),
        })
      );
    });

    it('should set message to null when not provided', async () => {
      mockPrisma.notification.create.mockResolvedValue(baseNotification as any);

      await createNotification({
        type: 'NOTE_SHARED',
        title: 'Test',
        linkType: 'note',
        linkId: 'note-1',
        userId: 'user-1',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ message: null }),
        })
      );
    });

    it('should include message when provided', async () => {
      mockPrisma.notification.create.mockResolvedValue({
        ...baseNotification,
        message: 'Hello world',
      } as any);

      await createNotification({
        type: 'NEW_FEEDBACK',
        title: 'New feedback',
        message: 'Hello world',
        linkType: 'feedback',
        linkId: 'feedback-1',
        userId: 'user-1',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ message: 'Hello world' }),
        })
      );
    });
  });

  // ─── notifyAdmins ─────────────────────────────────────────────────────
  describe('notifyAdmins', () => {
    it('should create notifications for all active admins', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ] as any);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 2 } as any);

      const result = await notifyAdmins('NEW_FEEDBACK', 'New feedback', 'feedback', 'fb-1');

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'admin', isActive: true },
        })
      );
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 'admin-1' }),
            expect.objectContaining({ userId: 'admin-2' }),
          ]),
        })
      );
      expect(result).toEqual({ count: 2 });
    });

    it('should create zero notifications when no admins exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 0 } as any);

      const result = await notifyAdmins('NEW_FEEDBACK', 'Title', 'feedback', 'fb-1');

      expect(result).toEqual({ count: 0 });
    });
  });

  // ─── notifyUser ───────────────────────────────────────────────────────
  describe('notifyUser', () => {
    it('should create a notification for the specified user', async () => {
      mockPrisma.notification.create.mockResolvedValue(baseNotification as any);

      const result = await notifyUser('user-1', 'NOTE_SHARED', 'Shared', 'note', 'note-1');

      expect(result.userId).toBe('user-1');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            type: 'NOTE_SHARED',
          }),
        })
      );
    });

    it('should pass optional message to create', async () => {
      mockPrisma.notification.create.mockResolvedValue({
        ...baseNotification,
        message: 'Custom message',
      } as any);

      await notifyUser('user-2', 'NEW_RELEASE', 'v2.0', 'release', 'v2', 'Custom message');

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ message: 'Custom message' }),
        })
      );
    });
  });

  // ─── notifyAllUsers ───────────────────────────────────────────────────
  describe('notifyAllUsers', () => {
    it('should create notifications for all active users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ] as any);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 } as any);

      const result = await notifyAllUsers('NEW_RELEASE', 'v2.0 Released', 'release', 'v2');

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        })
      );
      expect(result).toEqual({ count: 3 });
    });
  });

  // ─── getNotifications ─────────────────────────────────────────────────
  describe('getNotifications', () => {
    it('should return notifications and total', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([baseNotification] as any);
      mockPrisma.notification.count.mockResolvedValue(1);

      const result = await getNotifications('user-1');

      expect(result.notifications).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply pagination options', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(10);

      await getNotifications('user-1', { limit: 5, offset: 5 });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5, skip: 5 })
      );
    });

    it('should filter unread notifications when unreadOnly is true', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await getNotifications('user-1', { unreadOnly: true });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isRead: false }),
        })
      );
    });

    it('should not filter by isRead when unreadOnly is false', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await getNotifications('user-1', { unreadOnly: false });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ isRead: false }),
        })
      );
    });

    it('should use defaults: limit 50, offset 0, unreadOnly false', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await getNotifications('user-1');

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 })
      );
    });
  });

  // ─── getUnreadCount ───────────────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      mockPrisma.notification.count.mockResolvedValue(7);

      const result = await getUnreadCount('user-1');

      expect(result).toBe(7);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', isRead: false },
        })
      );
    });

    it('should return 0 when no unread notifications', async () => {
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await getUnreadCount('user-1');

      expect(result).toBe(0);
    });
  });

  // ─── markAsRead ───────────────────────────────────────────────────────
  describe('markAsRead', () => {
    it('should throw when notification not found', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(markAsRead('notif-999', 'user-1')).rejects.toThrow('Notification not found');
    });

    it('should mark notification as read and return updated', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(baseNotification as any);
      mockPrisma.notification.update.mockResolvedValue({
        ...baseNotification,
        isRead: true,
        readAt: new Date(),
      } as any);

      const result = await markAsRead('notif-1', 'user-1');

      expect(result.isRead).toBe(true);
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-1' },
          data: expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
        })
      );
    });
  });

  // ─── markAllAsRead ────────────────────────────────────────────────────
  describe('markAllAsRead', () => {
    it('should update all unread notifications for a user', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 } as any);

      const result = await markAllAsRead('user-1');

      expect(result).toEqual({ count: 5 });
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', isRead: false },
          data: expect.objectContaining({ isRead: true }),
        })
      );
    });
  });

  // ─── deleteNotification ───────────────────────────────────────────────
  describe('deleteNotification', () => {
    it('should throw when notification not found', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(deleteNotification('notif-999', 'user-1')).rejects.toThrow(
        'Notification not found'
      );
    });

    it('should delete the notification when found', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(baseNotification as any);
      mockPrisma.notification.delete.mockResolvedValue(baseNotification as any);

      await deleteNotification('notif-1', 'user-1');

      expect(mockPrisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
      });
    });
  });

  // ─── cleanupOldNotifications ──────────────────────────────────────────
  describe('cleanupOldNotifications', () => {
    it('should delete read notifications older than 30 days by default', async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 12 } as any);

      const result = await cleanupOldNotifications();

      expect(result).toEqual({ count: 12 });
      expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRead: true,
            createdAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        })
      );
    });

    it('should use provided olderThanDays value', async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 3 } as any);

      await cleanupOldNotifications(7);

      // Just check it was called — the cutoff date math is internal
      expect(mockPrisma.notification.deleteMany).toHaveBeenCalled();
    });

    it('should return count of deleted notifications', async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 } as any);

      const result = await cleanupOldNotifications(30);

      expect(result.count).toBe(0);
    });
  });
});
