import type { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import type { Invoice } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import type { Expense } from '../../models/expense.ts';
import type { Voucher } from './voucherTypes.ts';
import type { LoanTransaction } from '../../models/loan.ts';

export interface CashFlowLineItem {
  id: string;
  date: string;
  title: string;
  category: 'OPERATING' | 'FINANCING' | 'INVESTING';
  flow: 'INFLOW' | 'OUTFLOW';
  amount: number;
  mode: string;
  referenceNo?: string;
  counterparty?: string;
}

export interface CashFlowSection {
  title: string;
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  items: CashFlowLineItem[];
}

export interface CashFlowStatementResult {
  openingLiquidBalance: number;
  operatingActivities: CashFlowSection;
  financingActivities: CashFlowSection;
  investingActivities: CashFlowSection;
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  closingLiquidBalance: number;
}

export function computeCashFlowStatement(params: {
  accounts: BankAccount[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  vouchers?: Voucher[];
  transactions?: CashBankTransaction[];
  loanTransactions?: LoanTransaction[];
}): CashFlowStatementResult {
  const {
    accounts = [],
    invoices = [],
    purchases = [],
    expenses = [],
    vouchers = [],
    transactions = [],
    loanTransactions = [],
  } = params;

  // 1. Opening balance from all cash and bank accounts
  const openingLiquidBalance = accounts.reduce((sum, a) => sum + (a.openingBalance || 0), 0);

  const operatingItems: CashFlowLineItem[] = [];
  const financingItems: CashFlowLineItem[] = [];
  const investingItems: CashFlowLineItem[] = [];

  // Track party receipts from vouchers to avoid duplicate counting
  const partyReceiptsHandled = new Set<string>();

  // A. Operating Activities - Inflows from Sales
  for (const inv of invoices) {
    if (inv.isCancelled) continue;
    const paid = typeof inv.paidAmount === 'number'
      ? inv.paidAmount
      : (inv.paymentStatus === 'PAID' ? inv.grandTotal : 0);

    if (paid > 0 && inv.paymentMode !== 'CREDIT') {
      operatingItems.push({
        id: `op-sale-${inv.id}`,
        date: inv.date,
        title: `Sales Receipt (${inv.invoiceNumber})`,
        category: 'OPERATING',
        flow: 'INFLOW',
        amount: paid,
        mode: inv.paymentMode || 'CASH',
        counterparty: inv.partyName,
        referenceNo: inv.invoiceNumber,
      });
    }
  }

  // A. Operating Activities - Vouchers (Customer Receipts & Supplier Payments)
  for (const v of vouchers) {
    if (v.isReversed || v.isCancelled) continue;
    if (v.voucherType === 'RECEIPT') {
      const partyEntry = v.entries.find((e) => e.accountId !== 'ACC_CASH' && e.accountId !== 'ACC_BANK');
      operatingItems.push({
        id: `op-vouch-rcpt-${v.id}`,
        date: v.date,
        title: `Customer Payment Received (${v.voucherNumber})`,
        category: 'OPERATING',
        flow: 'INFLOW',
        amount: v.totalAmount,
        mode: 'VOUCHER',
        counterparty: partyEntry?.accountName || 'Customer',
        referenceNo: v.referenceNo || v.voucherNumber,
      });
    } else if (v.voucherType === 'PAYMENT') {
      const partyEntry = v.entries.find((e) => e.accountId !== 'ACC_CASH' && e.accountId !== 'ACC_BANK');
      operatingItems.push({
        id: `op-vouch-pay-${v.id}`,
        date: v.date,
        title: `Supplier Payment Made (${v.voucherNumber})`,
        category: 'OPERATING',
        flow: 'OUTFLOW',
        amount: v.totalAmount,
        mode: 'VOUCHER',
        counterparty: partyEntry?.accountName || 'Supplier',
        referenceNo: v.referenceNo || v.voucherNumber,
      });
    }
  }

  // A. Operating Activities - Outflows from Purchases (Direct cash/bank payments)
  for (const pur of purchases) {
    if (pur.isCancelled) continue;
    const paid = typeof pur.paidAmount === 'number'
      ? pur.paidAmount
      : (pur.paymentStatus === 'PAID' ? pur.grandTotal : 0);

    if (paid > 0) {
      operatingItems.push({
        id: `op-pur-${pur.id}`,
        date: pur.date,
        title: `Purchase Payment (${pur.billNumber})`,
        category: 'OPERATING',
        flow: 'OUTFLOW',
        amount: paid,
        mode: pur.paymentMode || 'BANK',
        counterparty: pur.supplierName,
        referenceNo: pur.billNumber,
      });
    }
  }

  // A. Operating Activities - Outflows from Operating Expenses
  for (const exp of expenses) {
    operatingItems.push({
      id: `op-exp-${exp.id}`,
      date: exp.date,
      title: `Expense: ${exp.category || 'General Operational'}`,
      category: 'OPERATING',
      flow: 'OUTFLOW',
      amount: exp.amount || 0,
      mode: exp.paymentMode || 'CASH',
      counterparty: exp.vendorName || exp.title,
      referenceNo: exp.voucherNumber,
    });
  }

  // B. Financing Activities - Direct Capital, Drawings & Loans
  for (const txn of transactions) {
    if (txn.type === 'ADD_MONEY') {
      financingItems.push({
        id: `fin-in-${txn.id}`,
        date: txn.date,
        title: `Direct Capital / Inflow (${txn.description || 'Capital Addition'})`,
        category: 'FINANCING',
        flow: 'INFLOW',
        amount: txn.amount,
        mode: 'TRANSFER',
        referenceNo: txn.referenceNo || txn.txnNumber,
      });
    } else if (txn.type === 'REDUCE_MONEY') {
      financingItems.push({
        id: `fin-out-${txn.id}`,
        date: txn.date,
        title: `Drawings / Direct Outflow (${txn.description || 'Drawings'})`,
        category: 'FINANCING',
        flow: 'OUTFLOW',
        amount: txn.amount,
        mode: 'TRANSFER',
        referenceNo: txn.referenceNo || txn.txnNumber,
      });
    } else if (txn.type === 'DEPOSIT' || txn.type === 'WITHDRAWAL' || txn.type === 'TRANSFER') {
      // C. Investing / Contra Transfers
      investingItems.push({
        id: `inv-contra-${txn.id}`,
        date: txn.date,
        title: `Contra Transfer: ${txn.type} (${txn.description || 'Bank Transfer'})`,
        category: 'INVESTING',
        flow: txn.type === 'DEPOSIT' ? 'INFLOW' : 'OUTFLOW',
        amount: txn.amount,
        mode: 'CONTRA',
        referenceNo: txn.referenceNo || txn.txnNumber,
      });
    }
  }

  // B. Financing Activities - Loan Transactions
  for (const lTxn of loanTransactions) {
    if (lTxn.type === 'DISBURSEMENT') {
      financingItems.push({
        id: `fin-loan-disb-${lTxn.id}`,
        date: lTxn.date,
        title: `Loan Disbursement Borrowed`,
        category: 'FINANCING',
        flow: 'INFLOW',
        amount: lTxn.totalAmount,
        mode: lTxn.paymentMode,
        referenceNo: lTxn.referenceNo,
      });
    } else {
      financingItems.push({
        id: `fin-loan-pay-${lTxn.id}`,
        date: lTxn.date,
        title: `Loan EMI / Principal Repayment`,
        category: 'FINANCING',
        flow: 'OUTFLOW',
        amount: lTxn.totalAmount,
        mode: lTxn.paymentMode,
        referenceNo: lTxn.referenceNo,
      });
    }
  }

  // Calculate totals per section
  const buildSection = (title: string, items: CashFlowLineItem[]): CashFlowSection => {
    // Sort items by date descending
    items.sort((a, b) => b.date.localeCompare(a.date));
    let totalInflow = 0;
    let totalOutflow = 0;
    for (const item of items) {
      if (item.flow === 'INFLOW') totalInflow += item.amount;
      else totalOutflow += item.amount;
    }
    totalInflow = Math.round(totalInflow * 100) / 100;
    totalOutflow = Math.round(totalOutflow * 100) / 100;
    const netCashFlow = Math.round((totalInflow - totalOutflow) * 100) / 100;
    return { title, totalInflow, totalOutflow, netCashFlow, items };
  };

  const opSection = buildSection('Cash Flow from Operating Activities', operatingItems);
  const finSection = buildSection('Cash Flow from Financing Activities', financingItems);
  const invSection = buildSection('Cash Flow from Investing / Bank Transfers', investingItems);

  const totalInflows = Math.round((opSection.totalInflow + finSection.totalInflow + invSection.totalInflow) * 100) / 100;
  const totalOutflows = Math.round((opSection.totalOutflow + finSection.totalOutflow + invSection.totalOutflow) * 100) / 100;
  const netCashFlow = Math.round((totalInflows - totalOutflows) * 100) / 100;
  const closingLiquidBalance = Math.round((openingLiquidBalance + netCashFlow) * 100) / 100;

  return {
    openingLiquidBalance: Math.round(openingLiquidBalance * 100) / 100,
    operatingActivities: opSection,
    financingActivities: finSection,
    investingActivities: invSection,
    totalInflows,
    totalOutflows,
    netCashFlow,
    closingLiquidBalance,
  };
}
