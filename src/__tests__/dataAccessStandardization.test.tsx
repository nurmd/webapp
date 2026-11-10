// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// Mock pouchdb
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
    migrateFromLocalStorage: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock heavy child components for InventoryView
vi.mock('../components/Invoicing/SimplifiedInvoiceModal.tsx', () => ({
  SimplifiedInvoiceModal: () => <div data-testid="mock-invoice-modal" />,
}));
vi.mock('../components/Purchases/SimplifiedPurchaseModal.tsx', () => ({
  SimplifiedPurchaseModal: () => <div data-testid="mock-purchase-modal" />,
}));
vi.mock('../components/Inventory/ItemFormModal.tsx', () => ({
  ItemFormModal: () => <div data-testid="mock-item-form-modal" />,
}));
vi.mock('../components/Inventory/StockAdjustmentModal.tsx', () => ({
  StockAdjustmentModal: () => <div data-testid="mock-stock-adj-modal" />,
}));
vi.mock('../components/Inventory/InventoryFilterSheet.tsx', () => ({
  InventoryFilterSheet: () => <div data-testid="mock-filter-sheet" />,
}));
vi.mock('../components/Inventory/BarcodeLabelModal.tsx', () => ({
  BarcodeLabelModal: () => <div data-testid="mock-barcode-modal" />,
}));
vi.mock('../components/Common/ConfirmDeleteModal.tsx', () => ({
  ConfirmDeleteModal: () => <div data-testid="mock-confirm-delete" />,
}));

// Mock browser APIs
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
const mockPrint = vi.fn();
const mockOpen = vi.fn();

import { db } from '../services/db.ts';
import { InventoryView } from '../components/Inventory/InventoryView.tsx';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';

describe('Data Access Standardization Suite (Phase 2.1 Batch 1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
    window.open = mockOpen;
    window.print = mockPrint;

    db.clearMemoryCache();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('Static Source File Assertions (zero render-time db.get* calls)', () => {
    const inventoryPath = path.resolve(__dirname, '../components/Inventory/InventoryView.tsx');
    const partiesPath = path.resolve(__dirname, '../components/Parties/PartiesView.tsx');
    const reportsPath = path.resolve(__dirname, '../components/Reports/BusinessReportsView.tsx');

    it('InventoryView.tsx contains zero occurrences of migrated db.get* calls', () => {
      const inventorySource = fs.readFileSync(inventoryPath, 'utf-8');
      const prohibitedCalls = [
        'db.getCompany(',
        'db.getInvoices(',
        'db.getPurchases(',
        'db.getStockAdjustments(',
        'db.getVouchers(',
      ];

      for (const call of prohibitedCalls) {
        expect(inventorySource).not.toContain(call);
      }
    });

    it('PartiesView.tsx contains zero occurrences of db.getCompany, db.getVouchers, db.getStockAdjustments, db.getCategories, and zero render-time calls in partyLatestTxMap', () => {
      const partiesSource = fs.readFileSync(partiesPath, 'utf-8');

      // Assert global render-time calls are eliminated
      expect(partiesSource).not.toContain('db.getCompany(');
      expect(partiesSource).not.toContain('db.getVouchers(');
      expect(partiesSource).not.toContain('db.getStockAdjustments(');
      expect(partiesSource).not.toContain('db.getCategories(');

      // Assert partyLatestTxMap memo contains zero occurrences of db.getInvoices and db.getPurchases
      const memoMatch = partiesSource.match(/partyLatestTxMap = useMemo\(\(\) => \{([\s\S]*?)\}, \[/);
      expect(memoMatch).toBeTruthy();
      expect(memoMatch![1]).not.toContain('db.getInvoices(');
      expect(memoMatch![1]).not.toContain('db.getPurchases(');

      // Assert handler-time calls at the bottom remain untouched as specified
      expect(partiesSource).toContain('db.getBankAccounts()');
      expect(partiesSource).toContain('db.getInvoices()');
      expect(partiesSource).toContain('db.getPurchases()');
      expect(partiesSource).toContain('db.getParties()');
    });

    it('BusinessReportsView.tsx contains zero occurrences of db.getBankAccounts( and db.getCashBankTransactions(', () => {
      const reportsSource = fs.readFileSync(reportsPath, 'utf-8');
      expect(reportsSource).not.toContain('db.getBankAccounts(');
      expect(reportsSource).not.toContain('db.getCashBankTransactions(');
    });
  });

  describe('InventoryView Render Integration with Store Hooks', () => {
    it('renders and reflects store-provided transactions when invoices/purchases/adjustments props are omitted', () => {
      const testItem: InventoryItem = {
        id: 'item-std-101',
        name: 'Standardized Widget Pro',
        sku: 'SWP-001',
        category: 'Hardware',
        hsnSacCode: '8471',
        unit: 'PCS',
        salePrice: 200,
        purchasePrice: 100,
        gstRate: 18,
        currentStock: 25,
        minStockAlert: 5,
        createdAt: '2026-11-10T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
      };
      db.saveItem(testItem);

      const testPurchase: PurchaseBill = {
        id: 'pur-std-101',
        billNumber: 'PB-2026-001',
        date: '2026-11-10',
        supplierId: 'supp-101',
        supplierName: 'Acme Hardware Corp',
        supplierAddress: '12 Industrial Estate',
        supplierStateCode: '18',
        placeOfSupplyStateCode: '18',
        isIntraState: true,
        itcEligibility: 'ELIGIBLE_INPUTS',
        isRcm: false,
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1500,
        paidAmount: 1500,
        balanceAmount: 0,
        paymentStatus: 'PAID',
        paymentMode: 'CASH',
        items: [
          {
            itemId: 'item-std-101',
            name: 'Standardized Widget Pro',
            hsnSacCode: '8471',
            unit: 'PCS',
            quantity: 15,
            unitPrice: 100,
            taxableAmount: 1500,
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1500,
          },
        ],
        createdAt: '2026-11-10T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
      };
      db.savePurchase(testPurchase);

      const testInvoice: Invoice = {
        id: 'inv-std-101',
        invoiceNumber: 'INV-2026-001',
        invoiceType: 'B2CS',
        partyName: 'Walk-in Customer',
        partyAddress: 'Guwahati',
        partyStateCode: '18',
        placeOfSupplyStateCode: '18',
        isIntraState: true,
        date: '2026-11-10',
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1000,
        amountInWords: 'One Thousand',
        paidAmount: 1000,
        balanceAmount: 0,
        paymentStatus: 'PAID',
        paymentMode: 'CASH',
        items: [
          {
            itemId: 'item-std-101',
            name: 'Standardized Widget Pro',
            hsnSacCode: '8471',
            unit: 'PCS',
            quantity: 5,
            unitPrice: 200,
            taxableAmount: 1000,
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1000,
          },
        ],
        createdAt: '2026-11-10T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
      };
      db.saveInvoice(testInvoice);

      // Render InventoryView with invoices, purchases, adjustments props completely omitted
      act(() => {
        root.render(
          <InventoryView
            items={[testItem]}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      // The store-provided transactions: 15 purchased - 5 sold = 10 net stock.
      // Since currentStock is 25 > 10, discrepancy reconciliation banner appears!
      expect(container.textContent).toContain('1 item has stock discrepancy');
      expect(container.textContent).toContain('Sync All (1)');

      // When empty array props are explicitly passed, prop override precedence holds (invoices ?? storeInvoices)
      act(() => {
        root.render(
          <InventoryView
            items={[testItem]}
            invoices={[]}
            purchases={[]}
            adjustments={[]}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      // No transactions evaluated from empty arrays, so no discrepancy banner rendered
      expect(container.textContent).not.toContain('stock discrepancy');
    });
  });
});
