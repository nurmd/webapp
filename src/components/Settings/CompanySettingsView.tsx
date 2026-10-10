import React, { useState, useEffect, useMemo } from 'react';
import {
  Store,
  Receipt,
  Package,
  Printer,
  SlidersHorizontal,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  LucideIcon,
} from 'lucide-react';
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
import { ItemSettingsTab } from './ItemSettingsTab.tsx';
import { BillingInvoicesTab } from './tabs/BillingInvoicesTab.tsx';
import { AppPreferencesTab } from './tabs/AppPreferencesTab.tsx';
import { DataSyncTab } from './tabs/DataSyncTab.tsx';
import { EditBusinessProfileModal } from './modals/EditBusinessProfileModal.tsx';
import { StoreQrModal } from './modals/StoreQrModal.tsx';
import { DevicePairModals } from './modals/DevicePairModals.tsx';
import { SettingsSubModal } from './modals/SettingsSubModal.tsx';

export type SettingsCategoryId =
  | 'business_profile'
  | 'billing_invoices'
  | 'inventory_items'
  | 'hardware_printing'
  | 'app_preferences'
  | 'data_sync'
  | 'security_audit';

export interface SettingsCategoryMeta {
  id: SettingsCategoryId;
  label: string;
  subtitle: string;
  badge?: string;
  icon: LucideIcon;
}

export const SETTINGS_CATEGORIES: SettingsCategoryMeta[] = [
  {
    id: 'business_profile',
    label: 'Business Profile',
    subtitle: 'Company details, GST & tax compliance',
    badge: 'Core',
    icon: Store,
  },
  {
    id: 'billing_invoices',
    label: 'Billing & Invoices',
    subtitle: 'Invoice numbering, payment QR, default format',
    icon: Receipt,
  },
  {
    id: 'inventory_items',
    label: 'Inventory & Items',
    subtitle: 'Negative stock controls & price privacy',
    icon: Package,
  },
  {
    id: 'hardware_printing',
    label: 'Hardware & Printing',
    subtitle: 'Thermal 2"/3" & A4 laser print configuration',
    icon: Printer,
  },
  {
    id: 'app_preferences',
    label: 'App Preferences',
    subtitle: 'Language, app lock PIN & OTA updates',
    icon: SlidersHorizontal,
  },
  {
    id: 'data_sync',
    label: 'Data & Sync',
    subtitle: 'Cloud sync, profile export & device pairing',
    badge: 'Offline-First',
    icon: RefreshCw,
  },
  {
    id: 'security_audit',
    label: 'Security & Audit',
    subtitle: 'MCA Rule 3(1) tamper-evident audit trail',
    icon: ShieldCheck,
  },
];

export function normalizeSettingsTab(tab?: string): SettingsCategoryId {
  switch (tab) {
    case 'profile':
    case 'business_profile':
      return 'business_profile';
    case 'billing':
    case 'invoices':
    case 'billing_invoices':
      return 'billing_invoices';
    case 'items':
    case 'inventory':
    case 'inventory_items':
      return 'inventory_items';
    case 'print':
    case 'printing':
    case 'hardware':
    case 'hardware_printing':
      return 'hardware_printing';
    case 'general':
    case 'preferences':
    case 'app_preferences':
      return 'app_preferences';
    case 'sync':
    case 'data':
    case 'data_sync':
      return 'data_sync';
    case 'audit':
    case 'security':
    case 'security_audit':
      return 'security_audit';
    default:
      return 'business_profile';
  }
}

export interface CompanySettingsViewProps {
  company: CompanyProfile;
  onSave: (updated: CompanyProfile) => void;
  initialTab?: 'profile' | 'items' | 'general' | 'print' | 'audit' | SettingsCategoryId;
}

export const CompanySettingsView: React.FC<CompanySettingsViewProps> = ({
  company,
  onSave,
  initialTab,
}) => {
  const [profile, setProfile] = useState<CompanyProfile>({ ...company });
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategoryId>(() => {
    return normalizeSettingsTab(initialTab);
  });
  const [isMobileDetailView, setIsMobileDetailView] = useState<boolean>(() => {
    // If an initial tab was explicitly specified, enter detail view immediately
    return !!initialTab;
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

  // Intercept switch_settings_tab window event (supports both legacy and new category keys)
  useEffect(() => {
    const handleSwitch = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        const targetCategory = normalizeSettingsTab(e.detail);
        setSelectedCategory(targetCategory);
        setIsMobileDetailView(true);
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
    if (isMobileDetailView) {
      setIsMobileDetailView(false);
      return true;
    }
    return false;
  }, isAnySettingsModalOpen || isMobileDetailView, 20);

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
        // Raw JSON fallback
      }
      const parsed = JSON.parse(jsonStr);
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
  const activeCategoryMeta = SETTINGS_CATEGORIES.find((c) => c.id === selectedCategory) || SETTINGS_CATEGORIES[0];

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-4 pb-28 md:pb-12">
      {/* Toast Notice */}
      {savedNotice && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto bg-secondary text-on-secondary px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-fade-in font-bold text-xs">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span>Business settings updated successfully!</span>
        </div>
      )}

      {/* Main Split-Pane Container */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* ================= LEFT SIDEBAR (Desktop) / CATEGORY LIST (Mobile) ================= */}
        <aside
          className={`w-full md:w-64 lg:w-72 flex-shrink-0 ${
            isMobileDetailView ? 'hidden md:block' : 'block'
          }`}
          data-testid="settings-sidebar"
        >
          {/* Mobile Profile Card Summary */}
          <div className="md:hidden mb-4 p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex items-center gap-3 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-secondary/15 flex items-center justify-center font-bold text-secondary text-lg flex-shrink-0">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="Store Logo" className="w-full h-full object-cover rounded-xl" />
              ) : (
                profile.businessName.charAt(0) || 'V'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-on-surface truncate">{profile.businessName || 'Vyapar Store'}</h3>
              <p className="text-xs text-on-surface-variant truncate">
                {isGstActive ? (profile.gstin || 'GST Configured') : 'Direct Billing Mode'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('business_profile');
                setIsMobileDetailView(true);
              }}
              className="text-xs font-bold text-secondary hover:underline cursor-pointer"
            >
              Edit
            </button>
          </div>

          {/* Sidebar Menu Card */}
          <nav className="bg-surface-container-lowest rounded-2xl p-2.5 border border-outline-variant/30 shadow-xs md:sticky md:top-[80px]">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-outline hidden md:flex items-center gap-1.5">
              <Sparkles size={13} className="text-secondary" />
              <span>Settings Hub</span>
            </div>

            <div className="flex flex-col gap-1">
              {SETTINGS_CATEGORIES.map((cat) => {
                const IconComponent = cat.icon;
                const isSelected = selectedCategory === cat.id;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    data-testid={`category-btn-${cat.id}`}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setIsMobileDetailView(true);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-secondary text-on-secondary shadow-sm font-bold'
                        : 'text-on-surface hover:bg-surface-container-low font-medium'
                    }`}
                  >
                    <span
                      className={`p-1.5 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-on-secondary/20 text-on-secondary'
                          : 'bg-surface-container text-secondary'
                      }`}
                    >
                      <IconComponent size={18} />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold truncate leading-tight">{cat.label}</span>
                        {cat.badge && (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              isSelected
                                ? 'bg-on-secondary/20 text-on-secondary'
                                : 'bg-surface-container text-on-surface-variant'
                            }`}
                          >
                            {cat.badge}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-[10px] truncate leading-tight mt-0.5 ${
                          isSelected ? 'text-on-secondary/80' : 'text-on-surface-variant'
                        }`}
                      >
                        {cat.subtitle}
                      </p>
                    </div>

                    <ChevronRight
                      size={15}
                      className={`flex-shrink-0 transition-transform ${
                        isSelected ? 'text-on-secondary translate-x-0.5' : 'text-outline/60'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Version Footer */}
            <div className="mt-4 pt-3 border-t border-outline-variant/20 px-3 text-center hidden md:block">
              <p className="text-[11px] font-bold text-outline">Vyapar PRO Books • v{CURRENT_APP_VERSION}</p>
              <p className="text-[10px] text-outline-variant">100% Offline-First Multi-Device Architecture</p>
            </div>
          </nav>
        </aside>

        {/* ================= RIGHT CONTENT PANE (Desktop & Mobile Detail) ================= */}
        <section
          className={`flex-1 min-w-0 w-full ${
            !isMobileDetailView ? 'hidden md:block' : 'block'
          }`}
          data-testid="settings-content-pane"
        >
          {/* Mobile Back Button Navigation Bar */}
          <div className="md:hidden flex items-center justify-between pb-3 mb-3 border-b border-outline-variant/20 sticky top-[72px] z-30 bg-surface/95 backdrop-blur-md pt-1">
            <button
              type="button"
              data-testid="mobile-back-btn"
              onClick={() => setIsMobileDetailView(false)}
              className="flex items-center gap-1.5 text-xs font-bold text-secondary hover:text-secondary-fixed active:scale-95 transition-transform cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Back to Settings</span>
            </button>
            <span className="text-xs font-bold text-on-surface truncate">
              {activeCategoryMeta.label}
            </span>
          </div>

          {/* Active Category Header Banner (Desktop) */}
          <div className="hidden md:flex items-center justify-between p-4 mb-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
                {React.createElement(activeCategoryMeta.icon, { size: 20 })}
              </div>
              <div>
                <h2 className="text-base font-bold text-on-surface">{activeCategoryMeta.label}</h2>
                <p className="text-xs text-on-surface-variant">{activeCategoryMeta.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Render Active Category View */}
          <div className="flex flex-col gap-4">
            {selectedCategory === 'business_profile' && (
              <CompanyProfileTab
                profile={profile}
                isGstActive={isGstActive}
                stateName={stateName}
                defaultPrintOption={defaultPrintOption}
                handleDefaultPrintOptionChange={handleDefaultPrintOptionChange}
                setIsEditModalOpen={setIsEditModalOpen}
                setIsQrModalOpen={setIsQrModalOpen}
                setActiveTab={(tab: any) => setSelectedCategory(normalizeSettingsTab(tab))}
                setActiveSubModal={setActiveSubModal}
                handleToggleGst={handleToggleGst}
                handleGstinChange={handleGstinChange}
                feedback={feedback}
                setProfile={setProfile}
                onSave={onSave}
                setSavedNotice={setSavedNotice}
              />
            )}

            {selectedCategory === 'billing_invoices' && (
              <BillingInvoicesTab
                profile={profile}
                defaultPrintOption={defaultPrintOption}
                handleDefaultPrintOptionChange={handleDefaultPrintOptionChange}
                setIsQrModalOpen={setIsQrModalOpen}
                setActiveSubModal={setActiveSubModal}
                onNavigateToTab={(tab) => setSelectedCategory(normalizeSettingsTab(tab))}
              />
            )}

            {selectedCategory === 'inventory_items' && (
              <ItemSettingsTab
                allowNegativeStock={allowNegativeStock}
                onToggleNegativeStock={handleToggleNegativeStock}
                showBuyPricesGlobally={showBuyPricesGlobally}
                onToggleBuyPrices={handleToggleBuyPriceVisibility}
              />
            )}

            {selectedCategory === 'hardware_printing' && (
              <PrintSettingsView company={company} />
            )}

            {selectedCategory === 'app_preferences' && (
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
            )}

            {selectedCategory === 'data_sync' && (
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
                copiedSyncCode={copiedSyncCode}
                handleCopySyncCode={handleCopySyncCode}
              />
            )}

            {selectedCategory === 'security_audit' && (
              <AuditLogView />
            )}
          </div>
        </section>
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

      {/* 5. App Auto-Update Modal */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        releaseInfo={updateRelease}
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
};
