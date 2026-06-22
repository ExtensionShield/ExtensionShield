import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import AuthCallbackPage from '../AuthCallbackPage';

// Mock supabase: callback page no longer calls exchangeCodeForSession; it waits for
// onAuthStateChange(SIGNED_IN) or getSession() returning a session.
const mockUnsubscribe = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args) => {
        mockOnAuthStateChange(...args);
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
      getSession: () => mockGetSession(),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      return [params];
    },
  };
});

const sessionStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    window.location.search = '';
    window.location.hash = '';
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
  });

  const renderComponent = (searchParams = '', hash = '') => {
    window.location.search = searchParams;
    window.location.hash = hash;
    return render(
      <HelmetProvider>
        <BrowserRouter>
          <AuthCallbackPage />
        </BrowserRouter>
      </HelmetProvider>
    );
  };

  describe('successful authentication', () => {
    it('waits for session then redirects to stored returnTo', async () => {
      sessionStorageMock.setItem('auth:returnTo', '/scan?x=1');
      const mockSession = {
        access_token: 'token123',
        user: { id: 'user123', email: 'test@example.com' },
      };
      mockGetSession.mockResolvedValue({ data: { session: mockSession } });

      renderComponent('?code=abc123');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/scan?x=1', { replace: true });
      });

      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('auth:returnTo');
    });

    it('redirects to home when no returnTo stored', async () => {
      const mockSession = {
        access_token: 'token123',
        user: { id: 'user123', email: 'test@example.com' },
      };
      mockGetSession.mockResolvedValue({ data: { session: mockSession } });

      renderComponent('?code=abc123');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      });
    });

    it.skip('redirects on SIGNED_IN from onAuthStateChange', async () => {
      sessionStorageMock.setItem('auth:returnTo', '/scan');
      mockGetSession.mockResolvedValue({ data: { session: null } });

      renderComponent('?code=abc123');

      expect(mockOnAuthStateChange).toHaveBeenCalled();
      const callback = mockOnAuthStateChange.mock.calls[0][0];
      const mockSession = { access_token: 't', user: { id: 'u', email: 'e@e.com' } };
      callback('SIGNED_IN', mockSession);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/scan', { replace: true });
      }, { timeout: 2000 });
    });
  });

  describe('no code and no hash', () => {
    it('redirects to returnTo without error', async () => {
      sessionStorageMock.setItem('auth:returnTo', '/');

      renderComponent('');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
      });
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('authError'), expect.anything());
    });
  });

  describe('OAuth provider errors', () => {
    it('handles error from provider', async () => {
      renderComponent('?error=access_denied&error_description=User%20cancelled');

      await waitFor(() => {
        expect(screen.getByText(/authentication failed|user cancelled/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('authError'), { replace: true });
      }, { timeout: 3000 });
    });

    it('shows error description when provided', async () => {
      renderComponent('?error=access_denied&error_description=User%20cancelled');

      await waitFor(() => {
        const errorText = screen.getByText(/user cancelled/i);
        expect(errorText).toBeInTheDocument();
      });
    });
  });

  describe('timeout when session never arrives', () => {
    it.skip('shows retry message after 10s timeout', async () => {
      sessionStorageMock.setItem('auth:returnTo', '/');
      mockGetSession.mockResolvedValue({ data: { session: null } });

      renderComponent('?code=abc123');

      await waitFor(
        () => {
          expect(screen.getByText(/sign-in couldn't be completed|try again/i)).toBeInTheDocument();
        },
        { timeout: 12000 }
      );
    }, 15000);
  });

  describe('sessionStorage usage', () => {
    it('reads and clears returnTo on success', async () => {
      sessionStorageMock.setItem('auth:returnTo', '/scan');
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 't', user: { id: 'u', email: 'e@e.com' } } },
      });

      renderComponent('?code=abc123');

      await waitFor(() => {
        expect(sessionStorageMock.getItem).toHaveBeenCalledWith('auth:returnTo');
        expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('auth:returnTo');
      }, { timeout: 2000 });
    });
  });
});
