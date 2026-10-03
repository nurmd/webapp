import React, { useState } from 'react';
import { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

interface DirectCashBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  accountBalances: Record<string, number>;
  onSaveTxn: (txn: CashBankTransaction) => void;
  initialFlow?: 'ADD_MONEY' | 'REDUCE_MONEY';
  preselectedAccountId?: string;
}

export const DirectCashBankModal: React.FC<DirectCashBankModalProps> = ({
  isOpen,
  onClose,
  accounts,
  accountBalances,
  onSaveTxn,
  initialFlow = 'ADD_MONEY',
  preselectedAccountId,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 20);

  const [flow, setFlow] = useState<'ADD_MONEY' | 'REDUCE_MONEY'>(initialFlow);
  const [accountId, setAccountId] = useState<string>(
    preselectedAccountId || accounts[0]?.id || 'ACC_CASH'
  );
  const [amount, setAmount] = useState<string>('');
  const [reasonCategory, setReasonCategory] = useState<string>('Capital / Owner Investment');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentBal = accountBalances[accountId] || 0;

  const handleApplyPreset = (val: number) => {
    setAmount(val.toString());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    const newTxn: CashBankTransaction = {
      id: `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      txnNumber: `${flow === 'ADD_MONEY' ? 'IN' : 'OUT'}-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
      date,
      type: flow,
      fromAccountId: flow === 'REDUCE_MONEY' ? accountId : undefined,
      toAccountId: flow === 'ADD_MONEY' ? accountId : undefined,
      amount: numAmount,
      referenceNo: referenceNo.trim() || undefined,
      description: `${reasonCategory}${notes.trim() ? ` - ${notes.trim()}` : ''}`,
      createdAt: new Date().toISOString(),
    };

    onSaveTxn(newTxn);
    onClose();
  };

  const inCategories = [
    'Capital / Owner Investment',
    'Loan Received',
    'Refund / Cashback',
    'Direct Cash Inflow',
    'Other Income',
  ];

  const outCategories = [
    'Owner Drawings / Personal',
    'Bank Charges / Interest',
    'Petty Cash Expense',
    'Direct Cash Outflow',
    'Other Adjustment',
  ];

  const activeCategories = flow === 'ADD_MONEY' ? inCategories : outCategories;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-on-surface/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-xl border border-outline-variant/30 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                flow === 'ADD_MONEY' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {flow === 'ADD_MONEY' ? 'add_circle' : 'remove_circle'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">
                {flow === 'ADD_MONEY' ? 'Direct Money In' : 'Direct Money Out'}
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                {flow === 'ADD_MONEY' ? 'Add capital, loan, or direct inflow' : 'Record drawings, charges, or cash outflow'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* In / Out Switch */}
        <div className="p-3 bg-surface-container-low/50 border-b border-outline-variant/20">
          <div className="grid grid-cols-2 gap-1 bg-surface-container-high/60 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setFlow('ADD_MONEY');
                setReasonCategory(inCategories[0]);
                setError(null);
              }}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                flow === 'ADD_MONEY'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
              <span>Money In (+)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFlow('REDUCE_MONEY');
                setReasonCategory(outCategories[0]);
                setError(null);
              }}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                flow === 'REDUCE_MONEY'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
              <span>Money Out (-)</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3.5 overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Account Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              {flow === 'ADD_MONEY' ? 'Deposit To Account' : 'Deduct From Account'}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName} ({formatINR(accountBalances[a.id] || 0)})
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Amount (₹)
              </label>
              <span className="text-[11px] text-on-surface-variant font-medium">
                Current: <strong className="text-on-surface">{formatINR(currentBal)}</strong>
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">₹</span>
              <input
                type="number"
                step="0.01"
                min="1"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                className="w-full pl-8 pr-3 py-2.5 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-base font-bold text-on-surface outline-none focus:border-secondary font-tabular-data"
                required
                autoFocus
              />
            </div>

            {/* Quick Amount Chips */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {[500, 1000, 2000, 5000, 10000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface-variant text-[11px] font-semibold hover:bg-secondary/15 hover:text-secondary transition-colors cursor-pointer"
                >
                  +₹{preset}
                </button>
              ))}
            </div>
          </div>

          {/* Reason / Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Category / Reason
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
            >
              {activeCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Ref / Slip No.
              </label>
              <input
                type="text"
                placeholder="Optional"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Additional Details
            </label>
            <input
              type="text"
              placeholder="e.g. Cash added by partner for stock purchase"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-outline-variant/20 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 ${
                flow === 'ADD_MONEY'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-rose-600 text-white hover:bg-rose-700'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              <span>{flow === 'ADD_MONEY' ? 'Save Money In' : 'Save Money Out'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
