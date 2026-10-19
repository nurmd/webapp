import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Printer, X, LayoutGrid, FileText, ZoomIn, ZoomOut } from 'lucide-react';
import { ReportPdfConfig, printReportDocumentDirect } from './utils/reportExportUtils.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export interface ReportPdfPreviewModalProps {
  isOpen: boolean;
  config: ReportPdfConfig | null;
  onClose: () => void;
}

export type ReportPreviewViewMode = 'CARDS' | 'A4';

export const ReportPdfPreviewModal: React.FC<ReportPdfPreviewModalProps> = ({
  isOpen,
  config,
  onClose,
}) => {
  // Mobile defaults to CARDS view, larger screens default to A4 Sheet
  const [viewMode, setViewMode] = useState<ReportPreviewViewMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      return 'CARDS';
    }
    return 'A4';
  });

  const [zoomFit, setZoomFit] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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

  // Identify index of primary amount/total column for prominent card display
  const primaryMetricColIndex = useMemo(() => {
    if (!config?.headers) return -1;
    // Look backwards from last column for Total, Amount, Net, Taxable
    for (let i = config.headers.length - 1; i >= 0; i--) {
      const h = config.headers[i].toLowerCase();
      if (h.includes('total') || h.includes('amount') || h.includes('net') || h.includes('balance') || h.includes('profit')) {
        return i;
      }
    }
    return config.headers.length - 1;
  }, [config?.headers]);

  // Filter rows if user types in search box
  const filteredRows = useMemo(() => {
    if (!config?.rows) return [];
    if (!searchTerm.trim()) return config.rows;
    const term = searchTerm.toLowerCase();
    return config.rows.filter((row) =>
      row.some((cell) => cell !== null && cell !== undefined && String(cell).toLowerCase().includes(term))
    );
  }, [config?.rows, searchTerm]);

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
            display: block !important;
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
        {/* Sticky Top Toolbar with Prominent Back Button & Responsive Mode Switcher */}
        <header className="no-print-preview-bar sticky top-0 z-10 bg-surface-container-lowest/95 backdrop-blur-md px-2.5 sm:px-6 py-2 sm:py-3 border-b border-outline-variant/30 flex flex-wrap items-center justify-between gap-2">
          {/* Left: Back button & Title */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              data-testid="report-preview-back-button"
              aria-label="Back to Report"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer border border-outline-variant/40 shrink-0 shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4 text-primary" />
              <span>Back</span>
            </button>

            <div className="min-w-0 flex items-center gap-1.5 sm:gap-2">
              <h2 className="font-bold text-xs sm:text-base text-on-surface truncate">
                {config.title}
              </h2>
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
                {config.dateRangeLabel}
              </span>
            </div>
          </div>

          {/* Center / Right: Mode Switcher & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            {/* View Mode Toggle: Cards (Mobile) vs A4 Sheet */}
            <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setViewMode('CARDS')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer ${
                  viewMode === 'CARDS'
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Mobile Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('A4')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer ${
                  viewMode === 'A4'
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Official A4 Document Table"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>A4 Sheet</span>
              </button>
            </div>

            {/* A4 Sheet Zoom Fit Toggle (only in A4 mode on mobile/tablet) */}
            {viewMode === 'A4' && (
              <button
                type="button"
                onClick={() => setZoomFit((prev) => !prev)}
                className="hidden xs:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/30 cursor-pointer transition-all"
                title={zoomFit ? 'View at 100% Zoom' : 'Fit to Screen Width'}
              >
                {zoomFit ? <ZoomIn className="w-3.5 h-3.5 text-primary" /> : <ZoomOut className="w-3.5 h-3.5 text-primary" />}
                <span>{zoomFit ? '100%' : 'Fit'}</span>
              </button>
            )}

            {/* Print / Save PDF Button */}
            <button
              type="button"
              onClick={handlePrint}
              data-testid="report-preview-print-button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-xs sm:text-sm active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden xs:inline">Print / Save PDF</span>
              <span className="xs:hidden">Print</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable Content Body */}
        <div className="p-2 sm:p-6 overflow-y-auto max-h-[84vh] bg-surface-container-low/50">
          {/* MODE 1: Touch-friendly Mobile Cards View */}
          {viewMode === 'CARDS' && (
            <div className="w-full max-w-xl mx-auto space-y-3 print:hidden">
              {/* Report Header Card */}
              <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/30 shadow-xs">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-black text-sm text-on-surface tracking-tight">
                      {company.tradeName || company.businessName || 'Business Report'}
                    </h3>
                    <div className="text-[11px] text-on-surface-variant mt-0.5 space-y-0.5">
                      {company.gstin && <div><span className="font-semibold">GSTIN:</span> {company.gstin}</div>}
                      {company.phone && <div><span className="font-semibold">Phone:</span> {company.phone}</div>}
                      {company.address && <div className="line-clamp-1">{company.address}</div>}
                    </div>
                  </div>
                  <span className="inline-block bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-primary/20 shrink-0">
                    {config.dateRangeLabel}
                  </span>
                </div>
                {config.subtitle && (
                  <p className="text-[11px] text-on-surface-variant mt-1.5 italic border-t border-outline-variant/20 pt-1">
                    {config.subtitle}
                  </p>
                )}
              </div>

              {/* KPIs Summary Cards */}
              {kpis.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {kpis.map((kpi, idx) => (
                    <div key={idx} className="bg-surface-container-lowest p-2.5 rounded-xl border border-outline-variant/30 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block">
                        {kpi.label}
                      </span>
                      <span className="text-sm font-black text-on-surface mt-0.5 block font-tabular-data">
                        {kpi.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Search on Mobile (if > 4 rows) */}
              {config.rows.length > 4 && (
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                    placeholder={`Search across ${config.rows.length} records...`}
                    className="w-full bg-surface-container-lowest text-xs text-on-surface placeholder:text-on-surface-variant/60 px-3 py-2 rounded-xl border border-outline-variant/30 focus:outline-hidden focus:border-primary shadow-2xs"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Record Cards */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-on-surface-variant px-1 flex justify-between items-center">
                  <span>Records ({filteredRows.length})</span>
                  <span className="text-[10px] text-on-surface-variant/70">Tap Print for full A4 table</span>
                </div>

                {filteredRows.length === 0 ? (
                  <div className="text-center py-8 bg-surface-container-lowest rounded-xl border border-outline-variant/30 text-on-surface-variant text-xs">
                    No matching records found.
                  </div>
                ) : (
                  filteredRows.map((row, rIdx) => {
                    const primaryValue = primaryMetricColIndex >= 0 ? row[primaryMetricColIndex] : null;
                    const primaryHeader = primaryMetricColIndex >= 0 ? headers[primaryMetricColIndex] : '';

                    return (
                      <div
                        key={rIdx}
                        className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 shadow-2xs space-y-2 hover:border-primary/40 transition-colors"
                      >
                        {/* Card Header: 1st column & Primary Highlight Metric */}
                        <div className="flex items-start justify-between gap-2 border-b border-outline-variant/20 pb-2">
                          <div className="min-w-0">
                            <div className="font-black text-xs text-on-surface truncate">
                              {row[0] !== null && row[0] !== undefined ? String(row[0]) : '-'}
                            </div>
                            {row[1] !== null && row[1] !== undefined && (
                              <div className="text-[11px] font-semibold text-primary truncate mt-0.5">
                                {String(row[1])}
                              </div>
                            )}
                          </div>
                          {primaryValue !== null && primaryValue !== undefined && (
                            <div className="text-right shrink-0">
                              <span className="text-[9.5px] uppercase font-bold text-on-surface-variant block">
                                {primaryHeader}
                              </span>
                              <span className="text-xs font-black text-on-surface font-tabular-data">
                                {String(primaryValue)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Card Details: 2-column key-value grid for all other non-empty columns */}
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs pt-0.5">
                          {headers.map((h, cIdx) => {
                            if (cIdx === 0 || cIdx === 1 || cIdx === primaryMetricColIndex) return null;
                            const cell = row[cIdx];
                            if (cell === null || cell === undefined || cell === '') return null;
                            return (
                              <div key={cIdx} className="bg-surface-container/50 px-2 py-1 rounded-md">
                                <span className="text-[9px] font-bold text-on-surface-variant uppercase block truncate">
                                  {h}
                                </span>
                                <span className="text-[11px] font-medium text-on-surface block truncate font-tabular-data">
                                  {String(cell)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Summary / Totals Card */}
              {summaryRow.length > 0 && (
                <div className="bg-secondary/10 border-2 border-secondary/30 rounded-xl p-3 shadow-xs space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-secondary block">
                    Report Summary &amp; Totals
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {headers.map((h, idx) => {
                      const totalVal = summaryRow[idx];
                      if (totalVal === null || totalVal === undefined || totalVal === '') return null;
                      return (
                        <div key={idx} className="bg-surface-container-lowest/80 p-2 rounded-lg border border-secondary/20">
                          <span className="text-[9.5px] font-bold text-on-surface-variant uppercase block truncate">
                            {h}
                          </span>
                          <span className="text-xs font-black text-on-surface block truncate font-tabular-data mt-0.5">
                            {String(totalVal)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 2 (and ALWAYS used for printing): Standard Official Multi-Column A4 Table */}
          <div
            id="report-pdf-print-root"
            className={`${
              viewMode === 'CARDS' ? 'hidden print:block' : 'block'
            } max-w-4xl mx-auto bg-white text-slate-900 rounded-xl shadow-md border border-slate-200/80 p-4 sm:p-8 font-sans text-xs leading-relaxed`}
            style={
              viewMode === 'A4' && zoomFit
                ? {
                    maxWidth: '100%',
                  }
                : undefined
            }
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
