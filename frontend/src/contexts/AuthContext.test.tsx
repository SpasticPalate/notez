/**
 * Tests for frontend/src/contexts/AuthContext.tsx
 *
 * Tests the AuthProvider component and useAuth hook.
 * Mocks the authApi module to avoid real HTTP calls.
 *
 * Uses vi.hoisted() to define mocks that are accessible inside vi.mock() factory,
 * which is hoisted to the top of the file by Vitest's transform.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';

// ---------------------------------------------------------------------------
// Hoist mock references so they're available when vi.mock factory runs
// ---------------------------------------------------------------------------

const { mockAuthApi } = vi.hoisted(() => {
  const mockAuthApi = {
    setupNeeded: vi.fn(),
    me: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  };
  return { mockAuthApi };
});

vi.mock('../lib/api', () => ({
  authApi: mockAuthApi,
}));

// ---------------------------------------------------------------------------
// Wrapper helper
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});

describe('AuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();

    // Default: setup is not needed, no valid auth token
    mockAuthApi.setupNeeded.mockResolvedValue({ data: { setupNeeded: false } });
    mockAuthApi.me.mockRejectedValue(new Error('Not authenticated'));
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('provides the expected context shape', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('setupNeeded');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('logout');
    expect(result.current).toHaveProperty('updateUser');
    expect(result.current).toHaveProperty('refreshAuth');
    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.updateUser).toBe('function');
    expect(typeof result.current.refreshAuth).toBe('function');
  });

  it('starts with isLoading=true, then becomes false after auth check', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('user is null when no access token in localStorage', async () => {
    window.localStorage.clear();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('sets user when access token exists and /api/auth/me succeeds', async () => {
    window.localStorage.setItem('accessToken', 'valid-token');

    const mockUser = {
      userId: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER',
    };
    mockAuthApi.me.mockResolvedValueOnce({ data: { user: mockUser } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('isAuthenticated is false when no user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('isAuthenticated is true when user is set', async () => {
    window.localStorage.setItem('accessToken', 'valid-token');
    mockAuthApi.me.mockResolvedValueOnce({
      data: {
        user: { userId: '1', username: 'u', email: 'e@e.com', role: 'USER' },
      },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  it('setupNeeded is true when API reports setup is needed', async () => {
    mockAuthApi.setupNeeded.mockResolvedValueOnce({ data: { setupNeeded: true } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.setupNeeded).toBe(true);
    // Should not have called me() since setup is needed
    expect(mockAuthApi.me).not.toHaveBeenCalled();
  });

  it('login stores token and sets user', async () => {
    const mockUser = {
      userId: 'user-2',
      username: 'loginuser',
      email: 'login@example.com',
      role: 'USER',
    };
    const accessToken = 'login-access-token';

    mockAuthApi.login.mockResolvedValueOnce({
      data: { accessToken, user: mockUser },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();

    await act(async () => {
      await result.current.login('loginuser', 'password123');
    });

    expect(window.localStorage.getItem('accessToken')).toBe(accessToken);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login calls authApi.login with correct credentials', async () => {
    mockAuthApi.login.mockResolvedValueOnce({
      data: {
        accessToken: 'tok',
        user: { userId: '1', username: 'u', email: 'u@u.com', role: 'USER' },
      },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('testuser@example.com', 'secret');
    });

    expect(mockAuthApi.login).toHaveBeenCalledWith({
      usernameOrEmail: 'testuser@example.com',
      password: 'secret',
    });
  });

  it('logout clears token and user', async () => {
    window.localStorage.setItem('accessToken', 'existing-token');
    const mockUser = { userId: '1', username: 'u', email: 'e@e.com', role: 'USER' };
    mockAuthApi.me.mockResolvedValueOnce({ data: { user: mockUser } });
    mockAuthApi.logout.mockResolvedValueOnce({});

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(window.localStorage.getItem('accessToken')).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logout clears state even when API call fails', async () => {
    window.localStorage.setItem('accessToken', 'existing-token');
    mockAuthApi.me.mockResolvedValueOnce({
      data: { user: { userId: '1', username: 'u', email: 'e@e.com', role: 'USER' } },
    });
    mockAuthApi.logout.mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(window.localStorage.getItem('accessToken')).toBeNull();

    consoleSpy.mockRestore();
  });

  it('clears user on auth-failure event', async () => {
    window.localStorage.setItem('accessToken', 'valid-token');
    mockAuthApi.me.mockResolvedValueOnce({
      data: { user: { userId: '1', username: 'u', email: 'e@e.com', role: 'USER' } },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    act(() => {
      window.dispatchEvent(new Event('auth-failure'));
    });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
    });
  });

  it('updateUser merges partial user data without losing other fields', async () => {
    window.localStorage.setItem('accessToken', 'valid-token');
    const mockUser = { userId: '1', username: 'original', email: 'e@e.com', role: 'USER' };
    mockAuthApi.me.mockResolvedValueOnce({ data: { user: mockUser } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user?.username).toBe('original');
    });

    act(() => {
      result.current.updateUser({ username: 'updated' });
    });

    expect(result.current.user?.username).toBe('updated');
    expect(result.current.user?.email).toBe('e@e.com');
    expect(result.current.user?.role).toBe('USER');
  });

  it('updateUser does nothing when user is null', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.updateUser({ username: 'ghost' });
    });

    expect(result.current.user).toBeNull();
  });
});
