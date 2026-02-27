import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, testEncryption } from './encryption.js';

describe('encryption', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env for each test — encryption module reads env at call time
    process.env = { ...originalEnv };
    // Provide a valid 32-char encryption key for tests
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars!!!!';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('encrypt/decrypt roundtrip', () => {
    it('should encrypt and decrypt a simple string', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt an empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt unicode text', () => {
      const plaintext = '日本語テスト 🎉 émojis and àccénts';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt a long string', () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for the same plaintext (random IV/salt)', () => {
      const plaintext = 'Same input twice';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce base64-encoded output', () => {
      const encrypted = encrypt('test');
      // Valid base64 should re-encode to the same string
      expect(Buffer.from(encrypted, 'base64').toString('base64')).toBe(encrypted);
    });
  });

  describe('tampered ciphertext', () => {
    it('should throw when ciphertext is tampered with', () => {
      const encrypted = encrypt('secret data');
      const buffer = Buffer.from(encrypted, 'base64');
      // Flip a byte in the encrypted portion (past salt + iv + tag)
      const tamperIndex = buffer.length - 1;
      buffer[tamperIndex] = buffer[tamperIndex] ^ 0xff;
      const tampered = buffer.toString('base64');
      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw when auth tag is tampered with', () => {
      const encrypted = encrypt('secret data');
      const buffer = Buffer.from(encrypted, 'base64');
      // Tamper with the auth tag region (bytes 80-96: salt=64 + iv=16 = 80, tag=16)
      buffer[80] = buffer[80] ^ 0xff;
      const tampered = buffer.toString('base64');
      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw for completely invalid base64 data', () => {
      expect(() => decrypt('not-valid-encrypted-data')).toThrow();
    });

    it('should throw for truncated ciphertext', () => {
      const encrypted = encrypt('test');
      const truncated = encrypted.substring(0, 10);
      expect(() => decrypt(truncated)).toThrow();
    });
  });

  describe('encryption key handling', () => {
    it('should use custom ENCRYPTION_KEY when set', () => {
      process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456'; // exactly 32
      const plaintext = 'test with custom key';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw when ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is required');
    });

    it('should throw when ENCRYPTION_KEY is too short', () => {
      process.env.ENCRYPTION_KEY = 'short';
      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be at least 32 characters');
    });
  });

  describe('testEncryption', () => {
    it('should return true when encryption works correctly', () => {
      expect(testEncryption()).toBe(true);
    });
  });
});
