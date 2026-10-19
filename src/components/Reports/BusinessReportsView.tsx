import React, { useState, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  ShoppingBag,
  Users,
  Package,
  Waves,
  Scale,
  Landmark,
  CreditCard,
  BookOpen,
} from 'lucide-react';
import type { Invoice } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import type { Expense } from '../../models/expense.ts';
import type { CompanyProfile } from '../../models/company.ts';
import type { InventoryItem } from '../../models/item.ts';
import type { Party } from '../../models/party.ts';
import type { Voucher } from '../../core/accounting/voucherTypes.ts';
import type { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import type { LoanAccount, LoanTransaction } from '../../models/loan.ts';
import { db } from '../../services/db.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { DatePreset, getDateFilterBounds, isDateInRange } from '../../core/utils/dateFilters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

// Hub Components
import { BusinessPerformanceCard } from './BusinessPerformanceCard.tsx';
import { ReportsNavList, ReportCategoryKey } from './ReportsNavList.tsx';
import { DedicatedReportPageHeader, SubReportTabOption } from './DedicatedReportPageHeader.tsx';
import { ReportPdfPreviewModal } from './ReportPdfPreviewModal.tsx';
import { registerReportPreviewHandler, ReportPdfConfig } from './utils/reportExportUtils.ts';

// 5 Operations & Tax Dedicated Category Views
import { GstTaxComplianceCategory } from './categories/GstTaxComplianceCategory.tsx';
import { SalesRevenueCategory } from './categories/SalesRevenueCategory.tsx';
import { PurchasesExpensesCategory } from './categories/PurchasesExpensesCategory.tsx';
import { PartyKhataDuesCategory } from './categories/PartyKhataDuesCategory.tsx';
import { InventoryStockCategory } from './categories/InventoryStockCategory.tsx';

// 4 Financial & Banking Dedicated Category Views
import { CashFlowCategory } from './categories/CashFlowCategory.tsx';
import { BalanceSheetCategory } from './categories/BalanceSheetCategory.tsx';
import { BankStatementCategory } from './categories/BankStatementCategory.tsx';
import { LoanStatementCategory } from './categories/LoanStatementCategory.tsx';
import { DaybookView } from './DaybookView.tsx';

// Aggregations
import {
  computeTradingProfitAndStockSummary,
  aggregateStockValuation,
} from './utils/reportAggregations.ts';
import { computeCashBankSummary } from '../../core/accounting/cashBankCalculator.ts';
import { computeAgingBreakdown } from '../../core/accounting/aging.ts';

export interface BusinessReportsViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  items: InventoryItem[];
  parties: Party[];
  vouchers?: Voucher[];
  bankAccounts?: BankAccount[];
  cashBankTxns?: CashBankTransaction[];
  loans?: LoanAccount[];
  loanTransactions?: LoanTransaction[];
  initialReportPage?: ReportCategoryKey | null;
}

const SUB_REPORTS_MAP: Record<string, SubReportTabOption[]> = {
  gst_tax: [
    { id: 'gstr1', label: 'GSTR-1 Outward' },
    { id: 'gstr3b', label: 'GSTR-3B Tax Offset' },
    { id: 'hsn', label: 'HSN/SAC Summary' },
  ],
  sales_revenue: [
    { id: 'sales_register', label: 'Sales Register' },
    { id: 'item_wise', label: 'Item-Wise Sales & Margin' },
  ],
  purchases_expenses: [
    { id: 'purchase_register', label: 'Purchase Register' },
    { id: 'expense_breakdown', label: 'Expense Category Breakdown' },
  ],
  party_khata: [
    { id: 'receivables_aging', label: 'Receivables Aging' },
    { id: 'payables_aging', label: 'Payables Aging' },
    { id: 'party_ledger', label: 'Party Statements' },
  ],
  inventory_stock: [
    { id: 'stock_valuation', label: 'Stock Summary & Valuation' },
    { id: 'low_stock', label: 'Low Stock Warnings' },
  ],
};

const CATEGORY_META: Record<
  ReportCategoryKey,
  {
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ size?: string | number; className?: string }>;
  }
> = {
  gst_tax: {
    title: 'GST & Tax Compliance',
    subtitle: 'GSTR-1 outward, GSTR-3B tax computation, ITC offset & HSN summary',
    icon: ShieldCheck,
  },
  sales_revenue: {
    title: 'Sales & Revenue Reports',
    subtitle: 'Sales register, bill-wise profitability & item profit margins',
    icon: TrendingUp,
  },
  purchases_expenses: {
    title: 'Purchases & Expenses Reports',
    subtitle: 'Purchase register, vendor bills & 10-category expense breakdown',
    icon: ShoppingBag,
  },
  party_khata: {
    title: 'Party & Khata Dues Ledger',
    subtitle: 'Receivables aging, payables aging & party passbook ledger',
    icon: Users,
  },
  inventory_stock: {
    title: 'Inventory & Stock Valuation',
    subtitle: 'Stock valuation at cost vs retail, low stock & reorder alerts',
    icon: Package,
  },
  cash_flow: {
    title: 'Cash Flow Statement',
    subtitle: 'Operating, financing & investing liquid cash/bank inflows & outflows',
    icon: Waves,
  },
  balance_sheet: {
    title: 'Balance Sheet Statement',
    subtitle: 'Financial position: Current & fixed assets vs. liabilities & equity',
    icon: Scale,
  },
  bank_statement: {
    title: 'Bank Statement & Passbook',
    subtitle: 'Account deposits, withdrawals, UTR references & running balances',
    icon: Landmark,
  },
  loan_statement: {
    title: 'Loan Statement & EMIs',
    subtitle: 'Active loans, borrowings, EMI schedule & principal repayment ledger',
    icon: CreditCard,
  },
  daybook: {
    title: 'Accounting Daybook & Ledger',
    subtitle: 'Automated double-entry general journal vouchers audit trail',
    icon: BookOpen,
  },
};

export const BusinessReportsView: React.FC<BusinessReportsViewProps> = ({
  company,
  invoices,
  purchases,
  expenses,
  items,
  parties,
  vouchers = [],
  bankAccounts,
  cashBankTxns,
  loans,
  loanTransactions,
  initialReportPage = null,
}) => {
  // Navigation State: 'hub' or a specific dedicated report category
  const [activeReportPage, setActiveReportPage] = useState<ReportCategoryKey | 'hub'>(
    initialReportPage || 'hub'
  );

  // Priority 15: Sub-view back navigation back to Reports Hub
  useBackNavigation(() => {
    setActiveReportPage('hub');
    return true;
  }, activeReportPage !== 'hub', 15);

  // Sub-report tab state for reports with multiple tabs
  const [activeSubReport, setActiveSubReport] = useState<string>('gstr1');

  // Filtering State
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fallbacks for bank accounts and loans if not provided in props
  const resolvedBankAccounts = useMemo(() => {
    return bankAccounts && bankAccounts.length > 0 ? bankAccounts : db.getBankAccounts();
  }, [bankAccounts]);

  const resolvedCashBankTxns = useMemo(() => {
    return cashBankTxns && cashBankTxns.length > 0 ? cashBankTxns : db.getCashBankTransactions();
  }, [cashBankTxns]);

  const [localLoans, setLocalLoans] = useState<LoanAccount[]>(() => {
    return loans && loans.length > 0 ? loans : db.getLoans();
  });

  const [localLoanTxns, setLocalLoanTxns] = useState<LoanTransaction[]>(() => {
    return loanTransactions && loanTransactions.length > 0 ? loanTransactions : db.getLoanTransactions();
  });

  const handleSaveLoan = (loan: LoanAccount) => {
    db.saveLoan(loan);
    setLocalLoans(db.getLoans());
  };

  const handleSaveLoanTxn = (txn: LoanTransaction) => {
    db.saveLoanTransaction(txn);
    setLocalLoanTxns(db.getLoanTransactions());
  };

  // Child export handlers ref
  const exportHandlersRef = useRef<{ exportCsv?: () => void; exportPdf?: () => void }>({});

  // Active Report PDF preview modal state
  const [activePdfPreviewConfig, setActivePdfPreviewConfig] = useState<ReportPdfConfig | null>(null);

  React.useEffect(() => {
    registerReportPreviewHandler((config) => {
      setActivePdfPreviewConfig(config);
    });
    return () => {
      registerReportPreviewHandler(null);
    };
  }, []);

  const handleDateRangeChange = (preset: DatePreset, start?: string, end?: string) => {
    setDatePreset(preset);
    if (start) setCustomStart(start);
    if (end) setCustomEnd(end);
  };

  const handleNavigateToReport = (reportKey: ReportCategoryKey) => {
    setActiveReportPage(reportKey);
    const subOptions = SUB_REPORTS_MAP[reportKey];
    if (subOptions && subOptions.length > 0) {
      setActiveSubReport(subOptions[0].id);
    }
    setSearchQuery('');
  };

  // Date Filter Bounds
  const dateBounds = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  // Date filtered records
  const periodInvoices = useMemo(() => {
    return invoices.filter((i) => isDateInRange(i.date, dateBounds.start, dateBounds.end));
  }, [invoices, dateBounds]);

  const periodPurchases = useMemo(() => {
    return purchases.filter((p) => isDateInRange(p.date, dateBounds.start, dateBounds.end));
  }, [purchases, dateBounds]);

  const periodExpenses = useMemo(() => {
    return expenses.filter((e) => isDateInRange(e.date, dateBounds.start, dateBounds.end));
  }, [expenses, dateBounds]);

  // Trading Profit and Stock Summary for the top performance card
  const tradingSummary = useMemo(() => {
    return computeTradingProfitAndStockSummary(
      periodInvoices,
      periodPurchases,
      periodExpenses,
      items
    );
  }, [periodInvoices, periodPurchases, periodExpenses, items]);

  // Inventory valuation summary
  const stockValuation = useMemo(() => {
    return aggregateStockValuation(items);
  }, [items]);

  // Receivables & Payables Aging
  const { receivablesTotal, payablesTotal } = useMemo(() => {
    const recInputs = periodInvoices
      .filter((i) => !i.isCancelled)
      .map((i) => ({
        dueDate: i.dueDate,
        date: i.date,
        balanceDue: i.balanceAmount !== undefined ? i.balanceAmount : i.grandTotal - (i.paidAmount || 0),
        partyId: i.partyId,
        partyName: i.partyName,
      }));
    const recAging = computeAgingBreakdown(recInputs);

    const purInputs = periodPurchases
      .filter((p) => !p.isCancelled)
      .map((p) => ({
        dueDate: p.dueDate,
        date: p.date,
        balanceDue: p.balanceAmount !== undefined ? p.balanceAmount : p.grandTotal - (p.paidAmount || 0),
        partyId: p.supplierId,
        partyName: p.supplierName,
      }));
    const purAging = computeAgingBreakdown(purInputs);

    return {
      receivablesTotal: formatINR(recAging.totalOutstanding),
      payablesTotal: formatINR(purAging.totalOutstanding),
    };
  }, [periodInvoices, periodPurchases]);

  // Liquid Balance
  const cashBankFinancial = useMemo(() => {
    return computeCashBankSummary({
      accounts: resolvedBankAccounts,
      invoices: periodInvoices,
      purchases: periodPurchases,
      expenses: periodExpenses,
      transactions: resolvedCashBankTxns,
    });
  }, [resolvedBankAccounts, periodInvoices, periodPurchases, periodExpenses, resolvedCashBankTxns]);

  // Hub Metrics for selectable list chips
  const hubMetrics = useMemo(() => {
    return {
      gstTaxInvoices: periodInvoices.length + periodPurchases.length,
      salesTotal: formatINR(tradingSummary.totalSales),
      purchasesTotal: formatINR(tradingSummary.totalPurchases),
      receivablesTotal,
      payablesTotal,
      stockValuation: formatINR(stockValuation.purchaseValuation),
      lowStockCount: stockValuation.lowStockCount,
      liquidBalance: formatINR(cashBankFinancial.totalLiquidBalance),
      activeBankCount: resolvedBankAccounts.filter((a) => a.accountType === 'BANK').length,
      activeLoanCount: localLoans.filter((l) => l.status === 'ACTIVE').length,
      voucherCount: vouchers.length,
    };
  }, [
    periodInvoices,
    periodPurchases,
    tradingSummary,
    receivablesTotal,
    payablesTotal,
    stockValuation,
    cashBankFinancial,
    resolvedBankAccounts,
    localLoans,
    vouchers,
  ]);

  // -------------------------------------------------------------
  // TIER 1: REPORTS HUB (Landing view when activeReportPage === 'hub')
  // -------------------------------------------------------------
  if (activeReportPage === 'hub') {
    return (
      <div className="p-2.5 sm:p-5 max-w-7xl mx-auto space-y-3.5 sm:space-y-5">
        {/* Top Business Performance & Profit Card */}
        <BusinessPerformanceCard
          summary={tradingSummary}
          datePreset={datePreset}
          customStart={customStart}
          customEnd={customEnd}
          onSelectDateRange={handleDateRangeChange}
          invoices={invoices}
          purchases={purchases}
          expenses={expenses}
          items={items}
        />

        {/* Selectable Report Navigation List */}
        <ReportsNavList
          onSelectReport={handleNavigateToReport}
          metrics={hubMetrics}
        />

        {/* In-App Report PDF Preview Modal with Hardware & UI Back Navigation */}
        <ReportPdfPreviewModal
          isOpen={Boolean(activePdfPreviewConfig)}
          config={activePdfPreviewConfig}
          onClose={() => setActivePdfPreviewConfig(null)}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // TIER 2: DEDICATED STANDALONE REPORT PAGES
  // -------------------------------------------------------------
  const categoryMeta = CATEGORY_META[activeReportPage];
  const subReportTabs = SUB_REPORTS_MAP[activeReportPage] || [];

  return (
    <div className="p-2.5 sm:p-5 max-w-7xl mx-auto space-y-3.5 sm:space-y-5">
      {/* Universal Standalone Page Header with Back Button */}
      <DedicatedReportPageHeader
        title={categoryMeta.title}
        subtitle={categoryMeta.subtitle}
        icon={categoryMeta.icon}
        onBack={() => setActiveReportPage('hub')}
        datePreset={datePreset}
        customStart={customStart}
        customEnd={customEnd}
        onSelectDateRange={handleDateRangeChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        subReports={subReportTabs}
        activeSubReport={activeSubReport}
        onSelectSubReport={setActiveSubReport}
        onExportPdf={() => exportHandlersRef.current.exportPdf?.()}
        onExportExcel={() => exportHandlersRef.current.exportCsv?.()}
      />

      {/* Dedicated Category Report View */}
      <main>
        {activeReportPage === 'gst_tax' && (
          <GstTaxComplianceCategory
            company={company}
            invoices={periodInvoices}
            purchases={periodPurchases}
            expenses={periodExpenses}
            subReport={activeSubReport}
            searchQuery={searchQuery}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'sales_revenue' && (
          <SalesRevenueCategory
            company={company}
            invoices={periodInvoices}
            items={items}
            subReport={activeSubReport}
            searchQuery={searchQuery}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'purchases_expenses' && (
          <PurchasesExpensesCategory
            company={company}
            purchases={periodPurchases}
            expenses={periodExpenses}
            subReport={activeSubReport}
            searchQuery={searchQuery}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'party_khata' && (
          <PartyKhataDuesCategory
            company={company}
            parties={parties}
            invoices={periodInvoices}
            purchases={periodPurchases}
            vouchers={vouchers}
            subReport={activeSubReport}
            searchQuery={searchQuery}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'inventory_stock' && (
          <InventoryStockCategory
            company={company}
            items={items}
            subReport={activeSubReport}
            searchQuery={searchQuery}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'cash_flow' && (
          <CashFlowCategory
            company={company}
            accounts={resolvedBankAccounts}
            invoices={periodInvoices}
            purchases={periodPurchases}
            expenses={periodExpenses}
            vouchers={vouchers}
            transactions={resolvedCashBankTxns}
            loans={localLoans}
            loanTransactions={localLoanTxns}
            searchQuery={searchQuery}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'balance_sheet' && (
          <BalanceSheetCategory
            company={company}
            accounts={resolvedBankAccounts}
            transactions={resolvedCashBankTxns}
            invoices={periodInvoices}
            purchases={periodPurchases}
            expenses={periodExpenses}
            items={items}
            parties={parties}
            loans={localLoans}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'bank_statement' && (
          <BankStatementCategory
            company={company}
            accounts={resolvedBankAccounts}
            transactions={resolvedCashBankTxns}
            invoices={periodInvoices}
            purchases={periodPurchases}
            expenses={periodExpenses}
            vouchers={vouchers}
            searchQuery={searchQuery}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'loan_statement' && (
          <LoanStatementCategory
            company={company}
            loans={localLoans}
            loanTransactions={localLoanTxns}
            onSaveLoan={handleSaveLoan}
            onSaveLoanTransaction={handleSaveLoanTxn}
            searchQuery={searchQuery}
            dateRangeLabel={dateBounds.label}
            onRegisterExportHandlers={(handlers) => {
              exportHandlersRef.current = handlers;
            }}
          />
        )}

        {activeReportPage === 'daybook' && (
          <DaybookView vouchers={vouchers} />
        )}
      </main>

      {/* In-App Report PDF Preview Modal with Hardware & UI Back Navigation */}
      <ReportPdfPreviewModal
        isOpen={Boolean(activePdfPreviewConfig)}
        config={activePdfPreviewConfig}
        onClose={() => setActivePdfPreviewConfig(null)}
      />
    </div>
  );
};

export default BusinessReportsView;
