import React, { useState } from 'react';
import { formatINR } from '../../core/utils/formatters.ts';

interface SplitPaymentBreakdown {
  cash: number;
  upi: number;
  card: number;
  credit: number;
}

interface SplitPaymentModalProps {
  isOpen: boolean;
  grandTotal: number;
  hasCustomerSelected: boolean;
  onConfirmSplit: (breakdown: SplitPaymentBreakdown) => void;
  onClose: () => void;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  isOpen,
  grandTotal,
  hasCustomerSelected,
  onConfirmSplit,
  onClose,
}) => {
  const [cash, setCash] = useState<string>('');
  const [upi, setUpi] = useState<string>('');
  const [card, setCard] = useState<string>('');
  const [credit, setCredit] = useState<string>('');

  if (!isOpen) return null;

  const numCash = parseFloat(cash) || 0;
  const numUpi = parseFloat(upi) || 0;
  const numCard = parseFloat(card) || 0;
  const numCredit = parseFloat(credit) || 0;

  const totalAllocated = numCash + numUpi + numCard + numCredit;
  const remaining = Number((grandTotal - totalAllocated).toFixed(2));
  const isValid = Math.abs(remaining) < 0.01;

  const handleFillRemaining = (mode: 'cash' | 'upi' | 'card' | 'credit') => {
    if (remaining <= 0) return;
    const currentVal =
      mode === 'cash' ? numCash : mode === 'upi' ? numUpi : mode === 'card' ? numCard : numCredit;
    const nextVal = (currentVal + remaining).toFixed(2);
    if (mode === 'cash') setCash(nextVal);
    if (mode === 'upi') setUpi(nextVal);
    if (mode === 'card') setCard(nextVal);
    if (mode === 'credit') setCredit(nextVal);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onConfirmSplit({
      cash: numCash,
      upi: numUpi,
      card: numCard,
      credit: numCredit,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">call_split</span>
            <div>
              <h3 className="font-headline-sm text-base font-bold text-on-surface">
                Split / Multi-Payment
              </h3>
              <p className="text-[11px] text-outline">Divide bill across multiple tender modes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Bill Total & Allocation Status */}
        <div className="p-4 bg-surface-container-low/40 border-b border-outline-variant/20 flex items-center justify-between">
          <div>
            <span className="text-xs text-outline block">Grand Total</span>
            <span className="text-base font-black text-on-surface font-tabular-data">
              {formatINR(grandTotal)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-xs text-outline block">Remaining to Balance</span>
            <span
              className={`text-base font-black font-tabular-data ${
                remaining === 0
                  ? 'text-secondary'
                  : remaining > 0
                  ? 'text-amber-600'
                  : 'text-error'
              }`}
            >
              {remaining === 0 ? '✓ Balanced' : formatINR(remaining)}
            </span>
          </div>
        </div>

        {/* Inputs */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          {/* Cash */}
          <div className="flex items-center gap-2">
            <div className="w-20 text-xs font-bold text-on-surface flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-secondary">payments</span>
              <span>Cash</span>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-1.5 text-xs font-bold font-tabular-data text-on-surface outline-none focus:border-secondary"
            />
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => handleFillRemaining('cash')}
                className="px-2.5 py-1.5 bg-surface-container text-outline hover:text-on-surface text-[11px] font-semibold rounded-lg cursor-pointer"
              >
                + Fill
              </button>
            )}
          </div>

          {/* UPI */}
          <div className="flex items-center gap-2">
            <div className="w-20 text-xs font-bold text-on-surface flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-primary">qr_code_2</span>
              <span>UPI</span>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
              className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-1.5 text-xs font-bold font-tabular-data text-on-surface outline-none focus:border-secondary"
            />
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => handleFillRemaining('upi')}
                className="px-2.5 py-1.5 bg-surface-container text-outline hover:text-on-surface text-[11px] font-semibold rounded-lg cursor-pointer"
              >
                + Fill
              </button>
            )}
          </div>

          {/* Card */}
          <div className="flex items-center gap-2">
            <div className="w-20 text-xs font-bold text-on-surface flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-blue-600">credit_card</span>
              <span>Card</span>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={card}
              onChange={(e) => setCard(e.target.value)}
              className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-1.5 text-xs font-bold font-tabular-data text-on-surface outline-none focus:border-secondary"
            />
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => handleFillRemaining('card')}
                className="px-2.5 py-1.5 bg-surface-container text-outline hover:text-on-surface text-[11px] font-semibold rounded-lg cursor-pointer"
              >
                + Fill
              </button>
            )}
          </div>

          {/* Credit / Udhaar */}
          <div className="flex items-center gap-2">
            <div className="w-20 text-xs font-bold text-on-surface flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-amber-600">account_balance_wallet</span>
              <span>Credit</span>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!hasCustomerSelected}
              placeholder={hasCustomerSelected ? '0.00' : 'Select Customer First'}
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-1.5 text-xs font-bold font-tabular-data text-on-surface outline-none focus:border-secondary disabled:opacity-50"
            />
            {hasCustomerSelected && remaining > 0 && (
              <button
                type="button"
                onClick={() => handleFillRemaining('credit')}
                className="px-2.5 py-1.5 bg-surface-container text-outline hover:text-on-surface text-[11px] font-semibold rounded-lg cursor-pointer"
              >
                + Fill
              </button>
            )}
          </div>

          {!hasCustomerSelected && (
            <p className="text-[10px] text-outline">
              * Credit / Udhaar requires selecting a registered Customer account.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:bg-surface-container cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-secondary text-on-secondary shadow-md hover:bg-secondary/90 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              Confirm Split Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
