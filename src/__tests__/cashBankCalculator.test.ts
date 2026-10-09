import { describe, it, expect } from 'vitest';
import { computeCashBankSummary } from '@/core/accounting/cashBankCalculator';
import type { BankAccount, CashBankTransaction } from '@/models/bankAccount';
import type { Invoice } from '@/models/invoice';
import type { PurchaseBill } from '@/models/purchase';
import type { Expense } from '@/models/expense';
import type { Voucher } from '@/core/accounting/voucherTypes';

describe('Suite 5: Cash/Bank Ledgers & Running Balances', () => {
  const defaultBank: BankAccount = {
    id: 'ACC_BANK_1',
    accountName: 'HDFC Current A/C',
    accountType: 'BANK',
    openingBalance: 25000,
    isDefault: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const cashAccount: BankAccount = {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH',
    openingBalance: 5000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const baseParams = {
    accounts: [cashAccount, defaultBank],
    invoices: [] as Invoice[],
    purchases: [] as PurchaseBill[],
    expenses: [] as Expense[],
    vouchers: [] as Voucher[],
    transactions: [] as CashBankTransaction[],
  };

  it('TC-CSHB-01: Account balances correctly initialize to configured opening balances', () => {
    const summary = computeCashBankSummary(baseParams);
    expect(summary.totalCashBalance).toBe(5000);
    expect(summary.totalBankBalance).toBe(25000);
    expect(summary.totalLiquidBalance).toBe(30000);
    expect(summary.accountBalances['ACC_CASH']).toBe(5000);
    expect(summary.accountBalances['ACC_BANK_1']).toBe(25000);
  });

  it('TC-CSHB-02: Upfront cash sale increases ACC_CASH and reflects in totalLiquidBalance', () => {
    const invoice: Partial<Invoice> = {
      id: 'INV-1',
      invoiceNumber: 'INV-001',
      paidAmount: 2000,
      grandTotal: 2000,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      items: [],
      date: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      invoices: [invoice as Invoice],
    });
    expect(summary.totalCashBalance).toBe(7000);
    expect(summary.totalBankBalance).toBe(25000);
    expect(summary.totalLiquidBalance).toBe(32000);
  });

  it('TC-CSHB-03: Upfront UPI / bank sale increases default bank account', () => {
    const invoice: Partial<Invoice> = {
      id: 'INV-2',
      invoiceNumber: 'INV-002',
      paidAmount: 3000,
      grandTotal: 3000,
      paymentMode: 'UPI',
      paymentStatus: 'PAID',
      items: [],
      date: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      invoices: [invoice as Invoice],
    });
    expect(summary.totalCashBalance).toBe(5000);
    expect(summary.totalBankBalance).toBe(28000);
    expect(summary.totalLiquidBalance).toBe(33000);
  });

  it('TC-CSHB-04: Split payment sale (Cash + UPI) proportionately increases cash and bank accounts', () => {
    const invoice: Partial<Invoice> = {
      id: 'INV-3',
      invoiceNumber: 'INV-003',
      paidAmount: 2500,
      grandTotal: 2500,
      paymentMode: 'SPLIT',
      paymentStatus: 'PAID',
      paymentSplits: [
        { id: '1', mode: 'CASH', amount: 1000 },
        { id: '2', mode: 'UPI', amount: 1500 },
      ],
      items: [],
      date: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      invoices: [invoice as Invoice],
    });
    expect(summary.totalCashBalance).toBe(6000);
    expect(summary.totalBankBalance).toBe(26500);
    expect(summary.totalLiquidBalance).toBe(32500);
  });

  it('TC-CSHB-05: Credit sale with zero paid amount does NOT affect cash or bank balance', () => {
    const invoice: Partial<Invoice> = {
      id: 'INV-4',
      invoiceNumber: 'INV-004',
      paidAmount: 0,
      balanceAmount: 5000,
      grandTotal: 5000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      items: [],
      date: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      invoices: [invoice as Invoice],
    });
    expect(summary.totalCashBalance).toBe(5000);
    expect(summary.totalBankBalance).toBe(25000);
    expect(summary.totalLiquidBalance).toBe(30000);
  });

  it('TC-CSHB-06: Sales covered by receipt vouchers do NOT double-count upfront cash/bank movements', () => {
    const invoice: Partial<Invoice> = {
      id: 'INV-5',
      invoiceNumber: 'INV-005',
      partyId: 'PTY-101',
      paidAmount: 1000,
      grandTotal: 1000,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      items: [],
      date: '2026-10-01',
    };
    const receiptVoucher: Voucher = {
      id: 'VCH-RCPT-1',
      voucherNumber: 'RCPT-001',
      voucherType: 'RECEIPT',
      date: '2026-10-01',
      entries: [
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 1000, credit: 0 },
        { accountId: 'PTY-101', accountName: 'Party', debit: 0, credit: 1000 },
      ],
      narration: 'Receipt',
      totalAmount: 1000,
      createdAt: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      invoices: [invoice as Invoice],
      vouchers: [receiptVoucher],
    });
    // Increased by 1000 exactly once (from voucher), not 2000!
    expect(summary.totalCashBalance).toBe(6000);
    expect(summary.totalLiquidBalance).toBe(31000);
  });

  it('TC-CSHB-07: Upfront cash purchase decreases ACC_CASH', () => {
    const purchase: Partial<PurchaseBill> = {
      id: 'PUR-1',
      billNumber: 'BILL-001',
      paidAmount: 1500,
      grandTotal: 1500,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      items: [],
      date: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      purchases: [purchase as PurchaseBill],
    });
    expect(summary.totalCashBalance).toBe(3500);
    expect(summary.totalLiquidBalance).toBe(28500);
  });

  it('TC-CSHB-08: Upfront bank purchase decreases default bank account', () => {
    const purchase: Partial<PurchaseBill> = {
      id: 'PUR-2',
      billNumber: 'BILL-002',
      paidAmount: 4000,
      grandTotal: 4000,
      paymentMode: 'NET_BANKING',
      paymentStatus: 'PAID',
      items: [],
      date: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      purchases: [purchase as PurchaseBill],
    });
    expect(summary.totalBankBalance).toBe(21000);
    expect(summary.totalLiquidBalance).toBe(26000);
  });

  it('TC-CSHB-09: Cash and bank expenses correctly decrease respective accounts', () => {
    const expCash: Partial<Expense> = {
      id: 'EXP-1',
      title: 'Office Snacks',
      amount: 500,
      paymentMode: 'CASH',
      date: '2026-10-01',
    };
    const expBank: Partial<Expense> = {
      id: 'EXP-2',
      title: 'Cloud Server',
      amount: 1200,
      paymentMode: 'UPI',
      date: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      expenses: [expCash as Expense, expBank as Expense],
    });
    expect(summary.totalCashBalance).toBe(4500);
    expect(summary.totalBankBalance).toBe(23800);
    expect(summary.totalLiquidBalance).toBe(28300);
  });

  it('TC-CSHB-10: Contra Cash Deposit (DEPOSIT) decreases cash, increases bank, liquid balance unchanged', () => {
    const txn: CashBankTransaction = {
      id: 'TXN-1',
      txnNumber: 'TXN-001',
      type: 'DEPOSIT',
      fromAccountId: 'ACC_CASH',
      toAccountId: 'ACC_BANK_1',
      amount: 2000,
      description: 'Cash deposit to bank',
      date: '2026-10-01',
      createdAt: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      transactions: [txn],
    });
    expect(summary.totalCashBalance).toBe(3000);
    expect(summary.totalBankBalance).toBe(27000);
    expect(summary.totalLiquidBalance).toBe(30000); // Invariant holds!
  });

  it('TC-CSHB-11: Contra Cash Withdrawal (WITHDRAWAL) decreases bank, increases cash, liquid balance unchanged', () => {
    const txn: CashBankTransaction = {
      id: 'TXN-2',
      txnNumber: 'TXN-002',
      type: 'WITHDRAWAL',
      fromAccountId: 'ACC_BANK_1',
      toAccountId: 'ACC_CASH',
      amount: 1000,
      description: 'Cash withdrawal from ATM',
      date: '2026-10-01',
      createdAt: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      transactions: [txn],
    });
    expect(summary.totalBankBalance).toBe(24000);
    expect(summary.totalCashBalance).toBe(6000);
    expect(summary.totalLiquidBalance).toBe(30000); // Invariant holds!
  });

  it('TC-CSHB-12: Inter-Bank Transfer (TRANSFER) moves funds between bank accounts, total bank balance unchanged', () => {
    const bankB: BankAccount = {
      id: 'ACC_BANK_2',
      accountName: 'ICICI Bank',
      accountType: 'BANK',
      openingBalance: 10000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const txn: CashBankTransaction = {
      id: 'TXN-3',
      txnNumber: 'TXN-003',
      type: 'TRANSFER',
      fromAccountId: 'ACC_BANK_1',
      toAccountId: 'ACC_BANK_2',
      amount: 5000,
      description: 'Fund transfer to ICICI',
      date: '2026-10-01',
      createdAt: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      accounts: [cashAccount, defaultBank, bankB],
      invoices: [],
      purchases: [],
      expenses: [],
      vouchers: [],
      transactions: [txn],
    });
    expect(summary.accountBalances['ACC_BANK_1']).toBe(20000);
    expect(summary.accountBalances['ACC_BANK_2']).toBe(15000);
    expect(summary.totalBankBalance).toBe(35000); // 25000 + 10000 unchanged!
  });

  it('TC-CSHB-13: ADD_MONEY increases target account; REDUCE_MONEY decreases target account', () => {
    const addTxn: CashBankTransaction = {
      id: 'TXN-4',
      txnNumber: 'TXN-004',
      type: 'ADD_MONEY',
      toAccountId: 'ACC_BANK_1',
      amount: 10000,
      description: 'Capital Infusion',
      date: '2026-10-01',
      createdAt: '2026-10-01',
    };
    const redTxn: CashBankTransaction = {
      id: 'TXN-5',
      txnNumber: 'TXN-005',
      type: 'REDUCE_MONEY',
      fromAccountId: 'ACC_CASH',
      amount: 2000,
      description: 'Owner Drawings',
      date: '2026-10-01',
      createdAt: '2026-10-01',
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      transactions: [addTxn, redTxn],
    });
    expect(summary.accountBalances['ACC_BANK_1']).toBe(35000);
    expect(summary.accountBalances['ACC_CASH']).toBe(3000);
    expect(summary.totalLiquidBalance).toBe(38000);
  });

  it('TC-CSHB-14: Transactions matching today date correctly aggregate into todayInflow and todayOutflow', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayInvoice: Partial<Invoice> = {
      id: 'INV-TDY',
      invoiceNumber: 'INV-TDY',
      paidAmount: 500,
      grandTotal: 500,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      items: [],
      date: todayStr,
    };
    const todayExpense: Partial<Expense> = {
      id: 'EXP-TDY',
      title: 'Tea',
      amount: 50,
      paymentMode: 'CASH',
      date: todayStr,
    };
    const summary = computeCashBankSummary({
      ...baseParams,
      invoices: [todayInvoice as Invoice],
      expenses: [todayExpense as Expense],
    });
    expect(summary.todayInflow).toBe(500);
    expect(summary.todayOutflow).toBe(50);
  });
});
