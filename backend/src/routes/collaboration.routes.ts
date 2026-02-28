/**
 * WebSocket route for real-time collaboration.
 * Upgrades HTTP connections to WebSocket and hands them to Hocuspocus.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hocuspocusServer } from '../services/collaboration.service.js';

const collabParamSchema = z.object({ noteId: z.string().uuid() });

export async function collaborationRoutes(fastify: FastifyInstance) {
  // No Fastify-level auth here — browsers cannot send Authorization headers
  // with WebSocket upgrades. Auth is handled by Hocuspocus onAuthenticate
  // which verifies the JWT token sent via the Hocuspocus protocol.

  // WebSocket upgrade endpoint for collaboration
  fastify.get(
    '/collaboration/:noteId',
    { websocket: true },
    (socket, request) => {
      try {
        const params = collabParamSchema.parse(request.params);
        const noteId = params.noteId;

        // Hand the WebSocket connection to Hocuspocus
        hocuspocusServer.handleConnection(socket, request.raw, {
          documentName: noteId,
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          // Invalid noteId format — close socket cleanly
          // 1008 = Policy Violation
          socket.close(1008, 'Invalid note ID');
        } else {
          // Unexpected error — log server-side and close with generic code
          // 1011 = Unexpected Condition
          fastify.log.error(err, 'Unexpected error in collaboration route');
          socket.close(1011, 'Internal error');
        }
      }
    }
  );
}
