import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { NotezClient } from './client.js';

/**
 * Create and configure the Notez MCP server with all tools
 */
export function createNotezServer(client: NotezClient): McpServer {
  const server = new McpServer({
    name: 'notez',
    version: '1.6.0',
  });

  // ─── Notes (read) ───────────────────────────────────────────────────

  server.registerTool(
    'notez_search_notes',
    {
      description: 'Search notes by keyword or phrase. Returns matching notes with snippets.',
      inputSchema: {
        query: z.string().describe('Search query (keywords or phrase)'),
        limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      },
    },
    async ({ query, limit }) => {
      try {
        const result = await client.searchNotes(query, limit);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_get_note',
    {
      description: 'Get a note by its ID. Returns full content including plain text version.',
      inputSchema: {
        id: z.string().uuid().describe('Note UUID'),
      },
    },
    async ({ id }) => {
      try {
        const note = await client.getNote(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_get_note_by_title',
    {
      description: 'Find a note by its exact title (case-insensitive match).',
      inputSchema: {
        title: z.string().describe('Exact note title to search for'),
      },
    },
    async ({ title }) => {
      try {
        const note = await client.getNoteByTitle(title);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_list_recent',
    {
      description: 'List recently modified notes, sorted by last update time.',
      inputSchema: {
        limit: z.number().min(1).max(50).default(20).describe('Max notes to return'),
      },
    },
    async ({ limit }) => {
      try {
        const result = await client.listRecentNotes(limit);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Notes (write) ──────────────────────────────────────────────────

  server.registerTool(
    'notez_create_note',
    {
      description: 'Create a new note. Content should be HTML format.',
      inputSchema: {
        title: z.string().describe('Note title'),
        content: z.string().optional().describe('Note content (HTML)'),
        folderId: z.string().uuid().optional().describe('Folder UUID to place note in'),
        tags: z.array(z.string()).optional().describe('Tag names to attach'),
      },
    },
    async ({ title, content, folderId, tags }) => {
      try {
        const note = await client.createNote({ title, content, folderId, tags });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_append_to_note',
    {
      description: 'Append content to an existing note. Content is added to the end.',
      inputSchema: {
        id: z.string().uuid().describe('Note UUID'),
        content: z.string().describe('Content to append (HTML)'),
      },
    },
    async ({ id, content }) => {
      try {
        const note = await client.appendToNote(id, content);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tasks (read) ──────────────────────────────────────────────────

  server.registerTool(
    'notez_list_tasks',
    {
      description: 'List tasks, optionally filtered by status. Returns tasks sorted by priority.',
      inputSchema: {
        status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional()
          .describe('Filter by task status'),
        limit: z.number().min(1).max(50).default(20).describe('Max tasks to return'),
      },
    },
    async ({ status, limit }) => {
      try {
        const result = await client.listTasks(status, limit);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_get_task',
    {
      description: 'Get a task by its ID. Returns full task details including links and tags.',
      inputSchema: {
        id: z.string().uuid().describe('Task UUID'),
      },
    },
    async ({ id }) => {
      try {
        const task = await client.getTask(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tasks (write) ─────────────────────────────────────────────────

  server.registerTool(
    'notez_create_task',
    {
      description: 'Create a new task with optional priority, due date, and tags.',
      inputSchema: {
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()
          .describe('Task priority (default: MEDIUM)'),
        dueDate: z.string().optional().describe('Due date (ISO 8601 datetime)'),
        folderId: z.string().uuid().optional().describe('Folder UUID'),
        tags: z.array(z.string()).optional().describe('Tag names to attach'),
      },
    },
    async ({ title, description, priority, dueDate, folderId, tags }) => {
      try {
        const task = await client.createTask({ title, description, priority, dueDate, folderId, tags });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_update_task_status',
    {
      description: 'Update the status of an existing task.',
      inputSchema: {
        id: z.string().uuid().describe('Task UUID'),
        status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
          .describe('New task status'),
      },
    },
    async ({ id, status }) => {
      try {
        const task = await client.updateTaskStatus(id, status);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Folders ────────────────────────────────────────────────────────

  server.registerTool(
    'notez_list_folders',
    {
      description: 'List all folders with their note counts.',
      inputSchema: {},
    },
    async () => {
      try {
        const folders = await client.listFolders();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(folders, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
