import React from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { printPurchaseBill } from '../../core/utils/purchaseDocumentPrinter.ts';
import { generatePdfNative } from '../../core/utils/printBridge.ts';
import { PurchaseDocumentModal } from './PurchaseDocumentModal.tsx';
import { DocumentLineItemsGrid } from '../Common/Billing/DocumentLineItemsGrid.tsx';
import { DocumentTaxSummary } from '../Common/Billing/DocumentTaxSummary.tsx';

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

  const titleNode = (
    <div className="flex items-center gap-1.5 flex-wrap">
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
  );

  const handlePrint = () => {
    const jobName = `Purchase-${bill.billNumber || bill.id}`;
    if (generatePdfNative(jobName)) {
      return;
    }
    printPurchaseBill(company, bill);
  };

  const footerNode = (
    <div className="flex items-center justify-end gap-2">
      {/* Print Button */}
      <button
        type="button"
        onClick={handlePrint}
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
  );

  return (
    <>
      <PurchaseDocumentModal
        isOpen={!!bill}
        onClose={onClose}
        title={titleNode}
        headerLeading={
          <div className={`w-8 h-8 rounded-xl ${headerIconBg} flex items-center justify-center flex-shrink-0`}>
            <span className="material-symbols-outlined text-[18px]">{headerIcon}</span>
          </div>
        }
        closeAriaLabel="Close purchase details"
        maxWidth="md"
        customFooter={footerNode}
        backNavPriority={25}
      >
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
        <DocumentLineItemsGrid
          mode="compact"
          kind="purchase"
          rows={bill.items}
          isGstActive={isGstActive}
          isCompositionScheme={company.isCompositionScheme}
        />

        {/* Financial Breakdown */}
        <DocumentTaxSummary
          variant="compact"
          title="Total Bill Value"
          totalTaxableAmount={bill.totalTaxableAmount}
          totalTax={bill.totalTax}
          totalCess={bill.totalCess}
          finalGrandTotal={bill.grandTotal}
          isGstActive={isGstActive}
          isCompositionScheme={company.isCompositionScheme}
          accentColor="orange"
        />

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
      </PurchaseDocumentModal>

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
    </>
  );
};
