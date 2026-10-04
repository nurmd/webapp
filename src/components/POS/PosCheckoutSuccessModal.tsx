import React, { useEffect } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';

interface PosCheckoutSuccessModalProps {
  isOpen: boolean;
  invoice: Invoice;
  company: CompanyProfile;
  changeDue?: number;
  cashTendered?: number;
  onPrintThermal: () => void;
  onViewA4: () => void;
  onNextSale: () => void;
}

export const PosCheckoutSuccessModal: React.FC<PosCheckoutSuccessModalProps> = ({
  isOpen,
  invoice,
  company,
  changeDue = 0,
  cashTendered,
  onPrintThermal,
  onViewA4,
  onNextSale,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNextSale();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onNextSale]);

  if (!isOpen) return null;

  const handleShareWhatsApp = () => {
    const phone = invoice.partyName.match(/\d{10}/)?.[0] || '';
    const url = getWhatsAppShareUrl(invoice, company, phone);
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-3xl border border-outline-variant/30 w-full max-w-md shadow-2xl flex flex-col items-center p-6 text-center animate-scale-up">
        {/* Success Icon */}
        <div className="w-16 h-16 rounded-full bg-secondary-container/60 text-secondary flex items-center justify-center mb-3">
          <span className="material-symbols-outlined text-4xl animate-bounce-short">
            check_circle
          </span>
        </div>

        <h3 className="font-headline-sm text-xl font-black text-on-surface">
          Sale Completed!
        </h3>
        <p className="text-xs text-outline mt-0.5">
          Bill <span className="font-bold text-on-surface font-mono">#{invoice.invoiceNumber}</span>
          {' • '}
          {invoice.partyName}
        </p>

        {/* Change Due / Return Alert Banner */}
        {changeDue > 0 && (
          <div className="w-full mt-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-3 flex items-center justify-between shadow-sm">
            <div className="text-left">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block uppercase tracking-wider">
                Change Return to Customer
              </span>
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                Tendered {formatINR(cashTendered || 0)} - Total {formatINR(invoice.grandTotal)}
              </span>
            </div>
            <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 font-tabular-data">
              {formatINR(changeDue)}
            </div>
          </div>
        )}

        {/* Summary Card */}
        <div className="w-full mt-4 bg-surface-container-low/60 rounded-2xl p-3.5 border border-outline-variant/20 space-y-2 text-xs">
          <div className="flex items-center justify-between text-outline">
            <span>Payment Mode</span>
            <span className="font-bold text-on-surface">{invoice.paymentMode}</span>
          </div>
          <div className="flex items-center justify-between text-outline">
            <span>Total Items</span>
            <span className="font-bold text-on-surface">
              {invoice.items.reduce((s, i) => s + i.quantity, 0)} Units ({invoice.items.length} Lines)
            </span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-outline-variant/20 text-sm font-bold text-on-surface">
            <span>Amount Paid</span>
            <span className="text-secondary font-black font-tabular-data">
              {formatINR(invoice.grandTotal)}
            </span>
          </div>
        </div>

        {/* Quick Action Grid */}
        <div className="grid grid-cols-3 gap-2 w-full mt-5">
          <button
            type="button"
            onClick={onPrintThermal}
            className="p-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 rounded-2xl flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-secondary text-2xl">print</span>
            <span className="text-[11px] font-bold text-on-surface">Thermal Slip</span>
          </button>

          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="p-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 rounded-2xl flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-emerald-600 text-2xl">chat</span>
            <span className="text-[11px] font-bold text-on-surface">WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={onViewA4}
            className="p-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 rounded-2xl flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-primary text-2xl">description</span>
            <span className="text-[11px] font-bold text-on-surface">A4 Invoice</span>
          </button>
        </div>

        {/* Next Sale Button */}
        <button
          type="button"
          onClick={onNextSale}
          className="w-full mt-4 py-3.5 bg-secondary text-on-secondary rounded-2xl font-bold text-sm shadow-lg hover:bg-secondary/90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Start Next Sale</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">↵ Enter</span>
        </button>
      </div>
    </div>
  );
};
