import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

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

import { InventoryItem, StockAdjustment } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { db } from '../services/db.ts';
import { ItemFormModal } from '../components/Inventory/ItemFormModal.tsx';
import { ItemDetailSheet } from '../components/Inventory/ItemDetailSheet.tsx';
import { InventoryView } from '../components/Inventory/InventoryView.tsx';

describe('Inventory Item Enhancements Suite (R1 - R4)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
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

  function changeInput(input: HTMLInputElement, value: string) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeInputValueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const mockExistingItems: InventoryItem[] = [
    {
      id: 'item-1',
      name: 'Basmati Rice Premium 5kg',
      category: 'Grains',
      unit: 'BAG',
      salePrice: 450,
      purchasePrice: 400,
      gstRate: 5,
      currentStock: 20,
      minStockAlert: 5,
      sku: 'SKU-RICE-01',
      hsnSacCode: '100630',
      isActive: true,
      isDisabled: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'item-2',
      name: 'Sunflower Cooking Oil 1L',
      category: 'Edible Oil',
      unit: 'LTR',
      salePrice: 160,
      purchasePrice: 140,
      gstRate: 5,
      currentStock: 15,
      minStockAlert: 3,
      sku: 'SKU-OIL-02',
      hsnSacCode: '151219',
      isActive: true,
      isDisabled: false,
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  ];

  const mockInvoices: Invoice[] = [
    {
      id: 'inv-101',
      invoiceNumber: 'INV-2026-001',
      date: '2026-10-01',
      partyName: 'Sharma General Store',
      partyAddress: '123 Market St, Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          itemId: 'item-1',
          name: 'Basmati Rice Premium 5kg',
          quantity: 2,
          unit: 'BAG',
          unitPrice: 450,
          totalAmount: 900,
          taxableAmount: 857.14,
          gstRate: 5,
          cgstAmount: 21.43,
          sgstAmount: 21.43,
          igstAmount: 0,
          cessAmount: 0,
          hsnSacCode: '100630',
        },
      ],
      totalGrossAmount: 900,
      totalDiscount: 0,
      totalTaxableAmount: 857.14,
      totalCgst: 21.43,
      totalSgst: 21.43,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 42.86,
      roundOff: 0,
      grandTotal: 900,
      amountInWords: 'Nine Hundred Rupees Only',
      paidAmount: 900,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      invoiceType: 'B2CS',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
  ];

  const mockPurchases: PurchaseBill[] = [
    {
      id: 'pur-201',
      billNumber: 'PB-2026-001',
      date: '2026-09-25',
      supplierId: 'sup-01',
      supplierName: 'Agro Foods Wholesalers',
      supplierAddress: '45 Grain Market, Pune',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      isRcm: false,
      items: [
        {
          itemId: 'item-1',
          name: 'Basmati Rice Premium 5kg',
          quantity: 10,
          unit: 'BAG',
          unitPrice: 400,
          totalAmount: 4000,
          taxableAmount: 3809.52,
          gstRate: 5,
          cgstAmount: 95.24,
          sgstAmount: 95.24,
          igstAmount: 0,
          cessAmount: 0,
          hsnSacCode: '100630',
        },
      ],
      totalGrossAmount: 4000,
      totalDiscount: 0,
      totalTaxableAmount: 3809.52,
      totalCgst: 95.24,
      totalSgst: 95.24,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 190.48,
      roundOff: 0,
      grandTotal: 4000,
      paidAmount: 4000,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'BANK',
      itcEligibility: 'ELIGIBLE_INPUTS',
      createdAt: '2026-09-25T08:00:00Z',
      updatedAt: '2026-09-25T08:00:00Z',
    },
  ];

  const mockAdjustments: StockAdjustment[] = [
    {
      id: 'adj-301',
      itemId: 'item-1',
      itemName: 'Basmati Rice Premium 5kg',
      type: 'STOCK_IN',
      quantity: 5,
      date: '2026-09-28',
      reason: 'Physical count correction',
      adjustedBy: 'Warehouse Manager',
      createdAt: '2026-09-28T12:00:00Z',
    },
  ];

  // =========================================================================
  // Requirement R2: Duplicate Item Name Warning During Creation
  // =========================================================================
  describe('R2: Duplicate Item Name Warning', () => {
    it('detects duplicate name case-insensitively with trimming in creation mode', () => {
      act(() => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={() => {}}
            editingItem={null}
            onSaveItem={() => {}}
            isGstActive={true}
            existingItems={mockExistingItems}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      expect(nameInput).toBeTruthy();

      // Enter unique name -> no warning
      act(() => {
        changeInput(nameInput, 'Organic Wheat Flour 10kg');
      });
      expect(container.textContent).not.toContain('already exists in inventory');

      // Enter exact existing item name -> warning badge rendered
      act(() => {
        changeInput(nameInput, 'Basmati Rice Premium 5kg');
      });
      expect(container.textContent).toContain('An item with this name already exists in inventory');

      // Enter uppercase with extra whitespace -> case-insensitive & trimmed duplicate warning
      act(() => {
        changeInput(nameInput, '   BASMATI RICE PREMIUM 5KG   ');
      });
      expect(container.textContent).toContain('An item with this name already exists in inventory');
      const alertBadge = container.querySelector('[role="alert"]');
      expect(alertBadge).toBeTruthy();
    });

    it('ignores the current item name in edit mode without triggering duplicate warning', () => {
      act(() => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={() => {}}
            editingItem={mockExistingItems[0]} // Editing 'Basmati Rice Premium 5kg'
            onSaveItem={() => {}}
            isGstActive={true}
            existingItems={mockExistingItems}
          />
        );
      });

      // Name is already 'Basmati Rice Premium 5kg'
      expect(container.textContent).not.toContain('already exists in inventory');

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      expect(nameInput).toBeTruthy();

      // Retain name with extra whitespace or lower-case in edit mode -> still NO warning
      act(() => {
        changeInput(nameInput, '  basmati rice premium 5kg  ');
      });
      expect(container.textContent).not.toContain('already exists in inventory');

      // Change name to ANOTHER existing item ('Sunflower Cooking Oil 1L') -> triggers warning
      act(() => {
        changeInput(nameInput, 'Sunflower Cooking Oil 1L');
      });
      expect(container.textContent).toContain('An item with this name already exists in inventory');
    });

    it('allows submission to proceed even when duplicate warning is active (non-blocking)', () => {
      const handleSave = vi.fn();
      act(() => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={() => {}}
            editingItem={null}
            onSaveItem={handleSave}
            isGstActive={true}
            existingItems={mockExistingItems}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      act(() => {
        changeInput(nameInput, 'Basmati Rice Premium 5kg');
      });

      expect(container.textContent).toContain('An item with this name already exists in inventory');

      const form = container.querySelector('form');
      expect(form).toBeTruthy();
      act(() => {
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Basmati Rice Premium 5kg',
        })
      );
    });

    it('flags duplicate name in edit mode even when neither item has an SKU (undefined or empty)', () => {
      const itemsWithoutSku: InventoryItem[] = [
        {
          id: 'no-sku-1',
          name: 'Organic Honey 500g',
          category: 'Grocery',
          unit: 'BOX',
          salePrice: 250,
          purchasePrice: 200,
          gstRate: 5,
          currentStock: 10,
          minStockAlert: 2,
          sku: undefined,
          hsnSacCode: '040900',
          isActive: true,
          isDisabled: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'no-sku-2',
          name: 'Mustard Seeds 200g',
          category: 'Spices',
          unit: 'PKT',
          salePrice: 40,
          purchasePrice: 30,
          gstRate: 5,
          currentStock: 50,
          minStockAlert: 10,
          sku: '',
          hsnSacCode: '120750',
          isActive: true,
          isDisabled: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      act(() => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={() => {}}
            editingItem={itemsWithoutSku[0]} // Editing 'Organic Honey 500g' which has undefined SKU
            onSaveItem={() => {}}
            isGstActive={true}
            existingItems={itemsWithoutSku}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      expect(nameInput).toBeTruthy();

      // Change name to 'Mustard Seeds 200g' (which has sku: '')
      // Prior attempt had `item.sku === editingItem.sku` which matched undefined === '', or undefined === undefined
      act(() => {
        changeInput(nameInput, 'Mustard Seeds 200g');
      });

      // Warning MUST appear because Mustard Seeds is a different item
      expect(container.textContent).toContain('An item with this name already exists in inventory');

      // Change back to own name -> no warning
      act(() => {
        changeInput(nameInput, 'Organic Honey 500g');
      });
      expect(container.textContent).not.toContain('already exists in inventory');
    });

    it('correctly handles unicode symbols and excessive leading/trailing whitespace', () => {
      const unicodeItems: InventoryItem[] = [
        {
          id: 'u-1',
          name: 'Café Blend 100% Arabica™',
          category: 'Beverage',
          unit: 'PKT',
          salePrice: 300,
          purchasePrice: 220,
          gstRate: 5,
          currentStock: 15,
          minStockAlert: 3,
          sku: 'SKU-COFFEE-01',
          hsnSacCode: '090121',
          isActive: true,
          isDisabled: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      act(() => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={() => {}}
            editingItem={null}
            onSaveItem={() => {}}
            isGstActive={true}
            existingItems={unicodeItems}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;

      // Type whitespace only -> no duplicate alert
      act(() => {
        changeInput(nameInput, '    ');
      });
      expect(container.textContent).not.toContain('already exists in inventory');

      // Type unicode item name with whitespace -> triggers duplicate alert
      act(() => {
        changeInput(nameInput, '   Café Blend 100% Arabica™   ');
      });
      expect(container.textContent).toContain('An item with this name already exists in inventory');

      // Type decomposed NFD unicode ('e' + \u0301) -> triggers duplicate alert due to NFC normalization
      act(() => {
        changeInput(nameInput, 'Cafe\u0301 Blend 100% Arabica™');
      });
      expect(container.textContent).toContain('An item with this name already exists in inventory');
    });

    it('flags duplicate name in edit mode when two different items share the same SKU', () => {
      const itemsWithSharedSku: InventoryItem[] = [
        {
          id: 'shared-sku-1',
          name: 'Item Alpha',
          category: 'General',
          unit: 'PCS',
          salePrice: 100,
          purchasePrice: 80,
          gstRate: 5,
          currentStock: 10,
          minStockAlert: 2,
          sku: 'COMMON-SKU-99',
          hsnSacCode: '123456',
          isActive: true,
          isDisabled: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'shared-sku-2',
          name: 'Item Beta',
          category: 'General',
          unit: 'PCS',
          salePrice: 120,
          purchasePrice: 90,
          gstRate: 5,
          currentStock: 5,
          minStockAlert: 1,
          sku: 'COMMON-SKU-99',
          hsnSacCode: '123456',
          isActive: true,
          isDisabled: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      act(() => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={() => {}}
            editingItem={itemsWithSharedSku[0]} // Editing 'Item Alpha'
            onSaveItem={() => {}}
            isGstActive={true}
            existingItems={itemsWithSharedSku}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      expect(nameInput).toBeTruthy();

      // Renaming Item Alpha to Item Beta (which has the exact same SKU COMMON-SKU-99)
      act(() => {
        changeInput(nameInput, 'Item Beta');
      });

      // Must flag as duplicate because Item Beta is a different existing item in inventory
      expect(container.textContent).toContain('An item with this name already exists in inventory');
    });
  });

  // =========================================================================
  // Requirement R1: Document Preview from Item Transaction History
  // =========================================================================
  describe('R1: Document Preview from Item Transaction History', () => {
    it('preserves originating source invoiceId and purchaseId on transaction records', () => {
      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={mockInvoices}
            allPurchases={mockPurchases}
            allAdjustments={mockAdjustments}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
          />
        );
      });

      // Renders Sale, Purchase, and Stock Adjustment rows
      expect(container.textContent).toContain('Sale');
      expect(container.textContent).toContain('Purchase');
      expect(container.textContent).toContain('STOCK IN');

      // Sale row has Invoice badge and Purchase row has Bill badge
      expect(container.textContent).toContain('Invoice');
      expect(container.textContent).toContain('Bill');
    });

    it('invokes onViewInvoice when clicking a sales transaction row', () => {
      const onViewInvoiceSpy = vi.fn();
      const onViewPurchaseSpy = vi.fn();

      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={mockInvoices}
            allPurchases={mockPurchases}
            allAdjustments={mockAdjustments}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
            onViewInvoice={onViewInvoiceSpy}
            onViewPurchase={onViewPurchaseSpy}
          />
        );
      });

      // Find sales transaction row
      const salesRow = container.querySelector('[title="Click to preview sales invoice"]');
      expect(salesRow).toBeTruthy();

      act(() => {
        salesRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(onViewInvoiceSpy).toHaveBeenCalledTimes(1);
      expect(onViewInvoiceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'inv-101',
          invoiceNumber: 'INV-2026-001',
        })
      );
      expect(onViewPurchaseSpy).not.toHaveBeenCalled();
    });

    it('invokes onViewPurchase when clicking a purchase transaction row', () => {
      const onViewInvoiceSpy = vi.fn();
      const onViewPurchaseSpy = vi.fn();

      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={mockInvoices}
            allPurchases={mockPurchases}
            allAdjustments={mockAdjustments}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
            onViewInvoice={onViewInvoiceSpy}
            onViewPurchase={onViewPurchaseSpy}
          />
        );
      });

      const purchaseRow = container.querySelector('[title="Click to preview purchase bill"]');
      expect(purchaseRow).toBeTruthy();

      act(() => {
        purchaseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(onViewPurchaseSpy).toHaveBeenCalledTimes(1);
      expect(onViewPurchaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pur-201',
          billNumber: 'PB-2026-001',
        })
      );
      expect(onViewInvoiceSpy).not.toHaveBeenCalled();
    });

    it('handles manual stock adjustment rows cleanly without preview errors', () => {
      const onViewInvoiceSpy = vi.fn();
      const onViewPurchaseSpy = vi.fn();

      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={mockInvoices}
            allPurchases={mockPurchases}
            allAdjustments={mockAdjustments}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
            onViewInvoice={onViewInvoiceSpy}
            onViewPurchase={onViewPurchaseSpy}
          />
        );
      });

      // Find adjustment row (contains 'STOCK IN' or 'ADJ-')
      const rows = Array.from(container.querySelectorAll('.space-y-1\\.5 > div'));
      const adjRow = rows.find((r) => r.textContent?.includes('STOCK IN'));
      expect(adjRow).toBeTruthy();

      expect(() => {
        act(() => {
          adjRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
      }).not.toThrow();

      expect(onViewInvoiceSpy).not.toHaveBeenCalled();
      expect(onViewPurchaseSpy).not.toHaveBeenCalled();
    });

    it('opens modal preview directly when onViewInvoice/onViewPurchase props are not provided', () => {
      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={mockInvoices}
            allPurchases={mockPurchases}
            allAdjustments={mockAdjustments}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
          />
        );
      });

      // Click sales row
      const salesRow = container.querySelector('[title="Click to preview sales invoice"]');
      expect(salesRow).toBeTruthy();
      act(() => {
        salesRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // SimplifiedInvoiceModal should render with invoice details
      expect(container.textContent).toContain('INV-2026-001');
    });

    it('invokes previewInvoice and previewPurchase aliases when provided', () => {
      const previewInvoiceSpy = vi.fn();
      const previewPurchaseSpy = vi.fn();

      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={mockInvoices}
            allPurchases={mockPurchases}
            allAdjustments={mockAdjustments}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
            previewInvoice={previewInvoiceSpy}
            previewPurchase={previewPurchaseSpy}
          />
        );
      });

      // Click sales row
      const salesRow = container.querySelector('[title="Click to preview sales invoice"]');
      act(() => {
        salesRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(previewInvoiceSpy).toHaveBeenCalledTimes(1);

      // Click purchase row
      const purchaseRow = container.querySelector('[title="Click to preview purchase bill"]');
      act(() => {
        purchaseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(previewPurchaseSpy).toHaveBeenCalledTimes(1);
    });

    it('assigns unique transaction ids when an item appears multiple times in a single invoice', () => {
      const multiItemInvoice: Invoice[] = [
        {
          ...mockInvoices[0],
          id: 'inv-multi',
          items: [
            {
              itemId: 'item-1',
              name: 'Basmati Rice Premium 5kg',
              quantity: 2,
              unit: 'BAG',
              unitPrice: 450,
              totalAmount: 900,
              taxableAmount: 857.14,
              gstRate: 5,
              cgstAmount: 21.43,
              sgstAmount: 21.43,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '100630',
            },
            {
              itemId: 'item-1',
              name: 'Basmati Rice Premium 5kg',
              quantity: 5,
              unit: 'BAG',
              unitPrice: 450,
              totalAmount: 2250,
              taxableAmount: 2142.85,
              gstRate: 5,
              cgstAmount: 53.57,
              sgstAmount: 53.57,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '100630',
            },
          ],
        },
      ];

      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={multiItemInvoice}
            allPurchases={[]}
            allAdjustments={[]}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
          />
        );
      });

      // Both line items render separately without crashing
      const salesRows = container.querySelectorAll('[title="Click to preview sales invoice"]');
      expect(salesRows.length).toBe(2);
    });

    it('opens purchase modal preview directly when onViewPurchase/previewPurchase props are omitted', () => {
      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={[]}
            allPurchases={mockPurchases}
            allAdjustments={[]}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
          />
        );
      });

      const purchaseRow = container.querySelector('[title="Click to preview purchase bill"]');
      expect(purchaseRow).toBeTruthy();

      act(() => {
        purchaseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // SimplifiedPurchaseModal renders
      expect(container.textContent).toContain('PB-2026-001');
    });

    it('matches transactions using Unicode NFC normalization when invoice items use decomposed NFD names', () => {
      const unicodeItem: InventoryItem = {
        id: 'u-item-1',
        name: 'Café Latte', // Precomposed NFC
        category: 'Beverage',
        unit: 'BOX',
        salePrice: 150,
        purchasePrice: 50,
        gstRate: 5,
        currentStock: 10,
        minStockAlert: 2,
        hsnSacCode: '210111',
        isActive: true,
        isDisabled: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const nfdInvoice: Invoice[] = [
        {
          ...mockInvoices[0],
          id: 'inv-nfd-1',
          items: [
            {
              itemId: '',
              name: 'Cafe\u0301 Latte', // Decomposed NFD
              quantity: 3,
              unit: 'BOX',
              unitPrice: 150,
              totalAmount: 450,
              taxableAmount: 428.57,
              gstRate: 5,
              cgstAmount: 10.71,
              sgstAmount: 10.71,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '210111',
            },
          ],
        },
      ];

      act(() => {
        root.render(
          <ItemDetailSheet
            item={unicodeItem}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={nfdInvoice}
            allPurchases={[]}
            allAdjustments={[]}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
          />
        );
      });

      // Sale row with NFD name should be matched and displayed
      expect(container.textContent).toContain('Sale');
      expect(container.textContent).toContain('Invoice');
    });

    it('isolates transactions when two items share a name but have distinct itemIds', () => {
      const duplicateNamedItem1: InventoryItem = {
        ...mockExistingItems[0],
        id: 'item-dup-1',
        name: 'Loose Sugar',
      };

      const duplicateNamedItem2Invoice: Invoice[] = [
        {
          ...mockInvoices[0],
          id: 'inv-item-2',
          items: [
            {
              itemId: 'item-dup-2', // Distinct item ID
              name: 'Loose Sugar',
              quantity: 5,
              unit: 'KGS',
              unitPrice: 40,
              totalAmount: 200,
              taxableAmount: 190.48,
              gstRate: 5,
              cgstAmount: 4.76,
              sgstAmount: 4.76,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '170114',
            },
          ],
        },
      ];

      act(() => {
        root.render(
          <ItemDetailSheet
            item={duplicateNamedItem1}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={duplicateNamedItem2Invoice}
            allPurchases={[]}
            allAdjustments={[]}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
          />
        );
      });

      // Transaction belonging to item-dup-2 should NOT appear under item-dup-1
      expect(container.textContent).toContain('No transactions recorded');
    });
  });

  // =========================================================================
  // Requirement R3: Floating Sticky Search Bar & Toolbar Polish
  // =========================================================================
  describe('R3: Floating Sticky Search Bar & Toolbar Polish', () => {
    it('renders a sticky search bar with sticky top-14 z-20 styling below app header', () => {
      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      const stickySection = container.querySelector('section.sticky');
      expect(stickySection).toBeTruthy();
      expect(stickySection?.className).toContain('top-14');
      expect(stickySection?.className).toContain('z-20');
    });

    it('removes barcode scanner icon from search input', () => {
      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
            onScanBarcodeClick={() => {}}
          />
        );
      });

      const barcodeBtn = container.querySelector('button[aria-label="Scan Item Barcode"]');
      expect(barcodeBtn).toBeNull();
      const barcodeIcon = container.querySelector('.material-symbols-outlined');
      expect(container.textContent).not.toContain('barcode_scanner');
    });

    it('removes settings gear/tune button from inventory toolbar', () => {
      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
            onOpenSettings={() => {}}
          />
        );
      });

      const settingsBtn = container.querySelector('button[aria-label="Items & Stock Settings"]');
      expect(settingsBtn).toBeNull();
    });

    it('renders 1-tap clear button inside search input when text is entered and resets search on click', () => {
      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      const searchInput = container.querySelector('input[placeholder*="Search items"]') as HTMLInputElement;
      expect(searchInput).toBeTruthy();

      // When search query is empty -> no clear button
      let clearBtn = container.querySelector('button[aria-label="Clear Search"]');
      expect(clearBtn).toBeNull();

      // Enter search query
      act(() => {
        changeInput(searchInput, 'Basmati');
      });

      // Clear button should now be visible
      clearBtn = container.querySelector('button[aria-label="Clear Search"]');
      expect(clearBtn).toBeTruthy();

      // Click clear button
      act(() => {
        clearBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Query resets to empty and clear button disappears
      expect(searchInput.value).toBe('');
      clearBtn = container.querySelector('button[aria-label="Clear Search"]');
      expect(clearBtn).toBeNull();
    });

    it('keeps Buy-Price visibility toggle and filter sheet button intact and working', () => {
      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      const buyPriceToggle = container.querySelector('button[aria-label*="Buy Prices"]');
      expect(buyPriceToggle).toBeTruthy();

      const filterBtn = container.querySelector('button[aria-label="Filter & Sort Options"]');
      expect(filterBtn).toBeTruthy();

      // Clicking filter button opens filter sheet
      act(() => {
        filterBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('Filter & Sort');
    });

    it('forwards previewInvoice and previewPurchase aliases when provided to InventoryView', () => {
      const previewInvSpy = vi.fn();
      const previewPurSpy = vi.fn();

      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
            previewInvoice={previewInvSpy}
            previewPurchase={previewPurSpy}
          />
        );
      });

      // Click an item card to open ItemDetailSheet
      const itemCard = container.querySelector('[aria-label="Select Basmati Rice Premium 5kg"]');
      expect(itemCard).toBeTruthy();
      act(() => {
        itemCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // ItemDetailSheet is now open. Click sales row
      const salesRow = container.querySelector('[title="Click to preview sales invoice"]');
      expect(salesRow).toBeTruthy();
      act(() => {
        salesRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(previewInvSpy).toHaveBeenCalledTimes(1);

      // Click purchase row
      const purchaseRow = container.querySelector('[title="Click to preview purchase bill"]');
      expect(purchaseRow).toBeTruthy();
      act(() => {
        purchaseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(previewPurSpy).toHaveBeenCalledTimes(1);
    });

    it('resets search query when pressing Escape key in search input', () => {
      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      const searchInput = container.querySelector('input[placeholder*="Search items"]') as HTMLInputElement;
      act(() => {
        changeInput(searchInput, 'Oil');
      });
      expect(searchInput.value).toBe('Oil');

      act(() => {
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(searchInput.value).toBe('');
    });

    it('allows accessible keyboard activation (Enter and Space) on InventoryItemCard', () => {
      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      const itemCard = container.querySelector('[aria-label="Select Basmati Rice Premium 5kg"]') as HTMLDivElement;
      expect(itemCard).toBeTruthy();

      // Press Enter key on card
      act(() => {
        itemCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      // ItemDetailSheet opens
      expect(container.textContent).toContain('Basmati Rice Premium 5kg');
      expect(container.textContent).toContain('Transactions');
    });

    it('does not trigger card onClick when pressing Enter or Space while focused on child Buy Price button', () => {
      act(() => {
        root.render(
          <InventoryView
            items={mockExistingItems}
            invoices={mockInvoices}
            purchases={mockPurchases}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      // Initially ItemDetailSheet is NOT open
      expect(container.textContent).not.toContain('Transactions');

      // Find the Buy Price button inside the first card
      const buyPriceBtn = container.querySelector('button[title*="purchase price"]') as HTMLButtonElement;
      expect(buyPriceBtn).toBeTruthy();

      // Press Enter key while focused on the buy price button
      act(() => {
        buyPriceBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      // ItemDetailSheet should NOT be opened
      expect(container.textContent).not.toContain('Transactions');

      // Press Space key while focused on the buy price button
      act(() => {
        buyPriceBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });

      // ItemDetailSheet should still NOT be opened
      expect(container.textContent).not.toContain('Transactions');
    });

    it('prioritizes invoiceId and purchaseId over referenceNo when multiple documents share identical reference numbers', () => {
      const collidingInvoices: Invoice[] = [
        {
          ...mockInvoices[0],
          id: 'inv-target-1',
          invoiceNumber: 'INV-SHARED-001',
          items: [
            {
              itemId: 'other-item',
              name: 'Other Item',
              quantity: 1,
              unit: 'PCS',
              unitPrice: 100,
              totalAmount: 100,
              taxableAmount: 100,
              gstRate: 0,
              cgstAmount: 0,
              sgstAmount: 0,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '0000',
            },
          ],
        },
        {
          ...mockInvoices[0],
          id: 'inv-target-2',
          invoiceNumber: 'INV-SHARED-001', // Colliding reference number
          items: [
            {
              itemId: 'item-1',
              name: 'Basmati Rice Premium 5kg',
              quantity: 4,
              unit: 'BAG',
              unitPrice: 450,
              totalAmount: 1800,
              taxableAmount: 1714.28,
              gstRate: 5,
              cgstAmount: 42.86,
              sgstAmount: 42.86,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '100630',
            },
          ],
        },
      ];

      const collidingPurchases: PurchaseBill[] = [
        {
          ...mockPurchases[0],
          id: 'pur-target-1',
          billNumber: 'PB-SHARED-001',
          items: [
            {
              itemId: 'other-item',
              name: 'Other Item',
              quantity: 1,
              unit: 'PCS',
              unitPrice: 50,
              totalAmount: 50,
              taxableAmount: 50,
              gstRate: 0,
              cgstAmount: 0,
              sgstAmount: 0,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '0000',
            },
          ],
        },
        {
          ...mockPurchases[0],
          id: 'pur-target-2',
          billNumber: 'PB-SHARED-001', // Colliding reference number
          items: [
            {
              itemId: 'item-1',
              name: 'Basmati Rice Premium 5kg',
              quantity: 12,
              unit: 'BAG',
              unitPrice: 400,
              totalAmount: 4800,
              taxableAmount: 4571.42,
              gstRate: 5,
              cgstAmount: 114.29,
              sgstAmount: 114.29,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '100630',
            },
          ],
        },
      ];

      const onViewInvoiceSpy = vi.fn();
      const onViewPurchaseSpy = vi.fn();

      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={collidingInvoices}
            allPurchases={collidingPurchases}
            allAdjustments={[]}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
            onViewInvoice={onViewInvoiceSpy}
            onViewPurchase={onViewPurchaseSpy}
          />
        );
      });

      // Click sales row
      const salesRow = container.querySelector('[title="Click to preview sales invoice"]');
      expect(salesRow).toBeTruthy();
      act(() => {
        salesRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Must strictly resolve to inv-target-2, not inv-target-1
      expect(onViewInvoiceSpy).toHaveBeenCalledTimes(1);
      expect(onViewInvoiceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'inv-target-2',
        })
      );

      // Click purchase row
      const purchaseRow = container.querySelector('[title="Click to preview purchase bill"]');
      expect(purchaseRow).toBeTruthy();
      act(() => {
        purchaseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Must strictly resolve to pur-target-2, not pur-target-1
      expect(onViewPurchaseSpy).toHaveBeenCalledTimes(1);
      expect(onViewPurchaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pur-target-2',
        })
      );
    });

    it('safely tolerates sparse arrays, null items in documents, and invalid date formats', () => {
      // 1. Sparse array in existingItems
      act(() => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={() => {}}
            editingItem={null}
            onSaveItem={() => {}}
            isGstActive={true}
            existingItems={[null as unknown as InventoryItem, ...mockExistingItems]}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      expect(() => {
        act(() => {
          changeInput(nameInput, 'Basmati Rice Premium 5kg');
        });
      }).not.toThrow();
      expect(container.textContent).toContain('An item with this name already exists in inventory');

      // 2. Corrupt/null items in invoice and invalid date
      const corruptInvoices: Invoice[] = [
        {
          ...mockInvoices[0],
          id: 'inv-corrupt-1',
          date: 'invalid-date-string',
          items: [
            null as unknown as Invoice['items'][0],
            {
              itemId: 'item-1',
              name: 'Basmati Rice Premium 5kg',
              quantity: 1,
              unit: 'BAG',
              unitPrice: 450,
              totalAmount: 450,
              taxableAmount: 428.57,
              gstRate: 5,
              cgstAmount: 10.71,
              sgstAmount: 10.71,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '100630',
            },
          ],
        },
      ];

      expect(() => {
        act(() => {
          root.render(
            <ItemDetailSheet
              item={mockExistingItems[0]}
              onClose={() => {}}
              isGstActive={true}
              allInvoices={corruptInvoices}
              allPurchases={[]}
              allAdjustments={[]}
              isBuyPriceVisible={() => true}
              toggleBuyPrice={() => {}}
              onOpenEdit={() => {}}
              onOpenAdjustment={() => {}}
              onToggleItemStatus={() => {}}
              onDeleteItem={() => {}}
              onReconcileItemStock={() => {}}
            />
          );
        });
      }).not.toThrow();

      expect(container.textContent).toContain('Sale');
    });

    it('safely handles corrupt purchase bills with null/undefined items and clicks on manual stock adjustment without error', () => {
      const onViewInvoiceSpy = vi.fn();
      const onViewPurchaseSpy = vi.fn();

      const corruptPurchases: PurchaseBill[] = [
        {
          ...mockPurchases[0],
          id: 'pur-corrupt-1',
          date: 'invalid-date',
          items: [
            null as unknown as PurchaseBill['items'][0],
            undefined as unknown as PurchaseBill['items'][0],
            {
              itemId: 'item-1',
              name: 'Basmati Rice Premium 5kg',
              quantity: 5,
              unit: 'BAG',
              unitPrice: 400,
              totalAmount: 2000,
              taxableAmount: 1904.76,
              gstRate: 5,
              cgstAmount: 47.62,
              sgstAmount: 47.62,
              igstAmount: 0,
              cessAmount: 0,
              hsnSacCode: '100630',
            },
          ],
        },
      ];

      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={[]}
            allPurchases={corruptPurchases}
            allAdjustments={mockAdjustments}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
            onViewInvoice={onViewInvoiceSpy}
            onViewPurchase={onViewPurchaseSpy}
          />
        );
      });

      // Purchase row rendered properly
      expect(container.textContent).toContain('Purchase');
      const purchaseRow = container.querySelector('[title="Click to preview purchase bill"]');
      expect(purchaseRow).toBeTruthy();
      act(() => {
        purchaseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onViewPurchaseSpy).toHaveBeenCalledTimes(1);

      // Manual adjustment row has NO document preview title and clicking does NOT invoke spies
      const adjustmentRows = container.querySelectorAll('.font-tabular-data');
      expect(adjustmentRows.length).toBeGreaterThan(0);
      expect(onViewInvoiceSpy).not.toHaveBeenCalled();
    });

    it('strictly respects explicitly empty allInvoices and allPurchases arrays without DB bleed', () => {
      // Seed db with dummy invoice for item-1
      const invoiceSpy = vi.spyOn(db, 'getInvoices').mockReturnValue([
        {
          ...mockInvoices[0],
          id: 'db-inv-999',
          items: [{ ...mockInvoices[0].items[0], itemId: 'item-1' }],
        },
      ]);

      act(() => {
        root.render(
          <ItemDetailSheet
            item={mockExistingItems[0]}
            onClose={() => {}}
            isGstActive={true}
            allInvoices={[]}
            allPurchases={[]}
            allAdjustments={[]}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={() => {}}
            onOpenEdit={() => {}}
            onOpenAdjustment={() => {}}
            onToggleItemStatus={() => {}}
            onDeleteItem={() => {}}
            onReconcileItemStock={() => {}}
          />
        );
      });

      // No transactions should be displayed since allInvoices was explicitly passed as empty
      expect(container.textContent).toContain('No transactions recorded');
      expect(container.textContent).not.toContain('db-inv-999');

      invoiceSpy.mockRestore();
    });
  });
});
