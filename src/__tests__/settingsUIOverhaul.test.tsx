import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

// Mock storage
class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

// Mock pouchdb
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

import { pouch } from '../services/pouchdb.ts';
import { db } from '../services/db.ts';
import { CompanyProfile } from '../models/company.ts';
import {
  CompanySettingsView,
  SETTINGS_CATEGORIES,
  normalizeSettingsTab,
} from '../components/Settings/CompanySettingsView.tsx';
import { CompanyProfileTab } from '../components/Settings/CompanyProfileTab.tsx';
import { GeneralSettingsTab } from '../components/Settings/GeneralSettingsTab.tsx';
import { BillingInvoicesTab } from '../components/Settings/tabs/BillingInvoicesTab.tsx';
import { AppPreferencesTab } from '../components/Settings/tabs/AppPreferencesTab.tsx';
import { DataSyncTab } from '../components/Settings/tabs/DataSyncTab.tsx';

describe('Settings UI Overhaul Comprehensive Test Suite (TC-SET-01 to TC-SET-22)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const sampleCompany: CompanyProfile = {
    id: 'comp_1',
    businessName: 'Vyapar Demo Mart',
    tradeName: 'Wholesale & Retail Groceries',
    gstin: '27AABCU9603R1ZN',
    pan: 'AABCU9603R',
    stateCode: '27',
    address: '101 Market Yard Road',
    pincode: '411001',
    city: 'Pune',
    phone: '+91 98765 43210',
    email: 'contact@vyaparmart.in',
    bankName: 'HDFC Bank',
    accountNumber: '50100234567890',
    ifscCode: 'HDFC0001234',
    upiId: 'vyapar@okhdfcbank',
    invoicePrefix: 'VM-2026-',
    isGstEnabled: true,
  };

  beforeEach(() => {
    testStorage.clear();
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function changeInput(input: HTMLInputElement, value: string) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeInputValueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // TC-SET-01: Navigation Menu - 7 Categories Render
  it('TC-SET-01: renders all 7 category navigation buttons with labels, subtitles, and icons', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const expectedCategories = [
      { id: 'business_profile', label: 'Business Profile' },
      { id: 'billing_invoices', label: 'Billing & Invoices' },
      { id: 'inventory_items', label: 'Inventory & Items' },
      { id: 'hardware_printing', label: 'Hardware & Printing' },
      { id: 'app_preferences', label: 'App Preferences' },
      { id: 'data_sync', label: 'Data & Sync' },
      { id: 'security_audit', label: 'Security & Audit' },
    ];

    for (const cat of expectedCategories) {
      const btn = container.querySelector(`[data-testid="category-btn-${cat.id}"]`);
      expect(btn, `Category button for ${cat.id} should be rendered`).not.toBeNull();
      expect(btn?.textContent).toContain(cat.label);
    }

    // Assert Lucide SVG icons are present in the sidebar
    const svgs = container.querySelectorAll('[data-testid="settings-sidebar"] svg');
    expect(svgs.length).toBeGreaterThanOrEqual(7);
  });

  // TC-SET-02: Default View - Initial Selection
  it('TC-SET-02: renders Category 1 (Business Profile) as active by default on mount', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    // Verify Business Profile content is rendered
    expect(container.textContent).toContain('Vyapar Demo Mart');
    expect(container.textContent).toContain('27AABCU9603R1ZN');
    expect(container.textContent).toContain('GST Portal Verified');
    expect(container.textContent).toContain('GST & Legal Tax Configuration');
  });

  // TC-SET-03: Category Switch - Billing & Invoices
  it('TC-SET-03: clicking "Billing & Invoices" renders invoice series, payment QR, default format, and alerts', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const billingBtn = container.querySelector('[data-testid="category-btn-billing_invoices"]') as HTMLButtonElement;
    act(() => {
      billingBtn.click();
    });

    expect(container.textContent).toContain('Invoice Numbering & Prefix');
    expect(container.textContent).toContain('Payment QR & Bank Details');
    expect(container.textContent).toContain('Default Print Format');
    expect(container.textContent).toContain('Automated WhatsApp & SMS Alerts');
  });

  // TC-SET-04: Category Switch - Inventory & Items
  it('TC-SET-04: clicking "Inventory & Items" renders ItemSettingsTab with Negative Stock and Buy Price controls', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const itemsBtn = container.querySelector('[data-testid="category-btn-inventory_items"]') as HTMLButtonElement;
    act(() => {
      itemsBtn.click();
    });

    expect(container.textContent).toContain('Items & Inventory Settings');
    expect(container.textContent).toContain('Allow Negative Stock');
    expect(container.textContent).toContain('Show Buy / Purchase Prices');
  });

  // TC-SET-05: Category Switch - Hardware & Printing
  it('TC-SET-05: clicking "Hardware & Printing" renders PrintSettingsView with A4 and Thermal slip options', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const printBtn = container.querySelector('[data-testid="category-btn-hardware_printing"]') as HTMLButtonElement;
    act(() => {
      printBtn.click();
    });

    expect(container.textContent).toContain('Print & Invoice Settings');
    expect(container.textContent).toContain('A4 Laser');
    expect(container.textContent).toContain('Thermal POS');
  });

  // TC-SET-06: Category Switch - App Preferences
  it('TC-SET-06: clicking "App Preferences" renders App Language, App Lock PIN, and OTA update card', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const prefBtn = container.querySelector('[data-testid="category-btn-app_preferences"]') as HTMLButtonElement;
    act(() => {
      prefBtn.click();
    });

    expect(container.textContent).toContain('App Updates & OTA');
    expect(container.textContent).toContain('App Language');
    expect(container.textContent).toContain('App Lock & 4-Digit PIN');
  });

  // TC-SET-07: Category Switch - Data & Sync
  it('TC-SET-07: clicking "Data & Sync" renders multi-device sync, Pair via QR, and CouchDB cloud sync', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const syncBtn = container.querySelector('[data-testid="category-btn-data_sync"]') as HTMLButtonElement;
    act(() => {
      syncBtn.click();
    });

    expect(container.textContent).toContain('Sync All Settings Across Devices');
    expect(container.textContent).toContain('Pair via QR');
    expect(container.textContent).toContain('Import Settings');
    expect(container.textContent).toContain('Store Data Protected');
    expect(container.textContent).toContain('Sync Now');
  });

  // TC-SET-08: Category Switch - Security & Audit
  it('TC-SET-08: clicking "Security & Audit" renders AuditLogView with MCA Rule 3(1) trail', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const auditBtn = container.querySelector('[data-testid="category-btn-security_audit"]') as HTMLButtonElement;
    act(() => {
      auditBtn.click();
    });

    expect(container.textContent).toContain('Audit Trail');
  });

  // TC-SET-09: Custom Events - Legacy Tab Compatibility
  it('TC-SET-09: dispatches switch_settings_tab with legacy "items" detail and switches to inventory_items', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('switch_settings_tab', { detail: 'items' }));
    });

    expect(container.textContent).toContain('Items & Inventory Settings');
    expect(container.textContent).toContain('Allow Negative Stock');
  });

  // TC-SET-10: Custom Events - Direct Category Event
  it('TC-SET-10: dispatches switch_settings_tab with direct "billing_invoices" detail and switches view', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('switch_settings_tab', { detail: 'billing_invoices' }));
    });

    expect(container.textContent).toContain('Invoice Numbering & Prefix');
    expect(container.textContent).toContain('Payment QR & Bank Details');
  });

  // TC-SET-11: Mobile Ergonomics - Mobile List-to-Detail
  it('TC-SET-11: selecting a category on mobile opens the detail view and displays the Back button', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const prefBtn = container.querySelector('[data-testid="category-btn-app_preferences"]') as HTMLButtonElement;
    act(() => {
      prefBtn.click();
    });

    const backBtn = container.querySelector('[data-testid="mobile-back-btn"]');
    expect(backBtn).not.toBeNull();
    expect(backBtn?.textContent).toContain('Back to Settings');
  });

  // TC-SET-12: Mobile Ergonomics - Mobile Back Button
  it('TC-SET-12: clicking "Back to Settings" on mobile detail view returns to category list', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    // Enter detail view
    const prefBtn = container.querySelector('[data-testid="category-btn-app_preferences"]') as HTMLButtonElement;
    act(() => {
      prefBtn.click();
    });

    // Click back button
    const backBtn = container.querySelector('[data-testid="mobile-back-btn"]') as HTMLButtonElement;
    act(() => {
      backBtn.click();
    });

    // Content pane should have hidden class on mobile
    const contentPane = container.querySelector('[data-testid="settings-content-pane"]');
    expect(contentPane?.className).toContain('hidden md:block');

    const sidebar = container.querySelector('[data-testid="settings-sidebar"]');
    expect(sidebar?.className).toContain('block');
  });

  // TC-SET-13: State Persistence - Master GST Billing Toggle
  it('TC-SET-13: toggling the GST master switch updates profile.isGstEnabled and invokes onSave & db.syncAllSettingsAcrossDevices', async () => {
    const onSaveMock = vi.fn();
    const syncSpy = vi.spyOn(db, 'syncAllSettingsAcrossDevices').mockResolvedValue({ success: true, lastSyncedAt: 'Just now' });

    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={onSaveMock} />);
    });

    const gstSwitch = container.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(gstSwitch).not.toBeNull();

    act(() => {
      gstSwitch.click();
    });

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isGstEnabled: false,
      })
    );
    expect(syncSpy).toHaveBeenCalled();
  });

  // TC-SET-14: State Persistence - Default Print Format
  it('TC-SET-14: selecting "3\\" (80mm)" format updates defaultPrintOption in localStorage', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const billingBtn = container.querySelector('[data-testid="category-btn-billing_invoices"]') as HTMLButtonElement;
    act(() => {
      billingBtn.click();
    });

    // Find 3" (80mm) format button
    const formatButtons = Array.from(container.querySelectorAll('button'));
    const thermal80Btn = formatButtons.find((b) => b.textContent?.includes('3" (80mm)'));
    expect(thermal80Btn).toBeDefined();

    act(() => {
      thermal80Btn?.click();
    });

    expect(testStorage.getItem('defaultPrintOption')).toBe('Thermal-80mm');
  });

  // TC-SET-15: State Persistence - Allow Negative Stock
  it('TC-SET-15: toggling Allow Negative Stock calls db.setAllowNegativeStock', () => {
    const negStockSpy = vi.spyOn(db, 'setAllowNegativeStock');

    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const itemsBtn = container.querySelector('[data-testid="category-btn-inventory_items"]') as HTMLButtonElement;
    act(() => {
      itemsBtn.click();
    });

    const checkbox = container.querySelector('input[aria-label="Toggle Allow Negative Stock"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();

    act(() => {
      checkbox.click();
    });

    expect(negStockSpy).toHaveBeenCalledWith(true);
  });

  // TC-SET-16: State Persistence - Buy Price Visibility
  it('TC-SET-16: toggling Buy Price Visibility calls db.setBuyPriceVisibility', () => {
    const buyPriceSpy = vi.spyOn(db, 'setBuyPriceVisibility');

    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const itemsBtn = container.querySelector('[data-testid="category-btn-inventory_items"]') as HTMLButtonElement;
    act(() => {
      itemsBtn.click();
    });

    // The buy price checkbox is the second checkbox on ItemSettingsTab
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const buyPriceCheckbox = checkboxes.find((c) => c.getAttribute('aria-label') !== 'Toggle Allow Negative Stock');
    expect(buyPriceCheckbox).toBeDefined();

    act(() => {
      buyPriceCheckbox?.click();
    });

    expect(buyPriceSpy).toHaveBeenCalled();
  });

  // TC-SET-17: State Persistence - App Language
  it('TC-SET-17: clicking "हिंदी" language option updates active language', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const prefBtn = container.querySelector('[data-testid="category-btn-app_preferences"]') as HTMLButtonElement;
    act(() => {
      prefBtn.click();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const hindiBtn = buttons.find((b) => b.textContent?.trim() === 'हिंदी');
    expect(hindiBtn).toBeDefined();

    act(() => {
      hindiBtn?.click();
    });

    expect(hindiBtn?.className).toContain('bg-secondary text-on-secondary');
  });

  // TC-SET-18: Service Integration - Cloud Sync Now
  it('TC-SET-18: clicking "Sync Now" triggers pouch.syncNow and db.syncAllFromPouch', async () => {
    vi.mocked(pouch.getSyncState).mockReturnValue({
      status: 'synced',
      remoteUrl: 'https://admin:pass@remote.cloud.com/store_db',
      pendingChanges: 0,
    });
    const syncFromPouchSpy = vi.spyOn(db, 'syncAllFromPouch').mockResolvedValue();

    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const syncBtn = container.querySelector('[data-testid="category-btn-data_sync"]') as HTMLButtonElement;
    act(() => {
      syncBtn.click();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const syncNowBtn = buttons.find((b) => b.textContent?.includes('Sync Now'));
    expect(syncNowBtn).toBeDefined();

    await act(async () => {
      syncNowBtn?.click();
    });

    expect(pouch.syncNow).toHaveBeenCalled();
    expect(syncFromPouchSpy).toHaveBeenCalled();
  });

  // TC-SET-19: Service Integration - CouchDB Remote URL Connect
  it('TC-SET-19: configuring CouchDB remote URL and clicking Connect calls pouch.startSync', async () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const syncBtn = container.querySelector('[data-testid="category-btn-data_sync"]') as HTMLButtonElement;
    act(() => {
      syncBtn.click();
    });

    // Open tune config
    const tuneBtn = container.querySelector('button[aria-label="Configure Sync"]') as HTMLButtonElement;
    expect(tuneBtn).not.toBeNull();
    act(() => {
      tuneBtn.click();
    });

    // Enter URL using changeInput helper
    const input = container.querySelector('[data-testid="sync-url-input"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    act(() => {
      changeInput(input, 'https://admin:pass@remote.cloud.com/store_db');
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const connectBtn = buttons.find((b) => b.textContent === 'Connect');
    expect(connectBtn).toBeDefined();

    act(() => {
      connectBtn?.click();
    });

    expect(pouch.startSync).toHaveBeenCalledWith('https://admin:pass@remote.cloud.com/store_db');
  });

  // TC-SET-20: Modal Dismissal - Edit Profile Modal Open & Close
  it('TC-SET-20: opening Edit Business Profile modal mounts dialog and closes on cancel', () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const editBtn = buttons.find((b) => b.textContent?.includes('Edit Profile'));
    expect(editBtn).toBeDefined();

    act(() => {
      editBtn?.click();
    });

    // Edit modal should now be open
    expect(document.body.textContent).toContain('Edit Business Profile');

    // Find cancel button in modal
    const cancelBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel'
    );
    expect(cancelBtn).toBeDefined();

    act(() => {
      cancelBtn?.click();
    });

    // Modal is dismissed
    expect(document.body.querySelector('[data-testid="edit-business-profile-modal"]')).toBeNull();
  });

  // TC-SET-21: Structural Invariants - Named Export Retention
  it('TC-SET-21: preserves all named exports and category schema normalization', () => {
    expect(typeof CompanySettingsView).toBe('function');
    expect(typeof CompanyProfileTab).toBe('function');
    expect(typeof GeneralSettingsTab).toBe('function');
    expect(typeof BillingInvoicesTab).toBe('function');
    expect(typeof AppPreferencesTab).toBe('function');
    expect(typeof DataSyncTab).toBe('function');

    expect(SETTINGS_CATEGORIES).toHaveLength(7);

    // Verify normalization
    expect(normalizeSettingsTab('profile')).toBe('business_profile');
    expect(normalizeSettingsTab('items')).toBe('inventory_items');
    expect(normalizeSettingsTab('print')).toBe('hardware_printing');
    expect(normalizeSettingsTab('general')).toBe('app_preferences');
    expect(normalizeSettingsTab('audit')).toBe('security_audit');
    expect(normalizeSettingsTab('billing_invoices')).toBe('billing_invoices');
    expect(normalizeSettingsTab('data_sync')).toBe('data_sync');
  });

  // TC-SET-22: Structural Invariants - Cycle-Free Components
  it('TC-SET-22: ensures zero circular dependency cycles exist across Settings subtree', () => {
    const settingsDir = path.resolve(__dirname, '..', 'components', 'Settings');
    const fileList: string[] = [];

    function collectFiles(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          fileList.push(fullPath);
        }
      }
    }

    collectFiles(settingsDir);
    expect(fileList.length).toBeGreaterThanOrEqual(7);

    const graph: Record<string, string[]> = {};
    const importRegex = /(?:import|export)\s+.*?from\s+['"](.*?)['"]/g;

    for (const file of fileList) {
      const content = fs.readFileSync(file, 'utf-8');
      const dir = path.dirname(file);
      const deps: string[] = [];
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.')) {
          let resolved = path.resolve(dir, importPath);
          if (!fs.existsSync(resolved)) {
            if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
            else if (fs.existsSync(resolved + '.tsx')) resolved += '.tsx';
            else if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
            else if (fs.existsSync(path.join(resolved, 'index.tsx'))) resolved = path.join(resolved, 'index.tsx');
          }
          if (fileList.includes(resolved)) {
            deps.push(resolved);
          }
        }
      }
      graph[file] = deps;
    }

    // DFS cycle detection
    const visited: Record<string, boolean> = {};
    const recStack: Record<string, boolean> = {};
    const cycles: string[][] = [];

    function dfs(node: string, currentPath: string[]) {
      visited[node] = true;
      recStack[node] = true;
      currentPath.push(node);

      for (const neighbor of graph[node] || []) {
        if (!visited[neighbor]) {
          dfs(neighbor, [...currentPath]);
        } else if (recStack[neighbor]) {
          const cyclePath = currentPath.slice(currentPath.indexOf(neighbor));
          cyclePath.push(neighbor);
          cycles.push(cyclePath);
        }
      }

      recStack[node] = false;
    }

    for (const file of fileList) {
      if (!visited[file]) {
        dfs(file, []);
      }
    }

    expect(cycles).toEqual([]);
  });
});
