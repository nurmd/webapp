import React from 'react';
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
  ChevronRight,
  ArrowRight,
} from 'lucide-react';

export type ReportCategoryKey =
  | 'gst_tax'
  | 'sales_revenue'
  | 'purchases_expenses'
  | 'party_khata'
  | 'inventory_stock'
  | 'cash_flow'
  | 'balance_sheet'
  | 'bank_statement'
  | 'loan_statement'
  | 'daybook';

export interface ReportNavItemConfig {
  id: ReportCategoryKey;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
  iconBg: string;
  iconColor: string;
  badge?: string;
  chips: string[];
}

interface ReportsNavListProps {
  onSelectReport: (reportId: ReportCategoryKey) => void;
  metrics: {
    gstTaxInvoices: number;
    salesTotal: string;
    purchasesTotal: string;
    receivablesTotal: string;
    payablesTotal: string;
    stockValuation: string;
    needRestockCount?: number;
    lowStockCount: number;
    outOfStockCount?: number;
    liquidBalance: string;
    activeBankCount: number;
    activeLoanCount: number;
    voucherCount: number;
  };
}

export const ReportsNavList: React.FC<ReportsNavListProps> = ({
  onSelectReport,
  metrics,
}) => {
  const operationsReports: ReportNavItemConfig[] = [
    {
      id: 'gst_tax',
      title: 'GST & Tax Compliance',
      subtitle: 'GSTR-1 outward, GSTR-3B tax offset & HSN',
      icon: ShieldCheck,
      iconBg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      badge: 'CA Ready',
      chips: [`${metrics.gstTaxInvoices} Tax Records`, 'GSTR-3B 3.1 & 4 ITC'],
    },
    {
      id: 'sales_revenue',
      title: 'Sales & Revenue',
      subtitle: 'Sales register, bill profit & margins',
      icon: TrendingUp,
      iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      chips: [`Sales: ${metrics.salesTotal}`, 'Profit Margins'],
    },
    {
      id: 'purchases_expenses',
      title: 'Purchases & Expenses',
      subtitle: 'Purchase register, ITC & expenses',
      icon: ShoppingBag,
      iconBg: 'bg-amber-500/10 dark:bg-amber-500/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      chips: [`Purchases: ${metrics.purchasesTotal}`, '10 Categories'],
    },
    {
      id: 'party_khata',
      title: 'Party & Khata Dues',
      subtitle: 'Receivables & payables aging (0-90d+)',
      icon: Users,
      iconBg: 'bg-rose-500/10 dark:bg-rose-500/20',
      iconColor: 'text-rose-600 dark:text-rose-400',
      chips: [`Rec: ${metrics.receivablesTotal}`, `Pay: ${metrics.payablesTotal}`],
    },
    {
      id: 'inventory_stock',
      title: 'Inventory & Stock Valuation',
      subtitle: 'Stock valuation & reorder alerts',
      icon: Package,
      iconBg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      badge: (() => {
        const need = metrics.needRestockCount ?? (metrics.lowStockCount + (metrics.outOfStockCount || 0));
        const out = metrics.outOfStockCount || 0;
        if (need <= 0) return undefined;
        return `${metrics.lowStockCount} Low, ${out} Out`;
      })(),
      chips: [
        `Valuation: ${metrics.stockValuation}`,
        (() => {
          const need = metrics.needRestockCount ?? (metrics.lowStockCount + (metrics.outOfStockCount || 0));
          const out = metrics.outOfStockCount || 0;
          return `${need} Need Restock (${metrics.lowStockCount} Low, ${out} Out)`;
        })(),
      ],
    },
  ];

  const financialReports: ReportNavItemConfig[] = [
    {
      id: 'cash_flow',
      title: 'Cash Flow Statement',
      subtitle: 'Operating, investing & liquid cash flow',
      icon: Waves,
      iconBg: 'bg-blue-500/10 dark:bg-blue-500/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      badge: 'Cash & Bank',
      chips: [`Liquidity: ${metrics.liquidBalance}`, 'Cash Flow'],
    },
    {
      id: 'balance_sheet',
      title: 'Balance Sheet',
      subtitle: 'Assets vs. liabilities & net worth',
      icon: Scale,
      iconBg: 'bg-purple-500/10 dark:bg-purple-500/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
      badge: 'Balanced',
      chips: ['Assets vs Liabilities', 'Net Worth'],
    },
    {
      id: 'bank_statement',
      title: 'Bank Statement',
      subtitle: 'Passbook, deposits & running balances',
      icon: Landmark,
      iconBg: 'bg-teal-500/10 dark:bg-teal-500/20',
      iconColor: 'text-teal-600 dark:text-teal-400',
      chips: [`${metrics.activeBankCount} Accounts`, 'Passbook Ledger'],
    },
    {
      id: 'loan_statement',
      title: 'Loan Statement & EMIs',
      subtitle: 'Borrowings, EMIs & principal debt',
      icon: CreditCard,
      iconBg: 'bg-orange-500/10 dark:bg-orange-500/20',
      iconColor: 'text-orange-600 dark:text-orange-400',
      chips: [`${metrics.activeLoanCount} Loans`, 'EMI Repayments'],
    },
    {
      id: 'daybook',
      title: 'Accounting Daybook',
      subtitle: 'Double-entry general journal vouchers',
      icon: BookOpen,
      iconBg: 'bg-sky-500/10 dark:bg-sky-500/20',
      iconColor: 'text-sky-600 dark:text-sky-400',
      chips: [`${metrics.voucherCount} Vouchers`, 'Balanced Entries'],
    },
  ];

  const renderSection = (title: string, subtitle: string, items: ReportNavItemConfig[]) => (
    <div className="space-y-2 sm:space-y-2.5">
      <div className="px-0.5">
        <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-on-surface-variant m-0">
          {title}
        </h3>
        <p className="text-[11px] sm:text-xs text-on-surface-variant/80 mt-0.5 mb-0">
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5" role="list">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectReport(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectReport(item.id);
                }
              }}
              aria-label={`Open ${item.title} report`}
              className="group flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 hover:border-primary/40 shadow-xs hover:shadow-md transition-all cursor-pointer text-left active:scale-[0.99]"
            >
              <div className="flex items-center sm:items-start gap-2.5 sm:gap-3 min-w-0 pr-1.5 sm:pr-2">
                <div className={`p-2 sm:p-2.5 rounded-xl ${item.iconBg} ${item.iconColor} shrink-0 transition-transform group-hover:scale-105`}>
                  <Icon size={18} />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    <h4 className="text-xs sm:text-sm font-bold text-on-surface group-hover:text-primary transition-colors m-0 truncate shrink-0">
                      {item.title}
                    </h4>
                    {item.badge && (
                      <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-primary/10 text-primary border border-primary/20 whitespace-nowrap shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] sm:text-xs text-on-surface-variant line-clamp-1 mt-0.5 mb-1 sm:mb-1.5">
                    {item.subtitle}
                  </p>

                  <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {item.chips.map((chip, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded bg-surface font-medium text-on-surface-variant border border-outline-variant/20 whitespace-nowrap shrink-0"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-1 sm:p-1.5 rounded-lg text-on-surface-variant/50 group-hover:text-primary group-hover:bg-primary/5 transition-all shrink-0">
                <ChevronRight size={16} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5 pt-1">
      {renderSection(
        'Operations & Tax Compliance',
        'Direct GST statutory returns, bill-wise profitability & party dues',
        operationsReports
      )}

      {renderSection(
        'Financial Statements & Banking',
        'Cash flow, balance sheet position, bank statements & debt schedules',
        financialReports
      )}
    </div>
  );
};
