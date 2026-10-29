import React from 'react';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export interface DocumentViewModalProps {
  isOpen?: boolean;
  onClose: () => void;
  // Header configuration
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerIcon?: string; // Material symbol name
  headerIconClass?: string; // e.g. "bg-blue-500/15 text-blue-600 dark:text-blue-400"
  leadingAction?: React.ReactNode; // e.g. delete button or back button
  headerTrailing?: React.ReactNode; // e.g. format toggles or extra icons
  closeAriaLabel?: string;
  // Dimensions & layout
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | 'full';
  maxHeight?: string; // default "max-h-[90vh]"
  height?: string; // e.g. "h-[94vh]"
  viewportClassName?: string;
  // Body and Footer
  children: React.ReactNode;
  footer?: React.ReactNode;
  // System Back Navigation
  backNavPriority?: number;
}

export const DocumentViewModal: React.FC<DocumentViewModalProps> = ({
  isOpen = true,
  onClose,
  title,
  subtitle,
  headerIcon,
  headerIconClass = 'bg-secondary/15 text-secondary',
  leadingAction,
  headerTrailing,
  closeAriaLabel = 'Close modal',
  maxWidth = 'md',
  maxHeight = 'max-h-[90vh]',
  height,
  viewportClassName = 'p-3.5 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-2.5',
  children,
  footer,
  backNavPriority = 25,
}) => {
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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-3 animate-fade-in">
      <div
        className={`bg-surface-container-lowest rounded-2xl w-full ${maxWidthClasses} shadow-2xl border border-outline-variant/30 flex flex-col ${height ? height : ''} ${maxHeight} overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 p-3 sm:p-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {leadingAction ? (
              leadingAction
            ) : headerIcon ? (
              <div className={`w-8 h-8 rounded-xl ${headerIconClass} flex items-center justify-center flex-shrink-0`}>
                <span className="material-symbols-outlined text-[18px]">{headerIcon}</span>
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {typeof title === 'string' ? (
                  <h3 className="font-bold text-sm text-on-surface truncate">{title}</h3>
                ) : (
                  title
                )}
              </div>
              {subtitle && (
                <span className="text-[11px] text-on-surface-variant truncate block">
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {headerTrailing}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 min-w-[32px] min-h-[32px] rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
              title="Close"
              aria-label={closeAriaLabel}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Viewport */}
        <div className={viewportClassName}>{children}</div>

        {/* Footer / Action Dock */}
        {footer && <div className="border-t border-outline-variant/20 p-3 bg-surface-container-lowest flex-shrink-0">{footer}</div>}
      </div>
    </div>
  );
};
