import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Expense, ExpenseCategory } from '../../models/expense.ts';
import { formatINR } from '../../core/utils/formatters.ts';

export interface ExpenseFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editingExpense: Expense | null;
  categories: ExpenseCategory[];
  isGstActive: boolean;
  onSave: (expense: Expense) => void;
}

const PAYMENT_MODES: Array<{ id: Expense['paymentMode']; label: string; icon: string }> = [
  { id: 'CASH', label: 'Cash', icon: 'payments' },
  { id: 'UPI', label: 'UPI', icon: 'qr_code_2' },
  { id: 'BANK_TRANSFER', label: 'Bank', icon: 'account_balance' },
  { id: 'CREDIT_CARD', label: 'Card', icon: 'credit_card' },
];

export const ExpenseFormSheet: React.FC<ExpenseFormSheetProps> = ({
  isOpen,
  onClose,
  editingExpense,
  categories,
  isGstActive,
  onSave,
}) => {
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const [amount, setAmount] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('General Operational');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<Expense['paymentMode']>('UPI');
  const [notes, setNotes] = useState('');

  // Tax & GST Fields
  const [gstRate, setGstRate] = useState<number>(18);
  const [isTaxInclusive, setIsTaxInclusive] = useState<boolean>(true);
  const [isInterState, setIsInterState] = useState<boolean>(false);
  const [itcEligible, setItcEligible] = useState<boolean>(true);

  // Vendor & Reference Fields
  const [vendorName, setVendorName] = useState('');
  const [vendorGstin, setVendorGstin] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');

  // Collapsible Sections
  const [isTaxSectionOpen, setIsTaxSectionOpen] = useState(false);
  const [isVendorSectionOpen, setIsVendorSectionOpen] = useState(false);

  // Validation feedback
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setHasSubmitted(false);

    if (editingExpense) {
      setAmount(editingExpense.amount);
      setTitle(editingExpense.title);
      setCategory(editingExpense.category);
      setDate(editingExpense.date || new Date().toISOString().split('T')[0]);
      setPaymentMode(editingExpense.paymentMode || 'UPI');
      setNotes(editingExpense.notes || '');

      const hasTax = (editingExpense.gstRate || 0) > 0 || (editingExpense.taxAmount || 0) > 0;
      setGstRate(editingExpense.gstRate || 0);
      setIsTaxInclusive(true);
      setIsInterState((editingExpense.igstAmount || 0) > 0);
      setItcEligible(editingExpense.itcEligible ?? true);
      setIsTaxSectionOpen(hasTax);

      const hasVendor = Boolean(
        editingExpense.vendorName || editingExpense.vendorGstin || editingExpense.voucherNumber
      );
      setVendorName(editingExpense.vendorName || '');
      setVendorGstin(editingExpense.vendorGstin || '');
      setVoucherNumber(editingExpense.voucherNumber || '');
      setIsVendorSectionOpen(hasVendor);
    } else {
      setAmount(0);
      setTitle('');
      setCategory('General Operational');
      setDate(new Date().toISOString().split('T')[0]);
      setPaymentMode('UPI');
      setNotes('');

      setGstRate(18);
      setIsTaxInclusive(true);
      setIsInterState(false);
      setItcEligible(true);
      setIsTaxSectionOpen(false);

      setVendorName('');
      setVendorGstin('');
      setVoucherNumber(`EXP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);
      setIsVendorSectionOpen(false);

      // Autofocus amount on create
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, editingExpense]);

  // Tax calculation
  const computedTax = useMemo(() => {
    const rate = isGstActive ? gstRate : 0;
    if (rate <= 0 || amount <= 0) {
      return {
        taxable: amount,
        tax: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: amount,
      };
    }

    let taxable = 0;
    let total = 0;

    if (isTaxInclusive) {
      total = amount;
      taxable = Math.round(((amount * 100) / (100 + rate)) * 100) / 100;
    } else {
      taxable = amount;
      total = Math.round((amount * (1 + rate / 100)) * 100) / 100;
    }

    const tax = Math.round((total - taxable) * 100) / 100;

    if (isInterState) {
      return {
        taxable,
        tax,
        cgst: 0,
        sgst: 0,
        igst: tax,
        total,
      };
    } else {
      const half = Math.round((tax / 2) * 100) / 100;
      return {
        taxable,
        tax,
        cgst: half,
        sgst: half,
        igst: 0,
        total,
      };
    }
  }, [amount, gstRate, isTaxInclusive, isInterState, isGstActive]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);

    if (!title.trim() || amount <= 0) {
      return;
    }

    const effectiveGstRate = isGstActive ? gstRate : 0;
    const finalAmount = isTaxInclusive ? amount : computedTax.total;

    const expensePayload: Expense = {
      id: editingExpense ? editingExpense.id : `EXP-${Date.now()}`,
      category,
      title: title.trim(),
      amount: Math.round(finalAmount * 100) / 100,
      taxableAmount: Math.round(computedTax.taxable * 100) / 100,
      gstRate: effectiveGstRate,
      taxAmount: Math.round(computedTax.tax * 100) / 100,
      cgstAmount: Math.round(computedTax.cgst * 100) / 100,
      sgstAmount: Math.round(computedTax.sgst * 100) / 100,
      igstAmount: Math.round(computedTax.igst * 100) / 100,
      date,
      paymentMode,
      vendorName: vendorName.trim() || undefined,
      vendorGstin: isGstActive ? (vendorGstin.trim().toUpperCase() || undefined) : undefined,
      voucherNumber: voucherNumber.trim() || undefined,
      itcEligible: isGstActive ? itcEligible : false,
      notes: notes.trim() || undefined,
      createdAt: editingExpense ? editingExpense.createdAt : new Date().toISOString(),
    };

    onSave(expensePayload);
    onClose();
  };

  const isAmountInvalid = hasSubmitted && amount <= 0;
  const isTitleInvalid = hasSubmitted && !title.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editingExpense ? 'Edit Expense Record' : 'Record Business Expense'}
      className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest text-on-surface rounded-t-3xl sm:rounded-2xl border border-outline-variant/30 w-full sm:max-w-lg max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-outline-variant/40 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* Sticky Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">
                {editingExpense ? 'edit_note' : 'receipt_long'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-on-surface">
                {editingExpense ? 'Edit Expense Record' : 'Record Business Expense'}
              </h3>
              <span className="text-[11px] text-on-surface-variant font-medium">
                {editingExpense ? 'Update expense details' : 'Log an operational or tax expense'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="expense-form" onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 flex-1">
          {/* 1. Amount (Prominent Hero Input) */}
          <div className="p-3.5 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Expense Amount *
            </label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-rose-700 dark:text-rose-400 select-none">₹</span>
              <input
                ref={amountInputRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-transparent text-2xl font-black font-tabular-data text-rose-700 dark:text-rose-400 placeholder:text-rose-300 dark:placeholder:text-rose-800 outline-none"
              />
            </div>
            {isAmountInvalid && (
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
                Please enter a valid expense amount greater than 0.
              </span>
            )}
          </div>

          {/* 2. Purpose / Title */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Expense Purpose / Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Shop Rent Oct, Courier Charges, Electricity Bill, Tea & Snacks"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-semibold"
            />
            {isTitleInvalid && (
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                Please enter an expense title.
              </span>
            )}
          </div>

          {/* 3. Category (Wrapping Chip Grid) */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Category *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    category === c
                      ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/20'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Date & Payment Mode Segmented Control */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Expense Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Payment Mode *
              </label>
              <div className="grid grid-cols-4 gap-1 p-0.5 bg-surface-container-low rounded-xl border border-outline-variant/20">
                {PAYMENT_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPaymentMode(mode.id)}
                    className={`py-2 px-1 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                      paymentMode === mode.id
                        ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">{mode.icon}</span>
                    <span className="text-[10px] leading-tight">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 5. Notes */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Notes / Internal Remarks
            </label>
            <textarea
              rows={2}
              placeholder="Optional internal remarks or bill breakdown..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none resize-none"
            />
          </div>

          {/* 6. Collapsible Tax & GST Section */}
          {isGstActive && (
            <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsTaxSectionOpen(!isTaxSectionOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left font-bold text-xs text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-secondary">percent</span>
                  <span>Tax &amp; GST Details</span>
                  {gstRate > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-bold">
                      {gstRate}% GST
                    </span>
                  )}
                </div>
                <span
                  className={`material-symbols-outlined text-[18px] transition-transform duration-200 text-on-surface-variant ${
                    isTaxSectionOpen ? 'rotate-180' : ''
                  }`}
                >
                  expand_more
                </span>
              </button>

              {isTaxSectionOpen && (
                <div className="p-4 pt-0 border-t border-outline-variant/15 space-y-3">
                  {/* GST Rate Chips */}
                  <div className="space-y-1.5 pt-3">
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      GST Rate
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[0, 5, 12, 18].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setGstRate(rate)}
                          className={`py-1.5 px-2 rounded-xl text-xs font-semibold text-center transition-all cursor-pointer ${
                            gstRate === rate
                              ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/20'
                          }`}
                        >
                          {rate === 0 ? '0% Nil' : `${rate}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {gstRate > 0 && (
                    <>
                      {/* Inclusive / Exclusive Toggle */}
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                          Tax Computation
                        </label>
                        <div className="grid grid-cols-2 gap-1.5 p-1 bg-surface-container rounded-xl border border-outline-variant/20">
                          <button
                            type="button"
                            onClick={() => setIsTaxInclusive(true)}
                            className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              isTaxInclusive
                                ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            Tax Inclusive
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsTaxInclusive(false)}
                            className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              !isTaxInclusive
                                ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            Tax Extra
                          </button>
                        </div>
                      </div>

                      {/* Checkboxes: IGST & ITC */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-xs">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isInterState}
                            onChange={(e) => setIsInterState(e.target.checked)}
                            className="rounded text-secondary accent-secondary"
                          />
                          <span className="font-medium text-on-surface">Inter-state (IGST)</span>
                        </label>

                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={itcEligible}
                            onChange={(e) => setItcEligible(e.target.checked)}
                            className="rounded text-secondary accent-secondary"
                          />
                          <span className="font-bold text-secondary">Claim ITC in GSTR-3B</span>
                        </label>
                      </div>

                      {/* Live Breakdown Preview */}
                      {amount > 0 && (
                        <div className="p-3 rounded-xl bg-surface-container/70 border border-outline-variant/15 text-xs space-y-1">
                          <div className="flex justify-between text-on-surface-variant">
                            <span>Taxable Base Value:</span>
                            <span className="font-bold font-tabular-data text-on-surface">
                              {formatINR(computedTax.taxable)}
                            </span>
                          </div>
                          <div className="flex justify-between text-on-surface-variant">
                            <span>
                              GST ({gstRate}% {isInterState ? 'IGST' : 'CGST+SGST'}):
                            </span>
                            <span className="font-bold font-tabular-data text-secondary">
                              {formatINR(computedTax.tax)}
                            </span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-outline-variant/15 font-bold text-on-surface">
                            <span>Total Expense Outflow:</span>
                            <span className="font-black font-tabular-data text-rose-700 dark:text-rose-400">
                              {formatINR(isTaxInclusive ? amount : computedTax.total)}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 7. Collapsible Vendor & Reference Section */}
          <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsVendorSectionOpen(!isVendorSectionOpen)}
              className="w-full px-4 py-3 flex items-center justify-between text-left font-bold text-xs text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-secondary">storefront</span>
                <span>Vendor &amp; Reference</span>
                {(vendorName || voucherNumber) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-bold">
                    Details Entered
                  </span>
                )}
              </div>
              <span
                className={`material-symbols-outlined text-[18px] transition-transform duration-200 text-on-surface-variant ${
                  isVendorSectionOpen ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </button>

            {isVendorSectionOpen && (
              <div className="p-4 pt-0 border-t border-outline-variant/15 space-y-3">
                <div className="pt-3 space-y-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Vendor / Payee Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Stationers, Landlord Name, Electric Supply"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-semibold"
                  />
                </div>

                {isGstActive && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Vendor GSTIN (15 chars)
                    </label>
                    <input
                      type="text"
                      maxLength={15}
                      placeholder="e.g. 27ABCDE1234F1Z5"
                      value={vendorGstin}
                      onChange={(e) => setVendorGstin(e.target.value)}
                      className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-mono uppercase"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Voucher / Receipt Reference #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EXP-2026-0042 or UTR-123456"
                    value={voucherNumber}
                    onChange={(e) => setVoucherNumber(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Sticky Footer */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-outline-variant/20 bg-surface-container-lowest pb-safe flex flex-col sm:flex-row items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl border border-outline-variant/40 text-on-surface font-bold text-xs hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="expense-form"
            className="w-full sm:w-auto min-h-[44px] px-6 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">check</span>
            <span>{editingExpense ? 'Update Expense' : 'Save Expense Voucher'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
