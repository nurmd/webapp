import React, { useState } from 'react';
import { Expense, ExpenseCategory } from '../../models/expense.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';

interface ExpensesViewProps {
  expenses: Expense[];
  onSaveExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'Rent & Utilities',
  'Electricity & Water',
  'Transport & Logistics',
  'Salaries & Wages',
  'Packaging & Courier',
  'Repairs & Maintenance',
  'Tea, Coffee & Refreshments',
  'Marketing & Advertising',
  'Software & Telecom',
  'General Operational',
];

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  onSaveExpense,
  onDeleteExpense,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  // New Expense form state
  const [category, setCategory] = useState<ExpenseCategory>('General Operational');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(18);
  const [paymentMode, setPaymentMode] = useState<Expense['paymentMode']>('UPI');
  const [vendorName, setVendorName] = useState('');
  const [vendorGstin, setVendorGstin] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [itcEligible, setItcEligible] = useState(true);
  const [notes, setNotes] = useState('');

  // Calculations
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalItcClaimable = expenses
    .filter((e) => e.itcEligible)
    .reduce((sum, e) => sum + e.taxAmount, 0);
  const totalCashOutflow = expenses
    .filter((e) => e.paymentMode === 'CASH')
    .reduce((sum, e) => sum + e.amount, 0);

  const filtered = expenses.filter((e) => {
    const matchesCat = selectedCategory === 'ALL' || e.category === selectedCategory;
    const matchesSearch =
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.vendorName && e.vendorName.toLowerCase().includes(search.toLowerCase())) ||
      (e.voucherNumber && e.voucherNumber.toLowerCase().includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) {
      alert('Please enter a valid expense title and amount.');
      return;
    }

    const taxable = gstRate > 0 ? (amount * 100) / (100 + gstRate) : amount;
    const tax = amount - taxable;
    const halfTax = tax / 2;

    const newExpense: Expense = {
      id: 'EXP-' + Date.now(),
      category,
      title: title.trim(),
      amount,
      taxableAmount: Math.round(taxable * 100) / 100,
      gstRate,
      taxAmount: Math.round(tax * 100) / 100,
      cgstAmount: Math.round(halfTax * 100) / 100,
      sgstAmount: Math.round(halfTax * 100) / 100,
      igstAmount: 0,
      date: new Date().toISOString().split('T')[0],
      paymentMode,
      vendorName: vendorName.trim() || undefined,
      vendorGstin: vendorGstin.trim().toUpperCase() || undefined,
      voucherNumber: voucherNumber.trim() || undefined,
      itcEligible,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    onSaveExpense(newExpense);
    setIsModalOpen(false);
    setTitle('');
    setAmount(0);
    setVendorName('');
    setVendorGstin('');
    setVoucherNumber('');
    setNotes('');
  };

  return (
    <div className="flex flex-col w-full pb-24 max-w-4xl mx-auto px-margin-mobile py-4 gap-space-sm">
      {/* Top Banner: Metrics Bento */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-xs">
        <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-outline-variant/20 flex items-center justify-between">
          <div>
            <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider block">
              Total Expenses
            </span>
            <span className="font-currency-display text-[22px] font-extrabold text-on-surface block mt-0.5">
              {formatINR(totalExpenses)}
            </span>
            <span className="text-[11px] text-on-surface-variant">
              {expenses.length} vouchers logged
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-error-container/40 text-error flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">trending_down</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-outline-variant/20 flex items-center justify-between">
          <div>
            <span className="font-label-sm text-[11px] text-secondary uppercase tracking-wider block font-semibold">
              Eligible ITC (GSTR-3B)
            </span>
            <span className="font-currency-display text-[22px] font-extrabold text-secondary block mt-0.5">
              {formatINR(totalItcClaimable)}
            </span>
            <span className="text-[11px] text-secondary font-medium">
              Tax credit claimable
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-secondary-container/40 text-on-secondary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">verified</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-outline-variant/20 flex items-center justify-between">
          <div>
            <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider block">
              Cash Drawer Outflow
            </span>
            <span className="font-currency-display text-[22px] font-extrabold text-on-surface block mt-0.5">
              {formatINR(totalCashOutflow)}
            </span>
            <span className="text-[11px] text-on-surface-variant">
              Direct cash paid
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-container-high text-on-surface-variant flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">payments</span>
          </div>
        </div>
      </div>

      {/* Action Strip: Record Expense & Search */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/30 px-3 py-1.5 shadow-sm">
          <span className="material-symbols-outlined text-outline text-[18px] mr-2">search</span>
          <input
            type="text"
            placeholder="Search expenses by title, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-on-surface placeholder:text-outline outline-none"
          />
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 bg-secondary text-on-secondary px-4 py-2 rounded-xl font-label-md text-sm font-bold shadow-sm hover:bg-secondary/90 transition-all active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>Record Expense</span>
        </button>
      </div>

      {/* Category Pills Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
            selectedCategory === 'ALL'
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
          }`}
        >
          All ({expenses.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = expenses.filter((e) => e.category === cat).length;
          if (count === 0 && selectedCategory !== cat) return null;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Expense Cards Feed */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6 shadow-sm">
            <span className="material-symbols-outlined text-[40px] text-outline block mb-1">receipt_long</span>
            <p className="text-sm font-medium">No expenses logged yet</p>
            <p className="text-xs text-outline mt-0.5">Click "Record Expense" to track rent, tea, utilities, or freight</p>
          </div>
        ) : (
          filtered.map((exp) => (
            <div
              key={exp.id}
              className="bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between gap-3 hover:border-secondary/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-label-md text-sm font-bold text-on-surface truncate">
                    {exp.title}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-low font-semibold text-on-surface-variant">
                    {exp.category}
                  </span>
                  {exp.itcEligible && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-semibold">
                      ITC: {formatINR(exp.taxAmount)}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-on-surface-variant flex items-center gap-2 mt-1 flex-wrap">
                  <span>📅 {formatDate(exp.date)}</span>
                  <span>💳 {exp.paymentMode}</span>
                  {exp.vendorName && <span>🏢 {exp.vendorName}</span>}
                  {exp.voucherNumber && <span># {exp.voucherNumber}</span>}
                </div>
              </div>

              <div className="text-right flex-shrink-0 flex items-center gap-3">
                <div>
                  <span className="font-currency-display text-base font-bold text-on-surface block">
                    {formatINR(exp.amount)}
                  </span>
                  <span className="text-[10px] text-on-surface-variant block">
                    {exp.gstRate > 0 ? `${exp.gstRate}% GST incl.` : 'No GST'}
                  </span>
                </div>

                <button
                  onClick={() => onDeleteExpense(exp.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error-container/20 transition-colors"
                  title="Delete voucher"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Record Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-error-container/40 text-error flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                </div>
                <h3 className="font-headline-sm text-base font-bold text-on-surface">
                  Record Business Expense
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreate} className="overflow-y-auto p-4 flex flex-col gap-3 flex-1">
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Expense Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-medium"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Title / Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shop Rent Oct, Delivery Courier, Electricity"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Total Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="0.00"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    GST Tax Rate (%)
                  </label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(parseFloat(e.target.value))}
                    className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
                  >
                    <option value={0}>0% (Exempt / Nil)</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST</option>
                    <option value={28}>28% GST</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-semibold text-secondary"
                  >
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="CASH">Cash Drawer</option>
                    <option value="NET_BANKING">Bank Transfer / NEFT</option>
                    <option value="CARD">Debit / Credit Card</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Voucher / Bill No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. REC-102"
                    value={voucherNumber}
                    onChange={(e) => setVoucherNumber(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Vendor Name & GSTIN (Optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Vendor Name"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Vendor GSTIN (15 digits)"
                    value={vendorGstin}
                    onChange={(e) => setVendorGstin(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded-xl">
                <input
                  type="checkbox"
                  id="itcEligible"
                  checked={itcEligible}
                  onChange={(e) => setItcEligible(e.target.checked)}
                  className="w-4 h-4 rounded text-secondary accent-secondary"
                />
                <label htmlFor="itcEligible" className="text-xs text-on-surface font-medium cursor-pointer">
                  Eligible for Input Tax Credit (ITC claimable in GSTR-3B)
                </label>
              </div>

              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-sm hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 bg-secondary text-on-secondary font-label-md text-sm font-bold px-5 py-2.5 rounded-xl shadow-md hover:bg-secondary/90 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  <span>Save Expense</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
