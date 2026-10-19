import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CashBankTransactionDetailModal } from '../components/CashBank/CashBankTransactionDetailModal.tsx';
import { CashBankManagementView } from '../components/CashBank/CashBankManagementView.tsx';
import { BankStatementCategory } from '../components/Reports/categories/BankStatementCategory.tsx';
import { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../models/bankAccount.ts';
import { CompanyProfile } from '../models/company.ts';

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Bharat Traders',
  tradeName: 'Bharat Traders',
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  stateCode: '27',
  address: '123 Market Rd, Pune',
  pincode: '411001',
  phone: '9876543210',
  email: 'bharat@example.com',
  website: '',
  bankName: 'State Bank of India',
  accountNumber: '1234567890',
  ifscCode: 'SBIN0001234',
  upiId: 'bharat@sbi',
  termsAndConditions: '',
  invoicePrefix: 'INV',
  isGstEnabled: true,
};

const mockAccounts: BankAccount[] = [
  {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH',
    openingBalance: 10000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ACC_BANK_SBI',
    accountName: 'SBI Current A/C',
    accountType: 'BANK',
    bankName: 'State Bank of India',
    accountNumber: '1234567890',
    ifscCode: 'SBIN0001234',
    openingBalance: 25000,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ACC_BANK_HDFC',
    accountName: 'HDFC Bank',
    accountType: 'BANK',
    bankName: 'HDFC Bank',
    accountNumber: '9876543210',
    ifscCode: 'HDFC0001234',
    openingBalance: 15000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockTransactions: CashBankTransaction[] = [
  {
    id: 'TXN-001',
    txnNumber: 'TRF-2026-0001',
    type: 'DEPOSIT',
    date: '2026-10-15',
    amount: 5000,
    fromAccountId: 'ACC_CASH',
    toAccountId: 'ACC_BANK_SBI',
    referenceNo: 'CHQ-100201',
    description: 'Cash deposited to SBI branch',
    createdAt: '2026-10-15T10:00:00.000Z',
  },
  {
    id: 'TXN-002',
    txnNumber: 'IN-2026-0002',
    type: 'ADD_MONEY',
    date: '2026-10-16',
    amount: 20000,
    toAccountId: 'ACC_BANK_SBI',
    referenceNo: 'UTR998877',
    description: 'Capital Investment from Owner',
    createdAt: '2026-10-16T11:00:00.000Z',
  },
];

describe('CashBankTransactionDetailModal and Transaction Editing Suite', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
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

  it('renders native cash/bank transaction details in view mode correctly', async () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();
    const handleDelete = vi.fn();

    const mockEntry: UnifiedLedgerEntry = {
      id: 'LEDGER-TXN-OUT-TXN-001',
      date: '2026-10-15',
      type: 'CONTRA',
      category: 'CASH',
      accountId: 'ACC_CASH',
      accountName: 'Cash in Hand',
      counterpartyOrTitle: 'Transfer to SBI Current A/C',
      flow: 'OUT',
      amount: 5000,
      mode: 'CONTRA',
      referenceNo: 'CHQ-100201',
      description: 'Cash deposited to SBI branch',
      fromAccountId: 'ACC_CASH',
      fromAccountName: 'Cash in Hand',
      toAccountId: 'ACC_BANK_SBI',
      toAccountName: 'SBI Current A/C',
      contraType: 'DEPOSIT',
      txnId: 'TXN-001',
    };

    await act(async () => {
      root.render(
        <CashBankTransactionDetailModal
          isOpen={true}
          onClose={handleClose}
          entry={mockEntry}
          rawTransaction={mockTransactions[0]}
          accounts={mockAccounts}
          onSaveTransaction={handleSave}
          onDeleteTransaction={handleDelete}
        />
      );
    });

    // Header & Badge
    expect(container.textContent).toContain('Transaction Details');
    expect(container.textContent).toContain('TRF-2026-0001');

    // Amount & Route
    expect(container.textContent).toContain('Debited From');
    expect(container.textContent).toContain('Credited To');
    expect(container.textContent).toContain('Cash in Hand');
    expect(container.textContent).toContain('SBI Current A/C');
    expect(container.textContent).toContain('CHQ-100201');
    expect(container.textContent).toContain('Cash deposited to SBI branch');

    // Edit and Delete buttons present for native transaction
    expect(container.textContent).toContain('Edit Transaction');
    expect(container.textContent).toContain('Delete');
  });

  it('allows switching to edit mode and submitting modified transaction values', async () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();

    const mockEntry: UnifiedLedgerEntry = {
      id: 'LEDGER-TXN-OUT-TXN-001',
      date: '2026-10-15',
      type: 'CONTRA',
      category: 'CASH',
      accountId: 'ACC_CASH',
      accountName: 'Cash in Hand',
      counterpartyOrTitle: 'Transfer to SBI Current A/C',
      flow: 'OUT',
      amount: 5000,
      mode: 'CONTRA',
      referenceNo: 'CHQ-100201',
      description: 'Cash deposited to SBI branch',
      fromAccountId: 'ACC_CASH',
      fromAccountName: 'Cash in Hand',
      toAccountId: 'ACC_BANK_SBI',
      toAccountName: 'SBI Current A/C',
      contraType: 'DEPOSIT',
      txnId: 'TXN-001',
    };

    await act(async () => {
      root.render(
        <CashBankTransactionDetailModal
          isOpen={true}
          onClose={handleClose}
          entry={mockEntry}
          rawTransaction={mockTransactions[0]}
          accounts={mockAccounts}
          onSaveTransaction={handleSave}
        />
      );
    });

    // Click Edit Transaction button
    const editBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Edit Transaction')
    );
    expect(editBtn).toBeDefined();

    await act(async () => {
      editBtn?.click();
    });

    // Check we are now in Edit Mode
    expect(container.textContent).toContain('Save Changes');

    // Modify amount
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(amountInput).toBeDefined();

    const descTextarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(descTextarea).toBeDefined();

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    await act(async () => {
      nativeInputValueSetter?.call(amountInput, '7500');
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));

      nativeTextareaValueSetter?.call(descTextarea, 'Updated deposit amount');
      descTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      descTextarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit form
    const form = container.querySelector('form');
    expect(form).toBeDefined();

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(handleSave).toHaveBeenCalledTimes(1);
    const updatedCall = handleSave.mock.calls[0][0];
    expect(updatedCall.id).toBe('TXN-001');
    expect(updatedCall.amount).toBe(7500);
    expect(updatedCall.description).toBe('Updated deposit amount');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('shows confirmation and invokes onDeleteTransaction when deleting', async () => {
    const handleClose = vi.fn();
    const handleDelete = vi.fn();

    const mockEntry: UnifiedLedgerEntry = {
      id: 'LEDGER-TXN-OUT-TXN-001',
      date: '2026-10-15',
      type: 'CONTRA',
      category: 'CASH',
      accountId: 'ACC_CASH',
      accountName: 'Cash in Hand',
      counterpartyOrTitle: 'Transfer to SBI Current A/C',
      flow: 'OUT',
      amount: 5000,
      mode: 'CONTRA',
      fromAccountId: 'ACC_CASH',
      toAccountId: 'ACC_BANK_SBI',
      contraType: 'DEPOSIT',
      txnId: 'TXN-001',
    };

    await act(async () => {
      root.render(
        <CashBankTransactionDetailModal
          isOpen={true}
          onClose={handleClose}
          entry={mockEntry}
          rawTransaction={mockTransactions[0]}
          accounts={mockAccounts}
          onDeleteTransaction={handleDelete}
        />
      );
    });

    // Click Delete button
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete')
    );
    expect(deleteBtn).toBeDefined();

    await act(async () => {
      deleteBtn?.click();
    });

    // Confirmation banner should appear
    expect(container.textContent).toContain('Confirm Transaction Deletion');
    expect(container.textContent).toContain('Yes, Delete');

    // Confirm deletion
    const confirmDeleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Yes, Delete')
    );
    expect(confirmDeleteBtn).toBeDefined();

    await act(async () => {
      confirmDeleteBtn?.click();
    });

    expect(handleDelete).toHaveBeenCalledWith('TXN-001');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders read-only document notice and navigation button for auto-linked transactions', async () => {
    const handleClose = vi.fn();
    const handleNavigateTab = vi.fn();

    const mockLinkedEntry: UnifiedLedgerEntry = {
      id: 'LEDGER-SALE-INV-001',
      date: '2026-10-17',
      type: 'SALE',
      category: 'BANK',
      accountId: 'ACC_BANK_SBI',
      accountName: 'SBI Current A/C',
      counterpartyOrTitle: 'Sharma Enterprises',
      referenceNo: 'INV-2026-009',
      mode: 'UPI',
      flow: 'IN',
      amount: 12500,
      description: 'Sale Receipt #INV-2026-009',
      rawInvoiceId: 'INV-001',
    };

    await act(async () => {
      root.render(
        <CashBankTransactionDetailModal
          isOpen={true}
          onClose={handleClose}
          entry={mockLinkedEntry}
          rawTransaction={null}
          accounts={mockAccounts}
          onNavigateTab={handleNavigateTab}
        />
      );
    });

    // Linked badge and notice
    expect(container.textContent).toContain('Auto-Linked Entry');
    expect(container.textContent).toContain('Linked Source Document');
    expect(container.textContent).toMatch(/automatically synchronized with your sale records/i);

    // Navigate button
    const navBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open Source Document')
    );
    expect(navBtn).toBeDefined();

    await act(async () => {
      navBtn?.click();
    });

    expect(handleNavigateTab).toHaveBeenCalledWith('sales');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('opens CashBankTransactionDetailModal when clicking transaction row in CashBankManagementView', async () => {
    const handleSave = vi.fn();
    const handleDelete = vi.fn();
    const handleNavigate = vi.fn();

    await act(async () => {
      root.render(
        <CashBankManagementView
          company={mockCompany}
          accounts={mockAccounts}
          transactions={mockTransactions}
          invoices={[]}
          purchases={[]}
          expenses={[]}
          vouchers={[]}
          onSaveAccount={vi.fn()}
          onDeleteAccount={vi.fn()}
          onSaveTransaction={handleSave}
          onDeleteTransaction={handleDelete}
          onNavigateTab={handleNavigate}
        />
      );
    });

    // Find row element
    const rowEl = Array.from(container.querySelectorAll('div[role="button"]')).find((el) =>
      el.textContent?.includes('Capital Investment from Owner')
    );
    expect(rowEl).toBeDefined();

    // Click on row to open modal
    await act(async () => {
      (rowEl as HTMLElement)?.click();
    });

    // Detail modal should open
    expect(container.textContent).toContain('Transaction Details');
    expect(container.textContent).toContain('IN-2026-0002');
    expect(container.textContent).toContain('UTR998877');
  });

  it('opens CashBankTransactionDetailModal when clicking row in BankStatementCategory', async () => {
    const handleSave = vi.fn();
    const handleDelete = vi.fn();

    await act(async () => {
      root.render(
        <BankStatementCategory
          company={mockCompany}
          accounts={mockAccounts}
          transactions={mockTransactions}
          invoices={[]}
          purchases={[]}
          expenses={[]}
          vouchers={[]}
          dateRangeLabel="This Month"
          onSaveTransaction={handleSave}
          onDeleteTransaction={handleDelete}
        />
      );
    });

    // Click on a transaction row in the table
    const tableRow = Array.from(container.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('Capital Investment from Owner')
    );
    expect(tableRow).toBeDefined();

    await act(async () => {
      (tableRow as HTMLElement)?.click();
    });

    // Modal opens
    expect(container.textContent).toContain('Transaction Details');
    expect(container.textContent).toContain('UTR998877');
  });
});
