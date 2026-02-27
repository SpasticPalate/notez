import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../lib/db.js', () => ({
  prisma: {
    apiToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import {
  generateToken,
  hashToken,
  createApiToken,
  validateApiToken,
  listApiTokens,
  revokeApiToken,
} from './token.service.js';
import { prisma } from '../lib/db.js';
import { NotFoundError, BadRequestError, AppError } from '../utils/errors.js';

const mockPrisma = vi.mocked(prisma);

describe('token.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── generateToken ─────────────────────────────────────────────────
  describe('generateToken', () => {
    it('should generate a token with ntez_ prefix', () => {
      const token = generateToken();
      expect(token.startsWith('ntez_')).toBe(true);
    });

    it('should generate tokens of consistent length', () => {
      const token = generateToken();
      // ntez_ (5) + 43 base64url chars (32 bytes) = 48
      expect(token.length).toBe(48);
    });

    it('should generate unique tokens each time', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
      expect(tokens.size).toBe(100);
    });
  });

  // ─── hashToken ──────────────────────────────────────────────────────
  describe('hashToken', () => {
    it('should return a 64-character hex string (SHA-256)', () => {
      const hash = hashToken('ntez_abc123');
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('should produce the same hash for the same input', () => {
      const hash1 = hashToken('ntez_sametoken');
      const hash2 = hashToken('ntez_sametoken');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashToken('ntez_token1');
      const hash2 = hashToken('ntez_token2');
      expect(hash1).not.toBe(hash2);
    });
  });

  // ─── createApiToken ─────────────────────────────────────────────────
  describe('createApiToken', () => {
    it('should create token and return raw token', async () => {
      mockPrisma.apiToken.count.mockResolvedValue(0);
      mockPrisma.apiToken.create.mockResolvedValue({
        id: 'token-1',
        name: 'My Token',
        prefix: 'ntez_xxxx',
        scopes: ['read'],
        expiresAt: null,
        createdAt: new Date(),
      } as any);

      const result = await createApiToken('user-1', {
        name: 'My Token',
        scopes: ['read'],
      });

      expect(result.rawToken).toBeDefined();
      expect(result.rawToken.startsWith('ntez_')).toBe(true);
      expect(result.id).toBe('token-1');
      expect(result.name).toBe('My Token');
      expect(mockPrisma.apiToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            name: 'My Token',
            scopes: ['read'],
          }),
        })
      );
    });

    it('should enforce per-user token cap with AppError 409', async () => {
      mockPrisma.apiToken.count.mockResolvedValue(20);

      await expect(createApiToken('user-1', {
        name: 'Over Limit',
        scopes: ['read'],
      })).rejects.toThrow(AppError);

      await expect(createApiToken('user-1', {
        name: 'Over Limit',
        scopes: ['read'],
      })).rejects.toThrow('Maximum number of active API tokens (20) reached');

      expect(mockPrisma.apiToken.create).not.toHaveBeenCalled();
    });

    it('should throw AppError with statusCode 409 when cap exceeded', async () => {
      mockPrisma.apiToken.count.mockResolvedValue(20);

      try {
        await createApiToken('user-1', { name: 'Over', scopes: ['read'] });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(409);
      }
    });

    it('should set expiresAt for 30d expiry', async () => {
      mockPrisma.apiToken.count.mockResolvedValue(0);
      mockPrisma.apiToken.create.mockResolvedValue({
        id: 'token-2',
        name: 'Expiring Token',
        prefix: 'ntez_xxxx',
        scopes: ['read', 'write'],
        expiresAt: new Date(),
        createdAt: new Date(),
      } as any);

      await createApiToken('user-1', {
        name: 'Expiring Token',
        scopes: ['read', 'write'],
        expiresIn: '30d',
      });

      const call = mockPrisma.apiToken.create.mock.calls[0][0];
      expect(call.data.expiresAt).toBeInstanceOf(Date);
      // Should be approximately 30 days from now
      const diff = (call.data.expiresAt as Date).getTime() - Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(diff - thirtyDays)).toBeLessThan(5000);
    });

    it('should set null expiresAt when no expiry specified', async () => {
      mockPrisma.apiToken.count.mockResolvedValue(0);
      mockPrisma.apiToken.create.mockResolvedValue({
        id: 'token-3',
        name: 'No Expiry',
        prefix: 'ntez_xxxx',
        scopes: ['read'],
        expiresAt: null,
        createdAt: new Date(),
      } as any);

      await createApiToken('user-1', {
        name: 'No Expiry',
        scopes: ['read'],
      });

      const call = mockPrisma.apiToken.create.mock.calls[0][0];
      expect(call.data.expiresAt).toBeNull();
    });
  });

  // ─── validateApiToken ───────────────────────────────────────────────
  describe('validateApiToken', () => {
    it('should reject tokens without ntez_ prefix', async () => {
      await expect(validateApiToken('invalid_token')).rejects.toThrow('Invalid token format');
    });

    it('should reject tokens not found in database', async () => {
      mockPrisma.apiToken.findUnique.mockResolvedValue(null);

      await expect(validateApiToken('ntez_doesnotexist123456789')).rejects.toThrow('Invalid token');
    });

    it('should reject revoked tokens', async () => {
      mockPrisma.apiToken.findUnique.mockResolvedValue({
        id: 'token-1',
        revokedAt: new Date(),
        expiresAt: null,
        scopes: ['read'],
        user: { id: 'user-1', username: 'test', role: 'user', isActive: true },
      } as any);

      await expect(validateApiToken('ntez_revokedtoken12345678')).rejects.toThrow('Token has been revoked');
    });

    it('should reject expired tokens', async () => {
      const pastDate = new Date(Date.now() - 1000);
      mockPrisma.apiToken.findUnique.mockResolvedValue({
        id: 'token-1',
        revokedAt: null,
        expiresAt: pastDate,
        scopes: ['read'],
        user: { id: 'user-1', username: 'test', role: 'user', isActive: true },
      } as any);

      await expect(validateApiToken('ntez_expiredtoken12345678')).rejects.toThrow('Token has expired');
    });

    it('should reject tokens for inactive users', async () => {
      mockPrisma.apiToken.findUnique.mockResolvedValue({
        id: 'token-1',
        revokedAt: null,
        expiresAt: null,
        scopes: ['read'],
        user: { id: 'user-1', username: 'test', role: 'user', isActive: false },
      } as any);

      await expect(validateApiToken('ntez_inactiveuser12345678')).rejects.toThrow('User account is inactive');
    });

    it('should return user info and scopes for valid token', async () => {
      mockPrisma.apiToken.findUnique.mockResolvedValue({
        id: 'token-1',
        revokedAt: null,
        expiresAt: null,
        scopes: ['read', 'write'],
        user: { id: 'user-1', username: 'testuser', role: 'admin', isActive: true },
      } as any);
      mockPrisma.apiToken.update.mockResolvedValue({} as any);

      const result = await validateApiToken('ntez_validtoken1234567890');

      expect(result).toEqual({
        userId: 'user-1',
        username: 'testuser',
        role: 'admin',
        scopes: ['read', 'write'],
      });
    });

    it('should update lastUsedAt on successful validation', async () => {
      mockPrisma.apiToken.findUnique.mockResolvedValue({
        id: 'token-1',
        revokedAt: null,
        expiresAt: null,
        scopes: ['read'],
        user: { id: 'user-1', username: 'test', role: 'user', isActive: true },
      } as any);
      mockPrisma.apiToken.update.mockResolvedValue({} as any);

      await validateApiToken('ntez_validtoken1234567890');

      expect(mockPrisma.apiToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-1' },
          data: expect.objectContaining({
            lastUsedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  // ─── listApiTokens ─────────────────────────────────────────────────
  describe('listApiTokens', () => {
    it('should return tokens for user (masked)', async () => {
      const tokens = [
        { id: 'token-1', name: 'Token A', prefix: 'ntez_abcd', scopes: ['read'], lastUsedAt: null, expiresAt: null, createdAt: new Date(), revokedAt: null },
        { id: 'token-2', name: 'Token B', prefix: 'ntez_efgh', scopes: ['read', 'write'], lastUsedAt: new Date(), expiresAt: new Date(), createdAt: new Date(), revokedAt: null },
      ];
      mockPrisma.apiToken.findMany.mockResolvedValue(tokens as any);

      const result = await listApiTokens('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Token A');
      // Should not contain raw token or hash
      expect((result[0] as any).tokenHash).toBeUndefined();
      expect((result[0] as any).rawToken).toBeUndefined();
    });
  });

  // ─── revokeApiToken ─────────────────────────────────────────────────
  describe('revokeApiToken', () => {
    it('should throw NotFoundError when token not found', async () => {
      mockPrisma.apiToken.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.apiToken.findFirst.mockResolvedValue(null);

      await expect(revokeApiToken('token-999', 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError when token already revoked', async () => {
      mockPrisma.apiToken.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.apiToken.findFirst.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        revokedAt: new Date(),
      } as any);

      await expect(revokeApiToken('token-1', 'user-1')).rejects.toThrow(BadRequestError);
      await expect(revokeApiToken('token-1', 'user-1')).rejects.toThrow('Token is already revoked');
    });

    it('should atomically revoke an active token', async () => {
      mockPrisma.apiToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.apiToken.findUnique.mockResolvedValue({
        id: 'token-1',
        name: 'My Token',
        revokedAt: new Date(),
      } as any);

      const result = await revokeApiToken('token-1', 'user-1');

      expect(result!.revokedAt).toBeDefined();
      expect(mockPrisma.apiToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-1', userId: 'user-1', revokedAt: null },
          data: expect.objectContaining({
            revokedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should not call findFirst when updateMany succeeds (no TOCTOU)', async () => {
      mockPrisma.apiToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.apiToken.findUnique.mockResolvedValue({
        id: 'token-1',
        name: 'My Token',
        revokedAt: new Date(),
      } as any);

      await revokeApiToken('token-1', 'user-1');

      expect(mockPrisma.apiToken.findFirst).not.toHaveBeenCalled();
    });
  });
});
