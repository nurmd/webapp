import React, { useState, useMemo, useEffect } from 'react';
import { Party } from '../../models/party.ts';
import { PaymentSplit } from '../../models/invoice.ts';
import { BankAccount } from '../../models/bankAccount.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { db } from '../../services/db.ts';

export interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party;
  liveNetBalance: number;
  isCustomer: boolean;
  bankAccounts?: BankAccount[];
  onRecordPayment: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[],
    discount?: number,
    bankAccountId?: string
  ) => void;
  onRefresh?: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  party,
  liveNetBalance: _liveNetBalance,
  isCustomer,
  bankAccounts,
  onRecordPayment,
  onRefresh,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 20);

  const [paymentType, setPaymentType] = useState<'IN' | 'OUT'>(isCustomer ? 'IN' : 'OUT');
  const [paymentAmount, setPaymentAmount] = useState<string>(
    party.currentBalance !== 0 ? Math.abs(party.currentBalance).toString() : ''
  );
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUPI, setSplitUPI] = useState<string>('');
  const [splitBank, setSplitBank] = useState<string>('');
  const [paymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes] = useState<string>('');

  const availableBankAccounts = useMemo(() => {
    const all = (bankAccounts && bankAccounts.length > 0 ? bankAccounts : db.getBankAccounts()) || [];
    const banks = all.filter((a) => a.accountType === 'BANK');
    if (banks.length > 0) return banks;
    return [
      {
        id: 'ACC_BANK',
        accountName: 'Primary Bank Account',
        accountType: 'BANK' as const,
        openingBalance: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];
  }, [bankAccounts]);

  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(() => {
    const all = (bankAccounts && bankAccounts.length > 0 ? bankAccounts : db.getBankAccounts()) || [];
    const banks = all.filter((a) => a.accountType === 'BANK');
    const def = banks.find((a) => a.isDefault) || banks[0];
    return def?.id || 'ACC_BANK';
  });

  useEffect(() => {
    if (availableBankAccounts.length > 0 && !availableBankAccounts.some((a) => a.id === selectedBankAccountId)) {
      const def = availableBankAccounts.find((a) => a.isDefault) || availableBankAccounts[0];
      if (def) setSelectedBankAccountId(def.id);
    }
  }, [availableBankAccounts, selectedBankAccountId]);

  if (!isOpen) return null;

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let amt = parseFloat(paymentAmount);
    const disc = parseFloat(discountAmount) || 0;
    let splits: PaymentSplit[] | undefined = undefined;

    if (paymentMode === 'SPLIT') {
      const c = parseFloat(splitCash) || 0;
      const u = parseFloat(splitUPI) || 0;
      const b = parseFloat(splitBank) || 0;
      const totalSplit = Number((c + u + b).toFixed(2));

      if (totalSplit <= 0) {
        alert('Please enter at least one split tender amount (Cash, UPI, or Bank).');
        return;
      }
      amt = totalSplit;
      splits = [
        ...(c > 0 ? [{ id: 's-cash', mode: 'CASH' as const, amount: c }] : []),
        ...(u > 0 ? [{ id: 's-upi', mode: 'UPI' as const, amount: u }] : []),
        ...(b > 0 ? [{ id: 's-bank', mode: 'BANK' as const, amount: b }] : []),
      ];
    }

    if (!amt || amt <= 0) return;

    let splitDesc = '';
    if (splits && splits.length > 0) {
      splitDesc = splits.map((s) => `${s.mode}: ₹${s.amount.toFixed(2)}`).join(', ');
    }

    const selectedBank = availableBankAccounts.find((a) => a.id === selectedBankAccountId) || availableBankAccounts[0];
    const bankDesc = paymentMode === 'BANK' && selectedBank ? `Bank: ${selectedBank.accountName}` : '';

    const fullNotes = [
      paymentRef ? `Ref: ${paymentRef}` : '',
      bankDesc,
      splitDesc ? `Split (${splitDesc})` : '',
      disc > 0 ? `Discount: ₹${disc.toFixed(2)}` : '',
      paymentNotes,
    ].filter(Boolean).join(' • ');

    onRecordPayment(
      party,
      amt,
      paymentMode,
      fullNotes || `${paymentType === 'IN' ? 'Payment In' : 'Payment Out'} of ${formatINR(amt)} on ${paymentDate}${disc > 0 ? ` (Discount: ${formatINR(disc)})` : ''}`,
      paymentType,
      splits,
      disc,
      paymentMode === 'BANK' || (paymentMode === 'SPLIT' && (splits?.some((s) => s.mode === 'BANK') ?? false))
        ? selectedBankAccountId
        : undefined
    );
    onClose();
    setDiscountAmount('');
    setSplitCash('');
    setSplitUPI('');
    setSplitBank('');
    onRefresh?.();
  };

  return (
    <form
      onSubmit={handlePaymentSubmit}
      className="p-3 bg-surface-container rounded-2xl border border-secondary/30 flex flex-col gap-2.5 animate-in fade-in shadow-xs"
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-bold flex items-center gap-1 ${
            paymentType === 'IN' ? 'text-secondary' : 'text-amber-600 dark:text-amber-400'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {paymentType === 'IN' ? 'call_received' : 'call_made'}
          </span>
          <span>{paymentType === 'IN' ? 'Record Payment In' : 'Record Payment Out'}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface p-0.5 cursor-pointer"
          title="Close"
          aria-label="Close payment modal"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {/* In vs Out Toggle */}
      <div className="grid grid-cols-2 gap-1 p-0.5 bg-surface rounded-xl border border-outline-variant/20 text-xs">
        <button
          type="button"
          onClick={() => setPaymentType('IN')}
          className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            paymentType === 'IN'
              ? 'bg-secondary text-on-secondary shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">call_received</span>
          <span>Payment In</span>
        </button>
        <button
          type="button"
          onClick={() => setPaymentType('OUT')}
          className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            paymentType === 'OUT'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">call_made</span>
          <span>Payment Out</span>
        </button>
      </div>

      {/* Amount & Discount Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-on-surface-variant">Amount (₹)</label>
          <div className="relative flex items-center">
            <span className="absolute left-2.5 text-xs font-bold text-on-surface-variant">₹</span>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-on-surface-variant">
            {paymentType === 'IN' ? 'Discount Allowed (₹)' : 'Discount Received (₹)'}
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-2.5 text-xs font-bold text-on-surface-variant">₹</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px]"
            />
          </div>
        </div>
      </div>

      {/* Settlement summary banner when discount is present */}
      {parseFloat(discountAmount) > 0 && (
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">discount</span>
            <span>Total Settled against Balance:</span>
          </span>
          <span>{formatINR((parseFloat(paymentAmount) || 0) + (parseFloat(discountAmount) || 0))}</span>
        </div>
      )}

      {/* Payment Mode & Bank Account (Side-by-Side Dropdowns to Save Space) */}
      <div className={`grid gap-2 ${paymentMode === 'BANK' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="payment-mode-select" className="text-[10px] font-bold text-on-surface-variant">
            Payment Mode
          </label>
          <div className="relative flex items-center">
            <select
              id="payment-mode-select"
              value={paymentMode}
              onChange={(e) => {
                const m = e.target.value;
                setPaymentMode(m);
                if (m === 'SPLIT') {
                  const total = parseFloat(paymentAmount) || 0;
                  if (total > 0 && !splitCash && !splitUPI && !splitBank) {
                    if (paymentMode === 'CASH') setSplitCash(total.toString());
                    else if (paymentMode === 'BANK') setSplitBank(total.toString());
                    else setSplitUPI(total.toString());
                  }
                }
              }}
              className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px] cursor-pointer"
            >
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="SPLIT">Split Tender</option>
            </select>
          </div>
        </div>

        {paymentMode === 'BANK' && (
          <div className="flex flex-col gap-1 animate-in fade-in">
            <label htmlFor="bank-account-select" className="text-[10px] font-bold text-on-surface-variant truncate">
              {paymentType === 'IN' ? 'Deposit to Bank' : 'Pay from Bank'}
            </label>
            <div className="relative flex items-center">
              <select
                id="bank-account-select"
                value={selectedBankAccountId}
                onChange={(e) => setSelectedBankAccountId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px] cursor-pointer"
              >
                {availableBankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountName} {acc.accountNumber ? `(•••${acc.accountNumber.slice(-4)})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Split Tender Allocation Box when SPLIT is selected */}
      {paymentMode === 'SPLIT' && (() => {
        const target = parseFloat(paymentAmount) || 0;
        const c = parseFloat(splitCash) || 0;
        const u = parseFloat(splitUPI) || 0;
        const b = parseFloat(splitBank) || 0;
        const allocated = Number((c + u + b).toFixed(2));
        const remaining = target > 0 ? Number(Math.max(0, target - allocated).toFixed(2)) : 0;

        return (
          <div className="p-2.5 bg-surface rounded-xl border border-secondary/20 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-on-surface flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-secondary">call_split</span>
                <span>Split Breakdown</span>
              </span>
              <span className={`font-bold ${
                target > 0 && allocated === target
                  ? 'text-secondary'
                  : target > 0 && allocated > target
                  ? 'text-error'
                  : 'text-amber-600'
              }`}>
                Allocated: {formatINR(allocated)} {target > 0 ? `/ ${formatINR(target)}` : ''}
                {remaining > 0 && ` (${formatINR(remaining)} left)`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Cash */}
              <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px] text-emerald-600">payments</span>
                    Cash
                  </span>
                  {remaining > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = (c + remaining).toFixed(2);
                        setSplitCash(parseFloat(next).toString());
                      }}
                      className="text-[9px] font-bold text-secondary hover:underline cursor-pointer"
                    >
                      + Fill
                    </button>
                  )}
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-1.5 text-[10px] text-on-surface-variant font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={splitCash}
                    onChange={(e) => setSplitCash(e.target.value)}
                    className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* UPI */}
              <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px] text-blue-600">qr_code_2</span>
                    UPI
                  </span>
                  {remaining > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = (u + remaining).toFixed(2);
                        setSplitUPI(parseFloat(next).toString());
                      }}
                      className="text-[9px] font-bold text-secondary hover:underline cursor-pointer"
                    >
                      + Fill
                    </button>
                  )}
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-1.5 text-[10px] text-on-surface-variant font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={splitUPI}
                    onChange={(e) => setSplitUPI(e.target.value)}
                    className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* Bank */}
              <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px] text-purple-600">account_balance</span>
                    Bank / Cheque
                  </span>
                  {remaining > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = (b + remaining).toFixed(2);
                        setSplitBank(parseFloat(next).toString());
                      }}
                      className="text-[9px] font-bold text-secondary hover:underline cursor-pointer"
                    >
                      + Fill
                    </button>
                  )}
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-1.5 text-[10px] text-on-surface-variant font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={splitBank}
                    onChange={(e) => setSplitBank(e.target.value)}
                    className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                  />
                </div>
                {availableBankAccounts.length > 1 && (
                  <select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                    className="mt-1 w-full px-1.5 py-0.5 bg-surface rounded text-[10px] font-medium text-on-surface border border-outline-variant/20 focus:outline-none cursor-pointer"
                  >
                    {availableBankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Note & Save */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Reference / Note"
          value={paymentRef}
          onChange={(e) => setPaymentRef(e.target.value)}
          className="flex-1 px-2.5 py-1.5 bg-surface rounded-xl text-xs text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none"
        />
        <button
          type="submit"
          className={`px-4 py-1.5 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 cursor-pointer whitespace-nowrap ${
            paymentType === 'IN' ? 'bg-secondary' : 'bg-amber-600'
          }`}
        >
          Save {paymentType === 'IN' ? 'In' : 'Out'}
        </button>
      </div>
    </form>
  );
};
