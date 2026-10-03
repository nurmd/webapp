import React, { useState } from 'react';
import { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

interface CashBankTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  accountBalances: Record<string, number>;
  onSaveTransfer: (txn: CashBankTransaction) => void;
  initialType?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
}

export const CashBankTransferModal: React.FC<CashBankTransferModalProps> = ({
  isOpen,
  onClose,
  accounts,
  accountBalances,
  onSaveTransfer,
  initialType = 'DEPOSIT',
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 20);

  const [transferType, setTransferType] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'>(initialType);

  const bankAccounts = accounts.filter((a) => a.accountType === 'BANK');
  const defaultBank = bankAccounts.find((b) => b.isDefault) || bankAccounts[0];

  const [fromAccountId, setFromAccountId] = useState<string>(
    initialType === 'DEPOSIT' ? 'ACC_CASH' : (defaultBank?.id || 'ACC_BANK_SBI')
  );
  const [toAccountId, setToAccountId] = useState<string>(
    initialType === 'DEPOSIT' ? (defaultBank?.id || 'ACC_BANK_SBI') : 'ACC_CASH'
  );

  const [amount, setAmount] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTypeChange = (type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER') => {
    setTransferType(type);
    setError(null);
    if (type === 'DEPOSIT') {
      setFromAccountId('ACC_CASH');
      setToAccountId(defaultBank?.id || '');
    } else if (type === 'WITHDRAWAL') {
      setFromAccountId(defaultBank?.id || '');
      setToAccountId('ACC_CASH');
    } else {
      // Transfer Bank -> Bank
      if (bankAccounts.length >= 2) {
        setFromAccountId(bankAccounts[0].id);
        setToAccountId(bankAccounts[1].id);
      } else {
        setFromAccountId(defaultBank?.id || '');
        setToAccountId(defaultBank?.id || '');
      }
    }
  };

  const fromBalance = accountBalances[fromAccountId] || 0;

  const handleApplyPreset = (val: number) => {
    setAmount(val.toString());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid transfer amount.');
      return;
    }
    if (fromAccountId === toAccountId) {
      setError('Source and destination accounts must be different.');
      return;
    }

    const newTxn: CashBankTransaction = {
      id: `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      txnNumber: `TRF-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
      date,
      type: transferType,
      fromAccountId,
      toAccountId,
      amount: numAmount,
      referenceNo: referenceNo.trim() || undefined,
      description:
        description.trim() ||
        (transferType === 'DEPOSIT'
          ? 'Cash Deposited to Bank'
          : transferType === 'WITHDRAWAL'
          ? 'Cash Withdrawn from Bank'
          : 'Inter-Bank Transfer'),
      createdAt: new Date().toISOString(),
    };

    onSaveTransfer(newTxn);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-on-surface/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-xl border border-outline-variant/30 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">Cash ↔ Bank Transfer</h3>
              <p className="text-[11px] text-on-surface-variant">Contra entry (Zero tax implication)</p>
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

        {/* Transfer Mode Selector */}
        <div className="p-3 bg-surface-container-low/50 border-b border-outline-variant/20">
          <div className="grid grid-cols-3 gap-1 bg-surface-container-high/60 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => handleTypeChange('DEPOSIT')}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                transferType === 'DEPOSIT'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
              <span>Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('WITHDRAWAL')}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                transferType === 'WITHDRAWAL'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">arrow_upward</span>
              <span>Withdraw</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('TRANSFER')}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                transferType === 'TRANSFER'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">sync_alt</span>
              <span>Bank ⇄ Bank</span>
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

          {/* From Account & To Account Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* From Account */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                From Account
              </label>
              {transferType === 'DEPOSIT' ? (
                <div className="px-3 py-2 bg-surface-container rounded-xl border border-outline-variant/30 text-xs font-semibold text-on-surface flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">payments</span>
                    <span>Cash in Hand</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                    {formatINR(fromBalance)}
                  </span>
                </div>
              ) : (
                <select
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  className="px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
                >
                  {transferType === 'WITHDRAWAL' ? (
                    bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.accountName} ({formatINR(accountBalances[b.id] || 0)})
                      </option>
                    ))
                  ) : (
                    accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} ({formatINR(accountBalances[a.id] || 0)})
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {/* To Account */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                To Account
              </label>
              {transferType === 'WITHDRAWAL' ? (
                <div className="px-3 py-2 bg-surface-container rounded-xl border border-outline-variant/30 text-xs font-semibold text-on-surface flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">payments</span>
                    <span>Cash in Hand</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                    {formatINR(accountBalances['ACC_CASH'] || 0)}
                  </span>
                </div>
              ) : (
                <select
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
                >
                  {transferType === 'DEPOSIT' ? (
                    bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.accountName} ({formatINR(accountBalances[b.id] || 0)})
                      </option>
                    ))
                  ) : (
                    accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} ({formatINR(accountBalances[a.id] || 0)})
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>
          </div>

          {/* Transfer Amount */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Amount (₹)
              </label>
              {fromBalance > 0 && (
                <button
                  type="button"
                  onClick={() => handleApplyPreset(fromBalance)}
                  className="text-[10px] font-bold text-secondary hover:underline cursor-pointer"
                >
                  Full Balance ({formatINR(fromBalance)})
                </button>
              )}
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
                Slip / Ref No.
              </label>
              <input
                type="text"
                placeholder="e.g. SLIP-1029"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
              />
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Notes / Narration
            </label>
            <input
              type="text"
              placeholder="e.g. Counter cash transferred to bank account"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              className="px-5 py-2 rounded-xl text-xs font-bold bg-secondary text-on-secondary shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              <span>Confirm Transfer</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
