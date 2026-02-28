import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotezClient } from './client.js';

describe('NotezClient', () => {
  let client: NotezClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new NotezClient('https://notez.example.com', 'test-token');
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Content-Type header on DELETE requests', () => {
    it('should NOT send Content-Type header on DELETE requests (no body)', async () => {
      await client.deleteNote('test-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
      expect(options.headers['Authorization']).toBe('Bearer test-token');
    });

    it('should NOT send Content-Type header on deleteTask', async () => {
      await client.deleteTask('test-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('should NOT send Content-Type header on deleteFolder', async () => {
      await client.deleteFolder('test-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('should NOT send Content-Type header on deleteTag', async () => {
      await client.deleteTag('test-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('should NOT send Content-Type header on unshareNote', async () => {
      await client.unshareNote('note-id', 'share-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('Content-Type header on requests with body', () => {
    it('should send Content-Type: application/json on POST requests', async () => {
      await client.createNote({ title: 'Test' });

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('should send Content-Type: application/json on PATCH requests', async () => {
      await client.updateNote('test-id', { title: 'Updated' });

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Content-Type header on GET requests', () => {
    it('should NOT send Content-Type header on GET requests (no body)', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await client.listFolders();

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });
  });
});
