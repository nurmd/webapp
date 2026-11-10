import React from 'react';
import {
  Check,
  Copy,
  Building2,
  User,
  QrCode,
} from 'lucide-react';
import { formatDate, formatQuantity } from '../../../core/utils/formatters.ts';
import { InvoicePreviewModel, InvoiceCopyType } from './useInvoicePreviewModel.ts';

export interface MobileCardsDocumentProps {
  model: InvoicePreviewModel;
  copyType: InvoiceCopyType;
  copiedInvoiceNo?: boolean;
  handleCopyInvoiceNo?: () => void;
  copiedUpi?: boolean;
  handleCopyUpi?: () => void;
}

export const MobileCardsDocument: React.FC<MobileCardsDocumentProps> = ({
  model,
  copyType,
  copiedInvoiceNo = false,
  handleCopyInvoiceNo,
  copiedUpi = false,
  handleCopyUpi,
}) => {
  const {
    company,
    isGst,
    invoice,
    isDeliveryChallan,
    challanPurpose,
    sellerStateObj,
    posStateObj,
    posStateCode,
    party,
    totalUtgst,
    totalQuantity,
    itemsList,
    totalTaxable,
    totalCgst,
    totalSgst,
    totalIgst,
    totalCess,
    resolvedGrandTotal,
    wordsTotal,
    upiQrUrl,
  } = model;

  const onCopyInvoiceNo = handleCopyInvoiceNo || (() => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(invoice.invoiceNumber || '');
    }
  });

  const onCopyUpi = handleCopyUpi || (() => {
    if (company.upiId && navigator.clipboard) {
      navigator.clipboard.writeText(company.upiId);
    }
  });

  return (
    <div className="w-full max-w-xl mx-auto space-y-3 pb-6 text-on-surface text-xs no-print">
      {/* 1. Header Card: Invoice Meta & Status */}
      <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/30 shadow-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
            {invoice.invoiceType === 'DELIVERY_CHALLAN'
              ? 'DELIVERY CHALLAN'
              : company.isCompositionScheme
              ? 'BILL OF SUPPLY'
              : isGst
              ? 'TAX INVOICE'
              : 'RETAIL INVOICE'}
          </span>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase bg-surface-container px-2 py-0.5 rounded border border-outline-variant/30">
            {copyType}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-2">
          <div>
            <span className="text-[10px] text-on-surface-variant font-bold uppercase block">
              {isDeliveryChallan ? 'Challan Number' : 'Invoice Number'}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-base font-black text-on-surface font-mono">{invoice.invoiceNumber}</span>
              <button
                type="button"
                onClick={onCopyInvoiceNo}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant cursor-pointer transition-colors"
                title={isDeliveryChallan ? 'Copy challan number' : 'Copy invoice number'}
              >
                {copiedInvoiceNo ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Status Pill */}
          <div className="text-right">
            {isDeliveryChallan ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                {invoice.challanStatus || 'DELIVERED'}
              </span>
            ) : invoice.balanceAmount <= 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                PAID
              </span>
            ) : invoice.paidAmount > 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                PARTIALLY PAID
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                UNPAID
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] pt-0.5">
          <div>
            <span className="text-on-surface-variant block font-medium">
              {isDeliveryChallan ? 'Challan Date:' : 'Invoice Date:'}
            </span>
            <span className="font-bold text-on-surface">{formatDate(invoice.date)}</span>
          </div>
          {!isDeliveryChallan && invoice.dueDate && (
            <div className="text-right">
              <span className="text-on-surface-variant block font-medium">Due Date:</span>
              <span className="font-bold text-rose-600 dark:text-rose-400">{formatDate(invoice.dueDate)}</span>
            </div>
          )}
          {isDeliveryChallan && challanPurpose && (
            <div className="text-right">
              <span className="text-on-surface-variant block font-medium">Purpose (Rule 55):</span>
              <span className="font-bold text-teal-700 dark:text-teal-400">{challanPurpose}</span>
            </div>
          )}
        </div>

        {isGst && (
          <div className="flex items-center justify-between text-[10px] text-on-surface-variant bg-surface-container/40 px-2 py-1 rounded border border-outline-variant/20">
            <span>Reverse Charge (RCM): <strong>{invoice.isRcm ? 'YES' : 'NO'}</strong></span>
            <span>Tax: <strong>{invoice.isIntraState ? (invoice.isUtgst || totalUtgst > 0 ? 'CGST + UTGST' : 'CGST + SGST') : 'IGST'}</strong></span>
          </div>
        )}
      </div>

      {/* 2. Parties Card: Seller & Customer Details */}
      <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/30 shadow-xs space-y-3">
        {/* Seller Section */}
        <div>
          <div className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wider">
            <Building2 size={12} />
            <span>Supplier (Seller)</span>
          </div>
          <div className="font-black text-sm text-on-surface mt-0.5">
            {company.tradeName || company.businessName}
          </div>
          <div className="text-[11px] text-on-surface-variant mt-0.5 space-y-0.5">
            {company.gstin && (
              <div><span className="font-semibold text-on-surface">GSTIN:</span> <span className="font-mono">{company.gstin}</span></div>
            )}
            {company.phone && (
              <div><span className="font-semibold text-on-surface">Phone:</span> {company.phone}</div>
            )}
            {company.address && <div>{company.address}{company.pincode ? ` - ${company.pincode}` : ''}</div>}
            {sellerStateObj?.name && (
              <div><span className="font-semibold text-on-surface">State:</span> {sellerStateObj.name} ({company.stateCode})</div>
            )}
          </div>
        </div>

        <div className="border-t border-outline-variant/20 pt-2.5">
          {/* Customer Section */}
          <div className="flex items-center gap-1 text-[10px] font-bold text-secondary uppercase tracking-wider">
            <User size={12} />
            <span>Billed To (Customer)</span>
          </div>
          <div className="font-black text-sm text-on-surface mt-0.5">
            {invoice.partyName || 'Cash Sale / Walk-in Customer'}
          </div>
          <div className="text-[11px] text-on-surface-variant mt-0.5 space-y-0.5">
            {invoice.partyGstin ? (
              <div><span className="font-semibold text-on-surface">GSTIN:</span> <span className="font-mono">{invoice.partyGstin}</span></div>
            ) : (
              <div><span className="font-semibold text-on-surface">GSTIN:</span> Unregistered Person (URP)</div>
            )}
            {(party?.phone || invoice.partyAddress?.match(/\b[6-9]\d{9}\b/)?.[0]) && (
              <div><span className="font-semibold text-on-surface">Phone:</span> {party?.phone || invoice.partyAddress?.match(/\b[6-9]\d{9}\b/)?.[0]}</div>
            )}
            {invoice.partyAddress && <div>{invoice.partyAddress}</div>}
            <div>
              <span className="font-semibold text-on-surface">Place of Supply:</span> {posStateObj?.name || 'N/A'} (State Code: {posStateCode})
            </div>
          </div>
        </div>
      </div>

      {/* 3. Itemized Items Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-center px-1">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
            Items &amp; Services ({itemsList.length})
          </span>
          <span className="text-[10px] text-on-surface-variant">Qty Total: {totalQuantity}</span>
        </div>

        {itemsList.map((item, idx) => (
          <div
            key={item.id || idx}
            className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 shadow-2xs space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-black text-on-surface block leading-tight break-words">
                  {idx + 1}. {item.name}
                </span>
                {item.hsnSacCode && item.hsnSacCode !== '-' && (
                  <span className="inline-block mt-0.5 text-[9.5px] font-mono font-semibold bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant border border-outline-variant/20">
                    HSN/SAC: {item.hsnSacCode}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-black text-primary font-tabular-data block">
                  ₹{item.totalAmount.toFixed(2)}
                </span>
                <span className="text-[10px] text-on-surface-variant">Net Total</span>
              </div>
            </div>

            <div className="grid grid-cols-2 xs:grid-cols-4 gap-1.5 pt-1 text-[11px] border-t border-outline-variant/20">
              <div className="bg-surface-container/40 p-1.5 rounded">
                <span className="text-[9px] uppercase font-bold text-on-surface-variant block">Qty</span>
                <span className="font-semibold text-on-surface font-tabular-data">
                  {formatQuantity(item.quantity, item.unit)}
                </span>
              </div>
              <div className="bg-surface-container/40 p-1.5 rounded">
                <span className="text-[9px] uppercase font-bold text-on-surface-variant block">Rate</span>
                <span className="font-semibold text-on-surface font-tabular-data">
                  ₹{item.unitPrice.toFixed(2)}
                </span>
                {isGst && !company.isCompositionScheme && (
                  <span className="text-[9.5px] text-on-surface-variant block font-normal">
                    Incl. ₹{item.unitPriceInclusive.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="bg-surface-container/40 p-1.5 rounded">
                <span className="text-[9px] uppercase font-bold text-on-surface-variant block">Discount</span>
                <span className="font-semibold text-on-surface font-tabular-data">
                  {item.discountAmount > 0 ? `₹${item.discountAmount.toFixed(2)}` : '-'}
                </span>
              </div>
              <div className="bg-surface-container/40 p-1.5 rounded">
                <span className="text-[9px] uppercase font-bold text-on-surface-variant block">GST</span>
                <span className="font-semibold text-on-surface font-tabular-data">
                  {item.gstRate}% (₹{(item.cgstAmount + item.sgstAmount + item.igstAmount + item.utgstAmount).toFixed(2)})
                </span>
                {isGst && !company.isCompositionScheme && item.cessRate > 0 && (
                  <span className="text-[9.5px] text-on-surface-variant block font-normal">
                    CESS {item.cessRate}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 4. Calculation & Totals Summary Card */}
      <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/30 shadow-xs space-y-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant block border-b border-outline-variant/20 pb-1.5">
          Tax &amp; Amount Breakdown
        </span>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-on-surface-variant">
            <span>Taxable Amount</span>
            <span className="font-bold text-on-surface font-tabular-data">₹{totalTaxable.toFixed(2)}</span>
          </div>

          {invoice.totalDiscount > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span>Total Discount</span>
              <span className="font-bold font-tabular-data">- ₹{invoice.totalDiscount.toFixed(2)}</span>
            </div>
          )}

          {isGst && !company.isCompositionScheme && (
            <>
              {invoice.isIntraState ? (
                <>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>CGST</span>
                    <span className="font-semibold text-on-surface font-tabular-data">₹{totalCgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>{invoice.isUtgst || totalUtgst > 0 ? 'UTGST' : 'SGST'}</span>
                    <span className="font-semibold text-on-surface font-tabular-data">
                      ₹{(totalUtgst > 0 ? totalUtgst : totalSgst).toFixed(2)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-on-surface-variant">
                  <span>IGST</span>
                  <span className="font-semibold text-on-surface font-tabular-data">₹{totalIgst.toFixed(2)}</span>
                </div>
              )}

              {totalCess > 0 && (
                <div className="flex justify-between text-on-surface-variant">
                  <span>CESS</span>
                  <span className="font-semibold text-on-surface font-tabular-data">₹{totalCess.toFixed(2)}</span>
                </div>
              )}
            </>
          )}

          {(invoice.shippingAmount ?? 0) > 0 && (
            <div className="flex justify-between text-on-surface-variant">
              <span>Shipping / Packaging</span>
              <span className="font-semibold text-on-surface font-tabular-data">₹{(invoice.shippingAmount ?? 0).toFixed(2)}</span>
            </div>
          )}

          {invoice.roundOff !== 0 && (
            <div className="flex justify-between text-on-surface-variant">
              <span>Round Off</span>
              <span className="font-semibold text-on-surface font-tabular-data">
                {invoice.roundOff > 0 ? `+₹${invoice.roundOff.toFixed(2)}` : `-₹${Math.abs(invoice.roundOff).toFixed(2)}`}
              </span>
            </div>
          )}

          {/* Grand Total */}
          <div className="pt-2 border-t border-outline-variant/30 flex justify-between items-center text-sm">
            <span className="font-black uppercase tracking-tight text-on-surface">
              {isDeliveryChallan ? 'Total Goods Value' : 'Net Amount Payable'}
            </span>
            <span className="text-base font-black text-primary font-tabular-data">
              ₹{resolvedGrandTotal.toFixed(2)}
            </span>
          </div>

          {/* Words */}
          <p className="text-[10px] text-on-surface-variant italic pt-1 leading-snug">
            Amount in words: <strong className="text-on-surface not-italic">{wordsTotal}</strong>
          </p>

          {/* Balance status - suppressed for Delivery Challans */}
          {!isDeliveryChallan && invoice.balanceAmount > 0 && (
            <div className="flex justify-between items-center bg-rose-500/10 text-rose-700 dark:text-rose-400 p-2 rounded-lg font-bold text-xs mt-2 border border-rose-500/20">
              <span>Balance Due</span>
              <span className="font-tabular-data">₹{invoice.balanceAmount.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 5. UPI QR & Banking Card - suppressed for Delivery Challans */}
      {!isDeliveryChallan && (upiQrUrl || company.accountNumber) && (
        <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/30 shadow-xs space-y-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant block">
            Payment Information
          </span>

          {upiQrUrl && (
            <div className="flex flex-col items-center justify-center p-3 bg-surface-container/30 rounded-xl border border-outline-variant/20 text-center">
              <div className="p-2 bg-white rounded-xl shadow-xs inline-block">
                <img src={upiQrUrl} alt="UPI Payment QR" className="w-28 h-28 block rounded" />
              </div>
              {company.upiId && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-on-surface font-mono">{company.upiId}</span>
                  <button
                    type="button"
                    onClick={onCopyUpi}
                    className="p-1 rounded hover:bg-surface-container text-on-surface-variant cursor-pointer transition-colors"
                    title="Copy UPI ID"
                  >
                    {copiedUpi ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  </button>
                </div>
              )}
              <a
                href={`upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(company.tradeName || company.businessName)}&am=${invoice.balanceAmount > 0 ? invoice.balanceAmount : resolvedGrandTotal}&cu=INR`}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
              >
                <QrCode size={13} />
                <span>Pay ₹{(invoice.balanceAmount > 0 ? invoice.balanceAmount : resolvedGrandTotal).toFixed(2)} via UPI App</span>
              </a>
            </div>
          )}

          {company.accountNumber && (
            <div className="bg-surface-container/30 p-2.5 rounded-xl border border-outline-variant/20 text-[11px] space-y-1">
              <div className="font-bold uppercase text-[10px] tracking-wider text-secondary">
                Bank Account Details
              </div>
              <div><span className="text-on-surface-variant">Bank:</span> <strong className="text-on-surface">{company.bankName || 'N/A'}</strong></div>
              <div><span className="text-on-surface-variant">A/C No:</span> <strong className="font-mono text-on-surface">{company.accountNumber}</strong></div>
              <div><span className="text-on-surface-variant">IFSC:</span> <strong className="font-mono text-on-surface">{company.ifscCode || 'N/A'}</strong></div>
              {company.branchName && <div><span className="text-on-surface-variant">Branch:</span> <strong className="text-on-surface">{company.branchName}</strong></div>}
            </div>
          )}
        </div>
      )}

      {/* 6. Terms and Jurisdiction Card */}
      <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 text-[10px] text-on-surface-variant space-y-1">
        <div className="font-bold text-on-surface">Terms &amp; Conditions</div>
        <p className="leading-relaxed">{company.termsAndConditions || '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged if payment is not made within the due date.'}</p>
        {posStateObj?.name && (
          <p className="italic pt-0.5 text-on-surface-variant/80 border-t border-outline-variant/20">
            Subject to {posStateObj.name} jurisdiction.
          </p>
        )}
      </div>
    </div>
  );
};
