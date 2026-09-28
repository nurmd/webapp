import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { formatThermalReceiptText } from '../../core/printer/escpos.ts';
import { X, Printer, Share2, Receipt, FileText } from 'lucide-react';

interface InvoicePreviewModalProps {
  invoice: Invoice;
  company: CompanyProfile;
  onClose: () => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice,
  company,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'A4' | 'THERMAL'>('A4');

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Dear ${invoice.partyName},\nThank you for doing business with ${company.businessName}.\nYour GST Tax Invoice #${invoice.invoiceNumber} for amount ${formatINR(invoice.grandTotal)} is generated.\nDate: ${formatDate(invoice.date)}`
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
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 60,
      padding: '1rem',
    }}>
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        width: '100%',
        maxWidth: '850px',
        maxHeight: '94vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Modal Controls Toolbar */}
        <div className="no-print" style={{
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setViewMode('A4')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                backgroundColor: viewMode === 'A4' ? '#2563eb' : '#1e293b',
                color: '#fff',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <FileText size={15} /> A4 Tax Invoice
            </button>
            <button
              onClick={() => setViewMode('THERMAL')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                backgroundColor: viewMode === 'THERMAL' ? '#2563eb' : '#1e293b',
                color: '#fff',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <Receipt size={15} /> 58mm/80mm Thermal POS
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={handleShareWhatsApp}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                backgroundColor: '#25D366',
                color: '#fff',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <Share2 size={15} /> WhatsApp
            </button>
            <button
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <Printer size={15} /> Print
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.25rem' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', justifyContent: 'center' }}>
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
                <div style={{ border: '1px solid #cbd5e1', padding: '0.75rem', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>BANK DETAILS & UPI</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '4px' }}><strong>Bank:</strong> {company.bankName}</div>
                  <div style={{ fontSize: '0.8rem' }}><strong>A/C No:</strong> {company.accountNumber}</div>
                  <div style={{ fontSize: '0.8rem' }}><strong>IFSC:</strong> {company.ifscCode}</div>
                  <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}><strong>UPI:</strong> {company.upiId}</div>

                  <div style={{ marginTop: '0.75rem', fontSize: '0.75rem' }}>
                    <strong>Total In Words:</strong>
                    <div style={{ fontStyle: 'italic', color: '#334155' }}>{invoice.amountInWords}</div>
                  </div>
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
    </div>
  );
};
