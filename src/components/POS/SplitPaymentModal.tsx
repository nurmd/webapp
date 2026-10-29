import React, { useState, useMemo } from 'react';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { db } from '../../services/db.ts';
import { PaymentEntryForm } from '../Common/PaymentEntryForm.tsx';

export interface SplitPaymentBreakdown {
  cash: number;
  upi: number;
  card: number;
  credit: number;
  upiAccountId?: string;
  upiAccountName?: string;
  cardAccountId?: string;
  cardAccountName?: string;
}

export interface SplitPaymentModalProps {
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
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 20);

  const bankAccounts = useMemo(() => {
    return db.getBankAccounts().filter((b) => b.accountType === 'BANK');
  }, []);
  const defaultBank = bankAccounts.find((b) => (b as any).isDefault) || bankAccounts[0];

  const [cash, setCash] = useState<string>('');
  const [upi, setUpi] = useState<string>('');
  const [card, setCard] = useState<string>('');
  const [credit, setCredit] = useState<string>('');
  const [upiAccountId, setUpiAccountId] = useState<string>(defaultBank?.id || '');
  const [cardAccountId, setCardAccountId] = useState<string>(defaultBank?.id || '');

  if (!isOpen) return null;

  const numCash = parseFloat(cash) || 0;
  const numUpi = parseFloat(upi) || 0;
  const numCard = parseFloat(card) || 0;
  const numCredit = parseFloat(credit) || 0;

  const totalAllocated = numCash + numUpi + numCard + numCredit;
  const remaining = Number((grandTotal - totalAllocated).toFixed(2));
  const isValid = Math.abs(remaining) < 0.01;

  const handleFillRemaining = (mode: 'cash' | 'upi' | 'card' | 'credit' | 'bank') => {
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
    const selUpiAcc = bankAccounts.find((b) => b.id === (upiAccountId || defaultBank?.id)) || defaultBank;
    const selCardAcc = bankAccounts.find((b) => b.id === (cardAccountId || defaultBank?.id)) || defaultBank;
    onConfirmSplit({
      cash: numCash,
      upi: numUpi,
      card: numCard,
      credit: numCredit,
      upiAccountId: selUpiAcc?.id,
      upiAccountName: selUpiAcc?.accountName,
      cardAccountId: selCardAcc?.id,
      cardAccountName: selCardAcc?.accountName,
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
            title="Close"
            aria-label="Close split payment modal"
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

        {/* Unified Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <PaymentEntryForm
            mode="SPLIT"
            splitVariant="rows"
            amount={grandTotal.toString()}
            onChangeAmount={() => {}}
            showDate={false}
            showDiscount={false}
            showMode={false}
            showNotes={false}
            showSettlementSummary={false}
            splitCash={cash}
            onChangeSplitCash={setCash}
            splitUPI={upi}
            onChangeSplitUPI={setUpi}
            splitCard={card}
            onChangeSplitCard={setCard}
            splitCredit={credit}
            onChangeSplitCredit={setCredit}
            showCreditSplit={true}
            creditDisabled={!hasCustomerSelected}
            creditDisabledReason="* Credit / Udhaar requires selecting a registered Customer account."
            bankAccounts={bankAccounts}
            upiAccountId={upiAccountId}
            onChangeUpiAccountId={setUpiAccountId}
            cardAccountId={cardAccountId}
            onChangeCardAccountId={setCardAccountId}
            onFillRemaining={handleFillRemaining}
          />

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
