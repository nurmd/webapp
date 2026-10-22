import React, { useState, useEffect } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { db } from '../../services/db.ts';
import { createPaymentReceiptVoucher, createPaymentOutVoucher } from '../../core/accounting/ledger.ts';

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
    discount?: number
  ) => void;
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

      if (party && onRecordPartyPayment) {
        onRecordPartyPayment(party, payAmt, paymentMode, notes, isSale ? 'IN' : 'OUT', splits, discAmt);
      } else {
        // Direct Settlement fallback in local DB
        const docId = Date.now().toString().slice(-6);
        const today = new Date().toISOString().split('T')[0];

        if (isSale) {
          const inv = target.rawInvoice || db.getInvoices().find((i) => i.id === target.rawId);
          if (inv) {
            const currentPaid = inv.paidAmount || 0;
            const newPaid = Math.min(inv.grandTotal, currentPaid + totalSettled);
            const newBal = Math.max(0, inv.grandTotal - newPaid);
            const isFullPaid = newBal <= 0.01;

            const updatedSplits: PaymentSplit[] = (inv.paymentSplits?.filter((s) => s.mode !== 'CREDIT') || []).map((s) => ({ ...s }));
            if (updatedSplits.length === 0 && currentPaid > 0) {
              updatedSplits.push({
                id: `prev-${Date.now()}`,
                mode: (inv.paymentMode as any) || 'CASH',
                amount: currentPaid,
              });
            }
            if (splits && splits.length > 0) {
              splits.forEach((s) => updatedSplits.push({ ...s }));
            } else {
              const isCash = paymentMode === 'CASH';
              updatedSplits.push({
                id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                mode: (paymentMode as any) || 'CASH',
                amount: payAmt,
                accountId: isCash ? 'ACC_CASH' : defaultBank?.id,
                accountName: isCash ? 'Cash-in-hand' : defaultBank?.accountName,
              });
            }
            if (newBal > 0) {
              updatedSplits.push({
                id: `split-bal-${Date.now()}`,
                mode: 'CREDIT',
                amount: newBal,
              });
            }
            const nonCredit = updatedSplits.filter((s) => s.mode !== 'CREDIT');
            const resolvedMode = nonCredit.length > 1 ? 'SPLIT' : (nonCredit[0]?.mode || (paymentMode as any) || 'CASH');

            const updatedInv: Invoice = {
              ...inv,
              paidAmount: newPaid,
              balanceAmount: newBal,
              paymentStatus: isFullPaid ? 'PAID' : 'PARTIAL',
              paymentMode: resolvedMode,
              paymentSplits: updatedSplits,
              updatedAt: new Date().toISOString(),
            };
            db.saveInvoice(updatedInv);

            const voucher = createPaymentReceiptVoucher({
              receiptNumber: `RCPT-${docId}`,
              date: today,
              customerName: inv.partyName || 'Cash Customer',
              customerId: inv.partyId || 'ACC_CASH',
              amount: payAmt,
              discount: discAmt,
              paymentMode,
              bankAccountId: defaultBank?.id,
              bankAccountName: defaultBank?.accountName,
              paymentSplits: splits && splits.length > 0 ? splits : undefined,
              narration: notes || `Payment received for Bill #${inv.invoiceNumber}${discAmt > 0 ? ` (Discount: ${formatINR(discAmt)})` : ''}`,
            });
            db.saveVoucher(voucher);

            if (inv.partyId) {
              db.recalculatePartyBalance(inv.partyId);
            }
          }
        } else {
          const pur = target.rawPurchase || db.getPurchases().find((p) => p.id === target.rawId);
          if (pur) {
            const currentPaid = pur.paidAmount || 0;
            const newPaid = Math.min(pur.grandTotal, currentPaid + totalSettled);
            const newBal = Math.max(0, pur.grandTotal - newPaid);
            const isFullPaid = newBal <= 0.01;

            const updatedSplits: PaymentSplit[] = (pur.paymentSplits?.filter((s) => s.mode !== 'CREDIT') || []).map((s) => ({ ...s }));
            if (updatedSplits.length === 0 && currentPaid > 0) {
              updatedSplits.push({
                id: `prev-${Date.now()}`,
                mode: (pur.paymentMode as any) || 'CASH',
                amount: currentPaid,
              });
            }
            if (splits && splits.length > 0) {
              splits.forEach((s) => updatedSplits.push({ ...s }));
            } else {
              const isCash = paymentMode === 'CASH';
              updatedSplits.push({
                id: `pymt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                mode: (paymentMode as any) || 'CASH',
                amount: payAmt,
                accountId: isCash ? 'ACC_CASH' : defaultBank?.id,
                accountName: isCash ? 'Cash-in-hand' : defaultBank?.accountName,
              });
            }
            if (newBal > 0) {
              updatedSplits.push({
                id: `split-bal-${Date.now()}`,
                mode: 'CREDIT',
                amount: newBal,
              });
            }
            const nonCredit = updatedSplits.filter((s) => s.mode !== 'CREDIT');
            const resolvedMode = nonCredit.length > 1 ? 'SPLIT' : (nonCredit[0]?.mode || (paymentMode as any) || 'CASH');

            const updatedPur: PurchaseBill = {
              ...pur,
              paidAmount: newPaid,
              balanceAmount: newBal,
              paymentStatus: isFullPaid ? 'PAID' : 'PARTIAL',
              paymentMode: resolvedMode,
              paymentSplits: updatedSplits,
              updatedAt: new Date().toISOString(),
            };
            db.savePurchase(updatedPur);

            const voucher = createPaymentOutVoucher({
              voucherNumber: `PYMT-${docId}`,
              date: today,
              supplierName: pur.supplierName,
              supplierId: pur.supplierId || 'ACC_CASH',
              amount: payAmt,
              discount: discAmt,
              paymentMode,
              bankAccountId: defaultBank?.id,
              bankAccountName: defaultBank?.accountName,
              paymentSplits: splits && splits.length > 0 ? splits : undefined,
              narration: notes || `Payment made for Bill #${pur.billNumber}${discAmt > 0 ? ` (Discount: ${formatINR(discAmt)})` : ''}`,
            });
            db.saveVoucher(voucher);

            if (pur.supplierId) {
              db.recalculatePartyBalance(pur.supplierId);
            }
          }
        }
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

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold text-on-surface mb-1">
              Payment Amount (₹) <span className="text-error">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface font-tabular-data font-bold text-lg focus:outline-hidden focus:border-secondary transition-all"
              />
            </div>
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
          </div>

          {/* Discount Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-on-surface">
                {isSale ? 'Discount Allowed (₹)' : 'Discount Received (₹)'}
              </label>
              {parseFloat(discount) > 0 && (
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  Total Settled: {formatINR((parseFloat(amount) || 0) + (parseFloat(discount) || 0))}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface font-tabular-data font-bold text-sm focus:outline-hidden focus:border-secondary transition-all min-h-[36px]"
              />
            </div>
          </div>

          {/* Payment Mode Selection */}
          <div>
            <label className="block text-xs font-bold text-on-surface mb-1.5">
              Payment Mode
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {PAYMENT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode.value);
                    if (mode.value === 'SPLIT') {
                      const total = parseFloat(amount) || 0;
                      if (total > 0 && !splitCash && !splitUPI && !splitBank) {
                        if (paymentMode === 'CASH') setSplitCash(total.toString());
                        else if (paymentMode === 'BANK_TRANSFER') setSplitBank(total.toString());
                        else setSplitUPI(total.toString());
                      }
                    }
                  }}
                  className={`min-h-[48px] flex flex-col items-center justify-center p-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer active:scale-95 ${
                    paymentMode === mode.value
                      ? 'border-secondary bg-secondary/10 text-secondary shadow-xs scale-102'
                      : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:border-outline'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] mb-0.5">{mode.icon}</span>
                  <span className="truncate w-full text-center">{mode.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Split Tender Allocation Box when SPLIT is selected */}
          {paymentMode === 'SPLIT' && (() => {
            const targetAmt = parseFloat(amount) || 0;
            const c = parseFloat(splitCash) || 0;
            const u = parseFloat(splitUPI) || 0;
            const b = parseFloat(splitBank) || 0;
            const allocated = Number((c + u + b).toFixed(2));
            const remaining = targetAmt > 0 ? Number(Math.max(0, targetAmt - allocated).toFixed(2)) : 0;

            return (
              <div className="p-3 bg-surface-container-low/60 rounded-xl border border-secondary/30 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-on-surface flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-secondary">call_split</span>
                    <span>Split Breakdown</span>
                  </span>
                  <span
                    className={`font-bold ${
                      targetAmt > 0 && allocated === targetAmt
                        ? 'text-secondary'
                        : targetAmt > 0 && allocated > targetAmt
                        ? 'text-error'
                        : 'text-amber-600'
                    }`}
                  >
                    Allocated: {formatINR(allocated)} {targetAmt > 0 ? `/ ${formatINR(targetAmt)}` : ''}
                    {remaining > 0 && ` (${formatINR(remaining)} left)`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Cash */}
                  <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container border border-outline-variant/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px] text-emerald-600">payments</span>
                        Cash
                      </span>
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = (c + remaining).toFixed(2);
                            setSplitCash(parseFloat(next).toString());
                          }}
                          className="text-[10px] font-bold text-secondary hover:underline cursor-pointer"
                        >
                          + Fill
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitCash}
                      onChange={(e) => setSplitCash(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2 py-1 bg-surface-container-lowest rounded-md text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary outline-none"
                    />
                  </div>

                  {/* UPI */}
                  <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container border border-outline-variant/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px] text-sky-600">qr_code_scanner</span>
                        UPI
                      </span>
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = (u + remaining).toFixed(2);
                            setSplitUPI(parseFloat(next).toString());
                          }}
                          className="text-[10px] font-bold text-secondary hover:underline cursor-pointer"
                        >
                          + Fill
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitUPI}
                      onChange={(e) => setSplitUPI(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2 py-1 bg-surface-container-lowest rounded-md text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary outline-none"
                    />
                  </div>

                  {/* Bank */}
                  <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container border border-outline-variant/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px] text-indigo-600">account_balance</span>
                        Bank
                      </span>
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = (b + remaining).toFixed(2);
                            setSplitBank(parseFloat(next).toString());
                          }}
                          className="text-[10px] font-bold text-secondary hover:underline cursor-pointer"
                        >
                          + Fill
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitBank}
                      onChange={(e) => setSplitBank(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2 py-1 bg-surface-container-lowest rounded-md text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Payment Notes */}
          <div>
            <label className="block text-xs font-bold text-on-surface mb-1">
              Notes / Reference (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. UTR number, UPI transaction ID, Cheque number"
              className="w-full px-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-xs text-on-surface focus:outline-hidden focus:border-secondary transition-all"
            />
          </div>

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
