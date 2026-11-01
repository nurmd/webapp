import React from 'react';
import { formatINR } from '../../core/utils/formatters.ts';
import { ExpenseSortOption, EXPENSE_SORT_LABELS } from './ExpensesFilterSheet.tsx';
import { PAYMENT_MODE_LABELS } from './expenseCategoryMeta.ts';

export interface ExpensesHeaderProps {
  totalCount: number;
  filteredCount: number;
  dateRangeLabel: string;
  onOpenDateFilter: () => void;
  onExportCsv: () => void;
  onOpenCreate: () => void;

  // KPI Metrics
  periodTotalExpenses: number;
  periodVoucherCount: number;
  periodCashOutflow: number;
  periodBankOutflow: number;
  periodItcClaimable: number;
  periodTotalTax: number;
  isGstActive: boolean;

  // Search & Filters
  search: string;
  onSearchChange: (value: string) => void;
  activeFilterCount: number;
  onOpenFilterSheet: () => void;

  // Active filter chip values & handlers
  selectedCategory: string;
  onResetCategory: () => void;
  selectedPaymentMode: string;
  onResetPaymentMode: () => void;
  sortBy: ExpenseSortOption;
  onResetSort: () => void;
  onClearAllFilters: () => void;
}

export const ExpensesHeader: React.FC<ExpensesHeaderProps> = ({
  totalCount,
  filteredCount,
  dateRangeLabel,
  onOpenDateFilter,
  onExportCsv,
  onOpenCreate,
  periodTotalExpenses,
  periodVoucherCount,
  periodCashOutflow,
  periodBankOutflow,
  periodItcClaimable,
  periodTotalTax,
  isGstActive,
  search,
  onSearchChange,
  activeFilterCount,
  onOpenFilterSheet,
  selectedCategory,
  onResetCategory,
  selectedPaymentMode,
  onResetPaymentMode,
  sortBy,
  onResetSort,
  onClearAllFilters,
}) => {
  const isFiltersActive =
    selectedCategory !== 'ALL' || selectedPaymentMode !== 'ALL' || sortBy !== 'NEWEST';

  return (
    <div className="flex flex-col gap-2.5">
      {/* ======================================================== */}
      {/* Row 1 & 2 Card: Title, Date, Actions & KPI Strip         */}
      {/* ======================================================== */}
      <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 shadow-xs border border-outline-variant/20 flex flex-col gap-3">
        {/* Row 1: Title & Top Action Controls */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Title & Count */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">wallet</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <h2 className="font-bold text-base sm:text-lg text-on-surface whitespace-nowrap shrink-0">
                  Expenses
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-low font-bold text-on-surface-variant whitespace-nowrap shrink-0">
                  {filteredCount} of {totalCount}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant hidden sm:inline">
                Business overheads, salaries, rent, petty cash &amp; GSTR-3B ITC
              </span>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1.5">
            {/* Compact Date Chip */}
            <button
              type="button"
              onClick={onOpenDateFilter}
              className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95"
              title="Change date filter range"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">calendar_today</span>
              <span className="truncate max-w-[110px] sm:max-w-[160px]">{dateRangeLabel}</span>
              <span className="material-symbols-outlined text-[14px] text-outline">arrow_drop_down</span>
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={onExportCsv}
              aria-label="Export CSV"
              className="min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95 flex items-center gap-1"
              title="Export filtered expenses as CSV"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Primary Add Expense Button */}
            <button
              type="button"
              onClick={onOpenCreate}
              aria-label="Add Expense"
              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-[40px] px-3 sm:px-4 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center gap-1.5 hover:bg-secondary/90"
              title="Record Expense"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span className="hidden sm:inline">Add Expense</span>
            </button>
          </div>
        </div>

        {/* Row 2: KPI Strip */}
        <div
          className={`grid gap-2 pt-1 border-t border-outline-variant/15 ${
            isGstActive
              ? 'grid-cols-2 md:grid-cols-4'
              : 'grid-cols-1 md:grid-cols-3'
          }`}
        >
          {/* Tile 1: Total Spent (Always visible) */}
          <div className="bg-surface-container-low/60 rounded-xl p-2.5 flex flex-col justify-between border border-outline-variant/20">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
              Total Spent
            </span>
            <div className="font-tabular-data text-sm sm:text-base font-black text-rose-700 dark:text-rose-400 mt-0.5">
              {formatINR(periodTotalExpenses)}
            </div>
            <span className="text-[10px] text-on-surface-variant truncate">
              {periodVoucherCount} {periodVoucherCount === 1 ? 'voucher' : 'vouchers'}
            </span>
          </div>

          {/* Tile 2: Cash Outflow (hidden md:flex) */}
          <div className="hidden md:flex bg-surface-container-low/60 rounded-xl p-2.5 flex-col justify-between border border-outline-variant/20">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
              Cash Drawer Outflow
            </span>
            <div className="font-tabular-data text-sm sm:text-base font-black text-on-surface mt-0.5">
              {formatINR(periodCashOutflow)}
            </div>
            <span className="text-[10px] text-on-surface-variant truncate">
              Direct cash paid
            </span>
          </div>

          {/* Tile 3: Bank / UPI Outflow (hidden md:flex) */}
          <div className="hidden md:flex bg-surface-container-low/60 rounded-xl p-2.5 flex-col justify-between border border-outline-variant/20">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
              Bank / UPI Outflow
            </span>
            <div className="font-tabular-data text-sm sm:text-base font-black text-on-surface mt-0.5">
              {formatINR(periodBankOutflow)}
            </div>
            <span className="text-[10px] text-on-surface-variant truncate">
              Digital / Net Banking
            </span>
          </div>

          {/* Tile 4: ITC Claimable (Mobile & Desktop when isGstActive) */}
          {isGstActive && (
            <div className="bg-surface-container-low/60 rounded-xl p-2.5 flex flex-col justify-between border border-outline-variant/20">
              <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">
                ITC Claimable
              </span>
              <div className="font-tabular-data text-sm sm:text-base font-black text-secondary mt-0.5">
                {formatINR(periodItcClaimable)}
              </div>
              <span className="text-[10px] text-secondary truncate">
                Tax Credit: {formatINR(periodTotalTax)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* Row 3: Sticky Search + Filters Trigger (Zero Chrome Idle) */}
      {/* ======================================================== */}
      <div className="sticky top-0 z-20 bg-surface/95 backdrop-blur-md py-1 -my-1 space-y-1.5">
        <div className="flex items-center gap-1.5">
          {/* Search Bar with Leading Icon & 1-Tap Clear */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search expenses, vendors, vouchers..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-10 pl-9 pr-8 bg-surface-container-lowest text-on-surface text-xs rounded-xl shadow-xs border border-outline-variant/30 placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/40 font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 min-w-[28px] min-h-[28px] flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Filters Button with Active Count Badge */}
          <button
            type="button"
            onClick={onOpenFilterSheet}
            aria-label="Open filter and sort sheet"
            className={`min-h-[40px] flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
              activeFilterCount > 0
                ? 'bg-secondary/10 text-secondary border-secondary/30'
                : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface border-outline-variant/30'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">tune</span>
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-secondary text-on-secondary font-black text-[10px] flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Removable Active Filter Chips Bar (Renders ONLY when filters are active) */}
        {isFiltersActive && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {selectedCategory !== 'ALL' && (
              <button
                type="button"
                onClick={onResetCategory}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/25 text-[11px] font-bold shrink-0 hover:bg-secondary/20 transition-colors cursor-pointer"
              >
                <span>{selectedCategory}</span>
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}

            {selectedPaymentMode !== 'ALL' && (
              <button
                type="button"
                onClick={onResetPaymentMode}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/25 text-[11px] font-bold shrink-0 hover:bg-secondary/20 transition-colors cursor-pointer"
              >
                <span>{PAYMENT_MODE_LABELS[selectedPaymentMode] || selectedPaymentMode}</span>
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}

            {sortBy !== 'NEWEST' && (
              <button
                type="button"
                onClick={onResetSort}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/25 text-[11px] font-bold shrink-0 hover:bg-secondary/20 transition-colors cursor-pointer"
              >
                <span>{EXPENSE_SORT_LABELS[sortBy]}</span>
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClearAllFilters}
              className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 shrink-0 cursor-pointer"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
