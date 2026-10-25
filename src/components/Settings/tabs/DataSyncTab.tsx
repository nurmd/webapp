import React, { useState, useEffect, useRef } from 'react';
import { PouchSyncState, DEFAULT_COUCHDB_REMOTE_URL, SyncConflict, pouch } from '../../../services/pouchdb.ts';
import {
  collectSupportDiagnostics,
  downloadSupportDiagnostics,
} from '../../../services/supportDiagnosticsService.ts';
import {
  computeConflictDiff,
  isHighRiskConflict,
} from '../../../services/conflictDiff.ts';

export type TruthfulSyncState = 'syncing' | 'online' | 'offline' | 'error' | 'paused' | 'pending' | 'conflict';

export interface TruthfulSyncStatusInfo {
  state: TruthfulSyncState;
  badgeLabel: string;
  badgeColorClass: string;
  iconName: string;
  iconContainerClass: string;
  isSpinning: boolean;
  description: string;
  formattedLastSynced: string;
  pendingChanges: number;
  conflictsCount: number;
}

export function formatLastSyncedTime(timestamp?: string | null): string {
  if (!timestamp || !timestamp.trim()) {
    return 'Never';
  }
  const clean = timestamp.trim();
  try {
    const date = new Date(clean);
    if (isNaN(date.getTime())) {
      return clean;
    }
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const timeStr = date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (isToday) {
      return `Today at ${timeStr}`;
    }
    const dateStr = date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return `${dateStr}, ${timeStr}`;
  } catch {
    return clean;
  }
}

export function formatConflictTimestamp(timestamp?: string | null): string {
  if (!timestamp || !timestamp.trim() || timestamp.trim().toUpperCase() === 'N/A') {
    return 'Timestamp unavailable';
  }
  const clean = timestamp.trim();
  const date = new Date(clean);
  if (isNaN(date.getTime())) {
    return 'Timestamp unavailable';
  }
  return formatLastSyncedTime(clean);
}

export function getConflictHumanLabel(conflict: SyncConflict): string | null {
  const doc = conflict.winningDoc || conflict.conflictingDoc;
  if (!doc) return null;
  const label =
    doc.businessName ||
    doc.tradeName ||
    doc.name ||
    doc.partyName ||
    doc.invoiceNumber ||
    doc.voucherNumber ||
    doc.accountName ||
    doc.title ||
    null;
  return typeof label === 'string' && label.trim() ? label.trim() : null;
}

export function deriveSyncStatus({
  syncState,
  conflicts,
  isSyncStarting = false,
  isDemoMode = false,
  isRemoteDbActive = false,
  hasSavedUrl = false,
  activeDbName,
  isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true,
}: {
  syncState?: PouchSyncState | null;
  conflicts?: SyncConflict[];
  isSyncStarting?: boolean;
  isDemoMode?: boolean;
  isRemoteDbActive?: boolean;
  hasSavedUrl?: boolean;
  activeDbName?: string;
  isOnline?: boolean;
}): TruthfulSyncStatusInfo {
  const activeConflicts = conflicts ?? syncState?.conflicts ?? [];
  const conflictsCount = Math.max(activeConflicts.length, syncState?.conflictsCount || 0);
  const pendingChanges = syncState?.pendingChanges || 0;
  const formattedLastSynced = formatLastSyncedTime(syncState?.lastSyncedAt);

  // 1. Demo Mode Sandbox
  if (isDemoMode) {
    return {
      state: 'paused',
      badgeLabel: `Demo Sandbox (${activeDbName || 'vyapar_demo'})`,
      badgeColorClass: 'bg-amber-500 text-white',
      iconName: 'dataset',
      iconContainerClass: 'bg-amber-500 text-white',
      isSpinning: false,
      description: 'Demo Sandbox: Changes are isolated to vyapar_demo and will not sync to cloud',
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // 2. Offline MUST win over a stale error string (device network disconnected)
  if (!isOnline) {
    return {
      state: 'offline',
      badgeLabel: 'Offline',
      badgeColorClass: 'bg-surface-variant text-on-surface-variant',
      iconName: 'cloud_off',
      iconContainerClass: 'bg-surface-variant text-on-surface-variant',
      isSpinning: false,
      description: 'Device is offline. Local changes will sync when reconnected.',
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // 3. Explicit Error State (when online)
  if (syncState?.status === 'error' || Boolean(syncState?.error)) {
    return {
      state: 'error',
      badgeLabel: 'Sync Error',
      badgeColorClass: 'bg-error text-on-error',
      iconName: 'cloud_off',
      iconContainerClass: 'bg-error text-on-error',
      isSpinning: false,
      description: syncState?.error || 'Sync error: check remote CouchDB connection or permissions',
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // 4. Sync In Progress (active replication or connecting)
  if (isSyncStarting || syncState?.status === 'syncing' || syncState?.status === 'connecting') {
    const isConnectingOnly = syncState?.status === 'connecting' && !isSyncStarting;
    return {
      state: 'syncing',
      badgeLabel: isConnectingOnly ? 'Connecting...' : 'Syncing...',
      badgeColorClass: 'bg-amber-500 text-white',
      iconName: 'sync',
      iconContainerClass: 'bg-amber-500 text-white',
      isSpinning: true,
      description: isConnectingOnly
        ? 'Connecting to remote CouchDB...'
        : 'Continuous 2-Way CouchDB Multi-Device Sync Active',
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // 5. Offline Primary (No cloud DB configured or offline local DB)
  if (!isRemoteDbActive || !hasSavedUrl) {
    return {
      state: 'offline',
      badgeLabel: 'Offline Primary',
      badgeColorClass: 'bg-surface-variant text-on-surface-variant',
      iconName: 'offline_pin',
      iconContainerClass: 'bg-surface-variant text-on-surface-variant',
      isSpinning: false,
      description: hasSavedUrl
        ? 'Offline Database Active (Cloud sync link saved)'
        : '100% Offline-First IndexedDB Storage Ready',
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // From here on: Cloud DB is configured & active, and device is online.

  // 6. Unresolved Conflicts: NEVER claim "Cloud Synced" while unresolved conflicts exist!
  if (conflictsCount > 0) {
    return {
      state: 'conflict',
      badgeLabel: 'Review Conflicts',
      badgeColorClass: 'bg-rose-500 text-white',
      iconName: 'warning',
      iconContainerClass: 'bg-rose-500 text-white',
      isSpinning: false,
      description: `${conflictsCount} conflict revision${conflictsCount > 1 ? 's require' : ' requires'} manual per-document review. Nothing will be auto-resolved.`,
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // From here on: Cloud DB is configured & active, and device is online.

  // 6. Paused/idle replication when status is explicitly 'offline' and no pending local changes
  if (syncState?.status === 'offline' && pendingChanges === 0) {
    return {
      state: 'paused',
      badgeLabel: 'Cloud Paused',
      badgeColorClass: 'bg-surface-variant text-on-surface-variant',
      iconName: 'pause_circle',
      iconContainerClass: 'bg-surface-variant text-on-surface-variant',
      isSpinning: false,
      description: 'Cloud Database Active (Sync paused / idle)',
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // 7. Pending changes > 0: do NOT claim Cloud Synced
  if (pendingChanges > 0) {
    return {
      state: 'pending',
      badgeLabel: 'Sync Pending',
      badgeColorClass: 'bg-amber-500 text-white',
      iconName: 'cloud_upload',
      iconContainerClass: 'bg-amber-500 text-white',
      isSpinning: false,
      description: `${pendingChanges} local change${pendingChanges > 1 ? 's' : ''} pending upload. Tap "Sync Now" to synchronize.`,
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // 8. Missing lastSyncedAt: do NOT claim Cloud Synced
  if (!syncState?.lastSyncedAt || !syncState.lastSyncedAt.trim()) {
    return {
      state: 'paused',
      badgeLabel: 'Sync Unverified',
      badgeColorClass: 'bg-amber-500 text-white',
      iconName: 'cloud_queue',
      iconContainerClass: 'bg-amber-500 text-white',
      isSpinning: false,
      description: 'No successful cloud sync has been recorded yet. Tap "Sync Now" to verify.',
      formattedLastSynced: 'Never',
      pendingChanges,
      conflictsCount,
    };
  }

  // 9. Stale lastSyncedAt (> 30 minutes old): do NOT claim Cloud Synced
  const syncDate = new Date(syncState.lastSyncedAt);
  const syncTimeMs = syncDate.getTime();
  const isStale = isNaN(syncTimeMs) || (Date.now() - syncTimeMs > 30 * 60 * 1000);

  if (isStale) {
    return {
      state: 'paused',
      badgeLabel: 'Check Sync',
      badgeColorClass: 'bg-amber-500 text-white',
      iconName: 'cloud_queue',
      iconContainerClass: 'bg-amber-500 text-white',
      isSpinning: false,
      description: `Last synced at ${formattedLastSynced}. Tap "Sync Now" to confirm cloud status.`,
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // 10. Verified recent clean sync (status synced, pendingChanges == 0, lastSyncedAt <= 30 mins)
  if (syncState?.status === 'synced') {
    return {
      state: 'online',
      badgeLabel: 'Cloud Synced',
      badgeColorClass: 'bg-secondary text-on-secondary',
      iconName: 'cloud_done',
      iconContainerClass: 'bg-secondary text-on-secondary',
      isSpinning: false,
      description: 'Continuous 2-Way CouchDB Multi-Device Sync Active',
      formattedLastSynced,
      pendingChanges,
      conflictsCount,
    };
  }

  // 11. Cloud DB configured & Online, fallback idle/paused
  return {
    state: 'paused',
    badgeLabel: 'Cloud Paused',
    badgeColorClass: 'bg-surface-variant text-on-surface-variant',
    iconName: 'pause_circle',
    iconContainerClass: 'bg-surface-variant text-on-surface-variant',
    isSpinning: false,
    description: 'Cloud Database Active (Sync paused / idle)',
    formattedLastSynced,
    pendingChanges,
    conflictsCount,
  };
}

export interface DataSyncTabProps {
  isSyncingProfile: boolean;
  lastProfileSyncTime: string;
  handleSyncAllSettingsAcrossDevices: () => void;
  profileSyncNotice: string | null;
  setIsPairQrModalOpen: (open: boolean) => void;
  setIsImportProfileModalOpen: (open: boolean) => void;
  syncState: PouchSyncState;
  handleSyncNow: () => void;
  isSyncStarting: boolean;
  isSyncConfigOpen: boolean;
  setIsSyncConfigOpen: (open: boolean) => void;
  syncUrlInput: string;
  setSyncUrlInput: (url: string) => void;
  handleConnectSync: () => void;
  handleStopSync: () => void;
  copiedSyncCode?: boolean;
  handleCopySyncCode?: () => void;
  onOpenDatabaseBackup?: () => void;
  handlePopulateDemoData?: () => void;
  isPopulatingDemo?: boolean;
  demoNotice?: string | null;
  conflicts?: SyncConflict[];
  handleResolveConflict?: (conflictId: string, choice: 'keep_winning' | 'keep_conflicting') => void;
  // Multi-DB isolation & switching
  activeDbName?: string;
  isDemoMode?: boolean;
  isRemoteDbActive?: boolean;
  savedRemoteUrl?: string;
  isOnline?: boolean;
  handleSwitchToOffline?: () => void;
  handleReconnectCloud?: () => void;
  handleExitDemoMode?: () => void;
}

export const DataSyncTab: React.FC<DataSyncTabProps> = ({
  isSyncingProfile,
  lastProfileSyncTime,
  handleSyncAllSettingsAcrossDevices,
  profileSyncNotice,
  setIsPairQrModalOpen,
  setIsImportProfileModalOpen,
  syncState,
  handleSyncNow,
  isSyncStarting,
  isSyncConfigOpen,
  setIsSyncConfigOpen,
  syncUrlInput,
  setSyncUrlInput,
  handleConnectSync,
  handleStopSync,
  copiedSyncCode,
  handleCopySyncCode,
  onOpenDatabaseBackup,
  handlePopulateDemoData,
  isPopulatingDemo = false,
  demoNotice = null,
  conflicts: propConflicts,
  handleResolveConflict,
  activeDbName,
  isDemoMode = false,
  isRemoteDbActive = false,
  savedRemoteUrl,
  isOnline: propIsOnline,
  handleSwitchToOffline,
  handleReconnectCloud,
  handleExitDemoMode,
}) => {
  const activeConflicts = propConflicts ?? syncState?.conflicts ?? [];
  const uniqueDocCount = new Set(activeConflicts.map((c) => c.docId || `${c.docType}:${c.entityId}`)).size;
  const hasSavedUrl = Boolean(
    syncState?.remoteUrl?.trim() ||
    savedRemoteUrl?.trim() ||
    (typeof (pouch as any)?.getStoredRemoteUrl === 'function' && (pouch as any).getStoredRemoteUrl()?.trim())
  );

  const [networkOnline, setNetworkOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [expandedConflicts, setExpandedConflicts] = useState<Record<string, boolean>>({});
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<{
    state: 'idle' | 'preparing' | 'success' | 'error';
    filename?: string;
    message?: string;
  }>({ state: 'idle' });

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleDownloadDiagnostics = async () => {
    try {
      setDiagnosticsStatus({ state: 'preparing', message: 'Preparing…' });
      const bundle = collectSupportDiagnostics({
        syncState,
        conflicts: activeConflicts,
        activeDbName,
        isDemoMode,
        isRemoteDbActive,
      });
      const res = await downloadSupportDiagnostics(bundle);
      if (!isMountedRef.current) return;
      if (res.success) {
        setDiagnosticsStatus({
          state: 'success',
          filename: res.filename,
          message: `Diagnostics bundle saved: ${res.filename}`,
        });
      } else if (res.cancelled) {
        setDiagnosticsStatus({
          state: 'error',
          message: res.message || 'Export cancelled.',
        });
      } else {
        setDiagnosticsStatus({
          state: 'error',
          message: res.message || 'Unable to save diagnostics file in this environment.',
        });
      }
    } catch {
      if (!isMountedRef.current) return;
      setDiagnosticsStatus({
        state: 'error',
        message: 'Failed to generate support diagnostics.',
      });
    }
  };

  const toggleConflictDetails = (conflictId: string) => {
    setExpandedConflicts((prev) => ({
      ...prev,
      [conflictId]: !prev[conflictId],
    }));
  };

  useEffect(() => {
    const onOnline = () => setNetworkOnline(true);
    const onOffline = () => setNetworkOnline(false);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }
  }, []);

  useEffect(() => {
    if (typeof (pouch as any)?.refreshConflicts === 'function') {
      pouch.refreshConflicts().catch(() => {});
    }
  }, []);

  const effectiveOnline = propIsOnline !== undefined ? propIsOnline : networkOnline;

  const derived = deriveSyncStatus({
    syncState,
    conflicts: activeConflicts,
    isSyncStarting,
    isDemoMode,
    isRemoteDbActive,
    hasSavedUrl,
    activeDbName,
    isOnline: effectiveOnline,
  });

  const [isProbing, setIsProbing] = useState(false);
  const [probeDiagnostic, setProbeDiagnostic] = useState<{
    ok: boolean;
    error?: string;
    details?: {
      dbName?: string;
      docCount?: number;
      canRead?: boolean;
      canWrite?: boolean;
    };
    testedAt?: string;
  } | null>(null);

  const handleTestConnection = async () => {
    const targetUrl = syncUrlInput?.trim();
    if (!targetUrl) return;
    setIsProbing(true);
    setProbeDiagnostic(null);
    try {
      if (typeof (pouch as any)?.probeRemoteConnection === 'function') {
        const result = await (pouch as any).probeRemoteConnection(targetUrl);
        setProbeDiagnostic({
          ok: result.ok,
          error: result.error,
          details: result.details,
          testedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        });
      }
    } catch (err: any) {
      setProbeDiagnostic({
        ok: false,
        error: err?.message || 'Connection test failed',
        testedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
    } finally {
      setIsProbing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Full Database Backup & Restore Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">database</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline-sm text-sm font-bold text-on-surface truncate">
                Full Database Backup &amp; Restore
              </span>
              <span className="text-[11px] text-on-surface-variant truncate">
                Complete offline JSON snapshot of bills, products, parties &amp; accounting ledger
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenDatabaseBackup}
            className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">cloud_download</span>
            <span>Backup / Restore</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-2 border-t border-outline-variant/15 text-on-surface-variant">
          <div className="flex items-center gap-1 text-secondary font-medium">
            <span className="material-symbols-outlined text-[15px]">verified</span>
            <span>100% Offline Snapshot</span>
          </div>
          <div className="flex items-center gap-1 text-secondary font-medium">
            <span className="material-symbols-outlined text-[15px]">shield</span>
            <span>Tamper-proof Checksum</span>
          </div>
          <div className="flex items-center gap-1 text-secondary font-medium">
            <span className="material-symbols-outlined text-[15px]">sync_alt</span>
            <span>Clean Overwrite &amp; Merge Modes</span>
          </div>
        </div>
      </section>

      {/* 2. Multi-Device Settings Synchronization Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-secondary/30 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center text-secondary flex-shrink-0">
              <span className={`material-symbols-outlined text-[22px] ${isSyncingProfile ? 'animate-spin' : ''}`}>
                sync
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-headline-sm text-sm font-bold text-on-surface">
                  Sync All Settings Across Devices
                </span>
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              </div>
              <span className="text-[11px] text-on-surface-variant truncate" data-testid="last-settings-sync-time">
                Settings last synced: {formatLastSyncedTime(lastProfileSyncTime)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSyncAllSettingsAcrossDevices}
            disabled={isSyncingProfile}
            className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${isSyncingProfile ? 'animate-spin' : ''}`}>
              sync
            </span>
            <span>{isSyncingProfile ? 'Syncing...' : 'Sync All Settings'}</span>
          </button>
        </div>

        {/* Sync Scope Indicator */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1 border-t border-outline-variant/15">
          <div className="flex items-center gap-1.5 text-secondary font-medium">
            <span className="material-symbols-outlined text-[15px]">check_circle</span>
            <span>Synced: Profile, Bank, UPI, Taxes, Alerts &amp; Lock</span>
          </div>
          <div className="flex items-center gap-1.5 text-outline font-medium">
            <span className="material-symbols-outlined text-[15px]">lock</span>
            <span>Local to Device: Thermal &amp; Printing Setup</span>
          </div>
        </div>

        {profileSyncNotice && (
          <div className="p-2.5 rounded-xl bg-secondary/10 border border-secondary/20 text-secondary text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{profileSyncNotice}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/15">
          <button
            type="button"
            onClick={() => setIsPairQrModalOpen(true)}
            className="flex-1 py-2 px-3 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">qr_code_2</span>
            <span>Pair via QR</span>
          </button>

          <button
            type="button"
            onClick={() => setIsImportProfileModalOpen(true)}
            className="flex-1 py-2 px-3 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">download</span>
            <span>Import Settings</span>
          </button>

          {handleCopySyncCode && (
            <button
              type="button"
              onClick={handleCopySyncCode}
              className="py-2 px-3 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center justify-center gap-1 hover:bg-surface-container-high transition-colors cursor-pointer"
              title="Copy base64 pairing string"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">
                {copiedSyncCode ? 'check' : 'content_copy'}
              </span>
              <span>{copiedSyncCode ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. Store Data Protected / CouchDB Continuous Cloud Sync Card */}
      <section className="bg-secondary-container/60 text-on-secondary-container rounded-2xl p-4 sm:p-5 shadow-sm border border-secondary/20 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-on-secondary flex-shrink-0 shadow-sm ${derived.iconContainerClass}`}>
              <span className={`material-symbols-outlined text-[22px] ${derived.isSpinning ? 'animate-spin' : ''}`}>
                {derived.iconName}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-headline-sm text-sm font-bold text-on-secondary-container truncate">
                  Store Data Protected
                </span>
                <span
                  data-testid="sync-status-badge"
                  data-sync-state={derived.state}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${derived.badgeColorClass}`}
                >
                  {derived.badgeLabel}
                </span>
                {derived.pendingChanges > 0 && (
                  <span
                    data-testid="sync-pending-badge"
                    className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-900 dark:text-amber-200 text-[10px] font-bold"
                  >
                    {derived.pendingChanges} Pending
                  </span>
                )}
                {activeConflicts.length > 0 && (
                  <span
                    data-testid="sync-conflicts-notice-badge"
                    className="px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-900 dark:text-rose-200 text-[10px] font-bold"
                  >
                    {activeConflicts.length} Conflict Revision{activeConflicts.length > 1 ? 's' : ''} ({uniqueDocCount} Document{uniqueDocCount > 1 ? 's' : ''}) • Review Required
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-on-secondary-container/80 pt-0.5">
                <span data-testid="last-couchdb-sync-time" className="font-medium">
                  Last Synced: {derived.formattedLastSynced}
                </span>
                <span>•</span>
                <span className="truncate">{derived.description}</span>
                {derived.pendingChanges > 0 && (
                  <>
                    <span>•</span>
                    <span data-testid="sync-pending-changes" className="text-amber-800 dark:text-amber-200 font-semibold">
                      {derived.pendingChanges} local change{derived.pendingChanges > 1 ? 's' : ''} pending
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleSyncNow}
              className="px-3 py-1.5 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm active:scale-95 transition-transform cursor-pointer"
            >
              {isSyncStarting ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              type="button"
              onClick={() => setIsSyncConfigOpen(!isSyncConfigOpen)}
              className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center text-on-secondary-container hover:bg-secondary/25 transition-colors cursor-pointer"
              title="Configure Remote CouchDB URL"
              aria-label="Configure Sync"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
            </button>
          </div>
        </div>

        {/* Sync Error Diagnostic Banner */}
        {syncState.error && (
          <div
            data-testid="sync-error-banner"
            className="p-3 rounded-xl bg-error/15 border border-error/30 text-error text-xs flex items-start gap-2.5 animate-fade-in"
          >
            <span className="material-symbols-outlined text-[20px] text-error flex-shrink-0 mt-0.5">
              error
            </span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-bold">Sync Error / Push Failure</span>
              <span className="text-[11px] leading-relaxed break-words font-mono">
                {syncState.error}
              </span>
              <span className="text-[10px] opacity-80 mt-0.5">
                Ensure remote CouchDB credentials are valid, database is writable, and CORS is enabled.
              </span>
            </div>
          </div>
        )}

        {demoNotice && (
          <div className="p-2.5 rounded-xl bg-secondary/15 border border-secondary/30 text-on-secondary-container text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <span className="material-symbols-outlined text-[18px]">info</span>
            <span>{demoNotice}</span>
          </div>
        )}

        {/* Collapsible Sync Settings */}
        {isSyncConfigOpen && (
          <div className="pt-2 border-t border-secondary/20 flex flex-col gap-2.5 animate-fade-in">
            {/* Local Database Mode Switcher */}
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-surface-container-lowest/80 border border-secondary/20">
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-bold text-on-surface">Active Local Database</span>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  {activeDbName || 'vyapar_fintech_store'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isRemoteDbActive && handleSwitchToOffline && (
                  <button
                    type="button"
                    data-testid="switch-to-offline-btn"
                    onClick={handleSwitchToOffline}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-bold flex items-center gap-1 hover:bg-surface-container-high transition-colors cursor-pointer"
                    title="Switch to offline primary database (vyapar_fintech_store). Saved remote link is preserved."
                  >
                    <span className="material-symbols-outlined text-[14px]">cloud_off</span>
                    <span>Use offline database</span>
                  </button>
                )}
                {!isRemoteDbActive && !isDemoMode && hasSavedUrl && handleReconnectCloud && (
                  <button
                    type="button"
                    data-testid="reconnect-cloud-btn"
                    onClick={handleReconnectCloud}
                    className="px-2.5 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold flex items-center gap-1 hover:bg-secondary/90 transition-colors cursor-pointer"
                    title="Reconnect to cloud-synced database"
                  >
                    <span className="material-symbols-outlined text-[14px]">cloud_sync</span>
                    <span>Reconnect cloud</span>
                  </button>
                )}
                {isDemoMode && handleExitDemoMode && (
                  <button
                    type="button"
                    data-testid="exit-demo-mode-btn"
                    onClick={handleExitDemoMode}
                    className="px-2.5 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold flex items-center gap-1 hover:bg-secondary/90 transition-colors cursor-pointer"
                    title="Exit demo sandbox and return to your live business data"
                  >
                    <span className="material-symbols-outlined text-[14px]">exit_to_app</span>
                    <span>Return to Live Data</span>
                  </button>
                )}
              </div>
            </div>

            {handlePopulateDemoData && !isDemoMode && (
              <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-surface-container-lowest/80 border border-secondary/20">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-on-surface">Demo Sandbox Database</span>
                    <span className="text-[10px] text-on-surface-variant">
                      Explore sample items, parties, invoices, and vouchers in an isolated sandbox
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid="populate-demo-data-btn"
                    disabled={isPopulatingDemo}
                    onClick={handlePopulateDemoData}
                    className="px-2.5 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs disabled:opacity-50 transition-colors shrink-0"
                    title="Switch to isolated Demo Sandbox database"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${isPopulatingDemo ? 'animate-spin' : ''}`}>
                      {isPopulatingDemo ? 'progress_activity' : 'dataset'}
                    </span>
                    <span>{isPopulatingDemo ? 'Opening...' : 'Open Demo Sandbox'}</span>
                  </button>
                </div>
              </div>
            )}

            <label className="text-[11px] font-bold text-on-secondary-container">
              Remote CouchDB / Cloudflare Tunnel URL:
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                data-testid="sync-url-input"
                placeholder={DEFAULT_COUCHDB_REMOTE_URL || 'https://user:pass@couchdb.yourdomain.com/database'}
                value={syncUrlInput}
                onChange={(e) => setSyncUrlInput(e.target.value)}
                className="flex-1 min-w-[200px] bg-surface-container-lowest text-on-surface px-3 py-2 rounded-xl text-xs outline-none border border-outline-variant/30 font-mono"
              />
              <button
                type="button"
                data-testid="test-sync-connection-btn"
                disabled={isProbing || !syncUrlInput.trim()}
                onClick={handleTestConnection}
                className="px-3 py-2 bg-secondary/20 text-on-secondary-container border border-secondary/30 rounded-xl text-xs font-bold hover:bg-secondary/30 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[14px] ${isProbing ? 'animate-spin' : ''}`}>
                  {isProbing ? 'progress_activity' : 'network_check'}
                </span>
                <span>{isProbing ? 'Testing...' : 'Test Connection'}</span>
              </button>
              <button
                type="button"
                onClick={handleConnectSync}
                className="px-3 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-bold cursor-pointer"
              >
                Connect
              </button>
              {hasSavedUrl && (
                <button
                  type="button"
                  onClick={handleStopSync}
                  className="px-3 py-2 bg-error text-on-error rounded-xl text-xs font-bold cursor-pointer"
                >
                  Disconnect
                </button>
              )}
            </div>

            <p className="text-[10px] text-on-secondary-container/70 leading-relaxed">
              This link is saved on the device and restored automatically after app updates. Full database backups also include it.
            </p>

            {/* Probe Diagnostic Output Card */}
            {probeDiagnostic && (
              <div
                data-testid="sync-probe-diagnostic"
                className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 animate-fade-in ${
                  probeDiagnostic.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-error/10 border-error/30 text-error'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="material-symbols-outlined text-[16px]">
                      {probeDiagnostic.ok ? 'verified' : 'cancel'}
                    </span>
                    <span>
                      {probeDiagnostic.ok ? 'Connection & Write Probe Verified' : 'Probe Failed'}
                    </span>
                  </div>
                  {probeDiagnostic.testedAt && (
                    <span className="text-[10px] opacity-75 font-mono">
                      {probeDiagnostic.testedAt}
                    </span>
                  )}
                </div>

                {probeDiagnostic.error && (
                  <p className="text-[11px] font-mono leading-relaxed">{probeDiagnostic.error}</p>
                )}

                {probeDiagnostic.details && (
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-medium pt-1 border-t border-current/10">
                    <div>Database: <span className="font-mono">{probeDiagnostic.details.dbName || 'N/A'}</span></div>
                    <div>Docs: <span className="font-mono">{probeDiagnostic.details.docCount ?? 'N/A'}</span></div>
                    <div>Read Reachability: <span className="font-bold">{probeDiagnostic.details.canRead ? 'OK' : 'Failed'}</span></div>
                    <div>Write Permissions: <span className="font-bold">{probeDiagnostic.details.canWrite ? 'OK (Writable)' : 'Failed (Read-Only/Forbidden)'}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Sync Conflict Queue Card */}
      <section
        data-testid="sync-conflict-queue-section"
        className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                activeConflicts.length > 0
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {activeConflicts.length > 0 ? 'warning' : 'rule'}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-sm font-bold text-on-surface truncate">
                  Revision Conflict Queue
                </span>
                <span
                  data-testid="conflict-queue-badge"
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeConflicts.length > 0
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  }`}
                >
                  {activeConflicts.length > 0
                    ? `${activeConflicts.length} Unresolved Conflict${activeConflicts.length > 1 ? 's' : ''} (${uniqueDocCount} Document${uniqueDocCount > 1 ? 's' : ''})`
                    : '0 Conflicts • Verified Clean'}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant truncate">
                {activeConflicts.length > 0
                  ? `${activeConflicts.length} conflicting revision branch${activeConflicts.length > 1 ? 'es' : ''} across ${uniqueDocCount} document${uniqueDocCount > 1 ? 's' : ''}. Select a version to retain for each document.`
                  : 'PouchDB _rev branch resolution & multi-terminal concurrent mutation safety'}
              </span>
            </div>
          </div>

          {activeConflicts.length > 0 && (
            <span
              data-testid="conflict-review-required-label"
              className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[15px]">rate_review</span>
              <span>Review required</span>
            </span>
          )}
        </div>

        {activeConflicts.length > 0 ? (
          <div className="flex flex-col gap-3 pt-2 border-t border-outline-variant/15">
            {activeConflicts.map((conflict) => {
              const humanLabel = getConflictHumanLabel(conflict);
              const isExpanded = Boolean(expandedConflicts[conflict.id]);

              return (
                <div
                  key={conflict.id}
                  data-testid={`conflict-item-${conflict.docId}`}
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-[10px] font-mono font-bold uppercase">
                        {conflict.docType}
                      </span>
                      <span className="text-xs font-bold text-on-surface truncate font-mono">
                        {conflict.entityId}
                      </span>
                      {humanLabel && (
                        <span
                          data-testid={`conflict-label-${conflict.docId}`}
                          className="text-xs font-semibold text-on-surface-variant truncate"
                        >
                          • {humanLabel}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      data-testid={`conflict-details-toggle-${conflict.id}`}
                      aria-expanded={isExpanded}
                      onClick={() => toggleConflictDetails(conflict.id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                      <span>{isExpanded ? 'Hide details' : 'View details'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/20 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-on-surface">Version A (Winning Revision)</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">
                          {conflict.winningRev ? conflict.winningRev.slice(0, 8) + '...' : 'rev-1'}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant font-mono truncate">
                        Updated: {formatConflictTimestamp(conflict.winningDoc?.updatedAt || conflict.winningDoc?.syncedAt || conflict.winningDoc?.createdAt)}
                      </p>
                      <button
                        type="button"
                        data-testid={`resolve-winning-${conflict.docId}`}
                        onClick={() => handleResolveConflict && handleResolveConflict(conflict.id, 'keep_winning')}
                        className="mt-1 px-2.5 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity"
                      >
                        Keep Version A
                      </button>
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/20 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-on-surface">Version B (Conflicting Revision)</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">
                          {conflict.conflictingRev ? conflict.conflictingRev.slice(0, 8) + '...' : 'rev-2'}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant font-mono truncate">
                        Updated: {formatConflictTimestamp(conflict.conflictingDoc?.updatedAt || conflict.conflictingDoc?.syncedAt || conflict.conflictingDoc?.createdAt)}
                      </p>
                      <button
                        type="button"
                        data-testid={`resolve-conflicting-${conflict.docId}`}
                        onClick={() => handleResolveConflict && handleResolveConflict(conflict.id, 'keep_conflicting')}
                        className="mt-1 px-2.5 py-1.5 rounded-lg bg-outline-variant/50 text-on-surface text-xs font-bold cursor-pointer hover:bg-outline-variant transition-colors"
                      >
                        Keep Version B
                      </button>
                    </div>
                  </div>

                  {isExpanded && (() => {
                    const diffResult = computeConflictDiff(conflict.winningDoc, conflict.conflictingDoc);
                    const isHighRisk = isHighRiskConflict(conflict);

                    return (
                      <div
                        data-testid={`conflict-details-${conflict.id}`}
                        className="pt-2.5 border-t border-amber-500/20 flex flex-col gap-2.5 text-xs"
                      >
                        {isHighRisk && (
                          <div
                            data-testid={`conflict-risk-caution-${conflict.id}`}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] font-medium"
                          >
                            <span className="material-symbols-outlined text-[15px] text-amber-600 dark:text-amber-400 shrink-0">
                              warning
                            </span>
                            <span>
                              High-risk entity ({conflict.docType}): Review differences carefully before choosing a winning revision to avoid data loss.
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg bg-surface-container/60 border border-outline-variant/15 text-[11px]">
                          <div>
                            <span className="font-bold text-on-surface-variant block text-[10px] uppercase tracking-wide">
                              Full Document ID
                            </span>
                            <span className="font-mono text-on-surface break-all select-all">
                              {conflict.docId}
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-on-surface-variant block text-[10px] uppercase tracking-wide">
                              Detected At
                            </span>
                            <span className="font-mono text-on-surface">
                              {formatConflictTimestamp(conflict.detectedAt)}
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-on-surface-variant block text-[10px] uppercase tracking-wide">
                              Full Winning Revision (A)
                            </span>
                            <span className="font-mono text-on-surface break-all select-all">
                              {conflict.winningRev || 'Unavailable'}
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-on-surface-variant block text-[10px] uppercase tracking-wide">
                              Full Conflicting Revision (B)
                            </span>
                            <span className="font-mono text-on-surface break-all select-all">
                              {conflict.conflictingRev || 'Unavailable'}
                            </span>
                          </div>
                        </div>

                        {!diffResult.isAvailable ? (
                          <div
                            data-testid={`conflict-details-unavailable-${conflict.id}`}
                            className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2"
                          >
                            <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0">
                              error
                            </span>
                            <span>
                              {diffResult.unavailableReason || 'Document revision bodies are unavailable for comparison.'}
                            </span>
                          </div>
                        ) : !diffResult.hasDifferences ? (
                          <div
                            data-testid={`conflict-details-empty-${conflict.id}`}
                            className="p-3 rounded-lg bg-surface-container/50 border border-outline-variant/20 text-on-surface-variant text-xs flex items-center gap-2"
                          >
                            <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                              info
                            </span>
                            <span>No field-level differences; branches differ only in revision metadata.</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider">
                                Changed Fields ({diffResult.differences.length})
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {diffResult.differences.map((diff) => (
                                <div
                                  key={diff.field}
                                  data-testid={`conflict-detail-field-${conflict.id}-${diff.field}`}
                                  className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/20 flex flex-col gap-1.5"
                                >
                                  <span className="text-xs font-mono font-bold text-on-surface">
                                    {diff.field}
                                  </span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <div className="p-2 rounded bg-surface/80 border border-outline-variant/15 flex flex-col gap-1">
                                      <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">
                                        Version A
                                      </span>
                                      {diff.isWinningObject ? (
                                        <pre className="text-[11px] font-mono text-on-surface overflow-x-auto max-h-48 whitespace-pre-wrap break-all bg-surface-container-highest/40 p-1.5 rounded">
                                          {diff.winningFormatted}
                                        </pre>
                                      ) : (
                                        <span className="text-[11px] font-mono text-on-surface break-all">
                                          {diff.winningFormatted}
                                        </span>
                                      )}
                                    </div>
                                    <div className="p-2 rounded bg-surface/80 border border-outline-variant/15 flex flex-col gap-1">
                                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                                        Version B
                                      </span>
                                      {diff.isConflictingObject ? (
                                        <pre className="text-[11px] font-mono text-on-surface overflow-x-auto max-h-48 whitespace-pre-wrap break-all bg-surface-container-highest/40 p-1.5 rounded">
                                          {diff.conflictingFormatted}
                                        </pre>
                                      ) : (
                                        <span className="text-[11px] font-mono text-on-surface break-all">
                                          {diff.conflictingFormatted}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="pt-2 border-t border-outline-variant/15 flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
            <span>No revision conflicts detected across devices. Multi-terminal sync state is clean.</span>
          </div>
        )}
      </section>

      {/* 4. Support Diagnostics Card */}
      <section
        data-testid="support-diagnostics-section"
        className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col gap-4 shadow-sm"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">troubleshoot</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">Support Diagnostics</h3>
              <p className="text-xs text-on-surface-variant">
                Export an offline-only diagnostic bundle to share with technical support.
              </p>
            </div>
          </div>
          <button
            data-testid="download-support-diagnostics"
            onClick={handleDownloadDiagnostics}
            disabled={diagnosticsStatus.state === 'preparing'}
            className="px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-on-surface text-xs font-semibold flex items-center gap-2 border border-outline-variant/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">
              {diagnosticsStatus.state === 'preparing' ? 'hourglass_empty' : 'download'}
            </span>
            <span>{diagnosticsStatus.state === 'preparing' ? 'Preparing…' : 'Export Diagnostics'}</span>
          </button>
        </div>

        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          This local-only diagnostic bundle excludes credentials, document bodies, business identifiers, and local paths. It is never uploaded automatically and remains on your device until you choose to share it.
        </p>

        {diagnosticsStatus.state !== 'idle' && (
          <div
            data-testid="support-diagnostics-status"
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              diagnosticsStatus.state === 'preparing'
                ? 'bg-blue-50/50 border-blue-200 text-blue-900 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-300'
                : diagnosticsStatus.state === 'success'
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300'
                : 'bg-red-50/50 border-red-200 text-red-900 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {diagnosticsStatus.state === 'preparing'
                ? 'sync'
                : diagnosticsStatus.state === 'success'
                ? 'check_circle'
                : 'error'}
            </span>
            <span className="font-mono text-[11px]">
              {diagnosticsStatus.message}
            </span>
          </div>
        )}
      </section>
    </div>
  );
};
