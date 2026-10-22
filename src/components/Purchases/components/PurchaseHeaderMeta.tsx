import React from 'react';
import { Party } from '../../../models/party.ts';
import { ItcEligibility } from '../../../models/purchase.ts';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface PurchaseHeaderMetaProps {
  onClose: () => void;
  isEditing: boolean;
  purchaseType?: 'BILL' | 'PO' | 'RETURN' | 'CHALLAN';
  selectedSupplier: Party | null;
  billNumber: string;
  billDate: string;
  dueDate: string;
  supplierStateCode: string;
  itcEligibility: ItcEligibility;
  isGstActive: boolean;
  isRcm?: boolean;
  onRcmChange?: (isRcm: boolean) => void;
  onSelectSupplierClick: () => void;
  onAddSupplierClick: () => void;
  onClearSupplier: () => void;
  onOpenBillNoModal: () => void;
  onOpenDueDateModal: () => void;

  // Return / Reference fields
  originalBillNumber?: string;
  onOriginalBillNumberChange?: (val: string) => void;
  originalBillDate?: string;
  onOriginalBillDateChange?: (val: string) => void;
  returnReason?: string;
  onReturnReasonChange?: (val: string) => void;

  // Order status
  orderStatus?: string;

  // Challan & Transportation fields
  challanStatus?: 'RECEIVED' | 'IN_TRANSIT' | 'DRAFT' | 'CANCELLED';
  onChallanStatusChange?: (status: 'RECEIVED' | 'IN_TRANSIT' | 'DRAFT' | 'CANCELLED') => void;
  challanType?: string;
  onChallanTypeChange?: (val: string) => void;
  challanNumber?: string;
  onChallanNumberChange?: (val: string) => void;
  vehicleNumber?: string;
  onVehicleNumberChange?: (val: string) => void;
  transporterName?: string;
  onTransporterNameChange?: (val: string) => void;
  lrNumber?: string;
  onLrNumberChange?: (val: string) => void;
  lrDate?: string;
  onLrDateChange?: (val: string) => void;
  ewayBillNumber?: string;
  onEwayBillNumberChange?: (val: string) => void;
  receivedDate?: string;
  onReceivedDateChange?: (val: string) => void;

  // Draft props for top bar
  hasRestoredDraft?: boolean;
  hasDraftInStorage?: boolean;
  onSaveDraft?: () => void;
  onRestoreDraft?: () => void;
  onDiscardDraft?: () => void;
}

export const PurchaseHeaderMeta: React.FC<PurchaseHeaderMetaProps> = ({
  onClose,
  isEditing,
  purchaseType = 'BILL',
  selectedSupplier,
  billNumber,
  billDate,
  dueDate,
  supplierStateCode,
  itcEligibility,
  isGstActive,
  isRcm,
  onRcmChange,
  onSelectSupplierClick,
  onAddSupplierClick,
  onClearSupplier,
  onOpenBillNoModal,
  onOpenDueDateModal,
  originalBillNumber,
  onOriginalBillNumberChange,
  originalBillDate,
  onOriginalBillDateChange,
  returnReason,
  onReturnReasonChange,
  orderStatus,
  challanStatus = 'RECEIVED',
  onChallanStatusChange,
  challanType,
  onChallanTypeChange,
  challanNumber,
  onChallanNumberChange,
  vehicleNumber,
  onVehicleNumberChange,
  transporterName,
  onTransporterNameChange,
  lrNumber,
  onLrNumberChange,
  lrDate,
  onLrDateChange,
  ewayBillNumber,
  onEwayBillNumberChange,
  receivedDate,
  onReceivedDateChange,
  hasRestoredDraft = false,
  hasDraftInStorage = false,
  onSaveDraft,
  onRestoreDraft,
  onDiscardDraft,
}) => {
  const isPo = purchaseType === 'PO';
  const isReturn = purchaseType === 'RETURN';
  const isChallan = purchaseType === 'CHALLAN';

  const titleText = isChallan
    ? isEditing
      ? `Edit Purchase Challan #${billNumber}`
      : 'New Purchase Challan (GRN)'
    : isPo
    ? isEditing
      ? `Edit Purchase Order #${billNumber}`
      : 'New Purchase Order'
    : isReturn
    ? isEditing
      ? `Edit Purchase Return #${billNumber}`
      : 'New Purchase Return (Debit Note)'
    : isEditing
    ? 'Edit Purchase Bill'
    : 'Record Purchase Bill';

  const badgeText = isChallan
    ? 'Purchase Challan (GRN)'
    : isPo
    ? 'Purchase Order'
    : isReturn
    ? 'Debit Note (Return)'
    : 'Purchase (Inward)';
  const badgeClass = isChallan
    ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25'
    : isPo
    ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25'
    : isReturn
    ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30'
    : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';

  const iconName = isChallan
    ? 'move_to_inbox'
    : isPo
    ? 'add_shopping_cart'
    : isReturn
    ? 'assignment_turned_in'
    : 'shopping_bag';
  const iconBgClass = isChallan
    ? 'bg-teal-600'
    : isPo
    ? 'bg-indigo-600'
    : isReturn
    ? 'bg-amber-600'
    : 'bg-orange-600';

  return (
    <>
      {/* Fixed Top Shell Header */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-xs border-b border-outline-variant/30 pt-safe">
        <div className="h-14 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={onClose}
              aria-label="Go Back"
              type="button"
              className="w-9 h-9 flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 rounded-xl transition-all cursor-pointer flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className={`w-8 h-8 rounded-xl ${iconBgClass} text-white flex items-center justify-center font-black text-sm shadow-xs flex-shrink-0`}>
              <span className="material-symbols-outlined text-[19px]">{iconName}</span>
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-on-surface truncate">
                {titleText}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${badgeClass}`}>
                {badgeText}
              </span>
            </div>
          </div>

          {/* Top Bar Actions: Save Draft & Restore & Close */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {!isEditing && (
              <>
                {/* Restored Draft Status / Discard Pill */}
                {hasRestoredDraft && (
                  <div
                    data-testid="purchase-draft-banner"
                    className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs font-semibold animate-fadeIn"
                    title="Draft auto-restored"
                  >
                    <span className="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400 shrink-0">
                      restore_page
                    </span>
                    <span className="hidden sm:inline">Restored Unsaved Draft</span>
                    <span className="sm:hidden">Restored</span>
                    {onDiscardDraft && (
                      <button
                        type="button"
                        onClick={onDiscardDraft}
                        className="ml-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                        title="Discard this draft"
                      >
                        Discard Draft
                      </button>
                    )}
                  </div>
                )}

                {/* Restore Draft Button (when not currently restored, but draft exists in storage) */}
                {!hasRestoredDraft && hasDraftInStorage && onRestoreDraft && (
                  <button
                    type="button"
                    onClick={onRestoreDraft}
                    data-testid="purchase-restore-draft-btn"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                    title="Restore previously saved draft"
                  >
                    <span className="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400">
                      restore
                    </span>
                    <span>Restore Draft</span>
                  </button>
                )}

                {/* Save Draft Button */}
                {onSaveDraft && (
                  <button
                    type="button"
                    onClick={onSaveDraft}
                    data-testid="purchase-save-draft-btn"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/40 text-xs font-semibold active:scale-95 transition-all cursor-pointer shadow-2xs"
                    title="Save current progress as draft"
                  >
                    <span className="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400">
                      bookmark
                    </span>
                    <span className="hidden xs:inline">Save Draft</span>
                  </button>
                )}
              </>
            )}

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
              {selectedSupplier?.isComposition && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    data-testid="purchase-composition-badge"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30"
                  >
                    <span className="material-symbols-outlined text-[11px]">warning</span>
                    Composition Dealer — ITC Ineligible
                  </span>
                </div>
              )}
            </div>
          </button>

          {selectedSupplier && (
            <div className="flex items-center gap-1 shrink-0">
              {selectedSupplier.isComposition && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300/60">
                  <span className="material-symbols-outlined text-[12px]">warning</span>
                  Composition Dealer — ITC Ineligible
                </span>
              )}
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
                aria-label="Clear supplier"
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
            aria-label="Add new supplier"
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
            title={isChallan ? 'Change Purchase Challan Number' : isPo ? 'Change Purchase Order Number' : isReturn ? 'Change Debit Note Number' : 'Change Bill Number'}
          >
            <span className="text-[9px] uppercase font-bold text-outline">
              {isChallan ? 'Challan #:' : isPo ? 'PO #:' : isReturn ? 'DN #:' : 'Bill #:'}
            </span>
            <span className="font-bold text-on-surface truncate max-w-[120px]">{billNumber}</span>
            <span className="material-symbols-outlined text-[12px] text-outline">edit</span>
          </button>

          {/* Bill Date */}
          <button
            type="button"
            onClick={onOpenBillNoModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title={isChallan ? 'Change Challan Date' : isPo ? 'Change PO Date' : isReturn ? 'Change Debit Note Date' : 'Change Bill Date'}
          >
            <span className="material-symbols-outlined text-[13px] text-outline">calendar_today</span>
            <span>{billDate}</span>
          </button>

          {/* Due / Expected / Received Date */}
          <button
            type="button"
            onClick={onOpenDueDateModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title={isChallan ? 'Change Goods Receipt Date' : isPo ? 'Change Promised Delivery Date' : 'Change Payment Due Date'}
          >
            <span className="text-[9px] uppercase font-bold text-outline">
              {isChallan ? 'Received:' : isPo ? 'Expected:' : 'Due:'}
            </span>
            <span>{dueDate}</span>
            <span className="material-symbols-outlined text-[12px] text-outline">event</span>
          </button>

          {/* Challan Status Selector */}
          {isChallan && onChallanStatusChange && (
            <div className="h-7 px-2 rounded-lg bg-teal-500/10 text-teal-800 dark:text-teal-300 font-bold text-xs flex items-center gap-1 border border-teal-500/30">
              <span className="text-[9px] uppercase font-bold text-teal-700 dark:text-teal-400">Status:</span>
              <select
                aria-label="Challan Status"
                value={challanStatus || 'RECEIVED'}
                onChange={(e) => onChallanStatusChange?.(e.target.value as any)}
                className="bg-transparent font-bold text-xs text-teal-900 dark:text-teal-200 outline-none cursor-pointer"
              >
                <option value="RECEIVED" className="bg-surface text-on-surface">Received (In Stock)</option>
                <option value="IN_TRANSIT" className="bg-surface text-on-surface">In Transit</option>
                <option value="DRAFT" className="bg-surface text-on-surface">Draft</option>
              </select>
            </div>
          )}

          {/* PO Status Badge */}
          {isPo && (
            <div className="h-7 px-2 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] flex items-center gap-1 border border-indigo-500/25">
              <span className="material-symbols-outlined text-[13px]">pending_actions</span>
              <span>Status: {orderStatus || 'PENDING'}</span>
            </div>
          )}

          {/* Purchase Return (Debit Note) Reference Fields */}
          {isReturn && (
            <>
              <div className="h-7 px-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 font-medium text-xs flex items-center gap-1 border border-amber-500/30">
                <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400">Orig Bill #:</span>
                <input
                  type="text"
                  value={originalBillNumber || ''}
                  onChange={(e) => onOriginalBillNumberChange?.(e.target.value)}
                  placeholder="e.g. PB-001"
                  className="bg-transparent font-bold text-xs text-amber-900 dark:text-amber-200 outline-none w-20 sm:w-24 placeholder:text-amber-400/60"
                  title="Original Supplier Invoice Number"
                />
              </div>
              <div className="h-7 px-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 font-medium text-xs flex items-center gap-1 border border-amber-500/30">
                <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400">Orig Date:</span>
                <input
                  type="date"
                  value={originalBillDate || ''}
                  onChange={(e) => onOriginalBillDateChange?.(e.target.value)}
                  className="bg-transparent font-medium text-xs text-amber-900 dark:text-amber-200 outline-none cursor-pointer"
                  title="Original Supplier Invoice Date"
                />
              </div>
              <div className="h-7 px-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 font-medium text-xs flex items-center gap-1 border border-amber-500/30">
                <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400">Reason:</span>
                <select
                  aria-label="Return Reason"
                  value={returnReason || '01-Defective Goods'}
                  onChange={(e) => onReturnReasonChange?.(e.target.value)}
                  className="bg-transparent font-bold text-xs text-amber-900 dark:text-amber-200 outline-none cursor-pointer"
                >
                  <option value="01-Defective Goods" className="bg-surface text-on-surface">Defective Goods</option>
                  <option value="02-Quality Rejection" className="bg-surface text-on-surface">Quality Rejection</option>
                  <option value="03-Rate Difference" className="bg-surface text-on-surface">Rate Difference</option>
                  <option value="04-Wrong Shipment" className="bg-surface text-on-surface">Wrong Shipment</option>
                  <option value="05-Other" className="bg-surface text-on-surface">Other</option>
                </select>
              </div>
            </>
          )}

          {/* ITC Eligibility Selector */}
          {isGstActive && !isReturn && !isChallan && (
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

          {/* Reverse Charge Mechanism (RCM) Toggle */}
          {isGstActive && !isChallan && onRcmChange && (
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(isRcm)}
              onClick={() => onRcmChange(!isRcm)}
              className={`h-7 px-2 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer border ${
                isRcm
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                  : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant border-outline-variant/20'
              }`}
              title="Reverse Charge Mechanism (Section 9(3)/9(4) CGST Act)"
            >
              <span className="text-[9px] uppercase font-bold text-outline">RCM:</span>
              <span className="font-bold">{isRcm ? 'YES' : 'NO'}</span>
            </button>
          )}
        </div>

        {/* Transportation & GRN Details for Purchase Challan */}
        {isChallan && (
          <div className="mt-2 pt-2 border-t border-outline-variant/20 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[9px] font-bold uppercase text-outline">Vehicle No</label>
              <input
                type="text"
                value={vehicleNumber || ''}
                onChange={(e) => onVehicleNumberChange?.(e.target.value.toUpperCase())}
                placeholder="e.g. MH12AB1234"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-md px-2 py-1 text-xs font-mono font-medium outline-none text-on-surface"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase text-outline">Transporter</label>
              <input
                type="text"
                value={transporterName || ''}
                onChange={(e) => onTransporterNameChange?.(e.target.value)}
                placeholder="e.g. Transport Co"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-md px-2 py-1 text-xs font-medium outline-none text-on-surface"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase text-outline">LR / Consignment No</label>
              <input
                type="text"
                value={lrNumber || ''}
                onChange={(e) => onLrNumberChange?.(e.target.value)}
                placeholder="e.g. LR-12345"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-md px-2 py-1 text-xs font-mono font-medium outline-none text-on-surface"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase text-outline">E-Way Bill No</label>
              <input
                type="text"
                value={ewayBillNumber || ''}
                onChange={(e) => onEwayBillNumberChange?.(e.target.value)}
                placeholder="12-digit number"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-md px-2 py-1 text-xs font-mono font-medium outline-none text-on-surface"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
