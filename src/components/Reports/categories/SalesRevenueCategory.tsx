import React, { useState, useMemo, useEffect } from 'react';
import { Invoice } from '../../../models/invoice.ts';
import { InventoryItem } from '../../../models/item.ts';
import { CompanyProfile } from '../../../models/company.ts';
import { formatINR, formatDate } from '../../../core/utils/formatters.ts';
import {
  calculateBillProfit,
  aggregateItemWiseSales,
  ItemWiseSalesSummary,
} from '../utils/reportAggregations.ts';
import { exportReportToCsv, printReportDocument, ReportPdfConfig } from '../utils/reportExportUtils.ts';
import { ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';

interface SalesRevenueCategoryProps {
  company: CompanyProfile;
  invoices: Invoice[];
  items: InventoryItem[];
  subReport: string; // 'sales_register' | 'item_wise'
  searchQuery: string;
  dateRangeLabel: string;
  onRegisterExportHandlers?: (handlers: { exportCsv: () => void; exportPdf: () => void }) => void;
}

type SortField = 'date' | 'invoiceNumber' | 'grandTotal' | 'profit' | 'margin';
type SortOrder = 'asc' | 'desc';

export const SalesRevenueCategory: React.FC<SalesRevenueCategoryProps> = ({
  company,
  invoices,
  items,
  subReport,
  searchQuery,
  dateRangeLabel,
  onRegisterExportHandlers,
}) => {
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const itemsMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
      map.set(item.id, item);
      if (item.name) map.set(item.name.toLowerCase(), item);
    }
    return map;
  }, [items]);

  // Non-cancelled sales invoices
  const activeInvoices = useMemo(
    () => invoices.filter((inv) => !inv.isCancelled),
    [invoices]
  );

  // Bill-wise profit calculations
  const billRows = useMemo(() => {
    return activeInvoices.map((inv) => {
      const { cogs, grossProfit, marginPct } = calculateBillProfit(inv, itemsMap);
      return {
        invoice: inv,
        cogs,
        grossProfit,
        marginPct,
      };
    });
  }, [activeInvoices, itemsMap]);

  // Search filtering
  const q = searchQuery.toLowerCase().trim();
  const filteredBillRows = useMemo(() => {
    let list = billRows;
    if (q) {
      list = list.filter(
        (r) =>
          r.invoice.invoiceNumber.toLowerCase().includes(q) ||
          (r.invoice.partyName && r.invoice.partyName.toLowerCase().includes(q)) ||
          r.invoice.items?.some((it) => it.name.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      let comp = 0;
      if (sortField === 'date') comp = a.invoice.date.localeCompare(b.invoice.date);
      else if (sortField === 'invoiceNumber') comp = a.invoice.invoiceNumber.localeCompare(b.invoice.invoiceNumber);
      else if (sortField === 'grandTotal') comp = a.invoice.grandTotal - b.invoice.grandTotal;
      else if (sortField === 'profit') comp = a.grossProfit - b.grossProfit;
      else if (sortField === 'margin') comp = a.marginPct - b.marginPct;

      return sortOrder === 'desc' ? -comp : comp;
    });
  }, [billRows, q, sortField, sortOrder]);

  // Item-wise sales summary
  const itemWiseSummary: ItemWiseSalesSummary[] = useMemo(() => {
    const list = aggregateItemWiseSales(activeInvoices, itemsMap);
    if (!q) return list;
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.hsnCode.toLowerCase().includes(q)
    );
  }, [activeInvoices, itemsMap, q]);

  const toggleExpand = (id: string) => {
    setExpandedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (subReport === 'item_wise') {
      const headers = ['Item Name', 'HSN/SAC', 'Unit', 'Qty Sold', 'Revenue (INR)', 'Tax Amount (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin %', 'Current Stock'];
      const rows = itemWiseSummary.map((i) => [
        i.name,
        i.hsnCode,
        i.unit,
        i.quantitySold,
        i.taxableRevenue,
        i.taxAmount,
        i.totalCogs,
        i.grossProfit,
        `${i.marginPct}%`,
        i.currentStock,
      ]);
      const totalRev = itemWiseSummary.reduce((s, i) => s + i.taxableRevenue, 0);
      const totalCogs = itemWiseSummary.reduce((s, i) => s + i.totalCogs, 0);
      const totalProfit = itemWiseSummary.reduce((s, i) => s + i.grossProfit, 0);
      const avgMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
      exportReportToCsv(`Item_Wise_Sales_${Date.now()}`, headers, rows, ['TOTAL', '', '', '', totalRev, '', totalCogs, totalProfit, `${avgMargin.toFixed(2)}%`, '']);
    } else {
      const headers = ['Invoice No', 'Date', 'Customer Name', 'Taxable (INR)', 'Tax (INR)', 'Grand Total (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin %', 'Payment Status'];
      const rows = filteredBillRows.map((r) => [
        r.invoice.invoiceNumber,
        r.invoice.date,
        r.invoice.partyName || 'Cash Customer',
        r.invoice.totalTaxableAmount,
        r.invoice.totalTax || 0,
        r.invoice.grandTotal,
        r.cogs,
        r.grossProfit,
        `${r.marginPct}%`,
        r.invoice.paymentStatus || 'PAID',
      ]);
      const totalTaxable = filteredBillRows.reduce((s, r) => s + r.invoice.totalTaxableAmount, 0);
      const totalTax = filteredBillRows.reduce((s, r) => s + (r.invoice.totalTax || 0), 0);
      const totalGrand = filteredBillRows.reduce((s, r) => s + r.invoice.grandTotal, 0);
      const totalCogs = filteredBillRows.reduce((s, r) => s + r.cogs, 0);
      const totalProfit = filteredBillRows.reduce((s, r) => s + r.grossProfit, 0);
      const avgMargin = totalTaxable > 0 ? (totalProfit / totalTaxable) * 100 : 0;
      exportReportToCsv(`Sales_Register_Profit_${Date.now()}`, headers, rows, ['TOTAL', '', '', totalTaxable, totalTax, totalGrand, totalCogs, totalProfit, `${avgMargin.toFixed(2)}%`, '']);
    }
  };

  // Export PDF
  const handleExportPdf = () => {
    if (subReport === 'item_wise') {
      const totalRev = itemWiseSummary.reduce((s, i) => s + i.taxableRevenue, 0);
      const totalCogs = itemWiseSummary.reduce((s, i) => s + i.totalCogs, 0);
      const totalProfit = itemWiseSummary.reduce((s, i) => s + i.grossProfit, 0);
      const avgMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;

      const config: ReportPdfConfig = {
        title: 'Item-Wise Sales & Profitability Report',
        company,
        dateRangeLabel,
        orientation: 'landscape',
        kpis: [
          { label: 'Total Revenue', value: formatINR(totalRev) },
          { label: 'Total COGS', value: formatINR(totalCogs) },
          { label: 'Gross Profit', value: formatINR(totalProfit) },
          { label: 'Avg Margin', value: `${avgMargin.toFixed(1)}%` },
        ],
        headers: ['Item Name', 'HSN/SAC', 'Unit', 'Qty Sold', 'Revenue (₹)', 'COGS (₹)', 'Profit (₹)', 'Margin %', 'Stock'],
        rows: itemWiseSummary.map((i) => [
          i.name,
          i.hsnCode,
          i.unit,
          i.quantitySold,
          i.taxableRevenue,
          i.totalCogs,
          i.grossProfit,
          `${i.marginPct}%`,
          i.currentStock,
        ]),
        summaryRow: ['TOTAL', '', '', '', totalRev, totalCogs, totalProfit, `${avgMargin.toFixed(1)}%`, ''],
      };
      printReportDocument(config);
    } else {
      const totalTaxable = filteredBillRows.reduce((s, r) => s + r.invoice.totalTaxableAmount, 0);
      const totalGrand = filteredBillRows.reduce((s, r) => s + r.invoice.grandTotal, 0);
      const totalCogs = filteredBillRows.reduce((s, r) => s + r.cogs, 0);
      const totalProfit = filteredBillRows.reduce((s, r) => s + r.grossProfit, 0);
      const avgMargin = totalTaxable > 0 ? (totalProfit / totalTaxable) * 100 : 0;

      const config: ReportPdfConfig = {
        title: 'Sales Register & Bill-Wise Profit Report',
        company,
        dateRangeLabel,
        orientation: 'landscape',
        kpis: [
          { label: 'Total Sales', value: formatINR(totalGrand) },
          { label: 'Total COGS', value: formatINR(totalCogs) },
          { label: 'Gross Profit', value: formatINR(totalProfit) },
          { label: 'Avg Margin', value: `${avgMargin.toFixed(1)}%` },
        ],
        headers: ['Invoice #', 'Date', 'Customer Name', 'Taxable (₹)', 'Total (₹)', 'COGS (₹)', 'Profit (₹)', 'Margin %', 'Status'],
        rows: filteredBillRows.map((r) => [
          r.invoice.invoiceNumber,
          formatDate(r.invoice.date),
          r.invoice.partyName || 'Cash Customer',
          r.invoice.totalTaxableAmount,
          r.invoice.grandTotal,
          r.cogs,
          r.grossProfit,
          `${r.marginPct}%`,
          r.invoice.paymentStatus || 'PAID',
        ]),
        summaryRow: ['TOTAL', '', '', totalTaxable, totalGrand, totalCogs, totalProfit, `${avgMargin.toFixed(1)}%`, ''],
      };
      printReportDocument(config);
    }
  };

  useEffect(() => {
    if (onRegisterExportHandlers) {
      onRegisterExportHandlers({
        exportCsv: handleExportCsv,
        exportPdf: handleExportPdf,
      });
    }
  }, [subReport, filteredBillRows, itemWiseSummary]);

  return (
    <div className="space-y-4">
      {/* 1. Sales Register with Bill-Wise Profit & Expandable Line Items */}
      {subReport === 'sales_register' && (
        <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
                <tr>
                  <th className="p-3 w-8"></th>
                  <th className="p-3 cursor-pointer hover:bg-surface-container-highest" onClick={() => handleSort('invoiceNumber')}>
                    <div className="flex items-center gap-1">Invoice # <ArrowUpDown size={12} /></div>
                  </th>
                  <th className="p-3 cursor-pointer hover:bg-surface-container-highest" onClick={() => handleSort('date')}>
                    <div className="flex items-center gap-1">Date <ArrowUpDown size={12} /></div>
                  </th>
                  <th className="p-3">Customer</th>
                  <th className="p-3 text-right">Taxable (₹)</th>
                  <th className="p-3 text-right cursor-pointer hover:bg-surface-container-highest" onClick={() => handleSort('grandTotal')}>
                    <div className="flex items-center justify-end gap-1">Total (₹) <ArrowUpDown size={12} /></div>
                  </th>
                  <th className="p-3 text-right">COGS (₹)</th>
                  <th className="p-3 text-right cursor-pointer hover:bg-surface-container-highest" onClick={() => handleSort('profit')}>
                    <div className="flex items-center justify-end gap-1">Profit (₹) <ArrowUpDown size={12} /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer hover:bg-surface-container-highest" onClick={() => handleSort('margin')}>
                    <div className="flex items-center justify-end gap-1">Margin % <ArrowUpDown size={12} /></div>
                  </th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredBillRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-on-surface-variant">
                      No sales recorded in this period matching the criteria.
                    </td>
                  </tr>
                ) : (
                  filteredBillRows.map((r) => {
                    const isExpanded = expandedInvoiceIds.has(r.invoice.id);
                    const isProfitable = r.grossProfit >= 0;

                    return (
                      <React.Fragment key={r.invoice.id}>
                        <tr
                          onClick={() => toggleExpand(r.invoice.id)}
                          className="hover:bg-surface-container-lowest transition-colors cursor-pointer"
                        >
                          <td className="p-3 text-on-surface-variant">
                            <button
                              aria-label={isExpanded ? 'Collapse invoice line items' : 'Expand invoice line items'}
                              className="p-1 rounded-md hover:bg-surface-container"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </td>
                          <td className="p-3 font-semibold text-primary">{r.invoice.invoiceNumber}</td>
                          <td className="p-3 text-on-surface-variant">{formatDate(r.invoice.date)}</td>
                          <td className="p-3 font-medium text-on-surface">{r.invoice.partyName || 'Cash Customer'}</td>
                          <td className="p-3 text-right font-medium">{formatINR(r.invoice.totalTaxableAmount)}</td>
                          <td className="p-3 text-right font-bold text-on-surface">{formatINR(r.invoice.grandTotal)}</td>
                          <td className="p-3 text-right text-on-surface-variant">{formatINR(r.cogs)}</td>
                          <td className={`p-3 text-right font-bold ${isProfitable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                            {formatINR(r.grossProfit)}
                          </td>
                          <td className={`p-3 text-right font-semibold ${isProfitable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                            {r.marginPct.toFixed(1)}%
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.invoice.paymentStatus === 'PAID'
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                  : r.invoice.paymentStatus === 'PARTIAL'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {r.invoice.paymentStatus || 'PAID'}
                            </span>
                          </td>
                        </tr>

                        {/* Expandable Line Items Accordion */}
                        {isExpanded && (
                          <tr className="bg-surface-container-lowest/70">
                            <td colSpan={10} className="p-3 pl-10 border-t border-b border-outline-variant/30">
                              <div className="bg-surface rounded-lg p-3 border border-outline-variant/30">
                                <div className="text-[11px] font-bold text-on-surface-variant mb-2">
                                  Billed Line Items ({r.invoice.items?.length || 0})
                                </div>
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="text-on-surface-variant/80 border-b border-outline-variant/20">
                                      <th className="pb-1 text-left">Item</th>
                                      <th className="pb-1 text-right">Qty</th>
                                      <th className="pb-1 text-right">Unit Price</th>
                                      <th className="pb-1 text-right">Taxable</th>
                                      <th className="pb-1 text-right">Unit Cost</th>
                                      <th className="pb-1 text-right">Line Profit</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-outline-variant/10">
                                    {(r.invoice.items || []).map((it, idx) => {
                                      const matched = it.itemId ? itemsMap.get(it.itemId) : undefined;
                                      const cost = matched?.purchasePrice || 0;
                                      const lineCogs = it.quantity * cost;
                                      const lineProfit = it.taxableAmount - lineCogs;

                                      return (
                                        <tr key={idx} className="py-1">
                                          <td className="py-1 font-medium text-on-surface">{it.name}</td>
                                          <td className="py-1 text-right">{it.quantity} {it.unit}</td>
                                          <td className="py-1 text-right">{formatINR(it.unitPrice)}</td>
                                          <td className="py-1 text-right">{formatINR(it.taxableAmount)}</td>
                                          <td className="py-1 text-right text-on-surface-variant">{formatINR(cost)}</td>
                                          <td className={`py-1 text-right font-semibold ${lineProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                            {formatINR(lineProfit)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              {filteredBillRows.length > 0 && (
                <tfoot className="bg-surface-container-high font-bold border-t border-outline-variant/50">
                  <tr>
                    <td colSpan={4} className="p-3">TOTAL ({filteredBillRows.length} bills)</td>
                    <td className="p-3 text-right">{formatINR(filteredBillRows.reduce((s, r) => s + r.invoice.totalTaxableAmount, 0))}</td>
                    <td className="p-3 text-right text-primary">{formatINR(filteredBillRows.reduce((s, r) => s + r.invoice.grandTotal, 0))}</td>
                    <td className="p-3 text-right text-on-surface-variant">{formatINR(filteredBillRows.reduce((s, r) => s + r.cogs, 0))}</td>
                    <td className="p-3 text-right text-emerald-700 dark:text-emerald-400">{formatINR(filteredBillRows.reduce((s, r) => s + r.grossProfit, 0))}</td>
                    <td className="p-3 text-right text-emerald-700 dark:text-emerald-400">
                      {(() => {
                        const totalTaxable = filteredBillRows.reduce((s, r) => s + r.invoice.totalTaxableAmount, 0);
                        const totalProfit = filteredBillRows.reduce((s, r) => s + r.grossProfit, 0);
                        return totalTaxable > 0 ? `${((totalProfit / totalTaxable) * 100).toFixed(1)}%` : '0%';
                      })()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* 2. Item-Wise Sales & Margin Report */}
      {subReport === 'item_wise' && (
        <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">HSN Code</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Qty Sold</th>
                  <th className="p-3 text-right">Revenue (₹)</th>
                  <th className="p-3 text-right">Tax (₹)</th>
                  <th className="p-3 text-right">COGS (₹)</th>
                  <th className="p-3 text-right">Gross Profit (₹)</th>
                  <th className="p-3 text-right">Margin %</th>
                  <th className="p-3 text-right">Current Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {itemWiseSummary.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-on-surface-variant">
                      No item sales recorded in this period.
                    </td>
                  </tr>
                ) : (
                  itemWiseSummary.map((item, idx) => {
                    const isProfitable = item.grossProfit >= 0;

                    return (
                      <tr key={idx} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-3 font-semibold text-on-surface">{item.name}</td>
                        <td className="p-3 font-mono text-on-surface-variant">{item.hsnCode}</td>
                        <td className="p-3 text-on-surface-variant">{item.unit}</td>
                        <td className="p-3 text-right font-medium">{item.quantitySold}</td>
                        <td className="p-3 text-right font-bold text-primary">{formatINR(item.taxableRevenue)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(item.taxAmount)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(item.totalCogs)}</td>
                        <td className={`p-3 text-right font-bold ${isProfitable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                          {formatINR(item.grossProfit)}
                        </td>
                        <td className={`p-3 text-right font-semibold ${isProfitable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                          {item.marginPct.toFixed(1)}%
                        </td>
                        <td className="p-3 text-right font-mono text-on-surface-variant">{item.currentStock}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {itemWiseSummary.length > 0 && (
                <tfoot className="bg-surface-container-high font-bold border-t border-outline-variant/50">
                  <tr>
                    <td colSpan={3} className="p-3">TOTAL ({itemWiseSummary.length} items)</td>
                    <td className="p-3 text-right">{itemWiseSummary.reduce((s, i) => s + i.quantitySold, 0)}</td>
                    <td className="p-3 text-right text-primary">{formatINR(itemWiseSummary.reduce((s, i) => s + i.taxableRevenue, 0))}</td>
                    <td className="p-3 text-right">{formatINR(itemWiseSummary.reduce((s, i) => s + i.taxAmount, 0))}</td>
                    <td className="p-3 text-right text-on-surface-variant">{formatINR(itemWiseSummary.reduce((s, i) => s + i.totalCogs, 0))}</td>
                    <td className="p-3 text-right text-emerald-700 dark:text-emerald-400">{formatINR(itemWiseSummary.reduce((s, i) => s + i.grossProfit, 0))}</td>
                    <td className="p-3 text-right text-emerald-700 dark:text-emerald-400">
                      {(() => {
                        const totalRev = itemWiseSummary.reduce((s, i) => s + i.taxableRevenue, 0);
                        const totalProfit = itemWiseSummary.reduce((s, i) => s + i.grossProfit, 0);
                        return totalRev > 0 ? `${((totalProfit / totalRev) * 100).toFixed(1)}%` : '0%';
                      })()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
