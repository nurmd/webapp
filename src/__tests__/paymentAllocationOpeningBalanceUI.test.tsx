import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RecordPaymentModal } from '../components/Parties/RecordPaymentModal.tsx';
import { PaymentTransactionsView } from '../components/Payments/PaymentTransactionsView.tsx';
import { Party } from '../models/party.ts';
import { Invoice } from '../models/invoice.ts';
import { BankAccount } from '../models/bankAccount.ts';
import { CompanyProfile } from '../models/company.ts';
import { createPaymentReceiptVoucher } from '../core/accounting/ledger.ts';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Acme Enterprises',
  gstin: '27AABCA1234A1Z5',
  pan: 'AABCA1234A',
  email: 'info@acme.com',
  phone: '9999999999',
  address: '123 Market St',
  pincode: '400001',
  stateCode: '27',
  isGstEnabled: true,
};

const mockAccounts: BankAccount[] = [
  {
    id: 'ACC_CASH',
    accountName: 'Cash-in-hand',
    accountType: 'CASH',
    openingBalance: 10000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'ACC_BANK_1',
    accountName: 'HDFC Bank',
    accountType: 'BANK',
    openingBalance: 20000,
    isDefault: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

const customerWithOpeningBal: Party = {
  id: 'CUST-OP-UI-01',
  name: 'Suresh Patel',
  type: 'CUSTOMER',
  phone: '9876543210',
  billingAddress: 'Ahmedabad',
  stateCode: '24',
  openingBalance: 4500,
  openingBalanceType: 'TO_RECEIVE',
  openingBalanceDate: '2026-07-01',
  currentBalance: 4500,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('Opening Balance Payment Allocation UI', () => {
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
    vi.restoreAllMocks();
  });

  it('RecordPaymentModal displays "Opening Balance" cleanly (without # prefix) and allocates against it', async () => {
    const handleRecordPayment = vi.fn().mockReturnValue(true);
    const handleClose = vi.fn();

    await act(async () => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={handleClose}
          party={customerWithOpeningBal}
          parties={[customerWithOpeningBal]}
          invoices={[]}
          bankAccounts={mockAccounts}
          onRecordPayment={handleRecordPayment}
          initialPaymentType="IN"
        />
      );
    });

    // Verify document list displays "Opening Balance" without "#"
    expect(container.textContent).toContain('Opening Balance');
    expect(container.textContent).not.toContain('#Opening Balance');
    expect(container.textContent).toContain('₹ 4,500.00');

    // Submit payment
    const form = container.querySelector('form') as HTMLFormElement;
    expect(form).not.toBeNull();

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(handleRecordPayment).toHaveBeenCalledTimes(1);
    const args = handleRecordPayment.mock.calls[0];
    const party = args[0];
    const amount = args[1];
    const allocations = args[8];

    expect(party.id).toBe(customerWithOpeningBal.id);
    expect(amount).toBe(4500);
    expect(allocations).toBeDefined();
    expect(allocations).toHaveLength(1);
    expect(allocations[0].documentId).toBe(`OPENING-BALANCE-${customerWithOpeningBal.id}`);
    expect(allocations[0].documentNumber).toBe('Opening Balance');
    expect(allocations[0].amount).toBe(4500);
  });

  it('PaymentTransactionsView renders non-clickable "Opening Balance" badge and suppresses "Unallocated Advance"', async () => {
    // Create voucher with opening balance allocation
    const voucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-OB-01',
      date: '2026-08-01',
      customerName: customerWithOpeningBal.name,
      customerId: customerWithOpeningBal.id,
      amount: 4500,
      paymentMode: 'UPI',
      narration: 'Settlement for opening balance',
    });
    voucher.partyId = customerWithOpeningBal.id;
    voucher.partyName = customerWithOpeningBal.name;
    voucher.allocationMode = 'MANUAL';
    voucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: `OPENING-BALANCE-${customerWithOpeningBal.id}`,
        documentNumber: 'Opening Balance',
        amount: 4500,
        date: '2026-07-01',
      },
    ];

    await act(async () => {
      root.render(
        <PaymentTransactionsView
          flow="IN"
          company={mockCompany}
          accounts={mockAccounts}
          transactions={[]}
          invoices={[]}
          purchases={[]}
          expenses={[]}
          vouchers={[voucher]}
          onSaveTransaction={vi.fn()}
          onDeleteTransaction={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const content = container.textContent || '';
    expect(content).toContain('Suresh Patel');
    expect(content).toContain('Linked to:');
    expect(content).toContain('Opening Balance');
    expect(content).toContain('(₹ 4,500.00)');

    // It must NOT display "Unallocated Advance" or "Advance:" because it was allocated to Opening Balance
    expect(content).not.toContain('Unallocated Advance');
    expect(content).not.toContain('Advance:');
  });
});
