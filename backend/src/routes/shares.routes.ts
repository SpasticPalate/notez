import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as shareService from '../services/share.service.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createShareSchema,
  updateSharePermissionSchema,
  shareIdParamSchema,
  sharedContactsQuerySchema,
  type CreateShareInput,
  type UpdateSharePermissionInput,
  type SharedContactsQuery,
} from '../utils/validation.schemas.js';

const noteIdParamSchema = z.object({
  id: z.string().uuid('Invalid note ID format'),
});

export async function sharesRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticateToken);

  // Static routes must be declared before parametric /notes/:id routes

  // Get users the current user has previously shared notes with (for autocomplete)
  fastify.get(
    '/shares/contacts',
    {
      preHandler: validateQuery(sharedContactsQuerySchema),
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { q, limit } = request.query as SharedContactsQuery;
        const contacts = await shareService.getSharedContacts(userId, q, limit);
        return { contacts };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to get shared contacts' });
      }
    }
  );

  // List notes the current user has shared out to others
  fastify.get('/notes/shared-by-me', async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const result = await shareService.listSharedByMe(userId);

      return result;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to list shared notes' });
    }
  });

  // List notes shared with the current user
  fastify.get('/notes/shared-with-me', async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const notes = await shareService.listSharedWithMe(userId);

      return { notes };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to list shared notes' });
    }
  });

  // Share a note with a user
  fastify.post(
    '/notes/:id/shares',
    {
      preHandler: [validateParams(noteIdParamSchema), validateBody(createShareSchema)],
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id: noteId } = request.params as z.infer<typeof noteIdParamSchema>;
        const { usernameOrEmail, permission } = request.body as CreateShareInput;

        const share = await shareService.shareNote(noteId, userId, usernameOrEmail, permission as any);

        return reply.status(201).send({
          message: 'Note shared successfully',
          share,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Note not found') {
            return reply.status(404).send({ error: 'Not Found', message: error.message });
          }
          if (error.message === 'User not found') {
            return reply.status(404).send({ error: 'Not Found', message: error.message });
          }
          if (error.message.includes('Cannot share')) {
            return reply.status(400).send({ error: 'Bad Request', message: error.message });
          }
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to share note' });
      }
    }
  );

  // List shares for a note (owner only)
  fastify.get(
    '/notes/:id/shares',
    {
      preHandler: validateParams(noteIdParamSchema),
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id: noteId } = request.params as z.infer<typeof noteIdParamSchema>;

        const shares = await shareService.listSharesForNote(noteId, userId);

        return { shares };
      } catch (error) {
        if (error instanceof Error && error.message === 'Note not found') {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to list shares' });
      }
    }
  );

  // Update share permission (owner only)
  fastify.patch(
    '/notes/:id/shares/:shareId',
    {
      preHandler: [validateParams(shareIdParamSchema), validateBody(updateSharePermissionSchema)],
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id: noteId, shareId } = request.params as z.infer<typeof shareIdParamSchema>;
        const { permission } = request.body as UpdateSharePermissionInput;

        const share = await shareService.updateSharePermission(noteId, userId, shareId, permission as any);

        return { message: 'Permission updated', share };
      } catch (error) {
        if (error instanceof Error && error.message === 'Share not found') {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to update share' });
      }
    }
  );

  // Remove a share (owner only)
  fastify.delete(
    '/notes/:id/shares/:shareId',
    {
      preHandler: validateParams(shareIdParamSchema),
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const { id: noteId, shareId } = request.params as z.infer<typeof shareIdParamSchema>;

        await shareService.unshareNote(noteId, userId, shareId);

        return { message: 'Share removed' };
      } catch (error) {
        if (error instanceof Error && error.message === 'Share not found') {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to remove share' });
      }
    }
  );

}
