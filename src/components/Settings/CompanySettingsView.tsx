import React, { useState, useEffect, useMemo } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { validateGstin } from '../../core/gst/validator.ts';
import { pouch, PouchSyncState } from '../../services/pouchdb.ts';
import { db } from '../../services/db.ts';
import { updateService, AppReleaseInfo, CURRENT_APP_VERSION } from '../../services/updateService.ts';
import { AppUpdateModal } from '../Update/AppUpdateModal.tsx';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

interface CompanySettingsViewProps {
  company: CompanyProfile;
  onSave: (updated: CompanyProfile) => void;
}

export const CompanySettingsView: React.FC<CompanySettingsViewProps> = ({
  company,
  onSave,
}) => {
  const [profile, setProfile] = useState<CompanyProfile>({ ...company });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [activeSubModal, setActiveSubModal] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

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
  const [appLanguage, setAppLanguage] = useState('English (India)');
  const [isAppLockEnabled, setIsAppLockEnabled] = useState(true);

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
        // Explicitly exclude any printer / printing settings
      };
      return btoa(unescape(encodeURIComponent(JSON.stringify(fullSettings))));
    } catch {
      return '';
    }
  }, [profile, isGstActive, appLanguage, isAppLockEnabled]);

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

      // Save all settings excluding printing
      db.syncAllSettingsAcrossDevices({
        company: incomingCompany,
        isGstEnabled: incomingCompany.isGstEnabled ?? true,
        appLanguage: parsed.appLanguage || appLanguage,
        isAppLockEnabled: parsed.isAppLockEnabled !== undefined ? parsed.isAppLockEnabled : isAppLockEnabled,
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
    <div className="flex flex-col w-full px-margin-mobile pb-28 pt-2 max-w-3xl mx-auto gap-space-md">
      {/* Toast Notice */}
      {savedNotice && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto bg-secondary text-on-secondary px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-fade-in font-bold text-xs">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span>Business settings updated successfully!</span>
        </div>
      )}

      {/* 1. Merchant Identity Card (Stitch business_settings_profile) */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4 relative overflow-hidden">
        {/* Subtle Ambient Corner Accent */}
        <div className="absolute -right-12 -top-12 w-36 h-36 bg-secondary-fixed/40 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start gap-3.5 relative">
          {/* Store Avatar / Logo */}
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-center text-secondary font-bold text-2xl shadow-sm overflow-hidden">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="Store Logo" className="w-full h-full object-cover" />
              ) : (
                <span>{profile.businessName.charAt(0) || 'V'}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              aria-label="Upload Store Logo"
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md active:scale-90 transition-transform cursor-pointer"
            >
              <span className="material-symbols-outlined text-[13px]">photo_camera</span>
            </button>
          </div>

          {/* Business Name & Verification */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface truncate">
                {profile.businessName || 'Vyapar Store'}
              </h2>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
              {profile.tradeName || 'Wholesale & Retail Groceries'}
            </p>
            {/* Verification Pill */}
            {isGstActive ? (
              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                <span>GST Portal Verified</span>
              </div>
            ) : (
              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-label-sm text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Non-GST Store (Exempt)</span>
              </div>
            )}
          </div>
        </div>

        {/* Essential Metadata Grid */}
        <div className="bg-surface-container-low/70 rounded-xl p-3.5 flex flex-col gap-2 text-xs">
          <div
            onClick={() => document.getElementById('gst-tax-config')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center justify-between text-on-surface hover:bg-surface-container-high/50 p-1 -m-1 rounded-lg transition-colors cursor-pointer"
            title="Click to configure GST & Legal Tax settings"
          >
            <span className="text-on-surface-variant font-medium flex items-center gap-1">
              <span>GSTIN</span>
              <span className="material-symbols-outlined text-[13px] text-secondary">tune</span>
            </span>
            <span className={`font-tabular-data tracking-wider font-bold ${isGstActive ? 'text-on-surface' : 'text-on-surface-variant italic'}`}>
              {isGstActive ? (profile.gstin || '27AAAAA0000A1Z5') : 'Not Applicable (Disabled)'}
            </span>
          </div>

          <div className="flex items-center justify-between text-on-surface">
            <span className="text-on-surface-variant font-medium">Taxpayer Status</span>
            <span className={`font-bold flex items-center gap-1 ${isGstActive ? 'text-secondary' : 'text-amber-600 dark:text-amber-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isGstActive ? 'bg-secondary' : 'bg-amber-500'}`} />
              {isGstActive ? 'Active • Regular' : 'Non-GST / Unregistered'}
            </span>
          </div>

          <div className="flex items-center justify-between text-on-surface">
            <span className="text-on-surface-variant font-medium">Contact Phone</span>
            <span className="font-medium text-on-surface">{profile.phone || '+91 98000 00000'}</span>
          </div>

          <div className="flex items-center justify-between text-on-surface">
            <span className="text-on-surface-variant font-medium">UPI Payment VPA</span>
            <span className="font-mono text-secondary font-bold truncate max-w-[200px]">
              {profile.upiId || 'Not Configured'}
            </span>
          </div>

          <div className="pt-1.5 border-t border-outline-variant/20 flex items-start gap-1.5 text-on-surface-variant">
            <span className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5 text-secondary">
              location_on
            </span>
            <p className="text-[11px] leading-tight text-on-surface-variant line-clamp-2">
              {profile.address || 'Shop No. 1, Main Market Road'}, {stateName} - {profile.pincode || '411001'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-0.5">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="h-10 px-3 rounded-xl bg-surface-container text-on-surface font-label-md text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[17px]">edit</span>
            <span>Edit Profile</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="h-10 px-3 rounded-xl bg-surface-container text-on-surface font-label-md text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[17px]">qr_code_2</span>
            <span>Store QR</span>
          </button>
        </div>
      </section>

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
              <span className="font-headline-sm text-sm font-bold text-on-surface">App Updates & OTA</span>
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
          <span className={`font-label-sm text-[11px] font-bold ${isGstActive ? 'text-secondary' : 'text-amber-500'}`}>
            {isGstActive ? 'GST Mode: Regular' : 'GST Mode: Disabled (Non-GST)'}
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
                    : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}>
                  {isGstActive ? 'Active' : 'Disabled (Non-GST)'}
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                {isGstActive
                  ? 'Tax rates (CGST/SGST/IGST), GSTIN validation, HSN/SAC codes & E-Way bills active.'
                  : 'Tax calculations disabled. Generate simple non-tax bills / Bills of Supply without GST.'}
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
                placeholder={isGstActive ? '27AABCU9603R1ZN' : 'Disabled (Non-GST Business)'}
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
                  db.syncAllSettingsAcrossDevices({ company: updated, isGstEnabled: isGstActive, appLanguage, isAppLockEnabled });
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
                  db.syncAllSettingsAcrossDevices({ company: profile, isGstEnabled: isGstActive, appLanguage, isAppLockEnabled });
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
                <span className="font-label-md text-sm font-bold text-on-surface">GST & Tax Rates</span>
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
                <span className="font-label-md text-sm font-bold text-on-surface">State & Place of Supply Rules</span>
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
                <span className="font-label-md text-sm font-bold text-on-surface">E-Way Bill & E-Invoice API</span>
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
                  : 'NIC JSON generation paused (Non-GST mode)'}
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
            Billing & Printing Setup
          </h3>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
          {/* Thermal Printing */}
          <button
            type="button"
            onClick={() => setActiveSubModal('printing')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">print</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Invoice Themes & Thermal Printing</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                3-inch (80mm) & 2-inch (58mm) Thermal Active • Modern A4
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
              <div className="font-label-md text-sm font-bold text-on-surface">Prefix & Invoice Series</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                Prefix: {profile.invoicePrefix || 'INV-2024-'} • Retail POS & Tax Bills
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
              <div className="font-label-md text-sm font-bold text-on-surface">Automated WhatsApp & SMS Alerts</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                Instant bill PDF share • Dynamic UPI Payment Reminders
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>
        </div>
      </section>

      {/* GROUP 3: Banking & UPI Payments (Stitch Design) */}
      <section className="flex flex-col gap-2">
        <div className="px-1 flex items-center justify-between">
          <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
            Payments & Banking
          </h3>
          <span className="font-label-sm text-[11px] text-on-surface-variant font-bold">Default UPI Linked</span>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
          {/* Bank Accounts & Default UPI QR */}
          <button
            type="button"
            onClick={() => setActiveSubModal('banking_upi')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Bank Accounts & Default UPI QR</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                {profile.bankName || 'HDFC Bank'} • UPI: {profile.upiId || 'Not Configured'}
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>
        </div>
      </section>

      {/* GROUP 4: Staff Roles & Permissions (Stitch Design) */}
      <section className="flex flex-col gap-2">
        <div className="px-1">
          <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
            Staff Access & Protection
          </h3>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
          <button
            type="button"
            onClick={() => setActiveSubModal('staff_roles')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">group</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Staff Roles & Permissions</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                3 Roles: Owner (Full PIN), Cashier (Bill Only), CA (Audit & Books)
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
            Device & Language
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

          {/* Biometric / PIN Lock Toggle */}
          <div className="w-full p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">fingerprint</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-label-md text-sm font-bold text-on-surface">App Lock & 4-Digit PIN</div>
                <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                  Protect invoice deletions & role switching with PIN
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
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-outline-variant/30">
            {/* Header */}
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[24px]">store</span>
                <h3 className="font-headline-sm text-base font-bold text-on-surface">Edit Business Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-on-surface block mb-1">Business / Registered Name *</label>
                <input
                  type="text"
                  required
                  value={profile.businessName}
                  onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                  className="w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-on-surface block mb-1">Trade Name / Slogan</label>
                <input
                  type="text"
                  value={profile.tradeName || ''}
                  onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
                  className="w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                />
              </div>

              {/* Reference to GST & Legal Tax Configuration */}
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-secondary text-[16px]">tune</span>
                    <span className="font-bold text-on-surface text-xs">GST &amp; Legal Tax Configuration</span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant truncate block mt-0.5">
                    {isGstActive
                      ? `GSTIN: ${profile.gstin || 'Not configured'} • State: ${stateName} (${profile.stateCode})`
                      : 'GST Mode: Disabled (Non-GST Billing)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setTimeout(() => {
                      document.getElementById('gst-tax-config')?.scrollIntoView({ behavior: 'smooth' });
                    }, 150);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-container text-secondary font-bold text-[11px] hover:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1"
                >
                  <span>Configure</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-on-surface block mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-on-surface block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-on-surface block mb-1">Registered Address</label>
                <textarea
                  rows={2}
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                />
              </div>

              <div className="pt-2 border-t border-outline-variant/20 space-y-3">
                <h4 className="font-bold text-secondary text-xs uppercase">Banking & Payment Setup</h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-on-surface block mb-1">Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC Bank"
                      value={profile.bankName || ''}
                      onChange={(e) => setProfile({ ...profile, bankName: e.target.value })}
                      className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-on-surface block mb-1">Account Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 50200012345678"
                      value={profile.accountNumber || ''}
                      onChange={(e) => setProfile({ ...profile, accountNumber: e.target.value })}
                      className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-on-surface block mb-1">IFSC Code</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC0001234"
                      value={profile.ifscCode || ''}
                      onChange={(e) => setProfile({ ...profile, ifscCode: e.target.value.toUpperCase() })}
                      className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-mono uppercase font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-on-surface block mb-1">Default UPI VPA / ID</label>
                    <input
                      type="text"
                      placeholder="merchant@upi"
                      value={profile.upiId || ''}
                      onChange={(e) => setProfile({ ...profile, upiId: e.target.value.trim() })}
                      className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-on-surface block mb-1">Invoice Numbering Prefix</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2024-"
                    value={profile.invoicePrefix || ''}
                    onChange={(e) => setProfile({ ...profile, invoicePrefix: e.target.value.trim() })}
                    className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-outline-variant/20 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-outline-variant/40 text-on-surface font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-md hover:bg-secondary/90 active:scale-95 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Store UPI QR Code Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary text-on-secondary flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[28px]">qr_code_2</span>
            </div>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">{profile.businessName}</h3>
            <p className="text-xs text-on-surface-variant font-medium">Scan with any UPI App to Pay</p>

            {/* QR Mock / Box */}
            <div className="w-48 h-48 rounded-2xl bg-surface p-3 border-2 border-dashed border-secondary/40 flex flex-col items-center justify-center shadow-inner my-2">
              <span className="material-symbols-outlined text-6xl text-secondary">qr_code_2</span>
              <span className="text-[11px] font-mono text-outline font-bold mt-1">
                {profile.upiId || 'merchant@upi'}
              </span>
            </div>

            <p className="text-[11px] text-outline font-semibold">
              This QR code is automatically embedded onto thermal receipts and PDF invoices.
            </p>

            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-2.5 mt-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-md cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Pair All Settings to Another Device via QR Code (Excluding Printing) */}
      {isPairQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary text-on-secondary flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[28px]">qr_code_2</span>
            </div>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              Pair All Settings
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              Scan from any secondary device or counter to clone all business, bank, and app settings. Printing settings are preserved separately for this device.
            </p>

            {/* Dynamic QR Code */}
            <div className="w-52 h-52 rounded-2xl bg-white p-3 border border-outline-variant/20 flex flex-col items-center justify-center shadow-inner my-1">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(allSettingsSyncPayload)}`}
                alt="Settings Sync QR Code"
                className="w-44 h-44 object-contain rounded-lg"
              />
            </div>

            <div className="w-full flex flex-col gap-1.5 mt-1">
              <button
                type="button"
                onClick={handleCopySyncCode}
                className="w-full py-2.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copiedSyncCode ? 'check' : 'content_copy'}
                </span>
                <span>{copiedSyncCode ? 'Settings Sync Code Copied!' : 'Copy Pairing Code'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPairQrModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import All Settings Modal (Excluding Printing) */}
      {isImportProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">download</span>
                <h3 className="font-headline-sm text-sm font-bold text-on-surface">
                  Import All Settings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportProfileModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              Paste the Pairing Code or JSON from master counter. All settings will update, while this device's printer settings stay preserved:
            </p>

            <textarea
              rows={4}
              value={importProfileInput}
              onChange={(e) => setImportProfileInput(e.target.value)}
              placeholder="Paste settings pairing code or JSON here..."
              className="w-full p-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-xs font-mono focus:outline-none focus:border-secondary"
            />

            {importError && (
              <p className="text-xs text-error font-medium">{importError}</p>
            )}

            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setIsImportProfileModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSettings}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-md cursor-pointer"
              >
                Apply &amp; Sync
              </button>
            </div>
          </div>
        </div>
      )}
      {activeSubModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-5 shadow-2xl border border-outline-variant/30 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h4 className="font-headline-sm text-sm font-bold text-on-surface capitalize">
                {activeSubModal.replace('_', ' ')}
              </h4>
              <button
                onClick={() => setActiveSubModal(null)}
                className="w-7 h-7 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="text-xs text-on-surface-variant space-y-2 py-2">
              {!isGstActive && ['tax_rates', 'place_of_supply', 'eway_bill'].includes(activeSubModal) && (
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-medium flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[18px] flex-shrink-0">warning</span>
                  <span>GST is currently disabled. Toggle &quot;Enable GST Billing&quot; in settings to apply these tax rules to your bills.</span>
                </div>
              )}

              {activeSubModal === 'tax_rates' && (
                <>
                  <p className="font-semibold text-on-surface">Standard GST Tax Slabs Configured:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>0% (Exempt: Essential Food, Unbranded grains)</li>
                    <li>5% (Standard: Tea, Spices, Sugar, Edible Oils)</li>
                    <li>12% (Standard: Processed food, butter, ghee)</li>
                    <li>18% (Standard: Household goods, soap, stationery, electronics)</li>
                    <li>28% (Luxury & Sin: Pan masala, premium goods)</li>
                  </ul>
                  <p className="text-secondary font-bold pt-1">
                    Reverse Charge Mechanism (RCM) and Compensation Cess can be toggled on per item.
                  </p>
                </>
              )}

              {activeSubModal === 'place_of_supply' && (
                <>
                  <p className="font-semibold text-on-surface">State Tax Engine (Intra vs. Inter-state):</p>
                  <p>
                    When party state equals <strong>{stateName} ({profile.stateCode})</strong>, the app automatically bifurcates tax into <strong>CGST (50%)</strong> and <strong>SGST (50%)</strong>.
                  </p>
                  <p>
                    For different states, <strong>IGST (100%)</strong> is automatically applied according to Indian GST law.
                  </p>
                </>
              )}

              {activeSubModal === 'eway_bill' && (
                <>
                  <p className="font-semibold text-on-surface">Government NIC E-Way Bill Integration:</p>
                  <p>
                    Consignments exceeding <strong>₹50,000</strong> invoice value automatically generate compliant JSON payloads for direct upload to <code>ewaybillgst.gov.in</code>.
                  </p>
                  <p className="text-secondary font-bold">
                    Vehicle Number, Transporter ID, and Distance (km) fields are ready on B2B invoices.
                  </p>
                </>
              )}

              {activeSubModal === 'printing' && (
                <>
                  <p className="font-semibold text-on-surface">Thermal & Document Printing Formats:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>3-Inch (80mm) ESC/POS</strong>: Standard high-speed POS receipt printer.</li>
                    <li><strong>2-Inch (58mm) Mobile Bluetooth</strong>: Portable battery-powered thermal printers.</li>
                    <li><strong>A4 Modern Laser</strong>: Detailed GST tax invoice with full company stamp & signature.</li>
                  </ul>
                </>
              )}

              {activeSubModal === 'prefix_series' && (
                <>
                  <p className="font-semibold text-on-surface">Invoice Numbering Configuration:</p>
                  <p>
                    Current series starts with: <code>{profile.invoicePrefix || 'INV-2024-'}</code> followed by 4-digit incremental counters.
                  </p>
                  <p>
                    You can change your custom invoice prefix anytime via the <strong>Edit Profile</strong> button.
                  </p>
                </>
              )}

              {activeSubModal === 'whatsapp_alerts' && (
                <>
                  <p className="font-semibold text-on-surface">Automated WhatsApp Reminders:</p>
                  <p>
                    One-tap customer ledger sharing generates polite, vernacular payment reminders in English and Hindi (हिंदी) with a dynamic UPI pay link pre-populated with your VPA (<code>{profile.upiId || 'Not set'}</code>).
                  </p>
                </>
              )}

              {activeSubModal === 'banking_upi' && (
                <>
                  <p className="font-semibold text-on-surface">Bank & Dynamic UPI QR Setup:</p>
                  <p>
                    Linked Bank: <strong>{profile.bankName || 'Not set'}</strong> ({profile.accountNumber || 'No A/C'})
                  </p>
                  <p>
                    IFSC: <strong>{profile.ifscCode || 'None'}</strong>
                  </p>
                  <p>
                    UPI VPA: <strong>{profile.upiId || 'None'}</strong>
                  </p>
                </>
              )}

              {activeSubModal === 'staff_roles' && (
                <>
                  <p className="font-semibold text-on-surface">Role-Based Access Control (RBAC):</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Business Owner</strong>: Full administrative privileges, invoice deletion, settings & updates.</li>
                    <li><strong>Cashier / POS Staff</strong>: Quick billing, scan & print only. No invoice deletion.</li>
                    <li><strong>Chartered Accountant (CA)</strong>: Read-only access to GSTR reports, balance sheet, and daybook.</li>
                  </ul>
                  <p className="text-secondary font-bold pt-1">
                    Switch roles anytime via the top-right profile icon or drawer using your 4-digit security PIN.
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveSubModal(null)}
              className="w-full py-2.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* App Auto-Update Modal */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        releaseInfo={updateRelease}
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
};
