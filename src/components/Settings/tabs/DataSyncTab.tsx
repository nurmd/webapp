import React, { useState } from 'react';
import { PouchSyncState, DEFAULT_COUCHDB_REMOTE_URL, SyncConflict, pouch } from '../../../services/pouchdb.ts';

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
}) => {
  const activeConflicts = propConflicts ?? syncState?.conflicts ?? [];

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
              <span className="text-[11px] text-on-surface-variant truncate">
                Last Synced: {lastProfileSyncTime} • All counter devices paired
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
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-on-secondary flex-shrink-0 shadow-sm ${
              syncState.status === 'error'
                ? 'bg-error text-on-error'
                : syncState.status === 'syncing' || syncState.status === 'connecting'
                ? 'bg-amber-500 text-white'
                : 'bg-secondary text-on-secondary'
            }`}>
              <span className={`material-symbols-outlined text-[22px] ${
                syncState.status === 'syncing' || syncState.status === 'connecting' ? 'animate-spin' : ''
              }`}>
                {syncState.status === 'error'
                  ? 'cloud_off'
                  : syncState.status === 'syncing' || syncState.status === 'connecting'
                  ? 'sync'
                  : syncState.status === 'synced' && syncState.remoteUrl
                  ? 'cloud_done'
                  : 'offline_pin'}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-sm font-bold text-on-secondary-container truncate">
                  Store Data Protected
                </span>
                {syncState.remoteUrl ? (
                  syncState.status === 'synced' ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-secondary text-on-secondary text-[10px] font-bold uppercase tracking-wider">
                      Cloud Synced
                    </span>
                  ) : syncState.status === 'syncing' ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider">
                      Syncing...
                    </span>
                  ) : syncState.status === 'connecting' ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider">
                      Connecting...
                    </span>
                  ) : syncState.status === 'error' ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-error text-on-error text-[10px] font-bold uppercase tracking-wider">
                      Sync Error
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md bg-surface-variant text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
                      Local only
                    </span>
                  )
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-surface-variant text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
                    Local only
                  </span>
                )}
              </div>
              <span className="text-[11px] text-on-secondary-container/80 truncate">
                {syncState.status === 'error'
                  ? syncState.error || 'Sync error: check remote CouchDB connection or permissions'
                  : (syncState.status === 'synced' || syncState.status === 'syncing') && syncState.remoteUrl
                  ? 'Continuous 2-Way CouchDB Multi-Device Sync Active'
                  : '100% Offline-First IndexedDB Storage Ready'}
              </span>
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
            {handlePopulateDemoData && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-lowest/80 border border-secondary/20">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-on-surface">Local Demo Dataset</span>
                  <span className="text-[10px] text-on-surface-variant">
                    Populate sample items, parties, invoices, and vouchers locally
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="populate-demo-data-btn"
                  disabled={isPopulatingDemo}
                  onClick={handlePopulateDemoData}
                  className="px-2.5 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs disabled:opacity-50 transition-colors shrink-0"
                  title="Populate demo invoices, purchases, items, parties and accounting records locally"
                >
                  <span className={`material-symbols-outlined text-[14px] ${isPopulatingDemo ? 'animate-spin' : ''}`}>
                    {isPopulatingDemo ? 'progress_activity' : 'dataset'}
                  </span>
                  <span>{isPopulatingDemo ? 'Populating...' : 'Populate Demo Data'}</span>
                </button>
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
              {syncState.remoteUrl && (
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
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  }`}
                >
                  {activeConflicts.length > 0
                    ? `${activeConflicts.length} Unresolved Conflict${activeConflicts.length > 1 ? 's' : ''}`
                    : '0 Conflicts • Verified Clean'}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant truncate">
                PouchDB _rev branch resolution &amp; multi-terminal concurrent mutation safety
              </span>
            </div>
          </div>

          {activeConflicts.length > 0 && (
            <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
              Action required
            </span>
          )}
        </div>

        {activeConflicts.length > 0 ? (
          <div className="flex flex-col gap-3 pt-2 border-t border-outline-variant/15">
            {activeConflicts.map((conflict) => (
              <div
                key={conflict.id}
                data-testid={`conflict-item-${conflict.docId}`}
                className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-[10px] font-mono font-bold uppercase">
                      {conflict.docType}
                    </span>
                    <span className="text-xs font-bold text-on-surface truncate">
                      {conflict.entityId}
                    </span>
                  </div>
                  <span className="text-[10px] text-on-surface-variant font-mono">
                    {conflict.detectedAt ? new Date(conflict.detectedAt).toLocaleTimeString() : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/20 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-on-surface">Version A (Winning / Local)</span>
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        {conflict.winningRev ? conflict.winningRev.slice(0, 8) + '...' : 'rev-1'}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant font-mono truncate">
                      Updated: {conflict.winningDoc?.updatedAt || 'N/A'}
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
                      <span className="text-[11px] font-bold text-on-surface">Version B (Conflicting / Remote)</span>
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        {conflict.conflictingRev ? conflict.conflictingRev.slice(0, 8) + '...' : 'rev-2'}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant font-mono truncate">
                      Updated: {conflict.conflictingDoc?.updatedAt || 'N/A'}
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
              </div>
            ))}
          </div>
        ) : (
          <div className="pt-2 border-t border-outline-variant/15 flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
            <span>No revision conflicts detected across devices. Multi-terminal sync state is clean.</span>
          </div>
        )}
      </section>
    </div>
  );
};
