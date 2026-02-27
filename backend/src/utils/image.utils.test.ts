import { describe, it, expect } from 'vitest';
import { sanitizeFilename, ALLOWED_IMAGE_MIME_TYPES } from './image.utils.js';

describe('image.utils', () => {
  describe('sanitizeFilename', () => {
    it('should return a normal filename unchanged', () => {
      expect(sanitizeFilename('photo.jpg', 'fallback.jpg')).toBe('photo.jpg');
    });

    it('should return fallback for undefined filename', () => {
      expect(sanitizeFilename(undefined, 'fallback.png')).toBe('fallback.png');
    });

    it('should return fallback for empty string', () => {
      expect(sanitizeFilename('', 'fallback.png')).toBe('fallback.png');
    });

    it('should remove path traversal attempts', () => {
      expect(sanitizeFilename('../../etc/passwd', 'fallback')).toBe('_etc_passwd');
    });

    it('should replace backslashes', () => {
      expect(sanitizeFilename('path\\to\\file.jpg', 'fb')).toBe('path_to_file.jpg');
    });

    it('should replace forward slashes', () => {
      expect(sanitizeFilename('path/to/file.jpg', 'fb')).toBe('path_to_file.jpg');
    });

    it('should remove control characters', () => {
      expect(sanitizeFilename('file\x00name\x1F.jpg', 'fb')).toBe('filename.jpg');
    });

    it('should remove dangerous characters (<>:"|?*)', () => {
      expect(sanitizeFilename('file<>:"|?*.jpg', 'fb')).toBe('file_.jpg');
    });

    it('should trim whitespace from start and end', () => {
      expect(sanitizeFilename('  file.jpg  ', 'fb')).toBe('file.jpg');
    });

    it('should replace double-dot sequences (path traversal)', () => {
      // '...' → replace '..' → '_.' then trim trailing dot → '_' → fallback
      const result = sanitizeFilename('...', 'fb');
      expect(result).toBe('fb');
    });

    it('should collapse multiple underscores', () => {
      expect(sanitizeFilename('a///b', 'fb')).toBe('a_b');
    });

    it('should truncate filenames exceeding 255 chars while preserving extension', () => {
      const longName = 'a'.repeat(260) + '.jpg';
      const result = sanitizeFilename(longName, 'fb');
      expect(result.length).toBeLessThanOrEqual(255);
      expect(result).toMatch(/\.jpg$/);
    });

    it('should truncate filenames exceeding 255 chars without extension', () => {
      const longName = 'a'.repeat(260);
      const result = sanitizeFilename(longName, 'fb');
      expect(result.length).toBe(255);
    });

    it('should return fallback when sanitization produces only underscore', () => {
      expect(sanitizeFilename('<>', 'fallback.jpg')).toBe('fallback.jpg');
    });

    it('should handle unicode filenames', () => {
      const result = sanitizeFilename('写真.jpg', 'fb');
      expect(result).toBe('写真.jpg');
    });
  });

  describe('ALLOWED_IMAGE_MIME_TYPES', () => {
    it('should include common image types', () => {
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/png');
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/webp');
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/gif');
    });

    it('should not include SVG (potential XSS vector)', () => {
      expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain('image/svg+xml');
    });
  });
});
