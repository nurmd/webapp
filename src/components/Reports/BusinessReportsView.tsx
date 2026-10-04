import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { downloadGstr1JsonFile } from '../../core/gst/gstrExport.ts';

interface BusinessReportsViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  items: InventoryItem[];
  parties: Party[];
}

type ReportCategory = 'ALL' | 'GST' | 'FINANCIAL' | 'PARTIES_STOCK';

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
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}${yyyy}`;
  });

  // Item purchase price lookup for COGS
  const itemCostMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((it) => {
      map.set(it.id, it.purchasePrice || 0);
    });
    return map;
  }, [items]);

  // Aggregates
  const grossSales = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalSalesTaxable = invoices.reduce((s, i) => s + i.totalTaxableAmount, 0);
  const totalOutputGst = invoices.reduce((s, i) => s + i.totalTax, 0);

  const grossPurchases = purchases.reduce((s, p) => s + p.grandTotal, 0);
  const totalPurchasesTaxable = purchases.reduce((s, p) => s + p.totalTaxableAmount, 0);
  const totalItcFromPurchases = purchases.reduce((s, p) => s + p.totalTax, 0);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const itcFromExpenses = expenses.filter((e) => e.itcEligible).reduce((s, e) => s + e.taxAmount, 0);

  const totalAvailableItc = totalItcFromPurchases + itcFromExpenses;
  const netGstPayableInCash = Math.max(0, totalOutputGst - totalAvailableItc);

  const totalStockValuation = items.reduce((s, i) => s + (i.currentStock * i.purchasePrice), 0);

  // Cost of Goods Sold (COGS)
  const totalCogs = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      const invCost = inv.items.reduce((iSum, line) => {
        const pPrice = (line.itemId ? itemCostMap.get(line.itemId) : 0) || 0;
        return iSum + (line.quantity * pPrice);
      }, 0);
      return sum + invCost;
    }, 0);
  }, [invoices, itemCostMap]);

  // Commercial Net Profit: Net Taxable Sales - COGS (or Purchases) - Operating Expenses
  const effectiveCostOfSales = totalCogs > 0 ? totalCogs : totalPurchasesTaxable;
  const netProfit = totalSalesTaxable - effectiveCostOfSales - totalExpenses;
  const profitMargin = totalSalesTaxable > 0 ? (netProfit / totalSalesTaxable) * 100 : 0;

  const handleDownloadGstr1 = () => {
    downloadGstr1JsonFile(company, invoices, selectedPeriod);
  };

  const totalFlow = grossSales + grossPurchases + totalExpenses;

  return (
    <div className="flex flex-col w-full pb-24 max-w-7xl mx-auto px-margin-mobile md:px-6 py-4 gap-space-sm">
      {/* 1. Top Financial Snapshot Banner (Stitch business_reports) */}
      <div className="bg-primary-container text-on-primary rounded-2xl p-space-lg shadow-sm relative overflow-hidden">
        {/* Ambient Decorative Curve */}
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-secondary opacity-20 pointer-events-none"></div>

        <div className="flex items-center justify-between mb-space-sm relative z-10">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[20px] text-secondary-fixed">
              auto_graph
            </span>
            <span className="font-label-sm text-label-sm text-surface-variant uppercase tracking-wider font-bold">
              Financial Snapshot
            </span>
          </div>
          <div className="flex items-center gap-1 bg-surface-container-highest/20 text-inverse-on-surface px-3 py-1 rounded-full text-xs font-semibold">
            <span>Current Period</span>
            <span className="material-symbols-outlined text-[14px]">calendar_month</span>
          </div>
        </div>

        {/* Main Net Profit */}
        <div className="mb-space-md relative z-10">
          <div className="text-xs text-surface-container-high font-medium mb-0.5">
            Net Profit (Estimated)
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
          <h3 className="font-headline-sm text-sm font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-secondary">analytics</span>
            <span>Trading &amp; Profit &amp; Loss Statement</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Income */}
            <div className="p-3 rounded-xl bg-surface-container-low space-y-1.5">
              <div className="font-bold text-secondary border-b border-outline-variant/20 pb-1">
                INCOME / REVENUE
              </div>
              <div className="flex justify-between">
                <span>Gross Sales:</span>
                <span className="font-bold">{formatINR(grossSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Closing Stock Value:</span>
                <span className="font-bold">{formatINR(totalStockValuation)}</span>
              </div>
              <div className="flex justify-between border-t border-outline-variant/20 pt-1 text-secondary font-bold">
                <span>Total Income:</span>
                <span>{formatINR(grossSales + totalStockValuation)}</span>
              </div>
            </div>

            {/* Expenses */}
            <div className="p-3 rounded-xl bg-surface-container-low space-y-1.5">
              <div className="font-bold text-error border-b border-outline-variant/20 pb-1">
                COSTS &amp; OVERHEADS
              </div>
              <div className="flex justify-between">
                <span>Inward Purchases:</span>
                <span className="font-bold">{formatINR(grossPurchases)}</span>
              </div>
              <div className="flex justify-between">
                <span>Operational Expenses:</span>
                <span className="font-bold">{formatINR(totalExpenses)}</span>
              </div>
              <div className="flex justify-between border-t border-outline-variant/20 pt-1 text-error font-bold">
                <span>Total Costs:</span>
                <span>{formatINR(grossPurchases + totalExpenses)}</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
