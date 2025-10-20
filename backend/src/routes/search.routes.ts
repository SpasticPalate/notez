import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { searchService } from '../services/search.service.js';

// Validation schema
const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
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
  fastify.get('/', async (request, reply) => {
    try {
      const params = searchQuerySchema.parse(request.query);
      const userId = request.user!.userId;

      const response = await searchService.searchNotes({
        query: params.q,
        userId,
        folderId: params.folderId,
        limit: params.limit,
        offset: params.offset,
      });

      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: 'Invalid search parameters',
          errors: error.errors,
        });
      }

      fastify.log.error(error);
      return reply.code(500).send({
        message: 'Failed to search notes',
      });
    }
  });
}
