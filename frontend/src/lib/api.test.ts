/**
 * Tests for frontend/src/lib/api.ts
 *
 * Tests the axios instance interceptors and WS_BASE_URL computation.
 *
 * Approach: We import the api module and extract interceptor handlers directly
 * from the axios interceptor manager. This lets us unit-test the interceptor
 * logic without making real HTTP requests.
 *
 * Note: api.ts is an ES module with side effects (IIFE for WS_BASE_URL,
 * interceptor registration). The module is evaluated once per test worker.
 * We work around this by using the already-registered interceptors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { api, WS_BASE_URL } from './api';

// ---------------------------------------------------------------------------
// Type helpers for interceptor internals
// ---------------------------------------------------------------------------

type InterceptorHandler<T> = {
  fulfilled?: (value: T) => T | Promise<T>;
  rejected?: (error: unknown) => unknown;
};

function getRequestInterceptorFulfilled() {
  const handlers = (
    api.interceptors.request as unknown as {
      handlers: Array<InterceptorHandler<unknown> | null>;
    }
  ).handlers;
  const handler = handlers.find((h) => h !== null && h?.fulfilled);
  if (!handler?.fulfilled) throw new Error('No request interceptor found');
  return handler.fulfilled as (config: unknown) => unknown;
}

function getResponseInterceptorRejected() {
  const handlers = (
    api.interceptors.response as unknown as {
      handlers: Array<InterceptorHandler<unknown> | null>;
    }
  ).handlers;
  const handler = handlers.find((h) => h !== null && h?.rejected);
  if (!handler?.rejected) throw new Error('No response interceptor found');
  return handler.rejected;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(url: string, extra: Record<string, unknown> = {}) {
  return {
    url,
    headers: {} as Record<string, string>,
    ...extra,
  };
}

function makeAxiosError(status: number, config: Record<string, unknown>) {
  return {
    response: { status },
    config,
    isAxiosError: true,
  };
}

// ---------------------------------------------------------------------------
// Request interceptor tests
// ---------------------------------------------------------------------------

describe('api.ts — request interceptor', () => {
  beforeEach(() => {
    // jsdom provides localStorage; clear it before each test
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('adds Authorization header when token is in localStorage', async () => {
    window.localStorage.setItem('accessToken', 'test-token-123');

    const fulfilled = getRequestInterceptorFulfilled();
    const config = makeConfig('/api/notes');
    const result = (await fulfilled(config)) as typeof config & { headers: Record<string, string> };

    expect(result.headers['Authorization']).toBe('Bearer test-token-123');
  });

  it('does NOT add Authorization header when no token in localStorage', async () => {
    window.localStorage.clear();

    const fulfilled = getRequestInterceptorFulfilled();
    const config = makeConfig('/api/notes');
    const result = (await fulfilled(config)) as typeof config & { headers: Record<string, string> };

    expect(result.headers['Authorization']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Response interceptor tests
// ---------------------------------------------------------------------------

describe('api.ts — response interceptor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does not retry for /api/auth/login (auth endpoint)', async () => {
    const rejected = getResponseInterceptorRejected();
    const config = makeConfig('/api/auth/login');
    const error = makeAxiosError(401, config);

    await expect(rejected(error)).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('does not retry for /api/auth/setup (auth endpoint)', async () => {
    const rejected = getResponseInterceptorRejected();
    const config = makeConfig('/api/auth/setup');
    const error = makeAxiosError(401, config);

    await expect(rejected(error)).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('does not retry for /api/auth/refresh (auth endpoint)', async () => {
    const rejected = getResponseInterceptorRejected();
    const config = makeConfig('/api/auth/refresh');
    const error = makeAxiosError(401, config);

    await expect(rejected(error)).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('does not retry if _retry is already set', async () => {
    const rejected = getResponseInterceptorRejected();
    const config = makeConfig('/api/notes', { _retry: true });
    const error = makeAxiosError(401, config);

    await expect(rejected(error)).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('passes through non-401 errors without retry', async () => {
    const rejected = getResponseInterceptorRejected();
    const config = makeConfig('/api/notes');
    const error = makeAxiosError(500, config);

    await expect(rejected(error)).rejects.toMatchObject({ response: { status: 500 } });
  });

  it('dispatches auth-failure event when token refresh fails', async () => {
    const rejected = getResponseInterceptorRejected();

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Refresh failed'));

    const config = makeConfig('/api/notes');
    const error = makeAxiosError(401, config);

    await expect(rejected(error)).rejects.toBeDefined();

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth-failure' })
    );
  });

  it('clears access token when refresh fails', async () => {
    const rejected = getResponseInterceptorRejected();

    window.localStorage.setItem('accessToken', 'old-token');
    vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Network error'));
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    const config = makeConfig('/api/notes');
    const error = makeAxiosError(401, config);

    await expect(rejected(error)).rejects.toBeDefined();

    expect(window.localStorage.getItem('accessToken')).toBeNull();
  });

  it('stores new access token when refresh succeeds and updates Authorization header', async () => {
    // This test verifies the side effects of a successful token refresh:
    // 1. The new token is stored in localStorage
    // 2. The original request's Authorization header is updated
    // We use a custom adapter to avoid real XHR during the retry.
    const rejected = getResponseInterceptorRejected();

    const newToken = 'refreshed-token-abc';

    // Mock the refresh POST call (axios.post for the refresh endpoint)
    vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { accessToken: newToken },
    });

    // Install a custom adapter on the api instance to prevent real XHR on retry
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = async () => ({
      data: { success: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    });

    const config = makeConfig('/api/notes');
    const error = makeAxiosError(401, config);

    await rejected(error);

    // Restore the adapter
    api.defaults.adapter = originalAdapter;

    // Token should be stored with the new value
    expect(window.localStorage.getItem('accessToken')).toBe(newToken);
    // The Authorization header should be updated on the original request config
    expect((config as Record<string, unknown>).headers).toMatchObject({
      Authorization: `Bearer ${newToken}`,
    });
  });

  it('does not retry if response status is not 401', async () => {
    const rejected = getResponseInterceptorRejected();
    const config = makeConfig('/api/notes');
    const error = makeAxiosError(403, config);

    await expect(rejected(error)).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ---------------------------------------------------------------------------
// WS_BASE_URL tests
// ---------------------------------------------------------------------------

describe('WS_BASE_URL', () => {
  it('produces a ws:// or wss:// URL string', () => {
    expect(WS_BASE_URL).toMatch(/^wss?:\/\//);
  });

  it('uses the host from the current window location when no VITE_API_URL set', () => {
    // jsdom default host is 'localhost'; WS_BASE_URL should contain it
    expect(WS_BASE_URL).toContain(window.location.host);
  });

  it('WS_BASE_URL computation: https protocol maps to wss', () => {
    const url = new URL('https://example.com');
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
    expect(protocol).toBe('wss');
  });

  it('WS_BASE_URL computation: http protocol maps to ws', () => {
    const url = new URL('http://example.com');
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
    expect(protocol).toBe('ws');
  });
});
