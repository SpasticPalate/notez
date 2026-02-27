import type { FastifyInstance } from 'fastify';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.js';
import { validateParams, validateQuery } from '../middleware/validate.middleware.js';
import { uuidParamSchema } from '../utils/validation.schemas.js';
import {
  listServiceAccounts,
  listServiceAccountNotes,
  getServiceAccountNote,
  listServiceAccountTasks,
} from '../services/user.service.js';
import { z } from 'zod';

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function adminRoutes(fastify: FastifyInstance) {
  // All routes require admin auth
  fastify.addHook('preHandler', authenticateToken);
  fastify.addHook('preHandler', requireAdmin);

  // List service accounts
  fastify.get('/admin/service-accounts', async (_request, reply) => {
    try {
      const accounts = await listServiceAccounts();
      return { serviceAccounts: accounts };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to list service accounts',
      });
    }
  });

  // List all notes from service accounts (paginated)
  fastify.get(
    '/admin/service-accounts/notes',
    {
      preHandler: validateQuery(paginationQuerySchema),
    },
    async (request, reply) => {
      try {
        const { limit, offset } = request.query as { limit: number; offset: number };
        const result = await listServiceAccountNotes({ limit, offset });
        return result;
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list service account notes',
        });
      }
    }
  );

  // Get single note from service account (read-only)
  fastify.get(
    '/admin/service-accounts/notes/:id',
    {
      preHandler: validateParams(uuidParamSchema),
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const note = await getServiceAccountNote(id);
        return note;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Note not found') {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Note not found',
            });
          }
          if (error.message === 'Note does not belong to a service account') {
            return reply.status(403).send({
              error: 'Forbidden',
              message: 'This note does not belong to a service account',
            });
          }
        }
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get service account note',
        });
      }
    }
  );

  // List all tasks from service accounts (paginated)
  fastify.get(
    '/admin/service-accounts/tasks',
    {
      preHandler: validateQuery(paginationQuerySchema),
    },
    async (request, reply) => {
      try {
        const { limit, offset } = request.query as { limit: number; offset: number };
        const result = await listServiceAccountTasks({ limit, offset });
        return result;
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list service account tasks',
        });
      }
    }
  );
}
