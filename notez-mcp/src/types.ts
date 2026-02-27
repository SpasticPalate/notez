/** Shared types for the Notez MCP server */

export interface NotezNote {
  id: string;
  title: string;
  content: string | null;
  plainText?: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  folder?: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
}

export interface NotezTask {
  id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  noteId: string | null;
  noteTitle: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  folder?: { id: string; name: string } | null;
  note?: { id: string; title: string } | null;
  tags: { id: string; name: string }[];
}

export interface NotezFolder {
  id: string;
  name: string;
  icon: string;
  noteCount: number;
}

export interface SearchResponse {
  results: NotezNote[];
  total: number;
  hasMore: boolean;
}

export interface TaskListResponse {
  tasks: NotezTask[];
  total: number;
  limit: number;
  offset: number;
}

export interface NoteListResponse {
  notes: NotezNote[];
  total: number;
}

export interface NotezTag {
  id: string;
  name: string;
  noteCount: number;
  createdAt: string;
}

export interface NotezShare {
  id: string;
  noteId: string;
  userId: string;
  permission: 'VIEW' | 'EDIT';
  user: { id: string; username: string; email: string };
  createdAt: string;
}

export interface SuccessResponse {
  success: true;
  message?: string;
  noteCount?: number;
}
