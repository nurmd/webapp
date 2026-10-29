import React from 'react';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { Printer, Edit, Trash2 } from 'lucide-react';

export interface PurchaseDocumentModalProps {
  isOpen?: boolean;
  onClose: () => void;
  // Header details
  title?: React.ReactNode;
  billNumber?: string;
  purchaseType?: string;
  statusBadge?: React.ReactNode;
  headerLeading?: React.ReactNode;
  headerTrailing?: React.ReactNode;
  closeAriaLabel?: string;
  // Action bar
  showActionBar?: boolean;
  onPrint?: () => void;
  printLabel?: string;
  onEdit?: () => void;
  editLabel?: string;
  onDelete?: () => void;
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

export const PurchaseDocumentModal: React.FC<PurchaseDocumentModalProps> = ({
  isOpen = true,
  onClose,
  title,
  billNumber,
  purchaseType,
  statusBadge,
  headerLeading,
  headerTrailing,
  closeAriaLabel = 'Close purchase modal',
  showActionBar = true,
  onPrint,
  printLabel = 'Print',
  onEdit,
  editLabel = 'Edit',
  onDelete,
  customFooter,
  footerLeading,
  footerTrailing,
  variant = 'modal',
  maxWidth = '4xl',
  maxHeight = 'sm:max-h-[96vh]',
  viewportClassName = 'p-3 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-2.5 print-preview-viewport',
  children,
  backNavPriority = 25,
}) => {
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

  // Fullscreen layout (used by table-grid purchase editor)
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-bold text-sm text-on-surface truncate">
                    {purchaseType ? `${purchaseType} ` : ''}
                    {billNumber ? `#${billNumber}` : 'Purchase'}
                  </h3>
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

  // Dialog Modal layout (used by SimplifiedPurchaseModal)
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-2.5 print-modal-overlay animate-fade-in">
      <div
        className={`bg-surface-container-lowest text-on-surface rounded-none sm:rounded-2xl border-0 sm:border sm:border-outline-variant/30 w-full ${maxWidthClasses} h-full sm:h-auto ${maxHeight} flex flex-col shadow-2xl overflow-hidden print-modal-container`}
      >
        {/* Modal Controls Toolbar / Header */}
        <div className="no-print px-3 sm:px-4 py-2 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/95 gap-2 shrink-0">
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-bold text-sm text-on-surface truncate">
                    {purchaseType ? `${purchaseType} ` : ''}
                    {billNumber ? `#${billNumber}` : 'Purchase'}
                  </h3>
                  {statusBadge}
                </div>
              )}
            </div>
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
            <div className="flex items-center gap-1.5 flex-wrap">
              {footerLeading}
              <button
                type="button"
                onClick={onClose}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:bg-surface-container cursor-pointer active:scale-95 transition-all"
              >
                Close
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  title="Delete purchase"
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              {footerTrailing}
              {onPrint && (
                <button
                  type="button"
                  onClick={onPrint}
                  className="min-h-[36px] inline-flex items-center gap-1.5 bg-surface-container-lowest text-on-surface border border-outline-variant/30 px-3.5 py-1.5 rounded-xl text-xs font-bold hover:bg-surface-container active:scale-95 transition-all cursor-pointer shadow-2xs"
                  title="Print purchase document"
                >
                  <Printer size={14} />
                  <span>{printLabel}</span>
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="min-h-[36px] inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                  title="Edit purchase document"
                >
                  <Edit size={14} />
                  <span>{editLabel}</span>
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
