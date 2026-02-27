import { describe, it, expect, vi } from 'vitest';

// Mock prisma (not used by the pure functions we test, but imported by the module)
vi.mock('../lib/db.js', () => ({
  prisma: {},
}));

import { extractTasksFromNote } from './task-extraction.service.js';

describe('task-extraction.service', () => {
  describe('extractTasksFromNote — HTML parsing', () => {
    it('should extract unchecked tasks from Tiptap HTML', () => {
      const html = `
        <ul data-type="taskList">
          <li data-type="taskItem">
            <input type="checkbox" />
            <label>Buy milk</label>
          </li>
          <li data-type="taskItem">
            <input type="checkbox" />
            <label>Buy eggs</label>
          </li>
        </ul>
      `;

      const tasks = extractTasksFromNote('note-1', 'Shopping List', html);
      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual({
        noteId: 'note-1',
        noteTitle: 'Shopping List',
        title: 'Buy milk',
        checked: false,
        folderId: undefined,
      });
      expect(tasks[1].title).toBe('Buy eggs');
    });

    it('should skip checked tasks', () => {
      const html = `
        <ul data-type="taskList">
          <li data-type="taskItem">
            <input type="checkbox" checked />
            <label>Already done</label>
          </li>
          <li data-type="taskItem">
            <input type="checkbox" />
            <label>Still todo</label>
          </li>
        </ul>
      `;

      const tasks = extractTasksFromNote('note-1', 'Test', html);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Still todo');
    });

    it('should skip task items with empty labels', () => {
      const html = `
        <ul data-type="taskList">
          <li data-type="taskItem">
            <input type="checkbox" />
            <label>   </label>
          </li>
          <li data-type="taskItem">
            <input type="checkbox" />
            <label>Real task</label>
          </li>
        </ul>
      `;

      const tasks = extractTasksFromNote('note-1', 'Test', html);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Real task');
    });

    it('should return empty array when no task items exist', () => {
      const html = '<p>Just a regular paragraph</p>';
      const tasks = extractTasksFromNote('note-1', 'Test', html);
      expect(tasks).toEqual([]);
    });

    it('should include folderId when provided', () => {
      const html = `
        <ul data-type="taskList">
          <li data-type="taskItem">
            <input type="checkbox" />
            <label>Task in folder</label>
          </li>
        </ul>
      `;

      const tasks = extractTasksFromNote('note-1', 'Test', html, 'folder-123');
      expect(tasks[0].folderId).toBe('folder-123');
    });
  });

  describe('extractTasksFromNote — Markdown fallback', () => {
    it('should extract unchecked markdown tasks with dash', () => {
      const markdown = `
- [ ] First task
- [ ] Second task
- [x] Done task
      `;

      const tasks = extractTasksFromNote('note-2', 'MD Note', markdown);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe('First task');
      expect(tasks[1].title).toBe('Second task');
    });

    it('should extract tasks with asterisk bullets', () => {
      const markdown = `
* [ ] Star task
* [x] Done star task
      `;

      const tasks = extractTasksFromNote('note-2', 'MD', markdown);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Star task');
    });

    it('should handle uppercase X as checked', () => {
      const markdown = `
- [X] Done with uppercase
- [ ] Still open
      `;

      const tasks = extractTasksFromNote('note-2', 'MD', markdown);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Still open');
    });

    it('should handle indented task items', () => {
      const markdown = `
  - [ ] Indented task
    - [ ] Double indented
      `;

      const tasks = extractTasksFromNote('note-2', 'MD', markdown);
      expect(tasks).toHaveLength(2);
    });

    it('should return empty array for empty content', () => {
      const tasks = extractTasksFromNote('note-2', 'Empty', '');
      expect(tasks).toEqual([]);
    });

    it('should return empty array for non-task markdown', () => {
      const markdown = `
# Heading
Regular paragraph
- Regular list item
      `;

      const tasks = extractTasksFromNote('note-2', 'No Tasks', markdown);
      expect(tasks).toEqual([]);
    });
  });

  describe('extractTasksFromNote — HTML takes priority over markdown', () => {
    it('should use HTML parser when both formats are present', () => {
      // Content that has both a Tiptap task item and a markdown checkbox
      const mixed = `
        <ul data-type="taskList">
          <li data-type="taskItem">
            <input type="checkbox" />
            <label>HTML task</label>
          </li>
        </ul>
        <p>- [ ] Markdown task that should be ignored</p>
      `;

      const tasks = extractTasksFromNote('note-3', 'Mixed', mixed);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('HTML task');
    });
  });
});
