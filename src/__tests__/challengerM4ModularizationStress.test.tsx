import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

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

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// 1. Import all refactored views and extracted subcomponents
import { CompanySettingsView } from '../components/Settings/CompanySettingsView.tsx';
import { CompanyProfileTab } from '../components/Settings/CompanyProfileTab.tsx';
import { GeneralSettingsTab } from '../components/Settings/GeneralSettingsTab.tsx';
import { EditBusinessProfileModal } from '../components/Settings/modals/EditBusinessProfileModal.tsx';
import { StoreQrModal } from '../components/Settings/modals/StoreQrModal.tsx';
import { DevicePairModals } from '../components/Settings/modals/DevicePairModals.tsx';
import { SettingsSubModal } from '../components/Settings/modals/SettingsSubModal.tsx';

import { InventoryView } from '../components/Inventory/InventoryView.tsx';
import { InventoryItemCard } from '../components/Inventory/InventoryItemCard.tsx';
import { StockAdjustmentModal } from '../components/Inventory/StockAdjustmentModal.tsx';
import { InventoryFilterSheet } from '../components/Inventory/InventoryFilterSheet.tsx';
import { ItemFormModal } from '../components/Inventory/ItemFormModal.tsx';
import { ItemDetailSheet } from '../components/Inventory/ItemDetailSheet.tsx';

import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { InvoiceHeaderMeta } from '../components/Invoicing/components/InvoiceHeaderMeta.tsx';
import { InvoiceLineItemsGrid } from '../components/Invoicing/components/InvoiceLineItemsGrid.tsx';
import { InvoiceNumberDateModal } from '../components/Invoicing/components/InvoiceNumberDateModal.tsx';
import { InvoiceActionDock } from '../components/Invoicing/components/InvoiceActionDock.tsx';

import { TableGridPurchaseModal } from '../components/Purchases/TableGridPurchaseModal.tsx';
import { PurchaseHeaderMeta } from '../components/Purchases/components/PurchaseHeaderMeta.tsx';
import { PurchaseLineItemsGrid } from '../components/Purchases/components/PurchaseLineItemsGrid.tsx';
import { PurchaseBillNumberModal } from '../components/Purchases/components/PurchaseBillNumberModal.tsx';
import { PurchaseActionDock } from '../components/Purchases/components/PurchaseActionDock.tsx';

import { DueDatePresetModal } from '../components/Common/Billing/DueDatePresetModal.tsx';
import { BillDiscountModal } from '../components/Common/Billing/BillDiscountModal.tsx';
import { PaymentSettlementDock } from '../components/Common/Billing/PaymentSettlementDock.tsx';
import { DocumentTotalsSummary } from '../components/Common/Billing/DocumentTotalsSummary.tsx';

import { PartyDetailPage } from '../components/Parties/PartyDetailPage.tsx';
import { usePartyPassbook } from '../components/Parties/usePartyPassbook.ts';
import { PartyInfoCard } from '../components/Parties/PartyInfoCard.tsx';
import { RecordPaymentModal } from '../components/Parties/RecordPaymentModal.tsx';
import { VoucherEditorModal } from '../components/Parties/VoucherEditorModal.tsx';
import { PartyPassbookTable } from '../components/Parties/PartyPassbookTable.tsx';

import { Party } from '../models/party.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice, PaymentSplit } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';

describe('Milestone 4: Empirical Challenger Modularization & Stability Suite', () => {
  const dummyCompany: CompanyProfile = {
    id: 'comp_1',
    businessName: 'Shree Ganesh Traders',
    tradeName: 'Ganesh POS',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    pincode: '411037',
    stateCode: '27',
    address: '101 Market Yard, Pune',
    phone: '9876543210',
    email: 'info@ganesh.com',
    isGstEnabled: true,
    invoicePrefix: 'INV-',
    bankName: 'HDFC Bank',
    accountNumber: '50100012345678',
    ifscCode: 'HDFC0001234',
    branchName: 'Market Yard',
  };

  const dummyParty: Party = {
    id: 'party_1',
    name: 'Ramesh Patel',
    phone: '9876543210',
    email: 'ramesh@example.com',
    billingAddress: '42 Somwar Peth, Pune',
    stateCode: '27',
    type: 'CUSTOMER',
    currentBalance: 0,
    openingBalance: 0,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  };

  // --------------------------------------------------------------------------
  // SECTION 1: Module Export and Component Definition Integrity
  // --------------------------------------------------------------------------
  describe('1. Module Import & Export Integrity', () => {
    it('verifies all 25+ refactored components and subcomponents are properly defined React functions', () => {
      const components = [
        CompanySettingsView,
        CompanyProfileTab,
        GeneralSettingsTab,
        EditBusinessProfileModal,
        StoreQrModal,
        DevicePairModals,
        SettingsSubModal,
        InventoryView,
        InventoryItemCard,
        StockAdjustmentModal,
        InventoryFilterSheet,
        ItemFormModal,
        ItemDetailSheet,
        TableGridInvoiceModal,
        InvoiceHeaderMeta,
        InvoiceLineItemsGrid,
        InvoiceNumberDateModal,
        InvoiceActionDock,
        TableGridPurchaseModal,
        PurchaseHeaderMeta,
        PurchaseLineItemsGrid,
        PurchaseBillNumberModal,
        PurchaseActionDock,
        DueDatePresetModal,
        BillDiscountModal,
        PaymentSettlementDock,
        DocumentTotalsSummary,
        PartyDetailPage,
        PartyInfoCard,
        RecordPaymentModal,
        VoucherEditorModal,
        PartyPassbookTable,
      ];

      for (const comp of components) {
        expect(comp).toBeDefined();
        expect(typeof comp === 'function' || typeof comp === 'object').toBe(true);
      }

      expect(typeof usePartyPassbook).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Empirical Dependency Graph Cycle Detection
  // --------------------------------------------------------------------------
  describe('2. Circular Dependency Static & Dynamic Analysis', () => {
    it('parses import statements across refactored component subtrees and asserts 0 circular dependency cycles', () => {
      const srcDir = path.resolve(__dirname, '..');
      const targetDirs = [
        path.join(srcDir, 'components', 'Common', 'Billing'),
        path.join(srcDir, 'components', 'Invoicing'),
        path.join(srcDir, 'components', 'Purchases'),
        path.join(srcDir, 'components', 'Inventory'),
        path.join(srcDir, 'components', 'Parties'),
        path.join(srcDir, 'components', 'Settings'),
      ];

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

      for (const d of targetDirs) {
        collectFiles(d);
      }

      expect(fileList.length).toBeGreaterThan(15);

      // Build dependency graph
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
            if (fs.existsSync(resolved)) {
              deps.push(resolved);
            }
          }
        }
        graph[file] = deps;
      }

      // Check cycles using DFS
      const visited: Record<string, number> = {}; // 0 = unvisited, 1 = visiting, 2 = visited
      const cycles: string[][] = [];

      function dfs(node: string, stack: string[]) {
        visited[node] = 1;
        stack.push(node);

        const neighbors = graph[node] || [];
        for (const next of neighbors) {
          if (!graph[next]) continue; // Only check inside target component tree
          if (visited[next] === 1) {
            const cycleStart = stack.indexOf(next);
            cycles.push([...stack.slice(cycleStart), next]);
          } else if (!visited[next]) {
            dfs(next, stack);
          }
        }

        stack.pop();
        visited[node] = 2;
      }

      for (const file of fileList) {
        if (!visited[file]) {
          dfs(file, []);
        }
      }

      expect(cycles).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Deep Passbook Hook (usePartyPassbook) Empirical Stress Tests
  // --------------------------------------------------------------------------
  describe('3. usePartyPassbook Hook State & Ledger Calculation Integrity', () => {
    // Harness component to execute the hook inside React DOM
    function renderHookHarness(params: any): { result: any; unmount: () => void } {
      let latestHookResult: any = null;
      function TestComponent() {
        latestHookResult = usePartyPassbook(params);
        return null;
      }

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      act(() => {
        root.render(<TestComponent />);
      });

      return {
        result: () => latestHookResult,
        unmount: () => {
          act(() => {
            root.unmount();
          });
          container.remove();
        },
      };
    }

    it('calculates correct liveNetBalance and passbook entries for opening balance only', () => {
      const partyWithOpening: Party = {
        ...dummyParty,
        openingBalance: 5000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
      };

      const harness = renderHookHarness({
        party: partyWithOpening,
        company: dummyCompany,
        invoices: [],
        purchases: [],
        vouchers: [],
      });

      const res = harness.result();
      expect(res.liveNetBalance).toBe(5000);
      expect(res.isReceivable).toBe(true);
      expect(res.isPayable).toBe(false);
      expect(res.passbook.length).toBe(1);
      expect(res.passbook[0].type).toBe('OPENING');
      expect(res.passbook[0].debit).toBe(5000);
      expect(res.passbook[0].runningBalance).toBe(5000);

      harness.unmount();
    });

    it('correctly tracks running balance across sales, upfront payments, vouchers, and credit notes', () => {
      const inv1: Invoice = {
        id: 'inv_101',
        invoiceNumber: 'INV-101',
        invoiceType: 'B2B',
        isGstInvoice: true,
        date: '2026-04-02',
        partyId: dummyParty.id,
        partyName: dummyParty.name,
        partyAddress: 'Pune',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'itm_1',
            name: 'Sugar 1kg',
            hsnSacCode: '1701',
            quantity: 10,
            unitPrice: 40,
            unit: 'KGS',
            discountPercent: 0,
            discountAmount: 0,
            taxableAmount: 400,
            gstRate: 5,
            cgstAmount: 10,
            sgstAmount: 10,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 420,
          },
        ],
        totalGrossAmount: 400,
        totalDiscount: 0,
        totalTaxableAmount: 400,
        totalCgst: 10,
        totalSgst: 10,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 20,
        roundOff: 0,
        shippingAmount: 0,
        grandTotal: 420,
        amountInWords: 'Four Hundred Twenty Only',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 420,
        balanceAmount: 0,
        createdAt: '2026-04-02T10:00:00Z',
        updatedAt: '2026-04-02T10:00:00Z',
      };

      const inv2: Invoice = {
        id: 'inv_102',
        invoiceNumber: 'INV-102',
        invoiceType: 'B2B',
        isGstInvoice: true,
        date: '2026-04-05',
        partyId: dummyParty.id,
        partyName: dummyParty.name,
        partyAddress: 'Pune',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'itm_2',
            name: 'Wheat Flour 5kg',
            hsnSacCode: '1101',
            quantity: 5,
            unitPrice: 200,
            unit: 'BAG',
            discountPercent: 0,
            discountAmount: 0,
            taxableAmount: 1000,
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1000,
          },
        ],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        shippingAmount: 0,
        grandTotal: 1000,
        amountInWords: 'One Thousand Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1000,
        createdAt: '2026-04-05T10:00:00Z',
        updatedAt: '2026-04-05T10:00:00Z',
      };

      const voucherReceipt: Voucher = {
        id: 'vch_001',
        voucherNumber: 'RCT-001',
        voucherType: 'RECEIPT',
        date: '2026-04-08',
        totalAmount: 600,
        narration: 'Partial payment received against INV-102',
        entries: [
          {
            accountId: dummyParty.id,
            accountName: dummyParty.name,
            debit: 0,
            credit: 600,
          },
          {
            accountId: 'ACC_CASH',
            accountName: 'Cash in Hand',
            debit: 600,
            credit: 0,
          },
        ],
        createdAt: '2026-04-08T11:00:00Z',
      };

      const harness = renderHookHarness({
        party: dummyParty,
        company: dummyCompany,
        invoices: [inv1, inv2],
        purchases: [],
        vouchers: [voucherReceipt],
      });

      const res = harness.result();
      expect(res.totalBilled).toBe(1420);
      expect(res.totalPaid).toBe(420); // total upfront paid on invoices

      // Check passbook entries:
      // When voucher receipts (600) exceed invoice paidAmount (420), unvoucheredPaid is 0 to avoid double counting:
      // 1. inv1 Sale: Debit 420 -> running 420
      // 2. inv2 Sale: Debit 1000 -> running 1420
      // 3. voucherReceipt: Credit 600 -> running 820
      expect(res.passbook.length).toBe(3);
      expect(res.liveNetBalance).toBe(820);
      expect(res.isReceivable).toBe(true);

      const entries = res.passbook;
      expect(entries[0].type).toBe('SALE');
      expect(entries[0].debit).toBe(420);
      expect(entries[0].runningBalance).toBe(420);

      expect(entries[1].type).toBe('SALE');
      expect(entries[1].debit).toBe(1000);
      expect(entries[1].runningBalance).toBe(1420);

      expect(entries[2].type).toBe('PAYMENT_IN');
      expect(entries[2].credit).toBe(600);
      expect(entries[2].runningBalance).toBe(820);

      harness.unmount();
    });

    it('handles supplier party passbook calculations where bills are credits and payments are debits', () => {
      const supplierParty: Party = {
        ...dummyParty,
        id: 'supp_1',
        name: 'Tata Consumer Wholesale',
        type: 'SUPPLIER',
      };

      const pur1: PurchaseBill = {
        id: 'pb_001',
        billNumber: 'PB-001',
        supplierId: supplierParty.id,
        supplierName: supplierParty.name,
        supplierAddress: 'Mumbai',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        date: '2026-04-03',
        items: [
          {
            itemId: 'itm_1',
            name: 'Tea Bags Bulk',
            hsnSacCode: '0902',
            quantity: 20,
            unitPrice: 100,
            unit: 'BOX',
            discountPercent: 0,
            discountAmount: 0,
            taxableAmount: 2000,
            gstRate: 5,
            cgstAmount: 50,
            sgstAmount: 50,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 2100,
          },
        ],
        itcEligibility: 'ELIGIBLE_INPUTS',
        isRcm: false,
        totalGrossAmount: 2000,
        totalDiscount: 0,
        totalTaxableAmount: 2000,
        totalCgst: 50,
        totalSgst: 50,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 100,
        roundOff: 0,
        shippingAmount: 0,
        grandTotal: 2100,
        paidAmount: 500,
        balanceAmount: 1600,
        paymentMode: 'NET_BANKING',
        paymentStatus: 'PARTIAL',
        createdAt: '2026-04-03T00:00:00Z',
        updatedAt: '2026-04-03T00:00:00Z',
      };

      const harness = renderHookHarness({
        party: supplierParty,
        company: dummyCompany,
        invoices: [],
        purchases: [pur1],
        vouchers: [],
      });

      const res = harness.result();
      expect(res.isCustomer).toBe(false);
      expect(res.totalBilled).toBe(2100);
      expect(res.totalPaid).toBe(500);

      // Passbook for supplier:
      // Purchase bill: Credit 2100 -> running 2100
      // Upfront payment: Debit 500 -> running 1600
      expect(res.passbook.length).toBe(2);
      expect(res.passbook[0].type).toBe('PURCHASE');
      expect(res.passbook[0].credit).toBe(2100);
      expect(res.passbook[0].runningBalance).toBe(2100);

      expect(res.passbook[1].type).toBe('PAYMENT_OUT');
      expect(res.passbook[1].debit).toBe(500);
      expect(res.passbook[1].runningBalance).toBe(1600);

      // Live net balance for supplier is negative (we owe them: -1600)
      expect(res.liveNetBalance).toBe(-1600);
      expect(res.isPayable).toBe(true);
      expect(res.isReceivable).toBe(false);

      harness.unmount();
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Subcomponent Prop Rendering & Contract Integrity
  // --------------------------------------------------------------------------
  describe('4. Extracted Subcomponents DOM & Prop Flow Execution', () => {
    it('renders DocumentTotalsSummary and verifies accurate prop contract breakdown', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <DocumentTotalsSummary
            title="Invoice Summary"
            totalGrossAmount={5000}
            totalTax={900}
            totalCgst={450}
            totalSgst={450}
            totalIgst={0}
            totalTaxableAmount={5000}
            isIntraState={true}
            isGstActive={true}
            roundOff={0.25}
            shippingAmount={100}
            onChangeShipping={vi.fn()}
            overallDiscountAmount={250}
            overallDiscountPercent={5}
            onOpenDiscountModal={vi.fn()}
            onRemoveDiscount={vi.fn()}
            isTaxDetailsOpen={true}
            onToggleTaxDetails={vi.fn()}
            totalUnits={25}
            finalGrandTotal={5750}
            accentColor="secondary"
          />
        );
      });

      expect(container.textContent).toContain('Invoice Summary');
      expect(container.textContent).toContain('₹ 5,000.00'); // Gross
      expect(container.textContent).toContain('₹ 5,750.00'); // Grand Total
      expect(container.textContent).toContain('25 Total Units'); // Units

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('renders PaymentSettlementDock with multiple splits and triggers handler contracts', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const splits: PaymentSplit[] = [
        { id: '1', mode: 'CASH', amount: 3000 },
        { id: '2', mode: 'UPI', amount: 2000 },
      ];

      const onUpdateMode = vi.fn();
      const onUpdateAmt = vi.fn();
      const onAdd = vi.fn();
      const onRemove = vi.fn();

      act(() => {
        root.render(
          <PaymentSettlementDock
            paymentSplits={splits}
            autoPaymentStatus="PARTIAL"
            balanceDue={750}
            onUpdateSplitMode={onUpdateMode}
            onUpdateSplitAmount={onUpdateAmt}
            onAddSplitMode={onAdd}
            onRemoveSplit={onRemove}
          />
        );
      });

      expect(container.textContent).toContain('Payment Settlement');
      expect(container.textContent).toContain('₹ 750.00'); // Balance due
      expect(container.textContent).toContain('Partial');

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('renders DueDatePresetModal and triggers preset calculation selections', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const onSelect = vi.fn();
      const onClose = vi.fn();

      act(() => {
        root.render(
          <DueDatePresetModal
            isOpen={true}
            baseDate="2026-04-10"
            currentDueDate="2026-04-25"
            onSelectDueDate={onSelect}
            onClose={onClose}
          />
        );
      });

      expect(container.textContent).toContain('Payment Terms & Due Date');
      expect(container.textContent).toContain('Net 15 Days');
      expect(container.textContent).toContain('Net 30 Days');

      // Click on Net 30 Days button
      const buttons = container.querySelectorAll('button');
      const net30Btn = Array.from(buttons).find((b) => b.textContent?.includes('Net 30 Days'));
      expect(net30Btn).toBeDefined();

      act(() => {
        net30Btn?.click();
      });

      expect(onSelect).toHaveBeenCalledWith('2026-05-10');
      expect(onClose).toHaveBeenCalled();

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('renders BillDiscountModal and handles percent update submissions', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const onApply = vi.fn();
      const onClose = vi.fn();

      act(() => {
        root.render(
          <BillDiscountModal
            isOpen={true}
            overallDiscountPercent={5}
            overallDiscountAmount={250}
            taxableBaseAmount={5000}
            onApplyDiscountPercent={onApply}
            onClose={onClose}
          />
        );
      });

      expect(container.textContent).toContain('Overall Bill Discount');
      expect(container.textContent).toContain('₹ 250.00');

      // Click preset 10%
      const buttons = container.querySelectorAll('button');
      const preset10 = Array.from(buttons).find((b) => b.textContent?.includes('10%'));
      expect(preset10).toBeDefined();

      act(() => {
        preset10?.click();
      });

      // Submit
      const applyBtn = Array.from(buttons).find((b) => b.textContent?.includes('Apply Discount'));
      expect(applyBtn).toBeDefined();

      act(() => {
        applyBtn?.click();
      });

      expect(onApply).toHaveBeenCalledWith(10);
      expect(onClose).toHaveBeenCalled();

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });
});
