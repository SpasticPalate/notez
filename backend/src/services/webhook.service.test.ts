import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock prisma before importing the service
vi.mock('../lib/db.js', () => ({
  prisma: {
    webhook: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    webhookEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock encryption so tests don't need ENCRYPTION_KEY
vi.mock('../utils/encryption.js', () => ({
  encrypt: (text: string) => `enc:${text}`,
  decrypt: (text: string) => text.replace(/^enc:/, ''),
}));

import {
  webhookMatchesEvent,
  resolveWebhookSecret,
  resolvePreviousSecret,
  VALID_EVENTS,
} from './webhook.service.js';
import { prisma } from '../lib/db.js';

const mockPrisma = vi.mocked(prisma);

describe('webhook.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── webhookMatchesEvent ──────────────────────────────────────────────

  describe('webhookMatchesEvent', () => {
    it('returns true when event is in the list', () => {
      expect(webhookMatchesEvent(['task.created', 'note.updated'], 'task.created')).toBe(true);
    });

    it('returns false when event is not in the list', () => {
      expect(webhookMatchesEvent(['task.created'], 'task.deleted')).toBe(false);
    });

    it('returns true for wildcard "*"', () => {
      expect(webhookMatchesEvent(['*'], 'task.deleted')).toBe(true);
      expect(webhookMatchesEvent(['*'], 'note.created')).toBe(true);
      expect(webhookMatchesEvent(['*'], 'folder.updated')).toBe(true);
    });

    it('returns false for empty list', () => {
      expect(webhookMatchesEvent([], 'task.created')).toBe(false);
    });
  });

  // ─── VALID_EVENTS ─────────────────────────────────────────────────────

  describe('VALID_EVENTS', () => {
    it('contains all expected task events', () => {
      expect(VALID_EVENTS).toContain('task.created');
      expect(VALID_EVENTS).toContain('task.updated');
      expect(VALID_EVENTS).toContain('task.completed');
      expect(VALID_EVENTS).toContain('task.uncompleted');
      expect(VALID_EVENTS).toContain('task.deleted');
    });

    it('contains all expected note events', () => {
      expect(VALID_EVENTS).toContain('note.created');
      expect(VALID_EVENTS).toContain('note.updated');
      expect(VALID_EVENTS).toContain('note.deleted');
    });

    it('contains all expected folder events', () => {
      expect(VALID_EVENTS).toContain('folder.created');
      expect(VALID_EVENTS).toContain('folder.updated');
      expect(VALID_EVENTS).toContain('folder.deleted');
    });
  });

  // ─── resolveWebhookSecret ─────────────────────────────────────────────

  describe('resolveWebhookSecret', () => {
    it('decrypts the current secret', () => {
      const result = resolveWebhookSecret({
        encryptedSecret: 'enc:my-secret',
        encryptedPreviousSecret: null,
        secretExpiresAt: null,
      });
      expect(result).toBe('my-secret');
    });
  });

  // ─── resolvePreviousSecret ────────────────────────────────────────────

  describe('resolvePreviousSecret', () => {
    it('returns null when no previous secret exists', () => {
      const result = resolvePreviousSecret({
        encryptedPreviousSecret: null,
        secretExpiresAt: null,
      });
      expect(result).toBeNull();
    });

    it('returns decrypted previous secret when within grace period', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const result = resolvePreviousSecret({
        encryptedPreviousSecret: 'enc:old-secret',
        secretExpiresAt: futureDate,
      });
      expect(result).toBe('old-secret');
    });

    it('returns null when grace period has expired', () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      const result = resolvePreviousSecret({
        encryptedPreviousSecret: 'enc:old-secret',
        secretExpiresAt: pastDate,
      });
      expect(result).toBeNull();
    });
  });

  // ─── HMAC signature computation (integration-style) ───────────────────

  describe('HMAC signature (v0:timestamp:body format)', () => {
    // Mirrors the computeSignature function in webhook-worker.service.ts
    const computeSignature = (secret: string, ts: number, body: string) =>
      'sha256=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex');

    it('produces a sha256= prefixed hex digest', () => {
      const secret = 'whsec_test_secret_for_hmac';
      const body = JSON.stringify({ id: 'evt_123', event: 'task.created' });
      const sig = computeSignature(secret, 1000000, body);
      expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it('can be verified with the same secret and timestamp', () => {
      const secret = 'whsec_test_secret_for_hmac';
      const ts = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ id: 'evt_123', event: 'task.created' });

      const sig = computeSignature(secret, ts, body);
      const expected = computeSignature(secret, ts, body);
      expect(
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
      ).toBe(true);
    });

    it('produces different signatures for different secrets', () => {
      const ts = 1000000;
      const body = JSON.stringify({ id: 'evt_123' });
      expect(computeSignature('secret-a', ts, body)).not.toBe(computeSignature('secret-b', ts, body));
    });

    it('produces different signatures for different bodies', () => {
      const ts = 1000000;
      const secret = 'shared-secret';
      expect(
        computeSignature(secret, ts, '{"event":"task.created"}'),
      ).not.toBe(
        computeSignature(secret, ts, '{"event":"task.deleted"}'),
      );
    });

    it('produces different signatures for different timestamps', () => {
      const secret = 'shared-secret';
      const body = '{"event":"task.created"}';
      // Including timestamp in signed payload prevents replay attacks
      expect(computeSignature(secret, 1000000, body)).not.toBe(computeSignature(secret, 1000001, body));
    });
  });

  // ─── SSRF URL validation (tested via createWebhook indirectly via error) ──

  describe('private URL blocking', () => {
    it('blocks localhost URLs', async () => {
      mockPrisma.webhook.count.mockResolvedValue(0);

      const { createWebhook } = await import('./webhook.service.js');

      await expect(
        createWebhook('user-1', {
          url: 'http://localhost:4567/webhook',
          events: ['task.created'],
          secret: 'whsec_valid_secret_long_enough',
        }),
      ).rejects.toThrow('public endpoint');
    });

    it('blocks 127.x.x.x URLs', async () => {
      mockPrisma.webhook.count.mockResolvedValue(0);

      const { createWebhook } = await import('./webhook.service.js');

      await expect(
        createWebhook('user-1', {
          url: 'http://127.0.0.1:4567/webhook',
          events: ['task.created'],
          secret: 'whsec_valid_secret_long_enough',
        }),
      ).rejects.toThrow('public endpoint');
    });

    it('blocks 192.168.x.x URLs', async () => {
      mockPrisma.webhook.count.mockResolvedValue(0);

      const { createWebhook } = await import('./webhook.service.js');

      await expect(
        createWebhook('user-1', {
          url: 'http://192.168.1.100/webhook',
          events: ['task.created'],
          secret: 'whsec_valid_secret_long_enough',
        }),
      ).rejects.toThrow('public endpoint');
    });

    it('allows public URLs', async () => {
      mockPrisma.webhook.count.mockResolvedValue(0);
      mockPrisma.webhook.create.mockResolvedValue({
        id: 'wh-1',
        url: 'https://example.com/webhook',
        events: ['task.created'],
        status: 'active',
        metadata: null,
        consecutiveFailures: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const { createWebhook } = await import('./webhook.service.js');

      await expect(
        createWebhook('user-1', {
          url: 'https://example.com/webhook',
          events: ['task.created'],
          secret: 'whsec_valid_secret_long_enough',
        }),
      ).resolves.toBeDefined();
    });
  });

  // ─── Webhook limit ────────────────────────────────────────────────────

  describe('webhook limit', () => {
    it('rejects creation when user has reached the limit', async () => {
      mockPrisma.webhook.count.mockResolvedValue(10);

      const { createWebhook } = await import('./webhook.service.js');

      await expect(
        createWebhook('user-1', {
          url: 'https://example.com/webhook',
          events: ['task.created'],
          secret: 'whsec_valid_secret_long_enough',
        }),
      ).rejects.toThrow('Maximum');
    });
  });
});
