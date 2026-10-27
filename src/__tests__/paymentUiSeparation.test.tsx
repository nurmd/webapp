import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentTransactionsView } from '../components/Payments/PaymentTransactionsView.tsx';
import { RecordPaymentModal } from '../components/Parties/RecordPaymentModal.tsx';
import { PartiesView } from '../components/Parties/PartiesView.tsx';
import { DashboardRecordPaymentModal } from '../components/Dashboard/DashboardRecordPaymentModal.tsx';
import { resetBackNavigationForTesting, triggerBack } from '../core/utils/backNavigation.ts';
import { db } from '../services/db.ts';
import type { Party } from '../models/party.ts';
import type { Invoice } from '../models/invoice.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { BankAccount, CashBankTransaction } from '../models/bankAccount.ts';
import type { CompanyProfile } from '../models/company.ts';

describe('Payment UI Separation Spec Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    resetBackNavigationForTesting();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    resetBackNavigationForTesting();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mockCompany: CompanyProfile = {
    id: 'comp_1',
    businessName: 'Apex GST Trading',
    tradeName: 'Apex GST Trading',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    stateCode: '27',
    phone: '9876543210',
    email: 'admin@apex.test',
    address: 'Mumbai, Maharashtra',
    pincode: '400001',
    isGstEnabled: true,
  };

  const cashAccount: BankAccount = {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH',
    openingBalance: 10000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const bankAccount: BankAccount = {
    id: 'ACC_BANK_1',
    accountName: 'HDFC Bank',
    accountType: 'BANK',
    openingBalance: 50000,
    isDefault: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const customerParty: Party = {
    id: 'party_cust_1',
    name: 'Reliance Retails',
    type: 'CUSTOMER',
    phone: '9820098200',
    stateCode: '27',
    billingAddress: 'Mumbai',
    currentBalance: 5000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const supplierParty: Party = {
    id: 'party_supp_1',
    name: 'Tata Steel Mills',
    type: 'SUPPLIER',
    phone: '9830098300',
    stateCode: '27',
    billingAddress: 'Mumbai',
    currentBalance: -8000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockInvoice: Invoice = {
    id: 'inv_101',
    invoiceNumber: 'INV-101',
    invoiceType: 'B2B',
    date: '2026-05-10',
    dueDate: '2026-05-25',
    partyId: 'party_cust_1',
    partyName: 'Reliance Retails',
    partyAddress: 'Mumbai',
    partyStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
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
    paidAmount: 2000,
    balanceAmount: 3000,
    paymentStatus: 'PARTIAL',
    paymentMode: 'CASH',
    amountInWords: 'Five Thousand Rupees Only',
    createdAt: '2026-05-10T10:00:00.000Z',
    updatedAt: '2026-05-10T10:00:00.000Z',
  };

  const mockPurchase: PurchaseBill = {
    id: 'pur_201',
    billNumber: 'BILL-201',
    purchaseType: 'BILL',
    date: '2026-05-12',
    supplierId: 'party_supp_1',
    supplierName: 'Tata Steel Mills',
    supplierAddress: 'Mumbai',
    supplierStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    itcEligibility: 'ALL_OTHER_ITC',
    isRcm: false,
    items: [],
    totalGrossAmount: 8000,
    totalDiscount: 0,
    totalTaxableAmount: 8000,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 8000,
    paidAmount: 3000,
    balanceAmount: 5000,
    paymentStatus: 'PARTIAL',
    paymentMode: 'BANK',
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
  };

  const mockTransactions: CashBankTransaction[] = [
    {
      id: 'txn_1',
      txnNumber: 'TXN-001',
      date: '2026-05-10',
      type: 'ADD_MONEY',
      toAccountId: 'ACC_CASH',
      amount: 2000,
      description: 'Receipt from Reliance Retails',
      createdAt: '2026-05-10T11:00:00.000Z',
    },
  ];

  function changeInput(input: HTMLInputElement, value: string) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  describe('1. PaymentTransactionsView UI Mode Separation', () => {
    it('initial render starts in TRANSACTIONS mode with list, filters, and summary visible', async () => {
      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, bankAccount]}
            transactions={mockTransactions}
            invoices={[mockInvoice]}
            purchases={[]}
            parties={[customerParty]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onNavigateTab={vi.fn()}
            onRecordPartyPayment={vi.fn()}
          />
        );
      });

      // TRANSACTIONS mode UI elements
      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Total Received');
      expect(container.textContent).toContain('+ Record Receipt');
      expect(container.textContent).toContain('Reliance Retails');

      // Search input is present in list mode
      const searchInput = container.querySelector('input[placeholder*="party"]');
      expect(searchInput).not.toBeNull();

      // ENTRY mode top header is NOT rendered
      expect(container.textContent).not.toContain('Back to Existing Transactions');
      expect(container.textContent).not.toContain('Link to outstanding sales invoices or record an advance');
    });

    it('clicking "+ Record Receipt" switches to ENTRY mode and completely hides transaction list', async () => {
      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, bankAccount]}
            transactions={mockTransactions}
            invoices={[mockInvoice]}
            purchases={[]}
            parties={[customerParty]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onNavigateTab={vi.fn()}
            onRecordPartyPayment={vi.fn()}
          />
        );
      });

      const recordCta = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-label') === 'Record Receipt' || b.textContent?.includes('+ Record Receipt')
      );
      expect(recordCta).toBeDefined();

      await act(async () => {
        recordCta?.click();
      });

      // ENTRY mode is now active
      expect(container.textContent).toContain('Record Payment In (Receipt)');
      expect(container.textContent).toContain('Back to Existing Transactions');
      expect(container.textContent).toContain('Cancel');
      expect(container.textContent).toContain('Link to outstanding sales invoices or record an advance');

      // Clean separation: transaction list summary strip & search bar are unmounted
      expect(container.textContent).not.toContain('Total Received');
      expect(container.querySelector('input[placeholder*="Search by party"]')).toBeNull();
    });

    it('clicking "Back to Existing Transactions" or "Cancel" restores TRANSACTIONS mode', async () => {
      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, bankAccount]}
            transactions={mockTransactions}
            invoices={[mockInvoice]}
            purchases={[]}
            parties={[customerParty]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onNavigateTab={vi.fn()}
            onRecordPartyPayment={vi.fn()}
          />
        );
      });

      // Switch to ENTRY
      const recordCta = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-label') === 'Record Receipt' || b.textContent?.includes('+ Record Receipt')
      );
      await act(async () => {
        recordCta?.click();
      });
      expect(container.textContent).toContain('Record Payment In (Receipt)');

      // Click "Back to Existing Transactions"
      const backBtn = container.querySelector('button[aria-label="Back to Existing Transactions"]') as HTMLButtonElement;
      expect(backBtn).not.toBeNull();
      await act(async () => {
        backBtn.click();
      });

      // Restored list view
      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Total Received');
      expect(container.textContent).not.toContain('Back to Existing Transactions');

      // Switch to ENTRY again and test Cancel button
      const recordCta2 = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-label') === 'Record Receipt' || b.textContent?.includes('+ Record Receipt')
      );
      await act(async () => {
        recordCta2?.click();
      });
      expect(container.textContent).toContain('Record Payment In (Receipt)');

      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Cancel'
      );
      expect(cancelBtn).toBeDefined();
      await act(async () => {
        cancelBtn?.click();
      });

      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Total Received');
    });

    it('Android hardware back navigation priority 20 exits ENTRY mode back to TRANSACTIONS mode', async () => {
      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, bankAccount]}
            transactions={mockTransactions}
            invoices={[mockInvoice]}
            purchases={[]}
            parties={[customerParty]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onNavigateTab={vi.fn()}
            onRecordPartyPayment={vi.fn()}
          />
        );
      });

      // Enter ENTRY mode
      const recordCta = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-label') === 'Record Receipt' || b.textContent?.includes('+ Record Receipt')
      );
      await act(async () => {
        recordCta?.click();
      });
      expect(container.textContent).toContain('Back to Existing Transactions');

      // Trigger Android back key
      await act(async () => {
        const handled = triggerBack();
        expect(handled).toBe(true);
      });

      // Should be back to TRANSACTIONS mode
      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Total Received');
      expect(container.textContent).not.toContain('Back to Existing Transactions');
    });

    it('submitting payment in ENTRY mode invokes onRecordPartyPayment and automatically returns to TRANSACTIONS mode', async () => {
      const onRecordPartyPayment = vi.fn();

      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, bankAccount]}
            transactions={mockTransactions}
            invoices={[mockInvoice]}
            purchases={[]}
            parties={[customerParty]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onNavigateTab={vi.fn()}
            onRecordPartyPayment={onRecordPartyPayment}
          />
        );
      });

      // Open ENTRY mode
      const recordCta = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-label') === 'Record Receipt' || b.textContent?.includes('+ Record Receipt')
      );
      await act(async () => {
        recordCta?.click();
      });

      // Select party dropdown
      const partySelect = container.querySelector('select') as HTMLSelectElement;
      expect(partySelect).not.toBeNull();
      await act(async () => {
        partySelect.value = customerParty.id;
        partySelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Enter payment amount
      const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(amountInput).not.toBeNull();
      await act(async () => {
        changeInput(amountInput, '2500');
      });

      // Submit form
      const form = container.querySelector('form') as HTMLFormElement;
      expect(form).not.toBeNull();

      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // Verified handler invocation with party and allocations
      expect(onRecordPartyPayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'party_cust_1', name: 'Reliance Retails' }),
        2500,
        expect.any(String),
        expect.any(String),
        'IN',
        undefined,
        0,
        undefined,
        expect.any(Array),
        expect.any(String),
        expect.any(String)
      );

      // Verified automatic return to TRANSACTIONS mode
      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Total Received');
      expect(container.textContent).not.toContain('Back to Existing Transactions');
    });

    it('works identically in Flow OUT for recording supplier payments', async () => {
      const onRecordPartyPayment = vi.fn();

      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="OUT"
            company={mockCompany}
            accounts={[cashAccount, bankAccount]}
            transactions={[]}
            invoices={[]}
            purchases={[mockPurchase]}
            parties={[supplierParty]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onNavigateTab={vi.fn()}
            onRecordPartyPayment={onRecordPartyPayment}
          />
        );
      });

      expect(container.textContent).toContain('Payment Out');
      expect(container.textContent).toContain('Total Paid');

      const recordCta = Array.from(container.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-label') === 'Record Payment' || b.textContent?.includes('+ Record Payment')
      );
      expect(recordCta).toBeDefined();

      await act(async () => {
        recordCta?.click();
      });

      // Entry mode for OUT
      expect(container.textContent).toContain('Record Payment Out');
      expect(container.textContent).toContain('Link to outstanding purchase bills or record an advance');
      expect(container.textContent).toContain('Back to Existing Transactions');
    });
  });

  describe('2. Direct Settlement Fallback Removal & Safe Handling', () => {
    it('PartiesView handleRecordPayment invokes central onRecordPartyPayment and never mutates party without handler', async () => {
      const onRecordPartyPayment = vi.fn();
      const onSaveParty = vi.fn();

      await act(async () => {
        root.render(
          <PartiesView
            parties={[customerParty]}
            invoices={[mockInvoice]}
            purchases={[]}
            vouchers={[]}
            bankAccounts={[cashAccount]}
            onSaveParty={onSaveParty}
            onDeleteParty={vi.fn()}
            onRecordPartyPayment={onRecordPartyPayment}
          />
        );
      });

      // Click customer to open party detail ledger
      const partyRow = Array.from(container.querySelectorAll('div, tr, button')).find(
        (el) => el.textContent?.includes('Reliance Retails') && el.classList.contains('cursor-pointer')
      ) as HTMLElement | undefined;
      expect(partyRow).toBeDefined();

      await act(async () => {
        partyRow?.click();
      });

      // Open Record Payment Modal in PartyDetailPage
      const collectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Record Payment') || b.textContent?.includes('Payment In')
      );
      expect(collectBtn).toBeDefined();

      await act(async () => {
        collectBtn?.click();
      });

      // Fill and submit payment
      const amtInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(amtInput).not.toBeNull();
      await act(async () => {
        changeInput(amtInput, '1000');
      });

      const form = container.querySelector('form') as HTMLFormElement;
      expect(form).not.toBeNull();
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onRecordPartyPayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'party_cust_1' }),
        1000,
        expect.any(String),
        expect.any(String),
        'IN',
        undefined,
        0,
        undefined,
        expect.any(Array),
        expect.any(String),
        expect.any(String)
      );

      // Verify onSaveParty was NOT invoked (no direct mutation bypassing voucher engine)
      expect(onSaveParty).not.toHaveBeenCalled();
    });

    it('DashboardRecordPaymentModal fails safely when onRecordPartyPayment is absent', async () => {
      const saveInvoiceSpy = vi.spyOn(db, 'saveInvoice');
      const savePurchaseSpy = vi.spyOn(db, 'savePurchase');
      const saveVoucherSpy = vi.spyOn(db, 'savePaymentVoucher');

      await act(async () => {
        root.render(
          <DashboardRecordPaymentModal
            isOpen={true}
            onClose={vi.fn()}
            target={{
              type: 'SALE',
              rawId: 'inv_101',
              docNumber: 'INV-101',
              partyName: 'Reliance Retails',
              partyId: 'party_cust_1',
              balanceAmount: 3000,
              grandTotal: 5000,
              rawInvoice: mockInvoice,
            }}
            parties={[customerParty]}
            // Intentionally omit onRecordPartyPayment
          />
        );
      });

      expect(container.textContent).toContain('Collect Customer Payment');

      const amtInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(amtInput).not.toBeNull();
      await act(async () => {
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputSetter?.call(amtInput, '1500');
        amtInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Confirm Payment')
      );
      expect(confirmBtn).toBeDefined();

      await act(async () => {
        confirmBtn?.click();
      });

      // Verifies validation error is displayed and NO direct DB mutation occurs
      expect(container.textContent).toContain('Payment recording handler is unavailable.');
      expect(saveInvoiceSpy).not.toHaveBeenCalled();
      expect(savePurchaseSpy).not.toHaveBeenCalled();
      expect(saveVoucherSpy).not.toHaveBeenCalled();

      saveInvoiceSpy.mockRestore();
      savePurchaseSpy.mockRestore();
      saveVoucherSpy.mockRestore();
    });

    it('Payment entry must not close on save failure (onRecordPayment returning false leaves entry form open with values intact; returning true closes it)', async () => {
      const handleClose = vi.fn();
      let shouldSucceed = false;
      const handleRecordPayment = vi.fn().mockImplementation(() => {
        return shouldSucceed;
      });

      await act(async () => {
        root.render(
          <RecordPaymentModal
            isOpen={true}
            onClose={handleClose}
            party={customerParty}
            onRecordPayment={handleRecordPayment}
            initialPaymentType="IN"
            bankAccounts={[cashAccount, bankAccount]}
            invoices={[mockInvoice]}
          />
        );
      });

      // Enter payment amount 2000
      const amtInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(amtInput).not.toBeNull();
      await act(async () => {
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputSetter?.call(amtInput, '2000');
        amtInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(amtInput.value).toBe('2000');

      // Submit form with failure (shouldSucceed = false)
      const form = container.querySelector('form') as HTMLFormElement;
      expect(form).not.toBeNull();
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(handleRecordPayment).toHaveBeenCalledTimes(1);
      // Because save returned false, onClose was NOT called and the input value 2000 remains intact
      expect(handleClose).not.toHaveBeenCalled();
      expect(amtInput.value).toBe('2000');

      // Now switch to success (shouldSucceed = true) and submit again
      shouldSucceed = true;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(handleRecordPayment).toHaveBeenCalledTimes(2);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
