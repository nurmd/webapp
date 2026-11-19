// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

// Mock storage for happy-dom environment
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

import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { CompanyProfile } from '../models/company.ts';
import type { AppReleaseInfo } from '../services/updateService.ts';

const mockCompany: CompanyProfile = {
  id: 'comp_test',
  businessName: 'Bharat Traders',
  tradeName: 'Bharat Trading Co',
  gstin: '27AABCU9603R1ZN',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: '123 MG Road, Pune',
  pincode: '411001',
  city: 'Pune',
  phone: '9876543210',
  email: 'bharat@example.com',
  bankName: 'State Bank of India',
  accountNumber: '12345678901',
  ifscCode: 'SBIN0001234',
  upiId: 'bharat@sbi',
  invoicePrefix: 'INV-2026-',
  isGstEnabled: true,
};

const mockRelease: AppReleaseInfo = {
  version: 'v2.1.0',
  versionCode: 20100,
  releaseDate: '2026-11-19',
  releaseTitle: 'Fast multi-tender checkout and OTA updates',
  releaseNotes: [
    '• Optimized stock decrement engine',
    '• Added thermal printer remaining balance display',
    '• Improved payment slip typography',
  ],
  apkUrl: 'https://example.com/app.apk',
  apkSize: '15MB',
};

describe('DashboardView OTA Update Notification Banner Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('1. Banner is absent when updateInfo is omitted or null', () => {
    // Case 1: updateInfo is omitted
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    let banner = container.querySelector('[data-testid="dashboard-ota-banner"]');
    expect(banner).toBeNull();

    // Case 2: updateInfo is explicitly null
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          updateInfo={null}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    banner = container.querySelector('[data-testid="dashboard-ota-banner"]');
    expect(banner).toBeNull();
  });

  it('2. With an update present, the banner renders the version and release title, and appears above the "Financial Overview" text in document order', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          updateInfo={mockRelease}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const banner = container.querySelector('[data-testid="dashboard-ota-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');

    // Clean version (without leading 'v') and release title assertions
    expect(banner?.textContent).toContain('2.1.0');
    expect(banner?.textContent).toContain('Update available — v2.1.0');
    expect(banner?.textContent).toContain('Fast multi-tender checkout and OTA updates');

    // Document order check: Banner must appear BEFORE "Financial Overview" in document order
    const fullText = container.textContent || '';
    const bannerOffset = fullText.indexOf('Update available — v2.1.0');
    const financialOverviewOffset = fullText.indexOf('Financial Overview');

    expect(bannerOffset).toBeGreaterThanOrEqual(0);
    expect(financialOverviewOffset).toBeGreaterThan(bannerOffset);
  });

  it('3. Clicking the Update button calls onOpenUpdate once', () => {
    const onOpenUpdate = vi.fn();

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          updateInfo={mockRelease}
          onOpenUpdate={onOpenUpdate}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const banner = container.querySelector('[data-testid="dashboard-ota-banner"]');
    expect(banner).not.toBeNull();

    const buttons = Array.from(banner!.querySelectorAll('button'));
    const updateButton = buttons.find((btn) => btn.textContent?.trim() === 'Update');
    expect(updateButton).toBeDefined();

    act(() => {
      updateButton!.click();
    });

    expect(onOpenUpdate).toHaveBeenCalledTimes(1);
  });

  it('4. Clicking the dismiss button calls onDismissUpdate and not onOpenUpdate', () => {
    const onOpenUpdate = vi.fn();
    const onDismissUpdate = vi.fn();

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          updateInfo={mockRelease}
          onOpenUpdate={onOpenUpdate}
          onDismissUpdate={onDismissUpdate}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const banner = container.querySelector('[data-testid="dashboard-ota-banner"]');
    expect(banner).not.toBeNull();

    const dismissButton = banner!.querySelector('button[aria-label="Dismiss update notification"]') as HTMLButtonElement;
    expect(dismissButton).not.toBeNull();

    act(() => {
      dismissButton.click();
    });

    expect(onDismissUpdate).toHaveBeenCalledTimes(1);
    expect(onOpenUpdate).not.toHaveBeenCalled();
  });

  it('5. The banner contains no release-note bullet text (compactness guard)', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          updateInfo={mockRelease}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const banner = container.querySelector('[data-testid="dashboard-ota-banner"]');
    expect(banner).not.toBeNull();

    // Verify none of the individual release notes are rendered in the compact banner
    for (const note of mockRelease.releaseNotes) {
      expect(banner?.textContent).not.toContain(note);
    }
    expect(banner?.textContent).not.toContain('Optimized stock decrement engine');
    expect(banner?.textContent).not.toContain('Added thermal printer remaining balance display');

    // Verify no lists are rendered inside the banner
    expect(banner?.querySelectorAll('ul').length).toBe(0);
    expect(banner?.querySelectorAll('li').length).toBe(0);
  });

  it('6. Static guard: App.tsx passes updateInfo, onOpenUpdate and onDismissUpdate to DashboardView, and gates updateInfo on hasUpdate', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    expect(fs.existsSync(appPath), 'src/App.tsx must exist').toBe(true);
    const appSource = fs.readFileSync(appPath, 'utf-8');

    // Extract DashboardView JSX element from App.tsx
    const dashboardMatch = appSource.match(/<DashboardView[\s\S]*?\/>/);
    expect(dashboardMatch, 'App.tsx must render <DashboardView />').not.toBeNull();

    const dashboardJsx = dashboardMatch![0];

    // Assert updateInfo, onOpenUpdate, and onDismissUpdate props are passed
    expect(dashboardJsx).toContain('updateInfo=');
    expect(dashboardJsx).toContain('onOpenUpdate=');
    expect(dashboardJsx).toContain('onDismissUpdate=');

    // Assert updateInfo prop is conditionally gated on hasUpdate
    expect(dashboardJsx).toMatch(/updateInfo=\{[^}]*hasUpdate[^}]*\}/);
  });
});
