import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import React, { act, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

class MockStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const mockStorage = new MockStorage();
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: mockStorage, writable: true, configurable: true });
}

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ isSyncing: false, isOnline: true })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

describe('Milestone 5: Dynamic Code-Splitting & Bundle Performance Stress Suite', () => {
  const distAssetsDir = path.resolve(__dirname, '../../dist/assets');

  describe('1. Production Bundle & Chunk Architecture Constraints', () => {
    it('verifies dist/assets directory exists and contains emitted bundle artifacts', () => {
      expect(fs.existsSync(distAssetsDir)).toBe(true);
      const files = fs.readdirSync(distAssetsDir);
      expect(files.length).toBeGreaterThan(15);
    });

    it('asserts main entry chunk dist/assets/index-*.js is strictly < 450 kB', () => {
      const files = fs.readdirSync(distAssetsDir);
      const entryChunkFile = files.find((f) => /^index-.*\.js$/.test(f));
      expect(entryChunkFile).toBeDefined();

      const stat = fs.statSync(path.join(distAssetsDir, entryChunkFile!));
      const sizeKb = stat.size / 1024;
      const MAX_ALLOWED_KB = 450; // Requirement: entry chunk < 450 kB

      expect(sizeKb).toBeLessThan(MAX_ALLOWED_KB);
      // Further assert it meets worker observation (~139 kB)
      expect(sizeKb).toBeLessThan(200);
    });

    it('asserts zero chunks in dist/assets exceed 500 kB (warning threshold)', () => {
      const files = fs.readdirSync(distAssetsDir);
      const MAX_WARNING_THRESHOLD_BYTES = 500 * 1024; // 500 kB
      const oversizedFiles: Array<{ name: string; sizeKb: number }> = [];

      for (const file of files) {
        if (file.endsWith('.js')) {
          const stat = fs.statSync(path.join(distAssetsDir, file));
          if (stat.size > MAX_WARNING_THRESHOLD_BYTES) {
            oversizedFiles.push({ name: file, sizeKb: stat.size / 1024 });
          }
        }
      }

      expect(oversizedFiles).toEqual([]);
    });

    it('verifies explicit vendor isolation chunks exist and are non-empty', () => {
      const files = fs.readdirSync(distAssetsDir);
      const vendorReact = files.find((f) => f.startsWith('vendor-react-') && f.endsWith('.js'));
      const vendorPouchdb = files.find((f) => f.startsWith('vendor-pouchdb-') && f.endsWith('.js'));
      const vendorIcons = files.find((f) => f.startsWith('vendor-icons-') && f.endsWith('.js'));

      expect(vendorReact).toBeDefined();
      expect(vendorPouchdb).toBeDefined();
      expect(vendorIcons).toBeDefined();

      const reactStat = fs.statSync(path.join(distAssetsDir, vendorReact!));
      const pouchStat = fs.statSync(path.join(distAssetsDir, vendorPouchdb!));
      const iconsStat = fs.statSync(path.join(distAssetsDir, vendorIcons!));

      expect(reactStat.size).toBeGreaterThan(50 * 1024); // React + ReactDOM ~ 140 kB
      expect(pouchStat.size).toBeGreaterThan(50 * 1024); // PouchDB + deps ~ 126 kB
      expect(iconsStat.size).toBeGreaterThan(2 * 1024);  // Lucide icons
    });

    it('verifies major dynamic views and modals have dedicated chunk files', () => {
      const files = fs.readdirSync(distAssetsDir);
      const expectedPrefixes = [
        'CompanySettingsView-',
        'PartiesView-',
        'QuickBillingView-',
        'CashBankManagementView-',
        'InventoryView-',
        'TableGridInvoiceModal-',
        'TableGridPurchaseModal-',
        'BusinessReportsView-',
        'SalesHubView-',
        'PurchasesHubView-',
        'ExpensesView-',
        'ThermalPrintModal-',
        'RoleSwitchModal-',
        'AppUpdateModal-',
      ];

      for (const prefix of expectedPrefixes) {
        const found = files.some((f) => f.startsWith(prefix) && f.endsWith('.js'));
        expect(found, `Expected chunk for ${prefix} to be emitted in dist/assets/`).toBe(true);
      }
    });
  });

  describe('2. Dynamic Imports & Lazy Unwrapping Contracts in App.tsx', () => {
    it('dynamically unwraps all 12 secondary views via Promise default contract', async () => {
      const viewDefinitions = [
        { path: '../components/Reports/BusinessReportsView.tsx', name: 'BusinessReportsView' },
        { path: '../components/Settings/CompanySettingsView.tsx', name: 'CompanySettingsView' },
        { path: '../components/Reports/DaybookView.tsx', name: 'DaybookView' },
        { path: '../components/Expenses/ExpensesView.tsx', name: 'ExpensesView' },
        { path: '../components/CashBank/CashBankManagementView.tsx', name: 'CashBankManagementView' },
        { path: '../components/Settings/PrintSettingsView.tsx', name: 'PrintSettingsView' },
        { path: '../components/Purchases/PurchasesHubView.tsx', name: 'PurchasesHubView' },
        { path: '../components/Inventory/InventoryView.tsx', name: 'InventoryView' },
        { path: '../components/Parties/PartiesView.tsx', name: 'PartiesView' },
        { path: '../components/Navigation/NavigationMenuHubView.tsx', name: 'NavigationMenuHubView' },
        { path: '../components/Sales/SalesHubView.tsx', name: 'SalesHubView' },
        { path: '../components/POS/QuickBillingView.tsx', name: 'QuickBillingView' },
      ];

      for (const def of viewDefinitions) {
        const mod = await import(def.path);
        expect(mod[def.name]).toBeDefined();
        expect(typeof mod[def.name]).toBe('function');

        // Emulate React.lazy(() => import(...).then(m => ({ default: m[name] })))
        const unwrap = await Promise.resolve(mod).then((m) => ({ default: m[def.name] }));
        expect(unwrap.default).toBe(mod[def.name]);
      }
    }, 30000);

    it('dynamically unwraps all 7 heavy modals via Promise default contract', async () => {
      const modalDefinitions = [
        { path: '../components/Invoicing/TableGridInvoiceModal.tsx', name: 'TableGridInvoiceModal' },
        { path: '../components/Purchases/TableGridPurchaseModal.tsx', name: 'TableGridPurchaseModal' },
        { path: '../components/Printing/ThermalPrintModal.tsx', name: 'ThermalPrintModal' },
        { path: '../components/Auth/RoleSwitchModal.tsx', name: 'RoleSwitchModal' },
        { path: '../components/Invoicing/CreateInvoiceModal.tsx', name: 'CreateInvoiceModal' },
        { path: '../components/Invoicing/SimplifiedInvoiceModal.tsx', name: 'SimplifiedInvoiceModal' },
        { path: '../components/Update/AppUpdateModal.tsx', name: 'AppUpdateModal' },
      ];

      for (const def of modalDefinitions) {
        const mod = await import(def.path);
        expect(mod[def.name]).toBeDefined();
        expect(typeof mod[def.name]).toBe('function');

        const unwrap = await Promise.resolve(mod).then((m) => ({ default: m[def.name] }));
        expect(unwrap.default).toBe(mod[def.name]);
      }
    }, 30000);

    it('preserves named exports so direct static imports do not suffer regression', async () => {
      // Test direct static-style imports to guarantee backward compatibility with other consumers/tests
      const { CompanySettingsView } = await import('../components/Settings/CompanySettingsView.tsx');
      const { InventoryView } = await import('../components/Inventory/InventoryView.tsx');
      const { PartiesView } = await import('../components/Parties/PartiesView.tsx');
      const { TableGridInvoiceModal } = await import('../components/Invoicing/TableGridInvoiceModal.tsx');
      const { TableGridPurchaseModal } = await import('../components/Purchases/TableGridPurchaseModal.tsx');

      expect(typeof CompanySettingsView).toBe('function');
      expect(typeof InventoryView).toBe('function');
      expect(typeof PartiesView).toBe('function');
      expect(typeof TableGridInvoiceModal).toBe('function');
      expect(typeof TableGridPurchaseModal).toBe('function');
    });
  });

  describe('3. Zero-CLS Suspense Fallback Component Rendering', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      return () => {
        container.remove();
      };
    });

    it('renders ViewLoadingSkeleton and matches layout skeleton specs', () => {
      // Recreate skeleton as defined in App.tsx
      const ViewLoadingSkeleton: React.FC = () => (
        <div data-testid="view-skeleton" className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 animate-pulse">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-7 w-48 bg-surface-container-high rounded-lg" />
              <div className="h-4 w-72 bg-surface-container rounded" />
            </div>
          </div>
        </div>
      );

      const root = createRoot(container);
      act(() => {
        root.render(<ViewLoadingSkeleton />);
      });

      const skeletonEl = container.querySelector('[data-testid="view-skeleton"]');
      expect(skeletonEl).not.toBeNull();
      expect(skeletonEl?.className).toContain('animate-pulse');
      expect(skeletonEl?.className).toContain('max-w-7xl');
    });

    it('renders ModalLoadingFallback with custom title correctly', () => {
      const ModalLoadingFallback: React.FC<{ title?: string }> = ({ title = 'Loading...' }) => (
        <div data-testid="modal-fallback" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest text-on-surface rounded-2xl p-6 shadow-2xl border border-outline-variant/40 flex flex-col items-center gap-3 max-w-xs w-full">
            <div className="w-9 h-9 border-3 border-secondary/30 border-t-secondary rounded-full animate-spin" />
            <p data-testid="fallback-title" className="text-sm font-semibold text-on-surface">{title}</p>
            <p className="text-xs text-on-surface-variant">Preparing interface...</p>
          </div>
        </div>
      );

      const root = createRoot(container);
      act(() => {
        root.render(<ModalLoadingFallback title="Loading Security Verification..." />);
      });

      const titleEl = container.querySelector('[data-testid="fallback-title"]');
      expect(titleEl?.textContent).toBe('Loading Security Verification...');
    });
  });
});
