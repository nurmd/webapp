import React from 'react';
import { Party } from '../../../models/party.ts';
import { ItcEligibility } from '../../../models/purchase.ts';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface PurchaseHeaderMetaProps {
  onClose: () => void;
  isEditing: boolean;
  selectedSupplier: Party | null;
  billNumber: string;
  billDate: string;
  dueDate: string;
  supplierStateCode: string;
  itcEligibility: ItcEligibility;
  isGstActive: boolean;
  onSelectSupplierClick: () => void;
  onAddSupplierClick: () => void;
  onClearSupplier: () => void;
  onOpenBillNoModal: () => void;
  onOpenDueDateModal: () => void;
}

export const PurchaseHeaderMeta: React.FC<PurchaseHeaderMetaProps> = ({
  onClose,
  isEditing,
  selectedSupplier,
  billNumber,
  billDate,
  dueDate,
  supplierStateCode,
  itcEligibility,
  isGstActive,
  onSelectSupplierClick,
  onAddSupplierClick,
  onClearSupplier,
  onOpenBillNoModal,
  onOpenDueDateModal,
}) => {
  return (
    <>
      {/* Fixed Top Shell Header */}
      <header className="fixed top-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-xs border-b border-outline-variant/30 pt-safe">
        <div className="h-14 px-3 sm:px-6 flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={onClose}
              aria-label="Go Back"
              type="button"
              className="w-9 h-9 flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 rounded-xl transition-all cursor-pointer flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black text-sm shadow-xs flex-shrink-0">
              <span className="material-symbols-outlined text-[19px]">shopping_bag</span>
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-on-surface truncate">
                {isEditing ? 'Edit Purchase Bill' : 'Record Purchase Bill'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 shrink-0">
                Purchase (Inward)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
      </header>

      {/* Ultra-Compact Supplier & Purchase Metadata Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3 py-2 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
        {/* Supplier Selector Pill */}
        <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
          <button
            type="button"
            onClick={onSelectSupplierClick}
            className="flex items-center gap-2 hover:bg-surface-container-low px-2 py-1 rounded-lg transition-colors cursor-pointer group min-w-0 text-left"
            title="Select or Change Supplier"
          >
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-600 group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[17px]">store</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-orange-600">
                  {selectedSupplier ? selectedSupplier.name : 'Select Supplier / Vendor'}
                </span>
                <span className="material-symbols-outlined text-[14px] text-outline group-hover:text-orange-600 shrink-0">
                  swap_horiz
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant truncate">
                {selectedSupplier?.gstin && isGstActive ? (
                  <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">
                    GSTIN: {selectedSupplier.gstin}
                  </span>
                ) : (
                  <span className="text-outline">{isGstActive ? 'Unregistered Vendor' : 'Vendor'}</span>
                )}
                {supplierStateCode && <span>· State: {supplierStateCode}</span>}
              </div>
            </div>
          </button>

          {selectedSupplier && (
            <div className="flex items-center gap-1 shrink-0">
              {(selectedSupplier.currentBalance || 0) < 0 ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300/60">
                  Payable: {formatINR(Math.abs(selectedSupplier.currentBalance || 0))}
                </span>
              ) : (selectedSupplier.currentBalance || 0) > 0 ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300/60">
                  Advance: {formatINR(selectedSupplier.currentBalance || 0)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSupplier();
                }}
                title="Clear supplier"
                className="w-6 h-6 rounded-md flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}

          {/* Direct Add New Supplier Button */}
          <button
            type="button"
            onClick={onAddSupplierClick}
            className="px-2 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shrink-0 active:scale-95"
            title="Add New Supplier Directly"
          >
            <span className="material-symbols-outlined text-[15px]">person_add</span>
            <span className="hidden sm:inline">+ New</span>
          </button>
        </div>

        {/* Bill Metadata Pills */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Bill Number */}
          <button
            type="button"
            onClick={onOpenBillNoModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title="Change Bill Number"
          >
            <span className="text-[9px] uppercase font-bold text-outline">Bill #:</span>
            <span className="font-bold text-on-surface truncate max-w-[120px]">{billNumber}</span>
            <span className="material-symbols-outlined text-[12px] text-outline">edit</span>
          </button>

          {/* Bill Date */}
          <button
            type="button"
            onClick={onOpenBillNoModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title="Change Bill Date"
          >
            <span className="material-symbols-outlined text-[13px] text-outline">calendar_today</span>
            <span>{billDate}</span>
          </button>

          {/* Due Date */}
          <button
            type="button"
            onClick={onOpenDueDateModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title="Change Payment Due Date"
          >
            <span className="text-[9px] uppercase font-bold text-outline">Due:</span>
            <span>{dueDate}</span>
            <span className="material-symbols-outlined text-[12px] text-outline">event</span>
          </button>

          {/* ITC Eligibility Selector */}
          {isGstActive && (
            <div className="h-7 px-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-[11px] flex items-center gap-1 border border-orange-500/20">
              <span className="material-symbols-outlined text-[14px]">verified</span>
              <span>
                {itcEligibility === 'ELIGIBLE_INPUTS'
                  ? 'ITC: Inputs'
                  : itcEligibility === 'ELIGIBLE_CAPITAL_GOODS'
                  ? 'ITC: Capital'
                  : itcEligibility === 'ELIGIBLE_SERVICES'
                  ? 'ITC: Services'
                  : 'No ITC'}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
