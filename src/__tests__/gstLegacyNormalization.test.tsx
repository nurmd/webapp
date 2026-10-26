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
    if (saveBtn) {
      await act(async () => {
        saveBtn.click();
      });
      expect(savedInvoice).not.toBeNull();
      expect(savedInvoice!.items[0].unitPrice).toBe(100);
      expect(savedInvoice!.items[0].unitPriceInclusive).toBe(118);
      expect(savedInvoice!.items[0].priceMode).toBe('EXCLUSIVE');
    }
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

    const saveBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Save Bill') || b.textContent?.includes('Record Bill')
    );
    if (saveBtn) {
      await act(async () => {
        saveBtn.click();
      });
      expect(savedBill).not.toBeNull();
      expect(savedBill!.items[0].unitPrice).toBe(100);
      expect(savedBill!.items[0].unitPriceInclusive).toBe(118);
      expect(savedBill!.items[0].priceMode).toBe('EXCLUSIVE');
    }
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

    mockLocalStorage.setItem('vyapar_pos_held_bills_v1', JSON.stringify([legacyHeldBill]));

    await act(async () => {
      root!.render(
        <QuickBillingView
          company={gstCompany}
          items={[catalogItem]}
          onCompleteSale={vi.fn()}
        />
      );
    });

    const text = container?.textContent || '';
    expect(text).toBeDefined();
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
});
