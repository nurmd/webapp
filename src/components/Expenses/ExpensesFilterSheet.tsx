import React, { useState, useEffect } from 'react';
import { ExpenseCategory } from '../../models/expense.ts';

export type ExpenseSortOption = 'NEWEST' | 'OLDEST' | 'AMOUNT_HIGH' | 'AMOUNT_LOW' | 'TITLE_AZ';

export const EXPENSE_SORT_LABELS: Record<ExpenseSortOption, string> = {
  NEWEST: 'Newest Date First',
  OLDEST: 'Oldest Date First',
  AMOUNT_HIGH: 'Highest Amount First',
  AMOUNT_LOW: 'Lowest Amount First',
  TITLE_AZ: 'Title (A to Z)',
};

export interface ExpensesFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCategory: string;
  selectedPaymentMode: string;
  sortBy: ExpenseSortOption;
  categories: ExpenseCategory[];
  onApply: (category: string, paymentMode: string, sort: ExpenseSortOption) => void;
  onReset: () => void;
}

const PAYMENT_MODE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'ALL', label: 'All Modes' },
  { id: 'CASH', label: 'Cash' },
  { id: 'UPI', label: 'UPI' },
  { id: 'BANK_TRANSFER', label: 'Bank' },
  { id: 'CREDIT_CARD', label: 'Card' },
];

export const ExpensesFilterSheet: React.FC<ExpensesFilterSheetProps> = ({
  isOpen,
  onClose,
  selectedCategory,
  selectedPaymentMode,
  sortBy,
  categories,
  onApply,
  onReset,
}) => {
  // Local drafts - only committed on Apply
  const [draftCategory, setDraftCategory] = useState<string>(selectedCategory);
  const [draftPaymentMode, setDraftPaymentMode] = useState<string>(selectedPaymentMode);
  const [draftSort, setDraftSort] = useState<ExpenseSortOption>(sortBy);

  useEffect(() => {
    if (isOpen) {
      setDraftCategory(selectedCategory);
      setDraftPaymentMode(selectedPaymentMode);
      setDraftSort(sortBy);
    }
  }, [isOpen, selectedCategory, selectedPaymentMode, sortBy]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply(draftCategory, draftPaymentMode, draftSort);
    onClose();
  };

  const handleReset = () => {
    setDraftCategory('ALL');
    setDraftPaymentMode('ALL');
    setDraftSort('NEWEST');
    onReset();
    onClose();
  };

  const isDraftFiltered = draftCategory !== 'ALL' || draftPaymentMode !== 'ALL' || draftSort !== 'NEWEST';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Filter & Sort Expenses"
      className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 w-full sm:max-w-md shadow-2xl flex flex-col gap-4 max-h-[92dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-outline-variant/40 rounded-full mx-auto -mt-1 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-outline-variant/20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">tune</span>
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-on-surface">Filter &amp; Sort</h3>
              <span className="text-[11px] text-on-surface-variant font-medium">Refine your expense records</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isDraftFiltered && (
              <button
                type="button"
                onClick={() => {
                  setDraftCategory('ALL');
                  setDraftPaymentMode('ALL');
                  setDraftSort('NEWEST');
                }}
                className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close filter sheet"
              className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* 1. Category */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
              Expense Category
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDraftCategory('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  draftCategory === 'ALL'
                    ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/20'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setDraftCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    draftCategory === cat
                      ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/20'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Payment Mode */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
              Payment Mode
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {PAYMENT_MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDraftPaymentMode(mode.id)}
                  className={`py-2 px-1 rounded-xl text-xs font-semibold text-center transition-all cursor-pointer ${
                    draftPaymentMode === mode.id
                      ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/20'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Sort */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
              Sort By
            </label>
            <div className="bg-surface-container rounded-2xl border border-outline-variant/20 overflow-hidden divide-y divide-outline-variant/15">
              {(Object.keys(EXPENSE_SORT_LABELS) as ExpenseSortOption[]).map((key) => {
                const isSelected = draftSort === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraftSort(key)}
                    className={`w-full px-3.5 py-2.5 text-left text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? 'bg-secondary/10 text-secondary font-bold' : 'text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <span>{EXPENSE_SORT_LABELS[key]}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-[18px] text-secondary">
                        check
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2.5 border-t border-outline-variant/20 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[44px] px-4 rounded-xl border border-outline-variant/30 text-on-surface hover:bg-surface-container font-bold text-xs transition-colors cursor-pointer"
          >
            Reset All
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="min-h-[44px] flex-1 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
