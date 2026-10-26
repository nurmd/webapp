import React from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatQuantity } from '../../core/utils/formatters.ts';
import { inclusiveFromExclusive } from '../../core/gst/pricing.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { downloadEWayBillJson, EWAY_BILL_STATUTORY_THRESHOLD } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { WhatsAppShareModal } from '../Common/WhatsAppShareModal.tsx';
import { db } from '../../services/db.ts';

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

  // System back navigation (priority 25: closes preview before underlying screens)
  useBackNavigation(() => {
    onClose();
    return true;
  }, !!invoice, 25);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 p-3 sm:p-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {onDeleteInvoice ? (
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
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
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
              <span className="text-[11px] text-on-surface-variant truncate block">
                {invoice.partyName || 'Cash Customer'} • {invoice.date}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
            title="Close"
            aria-label="Close invoice details"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-2.5">
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
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item, idx) => {
                    const isGst = isGstActive && !company.isCompositionScheme;
                    const priceMode = item.priceMode ?? 'EXCLUSIVE';
                    const storedInclusive = Number(item.unitPriceInclusive);
                    const inclusiveRate =
                      priceMode === 'INCLUSIVE'
                        ? (Number.isFinite(storedInclusive) && storedInclusive > 0
                            ? storedInclusive
                            : inclusiveFromExclusive(item.unitPrice, item.gstRate || 0))
                        : inclusiveFromExclusive(item.unitPrice, item.gstRate || 0);
                    const cess = Number(item.cessRate) || 0;
                    return (
                      <tr key={idx} className="hover:bg-surface-container-low/40">
                        <td className="py-1.5 px-2.5 min-w-0 text-left">
                          <div className="truncate font-bold text-on-surface" title={item.name}>
                            {item.name}
                          </div>
                          <div className="text-[9px] text-on-surface-variant flex items-center gap-1 font-mono truncate">
                            {isGstActive && item.hsnSacCode && <span>HSN {item.hsnSacCode}</span>}
                            {isGstActive && item.hsnSacCode && <span>•</span>}
                            {isGstActive && !company.isCompositionScheme && <span className="text-secondary font-semibold">GST {item.gstRate || 0}%</span>}
                            {isGst && cess > 0 && <span>• CESS {cess}%</span>}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-center min-w-0">
                          <div className="font-mono font-medium text-on-surface truncate text-center">
                            {formatQuantity(item.quantity, 4)} <span className="text-[9px] text-on-surface-variant">{item.unit || 'PCS'}</span>
                          </div>
                          <div className="text-[10px] text-on-surface-variant font-mono truncate text-center">
                            @ {formatINR(item.unitPrice)}
                          </div>
                          {isGst && (
                            <div className="text-[9px] text-on-surface-variant font-mono truncate text-center">
                              Incl. {formatINR(inclusiveRate)}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-on-surface whitespace-nowrap tabular-nums">
                          <div className="w-full text-right flex justify-end">
                            <span>{formatINR(item.totalAmount)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-on-surface-variant text-xs">
                      No items in this invoice
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Breakdown */}
        {(() => {
          const isGst = isGstActive && !company.isCompositionScheme;
          const totalCess = isGst ? (Number(invoice.totalCess) || 0) : 0;
          const gstOnly = Math.max(0, (Number(invoice.totalTax) || 0) - totalCess);
          return (
            <div className="p-2.5 rounded-xl bg-surface-container-low space-y-1 text-xs">
              {isGst && (
                <>
                  <div className="flex justify-between text-on-surface-variant text-[11px]">
                    <span>Taxable Amount</span>
                    <span className="font-bold text-on-surface">{formatINR(invoice.totalTaxableAmount)}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant text-[11px]">
                    <span>{totalCess > 0 ? 'GST' : 'Total Tax (GST)'}</span>
                    <span className="font-bold text-secondary">{formatINR(totalCess > 0 ? gstOnly : invoice.totalTax)}</span>
                  </div>
                  {totalCess > 0 && (
                    <div className="flex justify-between text-on-surface-variant text-[11px]">
                      <span>CESS</span>
                      <span className="font-bold text-secondary">{formatINR(totalCess)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between pt-1 border-t border-outline-variant/20 font-bold text-sm text-on-surface">
                <span>Total Invoice Value</span>
                <span className="font-black text-on-surface font-currency-display-mobile">
                  {formatINR(invoice.grandTotal)}
                </span>
              </div>
            </div>
          );
        })()}

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
        </div>

        {/* Bottom Actions Bar (Sticky Action Dock) */}
        <div className="flex flex-wrap items-center gap-2 p-3 sm:p-3.5 border-t border-outline-variant/20 bg-surface-container-low/40 flex-shrink-0">
          {/* Print Button */}
          {(onPrintInvoice || onOpenFullA4Preview) && (
            <button
              type="button"
              onClick={() => {
                if (onPrintInvoice) onPrintInvoice(invoice);
                else if (onOpenFullA4Preview) onOpenFullA4Preview(invoice);
              }}
              className="flex-1 min-w-[110px] py-2 px-3 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 hover:bg-secondary/90 transition-all"
              title="Print Thermal POS Receipt"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Print</span>
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
      </div>

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
    </div>
  );
};
