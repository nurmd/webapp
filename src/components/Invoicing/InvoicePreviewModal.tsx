import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { formatThermalReceiptText } from '../../core/printer/escpos.ts';
import { X, Printer, Share2, Receipt, FileText, Download, MoreVertical } from 'lucide-react';
import { ThermalPrintModal } from '../Printing/ThermalPrintModal.tsx';
import { WhatsAppShareModal } from '../WhatsApp/WhatsAppShareModal.tsx';
import { downloadEWayBillJson } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';

interface InvoicePreviewModalProps {
  invoice: Invoice;
  company: CompanyProfile;
  onClose: () => void;
  onEditInvoice?: (invoice: Invoice) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice,
  company,
  onClose,
  onEditInvoice,
}) => {
  const [viewMode, setViewMode] = useState<'A4' | 'THERMAL'>('A4');
  const [thermalWidth, setThermalWidth] = useState<32 | 48>(48); // 32 = 58mm, 48 = 80mm
  const [isThermalModalOpen, setIsThermalModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  const isGst = company.isGstEnabled !== false;

  const handlePrint = () => {
    window.print();
  };

  const thermalText = formatThermalReceiptText(
    {
      companyName: company.tradeName || company.businessName,
      companyAddress: company.address,
      gstin: isGst ? company.gstin : '',
      phone: company.phone,
      invoiceNo: invoice.invoiceNumber,
      date: formatDate(invoice.date),
      customerName: invoice.partyName,
      items: invoice.items.map((i) => ({
        name: i.name,
        qty: i.quantity,
        rate: i.unitPrice,
        amount: i.totalAmount,
      })),
      taxableAmount: invoice.totalTaxableAmount,
      cgstAmount: isGst ? invoice.totalCgst : 0,
      sgstAmount: isGst ? invoice.totalSgst : 0,
      igstAmount: isGst ? invoice.totalIgst : 0,
      grandTotal: invoice.grandTotal,
      upiId: company.upiId,
      terms: company.termsAndConditions,
    },
    thermalWidth
  );

  const upiQrUrl = company.upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
        `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(
          company.tradeName || company.businessName
        )}&am=${invoice.balanceAmount > 0 ? invoice.balanceAmount : invoice.grandTotal}&cu=INR`
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print-modal-overlay animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden print-modal-container">
        {/* Modal Controls Toolbar (Hidden during print) */}
        <div className="no-print px-4 py-2.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/70 flex-wrap gap-2">
          {/* Format Switcher */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode('A4')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-label-sm text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'A4'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <FileText size={14} />
              <span>{isGst ? 'A4 Tax Invoice' : 'A4 Retail Bill'}</span>
            </button>

            <button
              onClick={() => setViewMode('THERMAL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-label-sm text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'THERMAL'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Receipt size={14} />
              <span>Thermal POS</span>
            </button>

            {viewMode === 'THERMAL' && (
              <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 ml-1">
                <button
                  onClick={() => setThermalWidth(32)}
                  className={`px-2 py-0.5 text-[11px] rounded font-bold cursor-pointer ${
                    thermalWidth === 32 ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'
                  }`}
                >
                  58mm
                </button>
                <button
                  onClick={() => setThermalWidth(48)}
                  className={`px-2 py-0.5 text-[11px] rounded font-bold cursor-pointer ${
                    thermalWidth === 48 ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'
                  }`}
                >
                  80mm
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            {onEditInvoice && (
              <button
                onClick={() => {
                  onClose();
                  onEditInvoice(invoice);
                }}
                className="inline-flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95"
                title="Edit and update invoice"
              >
                <span className="material-symbols-outlined text-[15px]">edit</span>
                <span>Edit</span>
              </button>
            )}

            <button
              onClick={() => setIsThermalModalOpen(true)}
              className="inline-flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95"
              title="Print directly to Bluetooth / USB thermal printer"
            >
              <Receipt size={14} className="text-secondary" />
              <span>ESC/POS</span>
            </button>

            <button
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="inline-flex items-center gap-1 bg-[#25D366] hover:bg-[#20ba59] text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Share2 size={14} />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 bg-secondary hover:bg-secondary/90 text-on-secondary px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Printer size={14} />
              <span>Print / PDF</span>
            </button>

            {/* More Menu (E-Way / E-Invoice) */}
            <div className="relative">
              <button
                onClick={() => setShowMoreActions(!showMoreActions)}
                className="w-8 h-8 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant cursor-pointer"
                title="More Export Options"
              >
                <MoreVertical size={16} />
              </button>

              {showMoreActions && (
                <div className="absolute right-0 top-10 z-50 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl p-1.5 flex flex-col gap-1 w-48 animate-in fade-in">
                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      downloadEWayBillJson(company, invoice);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                  >
                    <Download size={14} className="text-blue-500" />
                    <span>Download E-Way JSON</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      downloadEInvoiceJson(company, invoice);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                  >
                    <Download size={14} className="text-purple-500" />
                    <span>Download E-Invoice JSON</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div className="overflow-y-auto p-3 sm:p-6 flex justify-center bg-surface-dim/30 flex-1">
          {viewMode === 'THERMAL' ? (
            /* Thermal POS Receipt View */
            <div
              className="printable-invoice bg-white text-black p-4 rounded-md shadow-md mx-auto"
              style={{
                fontFamily: 'monospace',
                maxWidth: thermalWidth === 32 ? '300px' : '380px',
                width: '100%',
                whiteSpace: 'pre-wrap',
                fontSize: thermalWidth === 32 ? '0.75rem' : '0.8rem',
                lineHeight: '1.25',
              }}
            >
              {thermalText}
            </div>
          ) : (
            /* Standard A4 Tax / Commercial Invoice */
            <div
              className="printable-invoice bg-white text-slate-900 p-4 sm:p-8 w-full max-w-[760px] shadow-md rounded-md flex flex-col gap-4 text-xs sm:text-sm"
              style={{ color: '#0f172a' }}
            >
              {/* Header: Company Profile & Document Title */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 gap-3">
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                    {company.tradeName || company.businessName}
                  </h1>
                  <p className="text-slate-600 text-xs mt-0.5 leading-relaxed">{company.address}</p>
                  <div className="text-xs text-slate-700 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {isGst && company.gstin && (
                      <span><strong>GSTIN:</strong> {company.gstin}</span>
                    )}
                    {isGst && company.stateCode && (
                      <span><strong>State Code:</strong> {company.stateCode}</span>
                    )}
                    <span><strong>Phone:</strong> {company.phone}</span>
                    {company.email && <span><strong>Email:</strong> {company.email}</span>}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-base sm:text-lg font-black text-secondary uppercase tracking-wider">
                    {isGst ? 'TAX INVOICE' : 'RETAIL INVOICE'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {isGst ? 'Original for Recipient' : 'Retail Bill of Supply'}
                  </div>
                  <div className="mt-2 text-xs text-slate-800 space-y-0.5">
                    <div><strong>Invoice #:</strong> {invoice.invoiceNumber}</div>
                    <div><strong>Date:</strong> {formatDate(invoice.date)}</div>
                    {isGst && (
                      <div><strong>Place of Supply:</strong> {invoice.placeOfSupplyStateCode || company.stateCode}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Billed To / Details of Receiver */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-300 rounded-lg p-3 bg-slate-50/50">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Billed To (Customer Details)
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{invoice.partyName}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {invoice.partyAddress || 'Cash Counter / Local'}
                  </div>
                  <div className="text-xs text-slate-700 mt-1 space-y-0.5">
                    {isGst && (
                      <div>
                        <strong>GSTIN:</strong> {invoice.partyGstin || 'Unregistered'}
                      </div>
                    )}
                    {invoice.partyStateCode && (
                      <div>
                        <strong>State Code:</strong> {invoice.partyStateCode}
                      </div>
                    )}
                  </div>
                </div>

                <div className="sm:text-right flex flex-col sm:items-end justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Invoice Details
                    </div>
                    <div className="text-xs text-slate-700 mt-0.5 space-y-0.5">
                      <div><strong>Payment Mode:</strong> {invoice.paymentMode}</div>
                      {isGst && (
                        <div>
                          <strong>Supply Type:</strong>{' '}
                          {invoice.isIntraState ? 'Intra-State (CGST+SGST)' : 'Inter-State (IGST)'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Payment Status Tag */}
                  <div className="mt-2">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        invoice.paymentStatus === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : invoice.paymentStatus === 'PARTIAL'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      ● {invoice.paymentStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Item Details Table (Responsive scrollable container for mobile) */}
              <div className="overflow-x-auto rounded-lg border border-slate-300">
                <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                      <th className="py-2 px-2.5 text-center w-8">#</th>
                      <th className="py-2 px-2.5">Item Description</th>
                      {isGst && <th className="py-2 px-2 text-center">HSN/SAC</th>}
                      <th className="py-2 px-2 text-right">Qty</th>
                      <th className="py-2 px-2.5 text-right">Rate (₹)</th>
                      {isGst && <th className="py-2 px-2.5 text-right">Taxable (₹)</th>}
                      {isGst && <th className="py-2 px-2 text-center">GST %</th>}
                      <th className="py-2 px-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoice.items.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-2.5 text-center text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-2.5 font-semibold text-slate-900">{line.name}</td>
                        {isGst && (
                          <td className="py-2 px-2 text-center font-mono text-slate-600">
                            {line.hsnSacCode || '-'}
                          </td>
                        )}
                        <td className="py-2 px-2 text-right font-medium text-slate-800">
                          {line.quantity}
                        </td>
                        <td className="py-2 px-2.5 text-right font-medium text-slate-800">
                          {line.unitPrice.toFixed(2)}
                        </td>
                        {isGst && (
                          <td className="py-2 px-2.5 text-right font-medium text-slate-800">
                            {line.taxableAmount.toFixed(2)}
                          </td>
                        )}
                        {isGst && (
                          <td className="py-2 px-2 text-center text-slate-600">
                            {line.gstRate}%
                          </td>
                        )}
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {line.totalAmount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & Bank / UPI Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Bank Details & UPI QR Code */}
                <div className="border border-slate-300 rounded-lg p-3 flex gap-3 items-center bg-slate-50/30">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Bank Details &amp; Payment
                    </div>
                    {company.bankName && (
                      <div className="text-xs text-slate-700 mt-1 space-y-0.5">
                        <div><strong>Bank:</strong> {company.bankName}</div>
                        <div><strong>A/C No:</strong> {company.accountNumber}</div>
                        <div><strong>IFSC:</strong> {company.ifscCode}</div>
                      </div>
                    )}
                    {company.upiId && (
                      <div className="text-xs text-emerald-700 font-bold mt-1">
                        <strong>UPI:</strong> {company.upiId}
                      </div>
                    )}

                    <div className="mt-2 text-xs">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">
                        Amount in Words:
                      </span>
                      <span className="font-semibold text-slate-800 italic text-[11px] block">
                        {invoice.amountInWords || 'Rupees Only'}
                      </span>
                    </div>
                  </div>

                  {upiQrUrl && (
                    <div className="text-center p-1.5 bg-white rounded-lg border border-slate-200 flex-shrink-0">
                      <img src={upiQrUrl} alt="UPI QR" className="w-20 h-20 sm:w-24 sm:h-24 block" />
                      <span className="text-[9px] font-bold text-emerald-700 block mt-0.5">
                        Scan to Pay
                      </span>
                    </div>
                  )}
                </div>

                {/* Calculation Summary */}
                <div className="border border-slate-300 rounded-lg p-3 flex flex-col justify-between gap-1 text-xs bg-slate-50/30">
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Taxable Amount:</span>
                      <span className="font-semibold text-slate-800">
                        {formatINR(invoice.totalTaxableAmount)}
                      </span>
                    </div>

                    {isGst && invoice.isIntraState && (
                      <>
                        <div className="flex justify-between text-slate-600">
                          <span>Central GST (CGST):</span>
                          <span className="font-semibold text-slate-800">
                            {formatINR(invoice.totalCgst)}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>State GST (SGST):</span>
                          <span className="font-semibold text-slate-800">
                            {formatINR(invoice.totalSgst)}
                          </span>
                        </div>
                      </>
                    )}

                    {isGst && !invoice.isIntraState && (
                      <div className="flex justify-between text-slate-600">
                        <span>Integrated GST (IGST):</span>
                        <span className="font-semibold text-slate-800">
                          {formatINR(invoice.totalIgst)}
                        </span>
                      </div>
                    )}

                    {invoice.roundOff !== 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Round Off:</span>
                        <span className="font-semibold text-slate-800">
                          {invoice.roundOff > 0 ? `+${invoice.roundOff}` : invoice.roundOff}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="border-t-2 border-slate-900 pt-1.5 mt-1">
                    <div className="flex justify-between text-sm sm:text-base font-extrabold text-slate-900">
                      <span>Grand Total:</span>
                      <span className="text-secondary">{formatINR(invoice.grandTotal)}</span>
                    </div>

                    {invoice.balanceAmount > 0 && (
                      <div className="flex justify-between text-xs font-bold text-rose-600 mt-1">
                        <span>Balance Due:</span>
                        <span>{formatINR(invoice.balanceAmount)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Terms & Conditions & Signatory */}
              <div className="flex justify-between items-end border-t border-slate-300 pt-3 text-xs mt-1">
                <div className="max-w-[65%] text-slate-500 text-[11px] leading-relaxed">
                  <strong>Terms &amp; Conditions:</strong>
                  <p>{company.termsAndConditions || 'Goods once sold cannot be returned. Subject to local jurisdiction.'}</p>
                </div>

                <div className="text-center flex flex-col items-center">
                  <div className="h-8"></div>
                  <div className="border-t border-slate-900 pt-1 px-4 font-bold text-slate-800 text-xs">
                    For {company.tradeName || company.businessName}
                    <span className="text-[10px] text-slate-500 font-normal block">
                      Authorized Signatory
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isThermalModalOpen && (
        <ThermalPrintModal
          invoice={invoice}
          company={company}
          onClose={() => setIsThermalModalOpen(false)}
        />
      )}

      {isWhatsAppModalOpen && (
        <WhatsAppShareModal
          invoice={invoice}
          company={company}
          onClose={() => setIsWhatsAppModalOpen(false)}
        />
      )}
    </div>
  );
};
