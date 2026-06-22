import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
  // Clear localStorage
  localStorage.clear();
  // Clear all mocks
  vi.clearAllMocks();
});

// Mock window.location
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    origin: 'http://localhost:5173',
    pathname: '/',
    search: '',
    hash: '',
  },
});

// Mock window.history
Object.defineProperty(window, 'history', {
  writable: true,
  value: {
    replaceState: vi.fn(),
    pushState: vi.fn(),
  },
});

