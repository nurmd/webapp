import React, { forwardRef } from 'react';

export interface ThermalReceiptPreviewProps {
  previewText: string;
  width: 32 | 48;
  className?: string;
}

/**
 * Shared styled thermal POS receipt preview component.
 * Used for visual display and high-fidelity PNG capture via html-to-image.
 */
export const ThermalReceiptPreview = forwardRef<HTMLDivElement, ThermalReceiptPreviewProps>(
  ({ previewText, width, className = '' }, ref) => {
    return (
      <div
        ref={ref}
        data-testid="thermal-receipt-preview"
        className={`w-full ${
          width === 32 ? 'max-w-[320px]' : 'max-w-[420px]'
        } bg-[#fefdfb] text-slate-950 p-3.5 sm:p-4 rounded-xl border border-stone-300 shadow-md font-mono ${
          width === 32 ? 'text-[11px]' : 'text-[10px]'
        } leading-relaxed overflow-x-auto whitespace-pre select-text font-bold transition-all ${className}`}
      >
        {previewText}
      </div>
    );
  }
);

ThermalReceiptPreview.displayName = 'ThermalReceiptPreview';
