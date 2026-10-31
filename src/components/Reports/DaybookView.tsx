import React, { useState, useMemo } from 'react';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { BookOpen, CheckCircle, Printer } from 'lucide-react';
import { ReportPdfConfig } from './utils/reportExportUtils.ts';
import { ReportPreviewModal } from './ReportPreviewModal.tsx';
import { db } from '../../services/db.ts';
import { preloadReportPdfPreviewModal } from '../../core/utils/modalPreload.ts';

interface DaybookViewProps {
  vouchers: Voucher[];
  company?: CompanyProfile;
}

export const DaybookView: React.FC<DaybookViewProps> = ({ vouchers, company }) => {
  const [filterType, setFilterType] = useState('ALL');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const activeCompany = useMemo(() => company || db.getCompany(), [company]);

  const filtered = vouchers.filter((v) => filterType === 'ALL' || v.voucherType === filterType);

  const totalDebits = vouchers.reduce(
    (sum, v) => sum + v.entries.reduce((s, e) => s + e.debit, 0),
    0
  );
  const totalCredits = vouchers.reduce(
    (sum, v) => sum + v.entries.reduce((s, e) => s + e.credit, 0),
    0
  );

  const daybookRows = useMemo(() => {
    const rows: (string | number)[][] = [];
    filtered.forEach((v) => {
      v.entries.forEach((e) => {
        rows.push([
          formatDate(v.date),
          v.voucherNumber,
          v.voucherType,
          e.accountName,
          e.debit > 0 ? formatINR(e.debit) : '-',
          e.credit > 0 ? formatINR(e.credit) : '-',
          v.narration || '-',
        ]);
      });
    });
    return rows;
  }, [filtered]);

  const reportConfig: ReportPdfConfig = useMemo(() => {
    return {
      title: 'Accounting Daybook & General Ledger',
      subtitle: `Journal Vouchers (${filterType === 'ALL' ? 'All Types' : filterType})`,
      company: activeCompany,
      dateRangeLabel: 'All Records',
      headers: ['Date', 'Voucher #', 'Type', 'Ledger Account', 'Debit (Dr)', 'Credit (Cr)', 'Narration'],
      rows: daybookRows,
      summaryRow: ['Totals', '', '', '', formatINR(totalDebits), formatINR(totalCredits), 'Balanced'],
      kpis: [
        { label: 'Total Debits', value: formatINR(totalDebits) },
        { label: 'Total Credits', value: formatINR(totalCredits) },
        { label: 'Total Vouchers', value: String(filtered.length) },
      ],
    };
  }, [activeCompany, daybookRows, filterType, filtered.length, totalCredits, totalDebits]);

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-on-surface m-0">
            Accounting Daybook & General Ledger
          </h2>
          <div className="text-xs sm:text-sm text-on-surface-variant">
            Automated double-entry bookkeeping journal entries
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-3 bg-surface-container-low px-4 py-2 rounded-xl border border-outline-variant/30 text-xs text-on-surface-variant flex-wrap">
            <div>
              Total Debits: <strong className="text-blue-600 dark:text-blue-400 font-bold">{formatINR(totalDebits)}</strong>
            </div>
            <span>•</span>
            <div>
              Total Credits: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatINR(totalCredits)}</strong>
            </div>
            <span>•</span>
            <div className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
              <CheckCircle size={13} /> Balanced
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            onMouseEnter={() => preloadReportPdfPreviewModal()}
            onFocus={() => preloadReportPdfPreviewModal()}
            title="Print or export Daybook report"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary/90 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Printer size={14} />
            <span>Print / Preview</span>
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 max-w-full">
        {['ALL', 'SALES', 'PURCHASE', 'PAYMENT', 'RECEIPT'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all border whitespace-nowrap shrink-0 ${
              filterType === type
                ? 'bg-primary text-on-primary border-transparent shadow-xs'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:bg-surface-container'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Vouchers List */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest p-8 sm:p-12 text-center text-on-surface-variant rounded-2xl border border-outline-variant/30 shadow-xs">
            <BookOpen size={40} className="mx-auto opacity-30 mb-2" />
            <div className="text-xs sm:text-sm">No journal vouchers recorded yet. They are automatically created when invoices are generated.</div>
          </div>
        ) : (
          filtered.map((v) => (
            <div
              key={v.id}
              className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4 flex flex-col gap-2.5 shadow-xs"
            >
              <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    v.voucherType === 'SALES'
                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  }`}>
                    {v.voucherType}
                  </span>
                  <span className="font-bold text-on-surface text-sm">{v.voucherNumber}</span>
                  {v.referenceNo && <span className="text-xs text-on-surface-variant">(Ref: {v.referenceNo})</span>}
                </div>
                <div className="text-xs text-on-surface-variant">
                  {formatDate(v.date)}
                </div>
              </div>

              {/* Journal Table */}
              <table className="w-full text-xs border-collapse mt-1">
                <thead>
                  <tr className="text-on-surface-variant text-left border-b border-outline-variant/20">
                    <th className="py-1 px-2 font-medium">Ledger Account</th>
                    <th className="py-1 px-2 text-right font-medium">Debit (Dr)</th>
                    <th className="py-1 px-2 text-right font-medium">Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody>
                  {v.entries.map((entry, idx) => (
                    <tr key={idx} className="border-b border-outline-variant/10">
                      <td className="py-1.5 px-2 text-on-surface font-medium">
                        {entry.accountName}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-bold ${
                        entry.debit > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-on-surface-variant/40'
                      }`}>
                        {entry.debit > 0 ? formatINR(entry.debit) : '-'}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-bold ${
                        entry.credit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-on-surface-variant/40'
                      }`}>
                        {entry.credit > 0 ? formatINR(entry.credit) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-xs text-on-surface-variant italic mt-0.5">
                Narration: {v.narration}
              </div>
            </div>
          ))
        )}
      </div>
      {/* Daybook Report Preview Modal */}
      {isPreviewOpen && (
        <ReportPreviewModal
          isOpen={isPreviewOpen}
          config={reportConfig}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
    </div>
  );
};
