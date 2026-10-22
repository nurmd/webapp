import React from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatQuantity } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';

export interface SimplifiedPurchaseModalProps {
  bill: PurchaseBill | null;
  company: CompanyProfile;
  onClose: () => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onDeletePurchase?: (id: string) => void;
}

export const SimplifiedPurchaseModal: React.FC<SimplifiedPurchaseModalProps> = ({
  bill,
  company,
  onClose,
  onEditPurchase,
  onDeletePurchase,
}) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);

  // System hardware back navigation (priority 25: closes preview before underlying screens)
  useBackNavigation(() => {
    onClose();
    return true;
  }, !!bill, 25);

  if (!bill) return null;

  const isChallan = bill.purchaseType === 'CHALLAN';
  const isPo = bill.purchaseType === 'PO';
  const isReturn = bill.purchaseType === 'RETURN';
  const isPaid = bill.paymentStatus === 'PAID';
  const isPartial = bill.paymentStatus === 'PARTIAL';
  const isGstActive = company.isGstEnabled !== false;

  const handleDelete = () => {
    if (!onDeletePurchase) return;
    setIsDeleteModalOpen(true);
  };

  const headerTitle = isChallan
    ? `Challan #${bill.billNumber}`
    : isPo
    ? `PO #${bill.billNumber}`
    : isReturn
    ? `Debit Note #${bill.billNumber}`
    : `Bill #${bill.billNumber}`;

  const headerIcon = isChallan
    ? 'move_to_inbox'
    : isPo
    ? 'add_shopping_cart'
    : isReturn
    ? 'assignment_turned_in'
    : 'shopping_bag';

  const headerIconBg = isChallan
    ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
    : isPo
    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
    : isReturn
    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    : 'bg-orange-500/15 text-orange-600 dark:text-orange-400';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 p-3 sm:p-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl ${headerIconBg} flex items-center justify-center flex-shrink-0`}>
              <span className="material-symbols-outlined text-[18px]">{headerIcon}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-sm text-on-surface truncate">
                  {headerTitle}
                </h3>
                {isChallan ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
                    {bill.isConverted ? 'CONVERTED' : (bill.challanStatus || 'RECEIVED')}
                  </span>
                ) : (
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
                )}
              </div>
              <span className="text-[11px] text-on-surface-variant truncate block">
                {bill.supplierName} • {bill.date}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
            title="Close"
            aria-label="Close purchase details"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-2.5">
          {/* Compact Supplier Details */}
        {isGstActive && (
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-low/70 py-1.5 px-2.5 rounded-xl">
            <span>
              GSTIN: <strong className="font-mono text-on-surface">{bill.supplierGstin || 'Unregistered'}</strong>
            </span>
            <span>
              ITC: <strong className="text-on-surface">{bill.itcEligibility === 'INELIGIBLE_17_5' || bill.itcEligibility === 'INELIGIBLE_OTHERS' ? 'Blocked' : 'Eligible'}</strong>
            </span>
          </div>
        )}

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
                          {isGstActive && item.hsnSacCode && <span>HSN {item.hsnSacCode}</span>}
                          {isGstActive && item.hsnSacCode && <span>•</span>}
                          {isGstActive && (
                            <span className="text-orange-600 dark:text-orange-400 font-semibold">
                              GST {item.gstRate || 0}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-center min-w-0">
                        <div className="font-mono font-medium text-on-surface truncate text-center">
                          {formatQuantity(item.quantity, 4)} <span className="text-[9px] text-on-surface-variant">{item.unit || 'PCS'}</span>
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
          {isGstActive && (
            <>
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
            </>
          )}
          <div className="flex justify-between pt-1 border-t border-outline-variant/20 font-bold text-sm text-on-surface">
            <span>Total Bill Value</span>
            <span className="font-black text-on-surface font-currency-display-mobile">
              {formatINR(bill.grandTotal)}
            </span>
          </div>
        </div>

        {/* Compact Status / Payment Bar */}
        {isChallan ? (
          <div className="flex flex-col gap-1 px-3 py-1.5 rounded-xl bg-teal-500/10 text-xs border border-teal-500/20">
            <div className="flex items-center justify-between text-teal-800 dark:text-teal-300">
              <span className="text-[11px] font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">inventory</span>
                Goods Receipt Note (GRN):
              </span>
              <span className="text-[11px] font-bold">
                {bill.isConverted ? `Converted to Bill #${bill.convertedToBillNumber}` : 'Inward Stock Recorded'}
              </span>
            </div>
            {(bill.vehicleNumber || bill.transporterName || bill.lrNumber || bill.ewayBillNumber) && (
              <div className="flex flex-wrap gap-2 pt-1 border-t border-teal-500/20 text-[10px] text-teal-700 dark:text-teal-300 font-medium">
                {bill.vehicleNumber && <span>Vehicle: {bill.vehicleNumber}</span>}
                {bill.transporterName && <span>Transporter: {bill.transporterName}</span>}
                {bill.lrNumber && <span>LR #: {bill.lrNumber}</span>}
                {bill.ewayBillNumber && <span>E-Way: {bill.ewayBillNumber}</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1 px-3 py-1.5 rounded-xl bg-surface-container text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-on-surface-variant font-medium">
                Payment ({bill.paymentMode === 'SPLIT' ? 'Split Tender' : (bill.paymentMode || 'Cash')}):
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
            {/* Split Tender Breakdown */}
            {((bill.paymentSplits && bill.paymentSplits.length > 1) || (bill.notes && bill.notes.includes('Split'))) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5 border-t border-outline-variant/15 text-[10px]">
                {bill.paymentSplits && bill.paymentSplits.length > 0
                  ? bill.paymentSplits
                      .filter((s) => s.mode !== 'CREDIT' && s.amount > 0)
                      .map((s, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-surface-container-high font-semibold text-on-surface-variant">
                          {s.mode}: {formatINR(s.amount)}
                        </span>
                      ))
                  : (bill.notes?.replace('Split Payment — ', '') || '').split(', ').map((chunk, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded bg-surface-container-high font-semibold text-on-surface-variant">
                        {chunk}
                      </span>
                    ))}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Bottom Actions Bar (Sticky Action Dock) */}
        <div className="flex items-center justify-end gap-2 p-3 sm:p-3.5 border-t border-outline-variant/20 bg-surface-container-low/40 flex-shrink-0">
          {/* Print Button */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.print) {
                window.print();
              }
            }}
            className="min-h-[44px] py-2 px-3.5 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            title={isChallan ? 'Print Purchase Challan' : 'Print Purchase Bill'}
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>Print</span>
          </button>

          {/* Delete Button */}
          {onDeletePurchase && (
            <button
              type="button"
              onClick={handleDelete}
              className="min-h-[44px] py-2 px-3.5 rounded-xl text-error hover:bg-error/10 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors active:scale-95"
              title={isChallan ? 'Delete Purchase Challan' : 'Delete Purchase Bill'}
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              <span>Delete</span>
            </button>
          )}

          {/* Edit Button */}
          {onEditPurchase && (!bill.isConverted || isPo) && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditPurchase(bill);
              }}
              className="min-h-[44px] py-2 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all shadow-xs"
              title={isChallan ? 'Edit Purchase Challan' : 'Edit Purchase Bill'}
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span>{isChallan ? 'Edit Challan' : isPo ? 'Edit PO' : 'Edit Bill'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <ConfirmDeleteModal
          isOpen={isDeleteModalOpen}
          title="Delete Purchase Bill?"
          recordName={`Bill #${bill.billNumber}`}
          description="Are you sure you want to delete this purchase bill? This will revert any stock added by this bill."
          confirmText="Delete Purchase"
          onConfirm={() => {
            onDeletePurchase?.(bill.id);
            onClose();
          }}
          onClose={() => setIsDeleteModalOpen(false)}
        />
      )}
    </div>
  );
};
