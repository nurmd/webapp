import type { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import type { Invoice } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import type { Expense } from '../../models/expense.ts';
import type { InventoryItem } from '../../models/item.ts';
import type { Party } from '../../models/party.ts';
import type { LoanAccount } from '../../models/loan.ts';
import { computeCashBankSummary } from './cashBankCalculator.ts';
import { aggregateStockValuation, computeTradingProfitAndStockSummary, aggregateGstr3b } from '../../components/Reports/utils/reportAggregations.ts';
import { toPaise, fromPaise, addPaise, subPaise, absPaise } from '../money.ts';

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

  const cashBalancePaise = Math.max(0, toPaise(cashBankSummary.totalCashBalance));
  const bankBalancePaise = Math.max(0, toPaise(cashBankSummary.totalBankBalance));

  // 2. Inventory Valuation
  const stockVal = aggregateStockValuation(items);
  const closingStockValuationPaise = toPaise(stockVal.purchaseValuation);

  // 3. Receivables (Sundry Debtors)
  // Total money to collect from customers
  let totalReceivablesPaise = 0;
  for (const p of parties) {
    if (p.type === 'CUSTOMER') {
      const balPaise = toPaise(p.currentBalance || 0);
      if (balPaise > 0) {
        totalReceivablesPaise = addPaise(totalReceivablesPaise, balPaise);
      }
    }
  }
  // Fallback to invoice balances if party balances not yet populated
  if (totalReceivablesPaise === 0) {
    for (const inv of invoices) {
      if (!inv.isCancelled && inv.balanceAmount) {
        const invBalPaise = toPaise(inv.balanceAmount);
        if (invBalPaise > 0) {
          totalReceivablesPaise = addPaise(totalReceivablesPaise, invBalPaise);
        }
      }
    }
  }

  // 4. Input Tax Credit (ITC Available)
  const gstr3b = aggregateGstr3b(invoices, purchases, expenses);
  const itcBalancePaise = Math.max(0, subPaise(toPaise(gstr3b.totalItc), toPaise(gstr3b.totalOutwardTax)));

  // Current Assets List
  const currentAssetItems: BalanceSheetItem[] = [
    { id: 'ca-cash', name: 'Cash in Hand (Liquid Cash)', amount: fromPaise(cashBalancePaise), note: 'From Cash Register' },
    { id: 'ca-bank', name: 'Bank Balances (In Hand)', amount: fromPaise(bankBalancePaise), note: `${accounts.filter(a => a.accountType === 'BANK').length} active bank accounts` },
    { id: 'ca-debtors', name: 'Sundry Debtors (Accounts Receivable)', amount: fromPaise(totalReceivablesPaise), note: 'Customer ledger balances' },
    { id: 'ca-stock', name: 'Closing Inventory (Stock @ Cost)', amount: fromPaise(closingStockValuationPaise), note: `${stockVal.totalQuantity} units in stock` },
    { id: 'ca-itc', name: 'Unutilized Input Tax Credit (ITC)', amount: fromPaise(itcBalancePaise), note: 'GST Input ledger available' },
  ];

  let totalCurrentAssetsPaise = 0;
  totalCurrentAssetsPaise = addPaise(totalCurrentAssetsPaise, cashBalancePaise);
  totalCurrentAssetsPaise = addPaise(totalCurrentAssetsPaise, bankBalancePaise);
  totalCurrentAssetsPaise = addPaise(totalCurrentAssetsPaise, totalReceivablesPaise);
  totalCurrentAssetsPaise = addPaise(totalCurrentAssetsPaise, closingStockValuationPaise);
  totalCurrentAssetsPaise = addPaise(totalCurrentAssetsPaise, itcBalancePaise);

  // Fixed Assets (Equipment, Vehicles, Furniture)
  const fixedAssetItems: BalanceSheetItem[] = [];
  const totalFixedAssetsPaise = 0;
  const totalAssetsPaise = addPaise(totalCurrentAssetsPaise, totalFixedAssetsPaise);

  // 5. Current Liabilities
  // Sundry Creditors (Suppliers to Pay)
  let totalPayablesPaise = 0;
  for (const p of parties) {
    if (p.type === 'SUPPLIER') {
      const balPaise = toPaise(p.currentBalance || 0);
      if (balPaise < 0) {
        totalPayablesPaise = addPaise(totalPayablesPaise, absPaise(balPaise));
      }
    }
  }
  if (totalPayablesPaise === 0) {
    for (const pur of purchases) {
      if (!pur.isCancelled && pur.balanceAmount) {
        const purBalPaise = toPaise(pur.balanceAmount);
        if (purBalPaise > 0) {
          totalPayablesPaise = addPaise(totalPayablesPaise, purBalPaise);
        }
      }
    }
  }

  // GST Output Liability
  const gstLiabilityPaise = toPaise(gstr3b.netCashPayable);

  const currentLiabilityItems: BalanceSheetItem[] = [
    { id: 'cl-creditors', name: 'Sundry Creditors (Accounts Payable)', amount: fromPaise(totalPayablesPaise), note: 'Supplier ledger balances' },
    { id: 'cl-gst', name: 'Net GST Tax Payable (Output Liability)', amount: fromPaise(gstLiabilityPaise), note: 'After ITC offset' },
  ];

  const totalCurrentLiabilitiesPaise = addPaise(totalPayablesPaise, gstLiabilityPaise);

  // 6. Non-Current Liabilities (Loans & Borrowings)
  const nonCurrentLiabilityItems: BalanceSheetItem[] = [];
  let totalLoansOutstandingPaise = 0;
  for (const loan of loans) {
    if (loan.status === 'ACTIVE') {
      const loanPaise = toPaise(loan.currentPrincipalOutstanding || 0);
      totalLoansOutstandingPaise = addPaise(totalLoansOutstandingPaise, loanPaise);
      nonCurrentLiabilityItems.push({
        id: `ncl-loan-${loan.id}`,
        name: `${loan.lenderName} (${loan.loanType.replace(/_/g, ' ')})`,
        amount: fromPaise(loanPaise),
        note: `Rate: ${loan.interestRateAnnual}% • Principal remaining`,
      });
    }
  }

  const totalNonCurrentLiabilitiesPaise = totalLoansOutstandingPaise;
  const totalLiabilitiesPaise = addPaise(totalCurrentLiabilitiesPaise, totalNonCurrentLiabilitiesPaise);

  // 7. Equity & Net Profit
  const tradingSummary = computeTradingProfitAndStockSummary(invoices, purchases, expenses, items);
  const netProfitPaise = toPaise(tradingSummary.netProfit);

  // Baseline owner's equity balances the fundamental accounting equation: Assets = Liabilities + Equity
  const rawEquityPaise = subPaise(subPaise(totalAssetsPaise, totalLiabilitiesPaise), netProfitPaise);
  const ownerCapitalPaise = Math.max(0, rawEquityPaise);

  const equityItems: BalanceSheetItem[] = [
    { id: 'eq-capital', name: "Owner's Capital / Initial Equity", amount: fromPaise(ownerCapitalPaise), note: 'Capital invested in business' },
    { id: 'eq-profit', name: 'Retained Net Profit / (Loss)', amount: fromPaise(netProfitPaise), note: netProfitPaise >= 0 ? 'Surplus from operations' : 'Operating deficit' },
  ];

  const totalEquityPaise = addPaise(ownerCapitalPaise, netProfitPaise);
  const totalLiabilitiesAndEquityPaise = addPaise(totalLiabilitiesPaise, totalEquityPaise);

  const variancePaise = subPaise(totalAssetsPaise, totalLiabilitiesAndEquityPaise);
  const isBalanced = Math.abs(variancePaise) < 100;

  return {
    asOfDate,
    currentAssets: { title: 'Current Assets', total: fromPaise(totalCurrentAssetsPaise), items: currentAssetItems },
    fixedAssets: { title: 'Fixed & Non-Current Assets', total: fromPaise(totalFixedAssetsPaise), items: fixedAssetItems },
    totalAssets: fromPaise(totalAssetsPaise),
    currentLiabilities: { title: 'Current Liabilities', total: fromPaise(totalCurrentLiabilitiesPaise), items: currentLiabilityItems },
    nonCurrentLiabilities: { title: 'Long-Term Borrowings & Loans', total: fromPaise(totalNonCurrentLiabilitiesPaise), items: nonCurrentLiabilityItems },
    totalLiabilities: fromPaise(totalLiabilitiesPaise),
    equity: { title: "Owner's Equity & Retained Earnings", total: fromPaise(totalEquityPaise), items: equityItems },
    totalEquity: fromPaise(totalEquityPaise),
    totalLiabilitiesAndEquity: fromPaise(totalLiabilitiesAndEquityPaise),
    isBalanced,
    variance: fromPaise(variancePaise),
  };
}
