import packageJson from '../../package.json';
import { db } from './db.ts';
import { pouch } from './pouchdb.ts';
import type { PouchSyncState, SyncConflict } from './pouchdb.ts';
import {
  buildSupportDiagnostics,
  serializeSupportDiagnostics,
  generateSupportDiagnosticsFilename,
  type SupportDiagnosticsBundle,
  type SupportDiagnosticsConflictItem,
} from '../core/utils/supportDiagnostics.ts';

export interface CollectDiagnosticsOptions {
  syncState?: PouchSyncState | null;
  conflicts?: SyncConflict[] | SupportDiagnosticsConflictItem[];
  activeDbName?: string;
  isDemoMode?: boolean;
  isRemoteDbActive?: boolean;
}

export interface SupportDiagnosticsDownloadResult {
  success: boolean;
  filename: string;
  cancelled?: boolean;
  native?: boolean;
  message?: string;
}

/**
 * Safely invokes a database collection getter, returning 0 on any error.
 * Prevents UI freezes or exceptions if a table or mock is uninitialized.
 */
function safeRecordCount(getter: () => unknown): number {
  try {
    const res = getter();
    if (Array.isArray(res)) return res.length;
    if (res && typeof res === 'object') {
      return Object.keys(res).length > 0 ? 1 : 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Gathers a local-only diagnostics bundle without any network calls,
 * CouchDB writes, or conflict mutations.
 */
export function collectSupportDiagnostics(
  options: CollectDiagnosticsOptions = {}
): SupportDiagnosticsBundle {
  // Safe record counts from storage
  const company = safeRecordCount(() => db.getCompany());
  const parties = safeRecordCount(() => db.getParties());
  const items = safeRecordCount(() => db.getItems());
  const invoices = safeRecordCount(() => db.getInvoices());
  const purchases = safeRecordCount(() => db.getPurchases());
  const expenses = safeRecordCount(() => db.getExpenses());
  const vouchers = safeRecordCount(() => db.getVouchers());
  const bankAccounts = safeRecordCount(() => db.getBankAccounts());
  const cashBankTransactions = safeRecordCount(() => db.getCashBankTransactions());

  // Safe sync & conflict state from pouch or caller overrides
  let syncState: PouchSyncState | null = null;
  if (options.syncState !== undefined) {
    syncState = options.syncState;
  } else {
    try {
      syncState = pouch?.getSyncState?.() ?? null;
    } catch {
      syncState = null;
    }
  }

  let conflicts: SupportDiagnosticsConflictItem[] = [];
  if (options.conflicts !== undefined) {
    conflicts = (options.conflicts as unknown as SupportDiagnosticsConflictItem[]) || [];
  } else if (syncState?.conflicts) {
    conflicts = (syncState.conflicts as unknown as SupportDiagnosticsConflictItem[]) || [];
  }

  let activeDbName = 'default';
  if (options.activeDbName !== undefined) {
    activeDbName = options.activeDbName;
  } else {
    try {
      activeDbName = pouch?.getActiveDbName?.() || 'default';
    } catch {
      activeDbName = 'default';
    }
  }

  let isDemoMode = false;
  if (options.isDemoMode !== undefined) {
    isDemoMode = options.isDemoMode;
  } else {
    try {
      isDemoMode = Boolean(pouch?.isDemoMode?.());
    } catch {
      isDemoMode = false;
    }
  }

  let isRemoteDbActive = false;
  if (options.isRemoteDbActive !== undefined) {
    isRemoteDbActive = options.isRemoteDbActive;
  } else {
    try {
      isRemoteDbActive = Boolean(pouch?.isRemoteDbActive?.());
    } catch {
      isRemoteDbActive = false;
    }
  }

  const isAndroid = typeof window !== 'undefined' && Boolean((window as any).AndroidBridge);

  return buildSupportDiagnostics({
    app: {
      name: 'Vyapar Books',
      version: packageJson.version || '0.0.0',
      platform: isAndroid ? 'android' : 'web',
    },
    database: {
      activeDbName,
      isDemoMode,
      isRemoteDbActive,
    },
    sync: {
      status: syncState?.status || 'offline',
      remoteUrl: syncState?.remoteUrl || null,
      pendingChanges: syncState?.pendingChanges ?? 0,
      lastSyncedTime: syncState?.lastSyncedAt || null,
      error: syncState?.error || null,
      conflicts,
    },
    recordCounts: {
      company,
      parties,
      items,
      invoices,
      purchases,
      expenses,
      vouchers,
      bankAccounts,
      cashBankTransactions,
    },
  });
}

/**
 * Exports the diagnostics bundle cleanly and defensively.
 * - On Android: Reuses the existing native bridge (`AndroidBridge.downloadBackup` or `saveBackupWithPicker`),
 *   handling the asynchronous result via `window.onBackupSaveResult`.
 * - On Web: Falls back to offline JSON Blob anchor download with deferred 1000ms URL revocation.
 * Never throws synchronously; resolves with a structured SupportDiagnosticsDownloadResult.
 */
export async function downloadSupportDiagnostics(
  bundle?: SupportDiagnosticsBundle,
  timeoutMs = 120000
): Promise<SupportDiagnosticsDownloadResult> {
  const activeBundle = bundle || collectSupportDiagnostics();
  const filename = generateSupportDiagnosticsFilename(activeBundle.generatedAt);
  const jsonStr = serializeSupportDiagnostics(activeBundle);

  const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;
  const hasAndroidBridge = Boolean(
    bridge && (typeof bridge.downloadBackup === 'function' || typeof bridge.saveBackupWithPicker === 'function')
  );

  if (hasAndroidBridge) {
    const previousCallback = (window as any).onBackupSaveResult;

    return new Promise<SupportDiagnosticsDownloadResult>((resolve) => {
      let timer: any = null;
      let installedCallback: ((status: string, displayName?: string, message?: string) => void) | null = null;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        // Guard: Only restore or remove if window.onBackupSaveResult is still our exact installed callback.
        // Never delete or overwrite a newer callback installed by another action.
        if (installedCallback && (window as any).onBackupSaveResult === installedCallback) {
          if (previousCallback !== undefined) {
            (window as any).onBackupSaveResult = previousCallback;
          } else {
            try {
              delete (window as any).onBackupSaveResult;
            } catch {}
          }
        }
      };

      timer = setTimeout(() => {
        cleanup();
        resolve({
          success: false,
          filename,
          native: true,
          message: 'Timed out waiting for Android to save the diagnostics file.',
        });
      }, timeoutMs);

      installedCallback = (status: string, displayName?: string, message?: string) => {
        cleanup();
        const resolvedFilename = displayName || filename;
        if (status === 'SUCCESS') {
          resolve({
            success: true,
            filename: resolvedFilename,
            native: true,
          });
        } else if (status === 'CANCELLED') {
          resolve({
            success: false,
            cancelled: true,
            filename: resolvedFilename,
            native: true,
            message: message || 'Export cancelled.',
          });
        } else {
          resolve({
            success: false,
            filename: resolvedFilename,
            native: true,
            message: message || 'Failed to save diagnostics file on Android.',
          });
        }
      };

      (window as any).onBackupSaveResult = installedCallback;

      try {
        if (typeof bridge.downloadBackup === 'function') {
          bridge.downloadBackup(filename, jsonStr);
        } else if (typeof bridge.saveBackupWithPicker === 'function') {
          bridge.saveBackupWithPicker(filename, jsonStr);
        } else {
          cleanup();
          resolve({
            success: false,
            filename,
            native: true,
            message: 'Android backup export bridge not available.',
          });
        }
      } catch (err: any) {
        cleanup();
        resolve({
          success: false,
          filename,
          native: true,
          message: err?.message || 'Failed to invoke Android export bridge.',
        });
      }
    });
  }

  // Web / non-Android environment: fallback to Blob anchor download
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 1000);
    return { success: true, filename, native: false };
  }

  return { success: false, filename, native: false, message: 'No browser DOM or native export bridge available.' };
}

export class SupportDiagnosticsService {
  collectDiagnostics(options?: CollectDiagnosticsOptions): SupportDiagnosticsBundle {
    return collectSupportDiagnostics(options);
  }

  async downloadDiagnostics(
    bundle: SupportDiagnosticsBundle,
    timeoutMs?: number
  ): Promise<SupportDiagnosticsDownloadResult> {
    return downloadSupportDiagnostics(bundle, timeoutMs);
  }

  async exportDiagnostics(
    options?: CollectDiagnosticsOptions,
    timeoutMs?: number
  ): Promise<{
    bundle: SupportDiagnosticsBundle;
    filename: string;
    success: boolean;
    native?: boolean;
    cancelled?: boolean;
    message?: string;
  }> {
    const bundle = this.collectDiagnostics(options);
    const download = await this.downloadDiagnostics(bundle, timeoutMs);
    return {
      bundle,
      filename: download.filename,
      success: download.success,
      native: download.native,
      cancelled: download.cancelled,
      message: download.message,
    };
  }
}

export const supportDiagnosticsService = new SupportDiagnosticsService();
