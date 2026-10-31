import React, { useState, useMemo } from 'react';
import { Invoice, InvoiceItemEntry } from '../../models/invoice.ts';
import { PurchaseBill, PurchaseItemEntry } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { showAppToast } from '../../services/toast.ts';
import {
  getInvoiceReturnSummary,
  getPurchaseReturnSummary,
  calculateReturnLineEntries,
  executeSalesReturn,
  executePurchaseReturn,
} from '../../core/returns/returnEngine.ts';
import { db } from '../../services/db.ts';

export interface ReturnItemPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceDocument: Invoice | PurchaseBill | null;
  documentType: 'SALES' | 'PURCHASE';
  company: CompanyProfile;
  existingInvoices?: Invoice[];
  existingPurchases?: PurchaseBill[];
  onSuccess?: (returnDoc: Invoice | PurchaseBill, updatedSource: Invoice | PurchaseBill) => void;
}

export const ReturnItemPickerModal: React.FC<ReturnItemPickerModalProps> = ({
  isOpen,
  onClose,
  sourceDocument,
  documentType,
  company,
  existingInvoices,
  existingPurchases,
  onSuccess,
}) => {
  useBackNavigation(() => {
    if (isOpen) {
      onClose();
      return true;
    }
    return false;
  }, isOpen, 30);

  const [returnDate, setReturnDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [returnReason, setReturnReason] = useState<string>(
    documentType === 'SALES' ? '01-Sales Return' : '01-Defective Goods'
  );
  const [customReason, setCustomReason] = useState<string>('');

  // 1. Calculate return summary and available quantities
  const returnSummary = useMemo(() => {
    if (!sourceDocument) return null;
    if (documentType === 'SALES') {
      const invs = existingInvoices || db.getInvoices();
      return getInvoiceReturnSummary(sourceDocument as Invoice, invs);
    } else {
      const purs = existingPurchases || db.getPurchases();
      return getPurchaseReturnSummary(sourceDocument as PurchaseBill, purs);
    }
  }, [sourceDocument, documentType, existingInvoices, existingPurchases]);

  // 2. Local state for return quantities and selections
  // Initial state: select all items with available quantity > 0, default return quantity = available quantity
  const [itemSelections, setItemSelections] = useState<
    Record<string, { selected: boolean; returnQty: number }>
  >({});

  // Reset/sync selections whenever sourceDocument changes
  React.useEffect(() => {
    if (!returnSummary) return;
    const initial: Record<string, { selected: boolean; returnQty: number }> = {};
    returnSummary.items.forEach((item, index) => {
      const key = item.itemId || `line-${index}`;
      const defaultQty = item.availableQuantity;
      initial[key] = {
        selected: defaultQty > 0,
        returnQty: defaultQty,
      };
    });
    setItemSelections(initial);
  }, [returnSummary]);

  // 3. Calculate live line totals
  const liveCalculation = useMemo(() => {
    if (!returnSummary) return null;
    const selectionsForCalc: Array<{
      item: InvoiceItemEntry | PurchaseItemEntry;
      returnQuantity: number;
    }> = [];

    returnSummary.items.forEach((item, index) => {
      const key = item.itemId || `line-${index}`;
      const state = itemSelections[key];
      if (state && state.selected && state.returnQty > 0) {
        selectionsForCalc.push({
          item: item.originalItem,
          returnQuantity: state.returnQty,
        });
      }
    });

    return calculateReturnLineEntries(selectionsForCalc);
  }, [returnSummary, itemSelections]);

  if (!isOpen || !sourceDocument || !returnSummary) return null;

  const isSales = documentType === 'SALES';
  const docNumber = returnSummary.documentNumber;
  const partyName = returnSummary.partyName || (isSales ? 'Customer' : 'Supplier');

  const handleToggleSelect = (key: string, availableQty: number) => {
    setItemSelections((prev) => {
      const curr = prev[key] || { selected: false, returnQty: availableQty };
      const nextSelected = !curr.selected;
      return {
        ...prev,
        [key]: {
          selected: nextSelected,
          returnQty: nextSelected ? (curr.returnQty > 0 ? curr.returnQty : availableQty) : 0,
        },
      };
    });
  };

  const handleQtyChange = (key: string, rawVal: string, maxQty: number) => {
    const parsed = parseFloat(rawVal);
    let val = isNaN(parsed) ? 0 : parsed;
    if (val < 0) val = 0;
    if (val > maxQty) val = maxQty; // clamp <= available quantity

    setItemSelections((prev) => ({
      ...prev,
      [key]: {
        selected: val > 0,
        returnQty: val,
      },
    }));
  };

  const handleSetMax = (key: string, maxQty: number) => {
    setItemSelections((prev) => ({
      ...prev,
      [key]: {
        selected: maxQty > 0,
        returnQty: maxQty,
      },
    }));
  };

  const handleSetAllMax = () => {
    const updated: Record<string, { selected: boolean; returnQty: number }> = {};
    returnSummary.items.forEach((item, index) => {
      const key = item.itemId || `line-${index}`;
      updated[key] = {
        selected: item.availableQuantity > 0,
        returnQty: item.availableQuantity,
      };
    });
    setItemSelections(updated);
  };

  const handleConfirm = () => {
    if (!liveCalculation || liveCalculation.lines.length === 0 || liveCalculation.grandTotal <= 0) {
      showAppToast('Please select at least one item with a valid return quantity.');
      return;
    }

    const effectiveReason = returnReason === 'Other' ? (customReason.trim() || 'Other Return') : returnReason;

    const selectionsForExecution: Array<any> = [];
    returnSummary.items.forEach((item, index) => {
      const key = item.itemId || `line-${index}`;
      const state = itemSelections[key];
      if (state && state.selected && state.returnQty > 0) {
        selectionsForExecution.push({
          item: item.originalItem,
          returnQuantity: state.returnQty,
        });
      }
    });

    try {
      if (isSales) {
        const { creditNote, updatedSourceInvoice } = executeSalesReturn({
          sourceInvoice: sourceDocument as Invoice,
          returnedItems: selectionsForExecution,
          company,
          returnReason: effectiveReason,
          returnDate,
        });
        showAppToast(`Created Credit Note #${creditNote.invoiceNumber} linked to #${docNumber}`);
        onSuccess?.(creditNote, updatedSourceInvoice);
      } else {
        const { debitNote, updatedSourceBill } = executePurchaseReturn({
          sourceBill: sourceDocument as PurchaseBill,
          returnedItems: selectionsForExecution,
          company,
          returnReason: effectiveReason,
          returnDate,
        });
        showAppToast(`Created Debit Note #${debitNote.billNumber} linked to #${docNumber}`);
        onSuccess?.(debitNote, updatedSourceBill);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to create return document:', err);
      showAppToast(err?.message || 'Failed to create return document');
    }
  };

  const totalSelectedLines = liveCalculation?.lines.length || 0;
  const totalReturnQty = liveCalculation?.lines.reduce((s, l) => s + l.quantity, 0) || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-scrim/60 backdrop-blur-xs animate-fade-in"
      data-testid="return-item-picker-modal"
    >
      <div className="bg-surface-container-lowest w-full max-w-3xl rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-2xl">
                {isSales ? 'assignment_return' : 'assignment_turned_in'}
              </span>
              <h2 className="text-base sm:text-lg font-black text-on-surface tracking-tight truncate">
                {isSales ? 'Create Sale Return (Credit Note)' : 'Create Purchase Return (Debit Note)'}
              </h2>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5 truncate">
              Against {isSales ? 'Invoice' : 'Bill'} <span className="font-bold font-mono">#{docNumber}</span> ({partyName}) • Dated {formatDate(returnSummary.documentDate)}
            </p>
          </div>
          <button
            type="button"
            data-testid="close-item-picker-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Return Meta Inputs (Date & Reason) */}
        <div className="p-3 sm:p-4 bg-surface-container-lowest border-b border-outline-variant/15 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              Return Date
            </label>
            <input
              type="date"
              data-testid="return-date-input"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-outline-variant/40 bg-surface-container-low text-xs font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              Return Reason (GST Table 9B)
            </label>
            <select
              data-testid="return-reason-input"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-outline-variant/40 bg-surface-container-low text-xs font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <option value="01-Sales Return">01-Sales Return / Defective Goods</option>
              <option value="02-Post Sale Discount">02-Post Sale Discount / Rate Diff</option>
              <option value="03-Deficiency in Services">03-Deficiency in Services</option>
              <option value="04-Correction in Invoice">04-Correction in Invoice</option>
              <option value="05-Change in POS">05-Change in POS</option>
              <option value="Goods Damaged in Transit">Goods Damaged in Transit</option>
              <option value="Customer Cancellation">Customer Cancellation</option>
              <option value="Other">Other Reason...</option>
            </select>
            {returnReason === 'Other' && (
              <input
                type="text"
                placeholder="Specify return reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-1.5 w-full h-8 px-2.5 rounded-lg border border-outline-variant/40 bg-surface-container-low text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
              />
            )}
          </div>
        </div>

        {/* Line Items List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-on-surface-variant font-semibold px-1">
            <span>Select items to return:</span>
            <button
              type="button"
              onClick={handleSetAllMax}
              className="text-secondary hover:underline text-xs font-bold cursor-pointer"
            >
              Return All Available Items
            </button>
          </div>

          <div className="border border-outline-variant/20 rounded-xl overflow-hidden divide-y divide-outline-variant/15">
            {returnSummary.items.map((item, idx) => {
              const key = item.itemId || `line-${idx}`;
              const state = itemSelections[key] || { selected: false, returnQty: 0 };
              const isExhausted = item.availableQuantity <= 0;

              return (
                <div
                  key={key}
                  className={`p-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isExhausted
                      ? 'bg-surface-container-low/50 opacity-60'
                      : state.selected
                      ? 'bg-secondary/5'
                      : 'bg-surface-container-lowest'
                  }`}
                >
                  {/* Left: Checkbox & Item details */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      data-testid={`return-item-checkbox-${idx}`}
                      disabled={isExhausted}
                      checked={state.selected && !isExhausted}
                      onChange={() => handleToggleSelect(key, item.availableQuantity)}
                      className="mt-0.5 rounded text-secondary focus:ring-secondary h-4 w-4 cursor-pointer"
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                          {item.name}
                        </span>
                        {item.hsnSacCode && (
                          <span className="text-[10px] text-on-surface-variant font-mono bg-surface-container px-1 py-0.2 rounded">
                            HSN: {item.hsnSacCode}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-0.5">
                        <span>Rate: {formatINR(item.unitPrice)}</span>
                        <span>•</span>
                        <span>GST: {item.gstRate}%</span>
                        <span>•</span>
                        <span>Billed: {item.originalQuantity} {item.unit || 'units'}</span>
                      </div>

                      {item.returnedQuantity > 0 && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                          Already returned: {item.returnedQuantity} {item.unit || 'units'} (Available: {item.availableQuantity})
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Quantity Input & Max Button & Value */}
                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            data-testid={`return-qty-input-${idx}`}
                            disabled={isExhausted || !state.selected}
                            min="0"
                            max={item.availableQuantity}
                            step="any"
                            value={state.selected ? state.returnQty : 0}
                            onChange={(e) => handleQtyChange(key, e.target.value, item.availableQuantity)}
                            className="w-18 sm:w-20 h-8 px-2 text-center rounded-lg border border-outline-variant/40 bg-surface-container-low text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:bg-surface-container-high disabled:text-on-surface-variant/40"
                          />
                          <button
                            type="button"
                            disabled={isExhausted}
                            onClick={() => handleSetMax(key, item.availableQuantity)}
                            className="h-8 px-2 rounded-lg border border-outline-variant/30 hover:bg-surface-container-high text-[10px] font-bold text-secondary uppercase cursor-pointer disabled:opacity-40"
                            title="Return maximum available"
                          >
                            Max
                          </button>
                        </div>
                        <span className="text-[9px] text-on-surface-variant text-right">
                          max {item.availableQuantity}
                        </span>
                      </div>
                    </div>

                    <div className="w-24 text-right">
                      <span className="text-xs font-extrabold text-on-surface tabular-nums">
                        {formatINR((state.selected ? state.returnQty : 0) * item.unitPrice * (1 + item.gstRate / 100))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Summary & Confirm Button */}
        <div className="p-3 sm:p-4 bg-surface-container-low border-t border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-on-surface-variant font-medium">Selected: </span>
              <span className="font-extrabold text-on-surface">{totalSelectedLines} lines ({totalReturnQty} units)</span>
            </div>
            <div>
              <span className="text-on-surface-variant font-medium">Return Total: </span>
              <span className="text-sm font-black text-rose-700 dark:text-rose-400 tabular-nums">
                {formatINR(liveCalculation?.grandTotal || 0)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="cancel-return-btn"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-outline-variant/40 text-on-surface text-xs font-bold hover:bg-surface-container-high cursor-pointer transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              data-testid="confirm-return-btn"
              disabled={totalSelectedLines === 0 || (liveCalculation?.grandTotal || 0) <= 0}
              onClick={handleConfirm}
              className="h-9 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>Create Return ({formatINR(liveCalculation?.grandTotal || 0)})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
