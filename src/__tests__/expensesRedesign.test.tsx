import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ExpensesView } from '../components/Expenses/ExpensesView.tsx';
import { Expense } from '../models/expense.ts';
import { CompanyProfile } from '../models/company.ts';
import { db } from '../services/db.ts';

const mockCompany: CompanyProfile = {
  id: 'comp-test',
  businessName: 'Apex Goods & Services',
  isGstEnabled: true,
  gstin: '27AABCT1234H1Z0',
  pan: 'AABCT1234H',
  stateCode: '27',
  address: 'Pune, Maharashtra',
  pincode: '411001',
  phone: '9876543210',
  email: 'test@example.com',
};

const mockExpenses: Expense[] = [
  {
    id: 'EXP-1',
    title: 'Shop Rent October',
    category: 'Rent & Utilities',
    amount: 15000,
    taxableAmount: 12711.86,
    gstRate: 18,
    taxAmount: 2288.14,
    cgstAmount: 1144.07,
    sgstAmount: 1144.07,
    igstAmount: 0,
    date: '2026-11-01',
    paymentMode: 'BANK_TRANSFER',
    itcEligible: true,
    voucherNumber: 'EXP-2026-0001',
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'EXP-2',
    title: 'Tea & Snacks Refreshments',
    category: 'Tea, Coffee & Refreshments',
    amount: 450,
    taxableAmount: 450,
    gstRate: 0,
    taxAmount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    date: '2026-11-01',
    paymentMode: 'CASH',
    itcEligible: false,
    voucherNumber: 'EXP-2026-0002',
    createdAt: '2026-11-01T11:00:00.000Z',
  },
];

describe('Expenses Modular Redesign & View Suite', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.spyOn(db, 'getCompany').mockReturnValue(mockCompany);
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

  it('1. Header renders Total Spent and voucher count', () => {
    act(() => {
      root.render(
        <ExpensesView
          expenses={mockExpenses}
          onSaveExpense={vi.fn()}
          onDeleteExpense={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Expenses');
    expect(container.textContent).toContain('2 of 2');
    expect(container.textContent).toContain('Total Spent');
    expect(container.textContent).toContain('15,450');
    expect(container.textContent).toContain('2 vouchers');
    expect(container.textContent).toContain('ITC Claimable');
  });

  it('2. Opening the filter sheet and applying Cash filters the list, and active-filter chip row appears', () => {
    act(() => {
      root.render(
        <ExpensesView
          expenses={mockExpenses}
          onSaveExpense={vi.fn()}
          onDeleteExpense={vi.fn()}
        />
      );
    });

    // Both expenses rendered initially
    expect(container.textContent).toContain('Shop Rent October');
    expect(container.textContent).toContain('Tea & Snacks Refreshments');

    // Click Filters button to open filter sheet
    const filterBtn = container.querySelector('button[aria-label="Open filter and sort sheet"]') as HTMLButtonElement;
    expect(filterBtn).toBeTruthy();
    act(() => {
      filterBtn.click();
    });

    // Find the Cash button inside the modal dialog
    const filterSheet = document.body.querySelector('div[aria-label="Filter & Sort Expenses"]');
    expect(filterSheet).toBeTruthy();

    const buttons = Array.from(filterSheet!.querySelectorAll('button'));
    const cashBtn = buttons.find((b) => b.textContent?.trim() === 'Cash');
    expect(cashBtn).toBeTruthy();
    act(() => {
      cashBtn!.click();
    });

    // Click Apply button
    const applyBtn = buttons.find((b) => b.textContent?.includes('Apply'));
    expect(applyBtn).toBeTruthy();
    act(() => {
      applyBtn!.click();
    });

    // The list should now only contain the Cash expense
    expect(container.textContent).toContain('Tea & Snacks Refreshments');
    expect(container.textContent).not.toContain('Shop Rent October');

    // Active filter chip row should be rendered with Cash and Clear all
    expect(container.textContent).toContain('Clear all');
  });

  it('3. Opening the form sheet, filling amount + title, and saving calls onSaveExpense with expected payload', () => {
    const handleSave = vi.fn();

    act(() => {
      root.render(
        <ExpensesView
          expenses={mockExpenses}
          onSaveExpense={handleSave}
          onDeleteExpense={vi.fn()}
        />
      );
    });

    // Click Add Expense button
    const addBtn = container.querySelector('button[aria-label="Add Expense"]') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    act(() => {
      addBtn.click();
    });

    // Form sheet should be open
    const formSheet = document.body.querySelector('div[aria-label="Record Business Expense"]');
    expect(formSheet).toBeTruthy();

    // Fill in amount
    const amountInput = formSheet!.querySelector('input[type="number"]') as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    act(() => {
      // Trigger onChange with synthetic event
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set;
      nativeSetter!.call(amountInput, '1250');
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Fill in purpose/title
    const titleInput = formSheet!.querySelector('input[type="text"][required]') as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set;
      nativeSetter!.call(titleInput, 'Office Stationery Supplies');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit form via submit event on form element
    const form = formSheet!.querySelector('form');
    expect(form).toBeTruthy();
    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedExpense: Expense = handleSave.mock.calls[0][0];
    expect(savedExpense.title).toBe('Office Stationery Supplies');
    expect(savedExpense.amount).toBe(1250);
    expect(savedExpense.category).toBe('General Operational');
    expect(savedExpense.paymentMode).toBe('UPI');
  });

  it('4. Tapping an expense row opens the detail sheet with the expense title and amount', () => {
    act(() => {
      root.render(
        <ExpensesView
          expenses={mockExpenses}
          onSaveExpense={vi.fn()}
          onDeleteExpense={vi.fn()}
        />
      );
    });

    // Find first expense card and click it
    const expenseTitles = Array.from(container.querySelectorAll('h4, h3'));
    const rentTitle = expenseTitles.find((el) => el.textContent?.includes('Shop Rent October'));
    expect(rentTitle).toBeTruthy();

    act(() => {
      (rentTitle!.closest('div[onClick]') || rentTitle!)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    // Detail sheet should now be open
    const detailSheet = document.body.querySelector('div[aria-label="Expense Details"]');
    expect(detailSheet).toBeTruthy();
    expect(detailSheet!.textContent).toContain('Shop Rent October');
    expect(detailSheet!.textContent).toContain('15,000');
    expect(detailSheet!.textContent).toContain('Money Out');
    expect(detailSheet!.textContent).toContain('Bank / NEFT');
  });

  it('5. Delete from the detail sheet triggers ConfirmDeleteModal and then onDeleteExpense', () => {
    const handleDelete = vi.fn();

    act(() => {
      root.render(
        <ExpensesView
          expenses={mockExpenses}
          onSaveExpense={vi.fn()}
          onDeleteExpense={handleDelete}
        />
      );
    });

    // Open detail sheet by clicking on first card
    const expenseTitles = Array.from(container.querySelectorAll('h4, h3'));
    const rentTitle = expenseTitles.find((el) => el.textContent?.includes('Shop Rent October'));
    act(() => {
      rentTitle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const detailSheet = document.body.querySelector('div[aria-label="Expense Details"]');
    expect(detailSheet).toBeTruthy();

    // Click the delete button in detail sheet
    const deleteBtn = detailSheet!.querySelector('button[aria-label="Delete expense"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    act(() => {
      deleteBtn.click();
    });

    // Confirm Delete Modal should appear
    expect(document.body.textContent).toContain('Delete Expense Voucher?');

    // Click confirm delete button
    const modalButtons = Array.from(document.body.querySelectorAll('button'));
    const confirmDeleteBtn = modalButtons.find((b) => b.textContent?.includes('Delete Voucher'));
    expect(confirmDeleteBtn).toBeTruthy();

    act(() => {
      confirmDeleteBtn!.click();
    });

    expect(handleDelete).toHaveBeenCalledWith('EXP-1');
  });
});
