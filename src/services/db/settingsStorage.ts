import { CompanyProfile } from '../../models/company.ts';
import { pouch } from '../pouchdb.ts';
import { auditTrail } from '../auditTrail.ts';
import { StorageEngine, STORAGE_KEYS, SyncedSettings, DEFAULT_COMPANY } from './storageEngine.ts';

/**
 * Settings and Company Profile domain storage.
 * Handles synced settings, allowNegativeStock, defaultDueDays, autoRoundOff, and device-local privacy.
 */
export class SettingsStorage extends StorageEngine {
  // Company Profile
  getCompany(): CompanyProfile {
    return this.get<CompanyProfile>(STORAGE_KEYS.COMPANY, DEFAULT_COMPANY);
  }

  saveCompany(company: CompanyProfile): void {
    const prevCompany = this.getCompany();
    this.set(STORAGE_KEYS.COMPANY, company);
    this.backgroundPouchPut('company', company);
    this.broadcastChange('company', 'save', company.id || 'COMP-001', company);

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType: 'SETTINGS_UPDATE',
        documentId: company.id || 'COMP-001',
        documentType: 'SETTINGS',
        summary: `Updated Company Profile (${company.businessName})`,
        previousSnapshot: prevCompany,
        newSnapshot: company,
      })
      .catch((err) => {
        console.warn('Audit trail failed during saveCompany:', err);
      });

    this.notifyListeners();
  }

  async syncBusinessProfileAcrossDevices(company: CompanyProfile): Promise<{ success: boolean; lastSyncedAt: string }> {
    this.saveCompany(company);
    const syncSuccess = await pouch.syncNow();
    return {
      success: Boolean(syncSuccess),
      lastSyncedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  }

  // Synced Settings (All settings except device-local printing & privacy settings)
  getSettings(): SyncedSettings {
    if (this.memoryCache.has(STORAGE_KEYS.SETTINGS)) {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SETTINGS) : null;
      if (this.rawCache.get(STORAGE_KEYS.SETTINGS) === raw) {
        return this.memoryCache.get(STORAGE_KEYS.SETTINGS);
      }
    }
    const defaultSettings: SyncedSettings = {
      id: 'app_settings',
      company: this.getCompany(),
      appLanguage: 'English (India)',
      isAppLockEnabled: true,
      defaultGstRate: 18,
      enableEwayBill: true,
      ewayBillThreshold: 50000,
      autoWhatsAppAlerts: true,
      allowNegativeStock: this.getAllowNegativeStock(),
      updatedAt: new Date().toISOString(),
    };
    return this.get<SyncedSettings>(STORAGE_KEYS.SETTINGS, defaultSettings);
  }

  // Allow Negative Stock Inventory Setting
  getAllowNegativeStock(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem('gst_allow_negative_stock');
      if (stored !== null) {
        return stored === 'true';
      }
      if (this.memoryCache.has(STORAGE_KEYS.SETTINGS)) {
        const cached = this.memoryCache.get(STORAGE_KEYS.SETTINGS);
        if (typeof cached?.allowNegativeStock === 'boolean') {
          return cached.allowNegativeStock;
        }
      }
      const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (typeof parsed?.allowNegativeStock === 'boolean') {
          return parsed.allowNegativeStock;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  setAllowNegativeStock(allow: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('gst_allow_negative_stock', allow.toString());
      this.saveSettings({ allowNegativeStock: allow });
      window.dispatchEvent(new CustomEvent('gst_negative_stock_change', { detail: { allow } }));
    } catch {}
  }

  // Default Payment Due Days Setting for Invoices (e.g. 0, 7, 15, 30, 45)
  getDefaultDueDays(): number {
    const settings = this.getSettings();
    return typeof settings.defaultDueDays === 'number' ? settings.defaultDueDays : 15;
  }

  setDefaultDueDays(days: number): void {
    this.saveSettings({ defaultDueDays: days });
  }

  // Auto Round-Off Grand Total on Invoices
  getAutoRoundOff(): boolean {
    const settings = this.getSettings();
    return typeof settings.autoRoundOff === 'boolean' ? settings.autoRoundOff : true;
  }

  setAutoRoundOff(enabled: boolean): void {
    this.saveSettings({ autoRoundOff: enabled });
  }

  // Device-local Buy Price Privacy Setting (Never synced to remote devices)
  getBuyPriceVisibility(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem('gst_hide_buy_prices') !== 'true';
    } catch {
      return true;
    }
  }

  setBuyPriceVisibility(visible: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('gst_hide_buy_prices', (!visible).toString());
      window.dispatchEvent(new Event('gst_buy_price_visibility_change'));
    } catch {}
  }

  saveSettings(settings: Partial<SyncedSettings>): void {
    const current = this.getSettings();
    // Explicitly exclude and strip any printing settings & device-local privacy settings so they remain device-local
    const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, showBuyPricesGlobally, ...syncable } = settings as any;
    const merged: SyncedSettings = {
      ...current,
      ...syncable,
      company: syncable.company ? syncable.company : this.getCompany(),
      updatedAt: new Date().toISOString(),
    };
    this.set(STORAGE_KEYS.SETTINGS, merged);
    if (syncable.company) {
      this.set(STORAGE_KEYS.COMPANY, syncable.company);
      this.backgroundPouchPut('company', syncable.company);
    }
    this.backgroundPouchPut('settings', merged);
    this.broadcastChange('settings', 'save', 'app_settings', merged);
    this.notifyListeners();
  }

  async syncAllSettingsAcrossDevices(settingsPayload?: Partial<SyncedSettings>): Promise<{ success: boolean; lastSyncedAt: string }> {
    if (settingsPayload) {
      this.saveSettings(settingsPayload);
    } else {
      this.saveSettings(this.getSettings());
    }
    const syncSuccess = await pouch.syncNow();
    return {
      success: Boolean(syncSuccess),
      lastSyncedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  }
}
