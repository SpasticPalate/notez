import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as webhookService from '../services/webhook.service.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookReplaySchema,
  listDeliveriesQuerySchema,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type WebhookReplayInput,
  type ListDeliveriesQuery,
} from '../utils/validation.schemas.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

const webhookIdParamSchema = z.object({
  id: z.string().uuid('Invalid webhook ID'),
});

const deliveryIdParamSchema = z.object({
  id: z.string().uuid('Invalid webhook ID'),
  deliveryId: z.string().uuid('Invalid delivery ID'),
});

export async function webhooksRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateToken);

  // ─── Webhook CRUD ──────────────────────────────────────────────────────────

  // POST /webhooks - Register a new webhook
  fastify.post(
    '/webhooks',
    { preHandler: validateBody(createWebhookSchema) },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const body = request.body as CreateWebhookInput;
        const webhook = await webhookService.createWebhook(userId, body);
        return reply.status(201).send(webhook);
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof BadRequestError) {
          return reply.status(400).send({ error: 'Bad Request', message: error.message });
        }
        if (error.message?.includes('Maximum')) {
          return reply.status(409).send({ error: 'Conflict', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to create webhook' });
      }
    },
  );

  // GET /webhooks - List all webhooks for the user
  fastify.get('/webhooks', async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const webhooks = await webhookService.listWebhooks(userId);
      return { webhooks, total: webhooks.length };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to list webhooks' });
    }
  });

  // GET /webhooks/:id - Get a specific webhook
  fastify.get(
    '/webhooks/:id',
    { preHandler: validateParams(webhookIdParamSchema) },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id } = request.params as z.infer<typeof webhookIdParamSchema>;
        const webhook = await webhookService.getWebhookById(id, userId);
        return webhook;
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to get webhook' });
      }
    },
  );

  // PATCH /webhooks/:id - Update a webhook
  fastify.patch(
    '/webhooks/:id',
    { preHandler: [validateParams(webhookIdParamSchema), validateBody(updateWebhookSchema)] },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id } = request.params as z.infer<typeof webhookIdParamSchema>;
        const body = request.body as UpdateWebhookInput;
        const webhook = await webhookService.updateWebhook(id, userId, body);
        return webhook;
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        if (error instanceof BadRequestError) {
          return reply.status(400).send({ error: 'Bad Request', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to update webhook' });
      }
    },
  );

  // DELETE /webhooks/:id - Remove a webhook
  fastify.delete(
    '/webhooks/:id',
    { preHandler: validateParams(webhookIdParamSchema) },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id } = request.params as z.infer<typeof webhookIdParamSchema>;
        await webhookService.deleteWebhook(id, userId);
        return reply.status(204).send();
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to delete webhook' });
      }
    },
  );

  // POST /webhooks/:id/test - Fire a test event
  fastify.post(
    '/webhooks/:id/test',
    { preHandler: validateParams(webhookIdParamSchema) },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id } = request.params as z.infer<typeof webhookIdParamSchema>;
        const result = await webhookService.fireTestEvent(id, userId);
        return reply.status(202).send(result);
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to fire test event' });
      }
    },
  );

  // ─── Delivery Log ──────────────────────────────────────────────────────────

  // GET /webhooks/:id/deliveries - List deliveries for a webhook
  fastify.get(
    '/webhooks/:id/deliveries',
    { preHandler: [validateParams(webhookIdParamSchema), validateQuery(listDeliveriesQuerySchema)] },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id } = request.params as z.infer<typeof webhookIdParamSchema>;
        const query = request.query as ListDeliveriesQuery;

        const result = await webhookService.listDeliveries(id, userId, {
          status: query.status,
          eventType: query.eventType,
          since: query.since ? new Date(query.since) : undefined,
          limit: query.limit,
          offset: query.offset,
        });

        return result;
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to list deliveries' });
      }
    },
  );

  // GET /webhooks/:id/deliveries/:deliveryId - Get a specific delivery
  fastify.get(
    '/webhooks/:id/deliveries/:deliveryId',
    { preHandler: validateParams(deliveryIdParamSchema) },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id, deliveryId } = request.params as z.infer<typeof deliveryIdParamSchema>;
        const delivery = await webhookService.getDelivery(deliveryId, id, userId);
        return delivery;
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to get delivery' });
      }
    },
  );

  // POST /webhooks/:id/deliveries/:deliveryId/replay - Replay a delivery
  fastify.post(
    '/webhooks/:id/deliveries/:deliveryId/replay',
    { preHandler: validateParams(deliveryIdParamSchema) },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id, deliveryId } = request.params as z.infer<typeof deliveryIdParamSchema>;
        const delivery = await webhookService.replayDelivery(deliveryId, id, userId);
        return reply.status(202).send({ deliveryId: delivery.id });
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to replay delivery' });
      }
    },
  );

  // ─── Bulk Replay ───────────────────────────────────────────────────────────

  // POST /webhooks/:id/replay - Bulk replay events in a time range
  fastify.post(
    '/webhooks/:id/replay',
    { preHandler: [validateParams(webhookIdParamSchema), validateBody(webhookReplaySchema)] },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id } = request.params as z.infer<typeof webhookIdParamSchema>;
        const body = request.body as WebhookReplayInput;
        const result = await webhookService.replayEvents(id, userId, body);
        return reply.status(202).send(result);
      } catch (error: any) {
        fastify.log.error(error);
        if (error instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to replay events' });
      }
    },
  );
}
