import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateQuery } from '../middleware/validate.middleware.js';
import { searchService } from '../services/search.service.js';

// Validation schema
const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(500, 'Search query too long'),
  folderId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function searchRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticateToken);

  /**
   * Search notes
   * GET /api/search?q=query&folderId=uuid&limit=20&offset=0
   */
  fastify.get<{ Querystring: z.infer<typeof searchQuerySchema> }>(
    '/',
    {
      preHandler: [validateQuery(searchQuerySchema)],
    },
    async (request, reply) => {
      try {
        const { q, limit, offset, folderId } = request.query;
        const userId = request.user!.userId;

        const response = await searchService.searchNotes({
          query: q,
          userId,
          folderId,
          limit,
          offset,
        });

        return reply.code(200).send(response);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to search notes',
        });
      }
    },
  );
}
