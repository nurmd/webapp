import React, { useState, useMemo, useEffect } from 'react';
import { Invoice } from '../../../models/invoice.ts';
import { PurchaseBill } from '../../../models/purchase.ts';
import { Expense } from '../../../models/expense.ts';
import { CompanyProfile } from '../../../models/company.ts';
import { formatINR, formatDate } from '../../../core/utils/formatters.ts';
import { downloadGstr1JsonFile } from '../../../core/gst/gstrExport.ts';
import { exportReportToCsv, printReportDocument, ReportPdfConfig } from '../utils/reportExportUtils.ts';
import { aggregateGstr3b } from '../utils/reportAggregations.ts';
import { Download, FileSpreadsheet, ShieldCheck, Printer } from 'lucide-react';

interface GstTaxComplianceCategoryProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  subReport: string; // 'gstr1' | 'gstr3b' | 'hsn'
  searchQuery: string;
  dateRangeLabel: string;
  onRegisterExportHandlers?: (handlers: { exportCsv: () => void; exportPdf: () => void }) => void;
}

export const GstTaxComplianceCategory: React.FC<GstTaxComplianceCategoryProps> = ({
  company,
  invoices,
  purchases,
  expenses,
  subReport,
  searchQuery,
  dateRangeLabel,
  onRegisterExportHandlers,
}) => {
  const [selectedGstr1Table, setSelectedGstr1Table] = useState<'4_b2b' | '7_b2cs' | '9b_cdnr' | '12_hsn'>('4_b2b');

  // 1. GSTR-1 Filtered Datasets
  const activeInvoices = useMemo(
    () => invoices.filter((inv) => !inv.isCancelled),
    [invoices]
  );

  // B2B: Registered invoices with partyGstin
  const b2bInvoices = useMemo(() => {
    return activeInvoices.filter((i) => {
      const isB2bType = i.invoiceType === 'B2B' || (i.partyGstin && i.partyGstin.trim().length === 15);
      const notNote = i.invoiceType !== 'CREDIT_NOTE' && i.invoiceType !== 'DEBIT_NOTE';
      return isB2bType && notNote;
    });
  }, [activeInvoices]);

  // B2CS: Unregistered intra-state or inter-state <= 2.5L
  const b2csInvoices = useMemo(() => {
    return activeInvoices.filter((i) => {
      const isB2c = i.invoiceType === 'B2CS' || !i.partyGstin || i.partyGstin.trim().length === 0;
      const notNote = i.invoiceType !== 'CREDIT_NOTE' && i.invoiceType !== 'DEBIT_NOTE';
      return isB2c && notNote;
    });
  }, [activeInvoices]);

  // CDNR: Credit / Debit Notes
  const cdnrInvoices = useMemo(() => {
    return activeInvoices.filter((i) => i.invoiceType === 'CREDIT_NOTE' || i.invoiceType === 'DEBIT_NOTE');
  }, [activeInvoices]);

  // HSN Summary (Table 12)
  const hsnSummaryList = useMemo(() => {
    const map = new Map<string, {
      hsnCode: string;
      description: string;
      unit: string;
      totalQty: number;
      totalValue: number;
      taxableValue: number;
      cgst: number;
      sgst: number;
      igst: number;
      cess: number;
    }>();

    for (const inv of activeInvoices) {
      const multiplier = inv.invoiceType === 'CREDIT_NOTE' ? -1 : 1;
      for (const item of inv.items || []) {
        const code = item.hsnSacCode || 'UNSPECIFIED';
        const existing = map.get(code) || {
          hsnCode: code,
          description: item.name || 'General Item',
          unit: item.unit || 'PCS',
          totalQty: 0,
          totalValue: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
        };

        existing.totalQty += multiplier * item.quantity;
        existing.totalValue += multiplier * item.totalAmount;
        existing.taxableValue += multiplier * item.taxableAmount;
        existing.cgst += multiplier * (item.cgstAmount || 0);
        existing.sgst += multiplier * ((item.sgstAmount || 0) + (item.utgstAmount || 0));
        existing.igst += multiplier * (item.igstAmount || 0);
        existing.cess += multiplier * (item.cessAmount || 0);

        map.set(code, existing);
      }
    }

    return Array.from(map.values()).map((h) => ({
      ...h,
      totalQty: Math.round(h.totalQty * 100) / 100,
      totalValue: Math.round(h.totalValue * 100) / 100,
      taxableValue: Math.round(h.taxableValue * 100) / 100,
      cgst: Math.round(h.cgst * 100) / 100,
      sgst: Math.round(h.sgst * 100) / 100,
      igst: Math.round(h.igst * 100) / 100,
      cess: Math.round(h.cess * 100) / 100,
    }));
  }, [activeInvoices]);

  // GSTR-3B Aggregations
  const gstr3b = useMemo(
    () => aggregateGstr3b(invoices, purchases, expenses),
    [invoices, purchases, expenses]
  );

  // Search filtering
  const q = searchQuery.toLowerCase().trim();
  const filteredB2b = useMemo(() => {
    if (!q) return b2bInvoices;
    return b2bInvoices.filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        (i.partyName && i.partyName.toLowerCase().includes(q)) ||
        (i.partyGstin && i.partyGstin.toLowerCase().includes(q))
    );
  }, [b2bInvoices, q]);

  const filteredB2cs = useMemo(() => {
    if (!q) return b2csInvoices;
    return b2csInvoices.filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        (i.partyName && i.partyName.toLowerCase().includes(q))
    );
  }, [b2csInvoices, q]);

  const filteredCdnr = useMemo(() => {
    if (!q) return cdnrInvoices;
    return cdnrInvoices.filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        (i.partyName && i.partyName.toLowerCase().includes(q)) ||
        (i.originalInvoiceNumber && i.originalInvoiceNumber.toLowerCase().includes(q))
    );
  }, [cdnrInvoices, q]);

  const filteredHsn = useMemo(() => {
    if (!q) return hsnSummaryList;
    return hsnSummaryList.filter(
      (h) => h.hsnCode.toLowerCase().includes(q) || h.description.toLowerCase().includes(q)
    );
  }, [hsnSummaryList, q]);

  // Export handlers
  const handleExportCsv = () => {
    if (subReport === 'gstr3b') {
      const headers = ['Table Ref', 'Nature of Supply / Section', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Cess (INR)', 'Total Tax (INR)'];
      const rows = [
        ['3.1(a)', 'Outward Taxable Supplies (Net of CN/DN)', gstr3b.outwardTaxable, gstr3b.outwardCgst, gstr3b.outwardSgst, gstr3b.outwardIgst, gstr3b.outwardCess, gstr3b.totalOutwardTax],
        ['4(A)', 'Eligible ITC (Purchases & Expenses)', '-', gstr3b.itcCgst, gstr3b.itcSgst, gstr3b.itcIgst, gstr3b.itcCess, gstr3b.totalItc],
        ['4(D)(1)', 'Ineligible ITC - Section 17(5) Blocked', '-', '-', '-', '-', '-', gstr3b.ineligibleItc175],
        ['4(D)(2)', 'Ineligible ITC - Others', '-', '-', '-', '-', '-', gstr3b.ineligibleItcOthers],
        ['6.1', 'Net Cash Tax Payable (After ITC Offset)', '-', gstr3b.netCgstPayable, gstr3b.netSgstPayable, gstr3b.netIgstPayable, gstr3b.netCessPayable, gstr3b.netCashPayable],
      ];
      exportReportToCsv(`GSTR3B_Tax_Offset_${Date.now()}`, headers, rows);
    } else if (subReport === 'hsn') {
      const headers = ['HSN/SAC Code', 'Description', 'Unit', 'Total Quantity', 'Total Value (INR)', 'Taxable Value (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Cess (INR)'];
      const rows = filteredHsn.map((h) => [
        h.hsnCode,
        h.description,
        h.unit,
        h.totalQty,
        h.totalValue,
        h.taxableValue,
        h.cgst,
        h.sgst,
        h.igst,
        h.cess,
      ]);
      const totalTaxable = filteredHsn.reduce((s, h) => s + h.taxableValue, 0);
      const totalVal = filteredHsn.reduce((s, h) => s + h.totalValue, 0);
      const totalCgst = filteredHsn.reduce((s, h) => s + h.cgst, 0);
      const totalSgst = filteredHsn.reduce((s, h) => s + h.sgst, 0);
      const totalIgst = filteredHsn.reduce((s, h) => s + h.igst, 0);
      const totalCess = filteredHsn.reduce((s, h) => s + h.cess, 0);
      exportReportToCsv(`HSN_Summary_Report_${Date.now()}`, headers, rows, ['TOTAL', '', '', '', totalVal, totalTaxable, totalCgst, totalSgst, totalIgst, totalCess]);
    } else {
      // GSTR-1
      const activeList = selectedGstr1Table === '4_b2b' ? filteredB2b : selectedGstr1Table === '7_b2cs' ? filteredB2cs : filteredCdnr;
      const headers = ['Invoice No', 'Date', 'Party Name', 'Party GSTIN', 'POS', 'Taxable Amount (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Cess (INR)', 'Grand Total (INR)'];
      const rows = activeList.map((i) => [
        i.invoiceNumber,
        i.date,
        i.partyName || 'Cash Customer',
        i.partyGstin || '-',
        i.placeOfSupplyStateCode || '-',
        i.totalTaxableAmount,
        i.totalCgst,
        i.totalSgst || i.totalUtgst,
        i.totalIgst,
        i.totalCess || 0,
        i.grandTotal,
      ]);
      const totalTaxable = activeList.reduce((s, i) => s + i.totalTaxableAmount, 0);
      const totalGrand = activeList.reduce((s, i) => s + i.grandTotal, 0);
      exportReportToCsv(`GSTR1_${selectedGstr1Table}_${Date.now()}`, headers, rows, ['TOTAL', '', '', '', '', totalTaxable, '', '', '', '', totalGrand]);
    }
  };

  const handleExportPdf = () => {
    if (subReport === 'gstr3b') {
      const config: ReportPdfConfig = {
        title: 'GSTR-3B Tax Computation & ITC Reconciliation',
        subtitle: 'Monthly Tax Offset & Cash Payable',
        company,
        dateRangeLabel,
        orientation: 'landscape',
        kpis: [
          { label: 'Outward Tax', value: formatINR(gstr3b.totalOutwardTax) },
          { label: 'Eligible ITC', value: formatINR(gstr3b.totalItc) },
          { label: 'Net Cash Tax Payable', value: formatINR(gstr3b.netCashPayable) },
        ],
        headers: ['Table', 'Supply Nature / Section', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Cess (INR)', 'Total Tax (INR)'],
        rows: [
          ['3.1(a)', 'Outward Taxable Supplies (Net of CN/DN)', gstr3b.outwardTaxable, gstr3b.outwardCgst, gstr3b.outwardSgst, gstr3b.outwardIgst, gstr3b.outwardCess, gstr3b.totalOutwardTax],
          ['4(A)', 'Eligible ITC Available (Purchases & Expenses)', '-', gstr3b.itcCgst, gstr3b.itcSgst, gstr3b.itcIgst, gstr3b.itcCess, gstr3b.totalItc],
          ['4(D)(1)', 'Ineligible ITC - Section 17(5) Blocked', '-', '-', '-', '-', '-', gstr3b.ineligibleItc175],
          ['4(D)(2)', 'Ineligible ITC - Others', '-', '-', '-', '-', '-', gstr3b.ineligibleItcOthers],
        ],
        summaryRow: ['6.1', 'NET CASH TAX PAYABLE', '-', gstr3b.netCgstPayable, gstr3b.netSgstPayable, gstr3b.netIgstPayable, gstr3b.netCessPayable, gstr3b.netCashPayable],
      };
      printReportDocument(config);
    } else if (subReport === 'hsn') {
      const config: ReportPdfConfig = {
        title: 'HSN / SAC Summary of Outward Supplies (Table 12)',
        company,
        dateRangeLabel,
        orientation: 'landscape',
        headers: ['HSN Code', 'Description', 'Unit', 'Qty', 'Total Value (₹)', 'Taxable (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Cess (₹)'],
        rows: filteredHsn.map((h) => [
          h.hsnCode,
          h.description,
          h.unit,
          h.totalQty,
          h.totalValue,
          h.taxableValue,
          h.cgst,
          h.sgst,
          h.igst,
          h.cess,
        ]),
        summaryRow: [
          'TOTAL',
          '',
          '',
          '',
          filteredHsn.reduce((s, h) => s + h.totalValue, 0),
          filteredHsn.reduce((s, h) => s + h.taxableValue, 0),
          filteredHsn.reduce((s, h) => s + h.cgst, 0),
          filteredHsn.reduce((s, h) => s + h.sgst, 0),
          filteredHsn.reduce((s, h) => s + h.igst, 0),
          filteredHsn.reduce((s, h) => s + h.cess, 0),
        ],
      };
      printReportDocument(config);
    } else {
      const activeList = selectedGstr1Table === '4_b2b' ? filteredB2b : selectedGstr1Table === '7_b2cs' ? filteredB2cs : filteredCdnr;
      const config: ReportPdfConfig = {
        title: `GSTR-1 Outward Supplies - Table ${selectedGstr1Table.replace('_', ' ').toUpperCase()}`,
        company,
        dateRangeLabel,
        orientation: 'landscape',
        headers: ['Invoice #', 'Date', 'Party Name', 'Party GSTIN', 'POS', 'Taxable (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Cess (₹)', 'Grand Total (₹)'],
        rows: activeList.map((i) => [
          i.invoiceNumber,
          formatDate(i.date),
          i.partyName || 'Cash Buyer',
          i.partyGstin || '-',
          i.placeOfSupplyStateCode || '-',
          i.totalTaxableAmount,
          i.totalCgst,
          i.totalSgst || i.totalUtgst,
          i.totalIgst,
          i.totalCess || 0,
          i.grandTotal,
        ]),
        summaryRow: [
          'TOTAL',
          '',
          '',
          '',
          '',
          activeList.reduce((s, i) => s + i.totalTaxableAmount, 0),
          activeList.reduce((s, i) => s + i.totalCgst, 0),
          activeList.reduce((s, i) => s + (i.totalSgst || i.totalUtgst || 0), 0),
          activeList.reduce((s, i) => s + i.totalIgst, 0),
          activeList.reduce((s, i) => s + (i.totalCess || 0), 0),
          activeList.reduce((s, i) => s + i.grandTotal, 0),
        ],
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
  }, [subReport, selectedGstr1Table, filteredB2b, filteredB2cs, filteredCdnr, filteredHsn, gstr3b]);

  const handleDownloadPortalJson = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const period = `${mm}${yyyy}`;
    downloadGstr1JsonFile(company, invoices, period);
  };

  return (
    <div className="space-y-6">
      {/* GSTR-1 View */}
      {subReport === 'gstr1' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-outline-variant/30">
            {/* Table Selection Pills */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setSelectedGstr1Table('4_b2b')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[36px] ${
                  selectedGstr1Table === '4_b2b'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                }`}
              >
                Table 4: B2B ({b2bInvoices.length})
              </button>
              <button
                onClick={() => setSelectedGstr1Table('7_b2cs')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[36px] ${
                  selectedGstr1Table === '7_b2cs'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                }`}
              >
                Table 7: B2CS ({b2csInvoices.length})
              </button>
              <button
                onClick={() => setSelectedGstr1Table('9b_cdnr')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[36px] ${
                  selectedGstr1Table === '9b_cdnr'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                }`}
              >
                Table 9B: CDNR ({cdnrInvoices.length})
              </button>
            </div>

            {/* Portal JSON Download */}
            <button
              onClick={handleDownloadPortalJson}
              aria-label="Download government compliant GSTR-1 JSON"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg transition-colors min-h-[36px] shrink-0"
            >
              <Download size={14} />
              <span>Download Portal JSON</span>
            </button>
          </div>

          {/* Table display */}
          <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
                  <tr>
                    <th className="p-3">Doc #</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">GSTIN</th>
                    <th className="p-3">POS</th>
                    <th className="p-3 text-right">Taxable (₹)</th>
                    <th className="p-3 text-right">CGST (₹)</th>
                    <th className="p-3 text-right">SGST (₹)</th>
                    <th className="p-3 text-right">IGST (₹)</th>
                    <th className="p-3 text-right">Cess (₹)</th>
                    <th className="p-3 text-right">Grand Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {(() => {
                    const list = selectedGstr1Table === '4_b2b' ? filteredB2b : selectedGstr1Table === '7_b2cs' ? filteredB2cs : filteredCdnr;
                    if (list.length === 0) {
                      return (
                        <tr>
                          <td colSpan={11} className="p-8 text-center text-on-surface-variant">
                            No records found in Table {selectedGstr1Table.replace('_', ' ').toUpperCase()} for this period.
                          </td>
                        </tr>
                      );
                    }
                    return list.map((inv) => (
                      <tr key={inv.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-3 font-semibold text-primary">{inv.invoiceNumber}</td>
                        <td className="p-3 text-on-surface-variant">{formatDate(inv.date)}</td>
                        <td className="p-3 font-medium text-on-surface">{inv.partyName || 'Cash Buyer'}</td>
                        <td className="p-3 font-mono text-[11px] text-on-surface-variant">{inv.partyGstin || '-'}</td>
                        <td className="p-3 text-on-surface-variant">{inv.placeOfSupplyStateCode || '-'}</td>
                        <td className="p-3 text-right font-medium">{formatINR(inv.totalTaxableAmount)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(inv.totalCgst)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(inv.totalSgst || inv.totalUtgst || 0)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(inv.totalIgst)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(inv.totalCess || 0)}</td>
                        <td className="p-3 text-right font-bold text-on-surface">{formatINR(inv.grandTotal)}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* GSTR-3B Tax Offset */}
      {subReport === 'gstr3b' && (
        <div className="space-y-6">
          {/* Output Liability Table */}
          <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
            <div className="p-3 bg-surface-container-high border-b border-outline-variant/50 font-bold text-xs flex justify-between items-center">
              <span>Table 3.1: Details of Outward Supplies & Liabilities</span>
              <span className="text-primary">Output Tax: {formatINR(gstr3b.totalOutwardTax)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-container text-on-surface-variant font-medium">
                  <tr>
                    <th className="p-2.5">Nature of Supply</th>
                    <th className="p-2.5 text-right">Taxable Turnover (₹)</th>
                    <th className="p-2.5 text-right">CGST (₹)</th>
                    <th className="p-2.5 text-right">SGST (₹)</th>
                    <th className="p-2.5 text-right">IGST (₹)</th>
                    <th className="p-2.5 text-right">Cess (₹)</th>
                    <th className="p-2.5 text-right">Total Tax (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-surface-container-lowest">
                    <td className="p-3 font-medium text-on-surface">(a) Outward Taxable Supplies (Net)</td>
                    <td className="p-3 text-right font-bold">{formatINR(gstr3b.outwardTaxable)}</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.outwardCgst)}</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.outwardSgst)}</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.outwardIgst)}</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.outwardCess)}</td>
                    <td className="p-3 text-right font-bold text-primary">{formatINR(gstr3b.totalOutwardTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ITC Reconciliation Table */}
          <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
            <div className="p-3 bg-surface-container-high border-b border-outline-variant/50 font-bold text-xs flex justify-between items-center">
              <span>Table 4: Eligible Input Tax Credit (ITC) Available</span>
              <span className="text-emerald-700 dark:text-emerald-400">Total Available ITC: {formatINR(gstr3b.totalItc)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-container text-on-surface-variant font-medium">
                  <tr>
                    <th className="p-2.5">Details / Section</th>
                    <th className="p-2.5 text-right">CGST (₹)</th>
                    <th className="p-2.5 text-right">SGST (₹)</th>
                    <th className="p-2.5 text-right">IGST (₹)</th>
                    <th className="p-2.5 text-right">Cess (₹)</th>
                    <th className="p-2.5 text-right">Total ITC (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  <tr className="hover:bg-surface-container-lowest">
                    <td className="p-3 font-medium text-on-surface">(A) ITC Available (Inward Supplies & Expenses)</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.itcCgst)}</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.itcSgst)}</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.itcIgst)}</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.itcCess)}</td>
                    <td className="p-3 text-right font-bold text-emerald-700 dark:text-emerald-400">{formatINR(gstr3b.totalItc)}</td>
                  </tr>
                  <tr className="hover:bg-surface-container-lowest text-rose-700 dark:text-rose-400">
                    <td className="p-3 font-medium">(D)(1) Ineligible ITC - As per Section 17(5) Blocked</td>
                    <td colSpan={4} className="p-3 text-right text-on-surface-variant">Blocked Motor Vehicles, Food & Beverages, etc.</td>
                    <td className="p-3 text-right font-semibold">{formatINR(gstr3b.ineligibleItc175)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Payment of Tax (Table 6.1) */}
          <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
            <div className="p-3 bg-surface-container-high border-b border-outline-variant/50 font-bold text-xs flex justify-between items-center">
              <span>Table 6.1: Payment of Tax (Net Cash Tax Liability)</span>
              <span className="text-rose-700 dark:text-rose-400 font-extrabold">Net Cash Payable: {formatINR(gstr3b.netCashPayable)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-container text-on-surface-variant font-medium">
                  <tr>
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5 text-right">Tax Payable (₹)</th>
                    <th className="p-2.5 text-right">Paid Through ITC (₹)</th>
                    <th className="p-2.5 text-right font-bold">Net Cash Payable (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  <tr>
                    <td className="p-3 font-medium">Central Tax (CGST)</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.outwardCgst)}</td>
                    <td className="p-3 text-right text-emerald-700">{formatINR(Math.min(gstr3b.outwardCgst, gstr3b.itcCgst))}</td>
                    <td className="p-3 text-right font-bold">{formatINR(gstr3b.netCgstPayable)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">State / UT Tax (SGST / UTGST)</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.outwardSgst)}</td>
                    <td className="p-3 text-right text-emerald-700">{formatINR(Math.min(gstr3b.outwardSgst, gstr3b.itcSgst))}</td>
                    <td className="p-3 text-right font-bold">{formatINR(gstr3b.netSgstPayable)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Integrated Tax (IGST)</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.outwardIgst)}</td>
                    <td className="p-3 text-right text-emerald-700">{formatINR(Math.min(gstr3b.outwardIgst, gstr3b.itcIgst))}</td>
                    <td className="p-3 text-right font-bold">{formatINR(gstr3b.netIgstPayable)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Compensation Cess</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.outwardCess)}</td>
                    <td className="p-3 text-right text-emerald-700">{formatINR(Math.min(gstr3b.outwardCess, gstr3b.itcCess))}</td>
                    <td className="p-3 text-right font-bold">{formatINR(gstr3b.netCessPayable)}</td>
                  </tr>
                  <tr className="bg-surface-container-high font-bold text-on-surface">
                    <td className="p-3">TOTAL CASH TAX PAYABLE</td>
                    <td className="p-3 text-right">{formatINR(gstr3b.totalOutwardTax)}</td>
                    <td className="p-3 text-right text-emerald-700">
                      {formatINR(
                        Math.round(
                          (Math.min(gstr3b.outwardCgst, gstr3b.itcCgst) +
                            Math.min(gstr3b.outwardSgst, gstr3b.itcSgst) +
                            Math.min(gstr3b.outwardIgst, gstr3b.itcIgst) +
                            Math.min(gstr3b.outwardCess, gstr3b.itcCess)) *
                            100
                        ) / 100
                      )}
                    </td>
                    <td className="p-3 text-right text-rose-700 dark:text-rose-400 text-sm">{formatINR(gstr3b.netCashPayable)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* HSN / SAC Summary View */}
      {subReport === 'hsn' && (
        <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
                <tr>
                  <th className="p-3">HSN/SAC Code</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">UQC</th>
                  <th className="p-3 text-right">Total Qty</th>
                  <th className="p-3 text-right">Total Value (₹)</th>
                  <th className="p-3 text-right">Taxable (₹)</th>
                  <th className="p-3 text-right">CGST (₹)</th>
                  <th className="p-3 text-right">SGST (₹)</th>
                  <th className="p-3 text-right">IGST (₹)</th>
                  <th className="p-3 text-right">Cess (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredHsn.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-on-surface-variant">
                      No HSN items recorded in this period.
                    </td>
                  </tr>
                ) : (
                  filteredHsn.map((h, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-3 font-mono font-semibold text-primary">{h.hsnCode}</td>
                      <td className="p-3 font-medium text-on-surface">{h.description}</td>
                      <td className="p-3 text-on-surface-variant">{h.unit}</td>
                      <td className="p-3 text-right font-medium">{h.totalQty}</td>
                      <td className="p-3 text-right">{formatINR(h.totalValue)}</td>
                      <td className="p-3 text-right font-semibold">{formatINR(h.taxableValue)}</td>
                      <td className="p-3 text-right text-on-surface-variant">{formatINR(h.cgst)}</td>
                      <td className="p-3 text-right text-on-surface-variant">{formatINR(h.sgst)}</td>
                      <td className="p-3 text-right text-on-surface-variant">{formatINR(h.igst)}</td>
                      <td className="p-3 text-right text-on-surface-variant">{formatINR(h.cess)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredHsn.length > 0 && (
                <tfoot className="bg-surface-container-high font-bold border-t border-outline-variant/50">
                  <tr>
                    <td className="p-3" colSpan={3}>TOTAL</td>
                    <td className="p-3 text-right">{filteredHsn.reduce((s, h) => s + h.totalQty, 0)}</td>
                    <td className="p-3 text-right">{formatINR(filteredHsn.reduce((s, h) => s + h.totalValue, 0))}</td>
                    <td className="p-3 text-right text-primary">{formatINR(filteredHsn.reduce((s, h) => s + h.taxableValue, 0))}</td>
                    <td className="p-3 text-right">{formatINR(filteredHsn.reduce((s, h) => s + h.cgst, 0))}</td>
                    <td className="p-3 text-right">{formatINR(filteredHsn.reduce((s, h) => s + h.sgst, 0))}</td>
                    <td className="p-3 text-right">{formatINR(filteredHsn.reduce((s, h) => s + h.igst, 0))}</td>
                    <td className="p-3 text-right">{formatINR(filteredHsn.reduce((s, h) => s + h.cess, 0))}</td>
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
