import React, { useState, useEffect } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { PaymentAllocation } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { db } from '../../services/db.ts';
import { PaymentEntryForm } from '../Common/PaymentEntryForm.tsx';

export interface DashboardPaymentTarget {
  type: 'SALE' | 'PURCHASE';
  rawId: string;
  docNumber: string;
  partyName: string;
  partyId?: string;
  balanceAmount: number;
  grandTotal: number;
  rawInvoice?: Invoice;
  rawPurchase?: PurchaseBill;
}

export interface DashboardRecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: DashboardPaymentTarget | null;
  parties: Party[];
  onRecordPartyPayment?: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[],
    discount?: number,
    bankAccountId?: string,
    allocations?: PaymentAllocation[],
    allocationMode?: 'MANUAL' | 'AUTO_FIFO' | 'UNALLOCATED' | 'SOURCE_DOCUMENT',
    paymentDate?: string
  ) => boolean | void;
  onRefresh?: () => void;
}

const PAYMENT_MODES: { value: string; label: string; icon: string }[] = [
  { value: 'UPI', label: 'UPI', icon: 'qr_code_scanner' },
  { value: 'CASH', label: 'Cash', icon: 'payments' },
  { value: 'BANK_TRANSFER', label: 'Bank', icon: 'account_balance' },
  { value: 'CARD', label: 'Card', icon: 'credit_card' },
  { value: 'CHEQUE', label: 'Cheque', icon: 'receipt_long' },
  { value: 'SPLIT', label: 'Split', icon: 'call_split' },
];

export const DashboardRecordPaymentModal: React.FC<DashboardRecordPaymentModalProps> = ({
  isOpen,
  onClose,
  target,
  parties,
  onRecordPartyPayment,
  onRefresh,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen && !!target, 25);

  const [amount, setAmount] = useState<string>('');
  const [discount, setDiscount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUPI, setSplitUPI] = useState<string>('');
  const [splitBank, setSplitBank] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (target) {
      setAmount(target.balanceAmount > 0 ? target.balanceAmount.toString() : target.grandTotal.toString());
      setDiscount('');
      setNotes(`Settlement for #${target.docNumber || ''}`);
      setValidationError(null);
      setSplitCash('');
      setSplitUPI('');
      setSplitBank('');
    }
  }, [target]);

  if (!isOpen || !target) return null;

  const isSale = target.type === 'SALE';
  const actionTitle = isSale ? 'Collect Customer Payment' : 'Pay Supplier Bill';
  const flowBadge = isSale ? 'Payment In (Receipt)' : 'Payment Out';

  const handleConfirm = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    let payAmt = parseFloat(amount);
    const discAmt = parseFloat(discount) || 0;
    let splits: PaymentSplit[] | undefined = undefined;
    const defaultBank = db.getBankAccounts().find((b) => b.isDefault && b.accountType === 'BANK') || db.getBankAccounts().find((b) => b.accountType === 'BANK');

    if (paymentMode === 'SPLIT') {
      const c = parseFloat(splitCash) || 0;
      const u = parseFloat(splitUPI) || 0;
      const b = parseFloat(splitBank) || 0;
      const totalSplit = Number((c + u + b).toFixed(2));
      if (totalSplit <= 0) {
        setValidationError('Please enter at least one split tender amount greater than zero.');
        return;
      }
      payAmt = totalSplit;
      splits = [
        ...(c > 0 ? [{ id: `s-cash-${Date.now()}`, mode: 'CASH' as const, amount: c, accountId: 'ACC_CASH', accountName: 'Cash-in-hand' }] : []),
        ...(u > 0 ? [{ id: `s-upi-${Date.now()}`, mode: 'UPI' as const, amount: u, accountId: defaultBank?.id, accountName: defaultBank?.accountName }] : []),
        ...(b > 0 ? [{ id: `s-bank-${Date.now()}`, mode: 'BANK' as const, amount: b, accountId: defaultBank?.id, accountName: defaultBank?.accountName }] : []),
      ];
    } else {
      if (isNaN(payAmt) || payAmt <= 0) {
        setValidationError('Please enter a valid payment amount greater than zero.');
        return;
      }
    }

    const totalSettled = Number((payAmt + discAmt).toFixed(2));
    const maxAllowed = (target.balanceAmount > 0 ? target.balanceAmount : target.grandTotal) || 0;
    if (maxAllowed > 0 && totalSettled > maxAllowed + 0.01) {
      if (discAmt > 0) {
        setValidationError(`Payment amount + discount (Total settlement ${formatINR(totalSettled)}) cannot exceed the pending balance of ${formatINR(maxAllowed)}.`);
      } else {
        setValidationError(`Payment amount cannot exceed the pending balance (${formatINR(maxAllowed)}).`);
      }
      return;
    }

    setValidationError(null);

    setIsSubmitting(true);
    try {
      const activeParties = parties && parties.length > 0 ? parties : db.getParties();
      const party = target.partyId
        ? activeParties.find((p) => p.id === target.partyId)
        : activeParties.find((p) => p.name.toLowerCase() === (target.partyName || '').toLowerCase());

      const today = new Date().toISOString().split('T')[0];
      const allocAmt = Number(Math.min(target.balanceAmount, totalSettled).toFixed(2));
      const allocation: PaymentAllocation = {
        documentType: isSale ? 'INVOICE' : 'PURCHASE',
        documentId: target.rawId,
        documentNumber: target.docNumber,
        amount: allocAmt,
        date: today,
      };

      if (!onRecordPartyPayment) {
        setValidationError('Payment recording handler is unavailable.');
        setIsSubmitting(false);
        return;
      }

      const resolvedParty: Party = party || {
        id: target.partyId || (isSale ? 'ACC_CASH' : 'ACC_CASH'),
        name: target.partyName || (isSale ? 'Cash Customer' : 'Cash Supplier'),
        type: isSale ? 'CUSTOMER' : 'SUPPLIER',
        phone: '',
        stateCode: '00',
        billingAddress: '',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = onRecordPartyPayment(
        resolvedParty,
        payAmt,
        paymentMode,
        notes,
        isSale ? 'IN' : 'OUT',
        splits,
        discAmt,
        defaultBank?.id,
        allocAmt > 0 ? [allocation] : [],
        'MANUAL',
        today
      );

      if (res === false) {
        return;
      }

      if (onRefresh) {
        onRefresh();
      }

      onClose();
    } catch (err: any) {
      setValidationError(`Payment recording failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 p-3.5 sm:p-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isSale
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isSale ? 'arrow_downward' : 'arrow_upward'}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-on-surface truncate">{actionTitle}</h3>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                  isSale
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                }`}
              >
                {flowBadge}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
            title="Close"
            aria-label="Close payment modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleConfirm} className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
          {/* Bill Summary Banner */}
          <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex items-center justify-between">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">
                {isSale ? 'Customer' : 'Supplier'}
              </span>
              <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                {target.partyName}
              </span>
              <span className="font-mono text-[11px] text-on-surface-variant mt-0.5">
                Ref: #{target.docNumber}
              </span>
            </div>
            <div className="flex flex-col items-end flex-shrink-0">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Balance Due</span>
              <span className="font-tabular-data text-base font-black text-rose-600 dark:text-rose-400">
                {formatINR(target.balanceAmount)}
              </span>
            </div>
          </div>

          {/* Shared Payment Entry Form */}
          <PaymentEntryForm
            layout="stacked"
            showDate={false}
            amount={amount}
            onChangeAmount={setAmount}
            paymentType={isSale ? 'IN' : 'OUT'}
            discount={discount}
            onChangeDiscount={setDiscount}
            mode={paymentMode}
            onChangeMode={setPaymentMode}
            modeStyle="chips"
            modeOptions={PAYMENT_MODES}
            splitCash={splitCash}
            onChangeSplitCash={setSplitCash}
            splitUPI={splitUPI}
            onChangeSplitUPI={setSplitUPI}
            splitBank={splitBank}
            onChangeSplitBank={setSplitBank}
            notes={notes}
            onChangeNotes={setNotes}
            notesLabel="Notes / Reference (Optional)"
            notesPlaceholder="e.g. UTR number, UPI transaction ID, Cheque number"
            amountLabel={
              <>
                Payment Amount (₹) <span className="text-error">*</span>
              </>
            }
            amountSlotBottom={
              <>
                {target.balanceAmount > 0 && parseFloat(amount) !== target.balanceAmount && (
                  <button
                    type="button"
                    onClick={() => setAmount(target.balanceAmount.toString())}
                    className="mt-1 min-h-[36px] py-1 text-[11px] font-bold text-secondary hover:underline cursor-pointer inline-flex items-center"
                  >
                    Set to full balance ({formatINR(target.balanceAmount)})
                  </button>
                )}

                {validationError && (
                  <div className="mt-2 p-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    <span>{validationError}</span>
                  </div>
                )}
              </>
            }
          />

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className={`min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                isSale
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-rose-600 text-white hover:bg-rose-700'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              <span>{isSubmitting ? 'Recording...' : 'Confirm Payment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
