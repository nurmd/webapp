import React from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { PouchSyncState } from '../../services/pouchdb.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';

export interface GeneralSettingsTabProps {
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
  CURRENT_APP_VERSION: string;
  updateStatusText: string | null;
  handleCheckForUpdates: () => void;
  isUpdateChecking: boolean;
  isGstActive: boolean;
  handleToggleGst: () => void;
  profile: CompanyProfile;
  setProfile: React.Dispatch<React.SetStateAction<CompanyProfile>>;
  onSave: (updated: CompanyProfile) => void;
  handleGstinChange: (gstin: string) => void;
  feedback: string | null;
  stateName: string;
  setSavedNotice: (saved: boolean) => void;
  appLanguage: 'English (India)' | 'हिंदी (Hindi)';
  setAppLanguage: (lang: 'English (India)' | 'हिंदी (Hindi)') => void;
  isAppLockEnabled: boolean;
  setIsAppLockEnabled: (enabled: boolean) => void;
  setActiveSubModal: (modal: string | null) => void;
  defaultPrintOption: string;
  handleDefaultPrintOptionChange: (opt: string) => void;
  showBuyPricesGlobally: boolean;
  handleToggleBuyPriceVisibility: (show: boolean) => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
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
  CURRENT_APP_VERSION,
  updateStatusText,
  handleCheckForUpdates,
  isUpdateChecking,
  isGstActive,
  handleToggleGst,
  profile,
  setProfile,
  onSave,
  handleGstinChange,
  feedback,
  stateName,
  setSavedNotice,
  appLanguage,
  setAppLanguage,
  isAppLockEnabled,
  setIsAppLockEnabled,
  setActiveSubModal,
  defaultPrintOption,
  handleDefaultPrintOptionChange,
  showBuyPricesGlobally,
  handleToggleBuyPriceVisibility,
}) => {
  return (
    <>
      {/* 2. Multi-Device Settings Synchronization Card (All Settings Except Printing) */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-secondary/30 flex flex-col gap-3">
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

        {/* Sync Scope Indicator: Everything synced except printing */}
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
        </div>
      </section>

      {/* 3. Store Data Protected / Sync Pulse Banner (Stitch Design) */}
      <section className="bg-secondary-container/60 text-on-secondary-container rounded-2xl p-4 shadow-sm border border-secondary/20 flex flex-col gap-3">
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

      {/* 3. In-App OTA Update Channel Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-secondary flex-shrink-0">
            <span className="material-symbols-outlined text-[22px]">system_update</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-headline-sm text-sm font-bold text-on-surface">App Updates &amp; OTA</span>
              <span className="bg-secondary text-on-secondary text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                v{CURRENT_APP_VERSION}
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant truncate">
              {updateStatusText || 'Automatic GitHub releases OTA channel'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCheckForUpdates}
          disabled={isUpdateChecking}
          className="px-3.5 py-2 bg-surface-container text-on-surface hover:bg-surface-container-high rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex-shrink-0 flex items-center gap-1 active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px]">
            {isUpdateChecking ? 'progress_activity' : 'refresh'}
          </span>
          <span>{isUpdateChecking ? 'Checking...' : 'Check Update'}</span>
        </button>
      </section>

      {/* GROUP 1: GST & Legal Tax Configuration */}
      <section id="gst-tax-config" className="flex flex-col gap-2.5 scroll-mt-20">
        <div className="px-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-secondary">tune</span>
            <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
              GST &amp; Legal Tax Configuration
            </h3>
          </div>
          <span className={`font-label-sm text-[11px] font-bold ${isGstActive ? 'text-secondary' : 'text-on-surface-variant'}`}>
            {isGstActive ? 'GST Mode: Regular' : 'GST Mode: Disabled'}
          </span>
        </div>

        {/* 1. Master GST Billing Toggle Card */}
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
              isGstActive ? 'bg-secondary/15 text-secondary' : 'bg-surface-container text-on-surface-variant'
            }`}>
              <span className="material-symbols-outlined text-[22px]">
                {isGstActive ? 'verified' : 'power_settings_new'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-label-md text-sm font-bold text-on-surface">Enable GST Billing</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isGstActive
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}>
                  {isGstActive ? 'Active' : 'Disabled'}
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                {isGstActive
                  ? 'Tax rates (CGST/SGST/IGST), GSTIN validation, HSN/SAC codes & E-Way bills active.'
                  : 'Tax calculations and tax tags hidden across the app. Generate clean direct bills.'}
              </p>
            </div>
          </div>

          {/* Interactive Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={isGstActive}
            onClick={() => handleToggleGst()}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
              isGstActive ? 'bg-secondary' : 'bg-surface-container-highest'
            }`}
            title={isGstActive ? 'Click to disable GST' : 'Click to enable GST'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                isGstActive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {!isGstActive && (
          <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] flex-shrink-0">info</span>
            <span>GST-related settings below are deactivated. Toggle switch above to activate GST compliance &amp; tax slabs.</span>
          </div>
        )}

        {/* 2. Business GSTIN & State Tax Registration Card */}
        <div className={`bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3.5 ${
          !isGstActive ? 'opacity-65' : ''
        }`}>
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">badge</span>
              <div>
                <h4 className="font-label-md text-sm font-bold text-on-surface">GSTIN &amp; Tax Registration</h4>
                <p className="font-body-sm text-[11px] text-on-surface-variant">Business GSTIN number, State Place of Supply &amp; Filing Scheme</p>
              </div>
            </div>
            {isGstActive && (
              <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
                Regular Taxpayer
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-bold text-on-surface block mb-1">
                GSTIN {isGstActive ? '(15 Digits)' : '(Disabled)'}
              </label>
              <input
                type="text"
                maxLength={15}
                disabled={!isGstActive}
                value={isGstActive ? profile.gstin : ''}
                placeholder={isGstActive ? '27AABCU9603R1ZN' : 'Disabled'}
                onChange={(e) => handleGstinChange(e.target.value)}
                className={`w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-mono font-bold uppercase outline-none focus:border-secondary ${
                  !isGstActive ? 'opacity-50 cursor-not-allowed bg-surface-container' : ''
                }`}
              />
              {isGstActive && feedback && (
                <p className="text-[10px] text-secondary font-medium mt-1">{feedback}</p>
              )}
            </div>

            <div>
              <label className="font-bold text-on-surface block mb-1">Default Place of Supply (POS) State</label>
              <select
                disabled={!isGstActive}
                value={profile.stateCode}
                onChange={(e) => {
                  const updated = { ...profile, stateCode: e.target.value };
                  setProfile(updated);
                  onSave(updated);
                  setSavedNotice(true);
                  setTimeout(() => setSavedNotice(false), 2000);
                }}
                className={`w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none focus:border-secondary ${
                  !isGstActive ? 'opacity-50 cursor-not-allowed bg-surface-container' : ''
                }`}
              >
                {getStateList().map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px] text-on-surface-variant flex-wrap gap-2">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-secondary">verified</span>
              {isGstActive ? `PAN: ${profile.pan || 'Extracted from GSTIN'} • State: ${stateName} (${profile.stateCode})` : 'Tax calculation disabled'}
            </span>
            {isGstActive && (
              <button
                type="button"
                onClick={() => {
                  onSave(profile);
                  setSavedNotice(true);
                  setTimeout(() => setSavedNotice(false), 2000);
                }}
                className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-bold text-[11px] hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                Save GSTIN
              </button>
            )}
          </div>
        </div>

        {/* 3. Items list: GST & Tax Rates, State & Place of Supply, E-Way Bill & E-Invoice */}
        <div className={`bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col ${
          !isGstActive ? 'opacity-65' : ''
        }`}>
          {/* Item 1: GST & Tax Rates */}
          <button
            type="button"
            onClick={() => setActiveSubModal('tax_rates')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isGstActive ? 'bg-surface-container text-on-surface' : 'bg-surface-container-low text-on-surface-variant'
            }`}>
              <span className="material-symbols-outlined text-[22px]">account_balance</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-label-md text-sm font-bold text-on-surface">GST &amp; Tax Rates</span>
                {!isGstActive && (
                  <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant text-[10px] font-bold">
                    Disabled
                  </span>
                )}
              </div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                {isGstActive
                  ? 'Slab rates 0%, 5%, 12%, 18%, 28% • RCM & Cess Ready'
                  : 'Standard slabs dormant while GST is disabled'}
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>

          {/* Item 2: State & Place of Supply */}
          <button
            type="button"
            onClick={() => setActiveSubModal('place_of_supply')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isGstActive ? 'bg-surface-container text-on-surface' : 'bg-surface-container-low text-on-surface-variant'
            }`}>
              <span className="material-symbols-outlined text-[22px]">map</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-label-md text-sm font-bold text-on-surface">State &amp; Place of Supply Rules</span>
                {!isGstActive && (
                  <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant text-[10px] font-bold">
                    Disabled
                  </span>
                )}
              </div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                {stateName} ({profile.stateCode}) • {isGstActive ? 'Auto CGST+SGST / IGST Engine' : 'Intra/Interstate tax engine paused'}
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>

          {/* Item 3: E-Way Bill & E-Invoice */}
          <button
            type="button"
            onClick={() => setActiveSubModal('eway_bill')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isGstActive ? 'bg-surface-container text-on-surface' : 'bg-surface-container-low text-on-surface-variant'
            }`}>
              <span className="material-symbols-outlined text-[22px]">local_shipping</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-label-md text-sm font-bold text-on-surface">E-Way Bill &amp; E-Invoice API</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  isGstActive
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}>
                  {isGstActive ? 'Active' : 'Disabled'}
                </span>
              </div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                {isGstActive
                  ? 'Threshold ₹50,000 • Official NIC Portal JSON v1.1'
                  : 'NIC JSON generation paused (Disabled)'}
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>
        </div>
      </section>

      {/* GROUP 2: Invoicing & Printing Setup (Stitch Design) */}
      <section className="flex flex-col gap-2">
        <div className="px-1">
          <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
            Billing &amp; Printing Setup
          </h3>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
          {/* Default Print Format Direct Toggle */}
          <div className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">print</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-label-md text-sm font-bold text-on-surface">Default Print Format</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-high text-on-surface-variant">Device Only</span>
                </div>
                <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                  Choose whether invoices open in A4 Laser or Thermal Slip by default
                </div>
              </div>
            </div>

            <div className="flex items-center bg-surface-container p-1 rounded-xl border border-outline-variant/30 gap-1 self-start sm:self-auto flex-wrap">
              {[
                { id: 'A4', label: 'A4 Laser', icon: 'description' },
                { id: 'Thermal-80mm', label: '3" (80mm)', icon: 'receipt_long' },
                { id: 'Thermal-58mm', label: '2" (58mm)', icon: 'receipt' },
              ].map((opt) => {
                const isSelected =
                  defaultPrintOption === opt.id ||
                  (opt.id === 'A4' && (!defaultPrintOption || defaultPrintOption === 'None'));
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleDefaultPrintOptionChange(opt.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thermal Printing Themes & Details Modal */}
          <button
            type="button"
            onClick={() => setActiveSubModal('printing')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">tune</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Invoice Themes &amp; Thermal Printing Details</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                Current Default: {defaultPrintOption === 'Thermal-58mm' ? '2-Inch (58mm) Thermal' : defaultPrintOption === 'Thermal-80mm' ? '3-Inch (80mm) Thermal' : 'Standard A4 Laser'}
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>

          {/* Invoice Series Numbering */}
          <button
            type="button"
            onClick={() => setActiveSubModal('prefix_series')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">pin</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Prefix &amp; Invoice Series</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                Prefix: {profile.invoicePrefix || 'INV-2024-'} • Retail POS &amp; Tax Bills
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>

          {/* Automated WhatsApp */}
          <button
            type="button"
            onClick={() => setActiveSubModal('whatsapp_alerts')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-secondary flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">chat</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Automated WhatsApp &amp; SMS Alerts</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                Instant bill PDF share • Dynamic UPI Payment Reminders
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>
        </div>
      </section>

      {/* GROUP 5: Device, Language & App Lock (Stitch Design) */}
      <section className="flex flex-col gap-2">
        <div className="px-1">
          <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
            Device, Privacy &amp; Preferences
          </h3>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
          {/* Language Selector */}
          <div className="w-full p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">translate</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-label-md text-sm font-bold text-on-surface">App Language</div>
                <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">{appLanguage}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {(['English (India)', 'हिंदी (Hindi)'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setAppLanguage(lang)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    appLanguage === lang
                      ? 'bg-secondary text-on-secondary shadow-sm'
                      : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {lang.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Buy Price Global Show / Hidden Privacy Toggle */}
          <div className="w-full p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">
                  {showBuyPricesGlobally ? 'visibility' : 'visibility_off'}
                </span>
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="font-label-md text-sm font-bold text-on-surface">Show Buy / Purchase Prices</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-high text-on-surface-variant">Device Only</span>
                </div>
                <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                  {showBuyPricesGlobally
                    ? 'Visible: Show purchase rates and valuation on this device'
                    : 'Hidden (***): Mask purchase rates to protect costs on this device'}
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={showBuyPricesGlobally}
                onChange={(e) => handleToggleBuyPriceVisibility(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
            </label>
          </div>

          {/* Biometric / PIN Lock Toggle */}
          <div className="w-full p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">fingerprint</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-label-md text-sm font-bold text-on-surface">App Lock &amp; 4-Digit PIN</div>
                <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                  Protect invoice deletions &amp; role switching with PIN
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={isAppLockEnabled}
                onChange={(e) => setIsAppLockEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
            </label>
          </div>
        </div>
      </section>
    </>
  );
};
