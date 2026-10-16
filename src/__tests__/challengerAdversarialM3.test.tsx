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

import { SalesHubView } from '../components/Sales/SalesHubView.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Adversarial Verification: Sales Hub Empty States, Touch Targets & Accessibility', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockCompany: CompanyProfile = {
    id: 'comp_test_1',
    businessName: 'Apex Electronics & Hardware',
    tradeName: 'Apex Retail',
    gstin: '27ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    stateCode: '27',
    address: 'Shop 4, Market Complex',
    pincode: '400001',
    city: 'Mumbai',
    phone: '9876543210',
    email: 'contact@apex.com',
    isGstEnabled: true,
  };

  const sampleInvoice: Invoice = {
    id: 'inv_101',
    invoiceNumber: 'INV-2026-001',
    date: '2026-10-15',
    partyName: 'Sharma Traders',
    partyPhone: '9811122233',
    partyGstin: '27AAAAA0000A1Z5',
    items: [
      {
        id: 'item_1',
        name: 'Industrial Cable 100m',
        hsnSacCode: '8544',
        quantity: 2,
        unitPrice: 1500,
        rate: 1500,
        unit: 'BOX',
        discount: 0,
        taxableAmount: 3000,
        gstRate: 18,
        cgstAmount: 270,
        sgstAmount: 270,
        igstAmount: 0,
        totalAmount: 3540,
      },
    ],
    taxableTotal: 3000,
    cgstTotal: 270,
    sgstTotal: 270,
    igstTotal: 0,
    taxTotal: 540,
    grandTotal: 3540,
    paidAmount: 0,
    balanceAmount: 3540,
    paymentStatus: 'UNPAID',
    paymentMode: 'CREDIT',
    isReverseCharge: false,
    supplyType: 'INTRA_STATE',
    invoiceType: 'B2B',
  } as unknown as Invoice;

  const samplePaidInvoice: Invoice = {
    id: 'inv_102',
    invoiceNumber: 'INV-2026-002',
    date: '2026-10-14',
    partyName: 'Patel Enterprises',
    partyPhone: '9822233344',
    partyGstin: '27BBBBB0000B1Z5',
    items: [],
    taxableTotal: 1000,
    cgstTotal: 90,
    sgstTotal: 90,
    igstTotal: 0,
    taxTotal: 180,
    grandTotal: 1180,
    paidAmount: 1180,
    balanceAmount: 0,
    paymentStatus: 'PAID',
    paymentMode: 'CASH',
    isReverseCharge: false,
    supplyType: 'INTRA_STATE',
    invoiceType: 'B2B',
  } as unknown as Invoice;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // =========================================================================
  // Section 1: Sales Hub Empty States (Empirical DOM Verification)
  // =========================================================================
  describe('Sales Hub Empty State Rendering & Interactivity', () => {
    it('renders Case 1 (Total Empty State) when invoices array is empty, and CTA invokes onOpenTableGridInvoice', async () => {
      const onOpenTableGridInvoice = vi.fn();
      const onOpenStandardInvoice = vi.fn();
      const onViewInvoice = vi.fn();
      const onDeleteInvoice = vi.fn();
      const onQuickPos = vi.fn();

      await act(async () => {
        root.render(
          <SalesHubView
            company={mockCompany}
            invoices={[]}
            onOpenStandardInvoice={onOpenStandardInvoice}
            onOpenTableGridInvoice={onOpenTableGridInvoice}
            onViewInvoice={onViewInvoice}
            onDeleteInvoice={onDeleteInvoice}
            onQuickPos={onQuickPos}
          />
        );
      });

      // 1. Verify container exists
      const emptyContainer = container.querySelector('[data-testid="sales-hub-empty-state"]');
      expect(emptyContainer).not.toBeNull();

      // 2. Verify icon is receipt_long
      expect(emptyContainer?.textContent).toContain('receipt_long');

      // 3. Verify title and explanatory text
      expect(emptyContainer?.textContent).toContain('No Sales Bills Yet');
      expect(emptyContainer?.textContent).toContain('Create your first GST-compliant tax invoice');

      // 4. Verify "+ Create Sale Bill" CTA button
      const createBtn = emptyContainer?.querySelector('[data-testid="empty-create-bill-btn"]') as HTMLButtonElement;
      expect(createBtn).not.toBeNull();
      expect(createBtn.textContent).toContain('+ Create Sale Bill');
      expect(createBtn.getAttribute('aria-label')).toBe('Create Sale Bill');

      // 5. Click create button and assert callback
      act(() => {
        createBtn.click();
      });
      expect(onOpenTableGridInvoice).toHaveBeenCalledTimes(1);

      // 6. Verify Quick POS CTA button
      const quickPosBtn = Array.from(emptyContainer?.querySelectorAll('button') || []).find((b) =>
        b.textContent?.includes('Quick POS')
      );
      expect(quickPosBtn).toBeDefined();
      act(() => {
        quickPosBtn?.click();
      });
      expect(onQuickPos).toHaveBeenCalledTimes(1);

      // 7. Verify Filtered-empty actions (Clear Search / Reset Filters) do NOT appear
      expect(emptyContainer?.textContent).not.toContain('Clear Search');
      expect(emptyContainer?.textContent).not.toContain('Reset Filters');
    });

    it('renders Case 2 (Filtered Empty State) when search query does not match any invoice, and Clear Search restores items', async () => {
      const onOpenTableGridInvoice = vi.fn();

      await act(async () => {
        root.render(
          <SalesHubView
            company={mockCompany}
            invoices={[sampleInvoice]}
            onOpenStandardInvoice={vi.fn()}
            onOpenTableGridInvoice={onOpenTableGridInvoice}
            onViewInvoice={vi.fn()}
            onDeleteInvoice={vi.fn()}
          />
        );
      });

      // Initially, sample invoice is displayed
      expect(container.textContent).toContain('INV-2026-001');
      expect(container.textContent).toContain('Sharma Traders');
      expect(container.querySelector('[data-testid="sales-hub-empty-state"]')).toBeNull();

      // Search for non-matching party
      const searchInput = container.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
      expect(searchInput).not.toBeNull();

      await act(async () => {
        setInputValue(searchInput, 'NonExistentParty');
      });

      // Filtered empty state appears
      const emptyContainer = container.querySelector('[data-testid="sales-hub-empty-state"]');
      expect(emptyContainer).not.toBeNull();
      expect(emptyContainer?.textContent).toContain('filter_list_off');
      expect(emptyContainer?.textContent).toContain('No Invoices Found');
      expect(emptyContainer?.textContent).toContain('No invoices match "NonExistentParty"');

      // Clear Search button exists
      const clearSearchBtn = Array.from(emptyContainer?.querySelectorAll('button') || []).find((b) =>
        b.textContent?.includes('Clear Search')
      );
      expect(clearSearchBtn).toBeDefined();
      expect(clearSearchBtn?.getAttribute('aria-label')).toBe('Clear Search');

      // Click Clear Search button
      await act(async () => {
        clearSearchBtn?.click();
      });

      // Invoices restored
      expect(container.querySelector('[data-testid="sales-hub-empty-state"]')).toBeNull();
      expect(container.textContent).toContain('INV-2026-001');
      expect(container.textContent).toContain('Sharma Traders');
    });

    it('renders Case 2 (Filtered Empty State) when active tab filters out all invoices, and Reset Filters restores items', async () => {
      await act(async () => {
        root.render(
          <SalesHubView
            company={mockCompany}
            invoices={[samplePaidInvoice]} // Only PAID invoice
            onOpenStandardInvoice={vi.fn()}
            onOpenTableGridInvoice={vi.fn()}
            onViewInvoice={vi.fn()}
            onDeleteInvoice={vi.fn()}
          />
        );
      });

      // Initially shows Patel Enterprises
      expect(container.textContent).toContain('Patel Enterprises');

      // Switch to UNPAID (Due) tab
      const dueTab = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Due')
      );
      expect(dueTab).toBeDefined();

      await act(async () => {
        dueTab?.click();
      });

      // Filtered empty state appears
      const emptyContainer = container.querySelector('[data-testid="sales-hub-empty-state"]');
      expect(emptyContainer).not.toBeNull();
      expect(emptyContainer?.textContent).toContain('No Invoices Found');
      expect(emptyContainer?.textContent).toContain('No unpaid invoices found');

      // Reset Filters button exists
      const resetBtn = Array.from(emptyContainer?.querySelectorAll('button') || []).find((b) =>
        b.textContent?.includes('Reset Filters')
      );
      expect(resetBtn).toBeDefined();
      expect(resetBtn?.getAttribute('aria-label')).toBe('Reset Filters');

      // Click Reset Filters
      await act(async () => {
        resetBtn?.click();
      });

      // Tab reset to ALL and paid invoice is shown again
      expect(container.querySelector('[data-testid="sales-hub-empty-state"]')).toBeNull();
      expect(container.textContent).toContain('Patel Enterprises');
    });
  });

  // =========================================================================
  // Section 2: Touch Target Metrics Empirical Inspection
  // =========================================================================
  describe('Touch Target Metrics Inspection Across Hub Views', () => {
    it('verifies that filter tabs in SalesHubView satisfy min-h-[36px]', async () => {
      await act(async () => {
        root.render(
          <SalesHubView
            company={mockCompany}
            invoices={[]}
            onOpenStandardInvoice={vi.fn()}
            onOpenTableGridInvoice={vi.fn()}
            onViewInvoice={vi.fn()}
            onDeleteInvoice={vi.fn()}
          />
        );
      });

      // Match tab buttons by their contained labels
      const tabKeywords = ['All', 'Due', 'Paid', 'Estimates'];
      for (const kw of tabKeywords) {
        const btn = Array.from(container.querySelectorAll('button')).find((b) =>
          b.textContent?.includes(kw)
        );
        expect(btn).toBeDefined();
        const className = btn?.className || '';
        const meetsTarget = className.includes('min-h-[36px]') || className.includes('min-h-[38px]') || className.includes('min-h-[40px]');
        expect(meetsTarget).toBe(true);
      }
    });

    it('verifies that the empty state CTA buttons satisfy min-h-[40px] / min-h-[44px]', async () => {
      await act(async () => {
        root.render(
          <SalesHubView
            company={mockCompany}
            invoices={[]}
            onOpenStandardInvoice={vi.fn()}
            onOpenTableGridInvoice={vi.fn()}
            onViewInvoice={vi.fn()}
            onDeleteInvoice={vi.fn()}
            onQuickPos={vi.fn()}
          />
        );
      });

      const createBtn = container.querySelector('[data-testid="empty-create-bill-btn"]');
      expect(createBtn?.className).toContain('min-h-[44px]');
    });
  });

  // =========================================================================
  // Section 3: Residual Unlabeled Buttons Audit (Defect Confirmation)
  // =========================================================================
  describe('Accessibility Audit: Residual Icon-Only Buttons', () => {
    it('identifies residual unlabeled buttons in modal close triggers and search inputs', () => {
      const defects: { file: string; line: number; description: string }[] = [];

      // 1. AuditLogView modal close
      const auditLogPath = path.resolve(process.cwd(), 'src/components/Audit/AuditLogView.tsx');
      const auditLogContent = fs.readFileSync(auditLogPath, 'utf8');
      if (
        auditLogContent.includes('onClick={() => setInspectRecord(null)}') &&
        !auditLogContent.match(/onClick=\{\(\) => setInspectRecord\(null\)\}[^>]*aria-label/)
      ) {
        defects.push({
          file: 'src/components/Audit/AuditLogView.tsx',
          line: 662,
          description: 'Modal close button missing aria-label',
        });
      }

      // 2. WhatsAppShareModal close
      const waPath = path.resolve(process.cwd(), 'src/components/WhatsApp/WhatsAppShareModal.tsx');
      const waContent = fs.readFileSync(waPath, 'utf8');
      if (
        waContent.includes('onClick={onClose}') &&
        !waContent.match(/onClick=\{onClose\}[^>]*aria-label/)
      ) {
        defects.push({
          file: 'src/components/WhatsApp/WhatsAppShareModal.tsx',
          line: 58,
          description: 'WhatsApp share modal close button missing aria-label',
        });
      }

      // 3. QuickBillingView mobile drawer close & search clear
      const posPath = path.resolve(process.cwd(), 'src/components/POS/QuickBillingView.tsx');
      const posContent = fs.readFileSync(posPath, 'utf8');
      if (
        posContent.includes('onClick={() => setIsMobileCartDrawerOpen(false)}') &&
        !posContent.match(/setIsMobileCartDrawerOpen\(false\)[^>]*aria-label/)
      ) {
        defects.push({
          file: 'src/components/POS/QuickBillingView.tsx',
          line: 1412,
          description: 'Cart drawer close button missing aria-label',
        });
      }

      // 4. RoleSwitchModal backspace
      const rolePath = path.resolve(process.cwd(), 'src/components/Auth/RoleSwitchModal.tsx');
      const roleContent = fs.readFileSync(rolePath, 'utf8');
      if (
        roleContent.includes('onClick={handleBackspace}') &&
        !roleContent.match(/onClick=\{handleBackspace\}[^>]*aria-label/)
      ) {
        defects.push({
          file: 'src/components/Auth/RoleSwitchModal.tsx',
          line: 271,
          description: 'Keypad backspace button missing aria-label',
        });
      }

      // 5. SelectPosPartyModal search clear
      const selectPartyPath = path.resolve(process.cwd(), 'src/components/POS/SelectPosPartyModal.tsx');
      const selectPartyContent = fs.readFileSync(selectPartyPath, 'utf8');
      if (
        selectPartyContent.includes("onClick={() => setSearch('')}") &&
        !selectPartyContent.match(/onClick=\{\(\) => setSearch\(''\)\}[^>]*aria-label/)
      ) {
        defects.push({
          file: 'src/components/POS/SelectPosPartyModal.tsx',
          line: 232,
          description: 'POS party modal search clear button missing aria-label',
        });
      }

      expect(defects.length).toBe(0);
      console.log(`Confirmed ${defects.length} residual unlabeled icon buttons empirically.`);
    });
  });
});
