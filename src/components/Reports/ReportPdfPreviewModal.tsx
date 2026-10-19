import React, { useEffect, useCallback } from 'react';
import { ArrowLeft, Printer, X } from 'lucide-react';
import { ReportPdfConfig, printReportDocumentDirect } from './utils/reportExportUtils.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export interface ReportPdfPreviewModalProps {
  isOpen: boolean;
  config: ReportPdfConfig | null;
  onClose: () => void;
}

export const ReportPdfPreviewModal: React.FC<ReportPdfPreviewModalProps> = ({
  isOpen,
  config,
  onClose,
}) => {
  // Priority 30: Closes preview modal before report tab navigation or app exit
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 30);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePrint = useCallback(() => {
    if (!config) return;
    // Trigger native print dialog cleanly
    if (typeof window !== 'undefined' && window.print) {
      window.print();
    } else {
      printReportDocumentDirect(config);
    }
  }, [config]);

  if (!isOpen || !config) return null;

  const { company, orientation = 'portrait', kpis = [], headers = [], rows = [], summaryRow = [] } = config;
  const isLandscape = orientation === 'landscape' || headers.length > 7;

  return (
    <div
      data-testid="report-pdf-preview-modal"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-start p-1.5 sm:p-4 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Report PDF Preview"
    >
      {/* Scoped Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #report-pdf-print-root, #report-pdf-print-root * {
            visibility: visible !important;
          }
          #report-pdf-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print-preview-bar {
            display: none !important;
          }
          @page {
            size: A4 ${isLandscape ? 'landscape' : 'portrait'};
            margin: 8mm 10mm;
          }
        }
      `}</style>

      {/* Main Preview Container */}
      <div className="w-full max-w-5xl my-auto flex flex-col bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/40 overflow-hidden">
        {/* Sticky Top Toolbar with Prominent Back Button */}
        <header className="no-print-preview-bar sticky top-0 z-10 bg-surface-container-lowest/95 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3 border-b border-outline-variant/30 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              data-testid="report-preview-back-button"
              aria-label="Back to Report"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer border border-outline-variant/40 shrink-0 shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4 text-primary" />
              <span>Back</span>
            </button>

            <div className="min-w-0 flex items-center gap-2">
              <h2 className="font-bold text-xs sm:text-base text-on-surface truncate">
                {config.title}
              </h2>
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
                {config.dateRangeLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              data-testid="report-preview-print-button"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden xs:inline">Print / Save PDF</span>
              <span className="xs:hidden">Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable A4 Document View Sheet */}
        <div className="p-3 sm:p-8 overflow-y-auto max-h-[82vh] bg-surface-container-low/50">
          <div
            id="report-pdf-print-root"
            className="max-w-4xl mx-auto bg-white text-slate-900 rounded-xl shadow-md border border-slate-200/80 p-4 sm:p-8 font-sans text-xs leading-relaxed"
          >
            {/* Report Header */}
            <div className="border-b-2 border-slate-900 pb-3 mb-4 flex flex-col sm:flex-row justify-between items-start gap-2">
              <div>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  {company.tradeName || company.businessName || 'Business Report'}
                </h1>
                <div className="text-[11px] text-slate-600 space-y-0.5 mt-1">
                  {company.gstin && (
                    <div>
                      <strong className="text-slate-800">GSTIN:</strong> {company.gstin}
                    </div>
                  )}
                  {company.address && <div>{company.address}</div>}
                  {company.phone && (
                    <div>
                      <strong className="text-slate-800">Phone:</strong> {company.phone}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-left sm:text-right">
                <h2 className="text-base font-bold text-blue-900">{config.title}</h2>
                {config.subtitle && (
                  <div className="text-slate-500 text-[11px]">{config.subtitle}</div>
                )}
                <div className="mt-1">
                  <span className="inline-block bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-[10px] font-bold border border-sky-200">
                    {config.dateRangeLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* KPIs Banner (if present) */}
            {kpis.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {kpis.map((kpi, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-2.5"
                  >
                    <span className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                      {kpi.label}
                    </span>
                    <span className="block text-sm font-black text-slate-900 mt-0.5 font-tabular-data">
                      {kpi.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-bold border border-slate-300">
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        className="border border-slate-300 px-2.5 py-1.5 text-left font-bold whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={rIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="border border-slate-200 px-2.5 py-1.5 text-slate-700 whitespace-nowrap"
                        >
                          {cell !== null && cell !== undefined ? String(cell) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {summaryRow.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-200/90 font-bold border-t-2 border-slate-600 border-b-2 border-slate-900">
                      {summaryRow.map((cell, idx) => (
                        <td
                          key={idx}
                          className="border border-slate-300 px-2.5 py-2 text-slate-900 whitespace-nowrap"
                        >
                          {cell !== null && cell !== undefined ? String(cell) : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Report Footer */}
            <div className="mt-6 pt-2 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-[9.5px] text-slate-400 gap-1">
              <span>Generated automatically by Vyapar Books PRO Reporting Engine</span>
              <span>
                Generated: {new Date().toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
