/**
 * Persistent storage helpers for OTA update auto-prompting.
 *
 * Enforces "prompt once per version" and "skip this version" preferences in localStorage.
 * Follows the direct localStorage + try/catch pattern used in runtimeErrorLog.ts.
 * Guarantees never to throw and performs zero database writes.
 */

export const OTA_SKIPPED_VERSION_KEY = 'vyapar_ota_skipped_version';
export const OTA_NOTIFIED_VERSION_KEY = 'vyapar_ota_notified_version';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage;
    }
  } catch {}
  return null;
}

function cleanVersionString(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed.replace(/^v/i, '') : null;
}

/**
 * Reads the version the user chose to skip, if any.
 * Returns clean version string (without 'v' prefix) or null.
 */
export function readSkippedOtaVersion(): string | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(OTA_SKIPPED_VERSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return cleanVersionString(parsed);
    } catch {
      // Raw string format
    }
    return cleanVersionString(raw);
  } catch {
    return null;
  }
}

/**
 * Persists the version the user chose to skip.
 * Passing null clears the stored preference.
 */
export function writeSkippedOtaVersion(version: string | null): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (version === null) {
      storage.removeItem(OTA_SKIPPED_VERSION_KEY);
    } else {
      const cleaned = cleanVersionString(version);
      if (cleaned) {
        storage.setItem(OTA_SKIPPED_VERSION_KEY, cleaned);
      } else {
        storage.removeItem(OTA_SKIPPED_VERSION_KEY);
      }
    }
  } catch {
    // Never throws
  }
}

/**
 * Reads the last version for which an auto-prompt notification was displayed.
 * Returns clean version string (without 'v' prefix) or null.
 */
export function readNotifiedOtaVersion(): string | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(OTA_NOTIFIED_VERSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return cleanVersionString(parsed);
    } catch {
      // Raw string format
    }
    return cleanVersionString(raw);
  } catch {
    return null;
  }
}

/**
 * Records that the auto-prompt notification was displayed for this version.
 * Passing null clears the record.
 */
export function writeNotifiedOtaVersion(version: string | null): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (version === null) {
      storage.removeItem(OTA_NOTIFIED_VERSION_KEY);
    } else {
      const cleaned = cleanVersionString(version);
      if (cleaned) {
        storage.setItem(OTA_NOTIFIED_VERSION_KEY, cleaned);
      } else {
        storage.removeItem(OTA_NOTIFIED_VERSION_KEY);
      }
    }
  } catch {
    // Never throws
  }
}

/**
 * Evaluates whether a newly detected OTA version should automatically trigger the popup prompt.
 *
 * Returns false if:
 * - targetVersion is empty or invalid
 * - targetVersion matches current running application version
 * - targetVersion matches the previously skipped version
 * - targetVersion matches the previously notified version
 *
 * Otherwise returns true.
 */
export function shouldAutoPromptOta(
  targetVersion: string | null | undefined,
  options?: { currentVersion?: string | null }
): boolean {
  const cleanTarget = cleanVersionString(targetVersion);
  if (!cleanTarget) return false;

  if (options?.currentVersion) {
    const cleanCurrent = cleanVersionString(options.currentVersion);
    if (cleanCurrent && cleanTarget === cleanCurrent) {
      return false;
    }
  }

  const skipped = readSkippedOtaVersion();
  if (skipped && cleanTarget === skipped) {
    return false;
  }

  const notified = readNotifiedOtaVersion();
  if (notified && cleanTarget === notified) {
    return false;
  }

  return true;
}

/**
 * Utility helper to clear both skipped and notified OTA preferences (useful in test teardown).
 */
export function clearOtaPromptStorage(): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(OTA_SKIPPED_VERSION_KEY);
    storage.removeItem(OTA_NOTIFIED_VERSION_KEY);
  } catch {
    // Never throws
  }
}
