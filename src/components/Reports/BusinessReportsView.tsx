import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { downloadGstr1JsonFile } from '../../core/gst/gstrExport.ts';

interface BusinessReportsViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  items: InventoryItem[];
  parties: Party[];
}

type ReportCategory = 'ALL' | 'GST' | 'FINANCIAL' | 'BILL_WISE' | 'PARTIES_STOCK';
export type ProfitPeriod = 'TODAY' | 'YESTERDAY' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_FY' | 'CUSTOM';

const formatDateLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function exportBillWiseProfitCsv(
  billRows: Array<{
    invoiceNumber: string;
    date: string;
    partyName: string;
    totalTaxable: number;
    totalTax: number;
    grandTotal: number;
    cogs: number;
    profit: number;
    margin: number;
  }>,
  dateLabel: string
) {
  const headers = [
    'Invoice Number',
    'Date',
    'Customer Name',
    'Taxable Amount (Rs)',
    'Tax Amount (Rs)',
    'Grand Total (Rs)',
    'Purchase Cost COGS (Rs)',
    'Profit Amount (Rs)',
    'Profit Margin (%)',
  ];
  const csvRows = [headers.join(',')];

  billRows.forEach((r) => {
    const row = [
      `"${r.invoiceNumber.replace(/"/g, '""')}"`,
      `"${r.date}"`,
      `"${r.partyName.replace(/"/g, '""')}"`,
      r.totalTaxable.toFixed(2),
      r.totalTax.toFixed(2),
      r.grandTotal.toFixed(2),
      r.cogs.toFixed(2),
      r.profit.toFixed(2),
      r.margin.toFixed(2) + '%',
    ];
    csvRows.push(row.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bill_Wise_Profit_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const BusinessReportsView: React.FC<BusinessReportsViewProps> = ({
  company,
  invoices,
  purchases,
  expenses,
  items,
  parties,
}) => {
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('ALL');
  const [search, setSearch] = useState('');
  const [profitPeriod, setProfitPeriod] = useState<ProfitPeriod>('TODAY');

  const todayStr = useMemo(() => formatDateLocal(new Date()), []);
  const [customStart, setCustomStart] = useState<string>(todayStr);
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}${yyyy}`;
  });

  // Dynamic Date Range based on selected ProfitPeriod
  const dateRange = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    if (profitPeriod === 'TODAY') {
      const today = formatDateLocal(now);
      return { start: today, end: today, label: `Today (${formatDate(today)})` };
    }

    if (profitPeriod === 'YESTERDAY') {
      const yDate = new Date(now);
      yDate.setDate(now.getDate() - 1);
      const yesterday = formatDateLocal(yDate);
      return { start: yesterday, end: yesterday, label: `Yesterday (${formatDate(yesterday)})` };
    }

    if (profitPeriod === 'THIS_MONTH') {
      const firstDay = new Date(currentYear, currentMonth, 1);
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        start: formatDateLocal(firstDay),
        end: formatDateLocal(lastDay),
        label: `This Month (${monthNames[currentMonth]} ${currentYear})`,
      };
    }

    if (profitPeriod === 'THIS_QUARTER') {
      let qNum = 1;
      let qStartM = 3;
      let qEndM = 5;
      let qYear = currentYear;

      if (currentMonth >= 3 && currentMonth <= 5) {
        qNum = 1;
        qStartM = 3;
        qEndM = 5;
      } else if (currentMonth >= 6 && currentMonth <= 8) {
        qNum = 2;
        qStartM = 6;
        qEndM = 8;
      } else if (currentMonth >= 9 && currentMonth <= 11) {
        qNum = 3;
        qStartM = 9;
        qEndM = 11;
      } else {
        qNum = 4;
        qStartM = 0;
        qEndM = 2;
      }
      const qFirst = new Date(qYear, qStartM, 1);
      const qLast = new Date(qYear, qEndM + 1, 0);
      return {
        start: formatDateLocal(qFirst),
        end: formatDateLocal(qLast),
        label: `This Quarter (Q${qNum}: ${formatDate(qFirst)} - ${formatDate(qLast)})`,
      };
    }

    if (profitPeriod === 'THIS_FY') {
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fyEndYear = fyStartYear + 1;
      const start = `${fyStartYear}-04-01`;
      const end = `${fyEndYear}-03-31`;
      return {
        start,
        end,
        label: `This FY (FY ${fyStartYear}-${String(fyEndYear).slice(-2)})`,
      };
    }

    if (profitPeriod === 'CUSTOM') {
      const s = customStart || todayStr;
      const e = customEnd || todayStr;
      return {
        start: s,
        end: e,
        label: `Custom (${formatDate(s)} - ${formatDate(e)})`,
      };
    }

    return { start: '', end: '', label: 'All Time' };
  }, [profitPeriod, customStart, customEnd, todayStr]);

  // Filtered transactions for selected period
  const periodInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const d = (inv.date || '').split('T')[0];
      if (!d) return false;
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [invoices, dateRange]);

  const periodPurchases = useMemo(() => {
    return purchases.filter((pur) => {
      const d = (pur.date || '').split('T')[0];
      if (!d) return false;
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [purchases, dateRange]);

  const periodExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      const d = (exp.date || '').split('T')[0];
      if (!d) return false;
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [expenses, dateRange]);

  // Item purchase price lookup for COGS
  const itemCostMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((it) => {
      map.set(it.id, it.purchasePrice || 0);
    });
    return map;
  }, [items]);

  // Aggregates for period
  const grossSales = periodInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalSalesTaxable = periodInvoices.reduce((s, i) => s + i.totalTaxableAmount, 0);
  const totalOutputGst = periodInvoices.reduce((s, i) => s + i.totalTax, 0);

  const grossPurchases = periodPurchases.reduce((s, p) => s + p.grandTotal, 0);
  const totalPurchasesTaxable = periodPurchases.reduce((s, p) => s + p.totalTaxableAmount, 0);
  const totalItcFromPurchases = periodPurchases.reduce((s, p) => s + p.totalTax, 0);

  const totalExpenses = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const itcFromExpenses = periodExpenses.filter((e) => e.itcEligible).reduce((s, e) => s + e.taxAmount, 0);

  const totalAvailableItc = totalItcFromPurchases + itcFromExpenses;
  const netGstPayableInCash = Math.max(0, totalOutputGst - totalAvailableItc);

  const totalStockValuation = items.reduce((s, i) => s + (i.currentStock * i.purchasePrice), 0);

  // Cost of Goods Sold (COGS) for items sold during the period
  const totalCogs = useMemo(() => {
    return periodInvoices.reduce((sum, inv) => {
      const invCost = inv.items.reduce((iSum, line) => {
        const pPrice = (line.itemId ? itemCostMap.get(line.itemId) : 0) || 0;
        return iSum + (line.quantity * pPrice);
      }, 0);
      return sum + invCost;
    }, 0);
  }, [periodInvoices, itemCostMap]);

  // Commercial Net Profit: Net Taxable Sales - COGS (or Purchases) - Operating Expenses
  const effectiveCostOfSales = totalCogs > 0 ? totalCogs : totalPurchasesTaxable;
  const netProfit = totalSalesTaxable - effectiveCostOfSales - totalExpenses;
  const profitMargin = totalSalesTaxable > 0 ? (netProfit / totalSalesTaxable) * 100 : 0;

  const handleDownloadGstr1 = () => {
    downloadGstr1JsonFile(company, invoices, selectedPeriod);
  };

  const totalFlow = grossSales + grossPurchases + totalExpenses;

  // Bill-wise Profit Breakdown & Analytics
  const [billSearch, setBillSearch] = useState('');
  const [billSortBy, setBillSortBy] = useState<
    'DATE_DESC' | 'DATE_ASC' | 'PROFIT_DESC' | 'PROFIT_ASC' | 'MARGIN_DESC'
  >('DATE_DESC');
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);

  const billWiseProfitData = useMemo(() => {
    return periodInvoices.map((inv) => {
      const taxable = inv.totalTaxableAmount;
      const cogs = inv.items.reduce((sum, line) => {
        const pPrice = (line.itemId ? itemCostMap.get(line.itemId) : 0) || 0;
        return sum + line.quantity * pPrice;
      }, 0);
      const profit = taxable - cogs;
      const margin = taxable > 0 ? (profit / taxable) * 100 : 0;

      const itemBreakdowns = inv.items.map((line) => {
        const itemTaxable = line.taxableAmount || line.quantity * line.unitPrice;
        const itemPPrice = (line.itemId ? itemCostMap.get(line.itemId) : 0) || 0;
        const itemCogs = line.quantity * itemPPrice;
        const itemProfit = itemTaxable - itemCogs;
        const itemMargin = itemTaxable > 0 ? (itemProfit / itemTaxable) * 100 : 0;
        return {
          name: line.name,
          quantity: line.quantity,
          unit: line.unit || 'PCS',
          salePrice: line.unitPrice,
          purchasePrice: itemPPrice,
          taxable: itemTaxable,
          cogs: itemCogs,
          profit: itemProfit,
          margin: itemMargin,
        };
      });

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        partyName: inv.partyName || 'Cash Customer',
        totalTaxable: taxable,
        totalTax: inv.totalTax,
        grandTotal: inv.grandTotal,
        cogs,
        profit,
        margin,
        itemBreakdowns,
        paymentStatus: inv.paymentStatus,
      };
    });
  }, [periodInvoices, itemCostMap]);

  const filteredBillWiseData = useMemo(() => {
    let list = billWiseProfitData;
    if (billSearch.trim()) {
      const q = billSearch.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.invoiceNumber.toLowerCase().includes(q) ||
          b.partyName.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (billSortBy === 'DATE_DESC') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (billSortBy === 'DATE_ASC') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (billSortBy === 'PROFIT_DESC') return b.profit - a.profit;
      if (billSortBy === 'PROFIT_ASC') return a.profit - b.profit;
      if (billSortBy === 'MARGIN_DESC') return b.margin - a.margin;
      return 0;
    });
  }, [billWiseProfitData, billSearch, billSortBy]);

  const totalBillWiseProfit = useMemo(() => {
    return filteredBillWiseData.reduce((s, b) => s + b.profit, 0);
  }, [filteredBillWiseData]);

  const totalBillWiseTaxable = useMemo(() => {
    return filteredBillWiseData.reduce((s, b) => s + b.totalTaxable, 0);
  }, [filteredBillWiseData]);

  const totalBillWiseCogs = useMemo(() => {
    return filteredBillWiseData.reduce((s, b) => s + b.cogs, 0);
  }, [filteredBillWiseData]);

  const averageBillMargin = totalBillWiseTaxable > 0 ? (totalBillWiseProfit / totalBillWiseTaxable) * 100 : 0;

  return (
    <div className="flex flex-col w-full pb-24 max-w-7xl mx-auto px-margin-mobile md:px-6 py-4 gap-space-sm">
      {/* 1. Top Financial Snapshot Banner (Stitch business_reports) */}
      <div className="bg-primary-container text-on-primary rounded-2xl p-space-lg shadow-sm relative overflow-hidden">
        {/* Ambient Decorative Curve */}
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-secondary opacity-20 pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-space-sm relative z-10">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[20px] text-secondary-fixed">
              auto_graph
            </span>
            <span className="font-label-sm text-label-sm text-surface-variant uppercase tracking-wider font-bold">
              Financial Snapshot
            </span>
          </div>

          {/* Compact Period Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-surface-container-highest/30 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-white/15 shadow-xs">
            <span className="material-symbols-outlined text-[17px] text-secondary-fixed">
              calendar_month
            </span>
            <select
              value={profitPeriod}
              onChange={(e) => setProfitPeriod(e.target.value as ProfitPeriod)}
              className="bg-transparent text-xs font-bold text-on-primary outline-none cursor-pointer pr-1 appearance-none [&>option]:bg-surface-container-lowest [&>option]:text-on-surface"
            >
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="THIS_QUARTER">Quarter</option>
              <option value="THIS_FY">This FY</option>
              <option value="CUSTOM">Custom Date...</option>
            </select>
            <span className="material-symbols-outlined text-[16px] text-surface-variant pointer-events-none -ml-1">
              arrow_drop_down
            </span>
          </div>
        </div>

        {/* Custom Date Range Selector (shown when Custom is active) */}
        {profitPeriod === 'CUSTOM' && (
          <div className="flex items-center gap-2 mb-3 bg-surface-container-highest/25 backdrop-blur-xs p-2.5 rounded-xl text-xs flex-wrap relative z-10 animate-fade-in border border-white/10">
            <span className="text-surface-variant font-medium">From:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-surface-container-lowest/90 text-on-surface px-2.5 py-1 rounded-lg text-xs border border-outline-variant/30 outline-none focus:border-secondary font-medium"
            />
            <span className="text-surface-variant font-medium">To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-surface-container-lowest/90 text-on-surface px-2.5 py-1 rounded-lg text-xs border border-outline-variant/30 outline-none focus:border-secondary font-medium"
            />
          </div>
        )}

        {/* Main Net Profit */}
        <div className="mb-space-md relative z-10">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-xs text-surface-container-high font-medium">
              Net Profit (Estimated)
            </span>
            <span className="text-[11px] text-surface-variant/90 font-medium">
              {dateRange.label}
            </span>
          </div>
          <div className="flex items-baseline gap-space-sm flex-wrap">
            <div className="font-currency-display-mobile text-3xl font-extrabold text-on-primary tracking-tight">
              {formatINR(netProfit)}
            </div>
            {grossSales > 0 && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-bold">
                <span className="material-symbols-outlined text-[13px]">
                  {profitMargin >= 0 ? 'trending_up' : 'trending_down'}
                </span>
                {profitMargin.toFixed(1)}% Margin
              </span>
            )}
          </div>
        </div>

        {/* Revenue vs Expenses Split Grid */}
        <div className="grid grid-cols-2 gap-space-sm pt-space-sm relative z-10 bg-surface-container-highest/10 rounded-xl p-3">
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-surface-variant font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed"></span>
              Gross Revenue
            </span>
            <span className="font-headline-sm text-lg font-bold text-on-primary truncate mt-0.5">
              {formatINR(grossSales)}
            </span>
            <span className="text-[11px] text-surface-container-high truncate">
              {invoices.length} Invoices
            </span>
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-xs text-surface-variant font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-error-container"></span>
              Expenses &amp; Stock
            </span>
            <span className="font-headline-sm text-lg font-bold text-on-primary truncate mt-0.5">
              {formatINR(grossPurchases + totalExpenses)}
            </span>
            <span className="text-[11px] text-surface-container-high truncate">Purchases + Ops</span>
          </div>
        </div>

        {/* Visual Progress Ratio Bar */}
        {totalFlow > 0 && (
          <div className="mt-space-md w-full bg-surface-container-highest/20 h-1.5 rounded-full overflow-hidden flex">
            <div
              className="bg-secondary-fixed h-full transition-all duration-300"
              style={{ width: `${Math.round((grossSales / totalFlow) * 100)}%` }}
            ></div>
            <div
              className="bg-error-container h-full transition-all duration-300"
              style={{ width: `${Math.round(((grossPurchases + totalExpenses) / totalFlow) * 100)}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* 2. Category Switcher Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <button
          onClick={() => setActiveCategory('ALL')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-sm ${
            activeCategory === 'ALL'
              ? 'bg-secondary text-on-secondary'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px]">apps</span>
          <span>All (13)</span>
        </button>

        <button
          onClick={() => setActiveCategory('GST')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-sm ${
            activeCategory === 'GST'
              ? 'bg-secondary text-on-secondary'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px]">verified_user</span>
          <span>GST &amp; Tax</span>
        </button>

        <button
          onClick={() => setActiveCategory('FINANCIAL')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-sm ${
            activeCategory === 'FINANCIAL'
              ? 'bg-secondary text-on-secondary'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px]">account_balance</span>
          <span>Financials (P&amp;L)</span>
        </button>

        <button
          onClick={() => setActiveCategory('BILL_WISE')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-sm ${
            activeCategory === 'BILL_WISE'
              ? 'bg-secondary text-on-secondary'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px]">receipt_long</span>
          <span>Bill-Wise Profit</span>
        </button>

        <button
          onClick={() => setActiveCategory('PARTIES_STOCK')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-sm ${
            activeCategory === 'PARTIES_STOCK'
              ? 'bg-secondary text-on-secondary'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px]">inventory_2</span>
          <span>Parties &amp; Stock</span>
        </button>
      </div>

      {/* 3. SECTION: GSTR-1 Official Section with 1-Click JSON Download */}
      {(activeCategory === 'ALL' || activeCategory === 'GST') && (
        <section className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-secondary text-on-secondary font-bold text-xs">
                GSTR-1
              </span>
              <div>
                <h3 className="font-headline-sm text-sm font-bold text-on-surface">
                  GSTR-1 Monthly Return (Outward Supplies)
                </h3>
                <div className="text-[11px] text-on-surface-variant">
                  B2B Invoices, B2C Small, HSN Summary ready for official upload.
                </div>
              </div>
            </div>

            <button
              onClick={handleDownloadGstr1}
              className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer transition-all"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>Download GST Portal JSON</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-on-surface-variant font-medium">Table 4A: B2B</span>
              <span className="font-bold text-on-surface text-sm mt-0.5">
                {formatINR(invoices.filter((i) => i.invoiceType === 'B2B').reduce((s, i) => s + i.grandTotal, 0))}
              </span>
              <span className="text-[10px] text-secondary font-semibold">Registered Bills</span>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-on-surface-variant font-medium">Table 7: B2CS</span>
              <span className="font-bold text-on-surface text-sm mt-0.5">
                {formatINR(invoices.filter((i) => i.invoiceType === 'B2CS').reduce((s, i) => s + i.grandTotal, 0))}
              </span>
              <span className="text-[10px] text-secondary font-semibold">Retail Consumers</span>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-on-surface-variant font-medium">Taxable Value</span>
              <span className="font-bold text-on-surface text-sm mt-0.5">
                {formatINR(totalSalesTaxable)}
              </span>
              <span className="text-[10px] text-on-surface-variant">Before GST</span>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-on-surface-variant font-medium">Output GST Tax</span>
              <span className="font-bold text-error text-sm mt-0.5">
                {formatINR(totalOutputGst)}
              </span>
              <span className="text-[10px] text-error font-semibold">CGST+SGST+IGST</span>
            </div>
          </div>
        </section>
      )}

      {/* 4. SECTION: GSTR-3B Tax Computation */}
      {(activeCategory === 'ALL' || activeCategory === 'GST') && (
        <section className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-primary-fixed text-on-primary-fixed font-bold text-xs">
              GSTR-3B
            </span>
            <h3 className="font-headline-sm text-sm font-bold text-on-surface">
              Tax Computation &amp; ITC Set-Off Table
            </h3>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 text-on-surface-variant">
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right">Taxable</th>
                  <th className="py-2 text-right">Output Tax</th>
                  <th className="py-2 text-right">Input Credit (ITC)</th>
                  <th className="py-2 text-right">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                <tr>
                  <td className="py-2.5 font-bold">Monthly Goods &amp; Services</td>
                  <td className="py-2.5 text-right font-medium">{formatINR(totalSalesTaxable)}</td>
                  <td className="py-2.5 text-right font-bold text-error">{formatINR(totalOutputGst)}</td>
                  <td className="py-2.5 text-right font-bold text-secondary">{formatINR(totalAvailableItc)}</td>
                  <td className="py-2.5 text-right font-extrabold text-on-surface">{formatINR(netGstPayableInCash)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 5. SECTION: Profit & Loss Statement */}
      {(activeCategory === 'ALL' || activeCategory === 'FINANCIAL') && (
        <section className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h3 className="font-headline-sm text-sm font-bold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-secondary">analytics</span>
              <span>Trading &amp; Profit &amp; Loss Statement</span>
            </h3>
            <span className="text-[11px] text-on-surface-variant font-semibold bg-surface-container-low px-2.5 py-0.5 rounded-full border border-outline-variant/30 w-fit">
              {dateRange.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Income */}
            <div className="p-3 rounded-xl bg-surface-container-low space-y-1.5">
              <div className="font-bold text-secondary border-b border-outline-variant/20 pb-1">
                INCOME / REVENUE
              </div>
              <div className="flex justify-between">
                <span>Taxable Sales:</span>
                <span className="font-bold">{formatINR(totalSalesTaxable)}</span>
              </div>
              <div className="flex justify-between">
                <span>Closing Stock Value:</span>
                <span className="font-bold">{formatINR(totalStockValuation)}</span>
              </div>
              <div className="flex justify-between border-t border-outline-variant/20 pt-1 text-secondary font-bold">
                <span>Total Income:</span>
                <span>{formatINR(totalSalesTaxable + totalStockValuation)}</span>
              </div>
            </div>

            {/* Expenses */}
            <div className="p-3 rounded-xl bg-surface-container-low space-y-1.5">
              <div className="font-bold text-error border-b border-outline-variant/20 pb-1">
                COSTS &amp; OVERHEADS
              </div>
              <div className="flex justify-between">
                <span>Cost of Sales (COGS):</span>
                <span className="font-bold">{formatINR(effectiveCostOfSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Operational Expenses:</span>
                <span className="font-bold">{formatINR(totalExpenses)}</span>
              </div>
              <div className="flex justify-between border-t border-outline-variant/20 pt-1 text-error font-bold">
                <span>Total Costs:</span>
                <span>{formatINR(effectiveCostOfSales + totalExpenses)}</span>
              </div>
            </div>
          </div>

          {/* Net Profit Summary Bar */}
          <div className="p-3 rounded-xl bg-surface-container-low flex items-center justify-between border border-outline-variant/20">
            <span className="font-bold text-xs text-on-surface">Net Operating Profit:</span>
            <span className={`font-black text-sm ${netProfit >= 0 ? 'text-secondary' : 'text-error'}`}>
              {formatINR(netProfit)} ({profitMargin.toFixed(1)}%)
            </span>
          </div>
        </section>
      )}

      {/* 6. SECTION: Bill-Wise Profit Report */}
      {(activeCategory === 'ALL' || activeCategory === 'FINANCIAL' || activeCategory === 'BILL_WISE') && (
        <section className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col gap-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-secondary">
                receipt_long
              </span>
              <div>
                <h3 className="font-headline-sm text-sm font-bold text-on-surface">
                  Bill-Wise Profit Report
                </h3>
                <div className="text-[11px] text-on-surface-variant">
                  Invoice-level revenue, COGS, gross profit &amp; margin breakdown
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-on-surface-variant font-semibold bg-surface-container-low px-2.5 py-0.5 rounded-full border border-outline-variant/30">
                {dateRange.label}
              </span>
              {filteredBillWiseData.length > 0 && (
                <button
                  type="button"
                  onClick={() => exportBillWiseProfitCsv(filteredBillWiseData, dateRange.label)}
                  className="px-2.5 py-1 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                  title="Export to CSV"
                >
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  <span>CSV</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Metrics KPI Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-on-surface-variant font-medium">Billed Sales (Taxable)</span>
              <span className="font-bold text-on-surface text-sm mt-0.5">
                {formatINR(totalBillWiseTaxable)}
              </span>
              <span className="text-[10px] text-secondary font-semibold">{filteredBillWiseData.length} Bills</span>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-on-surface-variant font-medium">Purchase Cost (COGS)</span>
              <span className="font-bold text-on-surface text-sm mt-0.5">
                {formatINR(totalBillWiseCogs)}
              </span>
              <span className="text-[10px] text-on-surface-variant">Cost of goods sold</span>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-on-surface-variant font-medium">Gross Profit</span>
              <span className={`font-bold text-sm mt-0.5 ${totalBillWiseProfit >= 0 ? 'text-secondary' : 'text-error'}`}>
                {formatINR(totalBillWiseProfit)}
              </span>
              <span className="text-[10px] font-semibold text-secondary">
                {averageBillMargin.toFixed(1)}% Avg Margin
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-on-surface-variant font-medium">Avg Profit per Bill</span>
              <span className="font-bold text-on-surface text-sm mt-0.5">
                {formatINR(filteredBillWiseData.length > 0 ? totalBillWiseProfit / filteredBillWiseData.length : 0)}
              </span>
              <span className="text-[10px] text-on-surface-variant">Per invoice average</span>
            </div>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
            <div className="relative flex-1 max-w-sm">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search bill no or customer..."
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface text-on-surface text-xs outline-none focus:border-secondary"
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs">
              <span className="text-on-surface-variant font-medium text-[11px]">Sort:</span>
              <select
                value={billSortBy}
                onChange={(e) => setBillSortBy(e.target.value as any)}
                className="bg-surface border border-outline-variant/40 rounded-xl px-2.5 py-1.5 text-xs text-on-surface outline-none focus:border-secondary"
              >
                <option value="DATE_DESC">Date (Newest)</option>
                <option value="DATE_ASC">Date (Oldest)</option>
                <option value="PROFIT_DESC">Highest Profit</option>
                <option value="PROFIT_ASC">Lowest Profit</option>
                <option value="MARGIN_DESC">Highest Margin %</option>
              </select>
            </div>
          </div>

          {/* Bill List Table */}
          <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
            {filteredBillWiseData.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant text-xs">
                No sales invoices found for {dateRange.label}.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant font-semibold">
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3 text-right">Sale Amount</th>
                    <th className="py-2.5 px-3 text-right">Cost (COGS)</th>
                    <th className="py-2.5 px-3 text-right">Profit (₹)</th>
                    <th className="py-2.5 px-3 text-right">Margin (%)</th>
                    <th className="py-2.5 px-3 text-center">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15">
                  {filteredBillWiseData.map((bill) => {
                    const isExpanded = expandedBillId === bill.id;
                    const isProfitable = bill.profit >= 0;
                    return (
                      <React.Fragment key={bill.id}>
                        <tr
                          onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}
                          className="hover:bg-surface-container-high/40 transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-3 font-bold text-on-surface flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-outline">
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                            <span>{bill.invoiceNumber}</span>
                          </td>
                          <td className="py-2.5 px-3 text-on-surface-variant whitespace-nowrap">
                            {formatDate(bill.date)}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-on-surface truncate max-w-[140px]">
                            {bill.partyName}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium">
                            {formatINR(bill.totalTaxable)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-on-surface-variant">
                            {formatINR(bill.cogs)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold ${isProfitable ? 'text-secondary' : 'text-error'}`}>
                            {isProfitable ? '+' : ''}{formatINR(bill.profit)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                isProfitable
                                  ? 'bg-secondary/15 text-secondary'
                                  : 'bg-error/15 text-error'
                              }`}
                            >
                              {bill.margin.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-on-surface-variant">
                            <span className="px-2 py-0.5 rounded-full bg-surface-container text-[11px]">
                              {bill.itemBreakdowns.length}
                            </span>
                          </td>
                        </tr>

                        {/* Expandable Line-Item Breakdown */}
                        {isExpanded && (
                          <tr className="bg-surface-container-low/60">
                            <td colSpan={8} className="p-3">
                              <div className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/30 space-y-2">
                                <div className="text-[11px] font-bold text-on-surface flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-secondary">
                                    inventory_2
                                  </span>
                                  <span>Product-Level Profit Breakdown for #{bill.invoiceNumber}</span>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-[11px]">
                                    <thead>
                                      <tr className="border-b border-outline-variant/20 text-on-surface-variant font-semibold">
                                        <th className="py-1 px-2">Item Name</th>
                                        <th className="py-1 px-2 text-center">Qty</th>
                                        <th className="py-1 px-2 text-right">Sale Price</th>
                                        <th className="py-1 px-2 text-right">Buy Price</th>
                                        <th className="py-1 px-2 text-right">Taxable Sale</th>
                                        <th className="py-1 px-2 text-right">Cost (COGS)</th>
                                        <th className="py-1 px-2 text-right">Profit</th>
                                        <th className="py-1 px-2 text-right">Margin</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline-variant/10">
                                      {bill.itemBreakdowns.map((it, iIdx) => (
                                        <tr key={iIdx}>
                                          <td className="py-1 px-2 font-medium">{it.name}</td>
                                          <td className="py-1 px-2 text-center">{it.quantity} {it.unit}</td>
                                          <td className="py-1 px-2 text-right">{formatINR(it.salePrice)}</td>
                                          <td className="py-1 px-2 text-right">{it.purchasePrice > 0 ? formatINR(it.purchasePrice) : '₹0'}</td>
                                          <td className="py-1 px-2 text-right font-medium">{formatINR(it.taxable)}</td>
                                          <td className="py-1 px-2 text-right text-on-surface-variant">{formatINR(it.cogs)}</td>
                                          <td className={`py-1 px-2 text-right font-bold ${it.profit >= 0 ? 'text-secondary' : 'text-error'}`}>
                                            {it.profit >= 0 ? '+' : ''}{formatINR(it.profit)}
                                          </td>
                                          <td className="py-1 px-2 text-right">
                                            <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${it.profit >= 0 ? 'text-secondary' : 'text-error'}`}>
                                              {it.margin.toFixed(1)}%
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
