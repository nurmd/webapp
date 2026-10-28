import React from 'react';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { inclusiveFromExclusive } from '../../core/gst/pricing.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { printCurrentPage } from '../../core/utils/printBridge.ts';

export interface BulkPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyProfile;
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  title?: string;
}

export const BulkPrintModal: React.FC<BulkPrintModalProps> = ({
  isOpen,
  onClose,
  company,
  invoices = [],
  purchases = [],
  title = 'Bulk Document Printing',
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 30);

  if (!isOpen) return null;

  const isGst = company.isGstEnabled !== false;
  const docs = invoices.length > 0 ? invoices : purchases;
  const isSales = invoices.length > 0;
  const totalAmount = docs.reduce((sum, d) => sum + (d.grandTotal || 0), 0);

  const handlePrint = () => {
    printCurrentPage('Bulk-Documents', 'A4');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-2 sm:p-4 animate-fade-in print-modal-overlay">
      {/* Dynamic print-specific styles */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 6mm;
          }
          body * {
            visibility: hidden !important;
          }
          #bulk-print-container, #bulk-print-container * {
            visibility: visible !important;
          }
          #bulk-print-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            color: #000 !important;
          }
          .bulk-print-page {
            page-break-after: always !important;
            break-after: page !important;
            min-height: 96vh !important;
            box-sizing: border-box !important;
            padding: 8mm 6mm !important;
            margin-bottom: 0 !important;
            border: 1px solid #ddd !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Main Container */}
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-4xl h-[92vh] flex flex-col shadow-2xl border border-outline-variant/30 overflow-hidden print-modal-container">
        {/* Sticky Toolbar */}
        <div className="p-3 sm:p-4 border-b border-outline-variant/20 bg-surface-container-low flex items-center justify-between gap-2 shrink-0 no-print">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors shrink-0"
              title="Close"
              aria-label="Close bulk print preview"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-on-surface truncate flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary/15 text-secondary">
                  {docs.length} {docs.length === 1 ? 'document' : 'documents'}
                </span>
              </h2>
              <p className="text-[11px] text-on-surface-variant truncate">
                Batch total: <strong>{formatINR(totalAmount)}</strong> • Formatted for standard A4 landscape or portrait
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all hover:bg-secondary/90"
              title="Print all selected documents"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span>Print All ({docs.length})</span>
            </button>
          </div>
        </div>

        {/* Scrollable Document Previews / Print Area */}
        <div id="bulk-print-container" className="flex-1 overflow-y-auto p-3 sm:p-6 bg-surface-container-high/40 space-y-6">
          {docs.map((doc, idx) => {
            const isInv = 'invoiceNumber' in doc;
            const docNumber = isInv ? (doc as Invoice).invoiceNumber : (doc as PurchaseBill).billNumber;
            const partyName = isInv ? (doc as Invoice).partyName : (doc as PurchaseBill).supplierName;
            const partyGst = isInv ? (doc as Invoice).partyGstin : (doc as PurchaseBill).supplierGstin;
            const docDate = doc.date;
            const docType = isInv ? (doc as Invoice).invoiceType || 'TAX INVOICE' : 'PURCHASE BILL';
            const items = (doc.items || []) as any[];

            return (
              <div
                key={doc.id || idx}
                className="bulk-print-page bg-white text-neutral-900 rounded-xl p-6 sm:p-8 shadow-sm border border-neutral-300 mx-auto max-w-3xl font-sans text-xs leading-relaxed"
              >
                {/* Header */}
                <div className="flex justify-between items-start border-b border-neutral-300 pb-3 mb-3">
                  <div>
                    <h3 className="text-base font-black tracking-tight text-neutral-950 uppercase">
                      {company.tradeName || company.businessName}
                    </h3>
                    {company.gstin && (
                      <p className="text-[11px] text-neutral-600 font-mono mt-0.5">
                        GSTIN: <span className="font-bold text-neutral-900">{company.gstin}</span>
                      </p>
                    )}
                    {company.address && (
                      <p className="text-[11px] text-neutral-600 max-w-sm mt-0.5">
                        {company.address} {company.pincode ? `- ${company.pincode}` : ''}
                      </p>
                    )}
                    {company.phone && (
                      <p className="text-[11px] text-neutral-600 mt-0.5">
                        Phone: {company.phone} {company.email ? `• ${company.email}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="inline-block bg-neutral-900 text-white font-extrabold text-[10px] tracking-widest px-2.5 py-1 rounded uppercase mb-1">
                      {docType.replace(/_/g, ' ')}
                    </span>
                    <p className="text-xs font-bold text-neutral-950 font-mono">
                      #{docNumber}
                    </p>
                    <p className="text-[11px] text-neutral-600">
                      Date: {formatDate(docDate)}
                    </p>
                    {isInv && (doc as Invoice).dueDate && (
                      <p className="text-[11px] text-neutral-600">
                        Due: {formatDate((doc as Invoice).dueDate!)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Recipient / Supplier Details */}
                <div className="grid grid-cols-2 gap-4 bg-neutral-50 p-2.5 rounded border border-neutral-200 mb-3 text-[11px]">
                  <div>
                    <span className="font-bold uppercase text-[10px] text-neutral-500 block mb-0.5">
                      {isSales ? 'Billed To (Customer):' : 'Billed From (Supplier):'}
                    </span>
                    <p className="font-bold text-neutral-950 text-xs">{partyName || 'Cash Customer'}</p>
                    {partyGst && <p className="font-mono text-neutral-700">GSTIN: {partyGst}</p>}
                    {isInv && (doc as Invoice).partyPhone && (
                      <p className="text-neutral-600">Phone: {(doc as Invoice).partyPhone}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-bold uppercase text-[10px] text-neutral-500 block mb-0.5">
                      Payment & Tax Status:
                    </span>
                    <p className="font-bold capitalize text-neutral-800">
                      Status: {doc.paymentStatus || 'UNPAID'}
                    </p>
                    {isInv && (doc as Invoice).placeOfSupplyStateCode && (
                      <p className="text-neutral-600">
                        Place of Supply: State {(doc as Invoice).placeOfSupplyStateCode}
                      </p>
                    )}
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border border-neutral-300 rounded overflow-hidden mb-3">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-300">
                      <tr>
                        <th className="py-1 px-2 w-8 text-center">#</th>
                        <th className="py-1 px-2">Item Description</th>
                        <th className="py-1 px-2 w-16 text-center">HSN</th>
                        <th className="py-1 px-2 w-16 text-right">Qty</th>
                        <th className="py-1 px-2 w-20 text-right">Rate</th>
                        <th className="py-1 px-2 w-16 text-right">Tax %</th>
                        <th className="py-1 px-2 w-20 text-right">Taxable</th>
                        <th className="py-1 px-2 w-20 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {items.map((item, itemIdx) => {
                        const rate = Number(item.rate || item.unitPrice || 0);
                        const gstRate = Number(item.gstRate || item.taxRate || 0);
                        const priceMode = item.priceMode ?? 'EXCLUSIVE';
                        const storedIncl = Number(item.unitPriceInclusive);
                        const inclusiveVal =
                          priceMode === 'INCLUSIVE'
                            ? (Number.isFinite(storedIncl) && storedIncl > 0
                                ? storedIncl
                                : inclusiveFromExclusive(rate, gstRate))
                            : inclusiveFromExclusive(rate, gstRate);
                        return (
                          <tr key={item.id || itemIdx} className="hover:bg-neutral-50">
                            <td className="py-1 px-2 text-center text-neutral-500">{itemIdx + 1}</td>
                            <td className="py-1 px-2 font-medium text-neutral-900">{item.itemName || item.name}</td>
                            <td className="py-1 px-2 text-center font-mono text-neutral-600">{item.hsnCode || item.hsnSacCode || '-'}</td>
                            <td className="py-1 px-2 text-right">{item.quantity} {item.unit || ''}</td>
                            <td className="py-1 px-2 text-right tabular-nums">
                              <div>{formatINR(rate)}</div>
                              {Boolean(isGst && !company.isCompositionScheme) && (
                                <div className="text-[9.5px] text-neutral-500 font-normal">
                                  Incl. {formatINR(inclusiveVal)}
                                </div>
                              )}
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums">
                              <div>
                                {Boolean(isGst && !company.isCompositionScheme)
                                  ? `GST ${gstRate}%`
                                  : `${gstRate}%`}
                              </div>
                              {Boolean(isGst && !company.isCompositionScheme && item.cessRate && Number(item.cessRate) > 0) && (
                                <div className="text-[9.5px] text-neutral-500 font-normal">
                                  CESS {item.cessRate}%
                                </div>
                              )}
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums">{formatINR(item.taxableAmount || (item.quantity * rate))}</td>
                            <td className="py-1 px-2 text-right font-semibold tabular-nums text-neutral-950">
                              {formatINR(item.totalAmount || item.netAmount || 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Totals & Signatory */}
                <div className="grid grid-cols-2 gap-4 items-start pt-2 border-t border-neutral-300 text-[11px]">
                  <div>
                    <p className="font-semibold text-neutral-700">Amount in Words:</p>
                    <p className="italic text-neutral-900 mt-0.5">
                      {amountInWords(doc.grandTotal)}
                    </p>
                    {isSales && company.upiId && (
                      <p className="text-[10px] text-neutral-600 mt-2 font-mono">
                        UPI: <strong>{company.upiId}</strong>
                      </p>
                    )}
                    {isSales && company.bankName && company.accountNumber && (
                      <p className="text-[10px] text-neutral-600 font-mono">
                        Bank: {company.bankName} | A/C: {company.accountNumber} | IFSC: {company.ifscCode}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 text-right">
                    <div className="flex justify-between text-neutral-600">
                      <span>Taxable Value:</span>
                      <span className="tabular-nums font-medium">{formatINR(doc.totalTaxableAmount || 0)}</span>
                    </div>
                    {((doc.totalCgst || 0) > 0 || (doc.totalSgst || 0) > 0) && (
                      <>
                        <div className="flex justify-between text-neutral-600">
                          <span>CGST:</span>
                          <span className="tabular-nums font-medium">{formatINR(doc.totalCgst || 0)}</span>
                        </div>
                        <div className="flex justify-between text-neutral-600">
                          <span>SGST:</span>
                          <span className="tabular-nums font-medium">{formatINR(doc.totalSgst || 0)}</span>
                        </div>
                      </>
                    )}
                    {(doc.totalIgst || 0) > 0 && (
                      <div className="flex justify-between text-neutral-600">
                        <span>IGST:</span>
                        <span className="tabular-nums font-medium">{formatINR(doc.totalIgst || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-extrabold text-xs text-neutral-950 border-t border-neutral-300 pt-1">
                      <span>Grand Total:</span>
                      <span className="tabular-nums">{formatINR(doc.grandTotal)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-700 font-medium">
                      <span>Paid:</span>
                      <span className="tabular-nums">{formatINR(doc.paidAmount || 0)}</span>
                    </div>
                    {doc.balanceAmount > 0 && (
                      <div className="flex justify-between text-red-700 font-bold">
                        <span>Balance Due:</span>
                        <span className="tabular-nums">{formatINR(doc.balanceAmount)}</span>
                      </div>
                    )}

                    <div className="pt-6 text-center">
                      <p className="text-[10px] text-neutral-500 font-semibold">For {company.tradeName || company.businessName}</p>
                      <div className="h-6" />
                      <p className="text-[10px] text-neutral-700 font-bold border-t border-neutral-400 inline-block px-4">
                        Authorized Signatory
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-[9px] text-center text-neutral-400 mt-4 border-t border-neutral-200 pt-1">
                  Page {idx + 1} of {docs.length} • Computer Generated Tax Invoice
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
