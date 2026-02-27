import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeFireAndForget } from './safe-notify.js';

describe('safeFireAndForget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when promise resolves', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    safeFireAndForget(Promise.resolve('ok'), 'TEST_OK');

    // Give microtask a chance to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(spy).not.toHaveBeenCalled();
  });

  it('logs structured JSON when promise rejects with an Error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    safeFireAndForget(
      Promise.reject(new Error('boom')),
      'TEST_REJECT',
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged).toEqual({
      level: 'error',
      action: 'TEST_REJECT',
      error: 'boom',
    });
  });

  it('logs structured JSON when promise rejects with a non-Error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    safeFireAndForget(
      Promise.reject('string-error'),
      'TEST_STRING',
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.error).toBe('Unknown error');
  });

  it('falls back to plain string when JSON.stringify throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Force JSON.stringify to throw on first call (the structured log)
    const originalStringify = JSON.stringify;
    let callCount = 0;
    vi.spyOn(JSON, 'stringify').mockImplementation((...args) => {
      callCount++;
      if (callCount === 1) throw new Error('stringify failed');
      return originalStringify(...args);
    });

    safeFireAndForget(
      Promise.reject(new Error('original')),
      'TEST_STRINGIFY_FAIL',
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toBe(
      '[TEST_STRINGIFY_FAIL] notification failed (logging also failed)',
    );
  });
});
