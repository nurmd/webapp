import { describe, it, expect } from 'vitest';
import { computeCashBankSummary } from '../core/accounting/cashBankCalculator.ts';
import {
  buildCashBankReconciliation,
  buildReconciliationCsvRows,
} from '../core/accounting/cashBankReconciliation.ts';
import type { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../models/bankAccount.ts';
import type { Invoice } from '../models/invoice.ts';
import type { Expense } from '../models/expense.ts';

describe('Cash/Bank Reconciliation Pure Service', () => {
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
    accountName: 'State Bank of India',
    accountType: 'BANK',
    openingBalance: 20000,
    isDefault: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  it('1. Balanced account: opening + sale inflow − expense outflow = closing; no issues; breakdown has SALE and EXPENSE', () => {
    const sale: Partial<Invoice> = {
      id: 'INV-1',
      invoiceNumber: 'INV-001',
      paidAmount: 5000,
      grandTotal: 5000,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      items: [],
      date: '2026-10-10',
    };

    const expense: Partial<Expense> = {
      id: 'EXP-1',
      title: 'Packaging Supplies',
      amount: 2000,
      paymentMode: 'CASH',
      date: '2026-10-11',
    };

    const summary = computeCashBankSummary({
      accounts: [cashAccount],
      invoices: [sale as Invoice],
      purchases: [],
      expenses: [expense as Expense],
      transactions: [],
    });

    const report = buildCashBankReconciliation({
      accounts: [cashAccount],
      summary,
    });

    const cashRec = report.accounts.find((a) => a.accountId === 'ACC_CASH');
    expect(cashRec).toBeDefined();
    expect(cashRec!.status).toBe('balanced');
    expect(cashRec!.openingBalance).toBe(10000);
    expect(cashRec!.totalInflow).toBe(5000);
    expect(cashRec!.totalOutflow).toBe(2000);
    expect(cashRec!.netMovement).toBe(3000);
    expect(cashRec!.computedClosing).toBe(13000);
    expect(cashRec!.ledgerClosing).toBe(13000);
    expect(cashRec!.difference).toBe(0);
    expect(cashRec!.issues).toHaveLength(0);

    const saleBreakdown = cashRec!.breakdown.find((b) => b.source === 'SALE');
    const expenseBreakdown = cashRec!.breakdown.find((b) => b.source === 'EXPENSE');
    expect(saleBreakdown).toBeDefined();
    expect(saleBreakdown!.inflow).toBe(5000);
    expect(saleBreakdown!.count).toBe(1);
    expect(expenseBreakdown).toBeDefined();
    expect(expenseBreakdown!.outflow).toBe(2000);
    expect(expenseBreakdown!.count).toBe(1);
  });

  it('2. Negative account: opening + outflow => negative closing; status === negative; issue NEGATIVE_LEDGER_BALANCE; explanation says not a calculation error', () => {
    const cashSmall: BankAccount = {
      ...cashAccount,
      openingBalance: 1000,
    };

    const expense: Partial<Expense> = {
      id: 'EXP-2',
      title: 'Shop Rent',
      amount: 8000,
      paymentMode: 'CASH',
      date: '2026-10-12',
    };

    const summary = computeCashBankSummary({
      accounts: [cashSmall],
      invoices: [],
      purchases: [],
      expenses: [expense as Expense],
      transactions: [],
    });

    const report = buildCashBankReconciliation({
      accounts: [cashSmall],
      summary,
    });

    const cashRec = report.accounts.find((a) => a.accountId === 'ACC_CASH');
    expect(cashRec).toBeDefined();
    expect(cashRec!.ledgerClosing).toBe(-7000);
    expect(cashRec!.status).toBe('negative');
    expect(report.negativeAccountIds).toContain('ACC_CASH');

    const negIssue = cashRec!.issues.find((i) => i.code === 'NEGATIVE_LEDGER_BALANCE');
    expect(negIssue).toBeDefined();
    expect(negIssue!.severity).toBe('warning');

    const noInflowIssue = cashRec!.issues.find((i) => i.code === 'NO_RECORDED_INFLOW');
    expect(noInflowIssue).toBeDefined();

    expect(cashRec!.explanation).toContain('not a calculation error');

    const { rows } = buildReconciliationCsvRows(report);
    const cashSummaryRow = rows.find(
      (row) => row[0] === 'Account Summary' && row[1] === 'ACC_CASH'
    );
    expect(String(cashSummaryRow?.[10])).toContain('not a calculation error');
  });

  it('3. Negative opening balance: issue NEGATIVE_OPENING_BALANCE', () => {
    const negBank: BankAccount = {
      ...bankAccount,
      openingBalance: -5000,
    };

    const summary = computeCashBankSummary({
      accounts: [negBank],
      invoices: [],
      purchases: [],
      expenses: [],
      transactions: [],
    });

    const report = buildCashBankReconciliation({
      accounts: [negBank],
      summary,
    });

    const bankRec = report.accounts.find((a) => a.accountId === 'ACC_BANK_1');
    expect(bankRec).toBeDefined();
    const openIssue = bankRec!.issues.find((i) => i.code === 'NEGATIVE_OPENING_BALANCE');
    expect(openIssue).toBeDefined();
    expect(openIssue!.severity).toBe('warning');
  });

  it('4. Unconfigured account ID: issue UNCONFIGURED_ACCOUNT, isConfigured === false, appears in unconfiguredAccountIds', () => {
    const summary = {
      accountBalances: {
        ACC_CASH: 5000,
        ACC_GHOST_WALLET: 1200,
      },
      ledgerEntries: [
        {
          id: 'LE-1',
          date: '2026-10-15',
          type: 'DIRECT_IN' as const,
          category: 'BANK' as const,
          accountId: 'ACC_GHOST_WALLET',
          accountName: 'Ghost Wallet',
          counterpartyOrTitle: 'Direct Money In',
          flow: 'IN' as const,
          amount: 1200,
          mode: 'UPI',
        },
      ],
      totalLiquidBalance: 6200,
      totalCashBalance: 5000,
      totalBankBalance: 1200,
    };

    const report = buildCashBankReconciliation({
      accounts: [cashAccount], // ACC_GHOST_WALLET is omitted
      summary,
    });

    expect(report.unconfiguredAccountIds).toContain('ACC_GHOST_WALLET');
    const ghostRec = report.accounts.find((a) => a.accountId === 'ACC_GHOST_WALLET');
    expect(ghostRec).toBeDefined();
    expect(ghostRec!.isConfigured).toBe(false);
    expect(ghostRec!.status).toBe('review');
    expect(ghostRec!.issues.some((i) => i.code === 'UNCONFIGURED_ACCOUNT')).toBe(true);
  });

  it('5. Duplicate candidate: two OUT entries with same account/date/amount/reference are detected; two entries with different references or no reference are not detected', () => {
    const entry1: UnifiedLedgerEntry = {
      id: 'OUT-1',
      date: '2026-10-18',
      type: 'EXPENSE',
      category: 'BANK',
      accountId: 'ACC_BANK_1',
      accountName: 'SBI Account',
      counterpartyOrTitle: 'Vendor Payment',
      flow: 'OUT',
      amount: 4500,
      mode: 'NEFT',
      referenceNo: 'UTR-987654321',
      description: 'Vendor wire payment 1',
    };

    const entry2: UnifiedLedgerEntry = {
      id: 'OUT-2',
      date: '2026-10-18',
      type: 'EXPENSE',
      category: 'BANK',
      accountId: 'ACC_BANK_1',
      accountName: 'SBI Account',
      counterpartyOrTitle: 'Vendor Payment',
      flow: 'OUT',
      amount: 4500,
      mode: 'NEFT',
      referenceNo: 'UTR-987654321',
      description: 'Vendor wire payment 2 duplicate candidate',
    };

    // Different reference
    const entryDiffRef: UnifiedLedgerEntry = {
      id: 'OUT-3',
      date: '2026-10-18',
      type: 'EXPENSE',
      category: 'BANK',
      accountId: 'ACC_BANK_1',
      accountName: 'SBI Account',
      counterpartyOrTitle: 'Vendor Payment',
      flow: 'OUT',
      amount: 4500,
      mode: 'NEFT',
      referenceNo: 'UTR-DIFFERENT-REF',
    };

    // No reference
    const entryNoRefA: UnifiedLedgerEntry = {
      id: 'OUT-4',
      date: '2026-10-19',
      type: 'EXPENSE',
      category: 'CASH',
      accountId: 'ACC_CASH',
      accountName: 'Cash in Hand',
      counterpartyOrTitle: 'Tea',
      flow: 'OUT',
      amount: 100,
      mode: 'CASH',
    };

    const entryNoRefB: UnifiedLedgerEntry = {
      id: 'OUT-5',
      date: '2026-10-19',
      type: 'EXPENSE',
      category: 'CASH',
      accountId: 'ACC_CASH',
      accountName: 'Cash in Hand',
      counterpartyOrTitle: 'Tea',
      flow: 'OUT',
      amount: 100,
      mode: 'CASH',
    };

    const summary = {
      accountBalances: {
        ACC_BANK_1: 11000,
        ACC_CASH: 9800,
      },
      ledgerEntries: [entry1, entry2, entryDiffRef, entryNoRefA, entryNoRefB],
      totalLiquidBalance: 20800,
      totalCashBalance: 9800,
      totalBankBalance: 11000,
    };

    const report = buildCashBankReconciliation({
      accounts: [bankAccount, cashAccount],
      summary,
    });

    expect(report.duplicateCandidates).toHaveLength(1);
    const candidate = report.duplicateCandidates[0];
    expect(candidate.accountId).toBe('ACC_BANK_1');
    expect(candidate.amount).toBe(4500);
    expect(candidate.referenceNo).toBe('UTR-987654321');
    expect(candidate.entryIds).toEqual(['OUT-1', 'OUT-2']);

    const bankRec = report.accounts.find((a) => a.accountId === 'ACC_BANK_1');
    expect(bankRec!.issues.some((i) => i.code === 'DUPLICATE_OUTFLOW_CANDIDATE')).toBe(true);

    const cashRec = report.accounts.find((a) => a.accountId === 'ACC_CASH');
    expect(cashRec!.issues.some((i) => i.code === 'DUPLICATE_OUTFLOW_CANDIDATE')).toBe(false);
  });

  it('6. Ledger mismatch: synthetic summary where ledgerClosing differs from computed closing; issue LEDGER_MISMATCH, status review, difference correct', () => {
    // opening: 10000, inflow: 0, outflow: 0 => computed: 10000
    // but ledgerClosing is 10500 => difference 500
    const summary = {
      accountBalances: {
        ACC_CASH: 10500,
      },
      ledgerEntries: [],
      totalLiquidBalance: 10500,
      totalCashBalance: 10500,
      totalBankBalance: 0,
    };

    const report = buildCashBankReconciliation({
      accounts: [cashAccount],
      summary,
    });

    const cashRec = report.accounts.find((a) => a.accountId === 'ACC_CASH');
    expect(cashRec).toBeDefined();
    expect(cashRec!.status).toBe('review');
    expect(cashRec!.difference).toBe(500);
    const mismatch = cashRec!.issues.find((i) => i.code === 'LEDGER_MISMATCH');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('critical');
  });

  it('7. No mutation: input accounts/summary/entries unchanged after call', () => {
    const accounts = [
      { ...cashAccount },
      { ...bankAccount },
    ];
    const initialAccountsSnapshot = JSON.parse(JSON.stringify(accounts));

    const entries: UnifiedLedgerEntry[] = [
      {
        id: 'E-1',
        date: '2026-10-20',
        type: 'SALE',
        category: 'CASH',
        accountId: 'ACC_CASH',
        accountName: 'Cash',
        counterpartyOrTitle: 'Walk-in',
        flow: 'IN',
        amount: 2500,
        mode: 'CASH',
      },
    ];
    const initialEntriesSnapshot = JSON.parse(JSON.stringify(entries));

    const summary = {
      accountBalances: { ACC_CASH: 12500, ACC_BANK_1: 20000 },
      ledgerEntries: entries,
      totalLiquidBalance: 32500,
      totalCashBalance: 12500,
      totalBankBalance: 20000,
    };
    const initialSummarySnapshot = JSON.parse(JSON.stringify(summary));

    buildCashBankReconciliation({ accounts, summary });

    expect(accounts).toEqual(initialAccountsSnapshot);
    expect(entries).toEqual(initialEntriesSnapshot);
    expect(summary).toEqual(initialSummarySnapshot);
  });

  it('8. CSV rows contain account-summary, source-breakdown, and duplicate-candidate sections when applicable', () => {
    const entryDupA: UnifiedLedgerEntry = {
      id: 'D-1',
      date: '2026-10-21',
      type: 'EXPENSE',
      category: 'BANK',
      accountId: 'ACC_BANK_1',
      accountName: 'SBI Account',
      counterpartyOrTitle: 'Vendor 1',
      flow: 'OUT',
      amount: 1500,
      mode: 'IMPS',
      referenceNo: 'REF-DUP-99',
    };

    const entryDupB: UnifiedLedgerEntry = {
      id: 'D-2',
      date: '2026-10-21',
      type: 'EXPENSE',
      category: 'BANK',
      accountId: 'ACC_BANK_1',
      accountName: 'SBI Account',
      counterpartyOrTitle: 'Vendor 1',
      flow: 'OUT',
      amount: 1500,
      mode: 'IMPS',
      referenceNo: 'REF-DUP-99',
    };

    const summary = {
      accountBalances: { ACC_BANK_1: 17000 },
      ledgerEntries: [entryDupA, entryDupB],
      totalLiquidBalance: 17000,
      totalCashBalance: 0,
      totalBankBalance: 17000,
    };

    const report = buildCashBankReconciliation({
      accounts: [bankAccount],
      summary,
    });

    const { headers, rows } = buildReconciliationCsvRows(report);
    expect(headers).toContain('Section');
    expect(headers).toContain('Account ID');

    const sections = new Set(rows.map((r) => r[0]));
    expect(sections.has('Account Summary')).toBe(true);
    expect(sections.has('Source Breakdown')).toBe(true);
    expect(sections.has('Duplicate Candidate')).toBe(true);
  });

  it('9. Does not flag the calculator’s empty ACC_CASH placeholder when only a bank account is configured', () => {
    const summary = computeCashBankSummary({
      accounts: [bankAccount],
      invoices: [],
      purchases: [],
      expenses: [],
      transactions: [],
    });

    const report = buildCashBankReconciliation({
      accounts: [bankAccount],
      summary,
    });

    expect(report.accounts.map((a) => a.accountId)).toEqual(['ACC_BANK_1']);
    expect(report.unconfiguredAccountIds).not.toContain('ACC_CASH');
  });
});
