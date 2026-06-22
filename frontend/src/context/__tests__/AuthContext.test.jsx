import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { supabase } from '../../services/supabaseClient';
import realScanService from '../../services/realScanService';

// Mock dependencies
vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock('../../services/realScanService', () => ({
  default: {
    setAccessToken: vi.fn(),
  },
}));

vi.mock('../../services/databaseService', () => ({
  default: {
    setAccessToken: vi.fn(),
  },
}));

// Force auth ON for these tests. In OSS mode AUTH_ENABLED is false (no env),
// which makes AuthProvider render the disabled variant that never touches
// Supabase. These tests verify the enabled provider's event handling, so we
// enable the flag and provide a Supabase URL (stubbed in beforeEach).
vi.mock('../../utils/featureFlags', () => ({
  AUTH_ENABLED: true,
  HISTORY_ENABLED: true,
  CLOUD_MODE: true,
}));

// Test component that uses auth
const TestComponent = () => {
  const { user, session, isAuthenticated, accessToken } = useAuth();
  return (
    <div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <div data-testid="session">{session ? 'has-session' : 'no-session'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</div>
      <div data-testid="token">{accessToken || 'no-token'}</div>
    </div>
  );
};

describe('AuthContext', () => {
  let mockUnsubscribe;
  let mockOnAuthStateChange;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // The enabled provider only subscribes / loads a session when a Supabase
    // URL is configured. Provide one for the duration of each test.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');

    mockUnsubscribe = vi.fn();
    mockOnAuthStateChange = vi.fn((callback) => {
      // Store callback for manual triggering
      mockOnAuthStateChange.callback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: mockUnsubscribe,
          },
        },
      };
    });
    
    supabase.auth.onAuthStateChange = mockOnAuthStateChange;
    supabase.auth.getSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('SIGNED_IN event', () => {
    it('updates session and user state', async () => {
      const mockSession = {
        access_token: 'token123',
        user: {
          id: 'user123',
          email: 'test@example.com',
          user_metadata: { full_name: 'Test User' },
        },
      };

      const { getByTestId } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      // Trigger SIGNED_IN event
      mockOnAuthStateChange.callback('SIGNED_IN', mockSession);

      await waitFor(() => {
        expect(getByTestId('user')).toHaveTextContent('test@example.com');
        expect(getByTestId('session')).toHaveTextContent('has-session');
        expect(getByTestId('authenticated')).toHaveTextContent('yes');
        expect(getByTestId('token')).toHaveTextContent('token123');
      });
    });

    it('sets token in realScanService on SIGNED_IN', async () => {
      const mockSession = {
        access_token: 'token123',
        user: { id: 'user123', email: 'test@example.com' },
      };

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      mockOnAuthStateChange.callback('SIGNED_IN', mockSession);

      await waitFor(() => {
        expect(realScanService.setAccessToken).toHaveBeenCalledWith('token123');
      });
    });
  });

  describe('TOKEN_REFRESHED event', () => {
    it('updates token in realScanService', async () => {
      const initialSession = {
        access_token: 'old-token',
        user: { id: 'user123', email: 'test@example.com' },
      };

      const refreshedSession = {
        access_token: 'new-token',
        user: { id: 'user123', email: 'test@example.com' },
      };

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      // Initial sign in
      mockOnAuthStateChange.callback('SIGNED_IN', initialSession);

      await waitFor(() => {
        expect(realScanService.setAccessToken).toHaveBeenCalledWith('old-token');
      });

      vi.clearAllMocks();

      // Token refresh
      mockOnAuthStateChange.callback('TOKEN_REFRESHED', refreshedSession);

      await waitFor(() => {
        expect(realScanService.setAccessToken).toHaveBeenCalledWith('new-token');
      });
    });
  });

  describe('SIGNED_OUT event', () => {
    it('clears session and user', async () => {
      const mockSession = {
        access_token: 'token123',
        user: { id: 'user123', email: 'test@example.com' },
      };

      const { getByTestId } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      // Sign in
      mockOnAuthStateChange.callback('SIGNED_IN', mockSession);

      await waitFor(() => {
        expect(getByTestId('authenticated')).toHaveTextContent('yes');
      });

      // Sign out
      mockOnAuthStateChange.callback('SIGNED_OUT', null);

      await waitFor(() => {
        expect(getByTestId('authenticated')).toHaveTextContent('no');
        expect(getByTestId('session')).toHaveTextContent('no-session');
        expect(getByTestId('user')).toHaveTextContent('no-user');
      });
    });

    it('clears token in realScanService on SIGNED_OUT', async () => {
      const mockSession = {
        access_token: 'token123',
        user: { id: 'user123', email: 'test@example.com' },
      };

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      mockOnAuthStateChange.callback('SIGNED_IN', mockSession);

      await waitFor(() => {
        expect(realScanService.setAccessToken).toHaveBeenCalledWith('token123');
      });

      mockOnAuthStateChange.callback('SIGNED_OUT', null);

      await waitFor(() => {
        expect(realScanService.setAccessToken).toHaveBeenCalledWith(null);
      });
    });
  });

  describe('cleanup on unmount', () => {
    it('unsubscribes from auth state changes', async () => {
      const { unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(supabase.auth.onAuthStateChange).toHaveBeenCalled();
      });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});

