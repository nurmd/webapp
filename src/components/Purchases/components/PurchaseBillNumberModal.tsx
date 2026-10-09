import React, { useState, useEffect } from 'react';
import { getStateList } from '../../../core/gst/stateCodes.ts';

export interface PurchaseBillNumberModalProps {
  isOpen: boolean;
  billNumber: string;
  billDate: string;
  supplierStateCode: string;
  onApply: (params: { billNumber: string; billDate: string; supplierStateCode: string }) => void;
  onClose: () => void;
}

export const PurchaseBillNumberModal: React.FC<PurchaseBillNumberModalProps> = ({
  isOpen,
  billNumber,
  billDate,
  supplierStateCode,
  onApply,
  onClose,
}) => {
  const [customBillNo, setCustomBillNo] = useState(billNumber);
  const [currentBillDate, setCurrentBillDate] = useState(billDate);
  const [currentSupplierStateCode, setCurrentSupplierStateCode] = useState(supplierStateCode);

  useEffect(() => {
    if (isOpen) {
      setCustomBillNo(billNumber);
      setCurrentBillDate(billDate);
      setCurrentSupplierStateCode(supplierStateCode);
    }
  }, [isOpen, billNumber, billDate, supplierStateCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3.5">
        <h3 className="font-headline-sm text-base font-bold text-on-surface">Edit Bill Number &amp; Date</h3>
        <div>
          <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
            Vendor Bill / Invoice Number
          </label>
          <input
            type="text"
            value={customBillNo}
            onChange={(e) => setCustomBillNo(e.target.value)}
            placeholder="e.g. PB-2024-001"
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-on-surface-variant block mb-1">Bill Date</label>
          <input
            type="date"
            value={currentBillDate}
            onChange={(e) => setCurrentBillDate(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-on-surface-variant block mb-1">Supplier State</label>
          <select
            value={currentSupplierStateCode}
            onChange={(e) => setCurrentSupplierStateCode(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
          >
            {getStateList().map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply({
                billNumber: customBillNo.trim() || billNumber,
                billDate: currentBillDate,
                supplierStateCode: currentSupplierStateCode,
              });
              onClose();
            }}
            className="flex-1 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-label-md text-xs font-bold shadow-sm cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
