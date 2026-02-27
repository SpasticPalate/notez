import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z, ZodError } from 'zod';
import { validateBody, validateQuery, validateParams } from './validate.middleware.js';

// Helper to create mock Fastify request
function createMockRequest(overrides: Partial<any> = {}): any {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

// Helper to create mock Fastify reply
function createMockReply(): any {
  const reply: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(body: any) {
      reply.body = body;
      return reply;
    },
  };
  return reply;
}

describe('validate.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── validateBody ─────────────────────────────────────────────────────
  describe('validateBody', () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().positive(),
    });

    it('should parse and mutate request.body on success', async () => {
      const middleware = validateBody(schema);
      const request = createMockRequest({ body: { name: 'Alice', age: 30 } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(request.body).toEqual({ name: 'Alice', age: 30 });
      expect(reply.statusCode).toBe(200); // no error response
    });

    it('should return 400 with details array on ZodError', async () => {
      const middleware = validateBody(schema);
      const request = createMockRequest({ body: { name: '', age: -5 } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error).toBe('Validation Error');
      expect(reply.body.message).toBe('Invalid request data');
      expect(Array.isArray(reply.body.details)).toBe(true);
      expect(reply.body.details.length).toBeGreaterThan(0);
      expect(reply.body.details[0]).toHaveProperty('path');
      expect(reply.body.details[0]).toHaveProperty('message');
    });

    it('should return 400 with generic message on non-Zod error', async () => {
      // Schema that throws a non-Zod error
      const badSchema = {
        parse: () => {
          throw new Error('Unexpected failure');
        },
      } as any;

      const middleware = validateBody(badSchema);
      const request = createMockRequest({ body: {} });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error).toBe('Validation Error');
      expect(reply.body.message).toBe('Invalid request data');
      expect(reply.body.details).toBeUndefined();
    });

    it('should not send error response when body is valid', async () => {
      const middleware = validateBody(schema);
      const request = createMockRequest({ body: { name: 'Bob', age: 25 } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.body).toBeNull(); // send() was never called
    });

    it('should handle nested Zod errors with dot-joined paths', async () => {
      const nestedSchema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      const middleware = validateBody(nestedSchema);
      const request = createMockRequest({ body: { user: { email: 'not-an-email' } } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      const emailError = reply.body.details.find((d: any) => d.path.includes('email'));
      expect(emailError).toBeDefined();
    });

    it('should coerce types according to schema when using z.coerce', async () => {
      const coerceSchema = z.object({ count: z.coerce.number() });
      const middleware = validateBody(coerceSchema);
      const request = createMockRequest({ body: { count: '42' } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(request.body).toEqual({ count: 42 });
    });
  });

  // ─── validateQuery ────────────────────────────────────────────────────
  describe('validateQuery', () => {
    const schema = z.object({
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().optional(),
    });

    it('should parse and mutate request.query on success', async () => {
      const middleware = validateQuery(schema);
      const request = createMockRequest({ query: { page: '1', limit: '10' } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(request.query).toEqual({ page: 1, limit: 10 });
      expect(reply.statusCode).toBe(200);
    });

    it('should return 400 with details on ZodError', async () => {
      const strictSchema = z.object({ page: z.number().int() });
      const middleware = validateQuery(strictSchema);
      const request = createMockRequest({ query: { page: 'not-a-number' } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error).toBe('Validation Error');
      expect(reply.body.message).toBe('Invalid query parameters');
      expect(Array.isArray(reply.body.details)).toBe(true);
    });

    it('should return 400 with generic message on non-Zod error', async () => {
      const badSchema = {
        parse: () => {
          throw new TypeError('Unexpected');
        },
      } as any;

      const middleware = validateQuery(badSchema);
      const request = createMockRequest({ query: {} });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.message).toBe('Invalid query parameters');
      expect(reply.body.details).toBeUndefined();
    });

    it('should allow optional fields to be absent', async () => {
      const middleware = validateQuery(schema);
      const request = createMockRequest({ query: {} });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body).toBeNull();
    });
  });

  // ─── validateParams ───────────────────────────────────────────────────
  describe('validateParams', () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    it('should parse and mutate request.params on success', async () => {
      const middleware = validateParams(schema);
      const request = createMockRequest({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(request.params).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
      expect(reply.statusCode).toBe(200);
    });

    it('should return 400 with details on ZodError', async () => {
      const middleware = validateParams(schema);
      const request = createMockRequest({ params: { id: 'not-a-uuid' } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error).toBe('Validation Error');
      expect(reply.body.message).toBe('Invalid route parameters');
      expect(Array.isArray(reply.body.details)).toBe(true);
    });

    it('should return 400 with generic message on non-Zod error', async () => {
      const badSchema = {
        parse: () => {
          throw new RangeError('Out of range');
        },
      } as any;

      const middleware = validateParams(badSchema);
      const request = createMockRequest({ params: { id: 'abc' } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.message).toBe('Invalid route parameters');
      expect(reply.body.details).toBeUndefined();
    });

    it('should include path in ZodError details', async () => {
      const middleware = validateParams(schema);
      const request = createMockRequest({ params: { id: 'bad-value' } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      const idError = reply.body.details.find((d: any) => d.path === 'id');
      expect(idError).toBeDefined();
    });

    it('should not call reply.send when params are valid', async () => {
      const spyReply = createMockReply();
      spyReply.send = vi.fn().mockReturnValue(spyReply);

      const middleware = validateParams(schema);
      const request = createMockRequest({
        params: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await middleware(request, spyReply);

      expect(spyReply.send).not.toHaveBeenCalled();
    });
  });
});
