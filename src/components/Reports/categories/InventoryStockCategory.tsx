import React, { useMemo, useEffect } from 'react';
import { InventoryItem } from '../../../models/item.ts';
import { CompanyProfile } from '../../../models/company.ts';
import { formatINR } from '../../../core/utils/formatters.ts';
import {
  aggregateStockValuation,
  StockValuationSummary,
} from '../utils/reportAggregations.ts';
import { exportReportToCsv, printReportDocument, ReportPdfConfig } from '../utils/reportExportUtils.ts';
import { Package, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';

interface InventoryStockCategoryProps {
  company: CompanyProfile;
  items: InventoryItem[];
  subReport: string; // 'stock_valuation' | 'low_stock'
  searchQuery: string;
  dateRangeLabel: string;
  onRegisterExportHandlers?: (handlers: { exportCsv: () => void; exportPdf: () => void }) => void;
}

export const InventoryStockCategory: React.FC<InventoryStockCategoryProps> = ({
  company,
  items,
  subReport,
  searchQuery,
  dateRangeLabel,
  onRegisterExportHandlers,
}) => {
  const activeItems = useMemo(
    () => items.filter((item) => !item.isDisabled),
    [items]
  );

  const stockValuation: StockValuationSummary = useMemo(
    () => aggregateStockValuation(activeItems),
    [activeItems]
  );

  // Search and sub-report filtering
  const q = searchQuery.toLowerCase().trim();

  const filteredItems = useMemo(() => {
    let list = activeItems;

    if (subReport === 'low_stock') {
      list = list.filter((i) => {
        const minAlert = i.minStockAlert !== undefined ? i.minStockAlert : 5;
        return (i.currentStock || 0) <= minAlert;
      });
    }

    if (q) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.hsnSacCode && i.hsnSacCode.toLowerCase().includes(q)) ||
          (i.category && i.category.toLowerCase().includes(q)) ||
          (i.sku && i.sku.toLowerCase().includes(q))
      );
    }

    // Sort: low stock first in low stock view, or by valuation in valuation view
    if (subReport === 'low_stock') {
      return [...list].sort((a, b) => (a.currentStock || 0) - (b.currentStock || 0));
    }
    return [...list].sort((a, b) => (b.currentStock * (b.purchasePrice || 0)) - (a.currentStock * (a.purchasePrice || 0)));
  }, [activeItems, subReport, q]);

  // Export handlers
  const handleExportCsv = () => {
    const isLowStock = subReport === 'low_stock';
    const headers = [
      'Item Name',
      'Category',
      'HSN/SAC Code',
      'Current Stock',
      'Unit',
      'Purchase Price (INR)',
      'Sale Price (INR)',
      'Valuation @ Cost (INR)',
      'Valuation @ Sale (INR)',
      'Potential Profit (INR)',
      'Stock Status',
    ];

    const rows = filteredItems.map((i) => {
      const stock = i.currentStock || 0;
      const costVal = stock * (i.purchasePrice || 0);
      const saleVal = stock * (i.salePrice || 0);
      const profit = saleVal - costVal;

      let status = 'Normal';
      if (stock < 0) status = 'Negative Stock';
      else if (stock === 0) status = 'Out of Stock';
      else if (i.minStockAlert !== undefined && stock <= i.minStockAlert) status = 'Low Stock Alert';

      return [
        i.name,
        i.category || 'General',
        i.hsnSacCode || '-',
        stock,
        i.unit || 'PCS',
        i.purchasePrice || 0,
        i.salePrice || 0,
        costVal,
        saleVal,
        profit,
        status,
      ];
    });

    const totalCost = filteredItems.reduce((s, i) => s + (i.currentStock * (i.purchasePrice || 0)), 0);
    const totalSale = filteredItems.reduce((s, i) => s + (i.currentStock * (i.salePrice || 0)), 0);
    const totalProfit = totalSale - totalCost;

    exportReportToCsv(
      `${isLowStock ? 'Low_Stock_Alerts' : 'Stock_Valuation'}_${Date.now()}`,
      headers,
      rows,
      ['TOTAL', '', '', '', '', '', '', totalCost, totalSale, totalProfit, '']
    );
  };

  const handleExportPdf = () => {
    const isLowStock = subReport === 'low_stock';
    const totalCost = filteredItems.reduce((s, i) => s + (i.currentStock * (i.purchasePrice || 0)), 0);
    const totalSale = filteredItems.reduce((s, i) => s + (i.currentStock * (i.salePrice || 0)), 0);
    const totalProfit = totalSale - totalCost;
    const avgMargin = totalSale > 0 ? (totalProfit / totalSale) * 100 : 0;

    const config: ReportPdfConfig = {
      title: isLowStock ? 'Low Stock Alerts & Reorder Report' : 'Stock Summary & Inventory Valuation',
      subtitle: `As of ${new Date().toLocaleDateString('en-IN')}`,
      company,
      dateRangeLabel,
      orientation: 'landscape',
      kpis: [
        { label: 'Total Valuation (Cost)', value: formatINR(totalCost) },
        { label: 'Total Valuation (Sale)', value: formatINR(totalSale) },
        { label: 'Expected Gross Margin', value: `${avgMargin.toFixed(1)}%` },
        { label: 'Low Stock Items', value: String(stockValuation.lowStockCount) },
      ],
      headers: ['Item Name', 'Category', 'HSN Code', 'Stock', 'Unit', 'Buy Price (₹)', 'Sell Price (₹)', 'Valuation @ Cost (₹)', 'Valuation @ Sale (₹)', 'Status'],
      rows: filteredItems.map((i) => {
        const stock = i.currentStock || 0;
        const costVal = stock * (i.purchasePrice || 0);
        const saleVal = stock * (i.salePrice || 0);

        let status = 'Normal';
        if (stock < 0) status = 'Negative';
        else if (stock === 0) status = 'Out of Stock';
        else if (i.minStockAlert !== undefined && stock <= i.minStockAlert) status = 'Low Stock';

        return [
          i.name,
          i.category || 'General',
          i.hsnSacCode || '-',
          stock,
          i.unit || 'PCS',
          i.purchasePrice || 0,
          i.salePrice || 0,
          costVal,
          saleVal,
          status,
        ];
      }),
      summaryRow: ['TOTAL', '', '', '', '', '', '', totalCost, totalSale, ''],
    };

    printReportDocument(config);
  };

  useEffect(() => {
    if (onRegisterExportHandlers) {
      onRegisterExportHandlers({
        exportCsv: handleExportCsv,
        exportPdf: handleExportPdf,
      });
    }
  }, [subReport, filteredItems, stockValuation]);

  return (
    <div className="space-y-4">
      {/* Low stock warning banner if low stock subreport or items exist */}
      {subReport === 'low_stock' && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-800 dark:text-amber-300 text-xs">
          <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <strong>Reorder Sheet:</strong> Items shown below have fallen to or below their configured minimum stock alert levels. Reorder promptly to avoid stock-outs.
          </div>
        </div>
      )}

      {/* Stock Summary Table */}
      <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
              <tr>
                <th className="p-3">Product Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">HSN Code</th>
                <th className="p-3 text-right">Current Stock</th>
                <th className="p-3 text-right">Purchase Price (₹)</th>
                <th className="p-3 text-right">Selling Price (₹)</th>
                <th className="p-3 text-right">Valuation @ Cost (₹)</th>
                <th className="p-3 text-right">Valuation @ Sale (₹)</th>
                <th className="p-3 text-right">Potential Margin</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-on-surface-variant">
                    {subReport === 'low_stock'
                      ? 'No low stock warnings. All items are above reorder thresholds.'
                      : 'No inventory items found matching your search.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const stock = item.currentStock || 0;
                  const buyPrice = item.purchasePrice || 0;
                  const sellPrice = item.salePrice || 0;
                  const costValuation = stock * buyPrice;
                  const saleValuation = stock * sellPrice;
                  const potentialProfit = saleValuation - costValuation;
                  const marginPct = saleValuation > 0 ? (potentialProfit / saleValuation) * 100 : 0;

                  const isLow = item.minStockAlert !== undefined && stock <= item.minStockAlert && stock > 0;
                  const isOut = stock === 0;
                  const isNeg = stock < 0;

                  return (
                    <tr key={item.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-3 font-semibold text-on-surface">
                        <div className="flex items-center gap-1.5">
                          <span>{item.name}</span>
                          {item.sku && <span className="text-[10px] text-on-surface-variant font-mono">({item.sku})</span>}
                        </div>
                      </td>
                      <td className="p-3 text-on-surface-variant">{item.category || 'General'}</td>
                      <td className="p-3 font-mono text-on-surface-variant">{item.hsnSacCode || '-'}</td>
                      <td className="p-3 text-right font-mono font-bold text-on-surface">
                        {stock} <span className="text-[10px] font-normal text-on-surface-variant">{item.unit || 'PCS'}</span>
                      </td>
                      <td className="p-3 text-right text-on-surface-variant">{formatINR(buyPrice)}</td>
                      <td className="p-3 text-right font-medium text-on-surface">{formatINR(sellPrice)}</td>
                      <td className="p-3 text-right font-bold text-primary">{formatINR(costValuation)}</td>
                      <td className="p-3 text-right font-bold text-on-surface">{formatINR(saleValuation)}</td>
                      <td className="p-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                        {marginPct.toFixed(1)}%
                      </td>
                      <td className="p-3 text-center">
                        {isNeg ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400">
                            Negative
                          </span>
                        ) : isOut ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1">
                            <AlertTriangle size={10} />
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                            <CheckCircle2 size={10} />
                            In Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredItems.length > 0 && (
              <tfoot className="bg-surface-container-high font-bold border-t border-outline-variant/50">
                <tr>
                  <td colSpan={3} className="p-3">TOTAL ({filteredItems.length} items)</td>
                  <td className="p-3 text-right font-mono">{filteredItems.reduce((s, i) => s + (i.currentStock || 0), 0)}</td>
                  <td colSpan={2}></td>
                  <td className="p-3 text-right text-primary">
                    {formatINR(filteredItems.reduce((s, i) => s + ((i.currentStock || 0) * (i.purchasePrice || 0)), 0))}
                  </td>
                  <td className="p-3 text-right text-on-surface">
                    {formatINR(filteredItems.reduce((s, i) => s + ((i.currentStock || 0) * (i.salePrice || 0)), 0))}
                  </td>
                  <td className="p-3 text-right text-emerald-700 dark:text-emerald-400">
                    {(() => {
                      const totalCost = filteredItems.reduce((s, i) => s + ((i.currentStock || 0) * (i.purchasePrice || 0)), 0);
                      const totalSale = filteredItems.reduce((s, i) => s + ((i.currentStock || 0) * (i.salePrice || 0)), 0);
                      const profit = totalSale - totalCost;
                      return totalSale > 0 ? `${((profit / totalSale) * 100).toFixed(1)}%` : '0%';
                    })()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
