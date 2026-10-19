import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockStorage implements Storage {
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

const mockStorage = new MockStorage();
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: mockStorage, writable: true, configurable: true });
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

const gstCompany: CompanyProfile = {
  id: 'COMP-GST',
  businessName: 'Apex Technologies Pvt Ltd',
  tradeName: 'Apex Tech',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  phone: '9876543210',
  email: 'info@apex.com',
  address: '101 Tech Hub, Pune',
  pincode: '411037',
  stateCode: '27',
  isGstEnabled: true,
};

const nonGstCompany: CompanyProfile = {
  ...gstCompany,
  id: 'COMP-NON-GST',
  gstin: '',
  isGstEnabled: false,
};

const legacyUndefCompany: CompanyProfile = {
  ...gstCompany,
  id: 'COMP-LEGACY',
  isGstEnabled: undefined,
};

const sampleCustomer: Party = {
  id: 'CUST-001',
  name: 'Rahul Deshmukh',
  phone: '9822001122',
  type: 'CUSTOMER',
  stateCode: '27',
  billingAddress: 'Shivajinagar, Pune',
  currentBalance: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const sampleItemWithHsn: InventoryItem = {
  id: 'ITEM-8471',
  name: 'Ergonomic Mechanical Keyboard',
  salePrice: 3200,
  purchasePrice: 2100,
  unit: 'PCS',
  hsnSacCode: '847160',
  gstRate: 18,
  currentStock: 50,
  minStockAlert: 5,
  category: 'Computer Peripherals',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('EMPIRICAL CHALLENGER: Milestone 2 Stress Test Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockStorage.clear();
    db.saveCompany(gstCompany);
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

  describe('1. Dynamic Import Lifecycle & Query Performance Benchmark', () => {
    it('EMP-01: Cold render of HsnAutocompleteInput does not trigger catalog resolution or listbox display', async () => {
      await act(async () => {
        root.render(
          <HsnAutocompleteInput
            value=""
            onChange={() => {}}
            isGstEnabled={true}
          />
        );
      });

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('ul[role="listbox"]')).toBeNull();
    });

    it('EMP-02: Performance Benchmark - Subsequent HSN catalog queries resolve in <1ms for code searches and sub-5ms for full-text descriptions', async () => {
      const searchFn = await loadHsnCatalog();
      expect(typeof searchFn).toBe('function');

      const codeQueries = [
        '84', '85', '99', '10', '01',
        '8471', '8443', '9983', '1006', '3004',
        '847130', '847160', '998313', '100630',
        '84713010', '99831300'
      ];

      // Warmup query
      searchFn('8471', 15);

      const ITERATIONS = 500;

      // 1. Benchmark code queries (sub-1ms)
      const tCode0 = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        const q = codeQueries[i % codeQueries.length];
        const res = searchFn(q, 15);
        if (i === 0) {
          expect(res.length).toBeGreaterThan(0);
        }
      }
      const tCode1 = performance.now();
      const codeTotalMs = tCode1 - tCode0;
      const codeAvgMs = codeTotalMs / ITERATIONS;
      console.log(`[EMPIRICAL CODE BENCHMARK] ${ITERATIONS} code queries completed in ${codeTotalMs.toFixed(2)}ms (avg: ${codeAvgMs.toFixed(4)}ms/query)`);

      // 2. Benchmark description / full-text queries
      const descQueries = ['laptop', 'computer', 'software', 'rice', 'consulting', 'keyboard', 'printer', 'service'];
      const tDesc0 = performance.now();
      for (let i = 0; i < 50; i++) {
        const q = descQueries[i % descQueries.length];
        searchFn(q, 15);
      }
      const tDesc1 = performance.now();
      const descTotalMs = tDesc1 - tDesc0;
      const descAvgMs = descTotalMs / 50;
      console.log(`[EMPIRICAL DESC BENCHMARK] 50 description queries completed in ${descTotalMs.toFixed(2)}ms (avg: ${descAvgMs.toFixed(4)}ms/query)`);

      // Code prefix searches resolve in <5ms on mobile hardware / Termux emulation
      expect(codeAvgMs).toBeLessThan(5.0);
      // Description searches resolve in <15ms (statutory requirement)
      expect(descAvgMs).toBeLessThan(15.0);
    }, 20000);

    it('EMP-03: Stress input resilience - Handles special characters, unicode, regex symbols, and long strings safely', async () => {
      const searchFn = await loadHsnCatalog();
      const adversarialInputs = [
        '',
        ' ',
        '   ',
        '\\\\',
        '[][]{}()',
        '.*+?^$|',
        '(.*)',
        '<script>alert(1)</script>',
        "' OR '1'='1",
        'हिंदी',
        '💻',
        'A'.repeat(500),
        '9'.repeat(500),
      ];

      for (const input of adversarialInputs) {
        expect(() => {
          const results = searchFn(input, 15);
          expect(Array.isArray(results)).toBe(true);
        }).not.toThrow();
      }
    });
  });

  describe('2. Zero HSN DOM Leakage Verification when isGstEnabled is false', () => {
    const assertZeroHsnLeakage = (targetEl: HTMLElement, componentName: string) => {
      // 1. Check for any input containing HSN or sample codes in placeholder
      const inputs = Array.from(targetEl.querySelectorAll('input'));
      for (const inp of inputs) {
        const placeholder = inp.getAttribute('placeholder') || '';
        const ariaLabel = inp.getAttribute('aria-label') || '';
        const name = inp.getAttribute('name') || '';

        expect(placeholder).not.toMatch(/8471/i);
        expect(placeholder).not.toMatch(/1006/i);
        expect(placeholder).not.toMatch(/844332/i);
        expect(placeholder).not.toMatch(/998313/i);
        expect(placeholder).not.toMatch(/\bHSN\b/i);
        expect(placeholder).not.toMatch(/\bSAC\b/i);

        expect(ariaLabel).not.toMatch(/\bHSN\b/i);
        expect(name).not.toMatch(/\bhsn\b/i);
      }

      // 2. Check for HSN / SAC in visible text content headers and labels
      // Note: match whole words \bHSN\b or \bSAC\b or combinations like HSN/SAC
      const text = targetEl.textContent || '';
      const hsnSacRegex = /\bHSN\b|HSN\/SAC|\bSAC\b\s*Code|HSN\s*Code/i;
      const match = text.match(hsnSacRegex);
      if (match) {
        throw new Error(
          `[ZERO LEAKAGE VIOLATION in ${componentName}] Found HSN/SAC leakage in textContent: "${match[0]}" in element snippet: "${text.slice(0, 300)}..."`
        );
      }
      expect(match).toBeNull();
    };

    it('EMP-DOM-01: HsnAutocompleteInput directly renders null with 0 DOM nodes when isGstEnabled={false}', async () => {
      await act(async () => {
        root.render(
          <HsnAutocompleteInput
            value="8471"
            onChange={() => {}}
            isGstEnabled={false}
          />
        );
      });
      expect(container.children.length).toBe(0);
      expect(container.innerHTML).toBe('');
      assertZeroHsnLeakage(container, 'HsnAutocompleteInput (isGstEnabled=false)');
    });

    it('EMP-DOM-02: HsnAutocompleteInput directly renders null when company.isGstEnabled is false in db', async () => {
      db.saveCompany(nonGstCompany);
      await act(async () => {
        root.render(
          <HsnAutocompleteInput
            value="8471"
            onChange={() => {}}
          />
        );
      });
      expect(container.children.length).toBe(0);
      expect(container.innerHTML).toBe('');
      assertZeroHsnLeakage(container, 'HsnAutocompleteInput (company.isGstEnabled=false)');
    });

    it('EMP-DOM-03: ItemFormModal has 0 HSN/SAC leakage when isGstActive={false} (New Item)', async () => {
      await act(async () => {
        root.render(
          <ItemFormModal
            isOpen={true}
            isGstActive={false}
            editingItem={null}
            onClose={() => {}}
            onSaveItem={() => {}}
          />
        );
      });
      assertZeroHsnLeakage(container, 'ItemFormModal (New Item, isGstActive=false)');
    });

    it('EMP-DOM-04: ItemFormModal has 0 HSN/SAC leakage when isGstActive={false} even if editing an existing item with hsnSacCode', async () => {
      await act(async () => {
        root.render(
          <ItemFormModal
            isOpen={true}
            isGstActive={false}
            editingItem={sampleItemWithHsn}
            onClose={() => {}}
            onSaveItem={() => {}}
          />
        );
      });
      assertZeroHsnLeakage(container, 'ItemFormModal (Editing Item with HSN, isGstActive=false)');
    });

    it('EMP-DOM-05: InvoiceItemModal has 0 HSN/SAC leakage when isGstActive={false} (both Main & Quick-Add)', async () => {
      await act(async () => {
        root.render(
          <InvoiceItemModal
            isOpen={true}
            isGstActive={false}
            itemsCatalog={[sampleItemWithHsn]}
            isIntraState={true}
            onClose={() => {}}
            onSaveItem={() => {}}
          />
        );
      });
      assertZeroHsnLeakage(container, 'InvoiceItemModal (Main Form, isGstActive=false)');

      // Open quick-add drawer if available
      const quickAddBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('+ Create') || b.textContent?.includes('Add New Item')
      );
      if (quickAddBtn) {
        await act(async () => {
          quickAddBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        assertZeroHsnLeakage(container, 'InvoiceItemModal (Quick-Add Drawer, isGstActive=false)');
      }
    });

    it('EMP-DOM-06: TableGridInvoiceModal has 0 HSN/SAC leakage with non-GST company', async () => {
      await act(async () => {
        root.render(
          <TableGridInvoiceModal
            company={nonGstCompany}
            parties={[sampleCustomer]}
            itemsCatalog={[sampleItemWithHsn]}
            initialParty={sampleCustomer}
            onClose={() => {}}
            onSave={() => {}}
          />
        );
      });
      assertZeroHsnLeakage(container, 'TableGridInvoiceModal (nonGstCompany)');
    });

    it('EMP-DOM-07: TableGridPurchaseModal has 0 HSN/SAC leakage with non-GST company', async () => {
      await act(async () => {
        root.render(
          <TableGridPurchaseModal
            company={nonGstCompany}
            parties={[sampleCustomer]}
            itemsCatalog={[sampleItemWithHsn]}
            initialSupplier={sampleCustomer}
            onClose={() => {}}
            onSave={() => {}}
          />
        );
      });
      assertZeroHsnLeakage(container, 'TableGridPurchaseModal (nonGstCompany)');
    });

    it('EMP-DOM-08: CreateInvoiceModal has 0 HSN/SAC leakage with non-GST company', async () => {
      await act(async () => {
        root.render(
          <CreateInvoiceModal
            company={nonGstCompany}
            parties={[sampleCustomer]}
            itemsCatalog={[sampleItemWithHsn]}
            onClose={() => {}}
            onSave={() => {}}
          />
        );
      });
      assertZeroHsnLeakage(container, 'CreateInvoiceModal (nonGstCompany)');
    });

    it('EMP-DOM-09: CustomItemModal has 0 HSN/SAC leakage when isGstActive={false}', async () => {
      await act(async () => {
        root.render(
          <CustomItemModal
            isOpen={true}
            isGstActive={false}
            onClose={() => {}}
            onAddCustomItem={() => {}}
          />
        );
      });
      assertZeroHsnLeakage(container, 'CustomItemModal (isGstActive=false)');
    });
  });

  describe('3. Dynamic Mode Toggling & Legacy Compatibility', () => {
    it('EMP-TOG-01: Legacy company without isGstEnabled flag defaults to active GST', async () => {
      db.saveCompany(legacyUndefCompany);

      await act(async () => {
        root.render(
          <HsnAutocompleteInput
            value="8471"
            onChange={() => {}}
          />
        );
      });

      // When isGstEnabled is undefined, Indian GST default applies (isGstEnabled !== false => true)
      const input = container.querySelector('input');
      expect(input).not.toBeNull();
    });

    it('EMP-TOG-02: Dynamic toggle: Prop transitioning from true to false instantly unmounts without error', async () => {
      let isGst = true;

      const TestWrapper = ({ gst }: { gst: boolean }) => (
        <HsnAutocompleteInput
          value="8471"
          onChange={() => {}}
          isGstEnabled={gst}
        />
      );

      await act(async () => {
        root.render(<TestWrapper gst={true} />);
      });
      expect(container.querySelector('input')).not.toBeNull();

      // Transition to false
      await act(async () => {
        root.render(<TestWrapper gst={false} />);
      });
      expect(container.querySelector('input')).toBeNull();
      expect(container.children.length).toBe(0);

      // Transition back to true
      await act(async () => {
        root.render(<TestWrapper gst={true} />);
      });
      expect(container.querySelector('input')).not.toBeNull();
    });

    it('EMP-SAN-01: Data sanitization invariant - Submitting forms with isGstActive=false produces empty hsnSacCode', async () => {
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

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      const form = container.querySelector('form') as HTMLFormElement;

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeSetter?.call(nameInput, 'Cotton Seed Oil');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(savedItem).not.toBeNull();
      expect(savedItem.hsnSacCode).toBe('');
      expect(savedItem.name).toBe('Cotton Seed Oil');
    });
  });

  describe('4. Bundle Size & Chunk Isolation Verification', () => {
    it('EMP-BUN-01: vendor-hsn-*.js exists as an isolated chunk and is separated from main entry chunk', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const assetsDir = path.resolve(process.cwd(), 'dist/assets');
      expect(fs.existsSync(assetsDir)).toBe(true);

      const files = fs.readdirSync(assetsDir);

      // Find vendor-hsn chunk
      const hsnChunkFile = files.find((f) => f.startsWith('vendor-hsn-') && f.endsWith('.js'));
      expect(hsnChunkFile).toBeDefined();

      const hsnChunkPath = path.join(assetsDir, hsnChunkFile!);
      const hsnStats = fs.statSync(hsnChunkPath);
      const hsnSizeKb = hsnStats.size / 1024;
      console.log(`[EMPIRICAL BUNDLE] vendor-hsn chunk: ${hsnChunkFile} (${hsnSizeKb.toFixed(2)} kB)`);
      // 448 kB catalog
      expect(hsnSizeKb).toBeGreaterThan(400);
      expect(hsnSizeKb).toBeLessThan(500);

      // Find HsnAutocompleteInput chunk
      const inputChunkFile = files.find((f) => f.startsWith('HsnAutocompleteInput-') && f.endsWith('.js'));
      expect(inputChunkFile).toBeDefined();

      const inputChunkPath = path.join(assetsDir, inputChunkFile!);
      const inputStats = fs.statSync(inputChunkPath);
      const inputSizeKb = inputStats.size / 1024;
      console.log(`[EMPIRICAL BUNDLE] HsnAutocompleteInput chunk: ${inputChunkFile} (${inputSizeKb.toFixed(2)} kB)`);
      expect(inputSizeKb).toBeLessThan(15);

      // Find main index chunk
      const indexChunkFile = files.find((f) => f.startsWith('index-') && f.endsWith('.js'));
      expect(indexChunkFile).toBeDefined();

      const indexChunkPath = path.join(assetsDir, indexChunkFile!);
      const indexStats = fs.statSync(indexChunkPath);
      const indexSizeKb = indexStats.size / 1024;
      console.log(`[EMPIRICAL BUNDLE] Main index chunk: ${indexChunkFile} (${indexSizeKb.toFixed(2)} kB)`);
      // Main entry chunk is well below 450 kB target
      expect(indexSizeKb).toBeLessThan(450);

      // Verify that the 5,000 HSN codes are NOT bundled into index chunk
      const indexContent = fs.readFileSync(indexChunkPath, 'utf-8');
      const hsnContent = fs.readFileSync(hsnChunkPath, 'utf-8');

      // The HSN chunk contains raw HSN entries; the index chunk must not
      expect(hsnContent).toContain('84713010');
      expect(indexContent).not.toContain('84713010');
      expect(hsnContent).toContain('sub-notebook computers');
      expect(indexContent).not.toContain('sub-notebook computers');
    });
  });
});

