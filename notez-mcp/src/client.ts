import type {
  NotezNote,
  NotezTask,
  NotezFolder,
  SearchResponse,
  TaskListResponse,
  NoteListResponse,
} from './types.js';

/**
 * HTTP client for the Notez /api/mcp/* endpoints
 */
export class NotezClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/mcp${path}`;
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15_000), // 15 second timeout
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      let message: string;
      try {
        const json = JSON.parse(body);
        message = json.message || json.error || body;
      } catch {
        message = body;
      }
      throw new Error(`Notez API error (${response.status}): ${message}`);
    }

    return response.json() as Promise<T>;
  }

  // ─── Notes ──────────────────────────────────────────────────────────

  async searchNotes(query: string, limit = 20): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return this.request<SearchResponse>(`/notes/search?${params}`);
  }

  async getNote(id: string): Promise<NotezNote> {
    return this.request<NotezNote>(`/notes/${id}`);
  }

  async getNoteByTitle(title: string): Promise<NotezNote> {
    const params = new URLSearchParams({ title });
    return this.request<NotezNote>(`/notes/by-title?${params}`);
  }

  async listRecentNotes(limit = 20): Promise<NoteListResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    return this.request<NoteListResponse>(`/notes/recent?${params}`);
  }

  async createNote(data: {
    title: string;
    content?: string;
    folderId?: string;
    tags?: string[];
  }): Promise<NotezNote> {
    return this.request<NotezNote>('/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async appendToNote(id: string, content: string): Promise<NotezNote> {
    return this.request<NotezNote>(`/notes/${id}/append`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  // ─── Tasks ──────────────────────────────────────────────────────────

  async listTasks(status?: string, limit = 20): Promise<TaskListResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set('status', status);
    return this.request<TaskListResponse>(`/tasks?${params}`);
  }

  async getTask(id: string): Promise<NotezTask> {
    return this.request<NotezTask>(`/tasks/${id}`);
  }

  async createTask(data: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    folderId?: string;
    tags?: string[];
  }): Promise<NotezTask> {
    return this.request<NotezTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTaskStatus(id: string, status: string): Promise<NotezTask> {
    return this.request<NotezTask>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // ─── Folders ────────────────────────────────────────────────────────

  async listFolders(): Promise<NotezFolder[]> {
    return this.request<NotezFolder[]>('/folders');
  }
}
