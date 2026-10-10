import React from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { downloadEWayBillJson, EWAY_BILL_STATUTORY_THRESHOLD } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';

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
  // System back navigation (priority 25: closes preview before underlying screens)
  useBackNavigation(() => {
    onClose();
    return true;
  }, !!invoice, 25);

  if (!invoice) return null;

  const isPaid = invoice.paymentStatus === 'PAID';
  const isPartial = invoice.paymentStatus === 'PARTIAL';
  const isGstActive = company.isGstEnabled !== false && invoice.isGstInvoice !== false;

  const handleWhatsApp = () => {
    const url = getWhatsAppShareUrl(invoice, company);
    window.open(url, '_blank');
  };

  const handleDelete = () => {
    if (!onDeleteInvoice) return;
    if (window.confirm(`Are you sure you want to delete Invoice #${invoice.invoiceNumber}?`)) {
      onDeleteInvoice(invoice.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl p-3.5 sm:p-4 w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col gap-2.5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {onDeleteInvoice ? (
              <button
                type="button"
                onClick={handleDelete}
                className="w-8 h-8 rounded-xl bg-error/15 text-error hover:bg-error/25 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
                title="Delete Invoice"
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
                  Invoice #{invoice.invoiceNumber}
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
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

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
                  invoice.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-low/40">
                      <td className="py-1.5 px-2.5 min-w-0 text-left">
                        <div className="truncate font-bold text-on-surface" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[9px] text-on-surface-variant flex items-center gap-1 font-mono truncate">
                          {isGstActive && item.hsnSacCode && <span>HSN {item.hsnSacCode}</span>}
                          {isGstActive && item.hsnSacCode && <span>•</span>}
                          {isGstActive && <span className="text-secondary font-semibold">GST {item.gstRate || 0}%</span>}
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
                      No items in this invoice
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
                <span className="font-bold text-on-surface">{formatINR(invoice.totalTaxableAmount)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant text-[11px]">
                <span>Total Tax (GST)</span>
                <span className="font-bold text-secondary">{formatINR(invoice.totalTax)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between pt-1 border-t border-outline-variant/20 font-bold text-sm text-on-surface">
            <span>Total Invoice Value</span>
            <span className="font-black text-on-surface font-currency-display-mobile">
              {formatINR(invoice.grandTotal)}
            </span>
          </div>
        </div>

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

        {/* Bottom Actions Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-outline-variant/20">
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
                  const proceed = confirm(
                    `Notice: Invoice value (₹${invoice.grandTotal.toFixed(2)}) is below the statutory ₹50,000 threshold for mandatory e-Way bill generation under Rule 138 of CGST Rules.\n\nDo you still want to generate the JSON payload?`
                  );
                  if (!proceed) return;
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
    </div>
  );
};
