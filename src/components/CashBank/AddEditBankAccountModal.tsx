import React, { useState } from 'react';
import { BankAccount } from '../../models/bankAccount.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

interface AddEditBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAccount: (account: BankAccount) => void;
  editingAccount?: BankAccount | null;
}

export const AddEditBankAccountModal: React.FC<AddEditBankAccountModalProps> = ({
  isOpen,
  onClose,
  onSaveAccount,
  editingAccount,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 20);

  const [accountName, setAccountName] = useState(editingAccount?.accountName || '');
  const [bankName, setBankName] = useState(editingAccount?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(editingAccount?.accountNumber || '');
  const [ifscCode, setIfscCode] = useState(editingAccount?.ifscCode || '');
  const [branchName, setBranchName] = useState(editingAccount?.branchName || '');
  const [upiId, setUpiId] = useState(editingAccount?.upiId || '');
  const [openingBalance, setOpeningBalance] = useState<string>(
    editingAccount?.openingBalance !== undefined ? editingAccount.openingBalance.toString() : '0'
  );
  const [isDefault, setIsDefault] = useState(editingAccount?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) {
      setError('Account name is required (e.g. HDFC Current A/C)');
      return;
    }

    const numBal = parseFloat(openingBalance) || 0;

    const account: BankAccount = {
      id: editingAccount?.id || `ACC_BANK_${Date.now()}`,
      accountName: accountName.trim(),
      accountType: 'BANK',
      bankName: bankName.trim() || undefined,
      accountNumber: accountNumber.trim() || undefined,
      ifscCode: ifscCode.trim().toUpperCase() || undefined,
      branchName: branchName.trim() || undefined,
      upiId: upiId.trim() || undefined,
      openingBalance: numBal,
      openingBalanceDate: editingAccount?.openingBalanceDate || new Date().toISOString().split('T')[0],
      isDefault,
      createdAt: editingAccount?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveAccount(account);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-on-surface/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-xl border border-outline-variant/30 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">account_balance</span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">
                {editingAccount ? 'Edit Bank Account' : 'Add Bank Account'}
              </h3>
              <p className="text-[11px] text-on-surface-variant">Configure bank details for invoicing & passbook</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3.5 overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Account Label */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Account Display Name *
            </label>
            <input
              type="text"
              placeholder="e.g. HDFC Bank - Current A/C"
              value={accountName}
              onChange={(e) => {
                setAccountName(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
              required
              autoFocus
            />
          </div>

          {/* Bank Name */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Bank Name
            </label>
            <input
              type="text"
              placeholder="e.g. HDFC Bank Ltd"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
            />
          </div>

          {/* Account Number & IFSC Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Account Number
              </label>
              <input
                type="text"
                placeholder="e.g. 50200012345678"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                IFSC Code
              </label>
              <input
                type="text"
                placeholder="e.g. HDFC0000123"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary font-mono uppercase"
              />
            </div>
          </div>

          {/* Branch & UPI ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Branch Name
              </label>
              <input
                type="text"
                placeholder="e.g. FC Road, Pune"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                UPI ID (VPA)
              </label>
              <input
                type="text"
                placeholder="e.g. merchant@hdfcbank"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface outline-none focus:border-secondary font-mono"
              />
            </div>
          </div>

          {/* Opening Balance */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Opening Balance (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">₹</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface outline-none focus:border-secondary font-tabular-data"
              />
            </div>
          </div>

          {/* Default Account Checkbox */}
          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded text-secondary accent-secondary"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-on-surface">Set as Primary / Default Bank Account</span>
              <span className="text-[11px] text-on-surface-variant">
                Used automatically for digital QR codes, invoice payment links, and settlements
              </span>
            </div>
          </label>

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
              <span>{editingAccount ? 'Update Account' : 'Save Account'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
