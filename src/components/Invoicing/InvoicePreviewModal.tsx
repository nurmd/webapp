import React, { useState, useRef, useEffect } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import {
  X,
  Printer,
  Share2,
  FileText,
  Smartphone,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { WhatsAppShareModal } from '../Common/WhatsAppShareModal.tsx';

const ThermalPrintModal = React.lazy(() =>
  import('../Printing/ThermalPrintModal.tsx').then((m) => ({ default: m.ThermalPrintModal }))
);
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { printCurrentPage, generatePdfNative } from '../../core/utils/printBridge.ts';
import { useModalPreloadOnMount, preloadThermalPrintModal } from '../../core/utils/modalPreload.ts';
import {
  useInvoicePreviewModel,
  InvoiceViewMode,
  InvoiceCopyType,
} from './preview/useInvoicePreviewModel.ts';
import { ThermalDocument } from './preview/ThermalDocument.tsx';
import { MobileCardsDocument } from './preview/MobileCardsDocument.tsx';
import { A4Document } from './preview/A4Document.tsx';

export type { InvoiceViewMode, InvoiceCopyType };

export interface InvoicePreviewModalProps {
  invoice: Invoice;
  company: CompanyProfile;
  onClose: () => void;
  onEditInvoice?: (invoice: Invoice) => void;
  initialViewMode?: InvoiceViewMode;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice: propInvoice,
  company,
  onClose,
  onEditInvoice,
  initialViewMode,
}) => {
  useModalPreloadOnMount([preloadThermalPrintModal]);

  const [viewMode, setViewMode] = useState<InvoiceViewMode>(() => {
    if (initialViewMode) return initialViewMode;
    return 'MOBILE';
  });

  useEffect(() => {
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialViewMode]);

  const [pendingA4Print, setPendingA4Print] = useState(false);
  const [a4FitZoom, setA4FitZoom] = useState(true);
  const [copiedInvoiceNo, setCopiedInvoiceNo] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 800;
  });
  const [a4ContentHeight, setA4ContentHeight] = useState<number>(0);
  const a4ContentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateDims = () => {
      if (typeof window !== 'undefined') {
        const vpWidth = viewportRef.current?.clientWidth;
        setContainerWidth(vpWidth && vpWidth > 0 ? vpWidth : window.innerWidth);
      }
      if (a4ContentRef.current) {
        const h = a4ContentRef.current.scrollHeight || a4ContentRef.current.offsetHeight;
        if (h > 0) {
          setA4ContentHeight(h);
        }
      }
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, [viewMode]);

  // Dynamically observe content size changes (e.g. line items rendered, fonts loaded, QR code generated)
  useEffect(() => {
    const el = a4ContentRef.current;
    if (!el) return;

    const measure = () => {
      const h = el.scrollHeight || el.offsetHeight;
      if (h > 0) {
        setA4ContentHeight(h);
      }
      const vpWidth = viewportRef.current?.clientWidth;
      if (vpWidth && vpWidth > 0) {
        setContainerWidth(vpWidth);
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(el);
      if (viewportRef.current) {
        observer.observe(viewportRef.current);
      }
      return () => observer.disconnect();
    }
  }, [viewMode, propInvoice]);

  const [thermalWidth] = useState<32 | 48>(() => {
    const defaultPrint = localStorage.getItem('defaultPrintOption');
    if (defaultPrint === 'Thermal-58mm') return 32;
    if (defaultPrint === 'Thermal-80mm') return 48;
    const existing = localStorage.getItem('printer_paper_width');
    return existing ? (Number(existing) as 32 | 48) : 48;
  });
  const [isThermalModalOpen, setIsThermalModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [copyType] = useState<InvoiceCopyType>('ORIGINAL FOR RECIPIENT');

  const model = useInvoicePreviewModel({
    propInvoice,
    company,
    thermalWidth,
  });

  const { invoice, hasItems, party, totalBalanceDue } = model;

  const handleCopyInvoiceNo = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(propInvoice.invoiceNumber || '');
      setCopiedInvoiceNo(true);
      setTimeout(() => setCopiedInvoiceNo(false), 2000);
    }
  };

  const handleCopyUpi = () => {
    if (company.upiId && navigator.clipboard) {
      navigator.clipboard.writeText(company.upiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  // Priority 25: Close preview modal
  useBackNavigation(() => {
    onClose();
    return true;
  }, true, 25);

  // If a print was triggered from Thermal view, switch to A4 and dispatch once mounted
  useEffect(() => {
    if (pendingA4Print && viewMode === 'A4') {
      setPendingA4Print(false);
      printCurrentPage(`Invoice-${invoice.invoiceNumber || 'Document'}`, 'A4');
    }
  }, [pendingA4Print, viewMode, invoice.invoiceNumber]);

  const handlePrint = () => {
    try {
      if (generatePdfNative(`Invoice-${invoice.invoiceNumber || 'Document'}`)) {
        return;
      }
    } catch (err) {
      console.warn('Direct PDF native generation failed, falling back to printCurrentPage:', err);
    }
    printCurrentPage(`Invoice-${invoice.invoiceNumber || 'Document'}`, 'A4');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-2 print-modal-overlay animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-none sm:rounded-2xl border-0 sm:border sm:border-outline-variant/30 w-full max-w-5xl h-full sm:h-auto sm:max-h-[96vh] flex flex-col shadow-2xl overflow-hidden print-modal-container">
        {/* Modal Controls Toolbar (Compact & Minimal Padding) */}
        <div className="no-print px-2 sm:px-3 py-1 sm:py-1.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/95 gap-1 shrink-0">
          {/* Format Selector: Unified Compact Segmented Pill */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 text-[11px] font-bold shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('MOBILE')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  viewMode === 'MOBILE'
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Mobile Touch Cards View"
              >
                <Smartphone size={12} />
                <span>Mobile</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('A4')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  viewMode === 'A4'
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Official A4 Laser Format"
              >
                <FileText size={12} />
                <span>A4 Sheet</span>
              </button>
            </div>

            {/* A4 Zoom Toggle (if opened in A4 mode on mobile/tablet) */}
            {viewMode === 'A4' && (
              <button
                type="button"
                onClick={() => setA4FitZoom((prev) => !prev)}
                className="hidden xs:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border bg-surface-container text-on-surface-variant hover:text-on-surface border-outline-variant/30 cursor-pointer transition-all"
                title={a4FitZoom ? 'Switch to 100% Zoom' : 'Fit A4 Sheet to Screen'}
              >
                {a4FitZoom ? <ZoomIn size={12} className="text-secondary" /> : <ZoomOut size={12} className="text-secondary" />}
                <span>{a4FitZoom ? '100% Zoom' : 'Fit Screen'}</span>
              </button>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            aria-label="Close Preview"
            className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer active:scale-95 ml-auto shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Notice banner if displaying sample fallback items */}
        {!hasItems && (
          <div className="no-print bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs font-semibold text-amber-900 dark:text-amber-200 shrink-0">
            ★ Previewing with standard sample GST items &amp; tax calculations.
          </div>
        )}

        {/* Document Preview Viewport Container */}
        <div
          ref={viewportRef}
          className={`print-preview-viewport overflow-auto py-1 sm:py-2 px-1 flex ${
            viewMode === 'THERMAL' || viewMode === 'MOBILE'
              ? 'justify-center'
              : 'justify-start sm:justify-center'
          } bg-slate-200/40 flex-1 min-h-0`}
        >
          {viewMode === 'THERMAL' && (
            <ThermalDocument
              model={model}
              thermalWidth={thermalWidth}
              copyType={copyType}
            />
          )}

          {viewMode === 'MOBILE' && (
            <MobileCardsDocument
              model={model}
              copyType={copyType}
              copiedInvoiceNo={copiedInvoiceNo}
              handleCopyInvoiceNo={handleCopyInvoiceNo}
              copiedUpi={copiedUpi}
              handleCopyUpi={handleCopyUpi}
            />
          )}

          {(viewMode === 'A4' || viewMode === 'MOBILE') && (
            <A4Document
              model={model}
              copyType={copyType}
              viewMode={viewMode}
              a4FitZoom={a4FitZoom}
              containerWidth={containerWidth}
              a4ContentHeight={a4ContentHeight}
              contentRef={a4ContentRef}
            />
          )}
        </div>

        {/* Sticky Bottom Actions Toolbar */}
        <div className="no-print px-2 sm:px-3 py-1.5 border-t border-outline-variant/20 bg-surface-container-low/95 backdrop-blur-md flex items-center justify-between gap-1.5 z-10 shrink-0">
          {/* Left Actions: Edit & Export Menu */}
          <div className="flex items-center gap-1 shrink-0">
            {onEditInvoice && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditInvoice(invoice);
                }}
                className="inline-flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95"
                title="Edit and update invoice"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                <span>Edit</span>
              </button>
            )}
          </div>

          {/* Right Primary Actions: WhatsApp & Print */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="inline-flex items-center gap-1 bg-[#25D366] hover:bg-[#20ba59] text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              <Share2 size={13} />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1 bg-secondary hover:bg-secondary/90 text-on-secondary px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Printer size={13} />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {isThermalModalOpen && (
        <React.Suspense fallback={null}>
          <ThermalPrintModal
            invoice={invoice}
            company={company}
            onClose={() => setIsThermalModalOpen(false)}
          />
        </React.Suspense>
      )}

      {isWhatsAppModalOpen && (
        <WhatsAppShareModal
          isOpen={true}
          invoice={invoice}
          company={company}
          onClose={() => setIsWhatsAppModalOpen(false)}
          initialPhone={party?.phone}
          initialBalance={invoice.balanceAmount}
          initialTotalBalanceDue={totalBalanceDue}
          onPrintA4={handlePrint}
          onPrint={() => setIsThermalModalOpen(true)}
        />
      )}
    </div>
  );
};
