// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

vi.mock('../services/auditTrail.ts', () => ({
  auditTrail: {
    logAction: vi.fn(async () => {}),
    getRecentLogs: vi.fn(async () => []),
    getLogsByDocument: vi.fn(async () => []),
  },
}));

import { CompanyProfile } from '../models/company.ts';
import { Header } from '../components/Shell/Header.tsx';
import { TabletSidebar } from '../components/Shell/TabletSidebar.tsx';
import { NavigationMenuHubView } from '../components/Navigation/NavigationMenuHubView.tsx';

const sampleCompany: CompanyProfile = {
  id: 'COMP-TEST-001',
  businessName: 'Apex Enterprise GST Test',
  tradeName: 'Apex GST',
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  email: 'test@apex.com',
  phone: '9876543210',
  address: 'Mumbai, Maharashtra',
  city: 'Mumbai',
  stateCode: '27',
  pincode: '400001',
  isGstEnabled: true,
};

describe('Navigation Shell & More Menu Redesign Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.clearAllMocks();
  });

  describe('1. NavigationMenuHubView Redesign Contracts', () => {
    it('does NOT render Create Invoice CTA, POS button, Fast Retail POS Counter, or Barcode Catalog', () => {
      const onNavigate = vi.fn();

      act(() => {
        root!.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={onNavigate}
          />
        );
      });

      const text = container?.textContent || '';
      expect(text).not.toContain('Create New GST Invoice');
      expect(text).not.toContain('Create New Invoice');
      expect(text).not.toContain('Fast Retail POS Counter');
      expect(text).not.toContain('Barcode Catalog & Labels');

      // Verify no POS CTA button
      const posButtons = Array.from(container?.querySelectorAll('button') || []).filter(
        (b) => b.textContent?.trim() === 'POS'
      );
      expect(posButtons.length).toBe(0);
    });

    it('renders Dashboard, Print Settings, and Business Profile & Settings and routes correctly', () => {
      const onNavigate = vi.fn();

      act(() => {
        root!.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={onNavigate}
          />
        );
      });

      // 1. Dashboard card
      const dashboardCard = Array.from(container?.querySelectorAll('button, div[role="button"]') || []).find(
        (el) => el.textContent?.includes('Dashboard') && el.textContent?.includes('Business summary')
      );
      expect(dashboardCard).toBeDefined();
      act(() => {
        (dashboardCard as HTMLElement).click();
      });
      expect(onNavigate).toHaveBeenCalledWith('dashboard');

      // 2. Print Settings card
      const printSettingsCard = Array.from(container?.querySelectorAll('button, div[role="button"]') || []).find(
        (el) => el.textContent?.includes('Print Settings') && el.textContent?.includes('Thermal printer roll width')
      );
      expect(printSettingsCard).toBeDefined();
      act(() => {
        (printSettingsCard as HTMLElement).click();
      });
      expect(onNavigate).toHaveBeenCalledWith('print_settings');

      // 3. Business Profile & Settings card
      const businessSettingsCard = Array.from(container?.querySelectorAll('button, div[role="button"]') || []).find(
        (el) => el.textContent?.includes('Business Profile & Settings') && el.textContent?.includes('Company details')
      );
      expect(businessSettingsCard).toBeDefined();
      act(() => {
        (businessSettingsCard as HTMLElement).click();
      });
      expect(onNavigate).toHaveBeenCalledWith('settings');
    });

    it('renders the merchant card settings gear with aria-label="Open Settings" and calls onNavigate("settings")', () => {
      const onNavigate = vi.fn();

      act(() => {
        root!.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={onNavigate}
          />
        );
      });

      const settingsGear = container?.querySelector('button[aria-label="Open Settings"]');
      expect(settingsGear).toBeDefined();
      expect(settingsGear?.textContent).toContain('settings');

      act(() => {
        (settingsGear as HTMLButtonElement).click();
      });
      expect(onNavigate).toHaveBeenCalledWith('settings');
    });

    it('renders Overview filter pill and neutral Sales filter pill with receipt_long icon', () => {
      const onNavigate = vi.fn();

      act(() => {
        root!.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={onNavigate}
          />
        );
      });

      const buttons = Array.from(container?.querySelectorAll('button') || []);
      const overviewPill = buttons.find((b) => b.textContent?.includes('Overview'));
      expect(overviewPill).toBeDefined();
      expect(overviewPill?.textContent).toContain('dashboard');

      const salesPill = buttons.find((b) => b.textContent?.includes('Sales'));
      expect(salesPill).toBeDefined();
      expect(salesPill?.textContent).toContain('receipt_long');
      expect(salesPill?.textContent).not.toContain('point_of_sale');
    });
  });

  describe('2. Header Navigation Chrome Redesign Contracts', () => {
    it('renders always-visible More button with aria-label="Open More menu" and calls onOpenMore', () => {
      const onOpenMore = vi.fn();
      const onNewInvoice = vi.fn();
      const onOpenSettings = vi.fn();

      act(() => {
        root!.render(
          <Header
            company={sampleCompany}
            onOpenMore={onOpenMore}
            onOpenSettings={onOpenSettings}
            onNewInvoice={onNewInvoice}
          />
        );
      });

      const moreButton = container?.querySelector('button[aria-label="Open More menu"]') as HTMLButtonElement;
      expect(moreButton).toBeDefined();
      expect(moreButton.textContent).toContain('grid_view');
      // Ensure md:hidden is removed so button is visible on tablet/desktop
      expect(moreButton.className).not.toContain('md:hidden');

      act(() => {
        moreButton.click();
      });
      expect(onOpenMore).toHaveBeenCalledTimes(1);

      // Verify old drawer toggle label is absent
      const oldDrawerButton = container?.querySelector('button[aria-label="Open Navigation Drawer"]');
      expect(oldDrawerButton).toBeNull();
    });

    it('falls back to onOpenDrawer if onOpenMore is not supplied', () => {
      const onOpenDrawer = vi.fn();
      const onNewInvoice = vi.fn();

      act(() => {
        root!.render(
          <Header
            company={sampleCompany}
            onOpenDrawer={onOpenDrawer}
            onNewInvoice={onNewInvoice}
          />
        );
      });

      const moreButton = container?.querySelector('button[aria-label="Open More menu"]') as HTMLButtonElement;
      expect(moreButton).toBeDefined();

      act(() => {
        moreButton.click();
      });
      expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    });

    it('renders settings gear button with aria-label="Open Settings" and calls onOpenSettings', () => {
      const onOpenMore = vi.fn();
      const onNewInvoice = vi.fn();
      const onOpenSettings = vi.fn();

      act(() => {
        root!.render(
          <Header
            company={sampleCompany}
            onOpenMore={onOpenMore}
            onOpenSettings={onOpenSettings}
            onNewInvoice={onNewInvoice}
          />
        );
      });

      const settingsButton = container?.querySelector('button[aria-label="Open Settings"]') as HTMLButtonElement;
      expect(settingsButton).toBeDefined();
      expect(settingsButton.textContent).toContain('settings');

      act(() => {
        settingsButton.click();
      });
      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('retains New Bill and Barcode scanner quick action buttons', () => {
      const onNewInvoice = vi.fn();
      const onBarcodeClick = vi.fn();

      act(() => {
        root!.render(
          <Header
            company={sampleCompany}
            onNewInvoice={onNewInvoice}
            onBarcodeClick={onBarcodeClick}
          />
        );
      });

      const text = container?.textContent || '';
      expect(text).toContain('New Bill');

      const barcodeButton = container?.querySelector('button[aria-label="POS Counter & Barcode Scanner"]') as HTMLButtonElement;
      expect(barcodeButton).toBeDefined();
      act(() => {
        barcodeButton.click();
      });
      expect(onBarcodeClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. TabletSidebar Navigation Contracts', () => {
    it('renders with data-testid="tablet-sidebar", responsive hidden md:flex classes, and navigates', () => {
      const onSelectTab = vi.fn();

      act(() => {
        root!.render(
          <TabletSidebar
            activeTab="dashboard"
            company={sampleCompany}
            onSelectTab={onSelectTab}
          />
        );
      });

      const sidebar = container?.querySelector('aside[data-testid="tablet-sidebar"]');
      expect(sidebar).toBeDefined();
      expect(sidebar?.getAttribute('aria-label')).toBe('Primary navigation');
      expect(sidebar?.className).toContain('hidden');
      expect(sidebar?.className).toContain('md:flex');

      const text = sidebar?.textContent || '';
      expect(text).toContain('Dashboard');
      expect(text).toContain('Sales & Invoices');
      expect(text).toContain('Navigation Hub');
      expect(text).toContain('Company Settings');

      // Must NOT contain removed POS or Create Sale Bill actions
      expect(text).not.toContain('Fast POS Counter');
      expect(text).not.toContain('Create Sale Bill');

      // Click Sales & Invoices
      const salesButton = Array.from(sidebar?.querySelectorAll('button') || []).find(
        (b) => b.textContent?.includes('Sales & Invoices')
      );
      expect(salesButton).toBeDefined();
      act(() => {
        salesButton!.click();
      });
      expect(onSelectTab).toHaveBeenCalledWith('sales');
    });
  });

  describe('4. Shell Architecture Static Contract Check (App.tsx)', () => {
    it('verifies App.tsx mounts <TabletSidebar, has no <Drawer JSX mounts and no isDrawerOpen state', () => {
      const appFilePath = path.resolve(__dirname, '../App.tsx');
      const source = fs.readFileSync(appFilePath, 'utf-8');

      // Must render TabletSidebar
      expect(source).toMatch(/<TabletSidebar/);

      // Must not render Drawer
      expect(source).not.toMatch(/<Drawer[\s\n>]/);

      // Must not have isDrawerOpen state variable
      expect(source).not.toContain('isDrawerOpen');

      // Must retain AppTab import from Drawer.tsx
      expect(source).toMatch(/import\s*\{\s*AppTab\s*\}\s*from\s*['"]\.\/components\/Shell\/Drawer\.tsx['"]/);

      // Must wire onOpenMore and onOpenSettings to Header
      expect(source).toContain('onOpenMore={handleOpenMore}');
      expect(source).toContain('onOpenSettings={handleOpenSettings}');

      // Must not pass onNewInvoice to NavigationMenuHubView
      const menuHubMatch = source.match(/<NavigationMenuHubView[\s\S]*?\/>/);
      expect(menuHubMatch).not.toBeNull();
      expect(menuHubMatch![0]).not.toContain('onNewInvoice=');
    });
  });
});
