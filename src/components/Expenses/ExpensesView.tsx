import React, { useState, useMemo } from 'react';
import { Expense, ExpenseCategory } from '../../models/expense.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { printExpenseVoucher } from '../../core/utils/expenseVoucherPrinter.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { db } from '../../services/db.ts';
import { safeOpenExternalUrl } from '../../core/utils/upiAndShare.ts';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
} from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';

export interface ExpensesViewProps {
  expenses: Expense[];
  onSaveExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

export const CATEGORIES: ExpenseCategory[] = [
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

export type ExpenseSortOption = 'NEWEST' | 'OLDEST' | 'AMOUNT_HIGH' | 'AMOUNT_LOW' | 'TITLE_AZ';

export const EXPENSE_SORT_LABELS: Record<ExpenseSortOption, string> = {
  NEWEST: 'Newest Date First',
  OLDEST: 'Oldest Date First',
  AMOUNT_HIGH: 'Highest Amount First',
  AMOUNT_LOW: 'Lowest Amount First',
  TITLE_AZ: 'Title (A to Z)',
};

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  onSaveExpense,
  onDeleteExpense,
}) => {
  const company = useMemo(() => db.getCompany(), []);
  const bankAccounts = useMemo(() => db.getBankAccounts(), []);
  const isGstActive = company.isGstEnabled !== false;

  // View States
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ExpenseSortOption>('NEWEST');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Date Filtering
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  // Modal States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Form State
  const [category, setCategory] = useState<ExpenseCategory>('General Operational');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [gstRate, setGstRate] = useState<number>(18);
  const [isTaxInclusive, setIsTaxInclusive] = useState<boolean>(true);
  const [isInterState, setIsInterState] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<Expense['paymentMode']>('UPI');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(bankAccounts[0]?.id || '');
  const [vendorName, setVendorName] = useState('');
  const [vendorGstin, setVendorGstin] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [itcEligible, setItcEligible] = useState(true);
  const [notes, setNotes] = useState('');

  // Back navigation handling
  useBackNavigation(() => {
    if (isDateModalOpen) {
      setIsDateModalOpen(false);
      return true;
    }
    if (isSortDropdownOpen) {
      setIsSortDropdownOpen(false);
      return true;
    }
    if (viewingExpense !== null) {
      setViewingExpense(null);
      return true;
    }
    if (isFormModalOpen) {
      setIsFormModalOpen(false);
      return true;
    }
    if (deletingExpenseId !== null) {
      setDeletingExpenseId(null);
      return true;
    }
    return false;
  }, isDateModalOpen || isSortDropdownOpen || isFormModalOpen || viewingExpense !== null || deletingExpenseId !== null, 20);

  // Active Date Bounds
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  // 1. Date Filter
  const dateFilteredExpenses = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return expenses;
    return expenses.filter((e) => isDateInRange(e.date, dateRange.start, dateRange.end));
  }, [expenses, dateRange]);

  // Financial Metrics dynamically calculated on active date period
  const periodTotalExpenses = dateFilteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const periodTotalTaxable = dateFilteredExpenses.reduce((sum, e) => sum + (e.taxableAmount || 0), 0);
  const periodTotalTax = dateFilteredExpenses.reduce((sum, e) => sum + (e.taxAmount || 0), 0);
  const periodItcClaimable = dateFilteredExpenses
    .filter((e) => e.itcEligible)
    .reduce((sum, e) => sum + (e.taxAmount || 0), 0);
  const periodCashOutflow = dateFilteredExpenses
    .filter((e) => e.paymentMode === 'CASH')
    .reduce((sum, e) => sum + e.amount, 0);
  const periodBankOutflow = dateFilteredExpenses
    .filter((e) => e.paymentMode !== 'CASH')
    .reduce((sum, e) => sum + e.amount, 0);

  // 2. Search & Category / Payment Mode Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dateFilteredExpenses.filter((e) => {
      const matchesCat = selectedCategory === 'ALL' || e.category === selectedCategory;
      const matchesMode = selectedPaymentMode === 'ALL' || e.paymentMode === selectedPaymentMode;
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        (e.vendorName && e.vendorName.toLowerCase().includes(q)) ||
        (e.vendorGstin && e.vendorGstin.toLowerCase().includes(q)) ||
        (e.voucherNumber && e.voucherNumber.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        e.amount.toString().includes(q);

      return matchesCat && matchesMode && matchesSearch;
    });
  }, [dateFilteredExpenses, selectedCategory, selectedPaymentMode, search]);

  // 3. Sorting
  const sortedExpenses = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'NEWEST': {
          const tA = new Date(a.date).getTime() || 0;
          const tB = new Date(b.date).getTime() || 0;
          if (tB !== tA) return tB - tA;
          return (b.id || '').localeCompare(a.id || '');
        }
        case 'OLDEST': {
          const tA = new Date(a.date).getTime() || 0;
          const tB = new Date(b.date).getTime() || 0;
          if (tA !== tB) return tA - tB;
          return (a.id || '').localeCompare(b.id || '');
        }
        case 'AMOUNT_HIGH':
          return b.amount - a.amount;
        case 'AMOUNT_LOW':
          return a.amount - b.amount;
        case 'TITLE_AZ':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });
  }, [filtered, sortBy]);

  // Tax computation helper
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

  // Open Form for Create
  const handleOpenCreate = () => {
    setEditingExpense(null);
    setCategory('General Operational');
    setTitle('');
    setAmount(0);
    setDate(new Date().toISOString().split('T')[0]);
    setGstRate(18);
    setIsTaxInclusive(true);
    setIsInterState(false);
    setPaymentMode('UPI');
    setSelectedBankAccountId(bankAccounts[0]?.id || '');
    setVendorName('');
    setVendorGstin('');
    setVoucherNumber(`EXP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);
    setItcEligible(true);
    setNotes('');
    setIsFormModalOpen(true);
  };

  // Open Form for Edit
  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setCategory(exp.category);
    setTitle(exp.title);
    setAmount(exp.amount);
    setDate(exp.date || new Date().toISOString().split('T')[0]);
    setGstRate(exp.gstRate || 0);
    setIsTaxInclusive(true);
    setIsInterState((exp.igstAmount || 0) > 0);
    setPaymentMode(exp.paymentMode || 'UPI');
    setVendorName(exp.vendorName || '');
    setVendorGstin(exp.vendorGstin || '');
    setVoucherNumber(exp.voucherNumber || '');
    setItcEligible(exp.itcEligible ?? true);
    setNotes(exp.notes || '');
    setIsFormModalOpen(true);
  };

  // Submit Save/Update
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) {
      alert('Please enter a valid expense title and amount.');
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

    onSaveExpense(expensePayload);
    setIsFormModalOpen(false);
    setEditingExpense(null);

    // If viewing this expense in details, update view
    if (viewingExpense && viewingExpense.id === expensePayload.id) {
      setViewingExpense(expensePayload);
    }
  };

  // Share WhatsApp
  const handleShareWhatsApp = (exp: Expense) => {
    const text =
      `*Expense Voucher - ${company.tradeName || company.businessName}*\n` +
      `--------------------------------\n` +
      `*Expense:* ${exp.title}\n` +
      `*Category:* ${exp.category}\n` +
      `*Date:* ${formatDate(exp.date)}\n` +
      `*Amount:* ${formatINR(exp.amount)}\n` +
      `*Payment Mode:* ${exp.paymentMode}\n` +
      (exp.vendorName ? `*Vendor:* ${exp.vendorName}\n` : '') +
      (exp.vendorGstin ? `*Vendor GSTIN:* ${exp.vendorGstin}\n` : '') +
      (exp.voucherNumber ? `*Voucher No:* ${exp.voucherNumber}\n` : '') +
      (exp.taxAmount > 0 ? `*Tax:* ${formatINR(exp.taxAmount)} (${exp.gstRate}% GST)\n` : '') +
      (exp.notes ? `*Notes:* ${exp.notes}\n` : '') +
      `--------------------------------\n` +
      `Recorded in GST Billing App`;

    safeOpenExternalUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  // Print voucher
  const handlePrint = (exp: Expense) => {
    printExpenseVoucher(company, exp);
  };

  // Export CSV
  const handleExportCsv = () => {
    if (sortedExpenses.length === 0) return;
    const headers = [
      'Voucher No',
      'Date',
      'Expense Title',
      'Category',
      'Payment Mode',
      'Vendor Name',
      'Vendor GSTIN',
      'Taxable Amount',
      'GST Rate (%)',
      'CGST',
      'SGST',
      'IGST',
      'Total Tax',
      'Total Amount',
      'ITC Eligible',
      'Notes',
    ];

    const rows = sortedExpenses.map((e) => [
      `"${e.voucherNumber || e.id}"`,
      `"${e.date}"`,
      `"${e.title.replace(/"/g, '""')}"`,
      `"${e.category}"`,
      `"${e.paymentMode}"`,
      `"${(e.vendorName || '').replace(/"/g, '""')}"`,
      `"${e.vendorGstin || ''}"`,
      (e.taxableAmount || e.amount).toFixed(2),
      e.gstRate || 0,
      (e.cgstAmount || 0).toFixed(2),
      (e.sgstAmount || 0).toFixed(2),
      (e.igstAmount || 0).toFixed(2),
      (e.taxAmount || 0).toFixed(2),
      e.amount.toFixed(2),
      e.itcEligible ? 'YES' : 'NO',
      `"${(e.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Expense_Register_${dateRange.label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deletingTarget = deletingExpenseId ? expenses.find((e) => e.id === deletingExpenseId) : null;

  return (
    <div className="flex flex-col w-full pb-28 max-w-7xl mx-auto px-margin-mobile md:px-6 py-3 gap-space-sm">
      {/* 1. Header, Metrics & Fast Actions Strip */}
      <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 shadow-xs border border-outline-variant/20 flex flex-col gap-3">
        {/* Row 1: Title, Active Range Badge & Top Action Buttons */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">wallet</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-bold text-base sm:text-lg text-on-surface">
                  Expense Register
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-low font-bold text-on-surface-variant">
                  {filtered.length} of {expenses.length}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant">
                Business overheads, salaries, rent, petty cash &amp; GSTR-3B ITC
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Date Preset Selector */}
            <button
              type="button"
              onClick={() => setIsDateModalOpen(true)}
              className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95"
              title="Change date filter range"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">calendar_today</span>
              <span className="truncate max-w-[130px] sm:max-w-[180px]">{dateRange.label}</span>
              <span className="material-symbols-outlined text-[14px] text-outline">arrow_drop_down</span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95 flex items-center gap-1"
              title="Export filtered expenses as CSV"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Record Expense Button */}
            <button
              type="button"
              onClick={handleOpenCreate}
              className="min-h-[40px] px-3.5 sm:px-4 py-1.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5 hover:bg-secondary/90"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Record Expense</span>
            </button>
          </div>
        </div>

        {/* Row 2: Financial KPI Bento for Active Date Period */}
        <div className={`grid grid-cols-2 ${isGstActive ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2 pt-1 border-t border-outline-variant/15`}>
          <div className="bg-surface-container-low/70 rounded-xl p-2.5 flex flex-col justify-between border border-outline-variant/10">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
              Total Expenses
            </span>
            <div className="font-tabular-data text-sm sm:text-base font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
              {formatINR(periodTotalExpenses)}
            </div>
            <span className="text-[10px] text-on-surface-variant truncate">
              {dateFilteredExpenses.length} vouchers logged
            </span>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-2.5 flex flex-col justify-between border border-outline-variant/10">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
              Cash Drawer Outflow
            </span>
            <div className="font-tabular-data text-sm sm:text-base font-extrabold text-on-surface mt-0.5">
              {formatINR(periodCashOutflow)}
            </div>
            <span className="text-[10px] text-on-surface-variant truncate">
              Direct cash paid
            </span>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-2.5 flex flex-col justify-between border border-outline-variant/10">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
              Bank / UPI Outflow
            </span>
            <div className="font-tabular-data text-sm sm:text-base font-extrabold text-on-surface mt-0.5">
              {formatINR(periodBankOutflow)}
            </div>
            <span className="text-[10px] text-on-surface-variant truncate">
              Digital / Net Banking
            </span>
          </div>

          {isGstActive && (
            <div className="bg-surface-container-low/70 rounded-xl p-2.5 flex flex-col justify-between border border-outline-variant/10">
              <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">
                Claimable ITC (GSTR-3B)
              </span>
              <div className="font-tabular-data text-sm sm:text-base font-extrabold text-secondary mt-0.5">
                {formatINR(periodItcClaimable)}
              </div>
              <span className="text-[10px] text-secondary truncate">
                Tax Credit: {formatINR(periodTotalTax)} total tax
              </span>
            </div>
          )}
        </div>

        {/* Row 3: Live Search + Sort Selector */}
        <div className="flex items-center gap-1.5 pt-1">
          <div className="relative flex-1 min-w-[140px]">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search by title, vendor, voucher #, notes, amount..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-7 bg-surface-container-low/70 text-on-surface text-xs rounded-xl shadow-xs border border-outline-variant/25 placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer"
                title="Clear search"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Sort Selector Dropdown Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              className="h-8 flex items-center gap-1 px-2.5 rounded-xl text-[11px] font-bold bg-surface-container-low text-on-surface-variant border border-outline-variant/25 hover:bg-surface-container cursor-pointer transition-all shadow-xs"
              title={`Sort: ${EXPENSE_SORT_LABELS[sortBy]}`}
              aria-label={`Sort: ${EXPENSE_SORT_LABELS[sortBy]}`}
            >
              <span className="material-symbols-outlined text-[15px] text-secondary">sort</span>
              <span className="hidden sm:inline">{EXPENSE_SORT_LABELS[sortBy]}</span>
              <span className="material-symbols-outlined text-[13px] text-outline">arrow_drop_down</span>
            </button>

            {isSortDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 py-1 overflow-hidden animate-fade-in">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-outline border-b border-outline-variant/15">
                    Sort Expenses
                  </div>
                  {(Object.keys(EXPENSE_SORT_LABELS) as ExpenseSortOption[]).map((key) => {
                    const isSelected = sortBy === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSortBy(key);
                          setIsSortDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between hover:bg-surface-container-low cursor-pointer transition-colors ${
                          isSelected ? 'text-secondary font-bold bg-secondary/5' : 'text-on-surface'
                        }`}
                      >
                        <span>{EXPENSE_SORT_LABELS[key]}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[15px] text-secondary">
                            check
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 4: Filter Pills Bar (Category & Payment Mode) */}
        <div className="flex flex-col gap-1.5 pt-0.5">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === 'ALL'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span>All Categories</span>
              <span className="text-[10px] opacity-80">({dateFilteredExpenses.length})</span>
            </button>

            {CATEGORIES.map((cat) => {
              const count = dateFilteredExpenses.filter((e) => e.category === cat).length;
              if (count === 0 && selectedCategory !== cat) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    selectedCategory === cat
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>{cat}</span>
                  <span className="text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Payment Mode Pills */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[11px] font-bold text-on-surface-variant">
            <span className="text-[10px] uppercase font-bold text-outline mr-1">Mode:</span>
            {(['ALL', 'UPI', 'CASH', 'BANK_TRANSFER', 'CREDIT_CARD'] as const).map((m) => {
              const label =
                m === 'ALL'
                  ? 'All Modes'
                  : m === 'UPI'
                  ? 'UPI'
                  : m === 'CASH'
                  ? 'Cash'
                  : m === 'BANK_TRANSFER'
                  ? 'Bank / NEFT'
                  : 'Card';
              const isSelected = selectedPaymentMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedPaymentMode(m)}
                  className={`h-6 px-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-surface-container-highest text-on-surface font-black'
                      : 'hover:text-on-surface'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Expense Cards Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5">
        {sortedExpenses.length === 0 ? (
          <div className="md:col-span-2 py-12 px-4 text-center flex flex-col items-center justify-center gap-2 bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-outline">
              <span className="material-symbols-outlined text-[24px]">wallet</span>
            </div>
            <span className="text-sm font-bold text-on-surface">No expenses found</span>
            <span className="text-xs text-on-surface-variant max-w-[320px]">
              {expenses.length === 0
                ? 'Record your first overhead expense, rent, tea, salaries, or courier charge.'
                : search
                ? `No matching expenses found for "${search}". Try a different term or clear filters.`
                : 'No expense records found for the selected date range or category.'}
            </span>
            <div className="flex items-center gap-2 mt-1">
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="min-h-[40px] px-3.5 rounded-xl bg-surface-container-low text-secondary font-bold text-xs cursor-pointer hover:bg-surface-container active:scale-95"
                >
                  Clear Search
                </button>
              )}
              {selectedCategory !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className="min-h-[40px] px-3.5 rounded-xl bg-surface-container-low text-secondary font-bold text-xs cursor-pointer hover:bg-surface-container active:scale-95"
                >
                  Reset Category
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenCreate}
                className="min-h-[40px] px-4 rounded-xl bg-secondary text-on-secondary font-bold text-xs cursor-pointer shadow-xs active:scale-95"
              >
                + Record Expense
              </button>
            </div>
          </div>
        ) : (
          sortedExpenses.map((exp) => (
            <div
              key={exp.id}
              onClick={() => setViewingExpense(exp)}
              className="bg-surface-container-lowest p-3 sm:p-3.5 rounded-2xl border border-outline-variant/25 shadow-xs flex flex-col justify-between gap-2.5 hover:border-secondary/40 active:scale-[0.99] transition-all cursor-pointer group"
            >
              {/* Line 1: Category Tag & Date (left) | Amount (right) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {exp.category}
                  </span>
                  <span className="text-[11px] text-on-surface-variant font-medium">
                    {formatDate(exp.date)}
                  </span>
                </div>

                <span className="font-tabular-data text-sm sm:text-base font-black text-rose-600 dark:text-rose-400 whitespace-nowrap shrink-0">
                  - {formatINR(exp.amount)}
                </span>
              </div>

              {/* Line 2: Title / Purpose */}
              <div className="min-w-0">
                <h3 className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-secondary transition-colors">
                  {exp.title}
                </h3>
                {exp.vendorName && (
                  <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                    Vendor: <span className="font-semibold text-on-surface">{exp.vendorName}</span>
                    {exp.vendorGstin && <span className="font-mono text-[10px] ml-1.5">({exp.vendorGstin})</span>}
                  </p>
                )}
              </div>

              {/* Line 3: Meta & Quick Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/15 text-[11px] text-on-surface-variant">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded-md bg-surface-container-low font-bold text-[10px]">
                    {exp.paymentMode}
                  </span>

                  {exp.voucherNumber && (
                    <span className="font-mono text-[10px] opacity-80">#{exp.voucherNumber}</span>
                  )}

                  {isGstActive && exp.itcEligible && (exp.taxAmount || 0) > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-secondary/10 text-secondary font-bold text-[10px]">
                      ITC: {formatINR(exp.taxAmount)}
                    </span>
                  )}
                </div>

                {/* Inline Fast Action Buttons */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Share button */}
                  <button
                    type="button"
                    onClick={() => handleShareWhatsApp(exp)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                    title="Share voucher via WhatsApp"
                  >
                    <span className="material-symbols-outlined text-[16px]">share</span>
                  </button>

                  {/* Print button */}
                  <button
                    type="button"
                    onClick={() => handlePrint(exp)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
                    title="Print payment voucher"
                  >
                    <span className="material-symbols-outlined text-[16px]">print</span>
                  </button>

                  {/* Edit button */}
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(exp)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-secondary hover:bg-secondary/10 transition-colors cursor-pointer"
                    title="Edit expense"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => setDeletingExpenseId(exp.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error-container/20 transition-colors cursor-pointer"
                    title="Delete expense"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 3. Record / Edit Expense Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    {editingExpense ? 'edit_note' : 'receipt_long'}
                  </span>
                </div>
                <h3 className="font-bold text-sm sm:text-base text-on-surface">
                  {editingExpense ? 'Edit Expense Record' : 'Record Business Expense'}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveForm} className="overflow-y-auto p-4 sm:p-5 flex flex-col gap-3.5 flex-1">
              {/* Category & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Expense Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-semibold"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
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
              </div>

              {/* Title / Description */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Expense Purpose / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shop Rent Oct, Speed Post Courier, Office Electricity, Tea & Snacks"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-semibold"
                />
              </div>

              {/* Amount, Inclusive Toggle & GST Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-black font-tabular-data text-rose-600 dark:text-rose-400"
                  />
                </div>

                {isGstActive && (
                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      GST Rate (%)
                    </label>
                    <select
                      value={gstRate}
                      onChange={(e) => setGstRate(parseFloat(e.target.value))}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-semibold"
                    >
                      <option value={0}>0% (Exempt / Nil)</option>
                      <option value={5}>5% GST</option>
                      <option value={12}>12% GST</option>
                      <option value={18}>18% GST (Standard)</option>
                    </select>
                  </div>
                )}

                {isGstActive && gstRate > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Tax Calculation
                    </label>
                    <select
                      value={isTaxInclusive ? 'INCLUSIVE' : 'EXCLUSIVE'}
                      onChange={(e) => setIsTaxInclusive(e.target.value === 'INCLUSIVE')}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-semibold"
                    >
                      <option value="INCLUSIVE">Tax Inclusive</option>
                      <option value="EXCLUSIVE">Tax Extra</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Tax Live Breakdown Preview */}
              {isGstActive && gstRate > 0 && amount > 0 && (
                <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-xs flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span>Taxable Base Value:</span>
                    <span className="font-bold font-tabular-data text-on-surface">
                      {formatINR(computedTax.taxable)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span>
                      GST Tax ({gstRate}% {isInterState ? 'IGST' : 'CGST + SGST'}):
                    </span>
                    <span className="font-bold font-tabular-data text-secondary">
                      {formatINR(computedTax.tax)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold pt-1 border-t border-outline-variant/15 text-on-surface">
                    <span>Total Outflow:</span>
                    <span className="font-black font-tabular-data text-rose-600 dark:text-rose-400">
                      {formatINR(isTaxInclusive ? amount : computedTax.total)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 pt-1 border-t border-outline-variant/10 text-[11px]">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInterState}
                        onChange={(e) => setIsInterState(e.target.checked)}
                        className="rounded text-secondary accent-secondary"
                      />
                      <span className="text-on-surface-variant font-medium">Inter-state (IGST)</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer ml-auto">
                      <input
                        type="checkbox"
                        checked={itcEligible}
                        onChange={(e) => setItcEligible(e.target.checked)}
                        className="rounded text-secondary accent-secondary"
                      />
                      <span className="text-secondary font-bold">Claim ITC in GSTR-3B</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Payment Mode & Bank Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Payment Mode *
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-bold"
                  >
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="CASH">Cash Drawer</option>
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT / RTGS</option>
                    <option value="CREDIT_CARD">Debit / Credit Card</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Voucher / Receipt Reference #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. REC-102 or UTR-987654"
                    value={voucherNumber}
                    onChange={(e) => setVoucherNumber(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-mono"
                  />
                </div>
              </div>

              {/* Vendor Information */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  {isGstActive ? 'Payee / Vendor Name & GSTIN (Optional)' : 'Payee / Vendor Name (Optional)'}
                </label>
                <div className={isGstActive ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : ''}>
                  <input
                    type="text"
                    placeholder="Vendor / Payee Name"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none"
                  />
                  {isGstActive && (
                    <input
                      type="text"
                      placeholder="Vendor GSTIN (15 chars)"
                      maxLength={15}
                      value={vendorGstin}
                      onChange={(e) => setVendorGstin(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 text-xs text-on-surface focus:border-secondary outline-none font-mono uppercase"
                    />
                  )}
                </div>
              </div>

              {/* Notes / Remarks */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
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

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-outline-variant/40 text-on-surface font-bold text-xs hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  <span>{editingExpense ? 'Update Expense' : 'Save Expense Voucher'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. View Voucher Details Modal */}
      {viewingExpense && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/20 p-3.5 sm:p-4 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">shopping_cart_checkout</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-bold text-sm text-on-surface truncate">
                      {viewingExpense.title}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 truncate">
                      {viewingExpense.category}
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant font-medium">
                    {formatDate(viewingExpense.date)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingExpense(null)}
                className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
              {/* Total Amount Hero */}
              <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase font-bold text-on-surface-variant tracking-wider">
                    Expense Outflow
                  </span>
                  <span className="font-tabular-data text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
                    {formatINR(viewingExpense.amount)}
                  </span>
                </div>
                <div className="px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">north_east</span>
                  <span>Money Out</span>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant">Payment Mode</span>
                  <span className="font-bold text-on-surface mt-0.5">{viewingExpense.paymentMode}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant">Voucher Number</span>
                  <span className="font-mono font-bold text-on-surface mt-0.5 truncate">
                    {viewingExpense.voucherNumber || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Vendor Details */}
              {(viewingExpense.vendorName || viewingExpense.vendorGstin) && (
                <div className="p-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-xs">
                  <span className="font-bold text-on-surface-variant block text-[10px] uppercase mb-1">
                    Vendor Details
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {viewingExpense.vendorName && (
                      <span className="font-bold text-on-surface">{viewingExpense.vendorName}</span>
                    )}
                    {viewingExpense.vendorGstin && (
                      <span className="font-mono text-[11px] text-on-surface-variant">
                        GSTIN: {viewingExpense.vendorGstin}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Tax Breakdown */}
              {(viewingExpense.taxAmount || 0) > 0 && (
                <div className="p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/20 text-xs">
                  <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/15">
                    <span className="font-bold text-on-surface">Tax Breakdown</span>
                    <span className="font-bold text-secondary">{viewingExpense.gstRate}% GST</span>
                  </div>
                  <div className="mt-2 space-y-1 text-on-surface-variant">
                    <div className="flex justify-between">
                      <span>Taxable Value:</span>
                      <span className="font-tabular-data font-bold text-on-surface">
                        {formatINR(viewingExpense.taxableAmount || 0)}
                      </span>
                    </div>
                    {(viewingExpense.cgstAmount || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>CGST:</span>
                        <span className="font-tabular-data font-semibold">
                          {formatINR(viewingExpense.cgstAmount || 0)}
                        </span>
                      </div>
                    )}
                    {(viewingExpense.sgstAmount || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>SGST:</span>
                        <span className="font-tabular-data font-semibold">
                          {formatINR(viewingExpense.sgstAmount || 0)}
                        </span>
                      </div>
                    )}
                    {(viewingExpense.igstAmount || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>IGST:</span>
                        <span className="font-tabular-data font-semibold">
                          {formatINR(viewingExpense.igstAmount || 0)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-outline-variant/10 font-bold">
                      <span>Total Tax (ITC):</span>
                      <span className="font-tabular-data text-secondary">
                        {formatINR(viewingExpense.taxAmount || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {viewingExpense.notes && (
                <div className="p-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-xs text-on-surface">
                  <span className="font-bold text-on-surface-variant block text-[10px] uppercase mb-0.5">
                    Notes
                  </span>
                  <p className="font-medium leading-relaxed">{viewingExpense.notes}</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-3 sm:p-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(viewingExpense)}
                  className="min-h-[40px] px-3 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">share</span>
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrint(viewingExpense)}
                  className="min-h-[40px] px-3 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 font-bold text-xs flex items-center gap-1 hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">print</span>
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const toEdit = viewingExpense;
                    setViewingExpense(null);
                    handleOpenEdit(toEdit);
                  }}
                  className="min-h-[40px] px-3 rounded-xl bg-surface-container-lowest text-secondary border border-outline-variant/30 font-bold text-xs flex items-center gap-1 hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Edit</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setViewingExpense(null)}
                className="min-h-[40px] px-4 rounded-xl bg-surface-container-low text-on-surface font-bold text-xs active:scale-95 transition-all cursor-pointer border border-outline-variant/30"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Date Filter Modal */}
      <DateFilterModal
        isOpen={isDateModalOpen}
        activePreset={datePreset}
        customStartDate={customStart}
        customEndDate={customEnd}
        onClose={() => setIsDateModalOpen(false)}
        onSelectRange={(preset, start, end) => {
          setDatePreset(preset);
          if (start !== undefined) setCustomStart(start);
          if (end !== undefined) setCustomEnd(end);
        }}
        accentColor="rose-500"
      />

      {/* 6. Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={deletingExpenseId !== null}
        title="Delete Expense Voucher?"
        recordName={deletingTarget ? `${deletingTarget.title} (${formatINR(deletingTarget.amount)})` : undefined}
        description="This will permanently remove this expense voucher from your records and cash drawer outflow calculations."
        confirmText="Delete Voucher"
        onConfirm={() => {
          if (deletingExpenseId) {
            onDeleteExpense(deletingExpenseId);
            if (viewingExpense && viewingExpense.id === deletingExpenseId) {
              setViewingExpense(null);
            }
          }
        }}
        onClose={() => setDeletingExpenseId(null)}
      />
    </div>
  );
};
