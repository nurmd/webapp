import React, { useMemo, useEffect } from 'react';
import { PurchaseBill } from '../../../models/purchase.ts';
import { Expense } from '../../../models/expense.ts';
import { CompanyProfile } from '../../../models/company.ts';
import { formatINR, formatDate } from '../../../core/utils/formatters.ts';
import {
  aggregateExpenseCategories,
  ExpenseCategorySummary,
  ExpenseAggregationsResult,
} from '../utils/reportAggregations.ts';
import { exportReportToCsv, printReportDocument, ReportPdfConfig } from '../utils/reportExportUtils.ts';
import { Wallet, Landmark, ShieldCheck } from 'lucide-react';

interface PurchasesExpensesCategoryProps {
  company: CompanyProfile;
  purchases: PurchaseBill[];
  expenses: Expense[];
  subReport: string; // 'purchase_register' | 'expense_breakdown'
  searchQuery: string;
  dateRangeLabel: string;
  onRegisterExportHandlers?: (handlers: { exportCsv: () => void; exportPdf: () => void }) => void;
}

export const PurchasesExpensesCategory: React.FC<PurchasesExpensesCategoryProps> = ({
  company,
  purchases,
  expenses,
  subReport,
  searchQuery,
  dateRangeLabel,
  onRegisterExportHandlers,
}) => {
  // Non-cancelled purchases
  const activePurchases = useMemo(
    () => purchases.filter((p) => !p.isCancelled),
    [purchases]
  );

  // Search filter
  const q = searchQuery.toLowerCase().trim();
  const filteredPurchases = useMemo(() => {
    if (!q) return activePurchases;
    return activePurchases.filter(
      (p) =>
        p.billNumber.toLowerCase().includes(q) ||
        (p.supplierName && p.supplierName.toLowerCase().includes(q)) ||
        (p.supplierGstin && p.supplierGstin.toLowerCase().includes(q))
    );
  }, [activePurchases, q]);

  // Expense Aggregation across 10 categories
  const expenseData: ExpenseAggregationsResult = useMemo(
    () => aggregateExpenseCategories(expenses),
    [expenses]
  );

  const filteredExpenseCategories = useMemo(() => {
    if (!q) return expenseData.categories;
    return expenseData.categories.filter((c) =>
      c.category.toLowerCase().includes(q)
    );
  }, [expenseData.categories, q]);

  // Export handlers
  const handleExportCsv = () => {
    if (subReport === 'expense_breakdown') {
      const headers = ['Category', 'Voucher Count', 'Taxable Amount (INR)', 'Tax Amount (INR)', 'Total Expense (INR)', 'Share %', 'Claimable ITC (INR)'];
      const rows = filteredExpenseCategories.map((c) => [
        c.category,
        c.count,
        c.taxableAmount,
        c.taxAmount,
        c.totalAmount,
        `${c.percentageShare}%`,
        c.itcClaimable,
      ]);
      exportReportToCsv(`Expense_Category_Breakdown_${Date.now()}`, headers, rows, [
        'TOTAL',
        filteredExpenseCategories.reduce((s, c) => s + c.count, 0),
        expenseData.totalTaxable,
        expenseData.totalTax,
        expenseData.totalExpense,
        '100.00%',
        expenseData.totalItc,
      ]);
    } else {
      const headers = ['Bill Number', 'Date', 'Supplier Name', 'Supplier GSTIN', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Cess (INR)', 'Bill Total (INR)', 'ITC Eligibility', 'Status'];
      const rows = filteredPurchases.map((p) => [
        p.billNumber,
        p.date,
        p.supplierName || 'Cash Supplier',
        p.supplierGstin || '-',
        p.totalTaxableAmount,
        p.totalCgst,
        (p.totalSgst || p.totalUtgst || 0),
        p.totalIgst,
        p.totalCess || 0,
        p.grandTotal,
        p.itcEligibility || 'ELIGIBLE_INPUTS',
        p.paymentStatus || 'PAID',
      ]);
      const totalTaxable = filteredPurchases.reduce((s, p) => s + p.totalTaxableAmount, 0);
      const totalGrand = filteredPurchases.reduce((s, p) => s + p.grandTotal, 0);
      exportReportToCsv(`Purchase_Register_${Date.now()}`, headers, rows, ['TOTAL', '', '', '', totalTaxable, '', '', '', '', totalGrand, '', '']);
    }
  };

  const handleExportPdf = () => {
    if (subReport === 'expense_breakdown') {
      const config: ReportPdfConfig = {
        title: 'Expense Category Breakdown & Outflow Analysis',
        subtitle: '10 Standard Categories with Cash vs Bank Split',
        company,
        dateRangeLabel,
        orientation: 'portrait',
        kpis: [
          { label: 'Total Expense', value: formatINR(expenseData.totalExpense) },
          { label: 'Cash Outflow', value: formatINR(expenseData.cashOutflow) },
          { label: 'Bank Outflow', value: formatINR(expenseData.bankOutflow) },
          { label: 'Claimable ITC', value: formatINR(expenseData.totalItc) },
        ],
        headers: ['Category', 'Vouchers', 'Taxable (₹)', 'Tax (₹)', 'Total (₹)', 'Share %', 'Claimable ITC (₹)'],
        rows: filteredExpenseCategories.map((c) => [
          c.category,
          c.count,
          c.taxableAmount,
          c.taxAmount,
          c.totalAmount,
          `${c.percentageShare}%`,
          c.itcClaimable,
        ]),
        summaryRow: [
          'TOTAL',
          filteredExpenseCategories.reduce((s, c) => s + c.count, 0),
          expenseData.totalTaxable,
          expenseData.totalTax,
          expenseData.totalExpense,
          '100%',
          expenseData.totalItc,
        ],
      };
      printReportDocument(config);
    } else {
      const totalTaxable = filteredPurchases.reduce((s, p) => s + p.totalTaxableAmount, 0);
      const totalGrand = filteredPurchases.reduce((s, p) => s + p.grandTotal, 0);

      const config: ReportPdfConfig = {
        title: 'Purchase Register & Supplier Inward Supplies',
        company,
        dateRangeLabel,
        orientation: 'landscape',
        kpis: [
          { label: 'Total Purchases', value: formatINR(totalGrand) },
          { label: 'Total Taxable', value: formatINR(totalTaxable) },
          { label: 'Total Tax Paid', value: formatINR(totalGrand - totalTaxable) },
          { label: 'Bills Recorded', value: String(filteredPurchases.length) },
        ],
        headers: ['Bill #', 'Date', 'Supplier Name', 'GSTIN', 'Taxable (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total (₹)', 'ITC Status', 'Payment'],
        rows: filteredPurchases.map((p) => [
          p.billNumber,
          formatDate(p.date),
          p.supplierName || 'Cash Supplier',
          p.supplierGstin || '-',
          p.totalTaxableAmount,
          p.totalCgst,
          (p.totalSgst || p.totalUtgst || 0),
          p.totalIgst,
          p.grandTotal,
          p.itcEligibility || 'ELIGIBLE_INPUTS',
          p.paymentStatus || 'PAID',
        ]),
        summaryRow: ['TOTAL', '', '', '', totalTaxable, '', '', '', totalGrand, '', ''],
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
  }, [subReport, filteredPurchases, filteredExpenseCategories, expenseData]);

  return (
    <div className="space-y-4">
      {/* 1. Purchase Register View */}
      {subReport === 'purchase_register' && (
        <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
                <tr>
                  <th className="p-3">Bill #</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Supplier Name</th>
                  <th className="p-3">Supplier GSTIN</th>
                  <th className="p-3 text-right">Taxable (₹)</th>
                  <th className="p-3 text-right">CGST (₹)</th>
                  <th className="p-3 text-right">SGST (₹)</th>
                  <th className="p-3 text-right">IGST (₹)</th>
                  <th className="p-3 text-right">Bill Total (₹)</th>
                  <th className="p-3 text-center">ITC Eligibility</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-on-surface-variant">
                      No purchase bills recorded for this period.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((p) => {
                    const isBlocked175 = p.itcEligibility === 'INELIGIBLE_17_5';
                    const isEligible = !isBlocked175 && p.itcEligibility !== 'INELIGIBLE_OTHERS';

                    return (
                      <tr key={p.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-3 font-semibold text-primary">{p.billNumber}</td>
                        <td className="p-3 text-on-surface-variant">{formatDate(p.date)}</td>
                        <td className="p-3 font-medium text-on-surface">{p.supplierName || 'Cash Supplier'}</td>
                        <td className="p-3 font-mono text-[11px] text-on-surface-variant">{p.supplierGstin || '-'}</td>
                        <td className="p-3 text-right font-medium">{formatINR(p.totalTaxableAmount)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(p.totalCgst)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(p.totalSgst || p.totalUtgst || 0)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(p.totalIgst)}</td>
                        <td className="p-3 text-right font-bold text-on-surface">{formatINR(p.grandTotal)}</td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isEligible
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {isBlocked175 ? '17(5) Blocked' : 'Eligible ITC'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.paymentStatus === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {p.paymentStatus || 'PAID'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredPurchases.length > 0 && (
                <tfoot className="bg-surface-container-high font-bold border-t border-outline-variant/50">
                  <tr>
                    <td colSpan={4} className="p-3">TOTAL ({filteredPurchases.length} bills)</td>
                    <td className="p-3 text-right">{formatINR(filteredPurchases.reduce((s, p) => s + p.totalTaxableAmount, 0))}</td>
                    <td className="p-3 text-right">{formatINR(filteredPurchases.reduce((s, p) => s + p.totalCgst, 0))}</td>
                    <td className="p-3 text-right">{formatINR(filteredPurchases.reduce((s, p) => s + (p.totalSgst || p.totalUtgst || 0), 0))}</td>
                    <td className="p-3 text-right">{formatINR(filteredPurchases.reduce((s, p) => s + p.totalIgst, 0))}</td>
                    <td className="p-3 text-right text-primary">{formatINR(filteredPurchases.reduce((s, p) => s + p.grandTotal, 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* 2. Expense Category Breakdown across 10 Categories */}
      {subReport === 'expense_breakdown' && (
        <div className="space-y-4">
          {/* Outflow Split Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface p-3.5 rounded-xl border border-outline-variant/30 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Wallet size={20} />
              </div>
              <div>
                <div className="text-xs text-on-surface-variant font-medium">Cash Expenses</div>
                <div className="text-lg font-bold text-on-surface mt-0.5">{formatINR(expenseData.cashOutflow)}</div>
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-outline-variant/30 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Landmark size={20} />
              </div>
              <div>
                <div className="text-xs text-on-surface-variant font-medium">Bank & Digital Payments</div>
                <div className="text-lg font-bold text-on-surface mt-0.5">{formatINR(expenseData.bankOutflow)}</div>
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-outline-variant/30 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div>
                <div className="text-xs text-on-surface-variant font-medium">Eligible ITC Claimable</div>
                <div className="text-lg font-bold text-indigo-700 dark:text-indigo-400 mt-0.5">{formatINR(expenseData.totalItc)}</div>
              </div>
            </div>
          </div>

          {/* Category Table */}
          <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
                  <tr>
                    <th className="p-3">Expense Category (10 Categories)</th>
                    <th className="p-3 text-right">Voucher Count</th>
                    <th className="p-3 text-right">Taxable (₹)</th>
                    <th className="p-3 text-right">GST (₹)</th>
                    <th className="p-3 text-right">Total Expense (₹)</th>
                    <th className="p-3 text-right">Share of Expense</th>
                    <th className="p-3 text-right">Claimable ITC (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filteredExpenseCategories.map((c, idx) => {
                    return (
                      <tr key={idx} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-3 font-semibold text-on-surface">{c.category}</td>
                        <td className="p-3 text-right font-medium text-on-surface-variant">{c.count}</td>
                        <td className="p-3 text-right">{formatINR(c.taxableAmount)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(c.taxAmount)}</td>
                        <td className="p-3 text-right font-bold text-on-surface">{formatINR(c.totalAmount)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-primary h-full rounded-full"
                                style={{ width: `${Math.min(100, c.percentageShare)}%` }}
                              />
                            </div>
                            <span className="font-medium text-on-surface-variant min-w-[36px]">{c.percentageShare.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatINR(c.itcClaimable)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-surface-container-high font-bold border-t border-outline-variant/50">
                  <tr>
                    <td className="p-3">TOTAL OPERATIONAL EXPENSES</td>
                    <td className="p-3 text-right">{filteredExpenseCategories.reduce((s, c) => s + c.count, 0)}</td>
                    <td className="p-3 text-right">{formatINR(expenseData.totalTaxable)}</td>
                    <td className="p-3 text-right">{formatINR(expenseData.totalTax)}</td>
                    <td className="p-3 text-right text-primary">{formatINR(expenseData.totalExpense)}</td>
                    <td className="p-3 text-right">100.0%</td>
                    <td className="p-3 text-right text-emerald-700 dark:text-emerald-400">{formatINR(expenseData.totalItc)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
