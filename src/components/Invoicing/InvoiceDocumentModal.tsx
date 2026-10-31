import React from 'react';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { FileText, Smartphone, Printer, Share2, MoreVertical, Download, Receipt, ZoomIn, ZoomOut } from 'lucide-react';

export type InvoiceFormatMode = 'MOBILE' | 'A4' | 'THERMAL';

export interface InvoiceDocumentModalProps {
  isOpen?: boolean;
  onClose: () => void;
  // Header details
  title?: React.ReactNode;
  invoiceNumber?: string;
  invoiceType?: string;
  statusBadge?: React.ReactNode;
  compositionBadge?: boolean;
  headerLeading?: React.ReactNode;
  headerTrailing?: React.ReactNode;
  closeAriaLabel?: string;
  // Format selector
  showFormatSelector?: boolean;
  formatMode?: InvoiceFormatMode;
  onChangeFormatMode?: (mode: InvoiceFormatMode) => void;
  thermalWidth?: 32 | 48;
  onChangeThermalWidth?: (width: 32 | 48) => void;
  // Zoom toggle
  showZoomToggle?: boolean;
  a4FitZoom?: boolean;
  onToggleA4FitZoom?: () => void;
  // Action bar
  showActionBar?: boolean;
  onPrint?: () => void;
  printLabel?: string;
  printIcon?: string;
  onA4Preview?: () => void;
  onWhatsApp?: () => void;
  onEdit?: () => void;
  editLabel?: string;
  onDelete?: () => void;
  onExportEWay?: () => void;
  onExportEInvoice?: () => void;
  onCopyThermalText?: () => void;
  customFooter?: React.ReactNode;
  footerLeading?: React.ReactNode;
  footerTrailing?: React.ReactNode;
  // Modal layout
  variant?: 'modal' | 'fullscreen';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | 'full';
  maxHeight?: string;
  viewportClassName?: string;
  children: React.ReactNode;
  backNavPriority?: number;
}

export const InvoiceDocumentModal: React.FC<InvoiceDocumentModalProps> = ({
  isOpen = true,
  onClose,
  title,
  invoiceNumber,
  invoiceType,
  statusBadge,
  compositionBadge,
  headerLeading,
  headerTrailing,
  closeAriaLabel = 'Close invoice modal',
  showFormatSelector = false,
  formatMode = 'A4',
  onChangeFormatMode,
  thermalWidth = 48,
  onChangeThermalWidth,
  showZoomToggle = false,
  a4FitZoom = true,
  onToggleA4FitZoom,
  showActionBar = true,
  onPrint,
  printLabel,
  printIcon = 'print',
  onA4Preview,
  onWhatsApp,
  onEdit,
  editLabel = 'Edit',
  onDelete,
  onExportEWay,
  onExportEInvoice,
  onCopyThermalText,
  customFooter,
  footerLeading,
  footerTrailing,
  variant = 'modal',
  maxWidth = '5xl',
  maxHeight = 'sm:max-h-[96vh]',
  viewportClassName = 'p-3 sm:p-4 overflow-y-auto flex-1 min-h-0 flex flex-col gap-2.5 print-preview-viewport',
  children,
  backNavPriority = 25,
}) => {
  const [showExportMenu, setShowExportMenu] = React.useState(false);

  // Close export menu on hardware back if open
  useBackNavigation(() => {
    setShowExportMenu(false);
    return true;
  }, showExportMenu, backNavPriority + 5);

  // Close modal on hardware back
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, backNavPriority);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    full: 'max-w-full',
  }[maxWidth];

  const hasExports = Boolean(onExportEWay || onExportEInvoice || onCopyThermalText);

  // Fullscreen layout (used by table-grid editors)
  if (variant === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-50 bg-surface flex flex-col min-h-screen overflow-x-hidden antialiased print-modal-container">
        {/* Custom or standardized header */}
        <div className="no-print border-b border-outline-variant/20 bg-surface-container-low/95 shrink-0 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {headerLeading}
            <div className="min-w-0">
              {title ? (
                typeof title === 'string' ? (
                  <h3 className="font-bold text-sm text-on-surface truncate">{title}</h3>
                ) : (
                  title
                )
              ) : (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <h3 className="font-bold text-sm text-on-surface truncate shrink-0">
                    {invoiceType ? `${invoiceType} ` : ''}
                    {invoiceNumber ? `#${invoiceNumber}` : 'Invoice'}
                  </h3>
                  {compositionBadge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-secondary-container text-on-secondary-container whitespace-nowrap shrink-0">
                      Composition
                    </span>
                  )}
                  {statusBadge}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {headerTrailing}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
              title="Close"
              aria-label={closeAriaLabel}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Viewport */}
        <div className={viewportClassName}>{children}</div>

        {/* Footer */}
        {customFooter && <div className="no-print border-t border-outline-variant/20 shrink-0">{customFooter}</div>}
      </div>
    );
  }

  // Dialog Modal layout (used by Preview & Simplified modals)
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-2.5 print-modal-overlay animate-fade-in">
      <div
        className={`bg-surface-container-lowest text-on-surface rounded-none sm:rounded-2xl border-0 sm:border sm:border-outline-variant/30 w-full ${maxWidthClasses} h-full sm:h-auto ${maxHeight} flex flex-col shadow-2xl overflow-hidden print-modal-container`}
      >
        {/* Modal Controls Toolbar / Header */}
        <div className="no-print px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/95 gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {headerLeading}
            <div className="min-w-0">
              {title ? (
                typeof title === 'string' ? (
                  <h3 className="font-bold text-sm text-on-surface truncate">{title}</h3>
                ) : (
                  title
                )
              ) : (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <h3 className="font-bold text-sm text-on-surface truncate shrink-0">
                    {invoiceType ? `${invoiceType} ` : ''}
                    {invoiceNumber ? `#${invoiceNumber}` : 'Invoice'}
                  </h3>
                  {compositionBadge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-secondary-container text-on-secondary-container whitespace-nowrap shrink-0">
                      Composition
                    </span>
                  )}
                  {statusBadge}
                </div>
              )}
            </div>

            {/* Optional Segmented Format Selector */}
            {showFormatSelector && onChangeFormatMode && (
              <div className="hidden xs:flex items-center gap-1 bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 text-[11px] font-bold shrink-0 ml-1">
                <button
                  type="button"
                  onClick={() => onChangeFormatMode('MOBILE')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                    formatMode === 'MOBILE'
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Mobile View"
                >
                  <Smartphone size={12} />
                  <span>Mobile</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeFormatMode('A4')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                    formatMode === 'A4'
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Official A4 Format"
                >
                  <FileText size={12} />
                  <span>A4 Laser</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeFormatMode('THERMAL');
                    onChangeThermalWidth?.(48);
                  }}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    formatMode === 'THERMAL' && thermalWidth === 48
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="3-inch Thermal Slip"
                >
                  3" Thermal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeFormatMode('THERMAL');
                    onChangeThermalWidth?.(32);
                  }}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    formatMode === 'THERMAL' && thermalWidth === 32
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="2-inch Thermal Slip"
                >
                  2" Thermal
                </button>
              </div>
            )}

            {/* A4 Zoom Toggle */}
            {showZoomToggle && formatMode === 'A4' && onToggleA4FitZoom && (
              <button
                type="button"
                onClick={onToggleA4FitZoom}
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border bg-surface-container text-on-surface-variant hover:text-on-surface border-outline-variant/30 cursor-pointer transition-all"
                title={a4FitZoom ? 'Switch to 100% Zoom' : 'Fit A4 Sheet to Screen'}
              >
                {a4FitZoom ? <ZoomIn size={12} className="text-secondary" /> : <ZoomOut size={12} className="text-secondary" />}
                <span>{a4FitZoom ? '100%' : 'Fit'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerTrailing}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
              title="Close"
              aria-label={closeAriaLabel}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Viewport (Printable Container) */}
        <div className={viewportClassName}>{children}</div>

        {/* Unified Bottom Action Bar */}
        {customFooter ? (
          <div className="no-print border-t border-outline-variant/20 p-2.5 bg-surface-container-low/95 shrink-0">
            {customFooter}
          </div>
        ) : showActionBar ? (
          <div className="no-print border-t border-outline-variant/20 px-3 py-2 bg-surface-container-low/95 flex items-center justify-between gap-2 shrink-0 flex-wrap">
            {/* Left Actions */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {footerLeading}

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:bg-surface-container cursor-pointer active:scale-95 transition-all whitespace-nowrap shrink-0"
              >
                Close
              </button>

              {/* Delete Button */}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all whitespace-nowrap shrink-0"
                  title="Delete invoice"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  <span>Delete</span>
                </button>
              )}

              {/* Edit Button */}
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  title="Edit invoice"
                >
                  <span className="material-symbols-outlined text-[15px]">edit</span>
                  <span>{editLabel}</span>
                </button>
              )}

              {/* A4 Preview Button (if on mobile or simplified mode) */}
              {onA4Preview && (
                <button
                  type="button"
                  onClick={onA4Preview}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-surface-container text-on-surface border border-outline-variant/30 text-xs font-bold flex items-center gap-1 hover:bg-surface-container-high cursor-pointer active:scale-95 transition-all"
                  title="A4 PDF Preview"
                >
                  <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                  <span>A4 / PDF</span>
                </button>
              )}

              {/* Export Popover */}
              {hasExports && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowExportMenu((prev) => !prev)}
                    className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface hover:bg-surface-container flex items-center gap-1 cursor-pointer"
                    title="Export options"
                  >
                    <MoreVertical size={14} />
                    <span className="hidden sm:inline">Export</span>
                  </button>

                  {showExportMenu && (
                    <div className="absolute left-0 bottom-10 z-50 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl p-1 flex flex-col gap-0.5 w-52 animate-in fade-in">
                      {onExportEWay && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            onExportEWay();
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                        >
                          <Download size={14} className="text-secondary" />
                          <span>NIC E-Way Bill (JSON)</span>
                        </button>
                      )}
                      {onExportEInvoice && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            onExportEInvoice();
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                        >
                          <Download size={14} className="text-primary" />
                          <span>NIC E-Invoice (JSON)</span>
                        </button>
                      )}
                      {onCopyThermalText && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            onCopyThermalText();
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                        >
                          <Receipt size={14} className="text-amber-600" />
                          <span>Copy Raw Slip Text</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Primary Actions: WhatsApp & Print */}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {footerTrailing}

              {/* WhatsApp */}
              {onWhatsApp && (
                <button
                  type="button"
                  onClick={onWhatsApp}
                  className="min-h-[36px] inline-flex items-center gap-1 bg-[#25D366] hover:bg-[#20ba59] text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs"
                  title="Share via WhatsApp"
                >
                  <Share2 size={13} />
                  <span>WhatsApp</span>
                </button>
              )}

              {/* Print / PDF */}
              {onPrint && (
                <button
                  type="button"
                  onClick={onPrint}
                  className="min-h-[36px] inline-flex items-center gap-1 bg-secondary hover:bg-secondary/90 text-on-secondary px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
                  title="Print document"
                >
                  <Printer size={13} />
                  <span>{printLabel || (formatMode === 'THERMAL' ? 'Print Slip' : 'Print / PDF')}</span>
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
