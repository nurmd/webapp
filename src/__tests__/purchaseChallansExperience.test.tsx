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

import { PurchaseBill } from '../models/purchase.ts';
import { Party } from '../models/party.ts';
import { CompanyProfile } from '../models/company.ts';
import { InventoryItem } from '../models/item.ts';
import { db } from '../services/db.ts';
import { generateNextDocumentNumber, DOCUMENT_SERIES_LABELS, DEFAULT_SERIES_CONFIGS } from '../core/utils/invoiceNumber.ts';
import { canConvertPurchaseChallan, convertPurchaseChallanToBill } from '../core/utils/documentConversion.ts';
import { PurchaseChallansView } from '../components/Purchases/PurchaseChallansView.tsx';
import { TabletSidebar } from '../components/Shell/TabletSidebar.tsx';
import { NavigationMenuHubView } from '../components/Navigation/NavigationMenuHubView.tsx';
import { Drawer } from '../components/Shell/Drawer.tsx';
import { rbac } from '../services/rbac.ts';
import { draftService } from '../services/draftService.ts';
import { SimplifiedPurchaseModal } from '../components/Purchases/SimplifiedPurchaseModal.tsx';

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

describe('Purchase Challans (GRN) Experience & Domain Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockCompany: CompanyProfile = {
    id: 'comp_1',
    businessName: 'Apex Wholesale Corp',
    tradeName: 'Apex Goods',
    gstin: '27AABCA1234A1Z5',
    pan: 'AABCA1234A',
    stateCode: '27',
    address: '100 Industrial Zone, Pune, MH',
    pincode: '411001',
    phone: '9876543210',
    email: 'info@apexwholesale.com',
    isGstEnabled: true,
  };

  const mockSupplier: Party = {
    id: 'supp_101',
    name: 'Precision Components Ltd',
    type: 'SUPPLIER',
    phone: '9123456780',
    stateCode: '27',
    gstin: '27AABCP9999P1Z8',
    billingAddress: '42 Vendor Park, Chakan, MH',
    currentBalance: 0,
    openingBalance: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockItem: InventoryItem = {
    id: 'item_101',
    name: 'Steel Ball Bearings 6204',
    category: 'Hardware',
    hsnSacCode: '848210',
    unit: 'PCS',
    salePrice: 150,
    purchasePrice: 100,
    gstRate: 18,
    currentStock: 50,
    minStockAlert: 10,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockStorage.clear();
    db.clearMemoryCache();
    inMemoryDocs.clear();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    db.saveCompany(mockCompany);
    db.saveParty(mockSupplier);
    db.saveItem(mockItem);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // =========================================================================
  // 1. Series & Document Configuration
  // =========================================================================
  describe('1. Series & Document Numbering Configuration', () => {
    it('defines PURCHASE_CHALLAN in DOCUMENT_SERIES_LABELS and DEFAULT_SERIES_CONFIGS', () => {
      expect(DOCUMENT_SERIES_LABELS.PURCHASE_CHALLAN).toBeDefined();
      expect(DOCUMENT_SERIES_LABELS.PURCHASE_CHALLAN.shortCode).toBe('PCH');
      expect(DOCUMENT_SERIES_LABELS.PURCHASE_CHALLAN.icon).toBe('move_to_inbox');

      expect(DEFAULT_SERIES_CONFIGS.PURCHASE_CHALLAN).toBeDefined();
      expect(DEFAULT_SERIES_CONFIGS.PURCHASE_CHALLAN.prefix).toBe('PCH');
      expect(DEFAULT_SERIES_CONFIGS.PURCHASE_CHALLAN.yearFormat).toBe('YYYY');
    });

    it('generates sequential numbers for PURCHASE_CHALLAN series', () => {
      const year = new Date().getFullYear();
      const num1 = generateNextDocumentNumber('PURCHASE_CHALLAN', mockCompany, []);
      expect(num1).toBe(`PCH-${year}-0001`);

      const num2 = generateNextDocumentNumber('PURCHASE_CHALLAN', mockCompany, [
        { id: 'p1', invoiceNumber: `PCH-${year}-0001` },
      ]);
      expect(num2).toBe(`PCH-${year}-0002`);
    });
  });

  // =========================================================================
  // 2. Physical Stock & Ledger Accounting Invariants (GRN Mode)
  // =========================================================================
  describe('2. Physical Stock & Ledger Invariants (GRN Mode)', () => {
    it('immediately increments physical inventory stock upon receiving a Purchase Challan', () => {
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(50);

      const challan: PurchaseBill = {
        id: 'pch_1',
        billNumber: 'PCH-2026-0001',
        purchaseType: 'CHALLAN',
        challanStatus: 'RECEIVED',
        date: '2026-10-22',
        supplierId: mockSupplier.id,
        supplierName: mockSupplier.name,
        supplierAddress: '42 Vendor Park, Chakan, MH',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'item_101',
            name: 'Steel Ball Bearings 6204',
            hsnSacCode: '848210',
            unit: 'PCS',
            quantity: 25,
            unitPrice: 100,
            taxableAmount: 2500,
            gstRate: 18,
            cgstAmount: 225,
            sgstAmount: 225,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 2950,
          },
        ],
        itcEligibility: 'ELIGIBLE_INPUTS',
        isRcm: false,
        totalGrossAmount: 2500,
        totalDiscount: 0,
        totalTaxableAmount: 2500,
        totalCgst: 225,
        totalSgst: 225,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 450,
        roundOff: 0,
        grandTotal: 2950,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.savePurchase(challan);

      // Inventory stock increased by 25 (50 + 25 = 75)
      const updatedItem = db.getItems().find((i) => i.id === 'item_101');
      expect(updatedItem?.currentStock).toBe(75);
    });

    it('does NOT post supplier payable liability to vendor ledger upon receiving a Challan', () => {
      const challan: PurchaseBill = {
        id: 'pch_2',
        billNumber: 'PCH-2026-0002',
        purchaseType: 'CHALLAN',
        challanStatus: 'RECEIVED',
        date: '2026-10-22',
        supplierId: mockSupplier.id,
        supplierName: mockSupplier.name,
        supplierAddress: '42 Vendor Park, Chakan, MH',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'item_101',
            name: 'Steel Ball Bearings 6204',
            hsnSacCode: '848210',
            unit: 'PCS',
            quantity: 10,
            unitPrice: 100,
            taxableAmount: 1000,
            gstRate: 18,
            cgstAmount: 90,
            sgstAmount: 90,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1180,
          },
        ],
        itcEligibility: 'ELIGIBLE_INPUTS',
        isRcm: false,
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 90,
        totalSgst: 90,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1180,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.savePurchase(challan);

      // Supplier payable balance remains 0 (no ledger liability)
      const updatedSupplier = db.getParties().find((p) => p.id === mockSupplier.id);
      expect(updatedSupplier?.currentBalance).toBe(0);

      // No double entry RCM or purchase vouchers created
      const vouchers = db.getVouchers();
      expect(vouchers.length).toBe(0);
    });

    it('reverts physical stock when an active Purchase Challan is cancelled', () => {
      const challan: PurchaseBill = {
        id: 'pch_3',
        billNumber: 'PCH-2026-0003',
        purchaseType: 'CHALLAN',
        challanStatus: 'RECEIVED',
        date: '2026-10-22',
        supplierId: mockSupplier.id,
        supplierName: mockSupplier.name,
        supplierAddress: '42 Vendor Park, Chakan, MH',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'item_101',
            name: 'Steel Ball Bearings 6204',
            hsnSacCode: '848210',
            unit: 'PCS',
            quantity: 20,
            unitPrice: 100,
            taxableAmount: 2000,
            gstRate: 18,
            cgstAmount: 180,
            sgstAmount: 180,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 2360,
          },
        ],
        itcEligibility: 'ELIGIBLE_INPUTS',
        isRcm: false,
        totalGrossAmount: 2000,
        totalDiscount: 0,
        totalTaxableAmount: 2000,
        totalCgst: 180,
        totalSgst: 180,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 360,
        roundOff: 0,
        grandTotal: 2360,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.savePurchase(challan);
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(70); // 50 + 20

      // Cancel challan
      const cancelledChallan: PurchaseBill = {
        ...challan,
        isCancelled: true,
        challanStatus: 'CANCELLED',
        updatedAt: new Date().toISOString(),
      };
      db.savePurchase(cancelledChallan);

      // Physical stock reverted back to 50
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(50);
      expect(db.getParties().find((p) => p.id === mockSupplier.id)?.currentBalance).toBe(0);
    });

    it('reverts physical stock when an unconverted Purchase Challan is deleted', () => {
      const challan: PurchaseBill = {
        id: 'pch_4',
        billNumber: 'PCH-2026-0004',
        purchaseType: 'CHALLAN',
        challanStatus: 'RECEIVED',
        date: '2026-10-22',
        supplierId: mockSupplier.id,
        supplierName: mockSupplier.name,
        supplierAddress: '42 Vendor Park, Chakan, MH',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'item_101',
            name: 'Steel Ball Bearings 6204',
            hsnSacCode: '848210',
            unit: 'PCS',
            quantity: 15,
            unitPrice: 100,
            taxableAmount: 1500,
            gstRate: 18,
            cgstAmount: 135,
            sgstAmount: 135,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1770,
          },
        ],
        itcEligibility: 'ELIGIBLE_INPUTS',
        isRcm: false,
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 135,
        totalSgst: 135,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 270,
        roundOff: 0,
        grandTotal: 1770,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.savePurchase(challan);
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(65); // 50 + 15

      // Delete unconverted challan
      db.deletePurchase(challan.id);

      // Stock is decremented back to 50
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(50);
      expect(db.getPurchases().find((p) => p.id === challan.id)).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. 1-Tap Document Conversion to Purchase Bill
  // =========================================================================
  describe('3. 1-Tap Conversion from Challan to Purchase Bill', () => {
    it('converts Purchase Challan into Purchase Bill without double-incrementing stock', async () => {
      const challan: PurchaseBill = {
        id: 'pch_conv_1',
        billNumber: 'PCH-2026-0010',
        purchaseType: 'CHALLAN',
        challanStatus: 'RECEIVED',
        date: '2026-10-22',
        supplierId: mockSupplier.id,
        supplierName: mockSupplier.name,
        supplierAddress: '42 Vendor Park, Chakan, MH',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        vehicleNumber: 'MH12AB9999',
        transporterName: 'VRL Logistics',
        lrNumber: 'LR-12345',
        ewayBillNumber: '121212121212',
        items: [
          {
            itemId: 'item_101',
            name: 'Steel Ball Bearings 6204',
            hsnSacCode: '848210',
            unit: 'PCS',
            quantity: 30,
            unitPrice: 100,
            taxableAmount: 3000,
            gstRate: 18,
            cgstAmount: 270,
            sgstAmount: 270,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 3540,
          },
        ],
        itcEligibility: 'ELIGIBLE_INPUTS',
        isRcm: false,
        totalGrossAmount: 3000,
        totalDiscount: 0,
        totalTaxableAmount: 3000,
        totalCgst: 270,
        totalSgst: 270,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 540,
        roundOff: 0,
        grandTotal: 3540,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 0,
        createdAt: '2026-10-22T10:00:00Z',
        updatedAt: '2026-10-22T10:00:00Z',
      };

      // 1. Initial Challan entry: stock increases to 80 (50 + 30)
      db.savePurchase(challan);
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(80);
      expect(db.getParties().find((p) => p.id === mockSupplier.id)?.currentBalance).toBe(0);

      // Verify canConvertPurchaseChallan
      expect(canConvertPurchaseChallan(challan)).toBe(true);

      // 2. Perform 1-Tap Conversion
      const newBill = await convertPurchaseChallanToBill(challan, mockCompany);

      expect(newBill.purchaseType).toBe('BILL');
      expect(newBill.convertedFromChallanId).toBe(challan.id);
      expect(newBill.convertedFromChallanNumber).toBe(challan.billNumber);

      // 3. Verify stock did NOT increment twice! It must stay 80 (not 110)
      const stockAfterConversion = db.getItems().find((i) => i.id === 'item_101')?.currentStock;
      expect(stockAfterConversion).toBe(80);

      // 4. Verify supplier payable balance was recorded: -3540
      const supplierAfterConversion = db.getParties().find((p) => p.id === mockSupplier.id);
      expect(supplierAfterConversion?.currentBalance).toBe(-3540);

      // 5. Verify source challan is marked as converted
      const updatedChallan = db.getPurchases().find((p) => p.id === challan.id);
      expect(updatedChallan?.isConverted).toBe(true);
      expect(updatedChallan?.convertedToBillId).toBe(newBill.id);
      expect(canConvertPurchaseChallan(updatedChallan!)).toBe(false);

      // 6. Deleting the converted bill must not remove the physical stock received via challan
      db.deletePurchase(newBill.id);
      expect(db.getItems().find((i) => i.id === 'item_101')?.currentStock).toBe(80);
    });
  });

  // =========================================================================
  // 4. Draft Storage Service
  // =========================================================================
  describe('4. Purchase Draft Service for Challans', () => {
    it('persists and restores purchase challan drafts without colliding with bills or POs', () => {
      draftService.savePurchaseDraft(
        {
          billNumber: 'PCH-DRAFT-01',
          selectedSupplier: mockSupplier,
          rows: [
            {
              itemId: 'item_101',
              name: 'Steel Ball Bearings 6204',
              hsnSacCode: '848210',
              quantity: 12,
              unitPrice: 100,
              discountPercent: 0,
              unit: 'PCS',
              gstRate: 18,
            },
          ],
        },
        'CHALLAN'
      );

      expect(draftService.hasPurchaseDraft('CHALLAN')).toBe(true);
      expect(draftService.hasPurchaseDraft('PO')).toBe(false);
      expect(draftService.hasPurchaseDraft('BILL')).toBe(false);

      const restored = draftService.getPurchaseDraft('CHALLAN');
      expect(restored?.billNumber).toBe('PCH-DRAFT-01');
      expect(restored?.selectedSupplier?.id).toBe(mockSupplier.id);
      expect(restored?.rows.length).toBe(1);

      draftService.clearPurchaseDraft('CHALLAN');
      expect(draftService.hasPurchaseDraft('CHALLAN')).toBe(false);
    });
  });

  // =========================================================================
  // 5. RBAC & Navigation Wiring
  // =========================================================================
  describe('5. RBAC & Navigation Structure', () => {
    it('enforces RBAC permissions for purchase_challans tab', () => {
      expect(rbac.canAccessTab('purchase_challans', 'OWNER')).toBe(true);
      expect(rbac.canAccessTab('purchase_challans', 'ACCOUNTANT')).toBe(true);
      expect(rbac.canAccessTab('purchase_challans', 'CASHIER')).toBe(false);
    });

    it('renders purchase_challans in Drawer items', () => {
      const onSelectTab = vi.fn();
      act(() => {
        root.render(
          <Drawer
            isOpen={true}
            activeTab="dashboard"
            company={mockCompany}
            onClose={() => {}}
            onSelectTab={onSelectTab}
          />
        );
      });

      const challanBtn = container.querySelector('button[data-tab="purchase_challans"]') ||
        Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Purchase Challans'));
      expect(challanBtn).toBeTruthy();

      act(() => {
        challanBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onSelectTab).toHaveBeenCalledWith('purchase_challans');
    });

    it('renders purchase_challans in TabletSidebar items', () => {
      const onSelectTab = vi.fn();
      act(() => {
        root.render(
          <TabletSidebar
            activeTab="dashboard"
            company={mockCompany}
            onSelectTab={onSelectTab}
          />
        );
      });

      const challanBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Purchase Challans')
      );
      expect(challanBtn).toBeTruthy();

      act(() => {
        challanBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onSelectTab).toHaveBeenCalledWith('purchase_challans');
    });

    it('links purchase_challans tile in NavigationMenuHubView', () => {
      const onNavigate = vi.fn();
      act(() => {
        root.render(
          <NavigationMenuHubView
            company={mockCompany}
            invoices={[]}
            purchases={[]}
            items={[]}
            parties={[mockSupplier]}
            expenses={[]}
            vouchers={[]}
            onNavigate={onNavigate}
          />
        );
      });

      const card = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Purchase Challans (GRN)')
      );
      expect(card).toBeTruthy();

      act(() => {
        card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onNavigate).toHaveBeenCalledWith('purchase_challans');
    });
  });

  // =========================================================================
  // 6. PurchaseChallansView UI Component
  // =========================================================================
  describe('6. PurchaseChallansView UI & Interaction', () => {
    const mockChallan: PurchaseBill = {
      id: 'pch_ui_1',
      billNumber: 'PCH-2026-0050',
      purchaseType: 'CHALLAN',
      challanStatus: 'RECEIVED',
      date: '2026-10-22',
      supplierId: mockSupplier.id,
      supplierName: mockSupplier.name,
      supplierAddress: '42 Vendor Park, Chakan, MH',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      vehicleNumber: 'MH14XY5555',
      transporterName: 'Navata Road Transport',
      lrNumber: 'LR-8877',
      ewayBillNumber: '998877665544',
      items: [
        {
          itemId: 'item_101',
          name: 'Steel Ball Bearings 6204',
          hsnSacCode: '848210',
          unit: 'PCS',
          quantity: 40,
          unitPrice: 100,
          taxableAmount: 4000,
          gstRate: 18,
          cgstAmount: 360,
          sgstAmount: 360,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 4720,
        },
      ],
      itcEligibility: 'ELIGIBLE_INPUTS',
      isRcm: false,
      totalGrossAmount: 4000,
      totalDiscount: 0,
      totalTaxableAmount: 4000,
      totalCgst: 360,
      totalSgst: 360,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 720,
      roundOff: 0,
      grandTotal: 4720,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      paidAmount: 0,
      balanceAmount: 0,
      createdAt: '2026-10-22T12:00:00Z',
      updatedAt: '2026-10-22T12:00:00Z',
    };

    it('renders PurchaseChallansView with metrics, transport details and action buttons', () => {
      const onNewChallan = vi.fn();
      const onView = vi.fn();
      const onEdit = vi.fn();
      const onDelete = vi.fn();

      act(() => {
        root.render(
          <PurchaseChallansView
            company={mockCompany}
            purchases={[mockChallan]}
            onNewPurchaseChallan={onNewChallan}
            onViewPurchase={onView}
            onEditPurchase={onEdit}
            onDeletePurchase={onDelete}
          />
        );
      });

      expect(container.textContent).toContain('Purchase Challans (GRN)');
      expect(container.textContent).toContain('PCH-2026-0050');
      expect(container.textContent).toContain(mockSupplier.name);
      expect(container.textContent).toContain('MH14XY5555');
      expect(container.textContent).toContain('Navata Road Transport');
      expect(container.textContent).toContain('In Stock');
      expect(container.textContent).toContain('4,720');

      // Click "Convert to Bill" button opens confirmation modal
      const convertBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Convert to Bill')
      );
      expect(convertBtn).toBeTruthy();

      act(() => {
        convertBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Convert to Purchase Bill?');
      expect(container.textContent).toContain('Convert Now');
    });

    it('renders SimplifiedPurchaseModal in GRN mode for Purchase Challan', () => {
      const onClose = vi.fn();
      act(() => {
        root.render(
          <SimplifiedPurchaseModal
            bill={mockChallan}
            company={mockCompany}
            onClose={onClose}
          />
        );
      });

      expect(container.textContent).toContain('Challan #PCH-2026-0050');
      expect(container.textContent).toContain('Goods Receipt Note (GRN)');
      expect(container.textContent).toContain('Inward Stock Recorded');
      expect(container.textContent).toContain('MH14XY5555');
      expect(container.textContent).not.toContain('Fully Settled'); // Not marked as settled payment
    });
  });
});
