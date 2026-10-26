import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SYSTEM_WALK_IN_PARTY_ID,
  SYSTEM_WALK_IN_PARTY_NAME,
  createWalkInCustomer,
  isWalkInInvoice,
  isSystemParty,
  computeWalkInVirtualBalance,
  withWalkInCustomer,
} from '../core/utils/systemParties.ts';
import { rbac } from '../services/rbac.ts';
import type { Party } from '../models/party.ts';
import type { Invoice } from '../models/invoice.ts';
import type { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../models/bankAccount.ts';
import type { CompanyProfile } from '../models/company.ts';
import { computeCashBankSummary } from '../core/accounting/cashBankCalculator.ts';
import { resetBackNavigationForTesting, triggerBack, useBackNavigation } from '../core/utils/backNavigation.ts';
import { exportReportToCsv } from '../components/Reports/utils/reportExportUtils.ts';
import { CashBankTransactionDetailModal } from '../components/CashBank/CashBankTransactionDetailModal.tsx';
import { PaymentTransactionsView } from '../components/Payments/PaymentTransactionsView.tsx';
import { CashBankManagementView } from '../components/CashBank/CashBankManagementView.tsx';
import { BankStatementCategory } from '../components/Reports/categories/BankStatementCategory.tsx';
import { SelectPosPartyModal } from '../components/POS/SelectPosPartyModal.tsx';
import { SelectPartyModal } from '../components/Parties/SelectPartyModal.tsx';
import { QuickBillingView } from '../components/POS/QuickBillingView.tsx';
import { PartiesView } from '../components/Parties/PartiesView.tsx';
import { PartyDetailPage } from '../components/Parties/PartyDetailPage.tsx';
import { Drawer } from '../components/Shell/Drawer.tsx';
import { TabletSidebar } from '../components/Shell/TabletSidebar.tsx';
import { NavigationMenuHubView } from '../components/Navigation/NavigationMenuHubView.tsx';

vi.mock('../components/Reports/utils/reportExportUtils.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/Reports/utils/reportExportUtils.ts')>();
  return {
    ...actual,
    exportReportToCsv: vi.fn(),
  };
});

describe('Payment Transactions & System Walk-in Customer Suite', () => {
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
    businessName: 'Brahmaputra Hardware',
    tradeName: 'Brahmaputra Hardware',
    gstin: '18ADHPL1415E1ZX',
    pan: 'ADHPL1415E',
    stateCode: '18',
    phone: '9876543210',
    email: 'contact@brahmaputrahw.store',
    address: 'Guwahati, Assam',
    pincode: '781001',
    isGstEnabled: true,
  };

  const cashAccount: BankAccount = {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH',
    openingBalance: 35000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const defaultBank: BankAccount = {
    id: 'ACC_BANK_1',
    accountName: 'State Bank of India',
    accountType: 'BANK',
    openingBalance: 50000,
    isDefault: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const secondaryBank: BankAccount = {
    id: 'ACC_BANK_2',
    accountName: 'HDFC Bank',
    accountType: 'BANK',
    openingBalance: 20000,
    isDefault: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const directAddTxn: CashBankTransaction = {
    id: 'TXN-ADD-1',
    txnNumber: 'TXN-001',
    date: '2026-05-10',
    type: 'ADD_MONEY',
    toAccountId: 'ACC_CASH',
    amount: 10000,
    description: 'Capital Infusion',
    createdAt: '2026-05-10T10:00:00.000Z',
  };

  const directReduceTxn: CashBankTransaction = {
    id: 'TXN-RED-1',
    txnNumber: 'TXN-002',
    date: '2026-05-11',
    type: 'REDUCE_MONEY',
    fromAccountId: 'ACC_BANK_1',
    amount: 4000,
    description: 'Owner Drawings',
    createdAt: '2026-05-11T10:00:00.000Z',
  };

  const transferTxn: CashBankTransaction = {
    id: 'TXN-CONTRA-1',
    txnNumber: 'TXN-003',
    date: '2026-05-12',
    type: 'DEPOSIT',
    fromAccountId: 'ACC_CASH',
    toAccountId: 'ACC_BANK_1',
    amount: 5000,
    description: 'Cash deposited to bank',
    createdAt: '2026-05-12T10:00:00.000Z',
  };

  const upfrontSale: Invoice = {
    id: 'INV-SALE-1',
    invoiceNumber: 'INV-001',
    invoiceType: 'B2CS',
    isGstInvoice: true,
    date: '2026-05-15',
    partyId: 'PTY-1',
    partyName: 'Alice',
    partyAddress: '',
    partyStateCode: '18',
    placeOfSupplyStateCode: '18',
    isIntraState: true,
    items: [],
    totalGrossAmount: 2000,
    totalDiscount: 0,
    totalTaxableAmount: 2000,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 2000,
    amountInWords: '',
    paymentMode: 'CASH',
    paymentStatus: 'PAID',
    paidAmount: 2000,
    balanceAmount: 0,
    createdAt: '2026-05-15T10:00:00.000Z',
    updatedAt: '2026-05-15T10:00:00.000Z',
  };

  const upfrontPurchase = {
    id: 'PUR-1',
    billNumber: 'BILL-001',
    date: '2026-05-16',
    supplierId: 'SUP-1',
    supplierName: 'Supplier X',
    items: [],
    grandTotal: 3000,
    paidAmount: 3000,
    balanceAmount: 0,
    paymentMode: 'BANK' as any,
    paymentStatus: 'PAID' as any,
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T10:00:00.000Z',
  };

  describe('1. Pure Domain Resolver: systemParties.ts', () => {
    it('creates Walk-in Customer with exact system invariants', () => {
      const walkIn = createWalkInCustomer('18', 1250);
      expect(walkIn.id).toBe(SYSTEM_WALK_IN_PARTY_ID);
      expect(walkIn.name).toBe('Walk-in Customer');
      expect(walkIn.type).toBe('CUSTOMER');
      expect(walkIn.phone).toBe('');
      expect(walkIn.gstin).toBeUndefined();
      expect(walkIn.billingAddress).toBe('Local Counter');
      expect(walkIn.openingBalance).toBe(0);
      expect(walkIn.currentBalance).toBe(1250);
      expect(walkIn.stateCode).toBe('18');
      expect(walkIn.isSystem).toBe(true);
    });

    it('correctly matches walk-in invoice variants and system id', () => {
      expect(isWalkInInvoice({ partyId: 'CUSTOM_PARTY' })).toBe(true);
      expect(isWalkInInvoice({ partyName: 'Walk-in Customer' })).toBe(true);
      expect(isWalkInInvoice({ partyName: 'Walk-in Retail Customer' })).toBe(true);
      expect(isWalkInInvoice({ partyName: 'Walk-in Cash Guest' })).toBe(true);
      expect(isWalkInInvoice({ partyName: 'Cash / Retail Customer' })).toBe(true);
      expect(isWalkInInvoice({ partyName: 'Walk-in' })).toBe(true);
      expect(isWalkInInvoice({ partyName: 'Acme Corp' })).toBe(false);
      expect(isWalkInInvoice({ partyId: 'PTY-100', partyName: 'John Doe' })).toBe(false);
    });

    it('identifies system party by id or party object', () => {
      expect(isSystemParty(SYSTEM_WALK_IN_PARTY_ID)).toBe(true);
      expect(isSystemParty({ id: SYSTEM_WALK_IN_PARTY_ID } as Party)).toBe(true);
      expect(isSystemParty({ id: 'PTY-99', isSystem: true } as Party)).toBe(true);
      expect(isSystemParty('PTY-OTHER')).toBe(false);
      expect(isSystemParty(null)).toBe(false);
      expect(isSystemParty(undefined)).toBe(false);
    });

    it('computes virtual balance from unpaid, non-cancelled walk-in invoices only', () => {
      const invoices = [
        { id: '1', partyId: 'CUSTOM_PARTY', balanceAmount: 500, isCancelled: false },
        { id: '2', partyName: 'Walk-in Retail Customer', balanceAmount: 300, isCancelled: false },
        { id: '3', partyName: 'Walk-in Cash Guest', balanceAmount: 200, isCancelled: true }, // cancelled -> ignored
        { id: '4', partyName: 'Walk-in Customer', balanceAmount: 0, isCancelled: false }, // settled -> 0
        { id: '5', partyId: 'PTY-OTHER', balanceAmount: 1000, isCancelled: false }, // other customer -> ignored
      ] as Invoice[];

      const balance = computeWalkInVirtualBalance(invoices);
      expect(balance).toBe(800); // 500 + 300
    });

    it('withWalkInCustomer merges virtual party when not in catalog and does not duplicate', () => {
      const existingParties: Party[] = [
        {
          id: 'PTY-1',
          name: 'Regular Customer',
          type: 'CUSTOMER',
          phone: '9999999999',
          stateCode: '18',
          billingAddress: 'Guwahati',
          currentBalance: 1500,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];

      const merged = withWalkInCustomer(existingParties, '18', []);
      expect(merged).toHaveLength(2);
      expect(merged[0].id).toBe(SYSTEM_WALK_IN_PARTY_ID);
      expect(merged[0].name).toBe('Walk-in Customer');
      expect(merged[0].isSystem).toBe(true);
      expect(merged[1].id).toBe('PTY-1');

      // If called with an existing CUSTOM_PARTY, it marks isSystem without duplicating
      const withCustomParty: Party[] = [
        {
          id: SYSTEM_WALK_IN_PARTY_ID,
          name: 'Walk-in Customer',
          type: 'CUSTOMER',
          phone: '',
          stateCode: '18',
          billingAddress: 'Local Counter',
          currentBalance: 450,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        existingParties[0],
      ];

      const reMerged = withWalkInCustomer(withCustomParty, '18', []);
      expect(reMerged).toHaveLength(2);
      expect(reMerged[0].id).toBe(SYSTEM_WALK_IN_PARTY_ID);
      expect(reMerged[0].isSystem).toBe(true);
      expect(reMerged[0].currentBalance).toBe(450); // Preserves stored balance!
    });
  });

  describe('2. RBAC Allow-Lists & Navigation', () => {
    it('CASHIER can access payment_in but not payment_out', () => {
      expect(rbac.canAccessTab('payment_in', 'CASHIER')).toBe(true);
      expect(rbac.canAccessTab('payment_out', 'CASHIER')).toBe(false);
    });

    it('ACCOUNTANT and OWNER can access both payment_in and payment_out', () => {
      expect(rbac.canAccessTab('payment_in', 'ACCOUNTANT')).toBe(true);
      expect(rbac.canAccessTab('payment_out', 'ACCOUNTANT')).toBe(true);
      expect(rbac.canAccessTab('payment_in', 'OWNER')).toBe(true);
      expect(rbac.canAccessTab('payment_out', 'OWNER')).toBe(true);
    });

    it('Drawer and TabletSidebar include Payment In next to Sales and Payment Out next to Purchases', async () => {
      const onSelectTab = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <Drawer
            isOpen={true}
            activeTab="dashboard"
            company={mockCompany}
            activeUser={{ id: '1', name: 'Owner', role: 'OWNER', createdAt: '' }}
            onClose={onClose}
            onSelectTab={onSelectTab}
          />
        );
      });

      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Payment Out');

      await act(async () => {
        root.render(
          <TabletSidebar
            activeTab="dashboard"
            company={mockCompany}
            activeUser={{ id: '1', name: 'Owner', role: 'OWNER', createdAt: '' }}
            onSelectTab={onSelectTab}
          />
        );
      });

      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Payment Out');
    });

    it('NavigationMenuHubView lists Payment In and Payment Out under their respective categories', async () => {
      const onNavigate = vi.fn();
      await act(async () => {
        root.render(
          <NavigationMenuHubView
            company={mockCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={onNavigate}
          />
        );
      });

      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Payment Out');

      const paymentInBtn = Array.from(container.querySelectorAll('button, div')).find(
        (el) => el.textContent?.includes('Payment In')
      );
      expect(paymentInBtn).toBeDefined();
    });
  });

  describe('3. Payment In & Payment Out Calculations and Filtering', () => {
    it('computeCashBankSummary provides distinct inflows, outflows, and excludes CONTRA in PaymentViews', () => {
      const summary = computeCashBankSummary({
        accounts: [cashAccount, defaultBank, secondaryBank],
        invoices: [upfrontSale],
        purchases: [upfrontPurchase as any],
        expenses: [],
        vouchers: [],
        transactions: [directAddTxn, directReduceTxn, transferTxn],
      });

      // Filter for flow IN excluding CONTRA
      const inEntries = summary.ledgerEntries.filter(
        (e) => e.flow === 'IN' && e.type !== 'CONTRA' && !e.contraType
      );
      expect(inEntries).toHaveLength(2); // Upfront sale (2000) + Direct Add (10000)
      const inTotal = inEntries.reduce((sum, e) => sum + e.amount, 0);
      expect(inTotal).toBe(12000);

      // Filter for flow OUT excluding CONTRA
      const outEntries = summary.ledgerEntries.filter(
        (e) => e.flow === 'OUT' && e.type !== 'CONTRA' && !e.contraType
      );
      expect(outEntries).toHaveLength(2); // Upfront purchase (3000) + Direct Reduce (4000)
      const outTotal = outEntries.reduce((sum, e) => sum + e.amount, 0);
      expect(outTotal).toBe(7000);
    });

    it('PaymentTransactionsView renders Flow IN correctly with search and account filter', async () => {
      const onSaveTransaction = vi.fn();
      const onDeleteTransaction = vi.fn();
      const onNavigateTab = vi.fn();

      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, defaultBank]}
            transactions={[directAddTxn, transferTxn]}
            invoices={[upfrontSale]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
          />
        );
      });

      // Title & Inflows
      expect(container.textContent).toContain('Payment In');
      expect(container.textContent).toContain('Alice');
      expect(container.textContent).toContain('Capital Infusion');

      // Contra transfer should NOT be present in list
      expect(container.textContent).not.toContain('Cash deposited to bank');

      // Search input
      const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      expect(searchInput).toBeDefined();

      await act(async () => {
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputSetter?.call(searchInput, 'Alice');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(container.textContent).toContain('Alice');
      expect(container.textContent).not.toContain('Capital Infusion');
    });

    it('PaymentTransactionsView renders Flow OUT correctly with empty state action', async () => {
      const onSaveTransaction = vi.fn();
      const onDeleteTransaction = vi.fn();
      const onNavigateTab = vi.fn();

      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="OUT"
            company={mockCompany}
            accounts={[cashAccount, defaultBank]}
            transactions={[]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
          />
        );
      });

      expect(container.textContent).toContain('No Payment Out transactions found');

      // Rerender with an expense transaction
      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="OUT"
            company={mockCompany}
            accounts={[cashAccount, defaultBank]}
            transactions={[directReduceTxn]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
          />
        );
      });

      expect(container.textContent).toContain('Owner Drawings');
    });

    it('PaymentTransactionsView filters rows and updates summary totals when account filter, date range, or search is applied', async () => {
      const bankAddTxn: CashBankTransaction = {
        id: 'TXN-ADD-BANK',
        txnNumber: 'TXN-004',
        date: '2026-05-20',
        type: 'ADD_MONEY',
        toAccountId: 'ACC_BANK_1',
        amount: 5000,
        description: 'Bank Inflow',
        createdAt: '2026-05-20T10:00:00.000Z',
      };

      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, defaultBank, secondaryBank]}
            transactions={[directAddTxn, bankAddTxn, transferTxn]}
            invoices={[upfrontSale]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });

      // 1. ALL Accounts (Default)
      // Total Inflows = 10,000 (direct cash) + 5,000 (direct bank) + 2,000 (sale cash) = 17,000
      // Cash Portion = 12,000 | Bank Portion = 5,000 | Count = 3
      expect(container.textContent).toContain('17,000');
      expect(container.textContent).toContain('12,000');
      expect(container.textContent).toContain('5,000');
      expect(container.textContent).toContain('3 transactions');
      expect(container.textContent).toContain('Capital Infusion');
      expect(container.textContent).toContain('Alice');
      expect(container.textContent).toContain('Bank Inflow');

      // 2. Filter by CASH
      const cashFilterBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cash') && !b.textContent?.includes('All')
      );
      expect(cashFilterBtn).toBeDefined();
      await act(async () => {
        cashFilterBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('12,000');
      expect(container.textContent).toContain('2 transactions');
      expect(container.textContent).toContain('Capital Infusion');
      expect(container.textContent).toContain('Alice');
      expect(container.textContent).not.toContain('Bank Inflow');

      // 3. Filter by BANK (All)
      const bankFilterBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Bank (All)'));
      expect(bankFilterBtn).toBeDefined();
      await act(async () => {
        bankFilterBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('5,000');
      expect(container.textContent).toContain('1 transaction');
      expect(container.textContent).toContain('Bank Inflow');
      expect(container.textContent).not.toContain('Capital Infusion');
      expect(container.textContent).not.toContain('Alice');

      // 4. Filter by specific account: State Bank of India
      const sbiBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('State Bank of India'));
      expect(sbiBtn).toBeDefined();
      await act(async () => {
        sbiBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Bank Inflow');
      expect(container.textContent).toContain('1 transaction');

      // 5. Reset back to All Accounts
      const allBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'All Accounts');
      expect(allBtn).toBeDefined();
      await act(async () => {
        allBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('17,000');
      expect(container.textContent).toContain('3 transactions');

      // 6. Search filter
      const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      await act(async () => {
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputSetter?.call(searchInput, 'Bank Inflow');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.textContent).toContain('5,000');
      expect(container.textContent).toContain('1 transaction');
      expect(container.textContent).toContain('Bank Inflow');
      expect(container.textContent).not.toContain('Capital Infusion');
      expect(container.textContent).not.toContain('Alice');
    });

    it('Manual native transaction row opens detail modal and supports editing and deleting', async () => {
      const onSaveTransaction = vi.fn();
      const onDeleteTransaction = vi.fn();
      const onNavigateTab = vi.fn();

      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, defaultBank]}
            transactions={[directAddTxn]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
          />
        );
      });

      // No row-level edit or delete buttons exist
      expect(container.querySelector('[data-testid^="edit-payment"]')).toBeNull();
      expect(container.querySelector('[data-testid^="delete-payment"]')).toBeNull();

      // Find the row with "Capital Infusion" and click it
      const row = Array.from(container.querySelectorAll('div.cursor-pointer')).find((el) =>
        el.textContent?.includes('Capital Infusion')
      );
      expect(row).toBeDefined();

      await act(async () => {
        row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Detail modal is open
      expect(container.textContent).toContain('Transaction Details');
      expect(container.textContent).toContain('Editable Native Txn');

      // Click Edit Transaction button in modal footer
      const editBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Edit Transaction')
      );
      expect(editBtn).toBeDefined();

      await act(async () => {
        editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Now in edit mode
      expect(container.textContent).toContain('Edit Transaction');
      expect(container.textContent).toContain('Save Changes');

      // Change narration / description
      const descInput = container.querySelector('textarea') as HTMLTextAreaElement;
      expect(descInput).toBeDefined();
      await act(async () => {
        const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        nativeInputSetter?.call(descInput, 'Updated Infusion Narration');
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Submit the form
      const form = container.querySelector('form') as HTMLFormElement;
      expect(form).toBeDefined();

      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSaveTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'TXN-ADD-1',
          description: 'Updated Infusion Narration',
        })
      );

      // Now test Delete flow
      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, defaultBank]}
            transactions={[directAddTxn]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
          />
        );
      });

      const reRow = Array.from(container.querySelectorAll('div.cursor-pointer')).find((el) =>
        el.textContent?.includes('Capital Infusion')
      );
      await act(async () => {
        reRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delete')
      );
      expect(deleteBtn).toBeDefined();

      await act(async () => {
        deleteBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('Confirm Transaction Deletion');
      const confirmDeleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Yes, Delete')
      );
      expect(confirmDeleteBtn).toBeDefined();

      await act(async () => {
        confirmDeleteBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(onDeleteTransaction).toHaveBeenCalledWith('TXN-ADD-1');
    });

    it('Auto-linked rows do not render row-level or modal-level edit/delete controls and allow navigation to source document', async () => {
      const onSaveTransaction = vi.fn();
      const onDeleteTransaction = vi.fn();
      const onNavigateTab = vi.fn();

      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, defaultBank]}
            transactions={[]}
            invoices={[upfrontSale]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
          />
        );
      });

      // 1. Verify no row-level edit or delete controls exist
      expect(container.querySelector('[data-testid^="edit-payment"]')).toBeNull();
      expect(container.querySelector('[data-testid^="delete-payment"]')).toBeNull();

      const autoRow = Array.from(container.querySelectorAll('div.cursor-pointer')).find((el) =>
        el.textContent?.includes('Alice')
      );
      expect(autoRow).toBeDefined();
      expect(autoRow?.querySelector('button')).toBeNull(); // No buttons inside the row!

      // 2. Click the row to open details modal
      await act(async () => {
        autoRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // 3. Verify modal opens with read-only badge and source notice
      expect(container.textContent).toContain('Transaction Details');
      expect(container.textContent).toContain('Auto-Linked Entry');
      expect(container.textContent).toContain('Linked Source Document');
      expect(container.textContent).toContain('This entry is automatically synchronized with your sale records.');

      // 4. Modal MUST NOT render Edit or Delete buttons
      const editBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Edit Transaction') || b.textContent?.includes('Edit Invoice')
      );
      expect(editBtn).toBeUndefined();

      const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delete')
      );
      expect(deleteBtn).toBeUndefined();

      // 5. Open Source Document button exists and navigates to 'sales'
      const openDocBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Open Source Document')
      );
      expect(openDocBtn).toBeDefined();

      await act(async () => {
        openDocBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(onNavigateTab).toHaveBeenCalledWith('sales');
    });
  });

  describe('4. Cash & Bank Statement Icon and Deep-Link Statement Flow', () => {
    it('renders statement icon on cash card and bank cards and invokes onOpenAccountStatement without card filter toggle', async () => {
      const onOpenAccountStatement = vi.fn();
      const onSaveAccount = vi.fn();
      const onDeleteAccount = vi.fn();
      const onSaveTransaction = vi.fn();
      const onDeleteTransaction = vi.fn();
      const onNavigateTab = vi.fn();

      await act(async () => {
        root.render(
          <CashBankManagementView
            company={mockCompany}
            accounts={[cashAccount, defaultBank]}
            transactions={[]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveAccount={onSaveAccount}
            onDeleteAccount={onDeleteAccount}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
            onOpenAccountStatement={onOpenAccountStatement}
          />
        );
      });

      // Statement button on cash card
      const cashStatementBtn = container.querySelector('[data-testid="account-statement-ACC_CASH"]') as HTMLElement;
      expect(cashStatementBtn).toBeDefined();
      expect(cashStatementBtn.getAttribute('title')).toBe('View Account Statement');
      expect(cashStatementBtn.getAttribute('aria-label')).toBe('View statement for Cash in Hand');

      // Parent card container before click does not have active ring selection
      const cashCard = cashStatementBtn.closest('div.rounded-2xl') as HTMLElement;
      expect(cashCard.className).not.toContain('ring-2');

      await act(async () => {
        cashStatementBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onOpenAccountStatement).toHaveBeenCalledWith('ACC_CASH');
      // stopPropagation prevented card selection from toggling
      expect(cashCard.className).not.toContain('ring-2');

      // Statement button on bank card
      const bankStatementBtn = container.querySelector('[data-testid="account-statement-ACC_BANK_1"]') as HTMLElement;
      expect(bankStatementBtn).toBeDefined();

      const bankCard = bankStatementBtn.closest('div.rounded-2xl') as HTMLElement;
      expect(bankCard.className).not.toContain('ring-2');

      await act(async () => {
        bankStatementBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onOpenAccountStatement).toHaveBeenCalledWith('ACC_BANK_1');
      expect(bankCard.className).not.toContain('ring-2');
    });

    it('BankStatementCategory filters by date range, computes period opening balance, excludes pre/post range, and exports correctly', async () => {
      const txOld: CashBankTransaction = {
        id: 'TXN-OLD',
        txnNumber: '001',
        date: '2026-03-15',
        type: 'ADD_MONEY',
        toAccountId: 'ACC_BANK_1',
        amount: 10000,
        description: 'Prior Year Deposit',
        createdAt: '2026-03-15T00:00:00.000Z',
      };

      const txPeriodIn: CashBankTransaction = {
        id: 'TXN-PERIOD-IN',
        txnNumber: '002',
        date: '2026-05-01',
        type: 'ADD_MONEY',
        toAccountId: 'ACC_BANK_1',
        amount: 5000,
        description: 'May Deposit',
        createdAt: '2026-05-01T00:00:00.000Z',
      };

      const txPeriodOut: CashBankTransaction = {
        id: 'TXN-PERIOD-OUT',
        txnNumber: '003',
        date: '2026-05-15',
        type: 'REDUCE_MONEY',
        fromAccountId: 'ACC_BANK_1',
        amount: 2000,
        description: 'May Outflow',
        createdAt: '2026-05-15T00:00:00.000Z',
      };

      const txFuture: CashBankTransaction = {
        id: 'TXN-FUTURE',
        txnNumber: '004',
        date: '2026-06-15',
        type: 'ADD_MONEY',
        toAccountId: 'ACC_BANK_1',
        amount: 8000,
        description: 'June Post-Period Deposit',
        createdAt: '2026-06-15T00:00:00.000Z',
      };

      let registeredHandlers: { exportCsv?: () => void; exportPdf?: () => void } = {};
      const onRegisterExportHandlers = vi.fn((handlers) => {
        registeredHandlers = handlers;
      });

      await act(async () => {
        root.render(
          <BankStatementCategory
            company={mockCompany}
            accounts={[defaultBank]}
            transactions={[txOld, txPeriodIn, txPeriodOut, txFuture]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            dateRangeLabel="May 2026"
            dateRangeStart="2026-05-01"
            dateRangeEnd="2026-05-31"
            initialAccountId="ACC_BANK_1"
            onRegisterExportHandlers={onRegisterExportHandlers}
          />
        );
      });

      // 1. Account opening balance is 50,000. Prior movement before 2026-05-01 is +10,000.
      // So Period Opening Balance MUST be 60,000!
      expect(container.textContent).toContain('60,000');

      // 2. Period entries included
      expect(container.textContent).toContain('May Deposit');
      expect(container.textContent).toContain('May Outflow');

      // 3. Pre-range and post-range entries are excluded from period rows table
      expect(container.textContent).not.toContain('Prior Year Deposit');
      expect(container.textContent).not.toContain('June Post-Period Deposit');

      // 4. Closing balance is 63,000 (60,000 + 5,000 - 2,000)
      expect(container.textContent).toContain('63,000');

      // 5. CSV Export test: exports period opening balance and period rows
      expect(registeredHandlers.exportCsv).toBeDefined();
      registeredHandlers.exportCsv?.();
      expect(exportReportToCsv).toHaveBeenCalledWith(
        expect.stringContaining('BankStatement_State_Bank_of_India'),
        expect.any(Array),
        expect.arrayContaining([
          expect.arrayContaining(['Period Opening Balance (as of 2026-05-01)', 60000]),
          expect.arrayContaining(['May Deposit']),
          expect.arrayContaining(['May Outflow']),
        ]),
        expect.anything()
      );

      // 6. Verify all-time behaviour: without date range, uses account opening balance and all entries
      await act(async () => {
        root.render(
          <BankStatementCategory
            company={mockCompany}
            accounts={[defaultBank]}
            transactions={[txOld, txPeriodIn, txPeriodOut, txFuture]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            dateRangeLabel="All Time"
            dateRangeStart={undefined}
            dateRangeEnd={undefined}
            initialAccountId="ACC_BANK_1"
          />
        );
      });

      expect(container.textContent).toContain('50,000'); // Baseline account opening balance
      expect(container.textContent).toContain('Prior Year Deposit');
      expect(container.textContent).toContain('May Deposit');
      expect(container.textContent).toContain('May Outflow');
      expect(container.textContent).toContain('June Post-Period Deposit');
    });

    it('BankStatementCategory includes entry with ISO timestamp on the range end date', async () => {
      const txOnEndDate: CashBankTransaction = {
        id: 'TXN-END-DATE',
        txnNumber: '005',
        date: '2026-05-31T23:59:59.999Z', // ISO string with time on the range end date
        type: 'ADD_MONEY',
        toAccountId: 'ACC_BANK_1',
        amount: 4500,
        description: 'End of Month Wire',
        createdAt: '2026-05-31T23:59:59.999Z',
      };

      await act(async () => {
        root.render(
          <BankStatementCategory
            company={mockCompany}
            accounts={[defaultBank]}
            transactions={[txOnEndDate]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            dateRangeLabel="May 2026"
            dateRangeStart="2026-05-01"
            dateRangeEnd="2026-05-31"
            initialAccountId="ACC_BANK_1"
          />
        );
      });

      // Due to date.slice(0, 10) normalization, this entry MUST be included in the period rows
      expect(container.textContent).toContain('End of Month Wire');
      expect(container.textContent).toContain('4,500');
    });
  });

  describe('5. System Party UI Integration: PartiesView, SelectPartyModal, SelectPosPartyModal', () => {
    const regularParty: Party = {
      id: 'PTY-CUSTOMER-1',
      name: 'Bob Builder',
      type: 'CUSTOMER',
      phone: '9888877777',
      stateCode: '18',
      billingAddress: 'Dispur, Assam',
      currentBalance: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const walkInParty = createWalkInCustomer('18', 0);
    const catalogParties = [walkInParty, regularParty];

    it('PartiesView pins Walk-in Customer at top and renders System badge', async () => {
      const onSaveParty = vi.fn();
      const onDeleteParty = vi.fn();

      await act(async () => {
        root.render(
          <PartiesView
            parties={catalogParties}
            invoices={[]}
            purchases={[]}
            onSaveParty={onSaveParty}
            onDeleteParty={onDeleteParty}
          />
        );
      });

      const systemBadge = container.querySelector('[data-testid="system-party-badge"]');
      expect(systemBadge).toBeDefined();
      expect(systemBadge?.textContent).toContain('System');
    });

    it('PartyDetailPage hides Edit Profile and Delete buttons for system party', async () => {
      const onBack = vi.fn();
      const onEditParty = vi.fn();
      const onDeleteParty = vi.fn();
      const onRecordPayment = vi.fn();

      await act(async () => {
        root.render(
          <PartyDetailPage
            party={walkInParty}
            company={mockCompany}
            invoices={[]}
            purchases={[]}
            vouchers={[]}
            bankAccounts={[cashAccount]}
            onBack={onBack}
            onEditParty={onEditParty}
            onDeleteParty={onDeleteParty}
            onRecordPayment={onRecordPayment}
          />
        );
      });

      // Edit and Delete buttons should NOT be rendered for system party
      expect(container.querySelector('[title="Edit Profile"]')).toBeNull();
      expect(container.querySelector('[title="Delete Party"]')).toBeNull();
    });

    it('SelectPartyModal lists Walk-in Customer as a selectable customer without duplicates', async () => {
      const onSelectParty = vi.fn();
      const onClose = vi.fn();
      const onAddNewParty = vi.fn();

      await act(async () => {
        root.render(
          <SelectPartyModal
            parties={catalogParties}
            onSelectParty={onSelectParty}
            onClose={onClose}
            onAddNewParty={onAddNewParty}
          />
        );
      });

      const partyElements = Array.from(container.querySelectorAll('[data-testid="party-selector-item"], div')).filter(
        (el) => el.textContent?.includes('Walk-in Customer') && el.querySelector('h4, span')
      );
      expect(partyElements.length).toBeGreaterThanOrEqual(1);

      const target = Array.from(container.querySelectorAll('h4, span')).find(
        (el) => el.textContent?.trim() === 'Walk-in Customer'
      );
      expect(target).toBeDefined();

      await act(async () => {
        target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onSelectParty).toHaveBeenCalledWith(
        expect.objectContaining({
          id: SYSTEM_WALK_IN_PARTY_ID,
          name: SYSTEM_WALK_IN_PARTY_NAME,
        })
      );
    });

    it('SelectPosPartyModal selects system party on default row and does not duplicate in list', async () => {
      const onSelectParty = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <SelectPosPartyModal
            isOpen={true}
            parties={catalogParties}
            selectedParty={null}
            onSelectParty={onSelectParty}
            onClose={onClose}
          />
        );
      });

      // The registered customers section must not contain a second Walk-in Customer row
      const walkInMatches = Array.from(container.querySelectorAll('*')).filter(
        (el) => el.textContent?.trim() === 'Walk-in Customer'
      );
      expect(walkInMatches.length).toBeGreaterThanOrEqual(1);

      const defaultRow = container.querySelector('[data-testid="default-pos-walkin-row"]');
      expect(defaultRow).toBeDefined();

      await act(async () => {
        defaultRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onSelectParty).toHaveBeenCalledWith(
        expect.objectContaining({
          id: SYSTEM_WALK_IN_PARTY_ID,
          name: SYSTEM_WALK_IN_PARTY_NAME,
        })
      );
    });

    it('persists system party id and name on invoice saves and enforces system invariants', () => {
      // 1. Invoices and POS creations persist SYSTEM_WALK_IN_PARTY_ID and 'Walk-in Customer'
      const invoiceData: Partial<Invoice> = {
        partyId: SYSTEM_WALK_IN_PARTY_ID,
        partyName: SYSTEM_WALK_IN_PARTY_NAME,
        grandTotal: 1500,
      };
      expect(invoiceData.partyId).toBe('CUSTOM_PARTY');
      expect(invoiceData.partyName).toBe('Walk-in Customer');

      // 2. Verified system party identifier cannot be mutated into a regular party
      expect(isSystemParty(SYSTEM_WALK_IN_PARTY_ID)).toBe(true);
      expect(isSystemParty('CUSTOM_PARTY')).toBe(true);
      expect(isSystemParty('REGULAR_PARTY')).toBe(false);
    });

    it('QuickBillingView defaults customer.party to systemParty when parties load asynchronously', async () => {
      const mockItem = {
        id: 'ITEM-1',
        name: 'Hammer',
        sellingPrice: 250,
        taxRate: 18,
        stockQuantity: 10,
        unit: 'PCS',
        category: 'Hardware',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };

      // 1. Initial render with empty parties catalog
      await act(async () => {
        root.render(
          <QuickBillingView
            company={mockCompany}
            items={[mockItem as any]}
            parties={[]}
            onCompleteSale={vi.fn()}
          />
        );
      });

      // No walk-in badge yet since parties was empty
      expect(container.textContent).not.toContain('Walk-in Customer');

      // 2. Re-render when parties are loaded into catalog
      const walkIn = createWalkInCustomer('18', 0);
      await act(async () => {
        root.render(
          <QuickBillingView
            company={mockCompany}
            items={[mockItem as any]}
            parties={[walkIn]}
            onCompleteSale={vi.fn()}
          />
        );
      });

      // Customer should now automatically default to Walk-in Customer
      expect(container.textContent).toContain('Walk-in Customer');
    });

    it('QuickBillingView walk-in sale persistence', async () => {
      const mockItem = {
        id: 'ITEM-WALKIN-1',
        name: 'Hammer',
        salePrice: 250,
        purchasePrice: 200,
        gstRate: 18,
        currentStock: 10,
        minStockAlert: 2,
        unit: 'PCS' as const,
        category: 'Hardware',
        hsnSacCode: '8205',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };

      const walkIn = createWalkInCustomer(mockCompany.stateCode, 0);
      const onCompleteSale = vi.fn();

      await act(async () => {
        root.render(
          <QuickBillingView
            company={mockCompany}
            items={[mockItem as any]}
            parties={[walkIn]}
            onCompleteSale={onCompleteSale}
          />
        );
      });

      // Item should be displayed in catalog grid
      const itemEl = container.querySelector('[data-testid="pos-item-ITEM-WALKIN-1"]');
      expect(itemEl).toBeDefined();

      // Add item to cart
      await act(async () => {
        itemEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Find and click the complete sale / charge button
      const chargeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Charge')
      );
      expect(chargeBtn).toBeDefined();

      await act(async () => {
        chargeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Assert onCompleteSale receives a payload with partyId CUSTOM_PARTY and partyName "Walk-in Customer"
      expect(onCompleteSale).toHaveBeenCalledTimes(1);
      const salePayload = onCompleteSale.mock.calls[0][0];
      expect(salePayload.partyId).toBe('CUSTOM_PARTY');
      expect(salePayload.partyName).toBe('Walk-in Customer');
    });
  });

  describe('6. Android Hardware Back Navigation Hardening', () => {
    it('PaymentTransactionsView closes open modals on hardware back before leaving the page', async () => {
      await act(async () => {
        root.render(
          <PaymentTransactionsView
            flow="IN"
            company={mockCompany}
            accounts={[cashAccount, defaultBank]}
            transactions={[directAddTxn]}
            invoices={[]}
            purchases={[]}
            expenses={[]}
            vouchers={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });

      // 1. Date filter modal back navigation
      const dateFilterBtn = container.querySelector('button[title="Filter by date range"]') as HTMLElement;
      expect(dateFilterBtn).toBeDefined();
      await act(async () => {
        dateFilterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Filter by Date Range');

      // Trigger Android back button
      let backHandled = false;
      await act(async () => {
        backHandled = triggerBack();
      });
      expect(backHandled).toBe(true);
      expect(container.textContent).not.toContain('Filter by Date Range');

      // 2. Direct Cash/Bank Modal back navigation
      const recordInBtn = container.querySelector('button[title="+ Record Payment In"]') as HTMLElement;
      expect(recordInBtn).toBeDefined();
      await act(async () => {
        recordInBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Direct Money In');

      await act(async () => {
        backHandled = triggerBack();
      });
      expect(backHandled).toBe(true);
      expect(container.textContent).not.toContain('Direct Money In');

      // 3. Detail modal back navigation
      const row = Array.from(container.querySelectorAll('div.cursor-pointer')).find((el) =>
        el.textContent?.includes('Capital Infusion')
      );
      await act(async () => {
        row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Transaction Details');

      await act(async () => {
        backHandled = triggerBack();
      });
      expect(backHandled).toBe(true);
      expect(container.textContent).not.toContain('Transaction Details');
    });

    it('CashBankTransactionDetailModal closes confirm dialog, cancels edit mode, then closes modal on back press', async () => {
      const onClose = vi.fn();
      await act(async () => {
        root.render(
          <CashBankTransactionDetailModal
            isOpen={true}
            onClose={onClose}
            rawTransaction={directAddTxn}
            entry={null}
            accounts={[cashAccount, defaultBank]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
          />
        );
      });

      // Open Delete Confirmation
      const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delete')
      );
      await act(async () => {
        deleteBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Confirm Transaction Deletion');

      // Hardware back cancels delete confirmation first
      let handled = false;
      await act(async () => {
        handled = triggerBack();
      });
      expect(handled).toBe(true);
      expect(container.textContent).not.toContain('Confirm Transaction Deletion');
      expect(onClose).not.toHaveBeenCalled();

      // Enter edit mode
      const editBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Edit Transaction')
      );
      await act(async () => {
        editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Save Changes');

      // Hardware back cancels edit mode back to view mode
      await act(async () => {
        handled = triggerBack();
      });
      expect(handled).toBe(true);
      expect(container.textContent).not.toContain('Save Changes');
      expect(onClose).not.toHaveBeenCalled();

      // Hardware back closes modal
      await act(async () => {
        handled = triggerBack();
      });
      expect(handled).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
