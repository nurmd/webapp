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

import { ExpensesHeader } from './ExpensesHeader.tsx';
import { ExpenseCard } from './ExpenseCard.tsx';
import { ExpenseFormSheet } from './ExpenseFormSheet.tsx';
import { ExpenseDetailSheet } from './ExpenseDetailSheet.tsx';
import {
  ExpensesFilterSheet,
  ExpenseSortOption,
  EXPENSE_SORT_LABELS,
} from './ExpensesFilterSheet.tsx';

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

export { type ExpenseSortOption, EXPENSE_SORT_LABELS };

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  onSaveExpense,
  onDeleteExpense,
}) => {
  const company = useMemo(() => db.getCompany(), []);
  const isGstActive = company.isGstEnabled !== false;

  // View & Filter States
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ExpenseSortOption>('NEWEST');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Date Filtering
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  // Modal / Sheet States
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Back navigation handling: delete confirm -> filter sheet -> form sheet -> detail sheet -> date filter
  useBackNavigation(() => {
    if (deletingExpenseId !== null) {
      setDeletingExpenseId(null);
      return true;
    }
    if (isFilterSheetOpen) {
      setIsFilterSheetOpen(false);
      return true;
    }
    if (isFormSheetOpen) {
      setIsFormSheetOpen(false);
      return true;
    }
    if (viewingExpense !== null) {
      setViewingExpense(null);
      return true;
    }
    if (isDateModalOpen) {
      setIsDateModalOpen(false);
      return true;
    }
    return false;
  }, isDateModalOpen || isFilterSheetOpen || isFormSheetOpen || viewingExpense !== null || deletingExpenseId !== null, 20);

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

  // Active filter count for badge
  const activeFilterCount =
    (selectedCategory !== 'ALL' ? 1 : 0) +
    (selectedPaymentMode !== 'ALL' ? 1 : 0) +
    (sortBy !== 'NEWEST' ? 1 : 0);

  // Open Form Sheet for Create
  const handleOpenCreate = () => {
    setEditingExpense(null);
    setIsFormSheetOpen(true);
  };

  // Open Form Sheet for Edit
  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setIsFormSheetOpen(true);
  };

  // Submit Save/Update
  const handleSaveExpense = (expensePayload: Expense) => {
    onSaveExpense(expensePayload);
    setIsFormSheetOpen(false);
    setEditingExpense(null);

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

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Expense_Register_${dateRange.label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deletingTarget = deletingExpenseId ? expenses.find((e) => e.id === deletingExpenseId) : null;

  return (
    <div className="flex flex-col w-full pb-28 md:pb-8 max-w-7xl mx-auto px-margin-mobile md:px-6 py-3 gap-space-sm">
      {/* 1. Simplified High-Contrast Header */}
      <ExpensesHeader
        totalCount={expenses.length}
        filteredCount={filtered.length}
        dateRangeLabel={dateRange.label}
        onOpenDateFilter={() => setIsDateModalOpen(true)}
        onExportCsv={handleExportCsv}
        onOpenCreate={handleOpenCreate}
        periodTotalExpenses={periodTotalExpenses}
        periodVoucherCount={dateFilteredExpenses.length}
        periodCashOutflow={periodCashOutflow}
        periodBankOutflow={periodBankOutflow}
        periodItcClaimable={periodItcClaimable}
        periodTotalTax={periodTotalTax}
        isGstActive={isGstActive}
        search={search}
        onSearchChange={setSearch}
        activeFilterCount={activeFilterCount}
        onOpenFilterSheet={() => setIsFilterSheetOpen(true)}
        selectedCategory={selectedCategory}
        onResetCategory={() => setSelectedCategory('ALL')}
        selectedPaymentMode={selectedPaymentMode}
        onResetPaymentMode={() => setSelectedPaymentMode('ALL')}
        sortBy={sortBy}
        onResetSort={() => setSortBy('NEWEST')}
        onClearAllFilters={() => {
          setSelectedCategory('ALL');
          setSelectedPaymentMode('ALL');
          setSortBy('NEWEST');
        }}
      />

      {/* 2. Expense Cards Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5">
        {sortedExpenses.length === 0 ? (
          <div className="md:col-span-2 py-10 px-4 text-center flex flex-col items-center justify-center gap-1.5 bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-xs">
            <div className="w-10 h-10 rounded-2xl bg-surface-container-low flex items-center justify-center text-outline">
              <span className="material-symbols-outlined text-[22px]">wallet</span>
            </div>
            <span className="text-sm font-bold text-on-surface">No expenses found</span>
            <span className="text-xs text-on-surface-variant max-w-[300px]">
              {expenses.length === 0
                ? 'Record your first operational overhead, rent, tea, or courier expense.'
                : search
                ? `No matching expenses found for "${search}".`
                : 'No expense records found for the selected filters.'}
            </span>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap justify-center">
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="min-h-[36px] px-3 rounded-xl bg-surface-container-low text-secondary font-bold text-xs cursor-pointer hover:bg-surface-container active:scale-95"
                >
                  Clear Search
                </button>
              )}
              {selectedCategory !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className="min-h-[36px] px-3 rounded-xl bg-surface-container-low text-secondary font-bold text-xs cursor-pointer hover:bg-surface-container active:scale-95"
                >
                  Reset Category
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenCreate}
                className="min-h-[36px] px-3.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs cursor-pointer shadow-xs active:scale-95 hover:bg-secondary/90 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Add Expense</span>
              </button>
            </div>
          </div>
        ) : (
          sortedExpenses.map((exp) => (
            <ExpenseCard
              key={exp.id}
              expense={exp}
              isGstActive={isGstActive}
              onView={(e) => setViewingExpense(e)}
              onEdit={handleOpenEdit}
              onDelete={(id) => setDeletingExpenseId(id)}
              onShare={handleShareWhatsApp}
              onPrint={handlePrint}
            />
          ))
        )}
      </div>

      {/* 3. Record / Edit Expense Bottom Sheet */}
      {isFormSheetOpen && (
        <ExpenseFormSheet
          isOpen={isFormSheetOpen}
          onClose={() => setIsFormSheetOpen(false)}
          editingExpense={editingExpense}
          categories={CATEGORIES}
          isGstActive={isGstActive}
          onSave={handleSaveExpense}
        />
      )}

      {/* 4. Shared View Voucher Details Bottom Sheet */}
      {viewingExpense && (
        <ExpenseDetailSheet
          expense={viewingExpense}
          company={company}
          onClose={() => setViewingExpense(null)}
          onEdit={(e) => {
            setViewingExpense(null);
            handleOpenEdit(e);
          }}
          onDelete={(id) => {
            setDeletingExpenseId(id);
          }}
          onShare={handleShareWhatsApp}
          onPrint={handlePrint}
        />
      )}

      {/* 5. Filter & Sort Sheet */}
      {isFilterSheetOpen && (
        <ExpensesFilterSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          selectedCategory={selectedCategory}
          selectedPaymentMode={selectedPaymentMode}
          sortBy={sortBy}
          categories={CATEGORIES}
          onApply={(cat, mode, sort) => {
            setSelectedCategory(cat);
            setSelectedPaymentMode(mode);
            setSortBy(sort);
          }}
          onReset={() => {
            setSelectedCategory('ALL');
            setSelectedPaymentMode('ALL');
            setSortBy('NEWEST');
          }}
        />
      )}

      {/* 6. Date Filter Modal */}
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

      {/* 7. Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={deletingExpenseId !== null}
        title="Delete Expense Voucher?"
        recordName={
          deletingTarget
            ? `${deletingTarget.title} (${formatINR(deletingTarget.amount)})`
            : undefined
        }
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
