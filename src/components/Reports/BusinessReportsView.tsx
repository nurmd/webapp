import React, { useState, useMemo, useRef } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { DatePreset, getDateFilterBounds, isDateInRange } from '../../core/utils/dateFilters.ts';
import {
  ReportsHubHeader,
  ReportCategoryKey,
  SubReportOption,
  ReportKpiItem,
} from './ReportsHubHeader.tsx';

// 5 Dedicated Interactive Category Views
import { GstTaxComplianceCategory } from './categories/GstTaxComplianceCategory.tsx';
import { SalesRevenueCategory } from './categories/SalesRevenueCategory.tsx';
import { PurchasesExpensesCategory } from './categories/PurchasesExpensesCategory.tsx';
import { PartyKhataDuesCategory } from './categories/PartyKhataDuesCategory.tsx';
import { InventoryStockCategory } from './categories/InventoryStockCategory.tsx';

// Aggregations
import {
  aggregateGstr3b,
  calculateBillProfit,
  aggregateStockValuation,
  aggregateExpenseCategories,
} from './utils/reportAggregations.ts';
import { computeAgingBreakdown } from '../../core/accounting/aging.ts';

export interface BusinessReportsViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  items: InventoryItem[];
  parties: Party[];
  vouchers?: Voucher[];
}

export type ProfitPeriod = 'TODAY' | 'YESTERDAY' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_FY' | 'CUSTOM';

const SUB_REPORTS_MAP: Record<ReportCategoryKey, SubReportOption[]> = {
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

export const BusinessReportsView: React.FC<BusinessReportsViewProps> = ({
  company,
  invoices,
  purchases,
  expenses,
  items,
  parties,
  vouchers = [],
}) => {
  // Hub Navigation State
  const [activeCategory, setActiveCategory] = useState<ReportCategoryKey>('gst_tax');
  const [activeSubReport, setActiveSubReport] = useState<string>('gstr1');

  // Filtering State
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Child export handlers callback ref
  const exportHandlersRef = useRef<{ exportCsv?: () => void; exportPdf?: () => void }>({});

  const handleCategoryChange = (cat: ReportCategoryKey) => {
    setActiveCategory(cat);
    const defaultSub = SUB_REPORTS_MAP[cat][0].id;
    setActiveSubReport(defaultSub);
    setSearchQuery('');
  };

  const handleDateRangeChange = (preset: DatePreset, start?: string, end?: string) => {
    setDatePreset(preset);
    if (start) setCustomStart(start);
    if (end) setCustomEnd(end);
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

  // Category Record Counters
  const categoryCounters: Record<ReportCategoryKey, number> = useMemo(() => {
    return {
      gst_tax: periodInvoices.length + periodPurchases.length,
      sales_revenue: periodInvoices.length,
      purchases_expenses: periodPurchases.length + periodExpenses.length,
      party_khata: parties.filter((p) => Math.abs(p.currentBalance || 0) > 0.01).length,
      inventory_stock: items.filter((i) => !i.isDisabled).length,
    };
  }, [periodInvoices, periodPurchases, periodExpenses, parties, items]);

  // Items map for fast lookups
  const itemsMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
      map.set(item.id, item);
      if (item.name) map.set(item.name.toLowerCase(), item);
    }
    return map;
  }, [items]);

  // Calculate KPIs for current category
  const currentKpis: ReportKpiItem[] = useMemo(() => {
    switch (activeCategory) {
      case 'gst_tax': {
        const gstr3b = aggregateGstr3b(periodInvoices, periodPurchases, periodExpenses);
        return [
          {
            label: 'Total Outward Tax',
            value: formatINR(gstr3b.totalOutwardTax),
            hint: 'From Sales & Debit Notes',
            color: 'primary',
          },
          {
            label: 'Eligible ITC Available',
            value: formatINR(gstr3b.totalItc),
            hint: 'Purchases & Business Expenses',
            color: 'success',
          },
          {
            label: 'Net Cash Tax Payable',
            value: formatINR(gstr3b.netCashPayable),
            hint: 'After ITC offset',
            color: gstr3b.netCashPayable > 0 ? 'danger' : 'success',
          },
          {
            label: 'Taxable Turnover',
            value: formatINR(gstr3b.outwardTaxable),
            hint: 'Net Taxable Outward',
            color: 'info',
          },
        ];
      }

      case 'sales_revenue': {
        let totalRev = 0;
        let totalCogs = 0;
        let totalProfit = 0;

        for (const inv of periodInvoices) {
          if (inv.isCancelled) continue;
          const { cogs, grossProfit } = calculateBillProfit(inv, itemsMap);
          totalRev += inv.totalTaxableAmount || (inv.grandTotal - (inv.totalTax || 0));
          totalCogs += cogs;
          totalProfit += grossProfit;
        }

        const avgMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;

        return [
          {
            label: 'Taxable Sales Revenue',
            value: formatINR(totalRev),
            hint: `${periodInvoices.filter((i) => !i.isCancelled).length} bills recorded`,
            color: 'primary',
          },
          {
            label: 'Cost of Goods Sold (COGS)',
            value: formatINR(totalCogs),
            hint: 'At item purchase cost',
            color: 'warning',
          },
          {
            label: 'Gross Profit',
            value: formatINR(totalProfit),
            hint: 'Net Profit before overheads',
            color: totalProfit >= 0 ? 'success' : 'danger',
          },
          {
            label: 'Average Gross Margin',
            value: `${avgMargin.toFixed(1)}%`,
            hint: 'Profit margin %',
            color: avgMargin >= 20 ? 'success' : 'warning',
          },
        ];
      }

      case 'purchases_expenses': {
        const totalPurchases = periodPurchases
          .filter((p) => !p.isCancelled)
          .reduce((s, p) => s + p.grandTotal, 0);
        const expAgg = aggregateExpenseCategories(periodExpenses);

        return [
          {
            label: 'Total Purchases',
            value: formatINR(totalPurchases),
            hint: `${periodPurchases.filter((p) => !p.isCancelled).length} bills recorded`,
            color: 'primary',
          },
          {
            label: 'Operating Expenses',
            value: formatINR(expAgg.totalExpense),
            hint: `${periodExpenses.length} expense vouchers`,
            color: 'info',
          },
          {
            label: 'Cash Outflow',
            value: formatINR(expAgg.cashOutflow),
            hint: 'Cash paid out',
            color: 'warning',
          },
          {
            label: 'Total Claimable ITC',
            value: formatINR(
              periodPurchases.filter((p) => !p.isCancelled && p.itcEligibility !== 'INELIGIBLE_17_5' && p.itcEligibility !== 'INELIGIBLE_OTHERS').reduce((s, p) => s + p.totalTax, 0) + expAgg.totalItc
            ),
            hint: 'GST credits claimed',
            color: 'success',
          },
        ];
      }

      case 'party_khata': {
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

        return [
          {
            label: 'Total Receivables (To Collect)',
            value: formatINR(recAging.totalOutstanding),
            hint: `${recAging.parties.length} customer balances`,
            color: 'success',
          },
          {
            label: 'Total Payables (To Pay)',
            value: formatINR(purAging.totalOutstanding),
            hint: `${purAging.parties.length} supplier balances`,
            color: 'danger',
          },
          {
            label: 'Critical Overdue (90+ Days)',
            value: formatINR(recAging.summary['90+']),
            hint: 'High collection risk',
            color: recAging.summary['90+'] > 0 ? 'danger' : 'info',
          },
          {
            label: 'Recent Dues (0-30 Days)',
            value: formatINR(recAging.summary['0-30']),
            hint: 'Current healthy receivables',
            color: 'info',
          },
        ];
      }

      case 'inventory_stock': {
        const val = aggregateStockValuation(items);
        return [
          {
            label: 'Stock Value @ Cost',
            value: formatINR(val.purchaseValuation),
            hint: 'Based on purchase prices',
            color: 'primary',
          },
          {
            label: 'Stock Value @ Retail',
            value: formatINR(val.saleValuation),
            hint: 'Potential sales realization',
            color: 'info',
          },
          {
            label: 'Expected Gross Margin',
            value: `${val.potentialMarginPct.toFixed(1)}%`,
            hint: `₹ ${val.potentialGrossProfit.toLocaleString('en-IN')} profit`,
            color: 'success',
          },
          {
            label: 'Low Stock Warnings',
            value: String(val.lowStockCount),
            hint: `${val.outOfStockCount} out of stock`,
            color: val.lowStockCount > 0 ? 'warning' : 'success',
          },
        ];
      }

      default:
        return [];
    }
  }, [activeCategory, periodInvoices, periodPurchases, periodExpenses, items, itemsMap]);

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Categorized Hub Navigation Header */}
      <ReportsHubHeader
        activeCategory={activeCategory}
        onSelectCategory={handleCategoryChange}
        categoryCounters={categoryCounters}
        activeSubReport={activeSubReport}
        onSelectSubReport={setActiveSubReport}
        subReports={SUB_REPORTS_MAP[activeCategory]}
        datePreset={datePreset}
        customStart={customStart}
        customEnd={customEnd}
        onSelectDateRange={handleDateRangeChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        kpis={currentKpis}
        onExportPdf={() => exportHandlersRef.current.exportPdf?.()}
        onExportExcel={() => exportHandlersRef.current.exportCsv?.()}
      />

      {/* Active Dedicated Category Report View */}
      <main>
        {activeCategory === 'gst_tax' && (
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

        {activeCategory === 'sales_revenue' && (
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

        {activeCategory === 'purchases_expenses' && (
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

        {activeCategory === 'party_khata' && (
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

        {activeCategory === 'inventory_stock' && (
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
      </main>
    </div>
  );
};

export default BusinessReportsView;
