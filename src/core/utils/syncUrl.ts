/**
 * Utility functions for CouchDB / PouchDB sync URL credential redaction and rotation support.
 */

/**
 * Redacts authentication credentials (username and/or password) embedded in a remote sync URL.
 * Guarantees:
 * - Credentials in `user:password@host` format are replaced with `***:***@host`.
 * - Credentials in `user@host` format are replaced with `***@host`.
 * - URLs without credentials pass through unchanged (aside from standard URL normalization).
 * - Malformed, invalid, or non-string inputs return a safe placeholder `[REDACTED_INVALID_URL]` and never throw.
 */
export function redactSyncUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '[REDACTED_INVALID_URL]';
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '[REDACTED_INVALID_URL]';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      if (parsed.password) {
        parsed.username = '***';
        parsed.password = '***';
      } else {
        parsed.username = '***';
      }
    }
    return parsed.toString();
  } catch {
    return '[REDACTED_INVALID_URL]';
  }
}
