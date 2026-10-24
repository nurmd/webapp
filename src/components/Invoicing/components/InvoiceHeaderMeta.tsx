import React from 'react';
import { Party } from '../../../models/party.ts';
import { Invoice, InvoiceType } from '../../../models/invoice.ts';
import { formatINR } from '../../../core/utils/formatters.ts';
import { suggestNextUniqueInvoiceNumber } from '../../../core/utils/invoiceNumber.ts';

export interface InvoiceHeaderMetaProps {
  onClose: () => void;
  initialInvoice?: Invoice | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  posStateCode: string;
  isGstActive: boolean;
  isIntraState: boolean;
  selectedParty: Party | null;
  currentConflict: Invoice | null;
  invoiceConflictError: string | null;
  allInvoices: Invoice[];
  onSelectPartyClick: () => void;
  onClearParty: () => void;
  onAddPartyClick: () => void;
  onOpenInvoiceNumberModal: () => void;
  onOpenDueDateModal: () => void;
  onAutoFixConflict: (newNumber: string) => void;

  // New optional props for P2-C and P2-D
  invoiceType?: InvoiceType;
  autoDetectedInvoiceType?: InvoiceType;
  isManualTypeOverride?: boolean;
  onInvoiceTypeChange?: (type: InvoiceType | null) => void;
  isRcm?: boolean;
  onRcmChange?: (isRcm: boolean) => void;
  isCompositionScheme?: boolean;

  // New optional props for P2-E
  shippingAddress?: string;
  shippingPincode?: string;
  onShippingAddressChange?: (address: string) => void;
  onShippingPincodeChange?: (pincode: string) => void;

  // Credit Note / Return Reference fields
  originalInvoiceNumber?: string;
  onOriginalInvoiceNumberChange?: (val: string) => void;
  originalInvoiceDate?: string;
  onOriginalInvoiceDateChange?: (val: string) => void;
  returnReason?: string;
  onReturnReasonChange?: (val: string) => void;

  // Order status
  orderStatus?: string;

  // Delivery Challan & Transportation fields
  challanStatus?: 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  onChallanStatusChange?: (status: 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED') => void;
  challanType?: 'SUPPLY_ON_APPROVAL' | 'JOB_WORK' | 'FOR_REMOVAL' | 'OTHERS';
  onChallanTypeChange?: (type: 'SUPPLY_ON_APPROVAL' | 'JOB_WORK' | 'FOR_REMOVAL' | 'OTHERS') => void;
  consigneeName?: string;
  onConsigneeNameChange?: (name: string) => void;
  vehicleNumber?: string;
  onVehicleNumberChange?: (val: string) => void;
  transporterName?: string;
  onTransporterNameChange?: (val: string) => void;
  transporterId?: string;
  onTransporterIdChange?: (val: string) => void;
  ewayBillNumber?: string;
  onEwayBillNumberChange?: (val: string) => void;

  // Draft props for top bar
  hasRestoredDraft?: boolean;
  hasDraftInStorage?: boolean;
  onSaveDraft?: () => void;
  onRestoreDraft?: () => void;
  onDiscardDraft?: () => void;
}

function formatDateDisplay(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  } catch {}
  return dateStr;
}

export const InvoiceHeaderMeta: React.FC<InvoiceHeaderMetaProps> = ({
  onClose,
  initialInvoice,
  invoiceNumber,
  invoiceDate,
  dueDate,
  posStateCode,
  isGstActive,
  isIntraState,
  selectedParty,
  currentConflict,
  invoiceConflictError,
  allInvoices,
  onSelectPartyClick,
  onClearParty,
  onAddPartyClick,
  onOpenInvoiceNumberModal,
  onOpenDueDateModal,
  onAutoFixConflict,
  invoiceType,
  autoDetectedInvoiceType,
  isManualTypeOverride,
  onInvoiceTypeChange,
  isRcm,
  onRcmChange,
  isCompositionScheme,
  shippingAddress,
  shippingPincode,
  onShippingAddressChange,
  onShippingPincodeChange,
  originalInvoiceNumber,
  onOriginalInvoiceNumberChange,
  originalInvoiceDate,
  onOriginalInvoiceDateChange,
  returnReason,
  onReturnReasonChange,
  orderStatus,
  challanStatus,
  onChallanStatusChange,
  challanType,
  onChallanTypeChange,
  consigneeName,
  onConsigneeNameChange,
  vehicleNumber,
  onVehicleNumberChange,
  transporterName,
  onTransporterNameChange,
  transporterId,
  onTransporterIdChange,
  ewayBillNumber,
  onEwayBillNumberChange,
  hasRestoredDraft = false,
  hasDraftInStorage = false,
  onSaveDraft,
  onRestoreDraft,
  onDiscardDraft,
}) => {
  const isSalesOrder = invoiceType === 'SALES_ORDER';
  const isCreditNote = invoiceType === 'CREDIT_NOTE';
  const isDebitNote = invoiceType === 'DEBIT_NOTE';
  const isQuotation = invoiceType === 'ESTIMATE';
  const isDeliveryChallan = invoiceType === 'DELIVERY_CHALLAN';

  const [isShippingExpanded, setIsShippingExpanded] = React.useState<boolean>(() => {
    return Boolean(
      isDeliveryChallan ||
      shippingAddress ||
      shippingPincode ||
      consigneeName ||
      vehicleNumber ||
      transporterName ||
      ewayBillNumber ||
      initialInvoice?.shippingAddress ||
      initialInvoice?.shippingPincode ||
      initialInvoice?.consigneeName ||
      initialInvoice?.vehicleNumber ||
      initialInvoice?.transporterName ||
      initialInvoice?.ewayBillNumber
    );
  });

  let titleText = 'New Invoice';
  let badgeText = '';
  let badgeClass = '';
  let iconSymbol = '₹';
  let iconBg = 'bg-secondary text-on-secondary';

  if (isSalesOrder) {
    titleText = initialInvoice ? `Edit Sales Order #${invoiceNumber}` : 'New Sales Order';
    badgeText = 'Sales Order';
    badgeClass = 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
    iconSymbol = 'assignment';
    iconBg = 'bg-blue-600 text-white';
  } else if (isCreditNote) {
    titleText = initialInvoice ? `Edit Sales Return #${invoiceNumber}` : 'New Sales Return (Credit Note)';
    badgeText = 'Credit Note (Return)';
    badgeClass = 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
    iconSymbol = 'assignment_return';
    iconBg = 'bg-rose-600 text-white';
  } else if (isDebitNote) {
    titleText = initialInvoice ? `Edit Debit Note #${invoiceNumber}` : 'New Debit Note';
    badgeText = 'Debit Note';
    badgeClass = 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
    iconSymbol = 'assignment_returned';
    iconBg = 'bg-amber-600 text-white';
  } else if (isQuotation) {
    titleText = initialInvoice ? `Edit Quotation #${invoiceNumber}` : 'New Quotation / Estimate';
    badgeText = 'Estimate / Quote';
    badgeClass = 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
    iconSymbol = 'description';
    iconBg = 'bg-amber-600 text-white';
  } else if (isDeliveryChallan) {
    titleText = initialInvoice ? `Edit Delivery Challan #${invoiceNumber}` : 'New Delivery Challan';
    badgeText = 'Delivery Challan';
    badgeClass = 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
    iconSymbol = 'local_shipping';
    iconBg = 'bg-indigo-600 text-white';
  } else if (isCompositionScheme) {
    titleText = initialInvoice ? `Edit Bill of Supply #${invoiceNumber}` : 'New Bill of Supply';
    badgeText = 'Composition Scheme';
    badgeClass = 'bg-secondary/15 text-secondary border-secondary/25';
    iconSymbol = '₹';
    iconBg = 'bg-secondary text-on-secondary';
  } else {
    titleText = initialInvoice ? `Edit Invoice #${invoiceNumber}` : 'New Invoice';
    if (isGstActive) {
      badgeText = isIntraState ? 'Intra-State GST' : 'Inter-State IGST';
      badgeClass = 'bg-secondary/10 text-secondary border border-secondary/20';
    }
    iconSymbol = '₹';
    iconBg = 'bg-secondary text-on-secondary';
  }

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
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>

            <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center font-black text-sm shadow-xs flex-shrink-0`}>
              {iconSymbol === '₹' ? '₹' : <span className="material-symbols-outlined text-[19px]">{iconSymbol}</span>}
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-bold text-sm sm:text-base text-on-surface truncate">
                {titleText}
              </h1>
              {badgeText && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${badgeClass}`}>
                  {badgeText}
                </span>
              )}
            </div>
          </div>

          {/* Top Bar Actions: Save Draft & Restore & Close */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {!initialInvoice && (
              <>
                {/* Restored Draft Status / Discard Pill */}
                {hasRestoredDraft && (
                  <div
                    data-testid="invoice-draft-banner"
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
                    data-testid="invoice-restore-draft-btn"
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
                    data-testid="invoice-save-draft-btn"
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

      {/* Ultra-Compact Document Header Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3 py-2 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
        {/* Customer Pill / Selector */}
        <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
          <button
            type="button"
            onClick={onSelectPartyClick}
            className="flex items-center gap-2 hover:bg-surface-container-low px-2 py-1 rounded-lg transition-colors cursor-pointer group min-w-0 text-left"
            title="Select or Change Customer"
          >
            <div className="w-7 h-7 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-secondary group-hover:text-on-secondary transition-colors">
              <span className="material-symbols-outlined text-[17px]">person</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-secondary">
                  {selectedParty ? selectedParty.name : 'Walk-in Customer'}
                </span>
                <span className="material-symbols-outlined text-[14px] text-outline group-hover:text-secondary shrink-0">
                  swap_horiz
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant truncate">
                {selectedParty?.gstin && isGstActive ? (
                  <span className="font-mono font-semibold text-secondary">
                    GSTIN: {selectedParty.gstin}
                  </span>
                ) : (
                  <span className="text-outline">Cash Sale / Retail</span>
                )}
                {posStateCode && (
                  <span>· PoS: {posStateCode}</span>
                )}
              </div>
            </div>
          </button>

          {selectedParty && (
            <div className="flex items-center gap-1 shrink-0">
              {(selectedParty.currentBalance || 0) > 0 ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300/60">
                  Due: {formatINR(selectedParty.currentBalance || 0)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearParty();
                }}
                title="Clear customer (revert to Walk-in)"
                aria-label="Clear customer"
                className="w-6 h-6 rounded-md flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}

          {/* Direct Add New Customer Button */}
          <button
            type="button"
            onClick={onAddPartyClick}
            className="px-2 py-1 rounded-lg bg-secondary/10 hover:bg-secondary/20 text-secondary font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shrink-0 active:scale-95"
            title="Add New Customer Directly"
            aria-label="Add new customer"
          >
            <span className="material-symbols-outlined text-[15px]">person_add</span>
            <span className="hidden sm:inline">+ New</span>
          </button>
        </div>

        {/* Invoice Metadata Pills (Invoice No, Dates, Billing Mode) */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Invoice Number */}
          <button
            type="button"
            onClick={onOpenInvoiceNumberModal}
            className={`h-7 px-2 rounded-lg font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer border ${
              currentConflict
                ? 'bg-error/15 text-error border-error/50 hover:bg-error/25 animate-pulse'
                : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/20'
            }`}
            title={
              currentConflict
                ? `Conflicting invoice number! #${invoiceNumber} is already used by ${currentConflict.partyName || 'Customer'}`
                : 'Change Invoice Number'
            }
          >
            <span className="text-[9px] uppercase font-bold text-outline">No:</span>
            <span className="font-bold truncate max-w-[120px]">#{invoiceNumber}</span>
            <span className={`material-symbols-outlined text-[12px] ${currentConflict ? 'text-error font-bold' : 'text-outline'}`}>
              {currentConflict ? 'warning' : 'edit'}
            </span>
          </button>

          {/* Invoice Date */}
          <button
            type="button"
            onClick={onOpenInvoiceNumberModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title="Change Invoice Date"
          >
            <span className="material-symbols-outlined text-[13px] text-outline">calendar_today</span>
            <span>{formatDateDisplay(invoiceDate)}</span>
          </button>

          {/* Due / Delivery / Dispatch Date */}
          <button
            type="button"
            onClick={onOpenDueDateModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title={
              isDeliveryChallan
                ? 'Change Dispatch / Transit Date'
                : isSalesOrder
                ? 'Change Expected Delivery Date'
                : isQuotation
                ? 'Change Validity Date'
                : 'Change Due Date'
            }
          >
            <span className="text-[9px] uppercase font-bold text-outline">
              {isDeliveryChallan ? 'Dispatch:' : isSalesOrder ? 'Delivery:' : isQuotation ? 'Valid:' : 'Due:'}
            </span>
            <span>{formatDateDisplay(dueDate)}</span>
            <span className="material-symbols-outlined text-[12px] text-outline">event</span>
          </button>

          {/* Delivery Challan Status Selector */}
          {isDeliveryChallan && (
            <div
              data-testid="challan-status-selector"
              className="h-7 px-2 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] flex items-center gap-1 border border-indigo-500/25"
            >
              <span className="material-symbols-outlined text-[13px]">local_shipping</span>
              <span className="text-[9px] uppercase font-bold text-indigo-600 dark:text-indigo-400">Status:</span>
              <select
                aria-label="Challan Status"
                value={challanStatus || 'DISPATCHED'}
                onChange={(e) => onChallanStatusChange?.(e.target.value as any)}
                className="bg-transparent font-bold text-xs text-indigo-800 dark:text-indigo-200 outline-none cursor-pointer"
              >
                <option value="DRAFT" className="bg-surface text-on-surface">Draft</option>
                <option value="DISPATCHED" className="bg-surface text-on-surface">Dispatched</option>
                <option value="DELIVERED" className="bg-surface text-on-surface">Delivered</option>
                <option value="CANCELLED" className="bg-surface text-on-surface">Cancelled</option>
              </select>
            </div>
          )}

          {/* Delivery Challan Purpose (Rule 55) Selector */}
          {isDeliveryChallan && (
            <div
              data-testid="challan-type-selector"
              className="h-7 px-2 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold text-[11px] flex items-center gap-1 border border-teal-500/25"
            >
              <span className="material-symbols-outlined text-[13px]">assignment_turned_in</span>
              <span className="text-[9px] uppercase font-bold text-teal-600 dark:text-teal-400">Purpose:</span>
              <select
                aria-label="Challan Purpose (Rule 55)"
                value={challanType || 'FOR_REMOVAL'}
                onChange={(e) => onChallanTypeChange?.(e.target.value as any)}
                className="bg-transparent font-bold text-xs text-teal-800 dark:text-teal-200 outline-none cursor-pointer"
              >
                <option value="FOR_REMOVAL" className="bg-surface text-on-surface">For removal</option>
                <option value="SUPPLY_ON_APPROVAL" className="bg-surface text-on-surface">Supply on approval</option>
                <option value="JOB_WORK" className="bg-surface text-on-surface">Job work</option>
                <option value="OTHERS" className="bg-surface text-on-surface">Others</option>
              </select>
            </div>
          )}

          {/* Sales Order Status Badge */}
          {isSalesOrder && (
            <div className="h-7 px-2 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold text-[11px] flex items-center gap-1 border border-blue-500/25">
              <span className="material-symbols-outlined text-[13px]">pending_actions</span>
              <span>Status: {orderStatus || 'PENDING'}</span>
            </div>
          )}

          {/* Credit / Debit Note Return Reference Fields */}
          {(isCreditNote || isDebitNote) && (
            <>
              <div className="h-7 px-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 font-medium text-xs flex items-center gap-1 border border-rose-500/30">
                <span className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Orig Inv #:</span>
                <input
                  type="text"
                  value={originalInvoiceNumber || ''}
                  onChange={(e) => onOriginalInvoiceNumberChange?.(e.target.value)}
                  placeholder="e.g. INV-001"
                  className="bg-transparent font-bold text-xs text-rose-800 dark:text-rose-200 outline-none w-20 sm:w-24 placeholder:text-rose-400/60"
                  title="Original Invoice Number for GSTR Table 9B"
                />
              </div>
              <div className="h-7 px-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 font-medium text-xs flex items-center gap-1 border border-rose-500/30">
                <span className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Orig Date:</span>
                <input
                  type="date"
                  value={originalInvoiceDate || ''}
                  onChange={(e) => onOriginalInvoiceDateChange?.(e.target.value)}
                  className="bg-transparent font-medium text-xs text-rose-800 dark:text-rose-200 outline-none cursor-pointer"
                  title="Original Invoice Date"
                />
              </div>
              <div className="h-7 px-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 font-medium text-xs flex items-center gap-1 border border-rose-500/30">
                <span className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Reason:</span>
                <select
                  aria-label="Return Reason"
                  value={returnReason || '01-Sales Return'}
                  onChange={(e) => onReturnReasonChange?.(e.target.value)}
                  className="bg-transparent font-bold text-xs text-rose-800 dark:text-rose-200 outline-none cursor-pointer"
                >
                  <option value="01-Sales Return" className="bg-surface text-on-surface">Sales Return</option>
                  <option value="02-Defective Goods" className="bg-surface text-on-surface">Defective / Damaged</option>
                  <option value="03-Post Sale Discount" className="bg-surface text-on-surface">Post Sale Discount</option>
                  <option value="04-Deficiency in Services" className="bg-surface text-on-surface">Deficiency in Services</option>
                  <option value="05-Price Difference" className="bg-surface text-on-surface">Price Difference</option>
                  <option value="06-Other" className="bg-surface text-on-surface">Other</option>
                </select>
              </div>
            </>
          )}

          {/* Mode & PoS */}
          {isGstActive && (
            <div className="h-7 px-2 rounded-lg bg-secondary/10 text-secondary font-bold text-[11px] flex items-center gap-1 border border-secondary/20">
              <span>GST</span>
              <span className="text-[10px] font-mono opacity-80">({posStateCode})</span>
            </div>
          )}

          {/* Invoice Type Selector Dropdown */}
          {onInvoiceTypeChange && (
            <div className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors border border-outline-variant/20">
              <span className="text-[9px] uppercase font-bold text-outline">Type:</span>
              <select
                aria-label="Invoice Type"
                value={isManualTypeOverride ? (invoiceType || '') : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onInvoiceTypeChange(val ? (val as InvoiceType) : null);
                }}
                className="bg-transparent font-bold text-xs text-on-surface outline-none cursor-pointer"
                title="Invoice classification under GST"
              >
                <option value="" className="bg-surface text-on-surface">
                  Auto ({autoDetectedInvoiceType || 'B2CS'})
                </option>
                <option value="B2B" className="bg-surface text-on-surface">Regular / B2B</option>
                <option value="B2CS" className="bg-surface text-on-surface">B2C Small</option>
                <option value="B2CL" className="bg-surface text-on-surface">B2C Large (&gt; ₹2.5L)</option>
                <option value="EXPORT" className="bg-surface text-on-surface">Export</option>
                <option value="SEZ" className="bg-surface text-on-surface">SEZ Supply</option>
                <option value="CREDIT_NOTE" className="bg-surface text-on-surface">Credit Note (Sales Return)</option>
                <option value="DEBIT_NOTE" className="bg-surface text-on-surface">Debit Note</option>
                <option value="SALES_ORDER" className="bg-surface text-on-surface">Sales Order</option>
                <option value="ESTIMATE" className="bg-surface text-on-surface">Quotation / Estimate</option>
                <option value="DELIVERY_CHALLAN" className="bg-surface text-on-surface">Delivery Challan</option>
              </select>
              {isManualTypeOverride && (
                <span className="text-[9px] font-bold text-secondary uppercase bg-secondary/10 px-1 py-0.5 rounded">
                  Manual
                </span>
              )}
            </div>
          )}

          {/* RCM (Reverse Charge Mechanism) Toggle */}
          {isGstActive && onRcmChange && (
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(isRcm)}
              onClick={() => onRcmChange(!isRcm)}
              className={`h-7 px-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isRcm
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40 shadow-2xs'
                  : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant border-outline-variant/20'
              }`}
              title={
                isRcm
                  ? 'Reverse Charge Mechanism is ACTIVE: Tax payable by recipient under Sec 9(3)/9(4)'
                  : 'Reverse Charge Mechanism is INACTIVE (Forward Charge)'
              }
            >
              <span className="text-[10px] font-bold text-outline">Reverse Charge (RCM)</span>
              <span
                className={`w-2 h-2 rounded-full transition-colors ${
                  isRcm ? 'bg-amber-500 shadow-xs' : 'bg-outline-variant/60'
                }`}
              />
              <span className="text-[10px] font-bold">{isRcm ? 'YES' : 'NO'}</span>
            </button>
          )}

          {/* Shipping / Bill-to Ship-to Toggle Button */}
          {(onShippingAddressChange || onShippingPincodeChange) && (
            <button
              type="button"
              onClick={() => setIsShippingExpanded(!isShippingExpanded)}
              className={`h-7 px-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isShippingExpanded || shippingAddress || shippingPincode
                  ? 'bg-secondary/15 text-secondary border-secondary/40 shadow-2xs'
                  : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant border-outline-variant/20'
              }`}
              title="Configure separate Shipping Address & Pincode (Bill to / Ship to)"
            >
              <span className="material-symbols-outlined text-[13px]">local_shipping</span>
              <span className="hidden sm:inline">Ship-to:</span>
              <span className="font-bold">
                {shippingPincode || (shippingAddress ? 'Custom' : 'Same as Bill')}
              </span>
              <span className="material-symbols-outlined text-[12px]">
                {isShippingExpanded ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Bill-to Ship-to & Transport Panel */}
      {isShippingExpanded && (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-2.5 sm:p-3 shadow-2xs flex flex-col gap-3 text-xs animate-fade-in">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Consignee Name (Bill-to Ship-to Recipient) */}
            <div className="w-full md:w-1/3 flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-secondary">person_pin</span>
                Consignee / Recipient Name
              </label>
              <input
                type="text"
                value={consigneeName || ''}
                onChange={(e) => onConsigneeNameChange?.(e.target.value)}
                placeholder={selectedParty?.name || 'Consignee / Receiving party'}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-medium outline-none focus:ring-1 focus:ring-secondary/40"
              />
            </div>

            {/* Shipping Address */}
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px] text-secondary">local_shipping</span>
                  Shipping Address (Consignee / Ship-to)
                </label>
                {selectedParty?.billingAddress && (
                  <button
                    type="button"
                    onClick={() => {
                      onShippingAddressChange?.(selectedParty.billingAddress);
                      if (selectedParty.pincode) {
                        onShippingPincodeChange?.(selectedParty.pincode);
                      }
                    }}
                    className="text-[10px] font-semibold text-secondary hover:underline cursor-pointer"
                  >
                    Copy from Billing
                  </button>
                )}
              </div>
              <input
                type="text"
                value={shippingAddress || ''}
                onChange={(e) => onShippingAddressChange?.(e.target.value)}
                placeholder={selectedParty?.billingAddress || 'Enter destination delivery address (leave blank if same as billing)'}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-medium outline-none focus:ring-1 focus:ring-secondary/40"
              />
            </div>

            {/* Shipping Pincode */}
            <div className="w-full md:w-36 flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-secondary">pin_drop</span>
                Ship Pincode
              </label>
              <input
                type="text"
                maxLength={6}
                value={shippingPincode || ''}
                onChange={(e) => onShippingPincodeChange?.(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit PIN"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono font-medium outline-none focus:ring-1 focus:ring-secondary/40"
              />
            </div>
          </div>

          {/* Transportation / Logistics Details (Rule 55 / Rule 138) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-outline-variant/20">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-secondary">directions_car</span>
                Vehicle Number
              </label>
              <input
                type="text"
                value={vehicleNumber || ''}
                onChange={(e) => onVehicleNumberChange?.(e.target.value.toUpperCase())}
                placeholder="e.g. MH12AB1234"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono uppercase font-medium outline-none focus:ring-1 focus:ring-secondary/40"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-secondary">forklift</span>
                Transporter Name
              </label>
              <input
                type="text"
                value={transporterName || ''}
                onChange={(e) => onTransporterNameChange?.(e.target.value)}
                placeholder="e.g. VRL Logistics"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-medium outline-none focus:ring-1 focus:ring-secondary/40"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-secondary">badge</span>
                Transporter ID / GSTIN
              </label>
              <input
                type="text"
                maxLength={15}
                value={transporterId || ''}
                onChange={(e) => onTransporterIdChange?.(e.target.value.toUpperCase())}
                placeholder="15-digit TRANSIN"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono uppercase font-medium outline-none focus:ring-1 focus:ring-secondary/40"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-secondary">receipt</span>
                E-Way Bill Number
              </label>
              <input
                type="text"
                maxLength={12}
                value={ewayBillNumber || ''}
                onChange={(e) => onEwayBillNumberChange?.(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="12-digit E-Way Bill"
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono font-medium outline-none focus:ring-1 focus:ring-secondary/40"
              />
            </div>
          </div>
        </div>
      )}

      {/* Conflicting Invoice Alert Banner */}
      {(currentConflict || invoiceConflictError) && (
        <div className="bg-error-container/40 border border-error/40 text-error rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] shrink-0 text-error">warning</span>
            <div className="min-w-0">
              <span className="font-bold block">Conflicting Invoice Number: #{invoiceNumber}</span>
              <span className="text-[11px] opacity-90 truncate block">
                {invoiceConflictError || `Already issued to ${currentConflict?.partyName || 'Customer'} (${currentConflict?.date || 'earlier'}). Only unique invoice numbers are allowed.`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const autoNext = suggestNextUniqueInvoiceNumber(invoiceNumber, initialInvoice?.id, allInvoices);
              onAutoFixConflict(autoNext);
            }}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-error text-on-error font-bold text-xs hover:bg-error/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
          >
            <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
            <span>Auto-Fix</span>
          </button>
        </div>
      )}
    </>
  );
};
