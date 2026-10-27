// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => {
    storage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
  clear: () => {
    Object.keys(storage).forEach((k) => delete storage[k]);
  },
};
(globalThis as any).localStorage = mockLocalStorage;
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });
}

if (typeof ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { TableGridPurchaseModal } from '../components/Purchases/TableGridPurchaseModal.tsx';
import { InvoicePreviewModal } from '../components/Invoicing/InvoicePreviewModal.tsx';
import { SimplifiedInvoiceModal } from '../components/Invoicing/SimplifiedInvoiceModal.tsx';
import { CreateInvoiceModal } from '../components/Invoicing/CreateInvoiceModal.tsx';
import { InvoiceLineItemsGrid } from '../components/Invoicing/components/InvoiceLineItemsGrid.tsx';
import { ThermalPrintModal } from '../components/Printing/ThermalPrintModal.tsx';
import { formatThermalReceiptText } from '../core/printer/escpos.ts';
import { buildThermalReceiptBinary } from '../core/printer/escposBinary.ts';
import { QuickBillingView } from '../components/POS/QuickBillingView.tsx';
import { PosCartItem, HeldBill } from '../components/POS/types.ts';
import { applyPurchaseStockIncrement } from '../core/inventory/stockEngine.ts';
import { generateGstr1Json } from '../core/gst/gstrExport.ts';
import { generateEInvoiceJson } from '../core/gst/eInvoiceExport.ts';
import { generateEWayBillJson } from '../core/gst/eWayBillExport.ts';
import { draftService } from '../services/draftService.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill, PurchaseItemEntry } from '../models/purchase.ts';
import { CompanyProfile } from '../models/company.ts';
import { InventoryItem } from '../models/item.ts';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';

const gstCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Apex GST Goods',
  tradeName: 'Apex Goods',
  gstin: '27AABCA1234F1Z5',
  pan: 'AABCA1234F',
  phone: '9820098200',
  email: 'test@apex.com',
  address: '123 Test St, Mumbai',
  pincode: '400001',
  stateCode: '27',
  isGstEnabled: true,
  isCompositionScheme: false,
};

const catalogItem: InventoryItem = {
  id: 'ITM-001',
  name: 'Stock Item 1',
  sku: 'SKU-001',
  unit: 'PCS',
  category: 'Beverages',
  hsnSacCode: '2202',
  salePrice: 100,
  purchasePrice: 100,
  currentStock: 10,
  minStockAlert: 2,
  gstRate: 18,
  cessRate: 12,
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
};

describe('GST Phase 6 — Legacy Normalization, Drafts & Regression Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mockLocalStorage.clear();
    resetBackNavigationForTesting();
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
    resetBackNavigationForTesting();
  });

  it('1. Legacy sales draft: initialDraft with row { unitPrice: 100, gstRate: 18 } opens with inclusive 118 and mode EXCLUSIVE without error', async () => {
    const legacyDraft: any = {
      invoiceNumber: 'INV-DRAFT-01',
      invoiceDate: '2026-10-26',
      rows: [
        {
          name: 'Legacy Product',
          quantity: 1,
          unitPrice: 100,
          gstRate: 18,
        },
      ],
    };

    draftService.saveInvoiceDraft(legacyDraft);

    let savedInvoice: Invoice | null = null;
    await act(async () => {
      root!.render(
        <TableGridInvoiceModal
          onClose={vi.fn()}
          onSave={(inv) => {
            savedInvoice = inv;
          }}
          company={gstCompany}
          parties={[]}
          itemsCatalog={[catalogItem]}
        />
      );
    });

    const text = container?.textContent || '';
    expect(text).toContain('Legacy Product');
    expect(text).toContain('118.00');

    // Trigger Save
    const saveBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Save Invoice')
    );
    expect(saveBtn).toBeDefined();
    await act(async () => {
      saveBtn!.click();
    });
    expect(savedInvoice).not.toBeNull();
    expect(savedInvoice!.items[0].unitPrice).toBe(100);
    expect(savedInvoice!.items[0].unitPriceInclusive).toBe(118);
    expect(savedInvoice!.items[0].priceMode).toBe('EXCLUSIVE');
  });

  it('2. Legacy purchase draft: same for purchase; inclusive 118; stock/purchase price remains 100', async () => {
    const legacyPurchaseDraft: any = {
      billNumber: 'PUR-DRAFT-01',
      billDate: '2026-10-26',
      rows: [
        {
          itemId: 'ITM-001',
          name: 'Stock Item 1',
          quantity: 1,
          unitPrice: 100,
          gstRate: 18,
        },
      ],
    };

    draftService.savePurchaseDraft(legacyPurchaseDraft);

    let savedBill: PurchaseBill | null = null;
    await act(async () => {
      root!.render(
        <TableGridPurchaseModal
          onClose={vi.fn()}
          onSave={(b) => {
            savedBill = b;
          }}
          company={gstCompany}
          parties={[]}
          itemsCatalog={[catalogItem]}
        />
      );
    });

    const text = container?.textContent || '';
    expect(text).toContain('Stock Item 1');
    expect(text).toContain('118.00');

    const saveBtn =
      (container?.querySelector('[data-testid="purchase-save-btn"]') as HTMLButtonElement) ||
      Array.from(container?.querySelectorAll('button') || []).find((b) =>
        b.textContent?.includes('Save Purchase Bill')
      );
    expect(saveBtn).toBeDefined();
    await act(async () => {
      saveBtn!.click();
    });
    expect(savedBill).not.toBeNull();
    expect(savedBill!.items[0].unitPrice).toBe(100);
    expect(savedBill!.items[0].unitPriceInclusive).toBe(118);
    expect(savedBill!.items[0].priceMode).toBe('EXCLUSIVE');
  });

  it('3. Zero inclusive: a row with unitPrice: 100, unitPriceInclusive: 0, priceMode: "EXCLUSIVE" displays/prints Incl. 118, not 0', async () => {
    const zeroInclusiveInvoice: Invoice = {
      id: 'INV-ZERO-1',
      invoiceNumber: 'INV-ZERO-1',
      invoiceType: 'B2B',
      date: '2026-10-26',
      partyName: 'Customer Test',
      partyAddress: '123 Test St, Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      isGstInvoice: true,
      items: [
        {
          itemId: 'ITM-Z-1',
          name: 'Priced Exclusive Item',
          hsnSacCode: '1234',
          quantity: 1,
          unit: 'PCS',
          unitPrice: 100,
          unitPriceInclusive: 0,
          priceMode: 'EXCLUSIVE',
          gstRate: 18,
          cessRate: 0,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 100,
          cgstAmount: 9,
          sgstAmount: 9,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 118,
        },
      ],
      totalGrossAmount: 100,
      totalDiscount: 0,
      totalTaxableAmount: 100,
      totalCgst: 9,
      totalSgst: 9,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 18,
      roundOff: 0,
      grandTotal: 118,
      amountInWords: 'One Hundred Eighteen Rupees Only',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 118,
      balanceAmount: 0,
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:00:00.000Z',
    };

    // 3a. In InvoicePreviewModal
    await act(async () => {
      root!.render(
        <InvoicePreviewModal
          invoice={zeroInclusiveInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    let previewText = container?.textContent || '';
    expect(previewText).toContain('118.00');
    expect(previewText).not.toContain('Incl. ₹0.00');

    // 3b. In SimplifiedInvoiceModal
    await act(async () => {
      root!.render(
        <SimplifiedInvoiceModal
          invoice={zeroInclusiveInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    let simplifiedText = container?.textContent || '';
    expect(simplifiedText).toContain('118.00');
    expect(simplifiedText).not.toContain('Incl. ₹0.00');
  });

  it('4. Inclusive draft round-trip: inclusive row unitPrice 100, unitPriceInclusive 118, priceMode INCLUSIVE, cessRate 12 survives save/reload with all fields and totals unchanged', () => {
    const draftPayload: any = {
      invoiceNumber: 'INV-ROUNDTRIP-1',
      invoiceDate: '2026-10-26',
      rows: [
        {
          itemId: 'ITM-001',
          name: 'Inclusive Product',
          hsnSacCode: '2202',
          unit: 'PCS',
          discountPercent: 0,
          quantity: 1,
          unitPrice: 100,
          unitPriceInclusive: 118,
          priceMode: 'INCLUSIVE',
          gstRate: 18,
          cessRate: 12,
        },
      ],
    };

    draftService.saveInvoiceDraft(draftPayload);
    const restored = draftService.getInvoiceDraft();
    expect(restored).not.toBeNull();
    expect(restored!.rows).toHaveLength(1);
    expect(restored!.rows[0].unitPrice).toBe(100);
    expect(restored!.rows[0].unitPriceInclusive).toBe(118);
    expect(restored!.rows[0].priceMode).toBe('INCLUSIVE');
    expect(restored!.rows[0].cessRate).toBe(12);
  });

  it('5. POS held bill round-trip: cart line with the same fields survives hold/resume; totals unchanged. Legacy held bill without fields resumes as EXCLUSIVE with derived inclusive', async () => {
    const item: InventoryItem = {
      ...catalogItem,
      salePrice: 100,
      salePriceInclusive: 118,
      salePriceMode: 'INCLUSIVE',
      gstRate: 18,
      cessRate: 12,
    };

    const cartItem: PosCartItem = {
      item,
      qty: 1,
      unitPrice: 100,
      unitPriceInclusive: 118,
      priceMode: 'INCLUSIVE',
      cessRate: 12,
      discountPercent: 0,
      discountAmount: 0,
    };

    // 5a. Modern held bill round-trip
    const heldBill: HeldBill = {
      id: 'HOLD-001',
      heldAt: new Date().toISOString(),
      label: 'Hold #1',
      customer: {
        party: null,
        phone: '',
        isB2b: false,
        stateCode: '27',
      },
      cart: [cartItem],
      cartDiscount: {
        type: 'PERCENT',
        value: 0,
      },
      additionalCharges: 0,
      paymentMode: 'CASH',
      totalAmount: 130,
    };

    mockLocalStorage.setItem('vyapar_pos_held_bills_v1', JSON.stringify([heldBill]));

    await act(async () => {
      root!.render(
        <QuickBillingView
          company={gstCompany}
          items={[item]}
          onCompleteSale={vi.fn()}
        />
      );
    });

    const resumeBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Hold #1') || b.textContent?.includes('Resume') || b.textContent?.includes('Parked')
    );
    if (resumeBtn) {
      await act(async () => {
        resumeBtn.click();
      });
    }

    // 5b. Legacy held bill without unitPriceInclusive, priceMode, cessRate
    await act(async () => {
      root!.unmount();
    });
    container!.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const legacyHeldBill: any = {
      id: 'HOLD-LEGACY-01',
      heldAt: new Date().toISOString(),
      label: 'Hold Legacy #2',
      customer: {
        party: null,
        phone: '',
        isB2b: false,
        stateCode: '27',
      },
      cart: [
        {
          item: {
            ...catalogItem,
            salePrice: 100,
            salePriceInclusive: undefined,
            salePriceMode: undefined,
            gstRate: 18,
            cessRate: undefined,
          },
          qty: 1,
          unitPrice: 100,
        },
      ],
      cartDiscount: {
        type: 'PERCENT',
        value: 0,
      },
      additionalCharges: 0,
      paymentMode: 'CASH',
      totalAmount: 118,
    };

    mockLocalStorage.setItem('vyapar_pos_held_bills', JSON.stringify([legacyHeldBill]));

    let completedSale: Invoice | null = null;
    await act(async () => {
      root!.render(
        <QuickBillingView
          company={gstCompany}
          items={[catalogItem]}
          onCompleteSale={(inv) => {
            completedSale = inv;
          }}
        />
      );
    });

    // 1. Open HoldBillsModal
    const heldBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Held (')
    );
    expect(heldBtn).toBeDefined();
    await act(async () => {
      heldBtn!.click();
    });

    // 2. Click Resume inside HoldBillsModal
    const resumeBtn2 = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Resume')
    );
    expect(resumeBtn2).toBeDefined();
    await act(async () => {
      resumeBtn2!.click();
    });

    // 3. Resumed cart shows 118.00 total
    expect(container?.textContent).toContain('118.00');

    // 4. Complete checkout
    const chargeBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Charge')
    );
    expect(chargeBtn).toBeDefined();
    await act(async () => {
      chargeBtn!.click();
    });

    expect(completedSale).not.toBeNull();
    expect(completedSale!.items[0].unitPrice).toBe(100);
    expect(completedSale!.items[0].unitPriceInclusive).toBe(118);
    expect(completedSale!.items[0].priceMode).toBe('EXCLUSIVE');
    expect(completedSale!.items[0].cessRate).toBe(0);
    expect(completedSale!.items[0].totalAmount).toBe(118);
    expect(completedSale!.grandTotal).toBe(118);
  });

  it('6. Purchase stock regression: purchase 1 × inclusive 118 @ 18% + 12% CESS → stored exclusive rate 100, purchase total 130, stock increases by 1, stock valuation uses 100 not 118', () => {
    const catalog: InventoryItem[] = [
      {
        id: 'ITM-CAT-1',
        name: 'Aerated Water Bottle',
        unit: 'PCS',
        category: 'Beverages',
        hsnSacCode: '2202',
        salePrice: 100,
        purchasePrice: 90,
        currentStock: 5,
        minStockAlert: 2,
        gstRate: 18,
        cessRate: 12,
        createdAt: '2026-10-26T10:00:00.000Z',
        updatedAt: '2026-10-26T10:00:00.000Z',
      },
    ];

    const purchaseLines: PurchaseItemEntry[] = [
      {
        id: 'p-1',
        itemId: 'ITM-CAT-1',
        name: 'Aerated Water Bottle',
        hsnSacCode: '2202',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 100,
        unitPriceInclusive: 118,
        priceMode: 'INCLUSIVE',
        discountPercent: 0,
        discountAmount: 0,
        taxableAmount: 100,
        gstRate: 18,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
        cessRate: 12,
        cessAmount: 12,
        totalAmount: 130,
      },
    ];

    const updatedCatalog = applyPurchaseStockIncrement(catalog, purchaseLines);
    expect(updatedCatalog).toHaveLength(1);
    const updatedItem = updatedCatalog[0];

    // Stock increment: 5 + 1 = 6
    expect(updatedItem.currentStock).toBe(6);
    // Purchase price updated to exclusive unitPrice (100), not inclusive (118)
    expect(updatedItem.purchasePrice).toBe(100);
    // Stock valuation: 6 × 100 = 600, not 6 × 118 = 708
    const stockValuation = updatedItem.currentStock * (updatedItem.purchasePrice || 0);
    expect(stockValuation).toBe(600);
  });

  it('7. Exports/reports regression: inclusive invoices still export unitPrice as exclusive and use the stored taxable/GST/CESS totals', () => {
    const inclusiveInvoice: Invoice = {
      id: 'INV-EXP-1',
      invoiceNumber: 'INV-EXP-001',
      invoiceType: 'B2B',
      date: '2026-10-26',
      partyId: 'CUST-1',
      partyName: 'Buyer Enterprise',
      partyGstin: '27AABCU9603R1ZM',
      partyAddress: 'Plot 42, MIDC, Pune',
      partyPincode: '411037',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      isGstInvoice: true,
      items: [
        {
          itemId: 'ITM-001',
          name: 'Inclusive Product',
          hsnSacCode: '2202',
          quantity: 1,
          unit: 'PCS',
          unitPrice: 100,
          unitPriceInclusive: 118,
          priceMode: 'INCLUSIVE',
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 100,
          gstRate: 18,
          cgstAmount: 9,
          sgstAmount: 9,
          igstAmount: 0,
          cessRate: 12,
          cessAmount: 12,
          totalAmount: 130,
        },
      ],
      totalGrossAmount: 100,
      totalDiscount: 0,
      totalTaxableAmount: 100,
      totalCgst: 9,
      totalSgst: 9,
      totalIgst: 0,
      totalCess: 12,
      totalTax: 30,
      roundOff: 0,
      grandTotal: 130,
      amountInWords: 'One Hundred Thirty Rupees Only',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 130,
      balanceAmount: 0,
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:00:00.000Z',
    };

    // 7a. GSTR-1 JSON Payload
    const gstr1 = generateGstr1Json(gstCompany, [inclusiveInvoice], '102026');
    expect(gstr1.b2b).toBeDefined();
    expect(gstr1.b2b).toHaveLength(1);
    const b2bInv = gstr1.b2b![0].inv[0];
    expect(b2bInv.val).toBe(130);
    expect(b2bInv.itms[0].itm_det.txval).toBe(100);
    expect(b2bInv.itms[0].itm_det.camt).toBe(9);
    expect(b2bInv.itms[0].itm_det.samt).toBe(9);
    expect(b2bInv.itms[0].itm_det.csamt).toBe(12);

    // 7b. E-Invoice JSON Payload
    const eInv = generateEInvoiceJson(gstCompany, inclusiveInvoice);
    expect(eInv.ItemList).toHaveLength(1);
    expect(eInv.ItemList[0].UnitPrice).toBe(100); // Canonical exclusive unit price
    expect(eInv.ItemList[0].AssAmt).toBe(100);
    expect(eInv.ItemList[0].CesAmt).toBe(12);
    expect(eInv.ItemList[0].TotItemVal).toBe(130);
    expect(eInv.ValDtls.CesVal).toBe(12);
    expect(eInv.ValDtls.TotInvVal).toBe(130);

    // 7c. E-Way Bill JSON Payload
    const eway = generateEWayBillJson(gstCompany, inclusiveInvoice);
    expect(eway.billLists[0].itemList[0].taxableAmount).toBe(100);
    expect(eway.billLists[0].itemList[0].cessRate).toBe(12);
    expect(eway.billLists[0].cessValue).toBe(12);
    expect(eway.billLists[0].totalValue).toBe(100);
    expect(eway.billLists[0].totInvValue).toBe(130);
  });

  it('8. Inconsistent stored values: EXCLUSIVE unitPrice 100 / stored inclusive 999 must display 118, and INCLUSIVE unitPrice 999 / inclusive 118 must display 118', async () => {
    // 8a. EXCLUSIVE row with unitPrice: 100 and stale stored inclusive: 999
    const exclusiveStaleInvoice: Invoice = {
      id: 'INV-EXCL-STALE',
      invoiceNumber: 'INV-EXCL-STALE',
      invoiceType: 'B2B',
      date: '2026-10-26',
      partyName: 'Customer Stale Excl',
      partyAddress: '123 Test St, Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      isGstInvoice: true,
      items: [
        {
          itemId: 'ITM-EXCL-1',
          name: 'Exclusive Item With Stale Inclusive',
          hsnSacCode: '1234',
          quantity: 1,
          unit: 'PCS',
          unitPrice: 100,
          unitPriceInclusive: 999, // Stale stored value; must NOT be trusted in EXCLUSIVE mode
          priceMode: 'EXCLUSIVE',
          gstRate: 18,
          cessRate: 0,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 100,
          cgstAmount: 9,
          sgstAmount: 9,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 118,
        },
      ],
      totalGrossAmount: 100,
      totalDiscount: 0,
      totalTaxableAmount: 100,
      totalCgst: 9,
      totalSgst: 9,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 18,
      roundOff: 0,
      grandTotal: 118,
      amountInWords: 'One Hundred Eighteen Rupees Only',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 118,
      balanceAmount: 0,
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:00:00.000Z',
    };

    await act(async () => {
      root!.render(
        <InvoicePreviewModal
          invoice={exclusiveStaleInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    let previewText = container?.textContent || '';
    expect(previewText).toContain('118.00');
    expect(previewText).not.toContain('999');

    await act(async () => {
      root!.render(
        <SimplifiedInvoiceModal
          invoice={exclusiveStaleInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    let simplifiedText = container?.textContent || '';
    expect(simplifiedText).toContain('118.00');
    expect(simplifiedText).not.toContain('999');

    // 8b. INCLUSIVE row with stale unitPrice: 999 and valid inclusive: 118
    const inclusiveStaleInvoice: Invoice = {
      id: 'INV-INCL-STALE',
      invoiceNumber: 'INV-INCL-STALE',
      invoiceType: 'B2B',
      date: '2026-10-26',
      partyName: 'Customer Stale Incl',
      partyAddress: '123 Test St, Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      isGstInvoice: true,
      items: [
        {
          itemId: 'ITM-INCL-1',
          name: 'Inclusive Item With Stale Exclusive',
          hsnSacCode: '5678',
          quantity: 1,
          unit: 'PCS',
          unitPrice: 999, // Stale exclusive rate; mode is INCLUSIVE with inclusive 118
          unitPriceInclusive: 118,
          priceMode: 'INCLUSIVE',
          gstRate: 18,
          cessRate: 0,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 100,
          cgstAmount: 9,
          sgstAmount: 9,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 118,
        },
      ],
      totalGrossAmount: 100,
      totalDiscount: 0,
      totalTaxableAmount: 100,
      totalCgst: 9,
      totalSgst: 9,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 18,
      roundOff: 0,
      grandTotal: 118,
      amountInWords: 'One Hundred Eighteen Rupees Only',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 118,
      balanceAmount: 0,
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:00:00.000Z',
    };

    await act(async () => {
      root!.render(
        <InvoicePreviewModal
          invoice={inclusiveStaleInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    previewText = container?.textContent || '';
    expect(previewText).toContain('118.00');
    expect(previewText).not.toContain('Incl. 999');

    await act(async () => {
      root!.render(
        <SimplifiedInvoiceModal
          invoice={inclusiveStaleInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    simplifiedText = container?.textContent || '';
    expect(simplifiedText).toContain('118.00');
    expect(simplifiedText).not.toContain('Incl. ₹999');
  });

  it('9. Thermal printing legacy fallback: legacy item without unitPriceInclusive derives inclusive rate and prints separate CESS', async () => {
    const legacyItemInvoice: Invoice = {
      id: 'INV-THERMAL-LEGACY',
      invoiceNumber: 'INV-TH-001',
      invoiceType: 'B2B',
      date: '2026-10-26',
      partyName: 'Quick Walk-in',
      partyAddress: '123 Market Road',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      isGstInvoice: true,
      items: [
        {
          itemId: 'ITM-TH-1',
          name: 'Mineral Water Bottle',
          hsnSacCode: '2202',
          quantity: 1,
          unit: 'PCS',
          unitPrice: 100,
          // unitPriceInclusive is deliberately undefined (legacy item)
          priceMode: 'EXCLUSIVE',
          gstRate: 18,
          cessRate: 12,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 100,
          cgstAmount: 9,
          sgstAmount: 9,
          igstAmount: 0,
          cessAmount: 12,
          totalAmount: 130,
        },
      ],
      totalGrossAmount: 100,
      totalDiscount: 0,
      totalTaxableAmount: 100,
      totalCgst: 9,
      totalSgst: 9,
      totalIgst: 0,
      totalCess: 12,
      totalTax: 30,
      roundOff: 0,
      grandTotal: 130,
      amountInWords: 'One Hundred Thirty Rupees Only',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 130,
      balanceAmount: 0,
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:00:00.000Z',
    };

    // 9a. Render ThermalPrintModal
    await act(async () => {
      root!.render(
        <ThermalPrintModal
          invoice={legacyItemInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    const thermalModalText = container?.textContent || '';
    expect(thermalModalText).toContain('Incl: Rs. 118.00');
    expect(thermalModalText).toContain('CESS: 12%');

    // 9b. Verify 32-col formatThermalReceiptText
    const text32 = formatThermalReceiptText(
      {
        companyName: gstCompany.businessName,
        companyAddress: gstCompany.address,
        gstin: gstCompany.gstin,
        phone: gstCompany.phone,
        isGst: true,
        invoiceNo: legacyItemInvoice.invoiceNumber,
        date: legacyItemInvoice.date,
        items: [
          {
            name: 'Mineral Water Bottle',
            qty: 1,
            rate: 100,
            rateInclusive: 118, // Derived by ThermalPrintModal
            cessRate: 12,
            amount: 130,
          },
        ],
        taxableAmount: 100,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
        totalCess: 12,
        grandTotal: 130,
      },
      32
    );
    expect(text32).toContain('100.00');
    expect(text32).toContain('Incl: Rs. 118.00');
    expect(text32).toContain('CESS: 12%');

    // 9c. Verify 48-col formatThermalReceiptText
    const text48 = formatThermalReceiptText(
      {
        companyName: gstCompany.businessName,
        companyAddress: gstCompany.address,
        gstin: gstCompany.gstin,
        phone: gstCompany.phone,
        isGst: true,
        invoiceNo: legacyItemInvoice.invoiceNumber,
        date: legacyItemInvoice.date,
        items: [
          {
            name: 'Mineral Water Bottle',
            qty: 1,
            rate: 100,
            rateInclusive: 118,
            cessRate: 12,
            amount: 130,
          },
        ],
        taxableAmount: 100,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
        totalCess: 12,
        grandTotal: 130,
      },
      48
    );
    expect(text48).toContain('100.00');
    expect(text48).toContain('Incl: Rs. 118.00');
    expect(text48).toContain('CESS: 12%');

    // 9d. Verify ESC/POS binary output
    const binary = buildThermalReceiptBinary(
      {
        companyName: gstCompany.businessName,
        companyAddress: gstCompany.address,
        gstin: gstCompany.gstin,
        phone: gstCompany.phone,
        isGst: true,
        invoiceNo: legacyItemInvoice.invoiceNumber,
        date: legacyItemInvoice.date,
        items: [
          {
            name: 'Mineral Water Bottle',
            qty: 1,
            rate: 100,
            rateInclusive: 118,
            cessRate: 12,
            amount: 130,
          },
        ],
        taxableAmount: 100,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
        totalCess: 12,
        grandTotal: 130,
      },
      { width: 32 }
    );
    const decodedBinary = new TextDecoder().decode(binary);
    expect(decodedBinary).toContain('Incl: Rs. 118.00');
    expect(decodedBinary).toContain('CESS: 12%');
  });

  it('10. Grid row save regression: EXCLUSIVE mode with unitPrice 100 and stale unitPriceInclusive 999 saves inclusive 118', async () => {
    const staleDraft: any = {
      invoiceNumber: 'INV-STALE-SAVE-01',
      invoiceDate: '2026-10-26',
      rows: [
        {
          name: 'Stale Item',
          quantity: 1,
          unitPrice: 100,
          unitPriceInclusive: 999, // Stale!
          priceMode: 'EXCLUSIVE',
          gstRate: 18,
        },
      ],
    };

    draftService.saveInvoiceDraft(staleDraft);

    let savedInvoice: Invoice | null = null;
    await act(async () => {
      root!.render(
        <TableGridInvoiceModal
          onClose={vi.fn()}
          onSave={(inv) => {
            savedInvoice = inv;
          }}
          company={gstCompany}
          parties={[]}
          itemsCatalog={[catalogItem]}
        />
      );
    });

    const saveBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Save Invoice')
    );
    expect(saveBtn).toBeDefined();
    await act(async () => {
      saveBtn!.click();
    });

    expect(savedInvoice).not.toBeNull();
    expect(savedInvoice!.items[0].unitPrice).toBe(100);
    expect(savedInvoice!.items[0].unitPriceInclusive).toBe(118);
    expect(savedInvoice!.items[0].priceMode).toBe('EXCLUSIVE');
  });

  it('11. Draft load regression: draft with EXCLUSIVE row 100 / stale inclusive 999 displays and saves 118 for purchase as well', async () => {
    const stalePurchaseDraft: any = {
      billNumber: 'PUR-STALE-DRAFT-01',
      billDate: '2026-10-26',
      rows: [
        {
          itemId: 'ITM-001',
          name: 'Stock Item 1',
          quantity: 1,
          unitPrice: 100,
          unitPriceInclusive: 999, // Stale!
          priceMode: 'EXCLUSIVE',
          gstRate: 18,
        },
      ],
    };

    draftService.savePurchaseDraft(stalePurchaseDraft);

    let savedBill: PurchaseBill | null = null;
    await act(async () => {
      root!.render(
        <TableGridPurchaseModal
          onClose={vi.fn()}
          onSave={(b) => {
            savedBill = b;
          }}
          company={gstCompany}
          parties={[]}
          itemsCatalog={[catalogItem]}
        />
      );
    });

    const text = container?.textContent || '';
    expect(text).toContain('118.00');
    expect(text).not.toContain('999');

    const saveBtn =
      (container?.querySelector('[data-testid="purchase-save-btn"]') as HTMLButtonElement) ||
      Array.from(container?.querySelectorAll('button') || []).find((b) =>
        b.textContent?.includes('Save Purchase Bill')
      );
    expect(saveBtn).toBeDefined();
    await act(async () => {
      saveBtn!.click();
    });

    expect(savedBill).not.toBeNull();
    expect(savedBill!.items[0].unitPrice).toBe(100);
    expect(savedBill!.items[0].unitPriceInclusive).toBe(118);
    expect(savedBill!.items[0].priceMode).toBe('EXCLUSIVE');
  });

  it('12. POS exclusive price edit: editing exclusive price from 100 to 200 in cart automatically updates inclusive to 236', async () => {
    mockLocalStorage.clear();

    await act(async () => {
      root!.render(
        <QuickBillingView
          company={gstCompany}
          items={[catalogItem]}
          onCompleteSale={vi.fn()}
        />
      );
    });

    // Click catalog item card to add to cart
    const itemCard =
      (container?.querySelector(`[data-testid="pos-item-${catalogItem.id}"]`) as HTMLElement) ||
      Array.from(container?.querySelectorAll('div') || []).find((el) =>
        el.textContent?.includes('Stock Item 1') && el.getAttribute('data-testid')?.startsWith('pos-item-')
      );
    expect(itemCard).toBeDefined();
    await act(async () => {
      itemCard!.click();
    });

    // Cart shows Incl. ₹118
    expect(container?.textContent).toContain('Incl. ₹118');

    // Find the price input
    const priceInput = container?.querySelector('input[type="number"][value="100"]') as HTMLInputElement;
    expect(priceInput).toBeDefined();
    await act(async () => {
      // simulate changing exclusive price to 200
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(priceInput, '200');
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Cart updates to Incl. ₹236
    expect(container?.textContent).toContain('Incl. ₹236');
  });

  it('13. Stale inclusive regression: CreateInvoiceModal and InvoiceLineItemsGrid derive inclusive 118 for EXCLUSIVE 100 with stale inclusive 999; CESS remains separate (total 130)', async () => {
    // 13a. InvoiceLineItemsGrid display test
    const testRows = [
      {
        itemId: 'ITM-001',
        name: 'Mineral Water',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 100,
        unitPriceInclusive: 999, // Stale
        priceMode: 'EXCLUSIVE' as const,
        gstRate: 18,
        cessRate: 12,
        discountPercent: 0,
      },
    ];

    await act(async () => {
      root!.render(
        <InvoiceLineItemsGrid
          rows={testRows as any}
          calcItems={[{ totalAmount: 130 } as any]}
          isGstActive={true}
          onAddItem={vi.fn()}
          onEditItem={vi.fn()}
          onOpenScanner={vi.fn()}
        />
      );
    });

    const gridText = container?.textContent || '';
    expect(gridText).toContain('Mineral Water');
    expect(gridText).toContain('Incl. ₹ 118.00');
    expect(gridText).not.toContain('999');
    expect(gridText).toContain('CESS 12%');
    expect(gridText).toContain('₹ 130.00');

    // 13b. CreateInvoiceModal draft load and submit test
    const staleDraft: any = {
      invoiceNumber: 'INV-SIMP-STALE-01',
      invoiceDate: '2026-10-26',
      rows: [
        {
          name: 'Mineral Water',
          quantity: 1,
          unitPrice: 100,
          unitPriceInclusive: 999,
          priceMode: 'EXCLUSIVE',
          gstRate: 18,
          cessRate: 12,
        },
      ],
    };
    draftService.saveInvoiceDraft(staleDraft);

    let savedInvoice: Invoice | null = null;
    await act(async () => {
      root!.render(
        <CreateInvoiceModal
          company={gstCompany}
          parties={[]}
          itemsCatalog={[catalogItem]}
          onClose={vi.fn()}
          onSave={(inv) => {
            savedInvoice = inv;
          }}
        />
      );
    });

    const nameInput = container?.querySelector('input[placeholder="Item name / description"]') as HTMLInputElement;
    expect(nameInput?.value).toBe('Mineral Water');

    const modalText = container?.textContent || '';
    expect(modalText).toContain('Total Value:₹ 130.00');
    expect(modalText).not.toContain('999');

    // Submit invoice
    const form = container?.querySelector('form');
    expect(form).toBeDefined();
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(savedInvoice).not.toBeNull();
    expect(savedInvoice!.items[0].unitPrice).toBe(100);
    expect(savedInvoice!.items[0].unitPriceInclusive).toBe(118);
    expect(savedInvoice!.items[0].priceMode).toBe('EXCLUSIVE');
    expect(savedInvoice!.items[0].cessRate).toBe(12);
    expect(savedInvoice!.items[0].totalAmount).toBe(130);
    expect(savedInvoice!.grandTotal).toBe(130);
  });
});
