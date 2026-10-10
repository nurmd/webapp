import React from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { PouchSyncState } from '../../services/pouchdb.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { DataSyncTab } from './tabs/DataSyncTab.tsx';
import { BillingInvoicesTab } from './tabs/BillingInvoicesTab.tsx';
import { AppPreferencesTab } from './tabs/AppPreferencesTab.tsx';

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
  allowNegativeStock?: boolean;
  handleToggleNegativeStock?: (allow: boolean) => void;
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
  allowNegativeStock = false,
  handleToggleNegativeStock,
}) => {
  return (
    <div className="flex flex-col gap-5">
      {/* 1. Data & Multi-Device Cloud Sync */}
      <DataSyncTab
        isSyncingProfile={isSyncingProfile}
        lastProfileSyncTime={lastProfileSyncTime}
        handleSyncAllSettingsAcrossDevices={handleSyncAllSettingsAcrossDevices}
        profileSyncNotice={profileSyncNotice}
        setIsPairQrModalOpen={setIsPairQrModalOpen}
        setIsImportProfileModalOpen={setIsImportProfileModalOpen}
        syncState={syncState}
        handleSyncNow={handleSyncNow}
        isSyncStarting={isSyncStarting}
        isSyncConfigOpen={isSyncConfigOpen}
        setIsSyncConfigOpen={setIsSyncConfigOpen}
        syncUrlInput={syncUrlInput}
        setSyncUrlInput={setSyncUrlInput}
        handleConnectSync={handleConnectSync}
        handleStopSync={handleStopSync}
      />

      {/* 2. GST & Legal Tax Configuration */}
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

        {/* Master GST Billing Toggle Card */}
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

        {/* Business GSTIN & State Tax Registration Card */}
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

        {/* Submodals: GST & Tax Rates, State & Place of Supply, E-Way Bill & E-Invoice */}
        <div className={`bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col ${
          !isGstActive ? 'opacity-65' : ''
        }`}>
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

      {/* 3. Billing & Invoices Tab */}
      <BillingInvoicesTab
        profile={profile}
        defaultPrintOption={defaultPrintOption}
        handleDefaultPrintOptionChange={handleDefaultPrintOptionChange}
        setIsQrModalOpen={() => {}}
        setActiveSubModal={setActiveSubModal}
      />

      {/* 4. App Preferences Tab */}
      <AppPreferencesTab
        appLanguage={appLanguage}
        setAppLanguage={setAppLanguage}
        isAppLockEnabled={isAppLockEnabled}
        setIsAppLockEnabled={setIsAppLockEnabled}
        CURRENT_APP_VERSION={CURRENT_APP_VERSION}
        updateStatusText={updateStatusText}
        handleCheckForUpdates={handleCheckForUpdates}
        isUpdateChecking={isUpdateChecking}
        setActiveSubModal={setActiveSubModal}
      />

      {/* 5. Inventory Stock & Buy Price Global Controls */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
        {handleToggleNegativeStock && (
          <div className="w-full p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">production_quantity_limits</span>
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="font-label-md text-sm font-bold text-on-surface">Allow Negative Stock</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-high text-on-surface-variant">Inventory Policy</span>
                </div>
                <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                  {allowNegativeStock
                    ? 'Allowed: Invoices can be created when stock is zero, tracking negative balances.'
                    : 'Blocked: Stock clamped to 0 and cannot drop below zero.'}
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={allowNegativeStock}
                onChange={(e) => handleToggleNegativeStock(e.target.checked)}
                className="sr-only peer"
                aria-label="Toggle Allow Negative Stock"
              />
              <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
            </label>
          </div>
        )}

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
      </section>
    </div>
  );
};
