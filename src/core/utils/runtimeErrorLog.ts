/**
 * Global runtime error logging utility.
 * Captures uncaught window errors, unhandled promise rejections, and React error boundary catches.
 * Persists up to 50 recent error records in localStorage under 'gst_runtime_errors'.
 * Guarantees never to throw.
 */

export interface RuntimeErrorEntry {
  time: string;
  type: 'error' | 'unhandledrejection' | 'react_error_boundary';
  message: string;
  stack?: string;
}

const STORAGE_KEY = 'gst_runtime_errors';
const MAX_LOG_ENTRIES = 50;

let isInstalled = false;

/**
 * Safely retrieve persisted runtime error logs.
 */
export function getRuntimeErrorLogs(): RuntimeErrorEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Safely clear runtime error logs.
 */
export function clearRuntimeErrorLogs(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Never throws
  }
}

/**
 * Safely log an error entry, capping the stored array at 50 items.
 */
export function logRuntimeError(
  entry: Omit<RuntimeErrorEntry, 'time'> & { time?: string }
): void {
  try {
    if (typeof localStorage === 'undefined') return;

    const current = getRuntimeErrorLogs();
    const item: RuntimeErrorEntry = {
      time: entry.time || new Date().toISOString(),
      type: entry.type,
      message: String(entry.message || 'Unknown error'),
      stack: entry.stack ? String(entry.stack) : undefined,
    };

    const updated = [...current, item];
    const capped =
      updated.length > MAX_LOG_ENTRIES ? updated.slice(-MAX_LOG_ENTRIES) : updated;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Never throw or crash the caller
  }
}

/**
 * Installs global event listeners on window for 'error' and 'unhandledrejection'.
 * Idempotent: safe to invoke multiple times without registering duplicate listeners.
 */
export function installGlobalErrorLogging(): void {
  try {
    if (typeof window === 'undefined') return;
    if (isInstalled || (window as unknown as { __gstErrorLoggingInstalled?: boolean }).__gstErrorLoggingInstalled) {
      return;
    }

    window.addEventListener('error', (event: ErrorEvent) => {
      try {
        logRuntimeError({
          type: 'error',
          message: event.message || event.error?.message || 'Script error',
          stack:
            event.error?.stack ||
            (event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined),
        });
      } catch {
        // Safe
      }
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason;
        const message =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'string'
              ? reason
              : JSON.stringify(reason);
        const stack = reason instanceof Error ? reason.stack : undefined;

        logRuntimeError({
          type: 'unhandledrejection',
          message: message || 'Unhandled Promise Rejection',
          stack,
        });
      } catch {
        // Safe
      }
    });

    isInstalled = true;
    (window as unknown as { __gstErrorLoggingInstalled?: boolean }).__gstErrorLoggingInstalled = true;
  } catch {
    // Never throw
  }
}
