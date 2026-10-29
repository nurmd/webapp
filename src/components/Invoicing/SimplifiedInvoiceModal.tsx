import React from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { downloadEWayBillJson, EWAY_BILL_STATUTORY_THRESHOLD } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { WhatsAppShareModal } from '../Common/WhatsAppShareModal.tsx';
import { db } from '../../services/db.ts';
import { InvoiceDocumentModal } from './InvoiceDocumentModal.tsx';
import { DocumentLineItemsGrid } from '../Common/Billing/DocumentLineItemsGrid.tsx';
import { DocumentTaxSummary } from '../Common/Billing/DocumentTaxSummary.tsx';

export interface SimplifiedInvoiceModalProps {
  invoice: Invoice | null;
  company: CompanyProfile;
  onClose: () => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onDeleteInvoice?: (id: string) => void;
  onOpenFullA4Preview?: (invoice: Invoice) => void;
  onPrintInvoice?: (invoice: Invoice) => void;
}

export const SimplifiedInvoiceModal: React.FC<SimplifiedInvoiceModalProps> = ({
  invoice,
  company,
  onClose,
  onEditInvoice,
  onDeleteInvoice,
  onOpenFullA4Preview,
  onPrintInvoice,
}) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [showEwayThresholdWarning, setShowEwayThresholdWarning] = React.useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = React.useState(false);

  const party = React.useMemo(() => {
    if (!invoice || (!invoice.partyName && !invoice.partyId)) return null;
    try {
      const parties = db.getParties();
      return (
        parties.find(
          (p) =>
            (invoice.partyId && p.id === invoice.partyId) ||
            (invoice.partyName && p.name.trim().toLowerCase() === invoice.partyName.trim().toLowerCase())
        ) || null
      );
    } catch {
      return null;
    }
  }, [invoice?.partyId, invoice?.partyName]);

  if (!invoice) return null;

  const isPaid = invoice.paymentStatus === 'PAID';
  const isPartial = invoice.paymentStatus === 'PARTIAL';
  const isGstActive = company.isGstEnabled !== false && invoice.isGstInvoice !== false;

  const handleWhatsApp = () => {
    setIsWhatsAppOpen(true);
  };

  const handleDelete = () => {
    if (!onDeleteInvoice) return;
    setIsDeleteModalOpen(true);
  };

  const titleNode = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <h3 className="font-bold text-sm text-on-surface truncate">
        {company.isCompositionScheme ? `Bill of Supply #${invoice.invoiceNumber}` : `Invoice #${invoice.invoiceNumber}`}
      </h3>
      {company.isCompositionScheme && (
        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-secondary-container text-on-secondary-container">
          Composition
        </span>
      )}
      <span
        className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
          isPaid
            ? 'bg-secondary/15 text-secondary'
            : isPartial
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : 'bg-error/15 text-error'
        }`}
      >
        {invoice.paymentStatus}
      </span>
    </div>
  );

  const leadingAction = onDeleteInvoice ? (
    <button
      type="button"
      onClick={handleDelete}
      className="w-8 h-8 rounded-xl bg-error/15 text-error hover:bg-error/25 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
      title="Delete Invoice"
      aria-label="Delete invoice"
    >
      <span className="material-symbols-outlined text-[18px]">delete</span>
    </button>
  ) : (
    <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-[18px]">receipt_long</span>
    </div>
  );

  const footerNode = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Print Button (Thermal) */}
      {onPrintInvoice && (
        <button
          type="button"
          onClick={() => onPrintInvoice(invoice)}
          className="flex-1 min-w-[100px] py-2 px-3 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 hover:bg-secondary/90 transition-all"
          title="Print Thermal POS Receipt"
        >
          <span className="material-symbols-outlined text-[16px]">print</span>
          <span>Print</span>
        </button>
      )}

      {/* A4 / PDF Button */}
      {onOpenFullA4Preview && (
        <button
          type="button"
          onClick={() => onOpenFullA4Preview(invoice)}
          className="flex-1 min-w-[100px] py-2 px-3 rounded-xl bg-surface-container text-on-surface border border-outline-variant/30 font-bold text-xs shadow-xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-all"
          title="View full A4 / PDF layout & print"
        >
          <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
          <span>A4 / PDF</span>
        </button>
      )}

      {/* WhatsApp Share Button */}
      <button
        type="button"
        onClick={handleWhatsApp}
        className="flex-1 min-w-[100px] py-2 px-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all"
        title="Share via WhatsApp"
      >
        <span className="material-symbols-outlined text-[16px]">send</span>
        <span>WhatsApp</span>
      </button>

      {/* Edit Invoice Button */}
      {onEditInvoice && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onEditInvoice(invoice);
          }}
          className="py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all"
          title="Edit Invoice"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
          <span>Edit</span>
        </button>
      )}

      {/* E-Way JSON export */}
      {isGstActive && (
        <button
          type="button"
          onClick={() => {
            if (invoice.grandTotal < EWAY_BILL_STATUTORY_THRESHOLD) {
              setShowEwayThresholdWarning(true);
              return;
            }
            downloadEWayBillJson(company, invoice);
          }}
          className="py-2 px-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all"
          title="Download E-Way Bill JSON"
        >
          <span className="material-symbols-outlined text-[16px]">local_shipping</span>
          <span>E-Way</span>
        </button>
      )}

      {/* E-Invoice JSON export */}
      {isGstActive && (
        <button
          type="button"
          onClick={() => downloadEInvoiceJson(company, invoice)}
          className="py-2 px-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all"
          title="Download E-Invoice JSON"
        >
          <span className="material-symbols-outlined text-[16px]">receipt_long</span>
          <span>E-Inv</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      <InvoiceDocumentModal
        isOpen={!!invoice}
        onClose={onClose}
        title={titleNode}
        headerLeading={leadingAction}
        closeAriaLabel="Close invoice details"
        maxWidth="md"
        customFooter={footerNode}
        backNavPriority={25}
      >
        {/* Compact Customer Details */}
        {isGstActive && (
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-low/70 py-1.5 px-2.5 rounded-xl">
            <span>
              GSTIN: <strong className="font-mono text-on-surface">{invoice.partyGstin || 'Unregistered'}</strong>
            </span>
            <span>
              POS: <strong className="text-on-surface">State {invoice.placeOfSupplyStateCode || company.stateCode}</strong>
            </span>
          </div>
        )}

        {/* Ship-to Destination Summary */}
        {(invoice.shippingAddress || invoice.shippingPincode) && (
          <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant bg-surface-container-low/60 px-2.5 py-1.5 rounded-xl">
            <span className="material-symbols-outlined text-[14px] text-secondary">local_shipping</span>
            <span className="font-semibold text-outline uppercase text-[10px]">Ship-to:</span>
            <span className="truncate text-on-surface font-medium">
              {invoice.shippingAddress || 'Consignee Address'}
              {invoice.shippingPincode ? ` (${invoice.shippingPincode})` : ''}
            </span>
          </div>
        )}

        {/* Purchased Items Table View */}
        <DocumentLineItemsGrid
          mode="compact"
          kind="invoice"
          rows={invoice.items}
          isGstActive={isGstActive}
          isCompositionScheme={company.isCompositionScheme}
        />

        {/* Financial Breakdown */}
        <DocumentTaxSummary
          variant="compact"
          title="Total Invoice Value"
          totalTaxableAmount={invoice.totalTaxableAmount}
          totalTax={invoice.totalTax}
          totalCess={invoice.totalCess}
          finalGrandTotal={invoice.grandTotal}
          isGstActive={isGstActive}
          isCompositionScheme={company.isCompositionScheme}
          accentColor="secondary"
        />

        {/* Compact Payment Status Bar */}
        <div className="flex flex-col gap-1 px-3 py-1.5 rounded-xl bg-surface-container text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant font-medium">
              Payment ({invoice.paymentMode === 'SPLIT' ? 'Split Tender' : (invoice.paymentMode || 'Cash')}):
            </span>
            <span className="text-[11px] font-bold">
              {invoice.balanceAmount <= 0.01 ? (
                <span className="text-secondary flex items-center gap-1 font-bold">
                  <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  Fully Settled
                </span>
              ) : (
                <span className="text-on-surface">
                  Paid: <span className="text-secondary">{formatINR(invoice.paidAmount)}</span> • Due:{' '}
                  <span className="text-error">{formatINR(invoice.balanceAmount)}</span>
                </span>
              )}
            </span>
          </div>
          {/* Split Tender Breakdown */}
          {((invoice.paymentSplits && invoice.paymentSplits.length > 1) || (invoice.notes && invoice.notes.includes('Split'))) && (
            <div className="flex flex-wrap gap-1.5 pt-0.5 border-t border-outline-variant/15 text-[10px]">
              {invoice.paymentSplits && invoice.paymentSplits.length > 0
                ? invoice.paymentSplits
                    .filter((s) => s.mode !== 'CREDIT' && s.amount > 0)
                    .map((s, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 rounded bg-surface-container-high font-semibold text-on-surface-variant">
                        {s.mode}: {formatINR(s.amount)}
                      </span>
                    ))
                : (invoice.notes?.replace('Split Payment — ', '') || '').split(', ').map((chunk, idx) => (
                    <span key={idx} className="px-1.5 py-0.5 rounded bg-surface-container-high font-semibold text-on-surface-variant">
                      {chunk}
                    </span>
                  ))}
            </div>
          )}
        </div>
      </InvoiceDocumentModal>

      {/* Delete Invoice Confirmation Modal */}
      {isDeleteModalOpen && (
        <ConfirmDeleteModal
          isOpen={isDeleteModalOpen}
          title="Delete Invoice?"
          recordName={`Invoice #${invoice.invoiceNumber}`}
          description="Are you sure you want to delete this invoice? This will restore inventory stock."
          confirmText="Delete Invoice"
          onConfirm={() => {
            onDeleteInvoice?.(invoice.id);
            onClose();
          }}
          onClose={() => setIsDeleteModalOpen(false)}
        />
      )}

      {/* E-Way Bill Statutory Threshold Advisory Modal */}
      {showEwayThresholdWarning && (
        <ConfirmDeleteModal
          isOpen={showEwayThresholdWarning}
          title="Generate E-Way Bill JSON?"
          recordName={`Invoice #${invoice.invoiceNumber}`}
          description={`Notice: Invoice value (₹${invoice.grandTotal.toFixed(2)}) is below the statutory ₹50,000 threshold for mandatory e-Way bill generation under Rule 138 of CGST Rules.\n\nDo you still want to generate the JSON payload?`}
          confirmText="Generate JSON"
          cancelText="Cancel"
          onConfirm={() => downloadEWayBillJson(company, invoice)}
          onClose={() => setShowEwayThresholdWarning(false)}
        />
      )}

      {/* Interactive WhatsApp Delivery & Reminders Modal */}
      {isWhatsAppOpen && (
        <WhatsAppShareModal
          isOpen={isWhatsAppOpen}
          onClose={() => setIsWhatsAppOpen(false)}
          company={company}
          invoice={invoice}
          party={party || undefined}
          initialPartyName={invoice.partyName}
          initialPhone={invoice.partyPhone || party?.phone}
          initialBalance={invoice.balanceAmount}
          initialTemplate="INVOICE_DELIVERY"
        />
      )}
    </>
  );
};
