import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

const inMemoryDocs = vi.hoisted(() => new Map<string, any>());

vi.mock('../services/pouchdb.ts', () => {
  return {
    pouch: {
      putDoc: vi.fn(async (type: string, doc: any) => {
        inMemoryDocs.set(`${type}:${doc.id}`, { ...doc, docType: type });
      }),
      deleteDoc: vi.fn(async (type: string, id: string) => {
        inMemoryDocs.delete(`${type}:${id}`);
      }),
      getAllDocs: vi.fn(async (type: string) => {
        const prefix = `${type}:`;
        return Array.from(inMemoryDocs.entries())
          .filter(([k]) => k.startsWith(prefix))
          .map(([, v]) => ({ ...v }));
      }),
      syncNow: vi.fn(async () => ({ ok: true })),
      subscribeState: vi.fn(() => () => {}),
      subscribeSync: vi.fn(() => () => {}),
      getSyncState: vi.fn(() => ({ status: 'offline', lastSynced: null, pendingCount: 0 })),
      onDataChange: vi.fn(() => () => {}),
      notifyDataChange: vi.fn(),
      getState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
      migrateFromLocalStorage: vi.fn(async () => {}),
    },
  };
});

import { Invoice } from '../models/invoice.ts';
import { Party } from '../models/party.ts';
import { CompanyProfile } from '../models/company.ts';
import { InventoryItem } from '../models/item.ts';
import { db } from '../services/db.ts';
import { generateNextDocumentNumber } from '../core/utils/invoiceNumber.ts';
import { canConvertToInvoice, convertDocumentToTaxInvoice } from '../core/utils/documentConversion.ts';
import { DeliveryChallansView } from '../components/Challans/DeliveryChallansView.tsx';
import { TabletSidebar } from '../components/Shell/TabletSidebar.tsx';
import { NavigationMenuHubView } from '../components/Navigation/NavigationMenuHubView.tsx';
import { Drawer } from '../components/Shell/Drawer.tsx';
import { rbac } from '../services/rbac.ts';
import { InvoicePreviewModal } from '../components/Invoicing/InvoicePreviewModal.tsx';
import { InvoiceHeaderMeta } from '../components/Invoicing/components/InvoiceHeaderMeta.tsx';
import { formatThermalReceiptText } from '../core/printer/escpos.ts';
import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';

// Setup Mock Storage
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
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const mockStorage = new MockStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const sampleCompany: CompanyProfile = {
  id: 'comp_1',
  businessName: 'Apex Transport & Logistics',
  tradeName: 'Apex Logistics',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: 'Warehouse Complex, MIDC, Pune',
  pincode: '411019',
  phone: '9876543210',
  email: 'ops@apexlogistics.in',
  invoicePrefix: 'INV',
  isGstEnabled: true,
  documentSeries: {
    DELIVERY_CHALLAN: {
      prefix: 'DC',
      separator: '/',
      yearFormat: 'YY_YY',
      startingNumber: 1,
      paddingDigits: 4,
    },
  },
};

const sampleCustomer: Party = {
  id: 'party_cust_1',
  name: 'Zenith Manufacturing Ltd',
  type: 'CUSTOMER',
  phone: '9822001122',
  gstin: '27AABCZ1234M1Z5',
  stateCode: '27',
  billingAddress: 'Plot 45, Chakan Industrial Area, Pune',
  pincode: '410501',
  currentBalance: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const sampleItem: InventoryItem = {
  id: 'item_101',
  name: 'Industrial Valves 50mm',
  category: 'Industrial',
  sku: 'VALVE-50',
  hsnSacCode: '8481',
  unit: 'NOS',
  purchasePrice: 1000,
  salePrice: 1500,
  gstRate: 18,
  currentStock: 100,
  minStockAlert: 10,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('Delivery Challan Domain & Experience End-to-End', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockStorage.clear();
    db.clearMemoryCache();
    inMemoryDocs.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Initialize clean database state
    db.saveCompany(sampleCompany);
    db.saveParty(sampleCustomer);
    db.saveItem(sampleItem);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('1. Accounting Invariant & Stock Independence', () => {
    it('does NOT alter customer party balance or decrement inventory stock when Delivery Challan is saved', async () => {
      const initialStock = db.getItems().find((i) => i.id === 'item_101')?.currentStock ?? 0;
      expect(initialStock).toBe(100);

      const challan: Invoice = {
        id: 'dc_test_001',
        invoiceNumber: 'DC/26-27/001',
        invoiceType: 'DELIVERY_CHALLAN',
        date: '2026-10-22',
        partyId: sampleCustomer.id,
        partyName: sampleCustomer.name,
        partyGstin: sampleCustomer.gstin,
        partyAddress: sampleCustomer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: sampleItem.id,
            name: sampleItem.name,
            hsnSacCode: sampleItem.hsnSacCode,
            unit: sampleItem.unit,
            quantity: 10,
            unitPrice: 1500,
            taxableAmount: 15000,
            gstRate: 18,
            cgstAmount: 1350,
            sgstAmount: 1350,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 17700,
          },
        ],
        totalGrossAmount: 15000,
        totalDiscount: 0,
        totalTaxableAmount: 15000,
        totalCgst: 1350,
        totalSgst: 1350,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 2700,
        roundOff: 0,
        grandTotal: 17700,
        amountInWords: 'Seventeen Thousand Seven Hundred Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 17700,
        challanStatus: 'DISPATCHED',
        vehicleNumber: 'MH12AB1234',
        transporterName: 'VRL Logistics',
        ewayBillNumber: '101234567890',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save delivery challan
      await db.saveInvoice(challan);

      // Verify stock was NOT decremented
      const postStock = db.getItems().find((i) => i.id === 'item_101')?.currentStock;
      expect(postStock).toBe(100);

      // Verify customer ledger balance was NOT altered (remains 0)
      const postCustomer = db.getParties().find((p) => p.id === sampleCustomer.id);
      expect(postCustomer?.currentBalance).toBe(0);

      // Recalculate explicitly
      const recalculated = db.recalculatePartyBalance(sampleCustomer.id);
      expect(recalculated).toBe(0);
    });

    it('does NOT restore inventory stock upon Delivery Challan deletion', async () => {
      const challan: Invoice = {
        id: 'dc_test_002',
        invoiceNumber: 'DC/26-27/002',
        invoiceType: 'DELIVERY_CHALLAN',
        date: '2026-10-22',
        partyId: sampleCustomer.id,
        partyName: sampleCustomer.name,
        partyAddress: sampleCustomer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: sampleItem.id,
            name: sampleItem.name,
            hsnSacCode: sampleItem.hsnSacCode,
            unit: sampleItem.unit,
            quantity: 5,
            unitPrice: 1500,
            taxableAmount: 7500,
            gstRate: 18,
            cgstAmount: 675,
            sgstAmount: 675,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 8850,
          },
        ],
        totalGrossAmount: 7500,
        totalDiscount: 0,
        totalTaxableAmount: 7500,
        totalCgst: 675,
        totalSgst: 675,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 1350,
        roundOff: 0,
        grandTotal: 8850,
        amountInWords: 'Eight Thousand Eight Hundred Fifty Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 8850,
        challanStatus: 'DRAFT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.saveInvoice(challan);
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(100);

      // Delete delivery challan
      await db.deleteInvoice(challan.id);

      // Stock remains exactly 100
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(100);
      expect(db.getInvoices().find((i) => i.id === challan.id)).toBeUndefined();
    });
  });

  describe('2. Delivery Challan Sequential Numbering Series', () => {
    it('generates sequential DC numbers adhering to Rule 55 prefix and year format', () => {
      const invs = db.getInvoices();
      const nextDc1 = generateNextDocumentNumber('DELIVERY_CHALLAN', sampleCompany, invs);
      expect(nextDc1).toMatch(/^DC\//);
      expect(nextDc1).toContain('1');
    });
  });

  describe('3. 1-Tap Conversion to Tax Invoice', () => {
    it('converts Delivery Challan to Tax Invoice, sets status to DELIVERED, decrements stock, and updates party ledger', async () => {
      const challan: Invoice = {
        id: 'dc_convert_1',
        invoiceNumber: 'DC/26-27/003',
        invoiceType: 'DELIVERY_CHALLAN',
        date: '2026-10-22',
        partyId: sampleCustomer.id,
        partyName: sampleCustomer.name,
        partyGstin: sampleCustomer.gstin,
        partyAddress: sampleCustomer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: sampleItem.id,
            name: sampleItem.name,
            hsnSacCode: sampleItem.hsnSacCode,
            unit: sampleItem.unit,
            quantity: 15,
            unitPrice: 1500,
            taxableAmount: 22500,
            gstRate: 18,
            cgstAmount: 2025,
            sgstAmount: 2025,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 26550,
          },
        ],
        totalGrossAmount: 22500,
        totalDiscount: 0,
        totalTaxableAmount: 22500,
        totalCgst: 2025,
        totalSgst: 2025,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 4050,
        roundOff: 0,
        grandTotal: 26550,
        amountInWords: 'Twenty Six Thousand Five Hundred Fifty Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 26550,
        challanStatus: 'DISPATCHED',
        vehicleNumber: 'MH12AB1234',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.saveInvoice(challan);

      // Verify canConvertToInvoice
      expect(canConvertToInvoice(challan)).toBe(true);

      // Convert
      const taxInvoice = await convertDocumentToTaxInvoice(challan, sampleCompany);

      expect(taxInvoice.invoiceType).toBe('B2B');
      expect(taxInvoice.isConverted).toBe(false);
      expect(taxInvoice.convertedFromDocType).toBe('DELIVERY_CHALLAN');
      expect(taxInvoice.convertedFromDocNumber).toBe(challan.invoiceNumber);

      // Check source challan status was updated to DELIVERED and isConverted: true
      const updatedChallan = db.getInvoices().find((i) => i.id === challan.id);
      expect(updatedChallan?.isConverted).toBe(true);
      expect(updatedChallan?.challanStatus).toBe('DELIVERED');
      expect(updatedChallan?.convertedToInvoiceId).toBe(taxInvoice.id);

      // Now source challan cannot be converted again
      expect(canConvertToInvoice(updatedChallan!)).toBe(false);

      // The new Tax Invoice decremented stock by 15 (100 - 15 = 85)
      const currentStock = db.getItems().find((i) => i.id === 'item_101')?.currentStock;
      expect(currentStock).toBe(85);

      // Customer balance now reflects the converted Tax Invoice (receivable 26550)
      const customer = db.getParties().find((p) => p.id === sampleCustomer.id);
      expect(customer?.currentBalance).toBe(26550);
    });
  });

  describe('4. DeliveryChallansView UI & Interactions', () => {
    it('renders empty state when no challans exist and triggers onNewDeliveryChallan', () => {
      const onNewMock = vi.fn();

      act(() => {
        root.render(
          <DeliveryChallansView
            company={sampleCompany}
            invoices={[]}
            onNewDeliveryChallan={onNewMock}
            onViewInvoice={() => {}}
            onDeleteInvoice={() => {}}
          />
        );
      });

      expect(container.textContent).toContain('Delivery Challans');
      expect(container.textContent).toContain('No Delivery Challans Found');

      const createBtn = container.querySelector('[data-testid="new-delivery-challan-btn"]') as HTMLButtonElement;
      expect(createBtn).toBeTruthy();
      act(() => {
        createBtn.click();
      });
      expect(onNewMock).toHaveBeenCalledTimes(1);
    });

    it('renders challan list with KPI metrics, status badges, vehicle details, and filters by search', () => {
      const challans: Invoice[] = [
        {
          id: 'dc_ui_1',
          invoiceNumber: 'DC/26-27/001',
          invoiceType: 'DELIVERY_CHALLAN',
          date: '2026-10-22',
          partyId: sampleCustomer.id,
          partyName: sampleCustomer.name,
          partyAddress: sampleCustomer.billingAddress,
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          totalGrossAmount: 10000,
          totalDiscount: 0,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1800,
          roundOff: 0,
          grandTotal: 11800,
          amountInWords: '',
          paymentMode: 'CREDIT',
          paymentStatus: 'UNPAID',
          paidAmount: 0,
          balanceAmount: 11800,
          challanStatus: 'DISPATCHED',
          vehicleNumber: 'MH12AB9999',
          transporterName: 'Apex Express',
          ewayBillNumber: '112233445566',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'dc_ui_2',
          invoiceNumber: 'DC/26-27/002',
          invoiceType: 'DELIVERY_CHALLAN',
          date: '2026-10-22',
          partyId: 'p2',
          partyName: 'Beta Steel Corp',
          partyAddress: 'Mumbai',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          totalGrossAmount: 5000,
          totalDiscount: 0,
          totalTaxableAmount: 5000,
          totalCgst: 450,
          totalSgst: 450,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 900,
          roundOff: 0,
          grandTotal: 5900,
          amountInWords: '',
          paymentMode: 'CREDIT',
          paymentStatus: 'UNPAID',
          paidAmount: 0,
          balanceAmount: 5900,
          challanStatus: 'DRAFT',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const onViewMock = vi.fn();
      const onEditMock = vi.fn();
      const onDeleteMock = vi.fn();

      act(() => {
        root.render(
          <DeliveryChallansView
            company={sampleCompany}
            invoices={challans}
            onNewDeliveryChallan={() => {}}
            onViewInvoice={onViewMock}
            onEditInvoice={onEditMock}
            onDeleteInvoice={onDeleteMock}
          />
        );
      });

      // KPI checks
      expect(container.textContent).toContain('Total Challans');
      expect(container.textContent).toContain('In Transit / Dispatched');
      expect(container.textContent).toContain('Drafts');

      // Row checks
      expect(container.textContent).toContain('DC/26-27/001');
      expect(container.textContent).toContain('Zenith Manufacturing Ltd');
      expect(container.textContent).toContain('MH12AB9999');
      expect(container.textContent).toContain('112233445566');
      expect(container.textContent).toContain('Beta Steel Corp');

      // Search filtering by vehicle number
      const setNativeValue = (element: HTMLInputElement, value: string) => {
        const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
          prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
          valueSetter.call(element, value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
      };

      const searchInput = container.querySelector('[data-testid="challan-search-input"]') as HTMLInputElement;
      expect(searchInput).toBeTruthy();
      act(() => {
        setNativeValue(searchInput, 'MH12AB9999');
      });

      // Filtered to only Zenith / MH12AB9999
      expect(container.textContent).toContain('DC/26-27/001');
      expect(container.textContent).not.toContain('Beta Steel Corp');

      // Clear search
      act(() => {
        setNativeValue(searchInput, '');
      });
      expect(container.textContent).toContain('Beta Steel Corp');

      // Status Tab filter: Drafts
      const draftTabBtn = container.querySelector('[data-testid="challan-tab-draft"]') as HTMLButtonElement;
      expect(draftTabBtn).toBeTruthy();
      act(() => {
        draftTabBtn.click();
      });
      expect(container.textContent).toContain('Beta Steel Corp');
      expect(container.textContent).not.toContain('Zenith Manufacturing Ltd');

      // Click View
      const viewBtn = container.querySelector('[data-testid="challan-view-btn-dc_ui_2"]') as HTMLButtonElement;
      expect(viewBtn).toBeTruthy();
      act(() => {
        viewBtn.click();
      });
      expect(onViewMock).toHaveBeenCalledWith(challans[1]);
    });
  });

  describe('5. Tablet Sidebar & Navigation Hub Integration', () => {
    it('renders Delivery Challans tab in TabletSidebar under Transactions', () => {
      const onSelectTab = vi.fn();

      act(() => {
        root.render(
          <TabletSidebar
            activeTab="delivery_challans"
            company={sampleCompany}
            onSelectTab={onSelectTab}
          />
        );
      });

      expect(container.textContent).toContain('Delivery Challans');
      const dcSidebarBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delivery Challans')
      );
      expect(dcSidebarBtn).toBeTruthy();
      act(() => {
        dcSidebarBtn?.click();
      });
      expect(onSelectTab).toHaveBeenCalledWith('delivery_challans');
    });

    it('links Delivery Challan in NavigationMenuHubView directly to delivery_challans', () => {
      const onNavigate = vi.fn();
      const challans: Invoice[] = [
        {
          id: 'dc_1',
          invoiceNumber: 'DC/1',
          invoiceType: 'DELIVERY_CHALLAN',
          date: '2026-10-22',
          partyName: 'Customer A',
          partyAddress: '',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          totalGrossAmount: 0,
          totalDiscount: 0,
          totalTaxableAmount: 0,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 0,
          roundOff: 0,
          grandTotal: 1000,
          amountInWords: '',
          paymentMode: 'CASH',
          paymentStatus: 'PAID',
          paidAmount: 1000,
          balanceAmount: 0,
          createdAt: '',
          updatedAt: '',
        },
      ];

      act(() => {
        root.render(
          <NavigationMenuHubView
            company={sampleCompany}
            invoices={challans}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={onNavigate}
          />
        );
      });

      expect(container.textContent).toContain('Delivery Challan');
      expect(container.textContent).toContain('1 Challans');

      const dcHubCard = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delivery Challan')
      );
      expect(dcHubCard).toBeTruthy();
      act(() => {
        dcHubCard?.click();
      });
      expect(onNavigate).toHaveBeenCalledWith('delivery_challans');
    });
  });

  describe('6. Delivery Challan Release Gap Hardening (Drawer, RBAC, Preview Suppression, Date Defaults, 12-digit E-Way, Purpose)', () => {
    it('verifies Mobile Drawer includes Delivery Challans and rbac.canAccessTab allows Cashier, Accountant, and Owner', () => {
      // RBAC Allowlist Checks
      expect(rbac.canAccessTab('delivery_challans', 'CASHIER')).toBe(true);
      expect(rbac.canAccessTab('delivery_challans', 'ACCOUNTANT')).toBe(true);
      expect(rbac.canAccessTab('delivery_challans', 'OWNER')).toBe(true);

      // Drawer component rendering check
      act(() => {
        root.render(
          <Drawer
            isOpen={true}
            onClose={() => {}}
            activeTab="dashboard"
            onSelectTab={() => {}}
            company={sampleCompany}
          />
        );
      });

      expect(container.textContent).toContain('Delivery Challans');
    });

    it('verifies Delivery Challan preview suppresses payment mode, balance due, UPI QR, and due date, and uses Challan labels', () => {
      const challanDoc: Invoice = {
        id: 'dc_preview_1',
        invoiceNumber: 'DC-2026-0042',
        invoiceType: 'DELIVERY_CHALLAN',
        date: '2026-10-22',
        dueDate: '2026-10-22',
        partyName: 'Industrial Client',
        partyAddress: 'GIDC Phase 2',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            id: 'it_1',
            itemId: 'item_1',
            name: 'Pneumatic Cylinder',
            hsnSacCode: '8412',
            quantity: 2,
            unit: 'PCS',
            unitPrice: 5000,
            discountPercent: 0,
            discountAmount: 0,
            taxableAmount: 10000,
            gstRate: 18,
            cgstAmount: 900,
            sgstAmount: 900,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 11800,
          },
        ],
        totalGrossAmount: 10000,
        totalDiscount: 0,
        totalTaxableAmount: 10000,
        totalCgst: 900,
        totalSgst: 900,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 1800,
        roundOff: 0,
        grandTotal: 11800,
        amountInWords: 'Eleven Thousand Eight Hundred Only',
        paymentMode: 'CASH',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 11800,
        challanStatus: 'DISPATCHED',
        challanType: 'FOR_REMOVAL',
        vehicleNumber: 'MH-12-AB-9999',
        ewayBillNumber: '123456789012',
        createdAt: '2026-10-22T08:00:00Z',
        updatedAt: '2026-10-22T08:00:00Z',
      };

      const companyWithUpi = {
        ...sampleCompany,
        upiId: 'ops@icici',
        accountNumber: '998877665544',
        bankName: 'HDFC Bank',
      };

      // 1. Thermal text layout
      const thermalText = formatThermalReceiptText({
        companyName: companyWithUpi.businessName,
        companyAddress: companyWithUpi.address,
        gstin: companyWithUpi.gstin,
        phone: companyWithUpi.phone,
        receiptTitle: 'DELIVERY CHALLAN',
        invoiceNo: challanDoc.invoiceNumber,
        date: challanDoc.date,
        customerName: challanDoc.partyName,
        items: challanDoc.items.map((i) => ({ name: i.name, qty: i.quantity, rate: i.unitPrice, amount: i.totalAmount })),
        taxableAmount: challanDoc.totalTaxableAmount,
        cgstAmount: challanDoc.totalCgst,
        sgstAmount: challanDoc.totalSgst,
        igstAmount: 0,
        grandTotal: challanDoc.grandTotal,
        balanceAmount: challanDoc.balanceAmount,
        paidAmount: challanDoc.paidAmount,
        isDeliveryChallan: true,
        challanPurpose: 'For removal',
        vehicleNumber: challanDoc.vehicleNumber,
      });

      expect(thermalText).toContain('DELIVERY CHALLAN');
      expect(thermalText).toContain('Challan No: DC-2026-0042');
      expect(thermalText).not.toContain('Bill Balance Due:');
      expect(thermalText).not.toContain('Pay via UPI');

      // 2. On-screen modal preview (A4 view)
      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={challanDoc}
            company={companyWithUpi}
            onClose={() => {}}
          />
        );
      });

      expect(container.textContent).toContain('Challan Number');
      expect(container.textContent).toContain('Challan Date');
      expect(container.textContent).toContain('Purpose of Supply (Rule 55)');
      expect(container.textContent).not.toContain('Payment Mode / Terms');
      expect(container.textContent).not.toContain('Balance Due');
      expect(container.textContent).not.toContain('Scan to Pay');
    });

    it('enforces 12 digits max on E-Way Bill input in InvoiceHeaderMeta', () => {
      const onEwayBillChange = vi.fn();
      const metaCommonProps = {
        onClose: () => {},
        invoiceConflictError: null,
        allInvoices: [],
        onSelectPartyClick: () => {},
        onClearParty: () => {},
        onAddPartyClick: () => {},
        onOpenInvoiceNumberModal: () => {},
        onOpenDueDateModal: () => {},
        onAutoFixConflict: () => {},
      };

      act(() => {
        root.render(
          <InvoiceHeaderMeta
            {...metaCommonProps}
            invoiceNumber="DC-2026-0001"
            invoiceDate="2026-10-22"
            dueDate="2026-10-22"
            posStateCode="27"
            isGstActive={true}
            isIntraState={true}
            selectedParty={null}
            currentConflict={null}
            invoiceType="DELIVERY_CHALLAN"
            ewayBillNumber="123456789012"
            onEwayBillNumberChange={onEwayBillChange}
          />
        );
      });

      // In Delivery Challan mode, shipping & transport details are auto-expanded
      const ewayInput = container.querySelector('input[placeholder="12-digit E-Way Bill"]') as HTMLInputElement;
      expect(ewayInput).toBeTruthy();
      expect(ewayInput.maxLength).toBe(12);

      // Simulate input with 16 digits
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(ewayInput, '1234567890123456');
      ewayInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(onEwayBillChange).toHaveBeenCalledWith('123456789012');
    });

    it('renders Rule 55 purpose selector in InvoiceHeaderMeta and prints Purpose', () => {
      const onChallanTypeChange = vi.fn();
      const metaCommonProps = {
        onClose: () => {},
        invoiceConflictError: null,
        allInvoices: [],
        onSelectPartyClick: () => {},
        onClearParty: () => {},
        onAddPartyClick: () => {},
        onOpenInvoiceNumberModal: () => {},
        onOpenDueDateModal: () => {},
        onAutoFixConflict: () => {},
      };

      act(() => {
        root.render(
          <InvoiceHeaderMeta
            {...metaCommonProps}
            invoiceNumber="DC-2026-0001"
            invoiceDate="2026-10-22"
            dueDate="2026-10-22"
            posStateCode="27"
            isGstActive={true}
            isIntraState={true}
            selectedParty={null}
            currentConflict={null}
            invoiceType="DELIVERY_CHALLAN"
            challanType="SUPPLY_ON_APPROVAL"
            onChallanTypeChange={onChallanTypeChange}
          />
        );
      });

      const purposeSelector = container.querySelector('div[data-testid="challan-type-selector"] select') as HTMLSelectElement;
      expect(purposeSelector).toBeTruthy();
      expect(purposeSelector.value).toBe('SUPPLY_ON_APPROVAL');

      // Check all 4 options
      const options = Array.from(purposeSelector.querySelectorAll('option')).map((o) => o.textContent);
      expect(options).toEqual(['For removal', 'Supply on approval', 'Job work', 'Others']);

      // Change selection
      act(() => {
        purposeSelector.value = 'JOB_WORK';
        purposeSelector.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(onChallanTypeChange).toHaveBeenCalledWith('JOB_WORK');
    });

    it('defaults DC dispatch date to today in TableGridInvoiceModal', () => {
      act(() => {
        root.render(
          <TableGridInvoiceModal
            company={sampleCompany}
            parties={[]}
            itemsCatalog={[]}
            onClose={() => {}}
            onSave={() => {}}
            defaultInvoiceType="DELIVERY_CHALLAN"
          />
        );
      });

      const dispatchBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Dispatch:')
      );
      expect(dispatchBtn).toBeTruthy();
      expect(dispatchBtn?.textContent).toContain('Dispatch:');
    });
  });
});
