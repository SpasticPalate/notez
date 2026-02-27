import type { FastifyInstance, FastifyRequest, FastifyError } from 'fastify';
import { authenticateApiToken, requireScope } from '../middleware/auth.middleware.js';
import { validateQuery, validateParams, validateBody } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { searchService } from '../services/search.service.js';
import { getNoteById, getNoteByTitle, listNotes, createNote, updateNote } from '../services/note.service.js';
import { getTaskById, listTasks, createTask, updateTaskStatus } from '../services/task.service.js';
import { listFolders } from '../services/folder.service.js';
import { hashToken } from '../services/token.service.js';
import { BadRequestError } from '../utils/errors.js';

// --- Query/Body schemas for MCP routes ---

const searchNotesQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const recentNotesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const noteByTitleQuery = z.object({
  title: z.string().min(1).max(500),
});

const noteIdParam = z.object({
  id: z.string().uuid(),
});

const createNoteBody = z.object({
  title: z.string().min(1).max(500),
  content: z.string().optional(),
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

const appendNoteBody = z.object({
  content: z.string().min(1).max(50000),
});

const listTasksQuery = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const taskIdParam = z.object({
  id: z.string().uuid(),
});

const createTaskBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM').optional(),
  dueDate: z.string().datetime().optional(),
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

const updateTaskStatusBody = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
});

/**
 * Strip HTML tags, decode entities, and collapse whitespace for AI consumption
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Per-token rate limit config for MCP routes (120 requests/min per token)
 */
const perTokenRateLimit = {
  rateLimit: {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const auth = request.headers.authorization || '';
      if (auth.startsWith('Bearer ntez_')) {
        return `mcp:${hashToken(auth.substring(7))}`;
      }
      return `mcp:${request.ip}`;
    },
  },
};

/**
 * MCP API routes — consumed by the notez-mcp stdio server
 * All routes authenticated via API token (ntez_ prefix)
 *
 * Error handling: Plugin-level setErrorHandler maps errors centrally.
 * - AppError subclasses (NotFoundError, BadRequestError, etc.) → use statusCode
 * - Service layer "not found" plain errors → 404
 * - Everything else → 500
 */
export async function mcpRoutes(fastify: FastifyInstance) {
  // Plugin-level error handler — maps all errors centrally instead of per-handler try/catch
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Typed AppError subclasses (NotFoundError, BadRequestError, etc.)
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: error.name || 'Error',
        message: error.message,
      });
    }

    // Service layer "not found" errors (legacy — services throw plain Error)
    if (error.message?.toLowerCase().includes('not found')) {
      return reply.code(404).send({
        error: 'Not Found',
        message: error.message,
      });
    }

    // Everything else → 500
    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  // All routes require API token authentication
  fastify.addHook('preHandler', authenticateApiToken);

  // ─── Notes (read scope) ───────────────────────────────────────────────

  // Search notes by keyword
  fastify.get(
    '/notes/search',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(searchNotesQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { q, limit } = request.query as z.infer<typeof searchNotesQuery>;

      return searchService.searchNotes({ query: q, userId, limit });
    }
  );

  // Get note by exact title (case-insensitive)
  fastify.get(
    '/notes/by-title',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(noteByTitleQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { title } = request.query as z.infer<typeof noteByTitleQuery>;

      const note = await getNoteByTitle(title, userId);
      return {
        ...note,
        plainText: note.content ? htmlToPlainText(note.content) : null,
      };
    }
  );

  // List recently modified notes
  fastify.get(
    '/notes/recent',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(recentNotesQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { limit, offset } = request.query as z.infer<typeof recentNotesQuery>;

      return listNotes(userId, { limit, offset });
    }
  );

  // Get note by ID (full content + plainText)
  fastify.get(
    '/notes/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateParams(noteIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      const note = await getNoteById(id, userId);
      return {
        ...note,
        plainText: note.content ? htmlToPlainText(note.content) : null,
      };
    }
  );

  // ─── Notes (write scope) ──────────────────────────────────────────────

  // Create a new note
  fastify.post(
    '/notes',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateBody(createNoteBody)] },
    async (request: FastifyRequest, reply) => {
      const userId = request.user!.userId;
      const body = request.body as z.infer<typeof createNoteBody>;

      const note = await createNote(userId, body);
      reply.code(201);
      return note;
    }
  );

  // Append content to an existing note
  fastify.patch(
    '/notes/:id/append',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(noteIdParam), validateBody(appendNoteBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { content: appendContent } = request.body as z.infer<typeof appendNoteBody>;

      const note = await getNoteById(id, userId);
      const existingContent = note.content || '';
      const newContent = existingContent + appendContent;

      // Guard against unbounded growth
      const MAX_NOTE_CONTENT = 500_000;
      if (newContent.length > MAX_NOTE_CONTENT) {
        throw new BadRequestError('Note content would exceed maximum size (500KB)');
      }

      return updateNote(id, userId, { content: newContent });
    }
  );

  // ─── Tasks (read scope) ───────────────────────────────────────────────

  // List tasks (optionally filter by status)
  fastify.get(
    '/tasks',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(listTasksQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { status, limit } = request.query as z.infer<typeof listTasksQuery>;

      return listTasks(userId, {
        status,
        limit,
        sortBy: 'priority',
        sortOrder: 'desc',
      });
    }
  );

  // Get task by ID
  fastify.get(
    '/tasks/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateParams(taskIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      return getTaskById(id, userId);
    }
  );

  // ─── Tasks (write scope) ──────────────────────────────────────────────

  // Create a new task
  fastify.post(
    '/tasks',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateBody(createTaskBody)] },
    async (request: FastifyRequest, reply) => {
      const userId = request.user!.userId;
      const body = request.body as z.infer<typeof createTaskBody>;

      const task = await createTask(userId, body);
      reply.code(201);
      return task;
    }
  );

  // Update task status
  fastify.patch(
    '/tasks/:id/status',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(taskIdParam), validateBody(updateTaskStatusBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { status } = request.body as z.infer<typeof updateTaskStatusBody>;

      return updateTaskStatus(id, userId, status);
    }
  );

  // ─── Folders (read scope) ─────────────────────────────────────────────

  // List all folders
  fastify.get(
    '/folders',
    { config: perTokenRateLimit, preHandler: requireScope('read') },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      return listFolders(userId);
    }
  );
}
