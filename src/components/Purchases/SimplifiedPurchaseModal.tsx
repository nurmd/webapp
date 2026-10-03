import React from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export interface SimplifiedPurchaseModalProps {
  bill: PurchaseBill | null;
  company: CompanyProfile;
  onClose: () => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onDeletePurchase?: (id: string) => void;
}

export const SimplifiedPurchaseModal: React.FC<SimplifiedPurchaseModalProps> = ({
  bill,
  company: _company,
  onClose,
  onEditPurchase,
  onDeletePurchase,
}) => {
  // System hardware back navigation (priority 25: closes preview before underlying screens)
  useBackNavigation(() => {
    onClose();
    return true;
  }, !!bill, 25);

  if (!bill) return null;

  const isPaid = bill.paymentStatus === 'PAID';
  const isPartial = bill.paymentStatus === 'PARTIAL';

  const handleDelete = () => {
    if (!onDeletePurchase) return;
    if (window.confirm(`Are you sure you want to delete Purchase Bill #${bill.billNumber}?`)) {
      onDeletePurchase(bill.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl p-3.5 sm:p-4 w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col gap-2.5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-sm text-on-surface truncate">
                  Bill #{bill.billNumber}
                </h3>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                    isPaid
                      ? 'bg-secondary/15 text-secondary'
                      : isPartial
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-error/15 text-error'
                  }`}
                >
                  {bill.paymentStatus}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant truncate block">
                {bill.supplierName} • {bill.date}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Compact Supplier Details */}
        <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-low/70 py-1.5 px-2.5 rounded-xl">
          <span>
            GSTIN: <strong className="font-mono text-on-surface">{bill.supplierGstin || 'Unregistered'}</strong>
          </span>
          <span>
            ITC: <strong className="text-on-surface">{bill.itcEligibility === 'INELIGIBLE_17_5' ? 'Blocked' : 'Eligible'}</strong>
          </span>
        </div>

        {/* Purchased Items Table View */}
        <div className="rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
          <div className="max-h-48 overflow-y-auto overflow-x-hidden">
            <table className="w-full text-left text-[11px] border-collapse table-fixed">
              <thead className="sticky top-0 bg-surface-container-low text-on-surface-variant font-bold border-b border-outline-variant/20 z-10">
                <tr>
                  <th className="py-1.5 px-2.5 font-semibold w-[46%] text-left">Item</th>
                  <th className="py-1.5 px-2 text-center font-semibold w-[26%]">Qty × Rate</th>
                  <th className="py-1.5 px-2.5 text-right font-semibold w-[28%]">
                    <span className="block text-right">Total</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                {bill.items && bill.items.length > 0 ? (
                  bill.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-low/40">
                      <td className="py-1.5 px-2.5 min-w-0 text-left">
                        <div className="truncate font-bold text-on-surface" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[9px] text-on-surface-variant flex items-center gap-1 font-mono truncate">
                          {item.hsnSacCode && <span>HSN {item.hsnSacCode}</span>}
                          {item.hsnSacCode && <span>•</span>}
                          <span className="text-orange-600 dark:text-orange-400 font-semibold">
                            GST {item.gstRate || 0}%
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-center min-w-0">
                        <div className="font-mono font-medium text-on-surface truncate text-center">
                          {item.quantity} <span className="text-[9px] text-on-surface-variant">{item.unit || 'PCS'}</span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant font-mono truncate text-center">
                          @ {formatINR(item.unitPrice)}
                        </div>
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono font-bold text-on-surface whitespace-nowrap tabular-nums">
                        <div className="w-full text-right flex justify-end">
                          <span>{formatINR(item.totalAmount)}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-on-surface-variant text-xs">
                      No items recorded in this bill
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="p-2.5 rounded-xl bg-surface-container-low space-y-1 text-xs">
          <div className="flex justify-between text-on-surface-variant text-[11px]">
            <span>Taxable Amount</span>
            <span className="font-bold text-on-surface">{formatINR(bill.totalTaxableAmount)}</span>
          </div>
          <div className="flex justify-between text-on-surface-variant text-[11px]">
            <span>Total Tax (GST / ITC)</span>
            <span className="font-bold text-orange-600 dark:text-orange-400">
              {formatINR(bill.totalTax)}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-outline-variant/20 font-bold text-sm text-on-surface">
            <span>Total Bill Value</span>
            <span className="font-black text-on-surface font-currency-display-mobile">
              {formatINR(bill.grandTotal)}
            </span>
          </div>
        </div>

        {/* Compact Payment Status Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-container text-xs">
          <span className="text-[11px] text-on-surface-variant font-medium">
            Payment ({bill.paymentMode || 'Cash'}):
          </span>
          <span className="text-[11px] font-bold">
            {bill.balanceAmount <= 0.01 ? (
              <span className="text-secondary flex items-center gap-1 font-bold">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                Fully Settled
              </span>
            ) : (
              <span className="text-on-surface">
                Paid: <span className="text-secondary">{formatINR(bill.paidAmount)}</span> • Due:{' '}
                <span className="text-error">{formatINR(bill.balanceAmount)}</span>
              </span>
            )}
          </span>
        </div>

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-outline-variant/20">
          {/* Delete Bill Button */}
          {onDeletePurchase && (
            <button
              type="button"
              onClick={handleDelete}
              className="py-2 px-3 rounded-xl text-error hover:bg-error/10 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
              title="Delete Purchase Bill"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              <span>Delete</span>
            </button>
          )}

          {/* Edit Bill Button */}
          {onEditPurchase && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditPurchase(bill);
              }}
              className="py-2 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all shadow-xs"
              title="Edit Purchase Bill"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span>Edit Bill</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
