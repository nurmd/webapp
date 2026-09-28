import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { Download, FileSpreadsheet, ShieldCheck } from 'lucide-react';

interface Gstr1ViewProps {
  invoices: Invoice[];
}

export const Gstr1View: React.FC<Gstr1ViewProps> = ({ invoices }) => {
  const [selectedSection, setSelectedSection] = useState<'4_B2B' | '7_B2CS' | '12_HSN'>('4_B2B');

  // B2B Invoices (Table 4)
  const b2bInvoices = invoices.filter((i) => i.invoiceType === 'B2B' && i.partyGstin);

  // B2C Small Invoices (Table 7)
  const b2csInvoices = invoices.filter((i) => i.invoiceType === 'B2CS' || !i.partyGstin);

  // HSN Summary (Table 12)
  const hsnMap: Record<string, {
    hsnCode: string;
    description: string;
    unit: string;
    totalQty: number;
    totalValue: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
  }> = {};

  for (const inv of invoices) {
    for (const item of inv.items) {
      if (!hsnMap[item.hsnSacCode]) {
        hsnMap[item.hsnSacCode] = {
          hsnCode: item.hsnSacCode,
          description: item.name,
          unit: item.unit,
          totalQty: 0,
          totalValue: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
        };
      }
      const entry = hsnMap[item.hsnSacCode];
      entry.totalQty += item.quantity;
      entry.totalValue += item.totalAmount;
      entry.taxableValue += item.taxableAmount;
      entry.cgst += item.cgstAmount;
      entry.sgst += item.sgstAmount;
      entry.igst += item.igstAmount;
      entry.cess += item.cessAmount;
    }
  }

  const hsnSummaryList = Object.values(hsnMap);

  const exportGstrJson = () => {
    const gstr1Payload = {
      version: 'GSTR1_v2.0',
      b2b: b2bInvoices.map((inv) => ({
        ctin: inv.partyGstin,
        inv: [
          {
            inum: inv.invoiceNumber,
            idt: inv.date,
            val: inv.grandTotal,
            pos: inv.placeOfSupplyStateCode,
            rchrg: 'N',
            itms: inv.items.map((it, idx) => ({
              num: idx + 1,
              itm_det: {
                rt: it.gstRate,
                txval: it.taxableAmount,
                camt: it.cgstAmount,
                samt: it.sgstAmount,
                iamt: it.igstAmount,
                csamt: it.cessAmount,
              },
            })),
          },
        ],
      })),
      b2cs: b2csInvoices.map((inv) => ({
        sply_ty: inv.isIntraState ? 'INTRA' : 'INTER',
        pos: inv.placeOfSupplyStateCode,
        txval: inv.totalTaxableAmount,
        camt: inv.totalCgst,
        samt: inv.totalSgst,
        iamt: inv.totalIgst,
      })),
      hsn: {
        data: hsnSummaryList.map((h, idx) => ({
          num: idx + 1,
          hsn_sc: h.hsnCode,
          desc: h.description,
          uqc: h.unit,
          qty: h.totalQty,
          val: h.totalValue,
          txval: h.taxableValue,
          iamt: h.igst,
          camt: h.cgst,
          samt: h.sgst,
          csamt: h.cess,
        })),
      },
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(gstr1Payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `GSTR1_Export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        padding: '1.25rem',
        borderRadius: '8px',
        border: '1px solid #334155',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              GSTR-1 Monthly Return Reports
            </h2>
            <span style={{ backgroundColor: '#064e3b', color: '#6ee7b7', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
              GST Portal Ready
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Outward supplies summary segmented into B2B, B2C Small, and HSN Table 12.
          </p>
        </div>

        <button
          onClick={exportGstrJson}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: '#059669',
            color: '#fff',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <Download size={16} /> Export GSTR-1 JSON
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setSelectedSection('4_B2B')}
          style={{
            backgroundColor: selectedSection === '4_B2B' ? '#2563eb' : 'transparent',
            color: selectedSection === '4_B2B' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          Table 4: B2B Invoices ({b2bInvoices.length})
        </button>

        <button
          onClick={() => setSelectedSection('7_B2CS')}
          style={{
            backgroundColor: selectedSection === '7_B2CS' ? '#2563eb' : 'transparent',
            color: selectedSection === '7_B2CS' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          Table 7: B2C Small ({b2csInvoices.length})
        </button>

        <button
          onClick={() => setSelectedSection('12_HSN')}
          style={{
            backgroundColor: selectedSection === '12_HSN' ? '#2563eb' : 'transparent',
            color: selectedSection === '12_HSN' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          Table 12: HSN Summary ({hsnSummaryList.length})
        </button>
      </div>

      {/* Section Content */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}>
        {selectedSection === '4_B2B' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.75rem 1rem' }}>GSTIN of Recipient</th>
                <th style={{ padding: '0.75rem 1rem' }}>Receiver Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>POS State</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable Value</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>CGST</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>SGST</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>IGST</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {b2bInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                    No B2B registered customer invoices in this period.
                  </td>
                </tr>
              ) : (
                b2bInvoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#38bdf8' }}>{inv.partyGstin}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>{inv.partyName}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{formatDate(inv.date)}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{inv.placeOfSupplyStateCode}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(inv.totalTaxableAmount)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(inv.totalCgst)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(inv.totalSgst)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(inv.totalIgst)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>{formatINR(inv.grandTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {selectedSection === '7_B2CS' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Customer Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Supply Type</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable Value</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Tax (CGST+SGST/IGST)</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Invoice Total</th>
              </tr>
            </thead>
            <tbody>
              {b2csInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                    No B2C small retail bills in this period.
                  </td>
                </tr>
              ) : (
                b2csInvoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#60a5fa' }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{formatDate(inv.date)}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>{inv.partyName}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{inv.isIntraState ? 'Intra-State' : 'Inter-State'}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(inv.totalTaxableAmount)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(inv.totalTax)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>{formatINR(inv.grandTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {selectedSection === '12_HSN' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.75rem 1rem' }}>HSN / SAC</th>
                <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                <th style={{ padding: '0.75rem 1rem' }}>UQC</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Qty</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Value</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable Value</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>CGST</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>SGST</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>IGST</th>
              </tr>
            </thead>
            <tbody>
              {hsnSummaryList.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                    No HSN items billed yet.
                  </td>
                </tr>
              ) : (
                hsnSummaryList.map((h, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#38bdf8' }}>{h.hsnCode}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>{h.description}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{h.unit}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{h.totalQty}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>{formatINR(h.totalValue)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(h.taxableValue)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(h.cgst)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(h.sgst)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(h.igst)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
