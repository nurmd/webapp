import type { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import type { Invoice } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import type { Expense } from '../../models/expense.ts';
import type { InventoryItem } from '../../models/item.ts';
import type { Party } from '../../models/party.ts';
import type { LoanAccount } from '../../models/loan.ts';
import { computeCashBankSummary } from './cashBankCalculator.ts';
import { aggregateStockValuation, computeTradingProfitAndStockSummary, aggregateGstr3b } from '../../components/Reports/utils/reportAggregations.ts';

export interface BalanceSheetItem {
  id: string;
  name: string;
  amount: number;
  note?: string;
}

export interface BalanceSheetSection {
  title: string;
  total: number;
  items: BalanceSheetItem[];
}

export interface BalanceSheetResult {
  asOfDate: string;
  // Assets
  currentAssets: BalanceSheetSection;
  fixedAssets: BalanceSheetSection;
  totalAssets: number;
  // Liabilities
  currentLiabilities: BalanceSheetSection;
  nonCurrentLiabilities: BalanceSheetSection;
  totalLiabilities: number;
  // Equity
  equity: BalanceSheetSection;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  // Balance status
  isBalanced: boolean;
  variance: number;
}

export function computeBalanceSheetSummary(params: {
  asOfDate?: string;
  accounts: BankAccount[];
  transactions: CashBankTransaction[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  items: InventoryItem[];
  parties: Party[];
  loans?: LoanAccount[];
}): BalanceSheetResult {
  const {
    asOfDate = new Date().toISOString().split('T')[0],
    accounts = [],
    transactions = [],
    invoices = [],
    purchases = [],
    expenses = [],
    items = [],
    parties = [],
    loans = [],
  } = params;

  // 1. Compute Liquid Balances (Cash & Bank)
  const cashBankSummary = computeCashBankSummary({
    accounts,
    invoices,
    purchases,
    expenses,
    transactions,
  });

  const cashBalance = Math.max(0, cashBankSummary.totalCashBalance);
  const bankBalance = Math.max(0, cashBankSummary.totalBankBalance);

  // 2. Inventory Valuation
  const stockVal = aggregateStockValuation(items);
  const closingStockValuation = stockVal.purchaseValuation;

  // 3. Receivables (Sundry Debtors)
  // Total money to collect from customers
  let totalReceivables = 0;
  for (const p of parties) {
    if (p.type === 'CUSTOMER' && (p.currentBalance || 0) > 0) {
      totalReceivables += p.currentBalance || 0;
    }
  }
  // Fallback to invoice balances if party balances not yet populated
  if (totalReceivables === 0) {
    for (const inv of invoices) {
      if (!inv.isCancelled && inv.balanceAmount && inv.balanceAmount > 0) {
        totalReceivables += inv.balanceAmount;
      }
    }
  }

  // 4. Input Tax Credit (ITC Available)
  const gstr3b = aggregateGstr3b(invoices, purchases, expenses);
  const itcBalance = Math.max(0, gstr3b.totalItc - gstr3b.totalOutwardTax);

  // Current Assets List
  const currentAssetItems: BalanceSheetItem[] = [
    { id: 'ca-cash', name: 'Cash in Hand (Liquid Cash)', amount: cashBalance, note: 'From Cash Register' },
    { id: 'ca-bank', name: 'Bank Balances (In Hand)', amount: bankBalance, note: `${accounts.filter(a => a.accountType === 'BANK').length} active bank accounts` },
    { id: 'ca-debtors', name: 'Sundry Debtors (Accounts Receivable)', amount: totalReceivables, note: 'Customer ledger balances' },
    { id: 'ca-stock', name: 'Closing Inventory (Stock @ Cost)', amount: closingStockValuation, note: `${stockVal.totalQuantity} units in stock` },
    { id: 'ca-itc', name: 'Unutilized Input Tax Credit (ITC)', amount: itcBalance, note: 'GST Input ledger available' },
  ];

  const totalCurrentAssets = currentAssetItems.reduce((s, i) => s + i.amount, 0);

  // Fixed Assets (Equipment, Vehicles, Furniture)
  const fixedAssetItems: BalanceSheetItem[] = [];
  const totalFixedAssets = fixedAssetItems.reduce((s, i) => s + i.amount, 0);
  const totalAssets = Math.round((totalCurrentAssets + totalFixedAssets) * 100) / 100;

  // 5. Current Liabilities
  // Sundry Creditors (Suppliers to Pay)
  let totalPayables = 0;
  for (const p of parties) {
    if (p.type === 'SUPPLIER' && (p.currentBalance || 0) < 0) {
      totalPayables += Math.abs(p.currentBalance || 0);
    }
  }
  if (totalPayables === 0) {
    for (const pur of purchases) {
      if (!pur.isCancelled && pur.balanceAmount && pur.balanceAmount > 0) {
        totalPayables += pur.balanceAmount;
      }
    }
  }

  // GST Output Liability
  const gstLiability = gstr3b.netCashPayable;

  const currentLiabilityItems: BalanceSheetItem[] = [
    { id: 'cl-creditors', name: 'Sundry Creditors (Accounts Payable)', amount: totalPayables, note: 'Supplier ledger balances' },
    { id: 'cl-gst', name: 'Net GST Tax Payable (Output Liability)', amount: gstLiability, note: 'After ITC offset' },
  ];

  const totalCurrentLiabilities = currentLiabilityItems.reduce((s, i) => s + i.amount, 0);

  // 6. Non-Current Liabilities (Loans & Borrowings)
  const nonCurrentLiabilityItems: BalanceSheetItem[] = [];
  let totalLoansOutstanding = 0;
  for (const loan of loans) {
    if (loan.status === 'ACTIVE') {
      const amt = loan.currentPrincipalOutstanding || 0;
      totalLoansOutstanding += amt;
      nonCurrentLiabilityItems.push({
        id: `ncl-loan-${loan.id}`,
        name: `${loan.lenderName} (${loan.loanType.replace(/_/g, ' ')})`,
        amount: amt,
        note: `Rate: ${loan.interestRateAnnual}% • Principal remaining`,
      });
    }
  }

  const totalNonCurrentLiabilities = totalLoansOutstanding;
  const totalLiabilities = Math.round((totalCurrentLiabilities + totalNonCurrentLiabilities) * 100) / 100;

  // 7. Equity & Net Profit
  const tradingSummary = computeTradingProfitAndStockSummary(invoices, purchases, expenses, items);
  const netProfit = tradingSummary.netProfit;

  // Baseline owner's equity balances the fundamental accounting equation: Assets = Liabilities + Equity
  const rawEquity = totalAssets - totalLiabilities - netProfit;
  const ownerCapital = Math.max(0, Math.round(rawEquity * 100) / 100);

  const equityItems: BalanceSheetItem[] = [
    { id: 'eq-capital', name: "Owner's Capital / Initial Equity", amount: ownerCapital, note: 'Capital invested in business' },
    { id: 'eq-profit', name: 'Retained Net Profit / (Loss)', amount: netProfit, note: netProfit >= 0 ? 'Surplus from operations' : 'Operating deficit' },
  ];

  const totalEquity = Math.round(equityItems.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100;

  const variance = Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100;
  const isBalanced = Math.abs(variance) < 1;

  return {
    asOfDate,
    currentAssets: { title: 'Current Assets', total: totalCurrentAssets, items: currentAssetItems },
    fixedAssets: { title: 'Fixed & Non-Current Assets', total: totalFixedAssets, items: fixedAssetItems },
    totalAssets,
    currentLiabilities: { title: 'Current Liabilities', total: totalCurrentLiabilities, items: currentLiabilityItems },
    nonCurrentLiabilities: { title: 'Long-Term Borrowings & Loans', total: totalNonCurrentLiabilities, items: nonCurrentLiabilityItems },
    totalLiabilities,
    equity: { title: "Owner's Equity & Retained Earnings", total: totalEquity, items: equityItems },
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced,
    variance,
  };
}
