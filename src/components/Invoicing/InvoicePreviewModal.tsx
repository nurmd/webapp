import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { formatThermalReceiptText } from '../../core/printer/escpos.ts';
import { X, Printer, Share2, Receipt, FileText, Smartphone, Download } from 'lucide-react';
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

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Dear ${invoice.partyName},\nThank you for doing business with ${company.businessName}.\nYour GST Tax Invoice #${invoice.invoiceNumber} for amount ${formatINR(invoice.grandTotal)} is generated.\nDate: ${formatDate(invoice.date)}\nTaxable: ${formatINR(invoice.totalTaxableAmount)} | GST Tax: ${formatINR(invoice.totalTax)}\nView/Pay: ${company.upiId ? 'UPI ' + company.upiId : 'Cash/Bank'}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const thermalText = formatThermalReceiptText({
    companyName: company.businessName,
    companyAddress: company.address,
    gstin: company.gstin,
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
    cgstAmount: invoice.totalCgst,
    sgstAmount: invoice.totalSgst,
    igstAmount: invoice.totalIgst,
    grandTotal: invoice.grandTotal,
    upiId: company.upiId,
    terms: company.termsAndConditions,
  }, thermalWidth);

  const upiQrUrl = company.upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(
        `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(company.businessName)}&am=${invoice.grandTotal}&cu=INR`
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Controls Toolbar */}
        <div className="no-print px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode('A4')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-label-sm text-xs font-semibold transition-all ${
                viewMode === 'A4'
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <FileText size={14} /> A4 Tax Invoice
            </button>
            <button
              onClick={() => setViewMode('THERMAL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-label-sm text-xs font-semibold transition-all ${
                viewMode === 'THERMAL'
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Receipt size={14} /> Thermal POS
            </button>
            {viewMode === 'THERMAL' && (
              <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30">
                <button
                  onClick={() => setThermalWidth(32)}
                  className={`px-2 py-0.5 text-[11px] rounded font-medium ${
                    thermalWidth === 32 ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'
                  }`}
                >
                  58mm
                </button>
                <button
                  onClick={() => setThermalWidth(48)}
                  className={`px-2 py-0.5 text-[11px] rounded font-medium ${
                    thermalWidth === 48 ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'
                  }`}
                >
                  80mm
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {onEditInvoice && (
              <button
                onClick={() => {
                  onClose();
                  onEditInvoice(invoice);
                }}
                className="inline-flex items-center gap-1 bg-secondary text-on-secondary px-2.5 py-1.5 rounded-xl font-label-sm text-xs font-bold shadow-sm hover:bg-secondary/90 transition-all active:scale-95"
                title="Edit and update invoice"
              >
                <span className="material-symbols-outlined text-[15px]">edit_document</span> Edit
              </button>
            )}
            <button
              onClick={() => setIsThermalModalOpen(true)}
              className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-xl font-label-sm text-xs font-bold shadow-sm hover:bg-surface-container-highest transition-all active:scale-95 border border-outline-variant/30"
              title="Print directly to 58mm/80mm Bluetooth or USB thermal printer"
            >
              <Receipt size={14} className="text-secondary" /> ESC/POS
            </button>
            <button
              onClick={() => downloadEWayBillJson(company, invoice)}
              className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-xl font-label-sm text-xs font-bold shadow-sm hover:bg-surface-container-highest transition-all active:scale-95 border border-outline-variant/30"
              title="Download official NIC E-Way Bill Bulk Upload JSON"
            >
              <Download size={14} className="text-blue-500" /> E-Way JSON
            </button>
            <button
              onClick={() => downloadEInvoiceJson(company, invoice)}
              className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-xl font-label-sm text-xs font-bold shadow-sm hover:bg-surface-container-highest transition-all active:scale-95 border border-outline-variant/30"
              title="Download official IRP E-Invoice v1.1 JSON"
            >
              <Download size={14} className="text-purple-500" /> E-Inv JSON
            </button>
            <button
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="inline-flex items-center gap-1 bg-[#25D366] text-white px-3 py-1.5 rounded-xl font-label-sm text-xs font-bold shadow-sm hover:opacity-90 transition-all active:scale-95"
            >
              <Share2 size={14} /> WhatsApp
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1 bg-secondary text-on-secondary px-3 py-1.5 rounded-xl font-label-sm text-xs font-bold shadow-sm hover:bg-secondary/90 transition-all active:scale-95"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div className="overflow-y-auto p-4 sm:p-6 flex justify-center bg-surface-dim/40 flex-1">
          {viewMode === 'THERMAL' ? (
            /* Thermal Receipt Preview */
            <div style={{
              backgroundColor: '#fff',
              color: '#000',
              fontFamily: 'monospace',
              padding: '1.25rem',
              borderRadius: '4px',
              maxWidth: '380px',
              width: '100%',
              whiteSpace: 'pre-wrap',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
              fontSize: '0.8rem',
              lineHeight: '1.2',
            }}>
              {thermalText}
            </div>
          ) : (
            /* Standard Full GST Tax Invoice */
            <div style={{
              backgroundColor: '#ffffff',
              color: '#0f172a',
              padding: '2rem',
              width: '100%',
              maxWidth: '750px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
              fontSize: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              borderRadius: '4px',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '0.75rem' }}>
                <div>
                  <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    {company.businessName}
                  </h1>
                  <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: '2px' }}>{company.address}</div>
                  <div style={{ fontSize: '0.8rem' }}><strong>GSTIN:</strong> {company.gstin} | <strong>State Code:</strong> {company.stateCode}</div>
                  <div style={{ fontSize: '0.8rem' }}><strong>Phone:</strong> {company.phone} | <strong>Email:</strong> {company.email}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563eb' }}>
                    TAX INVOICE
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Original for Recipient</div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    <strong>Invoice #:</strong> {invoice.invoiceNumber}<br />
                    <strong>Date:</strong> {formatDate(invoice.date)}<br />
                    <strong>Place of Supply:</strong> {invoice.placeOfSupplyStateCode}
                  </div>
                </div>
              </div>

              {/* Billed To / Shipped To */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', border: '1px solid #cbd5e1', padding: '0.75rem', borderRadius: '4px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Details of Receiver (Billed To)</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px' }}>{invoice.partyName}</div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>{invoice.partyAddress || 'Local Address'}</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    <strong>GSTIN:</strong> {invoice.partyGstin || 'Unregistered'}
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>
                    <strong>State:</strong> {invoice.partyStateCode}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tax & Dispatch Info</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '2px' }}><strong>Reverse Charge (RCM):</strong> No</div>
                  <div style={{ fontSize: '0.8rem' }}><strong>Supply Type:</strong> {invoice.isIntraState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}</div>
                  <div style={{ fontSize: '0.8rem' }}><strong>Payment Mode:</strong> {invoice.paymentMode}</div>
                </div>
              </div>

              {/* Item Details Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #94a3b8', borderTop: '1px solid #94a3b8' }}>
                    <th style={{ padding: '6px', textAlign: 'center', width: '30px' }}>#</th>
                    <th style={{ padding: '6px', textAlign: 'left' }}>Item Description</th>
                    <th style={{ padding: '6px', textAlign: 'center' }}>HSN</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '6px', textAlign: 'center' }}>GST %</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((line, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '6px', fontWeight: 600 }}>{line.name}</td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>{line.hsnSacCode}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{line.quantity}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{line.unitPrice.toFixed(2)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{line.taxableAmount.toFixed(2)}</td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>{line.gstRate}%</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{line.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals & Tax Breakup */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                <div style={{ border: '1px solid #cbd5e1', padding: '0.75rem', borderRadius: '4px', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>BANK DETAILS & UPI</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}><strong>Bank:</strong> {company.bankName}</div>
                    <div style={{ fontSize: '0.8rem' }}><strong>A/C No:</strong> {company.accountNumber}</div>
                    <div style={{ fontSize: '0.8rem' }}><strong>IFSC:</strong> {company.ifscCode}</div>
                    <div style={{ fontSize: '0.8rem', color: '#00875a', fontWeight: 600 }}><strong>UPI:</strong> {company.upiId}</div>

                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                      <strong>Total In Words:</strong>
                      <div style={{ fontStyle: 'italic', color: '#334155' }}>{invoice.amountInWords}</div>
                    </div>
                  </div>

                  {upiQrUrl && (
                    <div style={{ textAlign: 'center', backgroundColor: '#f8fafc', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <img src={upiQrUrl} alt="UPI Dynamic QR" style={{ width: '90px', height: '90px', display: 'block' }} />
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#00875a', marginTop: '2px' }}>Scan & Pay UPI</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', border: '1px solid #cbd5e1', padding: '0.75rem', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Taxable Value:</span>
                    <span>{formatINR(invoice.totalTaxableAmount)}</span>
                  </div>
                  {invoice.isIntraState ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>CGST:</span>
                        <span>{formatINR(invoice.totalCgst)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>SGST:</span>
                        <span>{formatINR(invoice.totalSgst)}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>IGST:</span>
                      <span>{formatINR(invoice.totalIgst)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Round Off:</span>
                    <span>{invoice.roundOff > 0 ? `+${invoice.roundOff}` : invoice.roundOff}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '2px solid #0f172a',
                    paddingTop: '6px',
                    fontWeight: 800,
                    fontSize: '1rem',
                  }}>
                    <span>Grand Total:</span>
                    <span>{formatINR(invoice.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Footer Terms & Signatory */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '1rem', borderTop: '1px solid #cbd5e1', paddingTop: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: '350px' }}>
                  <strong>Terms & Conditions:</strong>
                  <div>{company.termsAndConditions}</div>
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem' }}>
                  <div style={{ height: '40px' }}></div>
                  <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', fontWeight: 600 }}>
                    For {company.businessName}
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Authorized Signatory</div>
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
