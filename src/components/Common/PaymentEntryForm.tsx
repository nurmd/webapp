import React from 'react';
import { formatINR } from '../../core/utils/formatters.ts';

export interface BankAccountOption {
  id: string;
  accountName: string;
  accountNumber?: string;
  accountType?: string;
}

export interface PaymentEntryFormProps {
  amount: string;
  onChangeAmount: (val: string) => void;
  date?: string;
  onChangeDate?: (val: string) => void;
  paymentType?: 'IN' | 'OUT';
  discount?: string;
  onChangeDiscount?: (val: string) => void;
  mode?: string;
  onChangeMode?: (val: string) => void;
  modeStyle?: 'select' | 'chips';
  modeOptions?: Array<{ value: string; label: string; icon?: string }>;
  bankAccountId?: string;
  onChangeBankAccountId?: (val: string) => void;
  bankAccounts?: BankAccountOption[];
  splitCash?: string;
  onChangeSplitCash?: (val: string) => void;
  splitUPI?: string;
  onChangeSplitUPI?: (val: string) => void;
  splitBank?: string;
  onChangeSplitBank?: (val: string) => void;
  notes?: string;
  onChangeNotes?: (val: string) => void;
  notesLabel?: string;
  notesPlaceholder?: string;
  amountLabel?: React.ReactNode;
  amountLabelRight?: React.ReactNode;
  amountSlotBottom?: React.ReactNode;
  autoFocusAmount?: boolean;
  minAmount?: string | number;
  requiredAmount?: boolean;
  showDate?: boolean;
  showDiscount?: boolean;
  showMode?: boolean;
  showNotes?: boolean;
  showSettlementSummary?: boolean;
  layout?: 'compact-grid' | 'stacked';
}

export const PaymentEntryForm: React.FC<PaymentEntryFormProps> = ({
  amount,
  onChangeAmount,
  date,
  onChangeDate,
  paymentType = 'IN',
  discount = '',
  onChangeDiscount,
  mode = 'UPI',
  onChangeMode,
  modeStyle = 'select',
  modeOptions,
  bankAccountId,
  onChangeBankAccountId,
  bankAccounts = [],
  splitCash = '',
  onChangeSplitCash,
  splitUPI = '',
  onChangeSplitUPI,
  splitBank = '',
  onChangeSplitBank,
  notes = '',
  onChangeNotes,
  notesLabel = 'Notes / Remarks',
  notesPlaceholder = 'e.g. Cleared via Cheque / UPI Reference / Cash Settlement',
  amountLabel = 'Amount (₹) *',
  amountLabelRight,
  amountSlotBottom,
  autoFocusAmount = false,
  minAmount,
  requiredAmount = true,
  showDate = true,
  showDiscount = true,
  showMode = true,
  showNotes = true,
  showSettlementSummary = true,
  layout = 'compact-grid',
}) => {
  const numPayAmount = parseFloat(amount) || 0;
  const numDiscount = parseFloat(discount) || 0;
  const totalSettled = Number((numPayAmount + numDiscount).toFixed(2));

  const targetSplit = parseFloat(amount) || 0;
  const c = parseFloat(splitCash) || 0;
  const u = parseFloat(splitUPI) || 0;
  const b = parseFloat(splitBank) || 0;
  const allocated = Number((c + u + b).toFixed(2));
  const remaining = targetSplit > 0 ? Number(Math.max(0, targetSplit - allocated).toFixed(2)) : 0;

  const defaultSelectOptions: Array<{ value: string; label: string; icon?: string }> = [
    { value: 'UPI', label: 'UPI' },
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK', label: 'Bank' },
    { value: 'SPLIT', label: 'Split Tender' },
  ];

  const defaultChipOptions: Array<{ value: string; label: string; icon?: string }> = [
    { value: 'UPI', label: 'UPI', icon: 'qr_code_scanner' },
    { value: 'CASH', label: 'Cash', icon: 'payments' },
    { value: 'BANK_TRANSFER', label: 'Bank', icon: 'account_balance' },
    { value: 'CARD', label: 'Card', icon: 'credit_card' },
    { value: 'CHEQUE', label: 'Cheque', icon: 'receipt_long' },
    { value: 'SPLIT', label: 'Split', icon: 'call_split' },
  ];

  const resolvedModeOptions =
    modeOptions || (modeStyle === 'chips' ? defaultChipOptions : defaultSelectOptions);

  const handleModeChange = (newMode: string) => {
    if (!onChangeMode) return;
    onChangeMode(newMode);
    if (newMode === 'SPLIT' && onChangeSplitCash && onChangeSplitUPI && onChangeSplitBank) {
      const total = parseFloat(amount) || 0;
      if (total > 0 && !splitCash && !splitUPI && !splitBank) {
        if (mode === 'CASH') onChangeSplitCash(total.toString());
        else if (mode === 'BANK' || mode === 'BANK_TRANSFER') onChangeSplitBank(total.toString());
        else onChangeSplitUPI(total.toString());
      }
    }
  };

  const isBankMode = mode === 'BANK' || mode === 'BANK_TRANSFER';

  return (
    <div className="flex flex-col gap-2.5">
      {/* Date, Amount & Discount Inputs */}
      {layout === 'compact-grid' ? (
        <div
          className={`grid gap-2 ${
            showDate && onChangeDate && showDiscount && onChangeDiscount
              ? 'grid-cols-1 sm:grid-cols-3'
              : showDate && onChangeDate
              ? 'grid-cols-1 sm:grid-cols-2'
              : 'grid-cols-1'
          }`}
        >
          {showDate && onChangeDate && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-on-surface-variant">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => onChangeDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px]"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-on-surface-variant">{amountLabel}</label>
              {amountLabelRight}
            </div>
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-xs font-bold text-on-surface-variant">₹</span>
              <input
                type="number"
                step="0.01"
                min={minAmount}
                required={requiredAmount}
                autoFocus={autoFocusAmount}
                placeholder="0.00"
                value={amount}
                onChange={(e) => onChangeAmount(e.target.value)}
                className="w-full pl-6 pr-2 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px]"
              />
            </div>
            {amountSlotBottom}
          </div>

          {showDiscount && onChangeDiscount && (
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
                  value={discount}
                  onChange={(e) => onChangeDiscount(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px]"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Stacked Layout */
        <div className="flex flex-col gap-3">
          {showDate && onChangeDate && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => onChangeDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface text-xs font-medium focus:outline-hidden focus:border-secondary"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-on-surface">{amountLabel}</label>
              {amountLabelRight}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min={minAmount || (requiredAmount ? '0.01' : '0')}
                required={requiredAmount}
                autoFocus={autoFocusAmount}
                value={amount}
                onChange={(e) => onChangeAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface font-tabular-data font-bold text-lg focus:outline-hidden focus:border-secondary transition-all"
              />
            </div>
            {amountSlotBottom}
          </div>

          {showDiscount && onChangeDiscount && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-on-surface">
                  {paymentType === 'IN' ? 'Discount Allowed (₹)' : 'Discount Received (₹)'}
                </label>
                {numDiscount > 0 && (
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                    Total Settled: {formatINR(totalSettled)}
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
                  onChange={(e) => onChangeDiscount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface font-tabular-data font-bold text-sm focus:outline-hidden focus:border-secondary transition-all min-h-[36px]"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settlement summary banner */}
      {showSettlementSummary && totalSettled > 0 && numDiscount > 0 && (
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">account_balance_wallet</span>
            <span>Total Settled:</span>
          </span>
          <span>
            {formatINR(totalSettled)}
            {` (₹${numPayAmount.toFixed(2)} + ₹${numDiscount.toFixed(2)} discount)`}
          </span>
        </div>
      )}

      {/* Payment Mode & Bank Account */}
      {showMode && onChangeMode && (
        <>
          {modeStyle === 'chips' ? (
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1.5">
                Payment Mode
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {resolvedModeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleModeChange(opt.value)}
                    className={`min-h-[48px] flex flex-col items-center justify-center p-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer active:scale-95 ${
                      mode === opt.value
                        ? 'border-secondary bg-secondary/10 text-secondary shadow-xs scale-102'
                        : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:border-outline'
                    }`}
                  >
                    {opt.icon && (
                      <span className="material-symbols-outlined text-[18px] mb-0.5">{opt.icon}</span>
                    )}
                    <span className="truncate w-full text-center">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={`grid gap-2 ${isBankMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="flex flex-col gap-1">
                <label htmlFor="payment-mode-select" className="text-[10px] font-bold text-on-surface-variant">
                  Payment Mode
                </label>
                <div className="relative flex items-center">
                  <select
                    id="payment-mode-select"
                    value={mode}
                    onChange={(e) => handleModeChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px] cursor-pointer"
                  >
                    {resolvedModeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isBankMode && onChangeBankAccountId && (
                <div className="flex flex-col gap-1 animate-in fade-in">
                  <label htmlFor="bank-account-select" className="text-[10px] font-bold text-on-surface-variant truncate">
                    {paymentType === 'IN' ? 'Deposit to Bank' : 'Pay from Bank'}
                  </label>
                  <div className="relative flex items-center">
                    <select
                      id="bank-account-select"
                      value={bankAccountId}
                      onChange={(e) => onChangeBankAccountId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px] cursor-pointer"
                    >
                      {bankAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountName} {acc.accountNumber ? `(•••${acc.accountNumber.slice(-4)})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Split Tender Allocation Box */}
      {mode === 'SPLIT' && onChangeSplitCash && onChangeSplitUPI && onChangeSplitBank && (
        <div className="p-2.5 bg-surface rounded-xl border border-secondary/20 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-on-surface flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-secondary">call_split</span>
              <span>Split Breakdown</span>
            </span>
            <span
              className={`font-bold ${
                targetSplit > 0 && allocated === targetSplit
                  ? 'text-secondary'
                  : targetSplit > 0 && allocated > targetSplit
                  ? 'text-error'
                  : 'text-amber-600'
              }`}
            >
              Allocated: {formatINR(allocated)} {targetSplit > 0 ? `/ ${formatINR(targetSplit)}` : ''}
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
                      onChangeSplitCash(parseFloat(next).toString());
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
                  onChange={(e) => onChangeSplitCash(e.target.value)}
                  className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                />
              </div>
            </div>

            {/* UPI */}
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[12px] text-purple-600">qr_code_scanner</span>
                  UPI
                </span>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = (u + remaining).toFixed(2);
                      onChangeSplitUPI(parseFloat(next).toString());
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
                  onChange={(e) => onChangeSplitUPI(e.target.value)}
                  className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                />
              </div>
            </div>

            {/* Bank */}
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[12px] text-blue-600">account_balance</span>
                  Bank / Cheque
                </span>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = (b + remaining).toFixed(2);
                      onChangeSplitBank(parseFloat(next).toString());
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
                  onChange={(e) => onChangeSplitBank(e.target.value)}
                  className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                />
              </div>
              {bankAccounts.length > 1 && onChangeBankAccountId && (
                <select
                  value={bankAccountId}
                  onChange={(e) => onChangeBankAccountId(e.target.value)}
                  className="mt-1 w-full px-1.5 py-0.5 bg-surface rounded text-[10px] font-medium text-on-surface border border-outline-variant/20 focus:outline-none cursor-pointer"
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notes / Remarks */}
      {showNotes && onChangeNotes && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-on-surface-variant">{notesLabel}</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => onChangeNotes(e.target.value)}
            placeholder={notesPlaceholder}
            className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-medium text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px]"
          />
        </div>
      )}
    </div>
  );
};
