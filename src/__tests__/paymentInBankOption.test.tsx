import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecordPaymentModal } from '../components/Parties/RecordPaymentModal.tsx';
import { Party } from '../models/party.ts';
import { BankAccount } from '../models/bankAccount.ts';
import { db } from '../services/db.ts';
import { createPaymentReceiptVoucher, createPaymentOutVoucher, validateVoucherBalance } from '../core/accounting/ledger.ts';
import { computeCashBankSummary } from '../core/accounting/cashBankCalculator.ts';

// Setup Mock Environment
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Payment In / Out: Bank Account Selection & Dropdown Redesign', () => {
  let container: HTMLDivElement;
  let root: any;

  const mockParty: Party = {
    id: 'PTY-101',
    name: 'Ramesh Patel',
    type: 'CUSTOMER',
    phone: '9876543210',
    currentBalance: 5000,
    stateCode: '27',
    billingAddress: '123 Market Rd, Pune',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockBankAccounts: BankAccount[] = [
    {
      id: 'ACC_BANK_HDFC',
      accountName: 'HDFC Corporate Current A/C',
      accountType: 'BANK',
      bankName: 'HDFC Bank',
      accountNumber: '50200012345678',
      ifscCode: 'HDFC0001234',
      openingBalance: 15000,
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'ACC_BANK_SBI',
      accountName: 'SBI Savings A/C',
      accountType: 'BANK',
      bankName: 'State Bank of India',
      accountNumber: '3210987654321',
      ifscCode: 'SBIN0004321',
      openingBalance: 50000,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'ACC_CASH',
      accountName: 'Cash in Hand',
      accountType: 'CASH',
      openingBalance: 10000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(db, 'getBankAccounts').mockReturnValue(mockBankAccounts);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('1. Verifies Full Due and 50% quick chips are removed from modal', () => {
    act(() => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          party={mockParty}
          liveNetBalance={5000}
          isCustomer={true}
          bankAccounts={mockBankAccounts}
          onRecordPayment={vi.fn()}
        />
      );
    });

    const modalText = container.textContent || '';
    expect(modalText).not.toContain('Full Due');
    expect(modalText).not.toContain('50%');
  });

  it('2. Renders Payment Mode as a dropdown instead of buttons', () => {
    act(() => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          party={mockParty}
          liveNetBalance={5000}
          isCustomer={true}
          bankAccounts={mockBankAccounts}
          onRecordPayment={vi.fn()}
        />
      );
    });

    const modeSelect = container.querySelector('#payment-mode-select') as HTMLSelectElement;
    expect(modeSelect).not.toBeNull();
    expect(modeSelect.tagName).toBe('SELECT');

    const options = Array.from(modeSelect.options).map((opt) => opt.value);
    expect(options).toContain('UPI');
    expect(options).toContain('CASH');
    expect(options).toContain('BANK');
    expect(options).toContain('SPLIT');
  });

  it('3. Does NOT show bank account dropdown when payment mode is UPI or CASH', () => {
    act(() => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          party={mockParty}
          liveNetBalance={5000}
          isCustomer={true}
          bankAccounts={mockBankAccounts}
          onRecordPayment={vi.fn()}
        />
      );
    });

    const modeSelect = container.querySelector('#payment-mode-select') as HTMLSelectElement;
    expect(modeSelect.value).toBe('UPI');

    const bankSelect = container.querySelector('#bank-account-select');
    expect(bankSelect).toBeNull();
  });

  it('4. Shows bank account dropdown side-by-side next to payment mode when BANK is selected', () => {
    act(() => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          party={mockParty}
          liveNetBalance={5000}
          isCustomer={true}
          bankAccounts={mockBankAccounts}
          onRecordPayment={vi.fn()}
        />
      );
    });

    const modeSelect = container.querySelector('#payment-mode-select') as HTMLSelectElement;
    act(() => {
      modeSelect.value = 'BANK';
      modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Bank Account dropdown is now visible
    const bankSelect = container.querySelector('#bank-account-select') as HTMLSelectElement;
    expect(bankSelect).not.toBeNull();
    expect(bankSelect.tagName).toBe('SELECT');

    // Check options in bank account dropdown
    const bankOptions = Array.from(bankSelect.options).map((opt) => ({
      value: opt.value,
      text: opt.textContent?.trim(),
    }));

    expect(bankOptions).toHaveLength(2); // Only BANK type accounts (HDFC, SBI), excluded CASH
    expect(bankOptions.some((b) => b.value === 'ACC_BANK_HDFC')).toBe(true);
    expect(bankOptions.some((b) => b.value === 'ACC_BANK_SBI')).toBe(true);
    expect(bankOptions.some((b) => b.value === 'ACC_CASH')).toBe(false);

    // Verifies parent grid is 2-column layout to place them side by side and save space
    const gridContainer = modeSelect.closest('.grid');
    expect(gridContainer?.className).toContain('grid-cols-2');
  });

  it('5. Submitting payment with BANK selected passes chosen bankAccountId to onRecordPayment', () => {
    const onRecordPaymentMock = vi.fn();

    act(() => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          party={mockParty}
          liveNetBalance={5000}
          isCustomer={true}
          bankAccounts={mockBankAccounts}
          onRecordPayment={onRecordPaymentMock}
        />
      );
    });

    const modeSelect = container.querySelector('#payment-mode-select') as HTMLSelectElement;
    act(() => {
      modeSelect.value = 'BANK';
      modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const bankSelect = container.querySelector('#bank-account-select') as HTMLSelectElement;
    act(() => {
      bankSelect.value = 'ACC_BANK_SBI';
      bankSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onRecordPaymentMock).toHaveBeenCalledTimes(1);
    expect(onRecordPaymentMock).toHaveBeenCalledWith(
      mockParty,
      5000,
      'BANK',
      expect.stringContaining('Bank: SBI Savings A/C'),
      'IN',
      undefined,
      0,
      'ACC_BANK_SBI'
    );
  });

  it('6. Double-entry accounting vouchers properly credit / debit selected bank account', () => {
    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-21',
      customerName: 'Ramesh Patel',
      customerId: 'PTY-101',
      amount: 4000,
      discount: 0,
      paymentMode: 'BANK',
      bankAccountId: 'ACC_BANK_SBI',
      bankAccountName: 'SBI Savings A/C',
    });

    expect(voucher.voucherType).toBe('RECEIPT');
    const balance = validateVoucherBalance(voucher.entries);
    expect(balance.isBalanced).toBe(true);

    const bankEntry = voucher.entries.find((e) => e.accountId === 'ACC_BANK_SBI');
    expect(bankEntry).toBeDefined();
    expect(bankEntry?.debit).toBe(4000);
    expect(bankEntry?.accountName).toBe('SBI Savings A/C');

    // Also verify computeCashBankSummary ledger entry assignment
    const summary = computeCashBankSummary({
      accounts: mockBankAccounts,
      invoices: [],
      purchases: [],
      expenses: [],
      vouchers: [voucher],
      transactions: [],
    });

    expect(summary.accountBalances['ACC_BANK_SBI']).toBe(50000 + 4000);
    expect(summary.accountBalances['ACC_BANK_HDFC']).toBe(15000); // Unaffected
  });

  it('7. Payment Out voucher with bank account correctly debits supplier and credits specific bank', () => {
    const voucher = createPaymentOutVoucher({
      date: '2026-10-21',
      supplierName: 'National Distributors',
      supplierId: 'SUPP-202',
      amount: 7500,
      discount: 0,
      paymentMode: 'BANK',
      bankAccountId: 'ACC_BANK_HDFC',
      bankAccountName: 'HDFC Corporate Current A/C',
    });

    expect(voucher.voucherType).toBe('PAYMENT');
    const balance = validateVoucherBalance(voucher.entries);
    expect(balance.isBalanced).toBe(true);

    const bankEntry = voucher.entries.find((e) => e.accountId === 'ACC_BANK_HDFC');
    expect(bankEntry).toBeDefined();
    expect(bankEntry?.credit).toBe(7500);

    const summary = computeCashBankSummary({
      accounts: mockBankAccounts,
      invoices: [],
      purchases: [],
      expenses: [],
      vouchers: [voucher],
      transactions: [],
    });

    expect(summary.accountBalances['ACC_BANK_HDFC']).toBe(15000 - 7500);
  });
});
