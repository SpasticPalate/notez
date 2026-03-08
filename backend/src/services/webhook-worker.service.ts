/**
 * Webhook Delivery Worker
 *
 * Polls the database for pending webhook deliveries and processes them.
 * Implements exponential backoff retry logic with up to 7 attempts.
 *
 * Design: Simple polling loop (no external queue dependency).
 * Each delivery attempt updates the DB record with results.
 */

import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { decrypt } from '../utils/encryption.js';
import { recordDeliveryFailure, recordDeliverySuccess } from './webhook.service.js';

// Retry schedule in seconds after each failure
const RETRY_DELAYS_SECONDS = [
  0,      // Attempt 1: immediate
  30,     // Attempt 2: 30s
  120,    // Attempt 3: 2m
  600,    // Attempt 4: 10m
  3600,   // Attempt 5: 1h
  14400,  // Attempt 6: 4h
  43200,  // Attempt 7: 12h (final)
];

const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length;
const DELIVERY_TIMEOUT_MS = 10_000; // 10 second timeout per delivery
const POLL_INTERVAL_MS = 5_000;     // Poll every 5 seconds
const BATCH_SIZE = 10;              // Process up to 10 deliveries per cycle

let workerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

/**
 * Compute HMAC-SHA256 signature over "v0:{timestamp}:{body}".
 * The timestamp is included in the signed material so consumers can verify
 * both authenticity and recency without trusting an unsigned header.
 * Format: "sha256=<hex_digest>"
 */
function computeSignature(secret: string, timestampSeconds: number, body: string): string {
  const payload = `v0:${timestampSeconds}:${body}`;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Build the webhook payload JSON for a delivery.
 */
async function buildPayload(eventId: string): Promise<string> {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new Error(`WebhookEvent ${eventId} not found`);

  const payload: Record<string, any> = {
    id: eventId,
    event: event.eventType,
    timestamp: event.createdAt.toISOString(),
    data: event.data,
  };

  if (event.previousData) {
    payload.previous_data = event.previousData;
  }

  return JSON.stringify(payload);
}

/**
 * Attempt to deliver a single webhook delivery record.
 */
async function attemptDelivery(deliveryId: string): Promise<void> {
  // Load delivery with webhook (for secret)
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      webhook: {
        select: {
          id: true,
          url: true,
          status: true,
          encryptedSecret: true,
          encryptedPreviousSecret: true,
          secretExpiresAt: true,
        },
      },
      event: {
        select: { id: true, eventType: true },
      },
    },
  });

  if (!delivery) return; // already processed or deleted
  if (delivery.status !== 'pending') return;

  // Don't deliver to paused/disabled webhooks — cancel the delivery
  if (delivery.webhook.status !== 'active') {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'cancelled' },
    });
    return;
  }

  const attemptNumber = delivery.attemptNumber + 1;
  const secret = decrypt(delivery.webhook.encryptedSecret);
  const body = await buildPayload(delivery.eventId);

  const timestampSeconds = Math.floor(Date.now() / 1000);
  const signature = computeSignature(secret, timestampSeconds, body);

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Notez-Webhooks/1.0',
    'X-Notez-Event': delivery.event.eventType,
    'X-Notez-Delivery': deliveryId,
    'X-Notez-Signature': signature,
    'X-Notez-Timestamp': String(timestampSeconds),
  };

  // Update to in-progress with attempt number
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attemptNumber,
      requestHeaders,
      requestBody: body,
      status: 'pending', // still pending until we get a result
      nextRetryAt: null,
    },
  });

  const startMs = Date.now();
  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const response = await fetch(delivery.url, {
      method: 'POST',
      headers: requestHeaders,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    responseStatus = response.status;
    responseBody = (await response.text()).substring(0, 4096); // cap at 4KB
    success = response.status >= 200 && response.status < 300;
  } catch (err: any) {
    errorMessage = err?.message ?? 'Unknown error';
    if (err?.name === 'AbortError') {
      errorMessage = 'Request timed out after 10 seconds';
    }
  }

  const responseTimeMs = Date.now() - startMs;

  if (success) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'success',
        responseStatus,
        responseBody,
        responseTimeMs,
        nextRetryAt: null,
      },
    });
    await recordDeliverySuccess(delivery.webhook.id);
  } else {
    const isFinal = attemptNumber >= MAX_ATTEMPTS;
    const nextRetryAt = isFinal
      ? null
      : new Date(Date.now() + RETRY_DELAYS_SECONDS[attemptNumber] * 1000);

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: isFinal ? 'failed' : 'pending',
        responseStatus,
        responseBody: responseBody ?? errorMessage,
        responseTimeMs,
        nextRetryAt,
      },
    });

    const disabled = await recordDeliveryFailure(delivery.webhook.id);
    if (disabled) {
      console.warn(
        `[webhook-worker] Webhook ${delivery.webhook.id} auto-disabled after ${MAX_ATTEMPTS} consecutive failures`,
      );
    }
  }
}

/**
 * Process one batch of pending deliveries.
 *
 * NOTE: This worker uses an in-process mutex (`isProcessing`) to prevent
 * overlapping poll cycles within a single server instance. It does NOT use
 * a database-level advisory lock. Running multiple backend instances
 * simultaneously will result in duplicate deliveries. Notez currently runs
 * as a single container so this is acceptable. If multi-instance is ever
 * needed, replace this with a pg_advisory_lock or a dedicated job queue.
 */
async function processBatch(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const now = new Date();

    // Find pending deliveries whose retry time has arrived
    const pending = await prisma.webhookDelivery.findMany({
      where: {
        status: 'pending',
        nextRetryAt: { lte: now },
      },
      select: { id: true },
      orderBy: { nextRetryAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (pending.length === 0) return;

    // Process each delivery sequentially to avoid overloading
    for (const { id } of pending) {
      await attemptDelivery(id).catch((err: any) => {
        // P2025: record not found — webhook or delivery was deleted during processing
        // This is expected when a webhook is removed while a delivery is in-flight
        if (err?.code === 'P2025') return;
        console.error(`[webhook-worker] Error processing delivery ${id}:`, err);
      });
    }
  } finally {
    isProcessing = false;
  }
}

// Data retention config (days)
const EVENT_RETENTION_DAYS = parseInt(process.env.WEBHOOK_EVENT_RETENTION_DAYS ?? '90', 10);
const DELIVERY_RETENTION_DAYS = parseInt(process.env.WEBHOOK_DELIVERY_RETENTION_DAYS ?? '30', 10);

/**
 * Clean up old event and delivery records according to retention policy.
 * Runs once per hour (on the first poll cycle after the hour mark).
 */
let lastCleanupHour = -1;
async function runCleanupIfDue(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();
  if (hour === lastCleanupHour) return;
  lastCleanupHour = hour;

  try {
    const eventCutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000);
    const deliveryCutoff = new Date(Date.now() - DELIVERY_RETENTION_DAYS * 86_400_000);

    const deletedDeliveries = await prisma.webhookDelivery.deleteMany({
      where: { createdAt: { lt: deliveryCutoff } },
    });

    const deletedEvents = await prisma.webhookEvent.deleteMany({
      where: {
        createdAt: { lt: eventCutoff },
        deliveries: { none: {} }, // only delete if no deliveries reference it
      },
    });

    if (deletedDeliveries.count > 0 || deletedEvents.count > 0) {
      console.log(
        `[webhook-worker] Cleanup: removed ${deletedDeliveries.count} deliveries, ${deletedEvents.count} events`,
      );
    }
  } catch (err) {
    console.error('[webhook-worker] Cleanup error:', err);
  }
}

/**
 * Start the background webhook delivery worker.
 * Safe to call multiple times — only one worker runs at a time.
 */
export function startWebhookWorker(): void {
  if (workerInterval) return;

  console.log(`[webhook-worker] Starting (poll interval: ${POLL_INTERVAL_MS}ms)`);

  // Run immediately, then on interval
  processBatch().catch(console.error);
  workerInterval = setInterval(() => {
    processBatch().catch(console.error);
    runCleanupIfDue().catch(console.error);
  }, POLL_INTERVAL_MS);

  // Prevent the interval from blocking process exit
  if (workerInterval.unref) {
    workerInterval.unref();
  }
}

/**
 * Stop the background webhook delivery worker.
 */
export function stopWebhookWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[webhook-worker] Stopped');
  }
}
