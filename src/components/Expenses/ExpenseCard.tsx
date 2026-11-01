import React, { useState } from 'react';
import { Expense } from '../../models/expense.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getExpenseCategoryMeta, PAYMENT_MODE_LABELS } from './expenseCategoryMeta.ts';

export interface ExpenseCardProps {
  expense: Expense;
  isGstActive: boolean;
  onView: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  onShare: (expense: Expense) => void;
  onPrint: (expense: Expense) => void;
}

export const ExpenseCard: React.FC<ExpenseCardProps> = ({
  expense,
  isGstActive,
  onView,
  onEdit,
  onDelete,
  onShare,
  onPrint,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const categoryMeta = getExpenseCategoryMeta(expense.category);

  // Subtitle pieces for compact mobile row
  const subtitleParts = [
    formatDate(expense.date),
    PAYMENT_MODE_LABELS[expense.paymentMode] || expense.paymentMode,
    expense.vendorName || null,
  ].filter(Boolean);

  return (
    <>
      {/* ======================================================== */}
      {/* 1. Mobile Compact Row (< md)                             */}
      {/* ======================================================== */}
      <div
        onClick={() => onView(expense)}
        className="md:hidden bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/25 shadow-xs flex items-center justify-between gap-2.5 active:scale-[0.99] transition-all cursor-pointer relative"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Category Icon Tile */}
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${categoryMeta.tint}`}
          >
            <span className="material-symbols-outlined text-[19px]">{categoryMeta.icon}</span>
          </div>

          {/* Title & Subtitle */}
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-xs sm:text-sm text-on-surface truncate">
              {expense.title}
            </h4>
            <p className="text-[11px] text-on-surface-variant truncate mt-0.5 font-medium">
              {subtitleParts.join(' · ')}
            </p>
          </div>
        </div>

        {/* Amount & Kebab Trigger */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-tabular-data text-xs sm:text-sm font-black text-rose-700 dark:text-rose-400 whitespace-nowrap">
            - {formatINR(expense.amount)}
          </span>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={`Actions for ${expense.title}`}
              className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">more_vert</span>
            </button>

            {/* Mobile Action Popover */}
            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/30 py-1.5 overflow-hidden animate-fade-in divide-y divide-outline-variant/15">
                  <div className="py-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onView(expense);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2.5 text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px] text-on-surface-variant">visibility</span>
                      <span>View Details</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onEdit(expense);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2.5 text-secondary hover:bg-surface-container transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px] text-secondary">edit</span>
                      <span>Edit</span>
                    </button>
                  </div>

                  <div className="py-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onShare(expense);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 hover:bg-surface-container transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px]">share</span>
                      <span>Share WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onPrint(expense);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2.5 text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px] text-on-surface-variant">print</span>
                      <span>Print Voucher</span>
                    </button>
                  </div>

                  <div className="py-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onDelete(expense.id);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-bold flex items-center gap-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[17px]">delete</span>
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. Desktop Rich Card (hidden md:flex)                    */}
      {/* ======================================================== */}
      <div
        onClick={() => onView(expense)}
        className="hidden md:flex bg-surface-container-lowest p-3 sm:p-3.5 rounded-2xl border border-outline-variant/25 shadow-xs flex-col justify-between gap-2.5 hover:border-secondary/40 active:scale-[0.99] transition-all cursor-pointer group"
      >
        {/* Line 1: Category Tag & Date (left) | Amount (right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 flex items-center gap-1 ${categoryMeta.tint}`}
            >
              <span className="material-symbols-outlined text-[12px]">{categoryMeta.icon}</span>
              <span>{expense.category}</span>
            </span>
            <span className="text-[11px] text-on-surface-variant font-medium whitespace-nowrap shrink-0">
              {formatDate(expense.date)}
            </span>
          </div>

          <span className="font-tabular-data text-sm sm:text-base font-black text-rose-700 dark:text-rose-400 whitespace-nowrap shrink-0">
            - {formatINR(expense.amount)}
          </span>
        </div>

        {/* Line 2: Title / Purpose */}
        <div className="min-w-0">
          <h3 className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-secondary transition-colors">
            {expense.title}
          </h3>
          {expense.vendorName && (
            <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
              Vendor: <span className="font-semibold text-on-surface">{expense.vendorName}</span>
              {expense.vendorGstin && <span className="font-mono text-[10px] ml-1.5">({expense.vendorGstin})</span>}
            </p>
          )}
        </div>

        {/* Line 3: Meta & Quick Action Buttons */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/15 text-[11px] text-on-surface-variant">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="px-1.5 py-0.5 rounded-md bg-surface-container-low font-bold text-[10px] whitespace-nowrap shrink-0">
              {PAYMENT_MODE_LABELS[expense.paymentMode] || expense.paymentMode}
            </span>

            {expense.voucherNumber && (
              <span className="font-mono text-[10px] opacity-80 whitespace-nowrap shrink-0">
                #{expense.voucherNumber}
              </span>
            )}

            {isGstActive && expense.itcEligible && (expense.taxAmount || 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-secondary/10 text-secondary font-bold text-[10px]">
                ITC: {formatINR(expense.taxAmount)}
              </span>
            )}
          </div>

          {/* Inline Fast Action Buttons on Hover */}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onShare(expense)}
              aria-label="Share via WhatsApp"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
              title="Share voucher via WhatsApp"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
            </button>

            <button
              type="button"
              onClick={() => onPrint(expense)}
              aria-label="Print voucher"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
              title="Print payment voucher"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
            </button>

            <button
              type="button"
              onClick={() => onEdit(expense)}
              aria-label="Edit expense"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-secondary hover:bg-secondary/10 transition-colors cursor-pointer"
              title="Edit expense"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>

            <button
              type="button"
              onClick={() => onDelete(expense.id)}
              aria-label="Delete expense"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Delete expense"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
