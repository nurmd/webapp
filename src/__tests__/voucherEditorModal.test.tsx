// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Mock Storage
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
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: testStorage,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: testStorage,
    writable: true,
    configurable: true,
  });
}

const inMemoryDocs = new Map<string, any>();
vi.mock('../services/pouchdb.ts', () => ({
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
    onDataChange: vi.fn(() => () => {}),
    notifyDataChange: vi.fn(),
    getState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

import { db } from '../services/db.ts';
import { Party } from '../models/party.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { VoucherEditorModal } from '../components/Parties/VoucherEditorModal.tsx';

const sampleCustomer: Party = {
  id: 'PTY-VEM-01',
  name: 'Acme Enterprises',
  type: 'CUSTOMER',
  phone: '9876543210',
  stateCode: '27',
  billingAddress: '123 Market Road, Mumbai',
  currentBalance: 5000,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('VoucherEditorModal Component-Level Verification', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    testStorage.clear();
    inMemoryDocs.clear();
    db.saveParty(sampleCustomer);
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
    vi.restoreAllMocks();
  });

  it('1. SOURCE_DOCUMENT amount change shows blocking alert and does NOT call savePaymentVoucher', () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const saveVoucherSpy = vi.spyOn(db, 'savePaymentVoucher');

    const sourceVoucher: Voucher = {
      id: 'VCH-SRC-01',
      voucherNumber: 'INV-1001',
      voucherType: 'RECEIPT',
      date: '2026-10-01',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 2000,
      narration: 'Upfront payment for INV-1001',
      allocationMode: 'SOURCE_DOCUMENT',
      sourceDocumentType: 'INVOICE',
      sourceDocumentId: 'INV-1001',
      sourceDocumentNumber: '1001',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: 'INV-1001',
          documentNumber: '1001',
          amount: 2000,
          date: '2026-10-01',
        },
      ],
      entries: [
        {
          accountId: 'ACC_CASH',
          accountName: 'Cash-in-hand',
          debit: 2000,
          credit: 0,
        },
        {
          accountId: sampleCustomer.id,
          accountName: sampleCustomer.name,
          debit: 0,
          credit: 2000,
        },
      ],
      createdAt: '2026-10-01T00:00:00.000Z',
    };

    const ledgerEntry = {
      id: sourceVoucher.id,
      date: sourceVoucher.date,
      docNumber: sourceVoucher.voucherNumber,
      type: 'PAYMENT_IN' as const,
      description: sourceVoucher.narration,
      debit: 0,
      credit: 2000,
      runningBalance: 3000,
      status: 'PAID',
      rawVoucher: sourceVoucher,
    };

    act(() => {
      root!.render(
        <VoucherEditorModal
          party={sampleCustomer}
          editingLedgerEntry={ledgerEntry as any}
          onClose={() => {}}
          onRefresh={() => {}}
        />
      );
    });

    const amountInput = container!.querySelector('input[type="number"]') as HTMLInputElement;
    expect(amountInput).not.toBeNull();
    expect(amountInput.value).toBe('2000');

    // Change amount from 2000 to 2500
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(amountInput, '2500');
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = container!.querySelector('form');
    expect(form).not.toBeNull();

    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // Blocking alert is shown
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock.mock.calls[0][0]).toContain('Cannot change the amount of an upfront payment voucher directly');

    // db.savePaymentVoucher was NOT called
    expect(saveVoucherSpy).not.toHaveBeenCalled();
  });

  it('2. SOURCE_DOCUMENT date/narration-only edit saves and updates allocation dates', () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const saveVoucherSpy = vi.spyOn(db, 'savePaymentVoucher');

    const sourceVoucher: Voucher = {
      id: 'VCH-SRC-02',
      voucherNumber: 'INV-1002',
      voucherType: 'RECEIPT',
      date: '2026-10-01',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 1500,
      narration: 'Initial upfront note',
      allocationMode: 'SOURCE_DOCUMENT',
      sourceDocumentType: 'INVOICE',
      sourceDocumentId: 'INV-1002',
      sourceDocumentNumber: '1002',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: 'INV-1002',
          documentNumber: '1002',
          amount: 1500,
          date: '2026-10-01',
        },
      ],
      entries: [
        {
          accountId: 'ACC_CASH',
          accountName: 'Cash-in-hand',
          debit: 1500,
          credit: 0,
        },
        {
          accountId: sampleCustomer.id,
          accountName: sampleCustomer.name,
          debit: 0,
          credit: 1500,
        },
      ],
      createdAt: '2026-10-01T00:00:00.000Z',
    };

    // Save linked invoice in DB so savePaymentVoucher allocation validation passes
    const inv1002: any = {
      id: 'INV-1002',
      invoiceNumber: '1002',
      invoiceType: 'B2B',
      date: '2026-10-01',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      partyAddress: sampleCustomer.billingAddress,
      partyStateCode: sampleCustomer.stateCode,
      placeOfSupplyStateCode: sampleCustomer.stateCode,
      isIntraState: true,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
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
      paidAmount: 1500,
      balanceAmount: 0,
      amountInWords: 'One Thousand Five Hundred Only',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    db.saveInvoice(inv1002);
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });
    saveVoucherSpy.mockClear();

    const ledgerEntry = {
      id: sourceVoucher.id,
      date: sourceVoucher.date,
      docNumber: sourceVoucher.voucherNumber,
      type: 'PAYMENT_IN' as const,
      description: sourceVoucher.narration,
      debit: 0,
      credit: 1500,
      runningBalance: 3500,
      status: 'PAID',
      rawVoucher: sourceVoucher,
    };

    act(() => {
      root!.render(
        <VoucherEditorModal
          party={sampleCustomer}
          editingLedgerEntry={ledgerEntry as any}
          onClose={() => {}}
          onRefresh={() => {}}
        />
      );
    });

    // Update Date to 2026-10-15
    const dateInput = container!.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).not.toBeNull();
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(dateInput, '2026-10-15');
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Update Narration / Remarks
    const notesInput = container!.querySelector('input[placeholder="Remarks..."]') as HTMLInputElement;
    expect(notesInput).not.toBeNull();
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(notesInput, 'Updated upfront note');
      notesInput.dispatchEvent(new Event('input', { bubbles: true }));
      notesInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = container!.querySelector('form');
    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(alertMock).not.toHaveBeenCalled();
    expect(saveVoucherSpy).toHaveBeenCalledTimes(1);

    const savedVoucher: Voucher = saveVoucherSpy.mock.calls[0][0];
    expect(savedVoucher.totalAmount).toBe(1500);
    expect(savedVoucher.date).toBe('2026-10-15');
    expect(savedVoucher.narration).toBe('Updated upfront note');
    expect(savedVoucher.allocationMode).toBe('SOURCE_DOCUMENT');
    expect(savedVoucher.paymentAllocations).toHaveLength(1);
    expect(savedVoucher.paymentAllocations![0].date).toBe('2026-10-15');
    expect(savedVoucher.paymentAllocations![0].amount).toBe(1500);
  });

  it('3. Non-source voucher with allocations whose total changes is saved with allocationMode MANUAL', () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const saveVoucherSpy = vi.spyOn(db, 'savePaymentVoucher');

    const nonSourceVoucher: Voucher = {
      id: 'VCH-AUTO-01',
      voucherNumber: 'RCPT-AUTO-01',
      voucherType: 'RECEIPT',
      date: '2026-10-01',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 2000,
      narration: 'FIFO receipt',
      allocationMode: 'AUTO_FIFO',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: 'INV-OTHER-01',
          documentNumber: 'OTHER-01',
          amount: 1500,
          date: '2026-10-01',
        },
      ],
      entries: [
        {
          accountId: 'ACC_CASH',
          accountName: 'Cash-in-hand',
          debit: 2000,
          credit: 0,
        },
        {
          accountId: sampleCustomer.id,
          accountName: sampleCustomer.name,
          debit: 0,
          credit: 2000,
        },
      ],
      createdAt: '2026-10-01T00:00:00.000Z',
    };

    // Save linked invoice in DB
    const otherInv: any = {
      id: 'INV-OTHER-01',
      invoiceNumber: 'OTHER-01',
      invoiceType: 'B2B',
      date: '2026-10-01',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      partyAddress: sampleCustomer.billingAddress,
      partyStateCode: sampleCustomer.stateCode,
      placeOfSupplyStateCode: sampleCustomer.stateCode,
      isIntraState: true,
      paymentMode: 'CASH',
      paymentStatus: 'PARTIAL',
      items: [],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 5000,
      paidAmount: 1500,
      balanceAmount: 3500,
      amountInWords: 'Five Thousand Only',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    db.saveInvoice(otherInv);
    db.savePaymentVoucher(nonSourceVoucher, { skipDocumentUpdate: true });
    saveVoucherSpy.mockClear();

    const ledgerEntry = {
      id: nonSourceVoucher.id,
      date: nonSourceVoucher.date,
      docNumber: nonSourceVoucher.voucherNumber,
      type: 'PAYMENT_IN' as const,
      description: nonSourceVoucher.narration,
      debit: 0,
      credit: 2000,
      runningBalance: 3000,
      status: 'PAID',
      rawVoucher: nonSourceVoucher,
    };

    act(() => {
      root!.render(
        <VoucherEditorModal
          party={sampleCustomer}
          editingLedgerEntry={ledgerEntry as any}
          onClose={() => {}}
          onRefresh={() => {}}
        />
      );
    });

    const amountInput = container!.querySelector('input[type="number"]') as HTMLInputElement;
    expect(amountInput).not.toBeNull();

    // Increase total from 2000 to 2500
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(amountInput, '2500');
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = container!.querySelector('form');
    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(alertMock).not.toHaveBeenCalled();
    expect(saveVoucherSpy).toHaveBeenCalledTimes(1);

    const savedVoucher: Voucher = saveVoucherSpy.mock.calls[0][0];
    expect(savedVoucher.totalAmount).toBe(2500);
    // Mode transitions from AUTO_FIFO to MANUAL because it still has allocations
    expect(savedVoucher.allocationMode).toBe('MANUAL');
    expect(savedVoucher.paymentAllocations).toHaveLength(1);
    expect(savedVoucher.paymentAllocations![0].amount).toBe(1500);
  });

  it('4. Non-source voucher with no allocations plus total change becomes UNALLOCATED', () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const saveVoucherSpy = vi.spyOn(db, 'savePaymentVoucher');

    const unallocatedVoucher: Voucher = {
      id: 'VCH-UNALLOC-01',
      voucherNumber: 'RCPT-UNALLOC-01',
      voucherType: 'RECEIPT',
      date: '2026-10-01',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 1000,
      narration: 'Advance payment',
      allocationMode: 'MANUAL',
      paymentAllocations: [],
      entries: [
        {
          accountId: 'ACC_CASH',
          accountName: 'Cash-in-hand',
          debit: 1000,
          credit: 0,
        },
        {
          accountId: sampleCustomer.id,
          accountName: sampleCustomer.name,
          debit: 0,
          credit: 1000,
        },
      ],
      createdAt: '2026-10-01T00:00:00.000Z',
    };

    const ledgerEntry = {
      id: unallocatedVoucher.id,
      date: unallocatedVoucher.date,
      docNumber: unallocatedVoucher.voucherNumber,
      type: 'PAYMENT_IN' as const,
      description: unallocatedVoucher.narration,
      debit: 0,
      credit: 1000,
      runningBalance: 4000,
      status: 'PAID',
      rawVoucher: unallocatedVoucher,
    };

    act(() => {
      root!.render(
        <VoucherEditorModal
          party={sampleCustomer}
          editingLedgerEntry={ledgerEntry as any}
          onClose={() => {}}
          onRefresh={() => {}}
        />
      );
    });

    const amountInput = container!.querySelector('input[type="number"]') as HTMLInputElement;
    expect(amountInput).not.toBeNull();

    // Increase total from 1000 to 1800
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(amountInput, '1800');
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = container!.querySelector('form');
    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(alertMock).not.toHaveBeenCalled();
    expect(saveVoucherSpy).toHaveBeenCalledTimes(1);

    const savedVoucher: Voucher = saveVoucherSpy.mock.calls[0][0];
    expect(savedVoucher.totalAmount).toBe(1800);
    // Mode becomes UNALLOCATED because allocations array is empty
    expect(savedVoucher.allocationMode).toBe('UNALLOCATED');
    expect(savedVoucher.paymentAllocations).toHaveLength(0);
  });
});
