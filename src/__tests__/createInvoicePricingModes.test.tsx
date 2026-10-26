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

import { CreateInvoiceModal } from '../components/Invoicing/CreateInvoiceModal.tsx';
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

const compositionCompany: CompanyProfile = {
  ...baseGstCompany,
  id: 'COMP-COMPOSITION',
  isCompositionScheme: true,
};

const mockParty: Party = {
  id: 'PARTY-001',
  name: 'Rahul Sharma',
  type: 'CUSTOMER',
  phone: '9876543210',
  billingAddress: '123 Market St, Pune',
  currentBalance: 0,
  stateCode: '27',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const mockCatalog: InventoryItem[] = [
  {
    id: 'ITEM-1',
    name: 'Wireless Mouse',
    sku: 'WM-01',
    salePrice: 100,
    purchasePrice: 60,
    gstRate: 18,
    hsnSacCode: '8471',
    category: 'Accessories',
    currentStock: 50,
    minStockAlert: 10,
    unit: 'PCS',
    cessRate: 0,
    salePriceMode: 'EXCLUSIVE',
    purchasePriceMode: 'EXCLUSIVE',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

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

const changeSelect = (select: HTMLSelectElement, value: string) => {
  const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  nativeSelectValueSetter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('GST Phase 4A — CreateInvoiceModal Pricing Modes Suite', () => {
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

  it('1. Add a line, select/enter an item, enter exclusive 100 at 18% -> inclusive 118; enter inclusive 236 -> exclusive 200', async () => {
    await act(async () => {
      root.render(
        <CreateInvoiceModal
          company={baseGstCompany}
          parties={[mockParty]}
          itemsCatalog={mockCatalog}
          onClose={() => {}}
          onSave={() => {}}
        />
      );
    });

    // Add a line item
    const addBtn = container.querySelector('button.bg-secondary') as HTMLButtonElement;
    expect(addBtn).not.toBeNull();
    await act(async () => {
      addBtn.click();
    });

    const exclInput = container.querySelector('input[placeholder*="Rate ₹"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Line Rate (Incl. GST)"]') as HTMLInputElement;
    expect(exclInput).not.toBeNull();
    expect(inclInput).not.toBeNull();

    // Enter exclusive 100 at 18%
    await act(async () => {
      changeInput(exclInput, '100');
    });

    expect(exclInput.value).toBe('100');
    expect(inclInput.value).toBe('118');

    // Enter inclusive 236 -> exclusive becomes 200
    await act(async () => {
      changeInput(inclInput, '236');
    });

    expect(inclInput.value).toBe('236');
    expect(exclInput.value).toBe('200');
  });

  it('2. Change GST to 12% while inclusive 118 is authoritative -> exclusive 105.36, inclusive stays 118; enter exclusive 100 -> inclusive 112; change GST to 18% -> inclusive 118, exclusive 100', async () => {
    await act(async () => {
      root.render(
        <CreateInvoiceModal
          company={baseGstCompany}
          parties={[mockParty]}
          itemsCatalog={mockCatalog}
          onClose={() => {}}
          onSave={() => {}}
        />
      );
    });

    // Add a line item
    const addBtn = container.querySelector('button.bg-secondary') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });

    const exclInput = container.querySelector('input[placeholder*="Rate ₹"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Line Rate (Incl. GST)"]') as HTMLInputElement;
    const gstSelect = container.querySelectorAll('select')[2] as HTMLSelectElement; // Party(0), POS(1), PayMode(2 - wait, line select)

    // Find the line GST select
    const lineGstSelect = Array.from(container.querySelectorAll('select')).find(
      (s) => s.options.length > 0 && Array.from(s.options).some((o) => o.text === '18%')
    ) as HTMLSelectElement;
    expect(lineGstSelect).not.toBeNull();

    // Set inclusive 118 while GST is 18%
    await act(async () => {
      changeInput(inclInput, '118');
    });
    expect(inclInput.value).toBe('118');
    expect(exclInput.value).toBe('100');

    // Change GST to 12% while inclusive 118 is authoritative
    await act(async () => {
      changeSelect(lineGstSelect, '12');
    });
    expect(exclInput.value).toBe('105.36');
    expect(inclInput.value).toBe('118');

    // Enter exclusive 100 -> mode switches to EXCLUSIVE, inclusive becomes 112
    await act(async () => {
      changeInput(exclInput, '100');
    });
    expect(exclInput.value).toBe('100');
    expect(inclInput.value).toBe('112');

    // Change GST to 18% -> exclusive stays 100, inclusive becomes 118
    await act(async () => {
      changeSelect(lineGstSelect, '18');
    });
    expect(exclInput.value).toBe('100');
    expect(inclInput.value).toBe('118');
  });

  it('3. Enter inclusive 118 and CESS 12% -> submit; saved item has unitPrice: 100, unitPriceInclusive: 118, priceMode: "INCLUSIVE", cessRate: 12, cessAmount: 12, taxableAmount: 100, totalAmount: 130', async () => {
    let savedInvoice: Invoice | null = null;

    await act(async () => {
      root.render(
        <CreateInvoiceModal
          company={baseGstCompany}
          parties={[mockParty]}
          itemsCatalog={mockCatalog}
          onClose={() => {}}
          onSave={(inv) => {
            savedInvoice = inv;
          }}
        />
      );
    });

    // Add a line item
    const addBtn = container.querySelector('button.bg-secondary') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });

    const nameInput = container.querySelector('input[placeholder*="Item name / description"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Line Rate (Incl. GST)"]') as HTMLInputElement;
    const cessInput = container.querySelector('input[aria-label="Line CESS Rate (%)"]') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;

    expect(nameInput).not.toBeNull();
    expect(inclInput).not.toBeNull();
    expect(cessInput).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      changeInput(nameInput, 'Aerated Energy Drink');
      changeInput(inclInput, '118');
      changeInput(cessInput, '12');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(savedInvoice).not.toBeNull();
    const item = savedInvoice!.items[0];
    expect(item.unitPrice).toBe(100);
    expect(item.unitPriceInclusive).toBe(118);
    expect(item.priceMode).toBe('INCLUSIVE');
    expect(item.cessRate).toBe(12);
    expect(item.cessAmount).toBe(12);
    expect(item.taxableAmount).toBe(100);
    expect(item.totalAmount).toBe(130);
    expect(savedInvoice!.totalCess).toBe(12);
  });

  it('4. Legacy draft row with only unitPrice: 100, gstRate: 18 loads as EXCLUSIVE with inclusive 118', async () => {
    // Pre-populate legacy draft without unitPriceInclusive or priceMode
    testStorage.setItem(
      'gst_draft_new_invoice',
      JSON.stringify({
        rows: [
          {
            itemId: 'LEGACY-01',
            name: 'Legacy Hardware Unit',
            quantity: 1,
            unitPrice: 100,
            gstRate: 18,
          },
        ],
      })
    );

    let savedInvoice: Invoice | null = null;

    await act(async () => {
      root.render(
        <CreateInvoiceModal
          company={baseGstCompany}
          parties={[mockParty]}
          itemsCatalog={mockCatalog}
          onClose={() => {}}
          onSave={(inv) => {
            savedInvoice = inv;
          }}
        />
      );
    });

    const exclInput = container.querySelector('input[placeholder*="Rate ₹"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Line Rate (Incl. GST)"]') as HTMLInputElement;
    expect(exclInput).not.toBeNull();
    expect(inclInput).not.toBeNull();

    expect(exclInput.value).toBe('100');
    expect(inclInput.value).toBe('118');

    // Submit form and verify persisted attributes
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(savedInvoice).not.toBeNull();
    const item = savedInvoice!.items[0];
    expect(item.unitPrice).toBe(100);
    expect(item.unitPriceInclusive).toBe(118);
    expect(item.priceMode).toBe('EXCLUSIVE');
    expect(item.cessRate).toBe(0);
  });

  it('5. GST inactive: only the exclusive rate is shown; saved item has unitPriceInclusive == unitPrice, priceMode: "EXCLUSIVE", cessRate: 0', async () => {
    let savedInvoice: Invoice | null = null;

    await act(async () => {
      root.render(
        <CreateInvoiceModal
          company={baseNonGstCompany}
          parties={[mockParty]}
          itemsCatalog={mockCatalog}
          onClose={() => {}}
          onSave={(inv) => {
            savedInvoice = inv;
          }}
        />
      );
    });

    // Add a line item
    const addBtn = container.querySelector('button.bg-secondary') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });

    const exclInput = container.querySelector('input[placeholder*="Rate ₹"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Line Rate (Incl. GST)"]');
    const cessInput = container.querySelector('input[aria-label="Line CESS Rate (%)"]');

    expect(exclInput).not.toBeNull();
    expect(inclInput).toBeNull();
    expect(cessInput).toBeNull();

    const nameInput = container.querySelector('input[placeholder*="Item name / description"]') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;

    await act(async () => {
      changeInput(nameInput, 'Exempt Book');
      changeInput(exclInput, '250');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(savedInvoice).not.toBeNull();
    const item = savedInvoice!.items[0];
    expect(item.unitPrice).toBe(250);
    expect(item.unitPriceInclusive).toBe(250);
    expect(item.priceMode).toBe('EXCLUSIVE');
    expect(item.cessRate).toBe(0);
    expect(item.gstRate).toBe(0);
  });

  it('6. Existing CreateInvoiceModal flows still pass: Composition Scheme dealer locks GST to 0% and suppresses inclusive/CESS inputs', async () => {
    let savedInvoice: Invoice | null = null;

    await act(async () => {
      root.render(
        <CreateInvoiceModal
          company={compositionCompany}
          parties={[mockParty]}
          itemsCatalog={mockCatalog}
          onClose={() => {}}
          onSave={(inv) => {
            savedInvoice = inv;
          }}
        />
      );
    });

    // Add a line item
    const addBtn = container.querySelector('button.bg-secondary') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });

    const exclInput = container.querySelector('input[placeholder*="Rate ₹"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Line Rate (Incl. GST)"]');
    const cessInput = container.querySelector('input[aria-label="Line CESS Rate (%)"]');

    expect(exclInput).not.toBeNull();
    expect(inclInput).toBeNull();
    expect(cessInput).toBeNull();

    const nameInput = container.querySelector('input[placeholder*="Item name / description"]') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;

    await act(async () => {
      changeInput(nameInput, 'Composition Bakery Product');
      changeInput(exclInput, '500');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(savedInvoice).not.toBeNull();
    expect(savedInvoice!.invoiceType).toBe('B2CS');
    expect(savedInvoice!.totalTax).toBe(0);
    const item = savedInvoice!.items[0];
    expect(item.unitPrice).toBe(500);
    expect(item.unitPriceInclusive).toBe(500);
    expect(item.priceMode).toBe('EXCLUSIVE');
    expect(item.cessRate).toBe(0);
    expect(item.gstRate).toBe(0);
    expect(item.totalAmount).toBe(500);
  });
});
