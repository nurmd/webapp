import React, { useState, useMemo } from 'react';
import { PaymentMode, PaymentStatus, PaymentSplit } from '../../../models/invoice.ts';
import { formatINR } from '../../../core/utils/formatters.ts';
import { formatSplitNotes } from '../../../core/accounting/paymentSplitUtils.ts';

export interface InvoicePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  finalGrandTotal: number;
  invoiceNumber: string;
  partyName: string;
  initialSplits?: PaymentSplit[];
  onConfirmPayment: (
    paymentData: {
      paymentMode: PaymentMode;
      paymentStatus: PaymentStatus;
      paidAmount: number;
      balanceAmount: number;
      paymentSplits: PaymentSplit[];
      paymentNotes?: string;
    },
    andPrint?: boolean
  ) => void;
}

const PAYMENT_MODES: { value: PaymentMode; label: string; icon: string }[] = [
  { value: 'CASH', label: 'Cash', icon: 'payments' },
  { value: 'UPI', label: 'UPI / QR', icon: 'qr_code_scanner' },
  { value: 'CARD', label: 'Card', icon: 'credit_card' },
  { value: 'NET_BANKING', label: 'Bank Transfer', icon: 'account_balance' },
  { value: 'CHEQUE', label: 'Cheque', icon: 'receipt_long' },
  { value: 'CREDIT', label: 'Credit (Udhaar)', icon: 'pending_actions' },
];

export const InvoicePaymentModal: React.FC<InvoicePaymentModalProps> = ({
  isOpen,
  onClose,
  finalGrandTotal,
  invoiceNumber,
  partyName,
  initialSplits,
  onConfirmPayment,
}) => {
  const [splits, setSplits] = useState<PaymentSplit[]>(() => {
    if (initialSplits && initialSplits.length > 0) {
      return initialSplits.map((s, idx) => ({
        id: s.id || `split-${idx}-${Date.now()}`,
        mode: s.mode,
        amount: Number(s.amount) || 0,
      }));
    }
    return [{ id: '1', mode: 'CASH', amount: finalGrandTotal }];
  });

  const [paymentRefNotes, setPaymentRefNotes] = useState('');

  // Total paid via non-credit splits
  const totalPaid = useMemo(() => {
    return Number(
      splits
        .reduce((sum, s) => {
          if (s.mode === 'CREDIT') return sum;
          return sum + (Number(s.amount) || 0);
        }, 0)
        .toFixed(2)
    );
  }, [splits]);

  // Balance due (if paid < grandTotal)
  const balanceDue = useMemo(() => {
    return Math.max(0, Number((finalGrandTotal - totalPaid).toFixed(2)));
  }, [finalGrandTotal, totalPaid]);

  // Change to return (if cash paid > grandTotal)
  const changeToReturn = useMemo(() => {
    return totalPaid > finalGrandTotal ? Number((totalPaid - finalGrandTotal).toFixed(2)) : 0;
  }, [totalPaid, finalGrandTotal]);

  // Resolved payment status
  const paymentStatus: PaymentStatus = useMemo(() => {
    if (finalGrandTotal <= 0) return 'PAID';
    if (totalPaid >= finalGrandTotal) return 'PAID';
    if (totalPaid > 0) return 'PARTIAL';
    return 'UNPAID';
  }, [totalPaid, finalGrandTotal]);

  // Resolved overall payment mode
  const resolvedPaymentMode: PaymentMode = useMemo(() => {
    const nonCreditSplits = splits.filter((s) => s.mode !== 'CREDIT' && (Number(s.amount) || 0) > 0);
    if (paymentStatus === 'UNPAID' || nonCreditSplits.length === 0) {
      return 'CREDIT';
    }
    if (nonCreditSplits.length === 1 && balanceDue <= 0.01) {
      return nonCreditSplits[0].mode;
    }
    return 'SPLIT';
  }, [paymentStatus, splits, balanceDue]);

  if (!isOpen) return null;

  // 1-tap quick tender shortcuts
  const handleQuickTender = (mode: PaymentMode) => {
    if (mode === 'CREDIT') {
      setSplits([{ id: `split-${Date.now()}`, mode: 'CREDIT', amount: 0 }]);
    } else {
      setSplits([{ id: `split-${Date.now()}`, mode, amount: finalGrandTotal }]);
    }
  };

  const handleUpdateSplitMode = (id: string, mode: PaymentMode) => {
    setSplits((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (mode === 'CREDIT') {
          return { ...s, mode, amount: 0 };
        }
        return {
          ...s,
          mode,
          amount: s.amount === 0 ? balanceDue || finalGrandTotal : s.amount,
        };
      })
    );
  };

  const handleUpdateSplitAmount = (id: string, newAmount: number) => {
    setSplits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, amount: Math.max(0, newAmount) } : s))
    );
  };

  const handleAddSplitMode = () => {
    const existingModes = new Set(splits.map((s) => s.mode));
    const candidateModes: PaymentMode[] = ['UPI', 'CASH', 'CARD', 'NET_BANKING', 'CHEQUE'];
    const nextMode = candidateModes.find((m) => !existingModes.has(m)) || 'UPI';

    const remaining = Math.max(0, Number((finalGrandTotal - totalPaid).toFixed(2)));

    if (splits.length === 1 && splits[0].mode === 'CREDIT') {
      setSplits([
        { id: '1', mode: 'CASH', amount: remaining || finalGrandTotal },
        { id: String(Date.now()), mode: 'CREDIT', amount: 0 },
      ]);
      return;
    }

    setSplits([
      ...splits,
      {
        id: String(Date.now()),
        mode: nextMode,
        amount: remaining,
      },
    ]);
  };

  const handleRemoveSplit = (id: string) => {
    if (splits.length <= 1) return;
    setSplits((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSaveWithPayment = (andPrint = false) => {
    const splitNotes = formatSplitNotes(splits, balanceDue);
    const combinedNotes = [paymentRefNotes.trim(), splitNotes].filter(Boolean).join(' | ');

    const savedSplits: PaymentSplit[] = splits.map((s) => ({
      id: s.id,
      mode: s.mode,
      amount: s.mode === 'CREDIT' ? balanceDue : Number(s.amount) || 0,
    }));

    onConfirmPayment(
      {
        paymentMode: resolvedPaymentMode,
        paymentStatus,
        paidAmount: totalPaid,
        balanceAmount: balanceDue,
        paymentSplits: savedSplits,
        paymentNotes: combinedNotes || undefined,
      },
      andPrint
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
    >
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">payments</span>
            </div>
            <div>
              <h2 id="payment-modal-title" className="font-headline-sm text-sm sm:text-base font-bold text-on-surface">
                Payment Settlement
              </h2>
              <p className="text-[11px] text-on-surface-variant font-medium truncate max-w-[260px] sm:max-w-none">
                Invoice #{invoiceNumber} • {partyName || 'Cash Customer'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline cursor-pointer transition-colors"
            title="Close payment dialog"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
          {/* Total Amount Payable Banner */}
          <div className="bg-surface-container-low/80 border border-outline-variant/25 rounded-xl p-3 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                Total Amount Payable
              </span>
              <span className="font-tabular-data font-black text-xl text-secondary">
                {formatINR(finalGrandTotal)}
              </span>
            </div>

            {/* Live Payment Status Badge */}
            <div>
              {paymentStatus === 'PAID' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-secondary/15 text-secondary border border-secondary/30 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  <span>Paid Full</span>
                </span>
              )}
              {paymentStatus === 'PARTIAL' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">timelapse</span>
                  <span>Partial · Due: {formatINR(balanceDue)}</span>
                </span>
              )}
              {paymentStatus === 'UNPAID' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-error/15 text-error border border-error/30 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  <span>Unpaid (Credit)</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick 1-Tap Payment Tender Chips */}
          <div>
            <label className="text-[11px] font-bold text-on-surface-variant block mb-1.5 uppercase tracking-wider">
              Quick 1-Tap Tender
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {PAYMENT_MODES.map((pm) => {
                const isCurrentOnly =
                  splits.length === 1 &&
                  splits[0].mode === pm.value &&
                  (pm.value === 'CREDIT' ? true : splits[0].amount >= finalGrandTotal);
                return (
                  <button
                    key={pm.value}
                    type="button"
                    onClick={() => handleQuickTender(pm.value)}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all border cursor-pointer ${
                      isCurrentOnly
                        ? 'bg-secondary text-on-secondary border-secondary shadow-xs scale-102'
                        : 'bg-surface-container hover:bg-surface-container-high text-on-surface border-outline-variant/30'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{pm.icon}</span>
                    <span className="truncate w-full text-center leading-tight">{pm.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Split Payment Tender Rows */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
              <span className="font-bold text-xs text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">tune</span>
                Payment Tender Breakdown
              </span>
              <button
                type="button"
                onClick={handleAddSplitMode}
                className="text-[11px] font-bold text-secondary hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                <span>+ Add Tender</span>
              </button>
            </div>

            <div className="space-y-2">
              {splits.map((split, index) => (
                <div key={split.id} className="flex items-center gap-2">
                  {/* Mode Selector */}
                  <div className="relative flex-1 sm:max-w-[160px]">
                    <select
                      value={split.mode}
                      onChange={(e) => handleUpdateSplitMode(split.id, e.target.value as PaymentMode)}
                      className="w-full h-9 pl-2.5 pr-6 rounded-lg bg-surface-container-low text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-colors cursor-pointer appearance-none"
                    >
                      {PAYMENT_MODES.map((pm) => (
                        <option key={pm.value} value={pm.value}>
                          {pm.label}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined text-[16px] text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      arrow_drop_down
                    </span>
                  </div>

                  {/* Amount Input */}
                  {split.mode !== 'CREDIT' ? (
                    <div className="relative flex-1 flex items-center">
                      <span className="absolute left-2.5 text-xs font-semibold text-outline pointer-events-none">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={split.amount === 0 ? '' : split.amount}
                        onChange={(e) =>
                          handleUpdateSplitAmount(
                            split.id,
                            e.target.value === '' ? 0 : Number(e.target.value)
                          )
                        }
                        placeholder="0.00"
                        className="w-full h-9 pl-6 pr-2.5 rounded-lg bg-surface-container-low text-right font-tabular-data text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 h-9 px-3 rounded-lg bg-surface-container flex items-center justify-between border border-outline-variant/20">
                      <span className="text-[11px] text-outline">Balance Due (Udhaar)</span>
                      <span className="font-tabular-data font-bold text-xs text-error">
                        {formatINR(balanceDue)}
                      </span>
                    </div>
                  )}

                  {/* Delete button (if more than 1 tender) */}
                  {splits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSplit(split.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error/10 cursor-pointer transition-colors shrink-0"
                      title="Remove this tender"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Real-time Settlement Balance Breakdown */}
            <div className="pt-2 border-t border-outline-variant/15 flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span>Total Tendered:</span>
                <span className="font-tabular-data font-bold text-on-surface">{formatINR(totalPaid)}</span>
              </div>
              {balanceDue > 0 && (
                <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-bold">
                  <span>Remaining Balance Due:</span>
                  <span className="font-tabular-data">{formatINR(balanceDue)}</span>
                </div>
              )}
              {changeToReturn > 0 && (
                <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 font-bold">
                  <span>Change to Return to Customer:</span>
                  <span className="font-tabular-data">{formatINR(changeToReturn)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Notes / Transaction Reference */}
          <div>
            <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
              Payment Reference / Notes (Optional)
            </label>
            <input
              type="text"
              value={paymentRefNotes}
              onChange={(e) => setPaymentRefNotes(e.target.value)}
              placeholder="e.g. UPI Ref #, Cheque #, Transaction ID, Bank details..."
              className="w-full h-9 px-3 rounded-xl bg-surface-container-low text-xs text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-outline-variant/20 flex items-center justify-between gap-2 bg-surface-container-low/40">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-on-surface-variant font-bold text-xs hover:bg-surface-container cursor-pointer transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveWithPayment(true)}
              className="px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              title="Save with payment and open print dialog"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Save &amp; Print</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveWithPayment(false)}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/90 text-on-secondary font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>Confirm &amp; Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
