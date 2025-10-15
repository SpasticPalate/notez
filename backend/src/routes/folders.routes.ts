import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as folderService from '../services/folder.service.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validate.middleware.js';
import {
  createFolderSchema,
  updateFolderSchema,
  type CreateFolderInput,
  type UpdateFolderInput,
} from '../utils/validation.schemas.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

// Param schemas
const folderIdParamSchema = z.object({
  id: z.string().uuid('Invalid folder ID format'),
});

export async function foldersRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticateToken);

  // List all folders for the authenticated user
  fastify.get('/folders', async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const folders = await folderService.listFolders(userId);

      return {
        folders,
        total: folders.length,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to list folders',
      });
    }
  });

  // Get folder statistics for the authenticated user
  fastify.get('/folders/stats', async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const stats = await folderService.getFolderStats(userId);
      return stats;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get folder statistics',
      });
    }
  });

  // Get single folder by ID
  fastify.get(
    '/folders/:id',
    {
      preHandler: validateParams(folderIdParamSchema),
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const params = request.params as z.infer<typeof folderIdParamSchema>;
        const folder = await folderService.getFolderById(params.id, userId);

        return { folder };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get folder',
        });
      }
    }
  );

  // Create new folder
  fastify.post(
    '/folders',
    {
      preHandler: validateBody(createFolderSchema),
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const folder = await folderService.createFolder(userId, request.body as CreateFolderInput);

        return reply.status(201).send({
          message: 'Folder created successfully',
          folder,
        });
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: 'Conflict',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create folder',
        });
      }
    }
  );

  // Update folder (rename)
  fastify.patch(
    '/folders/:id',
    {
      preHandler: [validateParams(folderIdParamSchema), validateBody(updateFolderSchema)],
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const params = request.params as z.infer<typeof folderIdParamSchema>;
        const folder = await folderService.updateFolder(params.id, userId, request.body as UpdateFolderInput);

        return {
          message: 'Folder updated successfully',
          folder,
        };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: 'Conflict',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update folder',
        });
      }
    }
  );

  // Delete folder
  fastify.delete(
    '/folders/:id',
    {
      preHandler: validateParams(folderIdParamSchema),
    },
    async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const params = request.params as z.infer<typeof folderIdParamSchema>;
        const result = await folderService.deleteFolder(params.id, userId);

        return result;
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete folder',
        });
      }
    }
  );
}
