import React from 'react';
import { PouchSyncState } from '../../../services/pouchdb.ts';

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
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* 1. Multi-Device Settings Synchronization Card */}
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
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-on-secondary flex-shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[22px]">cloud_done</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline-sm text-sm font-bold text-on-secondary-container truncate">
                Store Data Protected
              </span>
              <span className="text-[11px] text-on-secondary-container/80 truncate">
                {(syncState.status === 'synced' || syncState.status === 'syncing')
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

        {/* Collapsible Sync Settings */}
        {isSyncConfigOpen && (
          <div className="pt-2 border-t border-secondary/20 flex flex-col gap-2 animate-fade-in">
            <label className="text-[11px] font-bold text-on-secondary-container">
              Remote CouchDB / Cloudflare Tunnel URL:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                data-testid="sync-url-input"
                placeholder="https://admin:pass@sync.example.com/vyapar_store"
                value={syncUrlInput}
                onChange={(e) => setSyncUrlInput(e.target.value)}
                className="flex-1 bg-surface-container-lowest text-on-surface px-3 py-2 rounded-xl text-xs outline-none border border-outline-variant/30 font-mono"
              />
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
          </div>
        )}
      </section>
    </div>
  );
};
