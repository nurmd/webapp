import React, { useState, useEffect, useMemo } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { validateGstin } from '../../core/gst/validator.ts';
import { pouch, PouchSyncState } from '../../services/pouchdb.ts';
import { db } from '../../services/db.ts';
import { updateService, AppReleaseInfo, CURRENT_APP_VERSION } from '../../services/updateService.ts';
import { AppUpdateModal } from '../Update/AppUpdateModal.tsx';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { PrintSettingsView } from './PrintSettingsView.tsx';
import { AuditLogView } from '../Audit/AuditLogView.tsx';
import { CompanyProfileTab } from './CompanyProfileTab.tsx';
import { GeneralSettingsTab } from './GeneralSettingsTab.tsx';
import { ItemSettingsTab } from './ItemSettingsTab.tsx';
import { EditBusinessProfileModal } from './modals/EditBusinessProfileModal.tsx';
import { StoreQrModal } from './modals/StoreQrModal.tsx';
import { DevicePairModals } from './modals/DevicePairModals.tsx';
import { SettingsSubModal } from './modals/SettingsSubModal.tsx';

interface CompanySettingsViewProps {
  company: CompanyProfile;
  onSave: (updated: CompanyProfile) => void;
  initialTab?: 'profile' | 'items' | 'general' | 'print' | 'audit';
}

export const CompanySettingsView: React.FC<CompanySettingsViewProps> = ({
  company,
  onSave,
  initialTab,
}) => {
  const [profile, setProfile] = useState<CompanyProfile>({ ...company });
  const [activeTab, setActiveTab] = useState<'profile' | 'items' | 'general' | 'print' | 'audit'>(() => {
    return initialTab || 'profile';
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [activeSubModal, setActiveSubModal] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const [defaultPrintOption, setDefaultPrintOption] = useState<string>(() => {
    return localStorage.getItem('defaultPrintOption') || 'None';
  });

  const handleDefaultPrintOptionChange = (value: string) => {
    setDefaultPrintOption(value);
    localStorage.setItem('defaultPrintOption', value);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  // Multi-Device Profile Sync State
  const [isSyncingProfile, setIsSyncingProfile] = useState(false);
  const [profileSyncNotice, setProfileSyncNotice] = useState<string | null>(null);
  const [lastProfileSyncTime, setLastProfileSyncTime] = useState<string>('Just now');
  const [isPairQrModalOpen, setIsPairQrModalOpen] = useState(false);
  const [isImportProfileModalOpen, setIsImportProfileModalOpen] = useState(false);
  const [importProfileInput, setImportProfileInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedSyncCode, setCopiedSyncCode] = useState(false);

  // App Update state
  const [isUpdateChecking, setIsUpdateChecking] = useState(false);
  const [updateRelease, setUpdateRelease] = useState<AppReleaseInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);

  // Sync state
  const [syncState, setSyncState] = useState<PouchSyncState>(pouch.getSyncState());
  const [syncUrlInput, setSyncUrlInput] = useState(syncState.remoteUrl || '');
  const [isSyncConfigOpen, setIsSyncConfigOpen] = useState(false);
  const [isSyncStarting, setIsSyncStarting] = useState(false);

  // App preferences
  const [appLanguage, setAppLanguage] = useState<'English (India)' | 'हिंदी (Hindi)'>('English (India)');
  const [isAppLockEnabled, setIsAppLockEnabled] = useState(true);
  // Device-local preference: Never synced across devices
  const [showBuyPricesGlobally, setShowBuyPricesGlobally] = useState<boolean>(() => {
    return db.getBuyPriceVisibility();
  });

  const handleToggleBuyPriceVisibility = (enabled: boolean) => {
    setShowBuyPricesGlobally(enabled);
    db.setBuyPriceVisibility(enabled);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  // Inventory Negative Stock Preference
  const [allowNegativeStock, setAllowNegativeStock] = useState<boolean>(() => {
    return db.getAllowNegativeStock();
  });

  const handleToggleNegativeStock = (enabled: boolean) => {
    setAllowNegativeStock(enabled);
    db.setAllowNegativeStock(enabled);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  useEffect(() => {
    const handleSwitch = (e: any) => {
      if (e.detail && ['profile', 'items', 'general', 'print', 'audit'].includes(e.detail)) {
        setActiveTab(e.detail);
      }
    };
    window.addEventListener('switch_settings_tab', handleSwitch);
    return () => window.removeEventListener('switch_settings_tab', handleSwitch);
  }, []);

  const isAnySettingsModalOpen =
    isEditModalOpen ||
    isQrModalOpen ||
    isPairQrModalOpen ||
    isImportProfileModalOpen ||
    isUpdateModalOpen ||
    isSyncConfigOpen ||
    !!activeSubModal;

  useBackNavigation(() => {
    if (activeSubModal) {
      setActiveSubModal(null);
      return true;
    }
    if (isEditModalOpen) {
      setIsEditModalOpen(false);
      return true;
    }
    if (isQrModalOpen) {
      setIsQrModalOpen(false);
      return true;
    }
    if (isPairQrModalOpen) {
      setIsPairQrModalOpen(false);
      return true;
    }
    if (isImportProfileModalOpen) {
      setIsImportProfileModalOpen(false);
      return true;
    }
    if (isUpdateModalOpen) {
      setIsUpdateModalOpen(false);
      return true;
    }
    if (isSyncConfigOpen) {
      setIsSyncConfigOpen(false);
      return true;
    }
    return false;
  }, isAnySettingsModalOpen, 20);

  useEffect(() => {
    setProfile({ ...company });
  }, [company]);

  useEffect(() => {
    const unsub = pouch.subscribeSync((state) => {
      setSyncState(state);
      if (state.remoteUrl && !syncUrlInput) {
        setSyncUrlInput(state.remoteUrl);
      }
    });
    return unsub;
  }, []);

  const handleCheckForUpdates = async () => {
    setIsUpdateChecking(true);
    setUpdateStatusText('Checking update servers...');
    try {
      const res = await updateService.checkForUpdates();
      if (res.hasUpdate && res.latestRelease) {
        setUpdateRelease(res.latestRelease);
        setIsUpdateModalOpen(true);
        setUpdateStatusText(`New version v${res.latestRelease.version} is available!`);
      } else {
        setUpdateStatusText(`You are on the latest version (v${CURRENT_APP_VERSION}).`);
      }
    } catch (e: any) {
      setUpdateStatusText('Update check failed. Check internet connection.');
    } finally {
      setIsUpdateChecking(false);
    }
  };

  const handleSyncNow = async () => {
    if (!syncState.remoteUrl && !syncUrlInput.trim()) {
      setIsSyncConfigOpen(true);
      return;
    }
    setIsSyncStarting(true);
    try {
      await pouch.syncNow();
      await db.syncAllFromPouch();
    } finally {
      setIsSyncStarting(false);
    }
  };

  const handleConnectSync = () => {
    if (!syncUrlInput.trim()) {
      pouch.stopSync();
      return;
    }
    setIsSyncStarting(true);
    pouch.startSync(syncUrlInput.trim());
    setTimeout(() => {
      setIsSyncStarting(false);
      setIsSyncConfigOpen(false);
    }, 800);
  };

  const handleStopSync = () => {
    pouch.stopSync();
    setSyncUrlInput('');
  };

  const handleGstinChange = (value: string) => {
    const clean = value.toUpperCase().trim();
    setProfile({ ...profile, gstin: clean });

    if (clean.length === 15) {
      const res = validateGstin(clean);
      if (res.isValid) {
        setFeedback(`Valid GSTIN: State ${res.stateName}, PAN ${res.pan}`);
        setProfile((prev) => ({
          ...prev,
          gstin: clean,
          stateCode: res.stateCode || prev.stateCode,
          pan: res.pan || prev.pan,
        }));
      } else {
        setFeedback(`Validation Error: ${res.error}`);
      }
    } else {
      setFeedback(null);
    }
  };

  const isGstActive = profile.isGstEnabled ?? true;

  const handleToggleGst = (newEnabled?: boolean) => {
    const updatedStatus = typeof newEnabled === 'boolean' ? newEnabled : !isGstActive;
    const updatedProfile: CompanyProfile = {
      ...profile,
      isGstEnabled: updatedStatus,
    };
    setProfile(updatedProfile);
    onSave(updatedProfile);
    db.syncAllSettingsAcrossDevices({
      company: updatedProfile,
      isGstEnabled: updatedStatus,
      appLanguage,
      isAppLockEnabled,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleSyncAllSettingsAcrossDevices = async () => {
    setIsSyncingProfile(true);
    setProfileSyncNotice(null);
    try {
      const res = await db.syncAllSettingsAcrossDevices({
        company: profile,
        isGstEnabled: isGstActive,
        appLanguage,
        isAppLockEnabled,
      });
      setLastProfileSyncTime(res.lastSyncedAt);
      setProfileSyncNotice('All settings synced with all devices! (Printing settings preserved locally)');
      setTimeout(() => setProfileSyncNotice(null), 4500);
    } catch (e: any) {
      setProfileSyncNotice('Settings synced locally. Connect network for remote devices.');
      setTimeout(() => setProfileSyncNotice(null), 4000);
    } finally {
      setIsSyncingProfile(false);
    }
  };

  const allSettingsSyncPayload = useMemo(() => {
    try {
      const fullSettings = {
        company: profile,
        isGstEnabled: isGstActive,
        appLanguage,
        isAppLockEnabled,
        allowNegativeStock,
        // Explicitly exclude any printer / printing / device-local privacy settings
      };
      return btoa(unescape(encodeURIComponent(JSON.stringify(fullSettings))));
    } catch {
      return '';
    }
  }, [profile, isGstActive, appLanguage, isAppLockEnabled, allowNegativeStock]);

  const handleCopySyncCode = () => {
    if (allSettingsSyncPayload) {
      navigator.clipboard.writeText(allSettingsSyncPayload);
      setCopiedSyncCode(true);
      setTimeout(() => setCopiedSyncCode(false), 3000);
    }
  };

  const handleImportSettings = () => {
    setImportError(null);
    try {
      if (!importProfileInput.trim()) {
        setImportError('Please enter a valid settings sync code or JSON.');
        return;
      }
      let jsonStr = importProfileInput.trim();
      try {
        jsonStr = decodeURIComponent(escape(atob(jsonStr)));
      } catch {
        // Raw JSON input
      }
      const parsed = JSON.parse(jsonStr);
      // Support both { company, appLanguage, ... } format or direct CompanyProfile
      const incomingCompany: CompanyProfile = parsed.company ? parsed.company : parsed;
      if (!incomingCompany.businessName) {
        setImportError('Invalid settings payload. Missing Business Name.');
        return;
      }
      if (parsed.isGstEnabled !== undefined) {
        incomingCompany.isGstEnabled = parsed.isGstEnabled;
      }
      onSave(incomingCompany);
      if (parsed.appLanguage) setAppLanguage(parsed.appLanguage);
      if (parsed.isAppLockEnabled !== undefined) setIsAppLockEnabled(parsed.isAppLockEnabled);
      if (parsed.allowNegativeStock !== undefined) {
        setAllowNegativeStock(parsed.allowNegativeStock);
        db.setAllowNegativeStock(parsed.allowNegativeStock);
      }

      // Save all settings excluding printing and local privacy preferences
      db.syncAllSettingsAcrossDevices({
        company: incomingCompany,
        isGstEnabled: incomingCompany.isGstEnabled ?? true,
        appLanguage: parsed.appLanguage || appLanguage,
        isAppLockEnabled: parsed.isAppLockEnabled !== undefined ? parsed.isAppLockEnabled : isAppLockEnabled,
        allowNegativeStock: parsed.allowNegativeStock !== undefined ? parsed.allowNegativeStock : allowNegativeStock,
      });

      setProfile(incomingCompany);
      setIsImportProfileModalOpen(false);
      setImportProfileInput('');
      setProfileSyncNotice('All settings imported & synced! (Device printing settings preserved)');
      setTimeout(() => setProfileSyncNotice(null), 4500);
    } catch (e: any) {
      setImportError('Invalid sync code format. Please check the code.');
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(profile);
    db.syncAllSettingsAcrossDevices({
      company: profile,
      isGstEnabled: profile.isGstEnabled ?? true,
      appLanguage,
      isAppLockEnabled,
    });
    setSavedNotice(true);
    setIsEditModalOpen(false);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const stateName = getStateList().find((s) => s.code === profile.stateCode)?.name || 'Maharashtra';

  return (
    <div className="flex flex-col w-full px-margin-mobile md:px-6 pb-28 pt-2 max-w-5xl mx-auto gap-space-md">
      {/* Toast Notice */}
      {savedNotice && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto bg-secondary text-on-secondary px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-fade-in font-bold text-xs">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span>Business settings updated successfully!</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-surface-container-low rounded-xl p-1 gap-1 sticky top-[72px] z-40 backdrop-blur-md bg-opacity-90 shadow-sm border border-outline-variant/20 overflow-x-auto no-scrollbar">
        <button
          type="button"
          className={`flex-1 py-2.5 px-3 whitespace-nowrap rounded-lg text-sm font-bold transition-all ${
            activeTab === 'profile'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high'
          }`}
          onClick={() => setActiveTab('profile')}
        >
          Business Profile
        </button>
        <button
          type="button"
          className={`flex-1 py-2.5 px-3 whitespace-nowrap rounded-lg text-sm font-bold transition-all ${
            activeTab === 'items'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high'
          }`}
          onClick={() => setActiveTab('items')}
        >
          Items Settings
        </button>
        <button
          type="button"
          className={`flex-1 py-2.5 px-3 whitespace-nowrap rounded-lg text-sm font-bold transition-all ${
            activeTab === 'print'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high'
          }`}
          onClick={() => setActiveTab('print')}
        >
          Print Settings
        </button>
        <button
          type="button"
          className={`flex-1 py-2.5 px-3 whitespace-nowrap rounded-lg text-sm font-bold transition-all ${
            activeTab === 'general'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high'
          }`}
          onClick={() => setActiveTab('general')}
        >
          General Settings
        </button>
        <button
          type="button"
          className={`flex-1 py-2.5 px-3 whitespace-nowrap rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high'
          }`}
          onClick={() => setActiveTab('audit')}
        >
          <span className="material-symbols-outlined text-[18px]">verified_user</span>
          <span>Audit Trail</span>
        </button>
      </div>

      <div className="flex flex-col gap-space-md mt-2">
        {activeTab === 'profile' && (
          <CompanyProfileTab
            profile={profile}
            isGstActive={isGstActive}
            stateName={stateName}
            defaultPrintOption={defaultPrintOption}
            handleDefaultPrintOptionChange={handleDefaultPrintOptionChange}
            setIsEditModalOpen={setIsEditModalOpen}
            setIsQrModalOpen={setIsQrModalOpen}
            setActiveTab={setActiveTab}
            setActiveSubModal={setActiveSubModal}
          />
        )}

        {activeTab === 'items' && (
          <ItemSettingsTab
            allowNegativeStock={allowNegativeStock}
            onToggleNegativeStock={handleToggleNegativeStock}
            showBuyPricesGlobally={showBuyPricesGlobally}
            onToggleBuyPrices={handleToggleBuyPriceVisibility}
          />
        )}

        {activeTab === 'print' && (
          <PrintSettingsView company={company} />
        )}

        {activeTab === 'general' && (
          <GeneralSettingsTab
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
            CURRENT_APP_VERSION={CURRENT_APP_VERSION}
            updateStatusText={updateStatusText}
            handleCheckForUpdates={handleCheckForUpdates}
            isUpdateChecking={isUpdateChecking}
            isGstActive={isGstActive}
            handleToggleGst={handleToggleGst}
            profile={profile}
            setProfile={setProfile}
            onSave={onSave}
            handleGstinChange={handleGstinChange}
            feedback={feedback}
            stateName={stateName}
            setSavedNotice={setSavedNotice}
            appLanguage={appLanguage}
            setAppLanguage={setAppLanguage}
            isAppLockEnabled={isAppLockEnabled}
            setIsAppLockEnabled={setIsAppLockEnabled}
            setActiveSubModal={setActiveSubModal}
            defaultPrintOption={defaultPrintOption}
            handleDefaultPrintOptionChange={handleDefaultPrintOptionChange}
            showBuyPricesGlobally={showBuyPricesGlobally}
            handleToggleBuyPriceVisibility={handleToggleBuyPriceVisibility}
            allowNegativeStock={allowNegativeStock}
            handleToggleNegativeStock={handleToggleNegativeStock}
          />
        )}
        {activeTab === 'audit' && (
          <AuditLogView />
        )}
      </div>

      {/* Version Footnote */}
      <div className="text-center py-4 space-y-1">
        <p className="text-xs font-bold text-outline">
          Vyapar PRO Books • v{CURRENT_APP_VERSION}
        </p>
        <p className="text-[11px] text-outline-variant">
          100% Offline-First Multi-Device Architecture
        </p>
      </div>

      {/* ================= MODALS & DRAWERS ================= */}

      {/* 1. Edit Business Profile Modal */}
      <EditBusinessProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        profile={profile}
        setProfile={setProfile}
        handleSaveProfile={handleSaveProfile}
        isGstActive={isGstActive}
        stateName={stateName}
      />

      {/* 2. Store UPI QR Code Modal */}
      <StoreQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        profile={profile}
      />

      {/* 3. Device Pairing Modals */}
      <DevicePairModals
        isPairQrModalOpen={isPairQrModalOpen}
        setIsPairQrModalOpen={setIsPairQrModalOpen}
        allSettingsSyncPayload={allSettingsSyncPayload}
        copiedSyncCode={copiedSyncCode}
        handleCopySyncCode={handleCopySyncCode}
        isImportProfileModalOpen={isImportProfileModalOpen}
        setIsImportProfileModalOpen={setIsImportProfileModalOpen}
        importProfileInput={importProfileInput}
        setImportProfileInput={setImportProfileInput}
        importError={importError}
        handleImportSettings={handleImportSettings}
      />

      {/* 4. Settings Sub-Modals */}
      <SettingsSubModal
        activeSubModal={activeSubModal}
        setActiveSubModal={setActiveSubModal}
        isGstActive={isGstActive}
        stateName={stateName}
        profile={profile}
        defaultPrintOption={defaultPrintOption}
        handleDefaultPrintOptionChange={handleDefaultPrintOptionChange}
      />
      {/* App Auto-Update Modal */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        releaseInfo={updateRelease}
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
};
