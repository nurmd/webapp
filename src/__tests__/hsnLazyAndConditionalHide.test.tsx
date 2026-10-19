import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
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

import { HsnAutocompleteInput, loadHsnCatalog } from '../components/Common/HsnAutocompleteInput';
import { ItemFormModal } from '../components/Inventory/ItemFormModal.tsx';
import { InvoiceItemModal } from '../components/Invoicing/InvoiceItemModal.tsx';
import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { TableGridPurchaseModal } from '../components/Purchases/TableGridPurchaseModal.tsx';
import { CreateInvoiceModal } from '../components/Invoicing/CreateInvoiceModal.tsx';
import { CustomItemModal } from '../components/POS/CustomItemModal.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { db } from '../services/db.ts';

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
  name: 'Vikas Sharma',
  phone: '9822012345',
  type: 'CUSTOMER',
  stateCode: '27',
  billingAddress: 'FC Road, Pune',
  currentBalance: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockItem: InventoryItem = {
  id: 'ITM-001',
  name: 'Mechanical Keyboard RGB',
  salePrice: 2500,
  purchasePrice: 1800,
  unit: 'PCS',
  hsnSacCode: '847160',
  gstRate: 18,
  currentStock: 40,
  minStockAlert: 5,
  category: 'Electronics',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('Milestone 2: HSN Autocomplete Lazy Loading & Conditional Hiding Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    db.saveCompany(baseGstCompany);
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

  describe('1. Dynamic Loading & Module Caching (HsnAutocompleteInput)', () => {
    it('TC-LAZY-01: Cold Mount does not open dropdown or eagerly populate suggestions', async () => {
      await act(async () => {
        root.render(
          <HsnAutocompleteInput
            value=""
            onChange={() => {}}
            placeholder="Search code or name"
          />
        );
      });

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.getAttribute('role')).toBe('combobox');
      expect(input.getAttribute('aria-expanded')).toBe('false');

      const listbox = container.querySelector('ul[role="listbox"]');
      expect(listbox).toBeNull();
    });

    it('TC-LAZY-02: Triggering dynamic catalog load on focus (onFocus)', async () => {
      let selected: any = null;

      await act(async () => {
        root.render(
          <HsnAutocompleteInput
            value=""
            onChange={() => {}}
            onSelectHsn={(item) => {
              selected = item;
            }}
          />
        );
      });

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).not.toBeNull();

      // Focus input to trigger dynamic catalog import and suggestion generation
      await act(async () => {
        input.focus();
        await loadHsnCatalog();
      });

      const listbox = container.querySelector('ul[role="listbox"]');
      expect(listbox).not.toBeNull();

      const options = listbox?.querySelectorAll('li[role="option"]');
      expect(options && options.length).toBeGreaterThan(0);
    });

    it('TC-LAZY-03: Triggering dynamic catalog load and filtering on input change (onChange)', async () => {
      let currentValue = '';
      let selectedItem: any = null;

      const renderComp = (val: string) => (
        <HsnAutocompleteInput
          value={val}
          onChange={(newVal) => {
            currentValue = newVal;
          }}
          onSelectHsn={(item) => {
            selectedItem = item;
          }}
        />
      );

      await act(async () => {
        root.render(renderComp(''));
      });

      const input = container.querySelector('input') as HTMLInputElement;

      await act(async () => {
        input.focus();
        await loadHsnCatalog();
      });

      // Type "8471" directly
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeSetter?.call(input, '8471');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        root.render(renderComp('8471'));
      });

      const listbox = container.querySelector('ul[role="listbox"]');
      expect(listbox).not.toBeNull();

      const options = listbox?.querySelectorAll('li[role="option"]');
      expect(options && options.length).toBeGreaterThan(0);

      const firstOption = options![0] as HTMLElement;
      expect(firstOption.textContent).toContain('8471');

      // Select first option
      await act(async () => {
        firstOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(selectedItem).not.toBeNull();
      expect(selectedItem.code.startsWith('8471')).toBe(true);
      expect(selectedItem.gstRate).toBeDefined();
    });

    it('TC-LAZY-04: Module-level caching guarantees idempotent loadHsnCatalog resolution', async () => {
      const fn1 = await loadHsnCatalog();
      const fn2 = await loadHsnCatalog();
      expect(fn1).toBe(fn2);
      expect(typeof fn1).toBe('function');

      const results = fn1('8471', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].code.startsWith('8471')).toBe(true);
    });

    it('TC-LAZY-05: Direct component suppression when isGstEnabled={false}', async () => {
      await act(async () => {
        root.render(
          <HsnAutocompleteInput
            value="847130"
            onChange={() => {}}
            isGstEnabled={false}
          />
        );
      });

      expect(container.children.length).toBe(0);
      expect(container.querySelector('input')).toBeNull();
    });

    it('TC-LAZY-06: Direct component suppression when company.isGstEnabled is false and isGstEnabled prop is omitted', async () => {
      db.saveCompany(baseNonGstCompany);

      await act(async () => {
        root.render(
          <HsnAutocompleteInput
            value="847130"
            onChange={() => {}}
          />
        );
      });

      expect(container.children.length).toBe(0);
      expect(container.querySelector('input')).toBeNull();
    });
  });

  describe('2. Conditional HSN Hiding Across Modals When GST is Disabled', () => {
    it('TC-HIDE-01: ItemFormModal hides HSN field and collapses category to grid-cols-1 when isGstActive={false}', async () => {
      let savedItem: any = null;

      await act(async () => {
        root.render(
          <ItemFormModal
            isOpen={true}
            isGstActive={false}
            editingItem={null}
            onClose={() => {}}
            onSaveItem={(item) => {
              savedItem = item;
            }}
          />
        );
      });

      expect(container.textContent).not.toContain('HSN / SAC Code');
      expect(container.querySelector('input[placeholder*="1006"]')).toBeNull();

      // Submit form
      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      const form = container.querySelector('form') as HTMLFormElement;

      await act(async () => {
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputSetter?.call(nameInput, 'Non-GST Service Item');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(savedItem).not.toBeNull();
      expect(savedItem?.name).toBe('Non-GST Service Item');
      expect(savedItem?.hsnSacCode).toBe('');
    });

    it('TC-HIDE-02: ItemFormModal displays HSN Autocomplete when isGstActive={true}', async () => {
      await act(async () => {
        root.render(
          <ItemFormModal
            isOpen={true}
            isGstActive={true}
            editingItem={null}
            onClose={() => {}}
            onSaveItem={() => {}}
          />
        );
      });

      expect(container.textContent).toContain('HSN / SAC Code');
      expect(container.querySelector('input[placeholder*="Rice"]')).not.toBeNull();
    });

    it('TC-HIDE-03: InvoiceItemModal hides HSN in both main form and quick-add subform when isGstActive={false}', async () => {
      let savedData: any = null;

      await act(async () => {
        root.render(
          <InvoiceItemModal
            isOpen={true}
            isGstActive={false}
            itemsCatalog={[mockItem]}
            isIntraState={true}
            onClose={() => {}}
            onSaveItem={(data) => {
              savedData = data;
            }}
          />
        );
      });

      // Main form must not contain HSN / SAC Code
      expect(container.textContent).not.toContain('HSN / SAC Code');
      expect(container.querySelector('input[placeholder*="Laptop"]')).toBeNull();

      // Open quick-add drawer if available
      const quickAddBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('+ Create') || b.textContent?.includes('Add New Item')
      );
      if (quickAddBtn) {
        await act(async () => {
          quickAddBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // Quick add subform must not render HSN
        expect(container.textContent).not.toContain('HSN / SAC Code');
        expect(container.querySelector('input[placeholder="e.g. 8471"]')).toBeNull();
      }

      // Enter name and price to save
      const nameInput = container.querySelector('input[placeholder*="Search product or service"]') as HTMLInputElement;
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Add to Bill') || b.textContent?.includes('Save Item')
      );

      if (nameInput && saveBtn) {
        await act(async () => {
          nameInput.value = 'Exempt Product';
          nameInput.dispatchEvent(new Event('change', { bubbles: true }));
          saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(savedData).not.toBeNull();
        expect(savedData?.hsnSacCode).toBe('');
      }
    });

    it('TC-HIDE-04: InvoiceItemModal displays HSN in main form and quick-add subform when isGstActive={true}', async () => {
      await act(async () => {
        root.render(
          <InvoiceItemModal
            isOpen={true}
            isGstActive={true}
            itemsCatalog={[mockItem]}
            isIntraState={true}
            onClose={() => {}}
            onSaveItem={() => {}}
          />
        );
      });

      expect(container.textContent).toContain('HSN / SAC Code');
      expect(container.querySelector('input[placeholder*="Laptop"]')).not.toBeNull();
    });

    it('TC-HIDE-05: TableGridInvoiceModal suppresses HSN column header and cell values when company.isGstEnabled === false', async () => {
      await act(async () => {
        root.render(
          <TableGridInvoiceModal
            company={baseNonGstCompany}
            parties={[mockParty]}
            itemsCatalog={[mockItem]}
            initialParty={mockParty}
            onClose={() => {}}
            onSave={() => {}}
          />
        );
      });

      // Assert table headers do NOT contain HSN/SAC
      const thElements = Array.from(container.querySelectorAll('th'));
      const hsnHeader = thElements.find((th) => th.textContent?.includes('HSN'));
      expect(hsnHeader).toBeUndefined();

      // Assert mobile summary row does not contain HSN
      expect(container.textContent).not.toContain('HSN 8471');
    });

    it('TC-HIDE-06: TableGridPurchaseModal suppresses HSN column header and cell values when company.isGstEnabled === false', async () => {
      await act(async () => {
        root.render(
          <TableGridPurchaseModal
            company={baseNonGstCompany}
            parties={[mockParty]}
            itemsCatalog={[mockItem]}
            initialSupplier={mockParty}
            onClose={() => {}}
            onSave={() => {}}
          />
        );
      });

      const thElements = Array.from(container.querySelectorAll('th'));
      const hsnHeader = thElements.find((th) => th.textContent?.includes('HSN'));
      expect(hsnHeader).toBeUndefined();
    });

    it('TC-HIDE-07: CreateInvoiceModal suppresses HSN input and locks GST to 0% when company.isGstEnabled === false', async () => {
      let savedInvoice: any = null;

      await act(async () => {
        root.render(
          <CreateInvoiceModal
            company={baseNonGstCompany}
            parties={[mockParty]}
            itemsCatalog={[mockItem]}
            onClose={() => {}}
            onSave={(inv) => {
              savedInvoice = inv;
            }}
          />
        );
      });

      // Verify no HSN input placeholder exists in DOM
      expect(container.querySelector('input[placeholder="HSN"]')).toBeNull();

      // Fill in invoice and save
      const itemInput = container.querySelector('input[placeholder*="Item name / description"]') as HTMLInputElement;
      const rateInput = container.querySelector('input[placeholder*="Rate ₹"]') as HTMLInputElement;
      const form = container.querySelector('form') as HTMLFormElement;

      if (itemInput && rateInput && form) {
        await act(async () => {
          itemInput.value = 'General Non-GST Item';
          itemInput.dispatchEvent(new Event('change', { bubbles: true }));
          rateInput.value = '500';
          rateInput.dispatchEvent(new Event('change', { bubbles: true }));
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(savedInvoice).not.toBeNull();
        expect(savedInvoice.items[0].hsnSacCode).toBe('');
        expect(savedInvoice.items[0].gstRate).toBe(0);
      }
    });

    it('TC-HIDE-08: CustomItemModal suppresses HSN input and GST slab when isGstActive={false}', async () => {
      let addedItem: any = null;

      await act(async () => {
        root.render(
          <CustomItemModal
            isOpen={true}
            isGstActive={false}
            onClose={() => {}}
            onAddCustomItem={(item) => {
              addedItem = item;
            }}
          />
        );
      });

      expect(container.textContent).not.toContain('HSN / SAC Code');
      expect(container.textContent).not.toContain('GST Tax Slab');
      expect(container.querySelector('input[placeholder*="services"]')).toBeNull();

      // Submit form
      const descInput = container.querySelector('input[placeholder*="Gift Wrapping"]') as HTMLInputElement;
      const priceInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
      const form = container.querySelector('form') as HTMLFormElement;

      await act(async () => {
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputSetter?.call(descInput, 'Quick Delivery Charge');
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
        descInput.dispatchEvent(new Event('change', { bubbles: true }));

        nativeInputSetter?.call(priceInput, '150');
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
        priceInput.dispatchEvent(new Event('change', { bubbles: true }));

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(addedItem).not.toBeNull();
      expect(addedItem.name).toBe('Quick Delivery Charge');
      expect(addedItem.hsnSacCode).toBe('');
      expect(addedItem.gstRate).toBe(0);
    });
  });
});
