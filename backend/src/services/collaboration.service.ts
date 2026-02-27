/**
 * Collaboration service using Hocuspocus (Yjs WebSocket server).
 * Handles authentication, document loading/storing, and awareness.
 */
import { Hocuspocus } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import type { fetchPayload, storePayload, onAuthenticatePayload, onConnectPayload } from '@hocuspocus/server';
import * as Y from 'yjs';
import { prisma } from '../lib/db.js';
import { verifyAccessToken } from '../utils/jwt.utils.js';
import { checkNoteAccess } from './share.service.js';
import { markdownToYDoc, yDocToMarkdown } from '../lib/tiptap-server.js';

// Assign a consistent color to each user based on their userId
const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F1948A', '#82E0AA',
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

/** Fetch Yjs document state from database (used by Database extension). */
export async function fetchDocument({ documentName }: fetchPayload): Promise<Uint8Array | null> {
  const noteId = documentName;

  try {
    // Try to load existing Yjs state from database
    const yjsState = await prisma.noteYjsState.findUnique({
      where: { noteId },
    });

    if (yjsState) {
      return yjsState.state;
    }

    // First-time collaboration: convert markdown content to Yjs doc
    // Only load non-deleted notes
    const note = await prisma.note.findFirst({
      where: { id: noteId, deleted: false },
      select: { content: true },
    });

    if (!note) {
      return null;
    }

    // Convert markdown to Yjs document and return its state
    const doc = markdownToYDoc(note.content || '');
    const state = Y.encodeStateAsUpdate(doc);

    // Save initial state so we don't reconvert next time
    await prisma.noteYjsState.upsert({
      where: { noteId },
      update: { state: Buffer.from(state) },
      create: { noteId, state: Buffer.from(state) },
    });

    return state;
  } catch (err) {
    console.error(`[collab] Failed to fetch Yjs state for note ${noteId}:`, err);
    // Return null so Hocuspocus creates an empty doc instead of crashing
    return null;
  }
}

/** Store Yjs document state to database (used by Database extension). */
export async function storeDocument({ documentName, state }: storePayload): Promise<void> {
  const noteId = documentName;

  try {
    // Save Yjs binary state
    await prisma.noteYjsState.upsert({
      where: { noteId },
      update: { state: Buffer.from(state) },
      create: { noteId, state: Buffer.from(state) },
    });

    // Also convert Yjs state back to markdown and update the note
    // This keeps the REST API / search in sync
    // Only update non-deleted notes to avoid resurrecting soft-deleted content
    try {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, state);
      const markdown = yDocToMarkdown(doc);

      await prisma.note.updateMany({
        where: { id: noteId, deleted: false },
        data: { content: markdown },
      });
    } catch (err) {
      console.error(`[collab] Failed to sync Yjs state to markdown for note ${noteId}:`, err);
    }
  } catch (err) {
    // Log and swallow — don't crash the WebSocket server
    console.error(`[collab] Failed to store Yjs state for note ${noteId}:`, err);
  }
}

// @ts-ignore -- Hocuspocus types incompatible with strict mode
export const hocuspocusServer = new Hocuspocus({
  name: 'notez-collaboration',
  timeout: 30000,
  debounce: 2000,
  maxDebounce: 10000,

  extensions: [
    new Database({
      fetch: fetchDocument,
      store: storeDocument,
    }),
  ],

  async onAuthenticate({ token, documentName }: onAuthenticatePayload) {
    if (!token) {
      throw new Error('Authentication required');
    }

    // Verify JWT
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new Error('Invalid or expired token');
    }

    const noteId = documentName;
    const userId = payload.userId;

    // Check access
    const access = await checkNoteAccess(noteId, userId);
    if (!access.hasAccess) {
      throw new Error('Access denied');
    }

    // Return user context for awareness
    return {
      user: {
        id: userId,
        name: payload.username,
        color: getUserColor(userId),
      },
      readOnly: access.permission === 'VIEW',
    };
  },

  async onConnect({ connectionConfig, context }: onConnectPayload) {
    // The connection context has the user info from onAuthenticate
    if (context?.readOnly) {
      // @ts-ignore -- Hocuspocus types incompatible with strict mode
      connectionConfig.readOnly = true;
    }
  },
});
