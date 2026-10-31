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

import { db } from '../services/db.ts';
import { Party } from '../models/party.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Invoice } from '../models/invoice.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../models/company.ts';
import { PartyDetailPage } from '../components/Parties/PartyDetailPage.tsx';
import { usePartyPassbook } from '../components/Parties/usePartyPassbook.ts';
import { formatINR } from '../core/utils/formatters.ts';

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

const mockCompany: CompanyProfile = {
  id: 'COMP-TEST-001',
  businessName: 'Super Mart Supplies',
  tradeName: 'Super Mart',
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  phone: '9876543210',
  email: 'test@supermart.com',
  stateCode: '27',
  address: '123 Market Street, Pune',
  pincode: '411001',
  isGstEnabled: true,
};

describe('Supplier Detail: Transactions / Orders tabs spec', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockStorage.clear();
    inMemoryDocs.clear();
    vi.clearAllMocks();
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

  it('Test A — supplier Transactions/Orders split', async () => {
    const supplier: Party = {
      id: 'SUP-001',
      name: 'Acme Supplies',
      type: 'SUPPLIER',
      phone: '9876543210',
      billingAddress: 'Industrial Area, Pune',
      stateCode: '27',
      currentBalance: 0,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    };
    db.saveParty(supplier);

    const billB1: PurchaseBill = {
      id: 'PUR-B1',
      billNumber: 'B1',
      date: '2026-04-01',
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierAddress: supplier.billingAddress,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          name: 'Item A',
          hsnSacCode: '1001',
          unit: 'NOS',
          quantity: 10,
          unitPrice: 100,
          taxableAmount: 1000,
          gstRate: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 1000,
        },
      ],
      itcEligibility: 'ALL_OTHER_ITC',
      isRcm: false,
      totalGrossAmount: 1000,
      totalDiscount: 0,
      totalTaxableAmount: 1000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1000,
      paymentMode: 'CASH',
      paymentStatus: 'PARTIAL',
      paidAmount: 200,
      balanceAmount: 800,
      purchaseType: 'BILL',
      createdAt: '2026-04-01T10:00:00Z',
      updatedAt: '2026-04-01T10:00:00Z',
    };
    db.savePurchase(billB1);

    const poP1: PurchaseBill = {
      ...billB1,
      id: 'PO-P1',
      billNumber: 'P1',
      date: '2026-04-02',
      grandTotal: 5000,
      paidAmount: 0,
      balanceAmount: 5000,
      purchaseType: 'PO',
      orderStatus: 'PENDING',
      isConverted: false,
      createdAt: '2026-04-02T10:00:00Z',
      updatedAt: '2026-04-02T10:00:00Z',
    };
    db.savePurchase(poP1);

    const grnG1: PurchaseBill = {
      ...billB1,
      id: 'GRN-G1',
      billNumber: 'G1',
      date: '2026-04-03',
      grandTotal: 3000,
      paidAmount: 0,
      balanceAmount: 3000,
      purchaseType: 'CHALLAN',
      challanStatus: 'RECEIVED',
      isConverted: false,
      createdAt: '2026-04-03T10:00:00Z',
      updatedAt: '2026-04-03T10:00:00Z',
    };
    db.savePurchase(grnG1);

    const poP2: PurchaseBill = {
      ...billB1,
      id: 'PO-P2',
      billNumber: 'P2',
      date: '2026-04-04',
      grandTotal: 2000,
      paidAmount: 0,
      balanceAmount: 2000,
      purchaseType: 'PO',
      orderStatus: 'FULFILLED',
      isConverted: true,
      convertedToBillNumber: 'PUR-009',
      createdAt: '2026-04-04T10:00:00Z',
      updatedAt: '2026-04-04T10:00:00Z',
    };
    db.savePurchase(poP2);

    const grnG2: PurchaseBill = {
      ...billB1,
      id: 'GRN-G2',
      billNumber: 'G2',
      date: '2026-04-05',
      grandTotal: 700,
      paidAmount: 0,
      balanceAmount: 700,
      purchaseType: 'CHALLAN',
      isCancelled: true,
      challanStatus: 'CANCELLED',
      createdAt: '2026-04-05T10:00:00Z',
      updatedAt: '2026-04-05T10:00:00Z',
    };
    db.savePurchase(grnG2);

    const paymentVoucher: Voucher = {
      id: 'VCH-001',
      voucherNumber: 'PAY-001',
      voucherType: 'PAYMENT',
      date: '2026-04-06',
      narration: 'Payment made to supplier',
      partyId: supplier.id,
      partyName: supplier.name,
      totalAmount: 300,
      entries: [
        {
          accountId: supplier.id,
          accountName: supplier.name,
          debit: 300,
          credit: 0,
        },
        {
          accountId: 'ACC_CASH',
          accountName: 'Cash',
          debit: 0,
          credit: 300,
        },
      ],
      paymentAllocations: [
        {
          documentId: billB1.id,
          documentNumber: billB1.billNumber,
          documentType: 'PURCHASE',
          amount: 300,
          date: '2026-04-06',
        },
      ],
      createdAt: '2026-04-06T10:00:00Z',
    };
    db.savePaymentVoucher(paymentVoucher);

    const onEditPurchase = vi.fn();

    await act(async () => {
      root.render(
        <PartyDetailPage
          party={supplier}
          company={mockCompany}
          invoices={[]}
          purchases={db.getPurchases()}
          vouchers={db.getVouchers()}
          onBack={vi.fn()}
          onEditParty={vi.fn()}
          onRecordPayment={vi.fn()}
          onEditPurchase={onEditPurchase}
        />
      );
    });

    // 1. Transactions tab is default
    const txnTab = container.querySelector('[data-testid="party-tab-transactions"]') as HTMLButtonElement;
    const ordersTab = container.querySelector('[data-testid="party-tab-orders"]') as HTMLButtonElement;
    expect(txnTab).not.toBeNull();
    expect(ordersTab).not.toBeNull();
    expect(txnTab.className).toContain('bg-surface-container-lowest');

    // 2. Transactions list shows Bill #B1 and Payment Out ₹300; does not show PO #P1, GRN #G1, PO #P2, or GRN #G2
    expect(container.textContent).toContain('#B1');
    expect(container.textContent).toContain('Payment Out');
    expect(container.textContent).toContain(formatINR(300));
    expect(container.textContent).not.toContain('PO #P1');
    expect(container.textContent).not.toContain('GRN #G1');
    expect(container.textContent).not.toContain('PO #P2');
    expect(container.textContent).not.toContain('GRN #G2');

    // 3. You'll Pay is ₹500
    expect(container.textContent).toContain("You'll Pay");
    expect(container.textContent).toContain(formatINR(500));

    // 4. (Unbilled ₹8,000) is visible
    expect(container.textContent).toContain(`(Unbilled ${formatINR(8000)})`);

    // 5. Orders tab shows all four order documents, including the cancelled GRN
    await act(async () => {
      ordersTab.click();
    });

    expect(container.textContent).toContain('PO #P1');
    expect(container.textContent).toContain('GRN #G1');
    expect(container.textContent).toContain('PO #P2');
    expect(container.textContent).toContain('GRN #G2');

    // 6. Orders totals: PO Total ₹7,000, GRN Total ₹3,000, Unbilled ₹8,000
    expect(container.textContent).toContain(`PO Total ${formatINR(7000)}`);
    expect(container.textContent).toContain(`GRN Total ${formatINR(3000)}`);
    expect(container.textContent).toContain(`Unbilled ${formatINR(8000)}`);

    // 7. P2 shows Billed → #PUR-009; G2 shows Cancelled
    expect(container.textContent).toContain('Billed → #PUR-009');
    expect(container.textContent).toContain('Cancelled');

    // 8. Clicking P1 calls onEditPurchase with P1
    const p1Row = container.querySelector(`[data-testid="party-order-row-${poP1.id}"]`) as HTMLElement;
    expect(p1Row).not.toBeNull();
    await act(async () => {
      p1Row.click();
    });
    expect(onEditPurchase).toHaveBeenCalledTimes(1);
    expect(onEditPurchase).toHaveBeenCalledWith(expect.objectContaining({ id: poP1.id, billNumber: 'P1' }));
  });

  it('Test B — cancelled bill and return', async () => {
    const supplier: Party = {
      id: 'SUP-002',
      name: 'Delta Traders',
      type: 'SUPPLIER',
      phone: '9876543211',
      billingAddress: 'Nashik Road, Pune',
      stateCode: '27',
      currentBalance: 0,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    };
    db.saveParty(supplier);

    const billB1: PurchaseBill = {
      id: 'PUR-B1-2',
      billNumber: 'B1',
      date: '2026-04-01',
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierAddress: supplier.billingAddress,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      itcEligibility: 'ALL_OTHER_ITC',
      isRcm: false,
      totalGrossAmount: 1000,
      totalDiscount: 0,
      totalTaxableAmount: 1000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1000,
      paymentMode: 'CASH',
      paymentStatus: 'PARTIAL',
      paidAmount: 200,
      balanceAmount: 800,
      purchaseType: 'BILL',
      createdAt: '2026-04-01T10:00:00Z',
      updatedAt: '2026-04-01T10:00:00Z',
    };
    db.savePurchase(billB1);

    const billB2: PurchaseBill = {
      ...billB1,
      id: 'PUR-B2-CANCELLED',
      billNumber: 'B2',
      date: '2026-04-02',
      grandTotal: 900,
      paidAmount: 0,
      balanceAmount: 900,
      isCancelled: true,
      purchaseType: 'BILL',
      createdAt: '2026-04-02T10:00:00Z',
      updatedAt: '2026-04-02T10:00:00Z',
    };
    db.savePurchase(billB2);

    const returnR1: PurchaseBill = {
      ...billB1,
      id: 'PUR-R1',
      billNumber: 'R1',
      date: '2026-04-03',
      grandTotal: 400,
      paidAmount: 0,
      balanceAmount: 400,
      purchaseType: 'RETURN',
      returnReason: 'Damaged Goods',
      createdAt: '2026-04-03T10:00:00Z',
      updatedAt: '2026-04-03T10:00:00Z',
    };
    db.savePurchase(returnR1);

    const poP1: PurchaseBill = {
      ...billB1,
      id: 'PO-P1-2',
      billNumber: 'P1',
      date: '2026-04-04',
      grandTotal: 5000,
      paidAmount: 0,
      balanceAmount: 5000,
      purchaseType: 'PO',
      orderStatus: 'PENDING',
      isConverted: false,
      createdAt: '2026-04-04T10:00:00Z',
      updatedAt: '2026-04-04T10:00:00Z',
    };
    db.savePurchase(poP1);

    const grnG1: PurchaseBill = {
      ...billB1,
      id: 'GRN-G1-2',
      billNumber: 'G1',
      date: '2026-04-05',
      grandTotal: 3000,
      paidAmount: 0,
      balanceAmount: 3000,
      purchaseType: 'CHALLAN',
      challanStatus: 'RECEIVED',
      isConverted: false,
      createdAt: '2026-04-05T10:00:00Z',
      updatedAt: '2026-04-05T10:00:00Z',
    };
    db.savePurchase(grnG1);

    const paymentVoucher: Voucher = {
      id: 'VCH-002',
      voucherNumber: 'PAY-002',
      voucherType: 'PAYMENT',
      date: '2026-04-06',
      narration: 'Payment to supplier',
      partyId: supplier.id,
      partyName: supplier.name,
      totalAmount: 300,
      entries: [
        {
          accountId: supplier.id,
          accountName: supplier.name,
          debit: 300,
          credit: 0,
        },
        {
          accountId: 'ACC_CASH',
          accountName: 'Cash',
          debit: 0,
          credit: 300,
        },
      ],
      paymentAllocations: [
        {
          documentId: billB1.id,
          documentNumber: billB1.billNumber,
          documentType: 'PURCHASE',
          amount: 300,
          date: '2026-04-06',
        },
      ],
      createdAt: '2026-04-06T10:00:00Z',
    };
    db.savePaymentVoucher(paymentVoucher);

    await act(async () => {
      root.render(
        <PartyDetailPage
          party={supplier}
          company={mockCompany}
          invoices={[]}
          purchases={db.getPurchases()}
          vouchers={db.getVouchers()}
          onBack={vi.fn()}
          onEditParty={vi.fn()}
          onRecordPayment={vi.fn()}
        />
      );
    });

    // 1. Cancelled bill B2 is absent
    expect(container.textContent).not.toContain('Bill #B2');

    // 2. Return appears in Transactions as a debit/reduction
    expect(container.textContent).toContain('Return');
    expect(container.textContent).toContain('#R1');
    expect(container.textContent).toContain('Damaged Goods');
    expect(container.textContent).toContain(formatINR(400));

    // 3. Balance after bill 1000, bill-paid 200, payment 300, return 400 is ₹100 payable
    expect(container.textContent).toContain("You'll Pay");
    expect(container.textContent).toContain(formatINR(100));

    // 4. Return must not appear in Orders, and must not change PO/GRN totals
    const ordersTab = container.querySelector('[data-testid="party-tab-orders"]') as HTMLButtonElement;
    await act(async () => {
      ordersTab.click();
    });

    expect(container.textContent).not.toContain('Return #R1');
    expect(container.textContent).not.toContain('Purchase Return #R1');
    expect(container.textContent).toContain(`PO Total ${formatINR(5000)}`);
    expect(container.textContent).toContain(`GRN Total ${formatINR(3000)}`);
    expect(container.textContent).toContain(`Unbilled ${formatINR(8000)}`);
  });

  it('Test C — customer page unchanged', async () => {
    const customer: Party = {
      id: 'CUST-001',
      name: 'Ramesh Sharma',
      type: 'CUSTOMER',
      phone: '9876543212',
      billingAddress: 'FC Road, Pune',
      stateCode: '27',
      currentBalance: 0,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    };
    db.saveParty(customer);

    const invoice: Invoice = {
      id: 'INV-001',
      invoiceNumber: 'INV-001',
      invoiceType: 'B2CS',
      date: '2026-04-01',
      partyId: customer.id,
      partyName: customer.name,
      partyAddress: customer.billingAddress,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      totalGrossAmount: 1500,
      totalDiscount: 0,
      totalTaxableAmount: 1500,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1500,
      amountInWords: 'One Thousand Five Hundred',
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      paidAmount: 0,
      balanceAmount: 1500,
      createdAt: '2026-04-01T10:00:00Z',
      updatedAt: '2026-04-01T10:00:00Z',
    };
    db.saveInvoice(invoice);

    await act(async () => {
      root.render(
        <PartyDetailPage
          party={customer}
          company={mockCompany}
          invoices={[invoice]}
          purchases={[]}
          vouchers={[]}
          onBack={vi.fn()}
          onEditParty={vi.fn()}
          onRecordPayment={vi.fn()}
        />
      );
    });

    // 1. No party-tab-orders
    expect(container.querySelector('[data-testid="party-tab-orders"]')).toBeNull();
    expect(container.querySelector('[data-testid="party-tab-transactions"]')).toBeNull();

    // 2. No (Unbilled text
    expect(container.textContent).not.toContain('(Unbilled');

    // 3. Existing sale/transaction row and balance behaviour are unchanged
    expect(container.textContent).toContain('Invoice');
    expect(container.textContent).toContain('#INV-001');
    expect(container.textContent).toContain("You'll Receive");
    expect(container.textContent).toContain(formatINR(1500));
  });

  it('Test D — converted/cancelled unbilled exclusions', () => {
    const supplier: Party = {
      id: 'SUP-003',
      name: 'Omni Wholesale',
      type: 'SUPPLIER',
      phone: '9876543213',
      billingAddress: 'Marketyard, Pune',
      stateCode: '27',
      currentBalance: 0,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    };

    const purchases: PurchaseBill[] = [
      // 1. Normal active unbilled PO -> included in unbilledOrdersTotal
      {
        id: 'PO-ACTIVE-1',
        billNumber: 'PO-101',
        date: '2026-04-01',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 4000,
        totalDiscount: 0,
        totalTaxableAmount: 4000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 4000,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 4000,
        purchaseType: 'PO',
        orderStatus: 'PENDING',
        isConverted: false,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
      // 2. Converted PO -> excluded from unbilledOrdersTotal
      {
        id: 'PO-CONVERTED',
        billNumber: 'PO-102',
        date: '2026-04-02',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 2500,
        totalDiscount: 0,
        totalTaxableAmount: 2500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 2500,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 2500,
        purchaseType: 'PO',
        orderStatus: 'FULFILLED',
        isConverted: true,
        convertedToBillNumber: 'BILL-102',
        createdAt: '2026-04-02T10:00:00Z',
        updatedAt: '2026-04-02T10:00:00Z',
      },
      // 3. Cancelled PO (by flag) -> excluded from unbilledOrdersTotal
      {
        id: 'PO-CANCELLED-1',
        billNumber: 'PO-103',
        date: '2026-04-03',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1500,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1500,
        purchaseType: 'PO',
        isCancelled: true,
        orderStatus: 'PENDING',
        createdAt: '2026-04-03T10:00:00Z',
        updatedAt: '2026-04-03T10:00:00Z',
      },
      // 4. Cancelled PO (by orderStatus) -> excluded from unbilledOrdersTotal
      {
        id: 'PO-CANCELLED-2',
        billNumber: 'PO-104',
        date: '2026-04-04',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 1200,
        totalDiscount: 0,
        totalTaxableAmount: 1200,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1200,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1200,
        purchaseType: 'PO',
        orderStatus: 'CANCELLED',
        createdAt: '2026-04-04T10:00:00Z',
        updatedAt: '2026-04-04T10:00:00Z',
      },
      // 5. Active unbilled CHALLAN (GRN) -> included in unbilledOrdersTotal
      {
        id: 'GRN-ACTIVE-1',
        billNumber: 'GRN-201',
        date: '2026-04-05',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 3500,
        totalDiscount: 0,
        totalTaxableAmount: 3500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 3500,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 3500,
        purchaseType: 'CHALLAN',
        challanStatus: 'RECEIVED',
        isConverted: false,
        createdAt: '2026-04-05T10:00:00Z',
        updatedAt: '2026-04-05T10:00:00Z',
      },
      // 6. Converted CHALLAN -> excluded from unbilledOrdersTotal
      {
        id: 'GRN-CONVERTED',
        billNumber: 'GRN-202',
        date: '2026-04-06',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 1800,
        totalDiscount: 0,
        totalTaxableAmount: 1800,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1800,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1800,
        purchaseType: 'CHALLAN',
        challanStatus: 'RECEIVED',
        isConverted: true,
        convertedToBillNumber: 'BILL-202',
        createdAt: '2026-04-06T10:00:00Z',
        updatedAt: '2026-04-06T10:00:00Z',
      },
      // 7. Cancelled CHALLAN (by challanStatus) -> excluded from unbilledOrdersTotal
      {
        id: 'GRN-CANCELLED',
        billNumber: 'GRN-203',
        date: '2026-04-07',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 900,
        totalDiscount: 0,
        totalTaxableAmount: 900,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 900,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 900,
        purchaseType: 'CHALLAN',
        challanStatus: 'CANCELLED',
        createdAt: '2026-04-07T10:00:00Z',
        updatedAt: '2026-04-07T10:00:00Z',
      },
      // 8. Normal Purchase Bill -> never included in unbilledOrdersTotal
      {
        id: 'BILL-NORMAL',
        billNumber: 'BILL-301',
        date: '2026-04-08',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 10000,
        totalDiscount: 0,
        totalTaxableAmount: 10000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 10000,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 10000,
        purchaseType: 'BILL',
        createdAt: '2026-04-08T10:00:00Z',
        updatedAt: '2026-04-08T10:00:00Z',
      },
      // 9. Purchase Return -> never included in unbilledOrdersTotal
      {
        id: 'RETURN-1',
        billNumber: 'RET-401',
        date: '2026-04-09',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 500,
        totalDiscount: 0,
        totalTaxableAmount: 500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 500,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 500,
        purchaseType: 'RETURN',
        createdAt: '2026-04-09T10:00:00Z',
        updatedAt: '2026-04-09T10:00:00Z',
      },
    ];

    let hookResult: ReturnType<typeof usePartyPassbook> | null = null;
    function TestHookComponent() {
      hookResult = usePartyPassbook({
        party: supplier,
        company: mockCompany,
        purchases,
      });
      return null;
    }

    act(() => {
      root.render(<TestHookComponent />);
    });

    expect(hookResult).not.toBeNull();
    // Only PO-ACTIVE-1 (4000) and GRN-ACTIVE-1 (3500) are unbilled -> 7500
    expect(hookResult!.unbilledOrdersTotal).toBe(7500);

    // Active PO total = 4000 + 2500 = 6500 (converted PO is still an active PO)
    expect(hookResult!.purchaseOrderTotal).toBe(6500);

    // Active GRN total = 3500 + 1800 = 5300 (converted GRN is still an active GRN)
    expect(hookResult!.grnTotal).toBe(5300);

    // Total orders list contains all 7 PO/GRN documents (including cancelled & converted)
    expect(hookResult!.partyOrders.length).toBe(7);
  });
});
