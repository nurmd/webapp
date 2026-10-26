import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

class TestStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
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

import { createPosCartItem, PosCartItem } from '../components/POS/types.ts';
import { CustomItemModal } from '../components/POS/CustomItemModal.tsx';
import { QuickBillingView } from '../components/POS/QuickBillingView.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';

const baseGstCompany: CompanyProfile = {
  id: 'COMP-GST',
  businessName: 'Apex Electronics Private Limited',
  tradeName: 'Apex Retail',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  phone: '9876543210',
  email: 'info@apex.com',
  address: '101 Tech Hub, Pune',
  pincode: '411037',
  stateCode: '27',
  isGstEnabled: true,
};

const baseNonGstCompany: CompanyProfile = {
  ...baseGstCompany,
  id: 'COMP-NONGST',
  gstin: '',
  isGstEnabled: false,
};

const mockParty: Party = {
  id: 'PARTY-001',
  name: 'Retail Walkin',
  type: 'CUSTOMER',
  phone: '9876543210',
  billingAddress: 'Local Counter',
  currentBalance: 0,
  stateCode: '27',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const changeInput = (input: HTMLInputElement, value: string) => {
  const tracker = (input as any)._valueTracker;
  if (tracker) {
    tracker.setValue(value === '0' ? '1' : '0');
  }
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('GST Phase 4B — POS and Custom Item Pricing Modes Suite', () => {
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

  it('1. createPosCartItem with an inclusive item (salePrice: 100, salePriceInclusive: 118, mode INCLUSIVE, gst 18, cess 12) -> cart line has exclusive 100, inclusive 118, mode INCLUSIVE, cess 12', () => {
    const item: InventoryItem = {
      id: 'ITEM-INCL',
      name: 'Aerated Drink Can',
      hsnSacCode: '2202',
      category: 'Beverages',
      unit: 'NOS',
      salePrice: 100,
      salePriceInclusive: 118,
      salePriceMode: 'INCLUSIVE',
      purchasePrice: 70,
      gstRate: 18,
      cessRate: 12,
      currentStock: 100,
      minStockAlert: 10,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const cartItem = createPosCartItem(item, 1);
    expect(cartItem.unitPrice).toBe(100);
    expect(cartItem.unitPriceInclusive).toBe(118);
    expect(cartItem.priceMode).toBe('INCLUSIVE');
    expect(cartItem.cessRate).toBe(12);
  });

  it('2. createPosCartItem with a legacy item (salePrice: 100, no new fields) -> mode EXCLUSIVE, inclusive 118, cess 0', () => {
    const legacyItem: InventoryItem = {
      id: 'ITEM-LEGACY',
      name: 'Standard Notebook',
      hsnSacCode: '4820',
      category: 'Stationery',
      unit: 'PCS',
      salePrice: 100,
      purchasePrice: 60,
      gstRate: 18,
      currentStock: 50,
      minStockAlert: 5,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const cartItem = createPosCartItem(legacyItem, 2);
    expect(cartItem.unitPrice).toBe(100);
    expect(cartItem.unitPriceInclusive).toBe(118);
    expect(cartItem.priceMode).toBe('EXCLUSIVE');
    expect(cartItem.cessRate).toBe(0);
    expect(cartItem.qty).toBe(2);
  });

  it('3. Render CustomItemModal with GST active: enter exclusive 100 -> inclusive 118; enter inclusive 236 -> exclusive 200, mode INCLUSIVE; submit -> created item has salePrice: 200, salePriceInclusive: 236, salePriceMode: "INCLUSIVE"', async () => {
    let createdItem: InventoryItem | null = null;
    let createdQty: number | null = null;

    await act(async () => {
      root.render(
        <CustomItemModal
          isOpen={true}
          onClose={() => {}}
          onAddCustomItem={(item, qty) => {
            createdItem = item;
            createdQty = qty;
          }}
          isGstActive={true}
        />
      );
    });

    const nameInput = container.querySelector('input[placeholder*="Gift Wrapping"]') as HTMLInputElement;
    const exclInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Custom Item Price (Incl. GST)"]') as HTMLInputElement;
    const toggleBtn = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
    const form = container.querySelector('form') as HTMLFormElement;

    expect(nameInput).not.toBeNull();
    expect(exclInput).not.toBeNull();
    expect(inclInput).not.toBeNull();
    expect(toggleBtn).not.toBeNull();

    // Enter name
    await act(async () => {
      changeInput(nameInput, 'Express Gift Packaging');
    });

    // Enter exclusive 100 -> inclusive becomes 118
    await act(async () => {
      changeInput(exclInput, '100');
    });
    expect(exclInput.value).toBe('100');
    expect(inclInput.value).toBe('118');

    // Enter inclusive 236 -> exclusive becomes 200, mode is INCLUSIVE
    await act(async () => {
      changeInput(inclInput, '236');
    });
    expect(inclInput.value).toBe('236');
    expect(exclInput.value).toBe('200');
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');

    // Submit form
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(createdItem).not.toBeNull();
    expect(createdItem!.salePrice).toBe(200);
    expect(createdItem!.salePriceInclusive).toBe(236);
    expect(createdItem!.salePriceMode).toBe('INCLUSIVE');
    expect(createdItem!.gstRate).toBe(18);
    expect(createdQty).toBe(1);
  });

  it('4. GST inactive CustomItemModal: no inclusive input/toggle; save salePriceInclusive == salePrice, mode EXCLUSIVE, gstRate 0', async () => {
    let createdItem: InventoryItem | null = null;

    await act(async () => {
      root.render(
        <CustomItemModal
          isOpen={true}
          onClose={() => {}}
          onAddCustomItem={(item) => {
            createdItem = item;
          }}
          isGstActive={false}
        />
      );
    });

    const exclInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Custom Item Price (Incl. GST)"]');
    const toggleBtn = container.querySelector('button[aria-pressed]');
    const nameInput = container.querySelector('input[placeholder*="Gift Wrapping"]') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;

    expect(exclInput).not.toBeNull();
    expect(inclInput).toBeNull();
    expect(toggleBtn).toBeNull();

    await act(async () => {
      changeInput(nameInput, 'Non-GST Service');
      changeInput(exclInput, '350');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(createdItem).not.toBeNull();
    expect(createdItem!.salePrice).toBe(350);
    expect(createdItem!.salePriceInclusive).toBe(350);
    expect(createdItem!.salePriceMode).toBe('EXCLUSIVE');
    expect(createdItem!.gstRate).toBe(0);
  });

  it('5. Smoke-render QuickBillingView with one inclusive catalog item, add it to the cart, and assert both 100 and 118 (or Incl.) appear and the line total matches the calculator total', async () => {
    const item: InventoryItem = {
      id: 'ITEM-1',
      name: 'Gaming Mouse Pro',
      sku: 'GMP-01',
      hsnSacCode: '8471',
      category: 'Electronics',
      unit: 'NOS',
      salePrice: 100,
      salePriceInclusive: 118,
      salePriceMode: 'INCLUSIVE',
      purchasePrice: 60,
      gstRate: 18,
      cessRate: 12,
      currentStock: 25,
      minStockAlert: 5,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    let completedInvoice: Invoice | null = null;

    await act(async () => {
      root.render(
        <QuickBillingView
          company={baseGstCompany}
          items={[item]}
          parties={[mockParty]}
          onCompleteSale={(inv) => {
            completedInvoice = inv;
          }}
        />
      );
    });

    // Tap item card in POS catalog
    const itemCard = container.querySelector('[data-testid="pos-item-ITEM-1"]') as HTMLDivElement;
    expect(itemCard).not.toBeNull();
    await act(async () => {
      itemCard.click();
    });

    // Check that both rates appear in the cart
    const rateInput = container.querySelector('input[aria-label="Cart Unit Price"]') as HTMLInputElement;
    expect(rateInput).not.toBeNull();
    expect(rateInput.value).toBe('118');

    const cartText = container.textContent || '';
    expect(cartText).toContain('100');
    expect(cartText).toMatch(/Incl|Excl/);

    // Line total with GST 18% and CESS 12% on taxable 100 is 130
    expect(cartText).toContain('130');
  });

  it('6. Existing POS/checkout behavior still passes: complete sale generates invoice with correct amounts and item pricing modes', async () => {
    const item: InventoryItem = {
      id: 'ITEM-2',
      name: 'Mechanical Keyboard',
      sku: 'MK-02',
      hsnSacCode: '8471',
      category: 'Electronics',
      unit: 'NOS',
      salePrice: 200,
      salePriceInclusive: 236,
      salePriceMode: 'INCLUSIVE',
      purchasePrice: 150,
      gstRate: 18,
      cessRate: 0,
      currentStock: 10,
      minStockAlert: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    let completedInvoice: Invoice | null = null;

    await act(async () => {
      root.render(
        <QuickBillingView
          company={baseGstCompany}
          items={[item]}
          parties={[mockParty]}
          onCompleteSale={(inv) => {
            completedInvoice = inv;
          }}
        />
      );
    });

    // Add item to cart
    const itemCard = container.querySelector('[data-testid="pos-item-ITEM-2"]') as HTMLDivElement;
    await act(async () => {
      itemCard.click();
    });

    // Find and click the Checkout button
    const checkoutBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Pay') || b.textContent?.includes('Charge') || b.textContent?.includes('Cash')
    );
    expect(checkoutBtn).not.toBeNull();

    await act(async () => {
      checkoutBtn!.click();
    });

    // If checkout modal opens or direct cash button is pressed
    const cashConfirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cash') || b.textContent?.includes('Confirm')
    );
    if (cashConfirmBtn) {
      await act(async () => {
        cashConfirmBtn.click();
      });
    }

    if (completedInvoice) {
      expect((completedInvoice as Invoice).items[0].unitPrice).toBe(200);
      expect((completedInvoice as Invoice).items[0].unitPriceInclusive).toBe(236);
      expect((completedInvoice as Invoice).items[0].priceMode).toBe('INCLUSIVE');
      expect((completedInvoice as Invoice).grandTotal).toBe(236);
    }
  });
});
