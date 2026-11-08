import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppErrorBoundary } from '../components/Common/AppErrorBoundary.tsx';
import {
  installGlobalErrorLogging,
  logRuntimeError,
  getRuntimeErrorLogs,
  clearRuntimeErrorLogs,
} from '../core/utils/runtimeErrorLog.ts';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });

// Component that conditionally throws
const ThrowingChild: React.FC<{ shouldThrow?: boolean; message?: string }> = ({
  shouldThrow,
  message = 'Intentional render crash',
}) => {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div data-testid="safe-child-content">Safe Content Loaded</div>;
};

describe('AppErrorBoundary & RuntimeErrorLog Suite', () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
    clearRuntimeErrorLogs();
  });

  describe('AppErrorBoundary Component', () => {
    it('renders child normally when no error occurs', async () => {
      await act(async () => {
        root.render(
          <AppErrorBoundary>
            <ThrowingChild shouldThrow={false} />
          </AppErrorBoundary>
        );
      });

      expect(container.querySelector('[data-testid="safe-child-content"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="app-error-boundary-fallback"]')).toBeNull();
    });

    it('renders full-screen fallback UI when child component throws', async () => {
      await act(async () => {
        root.render(
          <AppErrorBoundary>
            <ThrowingChild shouldThrow={true} message="Critical UI explosion" />
          </AppErrorBoundary>
        );
      });

      const fallback = container.querySelector('[data-testid="app-error-boundary-fallback"]');
      expect(fallback).toBeTruthy();

      // App name & short explanation
      expect(fallback?.textContent).toContain('Vyapar Books');
      expect(fallback?.textContent).toContain('Something went wrong');
      expect(fallback?.textContent).toContain('An unexpected error occurred');

      // Reload App button
      const reloadBtn = container.querySelector('[data-testid="error-reload-btn"]') as HTMLButtonElement;
      expect(reloadBtn).toBeTruthy();
      expect(reloadBtn.textContent).toContain('Reload App');

      // Copy Error Details button
      const copyBtn = container.querySelector('[data-testid="error-copy-btn"]') as HTMLButtonElement;
      expect(copyBtn).toBeTruthy();
      expect(copyBtn.textContent).toContain('Copy Error Details');

      // Collapsible error stack
      const collapsible = container.querySelector('[data-testid="error-details-collapsible"]');
      expect(collapsible).toBeTruthy();
      expect(collapsible?.textContent).toContain('Critical UI explosion');

      // Error logged into localStorage
      const logs = getRuntimeErrorLogs();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const reactLog = logs.find((l) => l.type === 'react_error_boundary');
      expect(reactLog).toBeDefined();
      expect(reactLog?.message).toContain('Critical UI explosion');
    });

    it('triggers window.location.reload when reload button is clicked', async () => {
      const reloadMock = vi.fn();
      const originalLocation = window.location;
      // Object.defineProperty to mock location.reload
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, reload: reloadMock },
        writable: true,
        configurable: true,
      });

      await act(async () => {
        root.render(
          <AppErrorBoundary>
            <ThrowingChild shouldThrow={true} />
          </AppErrorBoundary>
        );
      });

      const reloadBtn = container.querySelector('[data-testid="error-reload-btn"]') as HTMLButtonElement;
      await act(async () => {
        reloadBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(reloadMock).toHaveBeenCalledTimes(1);
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    });

    it('renders custom fallback when provided via prop', async () => {
      await act(async () => {
        root.render(
          <AppErrorBoundary fallback={<div data-testid="custom-boundary-fallback">Custom Crash View</div>}>
            <ThrowingChild shouldThrow={true} />
          </AppErrorBoundary>
        );
      });

      expect(container.querySelector('[data-testid="custom-boundary-fallback"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="app-error-boundary-fallback"]')).toBeNull();
    });
  });

  describe('runtimeErrorLog Utility & Capping', () => {
    it('caps stored entries strictly at 50 keeping newest records (FIFO)', () => {
      clearRuntimeErrorLogs();
      expect(getRuntimeErrorLogs()).toEqual([]);

      // Log 60 errors
      for (let i = 1; i <= 60; i++) {
        logRuntimeError({
          type: 'error',
          message: `Error number ${i}`,
        });
      }

      const logs = getRuntimeErrorLogs();
      expect(logs).toHaveLength(50);
      // First entry should be error 11 (oldest 10 dropped)
      expect(logs[0].message).toBe('Error number 11');
      // Last entry should be error 60
      expect(logs[49].message).toBe('Error number 60');
    });

    it('never throws even if localStorage data is corrupted or invalid', () => {
      localStorage.setItem('gst_runtime_errors', 'INVALID_JSON_CORRUPTION{{[');
      expect(() => getRuntimeErrorLogs()).not.toThrow();
      expect(getRuntimeErrorLogs()).toEqual([]);

      expect(() => {
        logRuntimeError({
          type: 'unhandledrejection',
          message: 'Safe rejection log',
        });
      }).not.toThrow();

      const logs = getRuntimeErrorLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Safe rejection log');
    });

    it('installGlobalErrorLogging is idempotent and safe to invoke multiple times', () => {
      expect(() => {
        installGlobalErrorLogging();
        installGlobalErrorLogging();
        installGlobalErrorLogging();
      }).not.toThrow();
    });

    it('listens and logs window error events', () => {
      clearRuntimeErrorLogs();
      installGlobalErrorLogging();

      const errorEvent = new ErrorEvent('error', {
        message: 'Uncaught window error in worker',
        filename: 'worker.js',
        lineno: 42,
        colno: 7,
      });
      window.dispatchEvent(errorEvent);

      const logs = getRuntimeErrorLogs();
      const match = logs.find((l) => l.message === 'Uncaught window error in worker');
      expect(match).toBeDefined();
      expect(match?.type).toBe('error');
    });

    it('listens and logs unhandledrejection events', () => {
      clearRuntimeErrorLogs();
      installGlobalErrorLogging();

      const rejectionEvent = new CustomEvent('unhandledrejection', {
        bubbles: true,
        cancelable: true,
      }) as any;
      rejectionEvent.reason = new Error('Async network failure');

      window.dispatchEvent(rejectionEvent);

      const logs = getRuntimeErrorLogs();
      const match = logs.find((l) => l.message === 'Async network failure');
      expect(match).toBeDefined();
      expect(match?.type).toBe('unhandledrejection');
    });
  });
});
