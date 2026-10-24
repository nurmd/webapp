import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { ReportsNavList } from '../components/Reports/ReportsNavList.tsx';
import { InvoiceHeaderMeta } from '../components/Invoicing/components/InvoiceHeaderMeta.tsx';
import { InvoiceActionDock } from '../components/Invoicing/components/InvoiceActionDock.tsx';
import { NavigationMenuHubView } from '../components/Navigation/NavigationMenuHubView.tsx';
import { CompanySettingsView } from '../components/Settings/CompanySettingsView.tsx';
import { PartiesView } from '../components/Parties/PartiesView.tsx';
import { QuickBillingView } from '../components/POS/QuickBillingView.tsx';
import { pouch, SyncConflict } from '../services/pouchdb.ts';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';

describe('Phase 1 Item 5 Polish Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  const sampleCompany: CompanyProfile = {
    id: 'COMP-1',
    businessName: 'Sharma Paints & Hardware',
    gstin: '18AABCS1234D1Z5',
    pan: 'AABCS1234D',
    address: 'Main Road',
    pincode: '781001',
    phone: '9864012345',
    email: 'sharma@example.com',
    stateCode: '18',
    invoicePrefix: 'INV/26-27/',
  };

  describe('(B) Parties phone display & layout padding', () => {
    it('displays "No phone" for parties with placeholder "00" or empty phone without mutating records', async () => {
      const parties: Party[] = [
        {
          id: 'pty-1',
          name: 'Ram Traders',
          type: 'CUSTOMER',
          phone: '00',
          stateCode: '18',
          billingAddress: 'Guwahati Counter',
          currentBalance: 0,
          createdAt: '2026-10-24T00:00:00Z',
          updatedAt: '2026-10-24T00:00:00Z',
        },
        {
          id: 'pty-2',
          name: 'Shyam Hardware',
          type: 'CUSTOMER',
          phone: '',
          stateCode: '18',
          billingAddress: 'Guwahati Counter',
          currentBalance: 0,
          createdAt: '2026-10-24T00:00:00Z',
          updatedAt: '2026-10-24T00:00:00Z',
        },
        {
          id: 'pty-3',
          name: 'Valid Phone Customer',
          type: 'CUSTOMER',
          phone: '9864012345',
          stateCode: '18',
          billingAddress: 'Guwahati Counter',
          currentBalance: 0,
          createdAt: '2026-10-24T00:00:00Z',
          updatedAt: '2026-10-24T00:00:00Z',
        },
      ];

      await act(async () => {
        root!.render(
          <PartiesView
            parties={parties}
            onSaveParty={vi.fn()}
            onDeleteParty={vi.fn()}
          />
        );
      });

      // Assert PartiesView has bottom padding pb-36 or pb-40 so fixed FAB never covers rows
      const partiesWrapper = container!.firstElementChild as HTMLElement;
      expect(partiesWrapper.className).toContain('pb-36');

      // Assert display of "No phone"
      expect(container!.textContent).toContain('No phone');
      expect(container!.textContent).toContain('9864012345');
      // Ensure the placeholder "00" is not rendered as a standalone phone number
      const phoneSpans = Array.from(container!.querySelectorAll('span')).map((s) => s.textContent?.trim());
      expect(phoneSpans.filter((t) => t === '00').length).toBe(0);

      // Verify underlying record was not mutated
      expect(parties[0].phone).toBe('00');
    });
  });

  describe('(C) New Invoice: 4-digit year date, Reverse Charge (RCM), and Action Dock', () => {
    it('formats date as DD/MM/YYYY with a 4-digit year and renders "Reverse Charge (RCM)" toggle', async () => {
      await act(async () => {
        root!.render(
          <InvoiceHeaderMeta
            {...({
              invoiceNumber: 'INV/26-27/0001',
              invoiceDate: '2026-10-24',
              dueDate: '2026-10-31',
              posStateCode: '18',
              isGstActive: true,
              isIntraState: true,
              isRcm: false,
              onRcmChange: vi.fn(),
              onClose: vi.fn(),
              onSelectPartyClick: vi.fn(),
              onClearParty: vi.fn(),
              onAddPartyClick: vi.fn(),
              onOpenInvoiceNumberModal: vi.fn(),
              onOpenDueDateModal: vi.fn(),
              onAutoFixConflict: vi.fn(),
              selectedParty: null,
              currentConflict: undefined,
              invoiceConflictError: null,
            } as any)}
          />
        );
      });

      // 4-digit year date format (24/10/2026, not 24/10/26)
      expect(container!.textContent).toContain('24/10/2026');
      expect(container!.textContent).not.toContain('24/10/26');

      // Reverse Charge (RCM) label
      expect(container!.textContent).toContain('Reverse Charge (RCM)');
    });

    it('InvoiceActionDock displays Net Payable, Save & Print, Save Invoice, Pay & Save with responsive breathing room', async () => {
      await act(async () => {
        root!.render(
          <InvoiceActionDock
            finalGrandTotal={15400}
            onSaveAndPrint={vi.fn()}
            onSaveInvoice={vi.fn()}
            onPayAndSave={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('Net Payable');
      expect(container!.textContent).toContain('15,400');
      expect(container!.textContent).toContain('Save & Print');
      expect(container!.textContent).toContain('Save Invoice');
      expect(container!.textContent).toContain('Pay & Save');

      // Mobile uses two rows (Net Payable/Save & Print, then actions) so the
      // dock never overflows a narrow phone; desktop collapses to one row.
      const dockLayout = container!.querySelector('aside > div');
      expect(dockLayout?.className).toContain('flex-col');
      expect(dockLayout?.className).toContain('sm:flex-row');
    });
  });

  describe('(D) POS: Singular/plural count & GST Exempt (0%) display', () => {
    const testItems: InventoryItem[] = [
      {
        id: 'itm-thinner-5l',
        name: 'Thinner 5L Commercial',
        sku: 'THN-5L',
        barcode: '890123450099',
        category: 'Paints',
        hsnSacCode: '3814',
        unit: 'LTR',
        salePrice: 450,
        purchasePrice: 320,
        gstRate: 0, // 0% tax / exempt
        currentStock: 20,
        minStockAlert: 5,
        createdAt: '2026-10-24T00:00:00Z',
        updatedAt: '2026-10-24T00:00:00Z',
      },
    ];

    it('renders singular "Current Bill (1 Item)" and "GST Exempt (0%)" when item has 0% tax', async () => {
      await act(async () => {
        root!.render(
          <QuickBillingView
            company={sampleCompany}
            items={testItems}
            onCompleteSale={vi.fn()}
          />
        );
      });

      // Initially empty cart
      expect(container!.textContent).toContain('Cart is Empty');

      // Click the item card to add 1 unit to cart
      const itemEl = container!.querySelector('[data-testid="pos-item-itm-thinner-5l"]') as HTMLElement;
      expect(itemEl).not.toBeNull();

      await act(async () => {
        itemEl.click();
      });

      // Verify singular "Current Bill (1 Item)"
      expect(container!.textContent).toContain('Current Bill (1 Item)');
      expect(container!.textContent).not.toContain('Current Bill (1 Items)');

      // Verify "GST Exempt (0%)" tag in line item and cart summary
      expect(container!.textContent).toContain('GST Exempt (0%)');
    });
  });

  describe('(E) Data & Sync truthful badges in NavigationMenuHubView and CompanySettingsView', () => {
    it('NavigationMenuHubView storage indicator reflects Offline-First when no cloud DB is configured', async () => {
      (pouch as any).notifySyncState({
        status: 'offline',
        remoteUrl: '',
        conflicts: [],
        conflictsCount: 0,
        pendingChanges: 0,
      });

      await act(async () => {
        root!.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('Offline-First');
      expect(container!.textContent).not.toContain('Cloud Live');
    });

    it('NavigationMenuHubView displays "Conflicts" and NEVER "Cloud Live" when unresolved conflicts exist', async () => {
      const mockConflict: SyncConflict = {
        id: 'inv:1#rev2',
        docId: 'inv:1',
        docType: 'invoice',
        entityId: 'INV-1',
        winningRev: 'rev1',
        conflictingRev: 'rev2',
        winningDoc: { id: 'INV-1' },
        conflictingDoc: { id: 'INV-1' },
        detectedAt: '2026-10-24T06:00:00Z',
      };

      (pouch as any).notifySyncState({
        status: 'synced',
        remoteUrl: 'https://couchdb.example.com/live',
        conflicts: [mockConflict],
        conflictsCount: 1,
        pendingChanges: 0,
        lastSyncedAt: new Date().toISOString(),
      });

      await act(async () => {
        root!.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('Conflicts');
      expect(container!.textContent).not.toContain('Cloud Live');
    });

    it('NavigationMenuHubView displays "Check Sync" when sync timestamp is stale (>30m ago)', async () => {
      const staleTimestamp = new Date(Date.now() - 45 * 60 * 1000).toISOString();

      (pouch as any).notifySyncState({
        status: 'synced',
        remoteUrl: 'https://couchdb.example.com/live',
        conflicts: [],
        conflictsCount: 0,
        pendingChanges: 0,
        lastSyncedAt: staleTimestamp,
      });

      await act(async () => {
        root!.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('Check Sync');
      expect(container!.textContent).not.toContain('Cloud Live');
    });

    it('NavigationMenuHubView shows Offline and never Cloud Live when the active sync state is offline', async () => {
      (pouch as any).notifySyncState({
        status: 'offline',
        remoteUrl: 'https://couchdb.example.com/live',
        conflicts: [],
        conflictsCount: 0,
        pendingChanges: 0,
        lastSyncedAt: new Date().toISOString(),
      });

      await act(async () => {
        root!.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('Offline');
      expect(container!.textContent).not.toContain('Cloud Live');
    });

    it('CompanySettingsView shows dynamic Data & Sync category badge (Conflicts, Offline-First, Cloud Sync)', async () => {
      (pouch as any).notifySyncState({
        status: 'offline',
        remoteUrl: '',
        conflicts: [],
        conflictsCount: 0,
      });

      await act(async () => {
        root!.render(
          <CompanySettingsView
            company={sampleCompany}
            onSave={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('Offline-First');
    });

    it('CompanySettingsView shows Sync Pending when local changes are waiting to upload', async () => {
      (pouch as any).notifySyncState({
        status: 'synced',
        remoteUrl: 'https://couchdb.example.com/live',
        conflicts: [],
        conflictsCount: 0,
        pendingChanges: 3,
        lastSyncedAt: new Date().toISOString(),
      });

      await act(async () => {
        root!.render(
          <CompanySettingsView
            company={sampleCompany}
            onSave={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('Sync Pending');
    });

    it('CompanySettingsView shows Cloud Sync only for a recent verified sync', async () => {
      (pouch as any).notifySyncState({
        status: 'synced',
        remoteUrl: 'https://couchdb.example.com/live',
        conflicts: [],
        conflictsCount: 0,
        pendingChanges: 0,
        lastSyncedAt: new Date().toISOString(),
      });

      await act(async () => {
        root!.render(
          <CompanySettingsView
            company={sampleCompany}
            onSave={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('Cloud Sync');
    });
  });

  describe('(F) ReportsNavList GSTR compliance wording', () => {
    it('renders "GSTR-3B 3.1 & 4 ITC" chip instead of cryptic "3.1 & 4 ITC"', async () => {
      await act(async () => {
        root!.render(
          <ReportsNavList
            onSelectReport={vi.fn()}
            metrics={{
              gstTaxInvoices: 42,
              salesTotal: '₹1,50,000',
              purchasesTotal: '₹95,000',
              receivablesTotal: '₹20,000',
              payablesTotal: '₹15,000',
              stockValuation: '₹4,20,000',
              lowStockCount: 5,
              liquidBalance: '₹50,000',
              activeBankCount: 2,
              activeLoanCount: 0,
              voucherCount: 12,
            }}
          />
        );
      });

      expect(container!.textContent).toContain('GSTR-3B 3.1 & 4 ITC');
      expect(container!.textContent).not.toContain('3.1 & 4 ITC]');
    });
  });
});
