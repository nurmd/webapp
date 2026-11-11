import React, { useState, useMemo, useCallback } from 'react';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { PassbookEntry } from './usePartyPassbook.ts';
import {
  PaymentSlipSource,
  PaymentSlipAllocation,
  buildPaymentSlipData,
  formatPaymentSlipText,
  buildPaymentSlipHtml,
} from '../../core/printer/paymentSlip.ts';
import { ThermalReceiptPreview } from '../Printing/ThermalReceiptPreview.tsx';
import { printDocument } from '../../core/utils/printBridge.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export interface PaymentReceiptSlipModalProps {
  entry: PassbookEntry;
  party: Party;
  company: CompanyProfile;
  onClose: () => void;
  defaultWidth?: 32 | 48;
}

export const PaymentReceiptSlipModal: React.FC<PaymentReceiptSlipModalProps> = ({
  entry,
  party,
  company,
  onClose,
  defaultWidth,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  });

  const [width, setWidth] = useState<32 | 48>(() => {
    if (defaultWidth === 32 || defaultWidth === 48) return defaultWidth;
    return 32;
  });

  const source: PaymentSlipSource = useMemo(() => {
    const isPaymentIn = entry.type === 'PAYMENT_IN';
    const amount = isPaymentIn ? entry.credit : entry.debit;
    const allocations: PaymentSlipAllocation[] = (entry.rawVoucher?.paymentAllocations || []).map(
      (alloc) => ({
        documentNumber: alloc.documentNumber,
        amount: alloc.amount,
      })
    );

    return {
      type: isPaymentIn ? 'PAYMENT_IN' : 'PAYMENT_OUT',
      docNumber: entry.docNumber,
      date: entry.date,
      amount: amount || 0,
      paymentMode: entry.paymentMode || (entry.rawVoucher as unknown as { paymentMode?: string })?.paymentMode,
      notes: entry.rawVoucher?.narration,
      allocations,
    };
  }, [entry]);

  const data = useMemo(() => {
    return buildPaymentSlipData(source, party, company, {
      balanceAfter: party.currentBalance,
    });
  }, [source, party, company]);

  const previewText = useMemo(() => {
    return formatPaymentSlipText(data, width);
  }, [data, width]);

  const handlePrint = useCallback(() => {
    const html = buildPaymentSlipHtml(data, width);
    printDocument({
      documentType: 'standalone-html',
      html,
      jobName: `Payment-${entry.docNumber}`,
      paperSize: 'default',
    });
  }, [data, width, entry.docNumber]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-lg shadow-2xl border border-outline-variant/30 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-3 flex-shrink-0 bg-surface">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-secondary text-[22px]">receipt_long</span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-on-surface truncate">
                {entry.type === 'PAYMENT_IN' ? 'Payment Receipt' : 'Payment Voucher'} Slip
              </h2>
              <p className="text-[11px] text-on-surface-variant truncate">
                #{entry.docNumber} • {party.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 58mm / 80mm toggle */}
            <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 text-xs font-bold">
              <button
                type="button"
                onClick={() => setWidth(32)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  width === 32
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                58mm
              </button>
              <button
                type="button"
                onClick={() => setWidth(48)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  width === 48
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                80mm
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body showing ThermalReceiptPreview */}
        <div className="flex-1 overflow-y-auto p-4 bg-surface-container-low/40 overscroll-contain flex justify-center">
          <ThermalReceiptPreview previewText={previewText} width={width} />
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-outline-variant/20 bg-surface-container-lowest flex items-center justify-between gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-on-surface-variant font-bold text-xs cursor-pointer hover:bg-surface-container-high transition-all"
          >
            Close
          </button>
          <button
            type="button"
            data-testid="payment-slip-print"
            onClick={handlePrint}
            className="px-5 py-2 rounded-xl bg-secondary hover:bg-secondary/90 text-on-secondary font-bold text-xs shadow-sm flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>Print slip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
