import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../lib/db.js', () => ({
  prisma: {
    note: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { SearchService, searchService } from './search.service.js';
import { prisma } from '../lib/db.js';

const mockPrisma = vi.mocked(prisma);

const makeRawResult = (id: string, title: string) => ({
  id,
  title,
  content: `Content for ${title}`,
  folderId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  snippet: `snippet for ${title}`,
  rank: 0.5,
});

const makeNoteWithRelations = (id: string, title: string) => ({
  id,
  folder: null,
  tags: [],
});

describe('search.service', () => {
  let service: SearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SearchService();
  });

  // ─── searchNotes — empty / invalid query ──────────────────────────────
  describe('searchNotes — empty query handling', () => {
    it('should return empty results for empty string query', async () => {
      const result = await service.searchNotes({ query: '', userId: 'user-1' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('should return empty results for whitespace-only query', async () => {
      const result = await service.searchNotes({ query: '   ', userId: 'user-1' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty results for query with only special characters', async () => {
      const result = await service.searchNotes({ query: '!@#$%^&*()', userId: 'user-1' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ─── searchNotes — full-text search success ───────────────────────────
  describe('searchNotes — full-text search', () => {
    it('should return enriched results from full-text search', async () => {
      const rawResults = [makeRawResult('note-1', 'Test Note')];
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(rawResults) // FTS results
        .mockResolvedValueOnce([{ count: BigInt(1) }]); // FTS count

      mockPrisma.note.findMany.mockResolvedValue([
        makeNoteWithRelations('note-1', 'Test Note'),
      ] as any);

      const result = await service.searchNotes({ query: 'test', userId: 'user-1' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('note-1');
      expect(result.results[0].title).toBe('Test Note');
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should enrich results with folder and tags from relations', async () => {
      const rawResults = [makeRawResult('note-1', 'Enriched')];
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(rawResults)
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      mockPrisma.note.findMany.mockResolvedValue([
        {
          id: 'note-1',
          folder: { id: 'folder-1', name: 'Work' },
          tags: [{ tag: { id: 'tag-1', name: 'important' } }],
        },
      ] as any);

      const result = await service.searchNotes({ query: 'enriched', userId: 'user-1' });

      expect(result.results[0].folder).toEqual({ id: 'folder-1', name: 'Work' });
      expect(result.results[0].tags).toEqual([{ id: 'tag-1', name: 'important' }]);
    });

    it('should compute hasMore correctly when more results exist', async () => {
      const rawResults = [makeRawResult('note-1', 'Note')];
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(rawResults)
        .mockResolvedValueOnce([{ count: BigInt(25) }]); // total > offset+limit

      mockPrisma.note.findMany.mockResolvedValue([
        makeNoteWithRelations('note-1', 'Note'),
      ] as any);

      const result = await service.searchNotes({
        query: 'note',
        userId: 'user-1',
        limit: 10,
        offset: 10,
      });

      // offset(10) + limit(10) = 20 < total(25), so hasMore is true
      expect(result.hasMore).toBe(true);
    });

    it('should handle BigInt count from $queryRaw correctly', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([makeRawResult('note-1', 'One')])
        .mockResolvedValueOnce([{ count: BigInt(42) }]);

      mockPrisma.note.findMany.mockResolvedValue([makeNoteWithRelations('note-1', 'One')] as any);

      const result = await service.searchNotes({ query: 'one', userId: 'user-1' });

      expect(result.total).toBe(42);
    });

    it('should return empty tags and null folder for notes without relations', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([makeRawResult('note-1', 'Solo')])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note-1', folder: null, tags: [] },
      ] as any);

      const result = await service.searchNotes({ query: 'solo', userId: 'user-1' });

      expect(result.results[0].folder).toBeNull();
      expect(result.results[0].tags).toEqual([]);
    });
  });

  // ─── searchNotes — ILIKE fallback ─────────────────────────────────────
  describe('searchNotes — ILIKE fallback', () => {
    it('should fall back to ILIKE when full-text search throws', async () => {
      const rawResults = [makeRawResult('note-2', 'Fallback Note')];

      // The service has a single try/catch block. The first $queryRaw (FTS results) throws,
      // which immediately jumps to the catch block. The catch block then makes 2 more
      // $queryRaw calls (ILIKE results + ILIKE count).
      mockPrisma.$queryRaw
        .mockRejectedValueOnce(new Error('FTS not available')) // FTS results query fails → triggers catch
        .mockResolvedValueOnce(rawResults)                      // ILIKE results
        .mockResolvedValueOnce([{ count: BigInt(1) }]);         // ILIKE count

      mockPrisma.note.findMany.mockResolvedValue([
        makeNoteWithRelations('note-2', 'Fallback Note'),
      ] as any);

      const result = await service.searchNotes({ query: 'fallback', userId: 'user-1' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('note-2');
    });

    it('should return zero when both FTS and ILIKE return empty', async () => {
      mockPrisma.$queryRaw
        .mockRejectedValueOnce(new Error('FTS failed'))         // FTS fails → triggers catch
        .mockResolvedValueOnce([])                              // ILIKE results (empty)
        .mockResolvedValueOnce([{ count: BigInt(0) }]);         // ILIKE count

      mockPrisma.note.findMany.mockResolvedValue([]);

      const result = await service.searchNotes({ query: 'nomatch', userId: 'user-1' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ─── searchNotes — folderId filter ────────────────────────────────────
  describe('searchNotes — folderId filter', () => {
    it('should pass folderId to the raw query', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      mockPrisma.note.findMany.mockResolvedValue([]);

      await service.searchNotes({ query: 'test', userId: 'user-1', folderId: 'folder-1' });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  // ─── searchNotes — pagination ─────────────────────────────────────────
  describe('searchNotes — pagination', () => {
    it('should use default limit 20 and offset 0', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      mockPrisma.note.findMany.mockResolvedValue([]);

      const result = await service.searchNotes({ query: 'hello', userId: 'user-1' });

      // default hasMore = false (0 + 20 > 0 is false... but 0 >= 0 means no items)
      expect(result.hasMore).toBe(false);
    });

    it('should set hasMore false when last page exactly', async () => {
      const raw = [makeRawResult('n1', 'A'), makeRawResult('n2', 'B')];
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(raw)
        .mockResolvedValueOnce([{ count: BigInt(2) }]);

      mockPrisma.note.findMany.mockResolvedValue([
        makeNoteWithRelations('n1', 'A'),
        makeNoteWithRelations('n2', 'B'),
      ] as any);

      const result = await service.searchNotes({
        query: 'hello',
        userId: 'user-1',
        limit: 2,
        offset: 0,
      });

      // offset(0) + limit(2) = 2 which is NOT < total(2), so hasMore is false
      expect(result.hasMore).toBe(false);
    });
  });

  // ─── raw SQL uuid cast regression (PR fix/mcp-client-bugs) ───────────
  describe('searchNotes — UUID cast regression', () => {
    it('should use CAST(... AS uuid) instead of ::uuid for userId parameter', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);
      mockPrisma.note.findMany.mockResolvedValue([]);

      await service.searchNotes({ query: 'test', userId: '22f41934-ae18-4390-a319-d4fc5e9a52c1' });

      // The first $queryRaw call is the FTS query — inspect the tagged template strings
      const call = mockPrisma.$queryRaw.mock.calls[0][0] as any;
      const sql = call.strings?.join('?') ?? String(call);
      expect(sql).toContain('CAST(');
      expect(sql).toContain('AS uuid)');
      expect(sql).not.toContain('::uuid');
    });

    it('should use CAST(... AS uuid) for folderId parameter', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);
      mockPrisma.note.findMany.mockResolvedValue([]);

      await service.searchNotes({
        query: 'test',
        userId: '22f41934-ae18-4390-a319-d4fc5e9a52c1',
        folderId: 'd7f003f9-785f-43b9-bc5f-879c1448ea75',
      });

      const call = mockPrisma.$queryRaw.mock.calls[0][0] as any;
      const sql = call.strings?.join('?') ?? String(call);
      expect(sql).not.toContain('::uuid');
    });
  });

  // ─── exported singleton ───────────────────────────────────────────────
  describe('searchService singleton', () => {
    it('should export a SearchService instance', () => {
      expect(searchService).toBeInstanceOf(SearchService);
    });
  });
});
