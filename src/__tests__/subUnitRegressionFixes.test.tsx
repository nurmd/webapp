import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  applyStockAdjustmentRecord,
  applyPurchaseStockIncrement,
  convertQuantityToBase,
  convertQuantityFromBase,
} from '../core/inventory/stockEngine.ts';
import { auditAllItemStock, reconcileItemStock } from '../core/audit/inventoryStockAuditor.ts';
import {
  calculateBillProfit,
  aggregateStockValuation,
  computeTradingProfitAndStockSummary,
} from '../components/Reports/utils/reportAggregations.ts';
import { InventoryItemCard } from '../components/Inventory/InventoryItemCard.tsx';
import { PosCatalogGridCard, PosCatalogListRow } from '../components/POS/pos/PosCatalogCard.tsx';
import { InvoiceItemModal } from '../components/Invoicing/InvoiceItemModal.tsx';
import { InventoryStockAuditorPanel } from '../components/Audit/InventoryStockAuditorPanel.tsx';
import { BarcodeLabelModal } from '../components/Inventory/BarcodeLabelModal.tsx';
import { db } from '../services/db.ts';
import type { InventoryItem, StockAdjustment } from '../models/item.ts';
import type { Invoice } from '../models/invoice.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { CompanyProfile } from '../models/company.ts';

const mockCompany = {
  id: 'CMP-1',
  businessName: 'Test Store',
  gstin: '29ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  email: 'test@example.com',
  phone: '9876543210',
  address: '123 Market St',
  stateCode: '29',
  pincode: '560001',
} as unknown as CompanyProfile;

function createBagItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'ITM-BAG-1',
    name: 'Wheat Flour 40kg Bag',
    hsnSacCode: '11010000',
    category: 'Groceries',
    unit: 'BAG',
    subUnit: 'KG',
    subUnitFactor: 40,
    salePrice: 500,
    purchasePrice: 400,
    gstRate: 0,
    currentStock: 100, // 100 KG base units = 2.5 BAG
    minStockAlert: 40,  // 40 KG base units = 1 BAG
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Sub-Unit Regression Fixes (Audit Prompt Invariants)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
    vi.restoreAllMocks();
  });

  // 1. Manual stock adjustment: BAG/40KG item, Stock In 10 BAG → base +400
  it('Manual stock adjustment: BAG/40KG item, Stock In 10 BAG increments base stock by +400', () => {
    const item = createBagItem({ currentStock: 0 });
    const adjustment: StockAdjustment = {
      id: 'ADJ-1',
      itemId: item.id,
      itemName: item.name,
      type: 'STOCK_IN',
      quantity: 10, // 10 BAG entered in primary unit
      date: '2026-11-23',
      reason: 'Fresh Stock Inward',
      createdAt: '2026-11-23T12:00:00Z',
    };

    const updated = applyStockAdjustmentRecord([item], adjustment);
    expect(updated[0].currentStock).toBe(400); // 10 BAG * 40 = 400 KG base units

    // Also verify STOCK_OUT conversion
    const outAdjustment: StockAdjustment = {
      id: 'ADJ-2',
      itemId: item.id,
      itemName: item.name,
      type: 'STOCK_OUT',
      quantity: 2, // 2 BAG = 80 KG
      date: '2026-11-23',
      reason: 'Sample Dispatch',
      createdAt: '2026-11-23T12:00:00Z',
    };
    const afterOut = applyStockAdjustmentRecord(updated, outAdjustment);
    expect(afterOut[0].currentStock).toBe(320); // 400 - 80 = 320 KG
  });

  // 2. Discrepancy/reconcile: BAG item, purchase 10 BAG, sell 2 BAG → no false discrepancy; reconcile never changes base stock unexpectedly
  it('Discrepancy/reconcile: BAG item, purchase 10 BAG, sell 2 BAG has 0 discrepancy; reconcile leaves base stock intact', async () => {
    const item = createBagItem({ currentStock: 320 }); // Expected base = 10 BAG (400 KG) - 2 BAG (80 KG) = 320 KG

    const purchases = [
      {
        id: 'PUR-1',
        billNumber: 'PB-101',
        supplierName: 'Flour Mill',
        date: '2026-11-01',
        dueDate: '2026-11-15',
        paymentStatus: 'PAID',
        paymentMode: 'BANK',
        notes: '',
        grandTotal: 4000,
        createdAt: '2026-11-01T10:00:00Z',
        items: [
          {
            itemId: item.id,
            name: item.name,
            hsnSacCode: '11010000',
            quantity: 10,
            unit: 'BAG',
            unitPrice: 400,
            discountPercent: 0,
            taxableAmount: 4000,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 4000,
            gstRate: 0,
          },
        ],
      },
    ] as unknown as PurchaseBill[];

    const invoices = [
      {
        id: 'INV-1',
        invoiceNumber: 'INV-101',
        partyName: 'Bakery Mart',
        date: '2026-11-05',
        dueDate: '2026-11-20',
        paymentStatus: 'PAID',
        paymentMode: 'CASH',
        notes: '',
        grandTotal: 1000,
        createdAt: '2026-11-05T10:00:00Z',
        items: [
          {
            itemId: item.id,
            name: item.name,
            hsnSacCode: '11010000',
            quantity: 2,
            unit: 'BAG',
            unitPrice: 500,
            discountPercent: 0,
            taxableAmount: 1000,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1000,
            gstRate: 0,
          },
        ],
      },
    ] as unknown as Invoice[];

    // Audit using the converted base movements
    const report = auditAllItemStock({
      items: [item],
      invoices,
      purchases,
      adjustments: [],
      allowNegativeStock: false,
    });

    // Ground truth: 400 KG purchased, 80 KG sold = 320 KG computed stock. Recorded stock = 320 KG.
    expect(report.discrepancies).toHaveLength(0);
    expect(report.healthyItemsCount).toBe(1);

    // Now test mock DB with reconcileItemStock
    vi.spyOn(db, 'getItems').mockReturnValue([item]);
    vi.spyOn(db, 'saveItem').mockImplementation((saved) => saved);

    const reconcileResult = await reconcileItemStock(report);
    expect(reconcileResult.reconciledCount).toBe(0);
  });

  // 3. Report valuation: BAG item, 4000 KG base, purchasePrice ₹400/BAG → stock value ₹40,000 (and ₹4000 for 400 KG)
  it('Report valuation: BAG item values stock at primary unit quantity * purchasePrice', () => {
    // 4000 KG base with 1 BAG = 40 KG -> 100 BAG @ ₹400/BAG = ₹40,000
    const largeItem = createBagItem({
      currentStock: 4000, // 4000 KG
      purchasePrice: 400, // ₹400 per BAG
    });
    const valuationLarge = aggregateStockValuation([largeItem]);
    expect(valuationLarge.totalQuantity).toBe(100); // 100 BAG
    expect(valuationLarge.purchaseValuation).toBe(40000); // 100 * 400 = ₹40,000

    // 400 KG base with 1 BAG = 40 KG -> 10 BAG @ ₹400/BAG = ₹4,000
    const moderateItem = createBagItem({
      currentStock: 400, // 400 KG
      purchasePrice: 400, // ₹400 per BAG
    });
    const valuationModerate = aggregateStockValuation([moderateItem]);
    expect(valuationModerate.totalQuantity).toBe(10); // 10 BAG
    expect(valuationModerate.purchaseValuation).toBe(4000); // 10 * 400 = ₹4,000

    // Trading Profit summary stock valuation
    const summary = computeTradingProfitAndStockSummary([], [], [], [largeItem]);
    expect(summary.closingStockQuantity).toBe(100);
    expect(summary.closingStockValue).toBe(40000);
  });

  // 4. COGS: sale of 1 BAG with purchasePrice ₹400/BAG → COGS ₹400
  it('COGS: sale of 1 BAG with purchasePrice ₹400/BAG yields COGS ₹400', () => {
    const item = createBagItem({ purchasePrice: 400 });
    const itemsMap = new Map<string, InventoryItem>([[item.id, item]]);

    const inv = {
      id: 'INV-COGS-1',
      invoiceNumber: 'INV-1',
      partyName: 'Customer A',
      date: '2026-11-10',
      dueDate: '2026-11-10',
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      notes: '',
      grandTotal: 500,
      totalTaxableAmount: 500,
      createdAt: '2026-11-10T10:00:00Z',
      items: [
        {
          itemId: item.id,
          name: item.name,
          hsnSacCode: '11010000',
          quantity: 1, // 1 BAG
          unit: 'BAG',
          unitPrice: 500,
          discountPercent: 0,
          taxableAmount: 500,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 500,
          gstRate: 0,
        },
      ],
    } as unknown as Invoice;

    const profit1 = calculateBillProfit(inv, itemsMap);
    expect(profit1.cogs).toBe(400); // 1 BAG * 400 = 400

    // Sale of 20 KG (0.5 BAG) with purchasePrice ₹400/BAG -> COGS ₹200
    const invHalfBag: Invoice = {
      ...inv,
      id: 'INV-COGS-2',
      items: [
        {
          ...inv.items[0],
          quantity: 20, // 20 KG
          unit: 'KG',
        },
      ],
    };
    const profit2 = calculateBillProfit(invHalfBag, itemsMap);
    expect(profit2.cogs).toBe(200); // 0.5 BAG * 400 = 200
  });

  // 5. Purchase price normalisation: buy 40 KG @ ₹10 → purchasePrice 400
  it('Purchase price normalisation: buying 40 KG @ ₹10 sets purchasePrice to 400 per primary unit (BAG)', () => {
    const item = createBagItem({ purchasePrice: 0 });
    const catalog = [item];

    const purchaseLines = [
      {
        itemId: item.id,
        name: item.name,
        quantity: 40,
        unit: 'KG', // bought in sub-unit
        unitPrice: 10, // ₹10 per KG
      },
    ];

    const updated = applyPurchaseStockIncrement(catalog, purchaseLines);
    expect(updated[0].purchasePrice).toBe(400); // 10 * 40 = ₹400 per BAG

    // If bought in main unit, unitPrice is retained directly
    const buyInBags = [
      {
        itemId: item.id,
        name: item.name,
        quantity: 5,
        unit: 'BAG',
        unitPrice: 420,
      },
    ];
    const updatedBags = applyPurchaseStockIncrement(catalog, buyInBags);
    expect(updatedBags[0].purchasePrice).toBe(420);
  });

  // 6. Item form round-trip: edit a BAG item → shows primary-unit value; save without changes → currentStock unchanged
  it('Item form round-trip: edit a BAG item shows primary-unit value and save without changes leaves base currentStock unchanged', () => {
    const item = createBagItem({
      currentStock: 100, // 100 KG base
      minStockAlert: 40,  // 40 KG base
      unit: 'BAG',
      subUnit: 'KG',
      subUnitFactor: 40,
    });

    // On edit load: convert base quantity to primary unit
    const displayedCurrentStock = convertQuantityFromBase(item.currentStock, item.unit, item);
    const displayedMinAlert = convertQuantityFromBase(item.minStockAlert, item.unit, item);

    expect(displayedCurrentStock).toBe(2.5); // 100 / 40 = 2.5 BAG
    expect(displayedMinAlert).toBe(1);       // 40 / 40 = 1 BAG

    // On form save without changes: convert input values (in primary unit) back to base
    const savedCurrentStock = convertQuantityToBase(displayedCurrentStock, item.unit, item);
    const savedMinAlert = convertQuantityToBase(displayedMinAlert, item.unit, item);

    expect(savedCurrentStock).toBe(100); // Exactly unchanged!
    expect(savedMinAlert).toBe(40);      // Exactly unchanged!

    // If unit changed to another unit with no sub-unit, recomputation from stored base stock
    const recomputedWithNewUnit = convertQuantityFromBase(item.currentStock, 'PCS', { unit: 'PCS' });
    expect(recomputedWithNewUnit).toBe(100);
  });

  // 7. Display: item card / POS card show 2.5 BAG (100 KG), not 100 KG
  it('Display: InventoryItemCard shows 2.5 BAG (100 KG) for 100 KG base stock', () => {
    const item = createBagItem({ currentStock: 100 }); // 100 KG base = 2.5 BAG

    act(() => {
      root?.render(
        <InventoryItemCard
          item={item}
          isBuyPriceVisible={false}
          onToggleBuyPrice={() => {}}
          onClick={() => {}}
        />
      );
    });

    const cardText = container?.textContent || '';
    expect(cardText).toContain('2.5 BAG');
    expect(cardText).toContain('(100 KG)');
    expect(cardText).not.toContain('100 KG left');
  });

  it('Display: PosCatalogGridCard and PosCatalogListRow show Stock: 2.5 BAG (100 KG)', () => {
    const item = createBagItem({ currentStock: 100 }); // 100 KG base = 2.5 BAG

    act(() => {
      root?.render(
        <div>
          <PosCatalogGridCard
            item={item}
            inCartQty={0}
            isGstActive={false}
            onAdd={() => {}}
          />
          <PosCatalogListRow
            item={item}
            inCartQty={0}
            isGstActive={false}
            onAdd={() => {}}
          />
        </div>
      );
    });

    const posText = container?.textContent || '';
    expect(posText).toContain('Stock: 2.5 BAG (100 KG)');
  });

  // F1 (CRITICAL): Purchase-modal Sale Price updates on unit change and avoids rewriting catalog price
  it('F1: Purchase mode Sale Price updates on unit change and avoids rewriting catalog price', () => {
    const bagItem = createBagItem({
      id: 'ITM-F1-1',
      name: 'Flour Premium Bag',
      salePrice: 500,
      salePriceMode: 'EXCLUSIVE',
      unit: 'BAG',
      subUnit: 'KG',
      subUnitFactor: 40,
    });

    const saveItemSpy = vi.spyOn(db, 'saveItem').mockReturnValue({} as any);

    // Initial render in purchase mode with bagItem
    act(() => {
      root?.render(
        <InvoiceItemModal
          isOpen={true}
          mode="purchase"
          onClose={vi.fn()}
          onSaveItem={vi.fn()}
          initialItem={{
            itemId: bagItem.id,
            name: bagItem.name,
            hsnSacCode: bagItem.hsnSacCode || '',
            quantity: 1,
            unit: 'BAG',
            unitPrice: 400,
            gstRate: 0,
            discountPercent: 0,
          }}
          itemsCatalog={[bagItem]}
          isIntraState={true}
          isGstActive={false}
        />
      );
    });

    // Initial Sale Price field is 500
    const spInput = container?.querySelector('input[aria-label="Sale Price"]') as HTMLInputElement;
    expect(spInput).toBeDefined();
    expect(spInput.value).toBe('500');

    // Find unit select
    const allSelects = Array.from(container?.querySelectorAll('select') || []);
    const lineUnitSelect = allSelects.find((s) => Array.from(s.options).some((o) => o.value === 'KG'))!;
    expect(lineUnitSelect).toBeDefined();

    // Switch unit to KG
    act(() => {
      lineUnitSelect.value = 'KG';
      lineUnitSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Sale price should now automatically recompute to 500 / 40 = 12.5
    expect(spInput.value).toBe('12.5');
    expect(container?.textContent).toContain('Current:');
    expect(container?.textContent).toContain('12.5');
    expect(container?.textContent).toContain('/ KG');

    // Save WITHOUT editing
    saveItemSpy.mockClear();
    const saveButton = container?.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(saveButton).toBeDefined();

    act(() => {
      saveButton.click();
    });

    // Verify db.saveItem was NOT called (no rewrite)
    expect(saveItemSpy).not.toHaveBeenCalled();

    // Now test entering 12.5 per KG for an item with a different catalog price (e.g. 400)
    const lowerPriceItem = createBagItem({
      id: 'ITM-F1-2',
      name: 'Flour Lower Price',
      salePrice: 400,
      salePriceMode: 'EXCLUSIVE',
      unit: 'BAG',
      subUnit: 'KG',
      subUnitFactor: 40,
    });

    act(() => {
      root?.render(
        <InvoiceItemModal
          isOpen={true}
          mode="purchase"
          onClose={vi.fn()}
          onSaveItem={vi.fn()}
          initialItem={{
            itemId: lowerPriceItem.id,
            name: lowerPriceItem.name,
            hsnSacCode: lowerPriceItem.hsnSacCode || '',
            quantity: 1,
            unit: 'KG',
            unitPrice: 10,
            gstRate: 0,
            discountPercent: 0,
          }}
          itemsCatalog={[lowerPriceItem]}
          isIntraState={true}
          isGstActive={false}
        />
      );
    });

    const spInput2 = container?.querySelector('input[aria-label="Sale Price"]') as HTMLInputElement;
    expect(spInput2.value).toBe('10'); // 400 / 40 = 10

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      nativeSetter.call(spInput2, '12.5');
      spInput2.dispatchEvent(new Event('input', { bubbles: true }));
      spInput2.dispatchEvent(new Event('change', { bubbles: true }));
    });

    saveItemSpy.mockClear();
    const saveButton2 = container?.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(saveButton2).toBeDefined();
    act(() => {
      saveButton2.click();
    });

    expect(saveItemSpy).toHaveBeenCalledTimes(1);
    const savedArg = saveItemSpy.mock.calls[0][0] as InventoryItem;
    expect(savedArg.salePrice).toBe(500); // 12.5 * 40 = 500
  });

  // F2: Unformatted decimals in stock labels (factor 12, DOZEN/PCS, 100 PCS -> 8.3333 DOZEN)
  it('F2: Stock labels format fractional decimals with formatQuantity(val, 4)', () => {
    const dozenItem = createBagItem({
      id: 'ITM-F2-1',
      name: 'Pencil Box Dozen',
      unit: 'DOZEN',
      subUnit: 'PCS',
      subUnitFactor: 12,
      currentStock: 100, // 100 / 12 = 8.333333333333334
    });

    act(() => {
      root?.render(
        <div>
          <PosCatalogGridCard
            item={dozenItem}
            inCartQty={0}
            isGstActive={false}
            onAdd={() => {}}
          />
          <PosCatalogListRow
            item={dozenItem}
            inCartQty={0}
            isGstActive={false}
            onAdd={() => {}}
          />
        </div>
      );
    });

    const posContent = container?.textContent || '';
    expect(posContent).toContain('8.3333 DOZEN (100 PCS)');
    expect(posContent).not.toContain('8.333333333333334');

    // Also verify InvoiceItemModal suggestions stock hint
    act(() => {
      root?.render(
        <InvoiceItemModal
          isOpen={true}
          mode="sale"
          onClose={vi.fn()}
          onSaveItem={vi.fn()}
          itemsCatalog={[dozenItem]}
          isIntraState={true}
          isGstActive={false}
        />
      );
    });

    const nameInput = (container?.querySelector('input[placeholder*="search inventory"]') ||
      container?.querySelector('input[required]')) as HTMLInputElement;
    expect(nameInput).toBeDefined();
    act(() => {
      nameInput.focus();
      nameInput.dispatchEvent(new Event('focus', { bubbles: true }));
    });

    const modalContent = container?.textContent || '';
    expect(modalContent).toContain('8.3333 DOZEN');
    expect(modalContent).not.toContain('8.333333333333334');
  });

  // F3: Stock auditor panel prints base quantities with primary unit (10 BAG not 400 BAG)
  it('F3: InventoryStockAuditorPanel prints primary unit (10 BAG), not base unit (400 BAG)', () => {
    const bagItem = createBagItem({
      id: 'ITM-AUDIT-BAG',
      name: 'Audited Wheat Flour',
      unit: 'BAG',
      subUnit: 'KG',
      subUnitFactor: 40,
      currentStock: 400, // 400 KG recorded = 10 BAG
    });

    const mockPurchase = {
      id: 'PUR-AUDIT-1',
      billNumber: 'PB-AUDIT-1',
      partyName: 'Supplier 1',
      date: '2026-11-20',
      dueDate: '2026-11-20',
      items: [
        {
          id: 'PI-AUDIT-1',
          itemId: bagItem.id,
          name: bagItem.name,
          quantity: 10,
          unit: 'BAG',
          unitPrice: 400,
          hsnSacCode: '11010000',
          taxableAmount: 4000,
          gstRate: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          cessAmount: 0,
          total: 4000,
          totalAmount: 4000,
        },
      ],
      subTotal: 4000,
      taxTotal: 0,
      totalAmount: 4000,
      paidAmount: 4000,
      paymentStatus: 'PAID',
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T10:00:00Z',
    } as unknown as PurchaseBill;

    const mockInvoice = {
      id: 'INV-AUDIT-1',
      invoiceNumber: 'INV-101',
      partyName: 'Customer 1',
      date: '2026-11-21',
      dueDate: '2026-11-21',
      items: [
        {
          id: 'II-AUDIT-1',
          itemId: bagItem.id,
          name: bagItem.name,
          quantity: 10,
          unit: 'BAG',
          unitPrice: 500,
          hsnSacCode: '11010000',
          taxableAmount: 5000,
          gstRate: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          cessAmount: 0,
          total: 5000,
          totalAmount: 5000,
        },
      ],
      subTotal: 5000,
      taxTotal: 0,
      grandTotal: 5000,
      totalPaid: 5000,
      balanceDue: 0,
      paymentStatus: 'PAID',
      createdAt: '2026-11-21T10:00:00Z',
      updatedAt: '2026-11-21T10:00:00Z',
    } as unknown as Invoice;

    vi.spyOn(db, 'getItems').mockReturnValue([bagItem]);
    vi.spyOn(db, 'getPurchases').mockReturnValue([mockPurchase]);
    vi.spyOn(db, 'getInvoices').mockReturnValue([mockInvoice]);
    vi.spyOn(db, 'getStockAdjustments').mockReturnValue([]);
    vi.spyOn(db, 'getAllowNegativeStock').mockReturnValue(false);

    act(() => {
      root?.render(<InventoryStockAuditorPanel />);
    });

    const panelText = container?.textContent || '';
    expect(panelText).toContain('10 BAG');
    expect(panelText).not.toContain('400 BAG');
  });

  // F4: Barcode modal "Set to Stock" uses primary unit count
  it('F4: BarcodeLabelModal Set to Stock sets count in primary units (3 stickers for 2.5 BAG), not 100', () => {
    const bagItem = createBagItem({
      id: 'ITM-BARCODE-1',
      unit: 'BAG',
      subUnit: 'KG',
      subUnitFactor: 40,
      currentStock: 100, // 100 KG = 2.5 BAG -> Math.round(2.5) = 3
    });

    act(() => {
      root?.render(
        <BarcodeLabelModal
          isOpen={true}
          onClose={vi.fn()}
          items={[bagItem]}
          initialSelectedItem={bagItem}
          company={mockCompany}
        />
      );
    });

    const setToStockBtn = Array.from(container?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.includes('Set to Stock')
    );
    expect(setToStockBtn).toBeDefined();
    expect(setToStockBtn?.textContent).toContain('Set to Stock (3)');
    expect(setToStockBtn?.textContent).not.toContain('Set to Stock (100)');

    act(() => {
      setToStockBtn!.click();
    });

    const qtyInput = container?.querySelector('input[type="number"]') as HTMLInputElement;
    expect(qtyInput).toBeDefined();
    expect(qtyInput.value).toBe('3');
  });
});
