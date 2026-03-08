/**
 * Webhook Service
 * Handles CRUD for webhook subscriptions and event emission.
 */

import { prisma } from '../lib/db.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/errors.js';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookReplayInput,
} from '../utils/validation.schemas.js';

export const VALID_EVENTS = [
  'task.created',
  'task.updated',
  'task.completed',
  'task.uncompleted',
  'task.deleted',
  'note.created',
  'note.updated',
  'note.deleted',
  'folder.created',
  'folder.updated',
  'folder.deleted',
] as const;

export type WebhookEventType = typeof VALID_EVENTS[number];

// Max webhooks per user
const MAX_WEBHOOKS_PER_USER = 10;

// Consecutive failure threshold before auto-disabling
const AUTO_DISABLE_THRESHOLD = 50;

/**
 * Block private/loopback IPs to prevent SSRF attacks
 */
function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestError('Invalid webhook URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestError('Webhook URL must use http or https');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block loopback, private ranges, and IPv6 private ranges (including IPv4-mapped)
  const blocked = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^\[::1\]$/,
    /^0\.0\.0\.0$/,
    /^169\.254\./,                 // link-local
    /^\[?fc[0-9a-f]{2}:/i,        // IPv6 ULA (fc00::/7)
    /^\[?fe[89ab][0-9a-f]:/i,     // IPv6 link-local (fe80::/10)
    /^\[?::ffff:/i,                // IPv4-mapped IPv6 (::ffff:192.168.x.x etc.)
    /^\[?0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:1\]?$/i, // full-form ::1
  ];

  for (const pattern of blocked) {
    if (pattern.test(hostname)) {
      throw new BadRequestError('Webhook URL must point to a public endpoint');
    }
  }
}

/**
 * Check whether a webhook subscription matches a given event type
 */
export function webhookMatchesEvent(webhookEvents: string[], eventType: string): boolean {
  return webhookEvents.includes('*') || webhookEvents.includes(eventType);
}

/**
 * Format a webhook for API response (strip encrypted fields)
 */
function formatWebhook(webhook: any) {
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    status: webhook.status,
    metadata: webhook.metadata,
    consecutiveFailures: webhook.consecutiveFailures,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createWebhook(userId: string, input: CreateWebhookInput) {
  validateWebhookUrl(input.url);

  // Enforce per-user limit
  const count = await prisma.webhook.count({ where: { userId } });
  if (count >= MAX_WEBHOOKS_PER_USER) {
    throw new ConflictError(`Maximum ${MAX_WEBHOOKS_PER_USER} webhooks per user`);
  }

  // Validate events list
  if (!input.events.includes('*')) {
    for (const event of input.events) {
      if (!VALID_EVENTS.includes(event as WebhookEventType)) {
        throw new BadRequestError(`Invalid event type: ${event}`);
      }
    }
  }

  const encryptedSecret = encrypt(input.secret);

  const webhook = await prisma.webhook.create({
    data: {
      userId,
      url: input.url,
      events: input.events,
      encryptedSecret,
      metadata: (input.metadata as any) ?? undefined,
      status: 'active',
    },
  });

  return formatWebhook(webhook);
}

export async function listWebhooks(userId: string) {
  const webhooks = await prisma.webhook.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return webhooks.map(formatWebhook);
}

export async function getWebhookById(id: string, userId: string) {
  const webhook = await prisma.webhook.findFirst({
    where: { id, userId },
  });
  if (!webhook) throw new NotFoundError('Webhook not found');
  return formatWebhook(webhook);
}

export async function updateWebhook(id: string, userId: string, input: UpdateWebhookInput) {
  const existing = await prisma.webhook.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Webhook not found');

  const data: any = {};

  if (input.url !== undefined) {
    validateWebhookUrl(input.url);
    data.url = input.url;
  }

  if (input.events !== undefined) {
    if (!input.events.includes('*')) {
      for (const event of input.events) {
        if (!VALID_EVENTS.includes(event as WebhookEventType)) {
          throw new BadRequestError(`Invalid event type: ${event}`);
        }
      }
    }
    data.events = input.events;
  }

  if (input.status !== undefined) {
    if (!['active', 'paused', 'disabled'].includes(input.status)) {
      throw new BadRequestError('Status must be active, paused, or disabled');
    }
    data.status = input.status;
    // Reset failure counter when re-enabling
    if (input.status === 'active') {
      data.consecutiveFailures = 0;
    }
  }

  if (input.secret !== undefined) {
    // Secret rotation: store old secret with 1-hour grace period
    data.encryptedPreviousSecret = existing.encryptedSecret;
    data.secretExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    data.encryptedSecret = encrypt(input.secret);
  }

  if (input.metadata !== undefined) {
    data.metadata = input.metadata;
  }

  const webhook = await prisma.webhook.update({
    where: { id },
    data,
  });

  return formatWebhook(webhook);
}

export async function deleteWebhook(id: string, userId: string) {
  const existing = await prisma.webhook.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Webhook not found');

  // Cancel pending deliveries
  await prisma.webhookDelivery.updateMany({
    where: { webhookId: id, status: 'pending' },
    data: { status: 'cancelled' },
  });

  await prisma.webhook.delete({ where: { id } });
}

// ─── EVENT EMISSION ───────────────────────────────────────────────────────────

/**
 * Emit a webhook event. Creates the event record and fans out to all
 * matching active webhooks. Returns immediately — deliveries happen
 * asynchronously in the background worker.
 */
export async function emitWebhookEvent(
  userId: string,
  eventType: string,
  data: Record<string, any>,
  previousData?: Record<string, any> | null,
) {
  const entityType = eventType.split('.')[0]; // "task", "note", "folder"
  const entityId = data.id as string;

  // Create the event record
  const event = await prisma.webhookEvent.create({
    data: {
      userId,
      eventType,
      entityType,
      entityId,
      data,
      previousData: previousData ?? undefined,
    },
  });

  // Find all active webhooks for this user that match this event
  const webhooks = await prisma.webhook.findMany({
    where: {
      userId,
      status: 'active',
    },
  });

  const matchingWebhooks = webhooks.filter((wh) =>
    webhookMatchesEvent(wh.events, eventType),
  );

  if (matchingWebhooks.length === 0) return;

  // Enqueue a delivery for each matching webhook (status: pending, nextRetryAt: now)
  await prisma.webhookDelivery.createMany({
    data: matchingWebhooks.map((wh) => ({
      webhookId: wh.id,
      eventId: event.id,
      url: wh.url,
      status: 'pending',
      nextRetryAt: new Date(),
      attemptNumber: 0, // worker increments before sending
    })),
  });
}

/**
 * Fire-and-forget wrapper for event emission that won't crash the calling route.
 */
export function safeEmitWebhookEvent(
  userId: string,
  eventType: string,
  data: Record<string, any>,
  previousData?: Record<string, any> | null,
) {
  emitWebhookEvent(userId, eventType, data, previousData).catch((err) => {
    console.error(`[webhook] Failed to emit ${eventType}:`, err);
  });
}

// ─── DELIVERY LOG ─────────────────────────────────────────────────────────────

export async function listDeliveries(
  webhookId: string,
  userId: string,
  filters: {
    status?: string;
    eventType?: string;
    since?: Date;
    limit?: number;
    offset?: number;
  },
) {
  // Verify webhook belongs to user
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } });
  if (!webhook) throw new NotFoundError('Webhook not found');

  const where: any = { webhookId };
  if (filters.status) where.status = filters.status;
  if (filters.eventType) where.event = { eventType: filters.eventType };
  if (filters.since) where.createdAt = { gte: filters.since };

  const [deliveries, total] = await prisma.$transaction([
    prisma.webhookDelivery.findMany({
      where,
      include: {
        event: {
          select: { eventType: true, entityType: true, entityId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
    }),
    prisma.webhookDelivery.count({ where }),
  ]);

  return { deliveries, total };
}

export async function getDelivery(deliveryId: string, webhookId: string, userId: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } });
  if (!webhook) throw new NotFoundError('Webhook not found');

  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, webhookId },
    include: {
      event: true,
    },
  });
  if (!delivery) throw new NotFoundError('Delivery not found');
  return delivery;
}

// ─── REPLAY ───────────────────────────────────────────────────────────────────

/**
 * Replay a single failed delivery (creates a new delivery record with
 * a new ID so it's treated as fresh, but references the same event).
 */
export async function replayDelivery(deliveryId: string, webhookId: string, userId: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } });
  if (!webhook) throw new NotFoundError('Webhook not found');

  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, webhookId },
  });
  if (!delivery) throw new NotFoundError('Delivery not found');

  // Create a fresh delivery for the same event
  const newDelivery = await prisma.webhookDelivery.create({
    data: {
      webhookId,
      eventId: delivery.eventId,
      url: webhook.url,
      status: 'pending',
      nextRetryAt: new Date(),
      attemptNumber: 0,
    },
  });

  return newDelivery;
}

/**
 * Bulk replay of events for a time range.
 * Re-fires all matching events as new deliveries (rate-limited in the worker).
 */
export async function replayEvents(webhookId: string, userId: string, input: WebhookReplayInput) {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } });
  if (!webhook) throw new NotFoundError('Webhook not found');

  const where: any = {
    userId,
    createdAt: {
      gte: new Date(input.since),
      lte: input.until ? new Date(input.until) : new Date(),
    },
  };

  if (input.eventTypes && input.eventTypes.length > 0) {
    where.eventType = { in: input.eventTypes };
  }

  const events = await prisma.webhookEvent.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 500, // safety cap
  });

  if (events.length === 0) return { queued: 0 };

  await prisma.webhookDelivery.createMany({
    data: events.map((evt, i) => ({
      webhookId,
      eventId: evt.id,
      url: webhook.url,
      status: 'pending',
      // Stagger at 100ms per event to avoid overwhelming the consumer
      nextRetryAt: new Date(Date.now() + i * 100),
      attemptNumber: 0,
    })),
  });

  return { queued: events.length };
}

// ─── TEST EVENT ───────────────────────────────────────────────────────────────

/**
 * Fire a synthetic test event to verify the endpoint works.
 * Creates a real delivery record so it shows up in the log.
 */
export async function fireTestEvent(webhookId: string, userId: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } });
  if (!webhook) throw new NotFoundError('Webhook not found');

  // Create a synthetic event
  const event = await prisma.webhookEvent.create({
    data: {
      userId,
      eventType: 'ping',
      entityType: 'webhook',
      entityId: webhookId,
      data: {
        message: 'This is a test event from Notez webhooks',
        webhookId,
        timestamp: new Date().toISOString(),
      },
    },
  });

  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId,
      eventId: event.id,
      url: webhook.url,
      status: 'pending',
      nextRetryAt: new Date(),
      attemptNumber: 0,
    },
  });

  return { deliveryId: delivery.id };
}

// ─── INTERNAL: secret resolution for delivery worker ─────────────────────────

/**
 * Resolve the signing secret for a webhook delivery.
 * During rotation grace period, tries both the new and old secret.
 * Returns the current active secret.
 */
export function resolveWebhookSecret(webhook: {
  encryptedSecret: string;
  encryptedPreviousSecret: string | null;
  secretExpiresAt: Date | null;
}): string {
  return decrypt(webhook.encryptedSecret);
}

/**
 * If still within the rotation grace period, the old secret is also valid.
 */
export function resolvePreviousSecret(webhook: {
  encryptedPreviousSecret: string | null;
  secretExpiresAt: Date | null;
}): string | null {
  if (!webhook.encryptedPreviousSecret || !webhook.secretExpiresAt) return null;
  if (new Date() > webhook.secretExpiresAt) return null;
  return decrypt(webhook.encryptedPreviousSecret);
}

// ─── AUTO-DISABLE ─────────────────────────────────────────────────────────────

/**
 * Record a failed delivery attempt and auto-disable the webhook if threshold reached.
 */
export async function recordDeliveryFailure(webhookId: string): Promise<boolean> {
  const webhook = await prisma.webhook.update({
    where: { id: webhookId },
    data: { consecutiveFailures: { increment: 1 } },
  });

  if (webhook.consecutiveFailures >= AUTO_DISABLE_THRESHOLD) {
    await prisma.webhook.update({
      where: { id: webhookId },
      data: { status: 'disabled' },
    });
    return true; // was disabled
  }

  return false;
}

/**
 * Reset failure counter on successful delivery.
 */
export async function recordDeliverySuccess(webhookId: string): Promise<void> {
  await prisma.webhook.update({
    where: { id: webhookId },
    data: { consecutiveFailures: 0 },
  });
}
