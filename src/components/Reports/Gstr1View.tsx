import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { Download, FileSpreadsheet, ShieldCheck, Calculator, BarChart3, Landmark } from 'lucide-react';

interface Gstr1ViewProps {
  invoices: Invoice[];
  purchases?: PurchaseBill[];
}

export const Gstr1View: React.FC<Gstr1ViewProps> = ({ invoices, purchases = [] }) => {
  const [activeMainTab, setActiveMainTab] = useState<'GSTR1' | 'GSTR3B' | 'PL' | 'BALANCE_SHEET'>('GSTR1');
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

  // GSTR-3B Calculations
  const outwardTaxable = invoices.reduce((s, i) => s + i.totalTaxableAmount, 0);
  const outwardCgst = invoices.reduce((s, i) => s + i.totalCgst, 0);
  const outwardSgst = invoices.reduce((s, i) => s + i.totalSgst, 0);
  const outwardIgst = invoices.reduce((s, i) => s + i.totalIgst, 0);
  const outwardTotalTax = outwardCgst + outwardSgst + outwardIgst;

  const eligiblePurchases = purchases.filter((p) => p.itcEligibility !== 'INELIGIBLE_17_5');
  const itcCgst = eligiblePurchases.reduce((s, p) => s + p.totalCgst, 0);
  const itcSgst = eligiblePurchases.reduce((s, p) => s + p.totalSgst, 0);
  const itcIgst = eligiblePurchases.reduce((s, p) => s + p.totalIgst, 0);
  const totalItc = itcCgst + itcSgst + itcIgst;

  const netCgstPayable = Math.max(0, outwardCgst - itcCgst);
  const netSgstPayable = Math.max(0, outwardSgst - itcSgst);
  const netIgstPayable = Math.max(0, outwardIgst - itcIgst);
  const netCashPayable = netCgstPayable + netSgstPayable + netIgstPayable;

  // Profit & Loss Calculations
  const totalSalesRevenue = invoices.reduce((s, i) => s + i.totalTaxableAmount, 0);
  const totalCostOfPurchases = purchases.reduce((s, p) => s + p.totalTaxableAmount, 0);
  const grossProfit = totalSalesRevenue - totalCostOfPurchases;
  const estimatedExpenses = Math.round(totalSalesRevenue * 0.05); // Estimated utilities/rent
  const netProfit = grossProfit - estimatedExpenses;

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
        backgroundColor: '#162035',
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        border: '1px solid #273754',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              GST Compliance & Financial Suite
            </h2>
            <span style={{ backgroundColor: '#064e3b', color: '#6ee7b7', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
              GST Portal Ready
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            GSTR-1 outward supplies, GSTR-3B tax offset, Profit & Loss, and Balance Sheet
          </p>
        </div>

        {activeMainTab === 'GSTR1' && (
          <button
            onClick={exportGstrJson}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#00875a',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            <Download size={16} /> Export GSTR-1 JSON
          </button>
        )}
      </div>

      {/* Main Suite Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #273754', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveMainTab('GSTR1')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeMainTab === 'GSTR1' ? '#2563eb' : 'transparent',
            color: activeMainTab === 'GSTR1' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <FileSpreadsheet size={16} /> GSTR-1 Outward Return
        </button>

        <button
          onClick={() => setActiveMainTab('GSTR3B')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeMainTab === 'GSTR3B' ? '#2563eb' : 'transparent',
            color: activeMainTab === 'GSTR3B' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <Calculator size={16} /> GSTR-3B Tax Offset
        </button>

        <button
          onClick={() => setActiveMainTab('PL')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeMainTab === 'PL' ? '#2563eb' : 'transparent',
            color: activeMainTab === 'PL' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <BarChart3 size={16} /> Profit & Loss
        </button>

        <button
          onClick={() => setActiveMainTab('BALANCE_SHEET')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeMainTab === 'BALANCE_SHEET' ? '#2563eb' : 'transparent',
            color: activeMainTab === 'BALANCE_SHEET' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <Landmark size={16} /> Balance Sheet
        </button>
      </div>

      {/* GSTR-1 View */}
      {activeMainTab === 'GSTR1' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setSelectedSection('4_B2B')}
              style={{
                backgroundColor: selectedSection === '4_B2B' ? '#1d2a42' : 'transparent',
                color: selectedSection === '4_B2B' ? '#60a5fa' : '#94a3b8',
                border: '1px solid #273754',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Table 4: B2B Invoices ({b2bInvoices.length})
            </button>
            <button
              onClick={() => setSelectedSection('7_B2CS')}
              style={{
                backgroundColor: selectedSection === '7_B2CS' ? '#1d2a42' : 'transparent',
                color: selectedSection === '7_B2CS' ? '#60a5fa' : '#94a3b8',
                border: '1px solid #273754',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Table 7: B2C Small ({b2csInvoices.length})
            </button>
            <button
              onClick={() => setSelectedSection('12_HSN')}
              style={{
                backgroundColor: selectedSection === '12_HSN' ? '#1d2a42' : 'transparent',
                color: selectedSection === '12_HSN' ? '#60a5fa' : '#94a3b8',
                border: '1px solid #273754',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Table 12: HSN Summary ({hsnSummaryList.length})
            </button>
          </div>

          <div style={{ backgroundColor: '#162035', borderRadius: '8px', border: '1px solid #273754', overflow: 'hidden' }}>
            {selectedSection === '4_B2B' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0a0f1d', color: '#94a3b8', borderBottom: '1px solid #273754' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>GSTIN of Recipient</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Receiver Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable Value</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>CGST</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>SGST</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>IGST</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {b2bInvoices.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No B2B invoices in this period.</td></tr>
                  ) : (
                    b2bInvoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #1d2a42' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#38bdf8' }}>{inv.partyGstin}</td>
                        <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>{inv.partyName}</td>
                        <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{inv.invoiceNumber}</td>
                        <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{formatDate(inv.date)}</td>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0a0f1d', color: '#94a3b8', borderBottom: '1px solid #273754' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Supply</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Tax</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {b2csInvoices.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #1d2a42' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#60a5fa' }}>{inv.invoiceNumber}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{formatDate(inv.date)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>{inv.partyName}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{inv.isIntraState ? 'Intra-State' : 'Inter-State'}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(inv.totalTaxableAmount)}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(inv.totalTax)}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>{formatINR(inv.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {selectedSection === '12_HSN' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0a0f1d', color: '#94a3b8', borderBottom: '1px solid #273754' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>HSN Code</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                    <th style={{ padding: '0.75rem 1rem' }}>UQC</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Qty</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable Value</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {hsnSummaryList.map((h, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1d2a42' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#38bdf8' }}>{h.hsnCode}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>{h.description}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{h.unit}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{h.totalQty}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(h.taxableValue)}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#6cf8bb' }}>{formatINR(h.cgst + h.sgst + h.igst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* GSTR-3B Tax Offset Calculation */}
      {activeMainTab === 'GSTR3B' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div style={{ backgroundColor: '#162035', padding: '1.25rem', borderRadius: '8px', border: '1px solid #273754' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>1. Total Outward Tax Liability</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444', marginTop: '0.5rem' }}>{formatINR(outwardTotalTax)}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                CGST: {formatINR(outwardCgst)} • SGST: {formatINR(outwardSgst)} • IGST: {formatINR(outwardIgst)}
              </div>
            </div>

            <div style={{ backgroundColor: '#162035', padding: '1.25rem', borderRadius: '8px', border: '1px solid #273754' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>2. Less: Eligible Input Tax Credit (ITC)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#6cf8bb', marginTop: '0.5rem' }}>-{formatINR(totalItc)}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                CGST: {formatINR(itcCgst)} • SGST: {formatINR(itcSgst)} • IGST: {formatINR(itcIgst)}
              </div>
            </div>

            <div style={{ backgroundColor: '#162035', padding: '1.25rem', borderRadius: '8px', border: '1px solid #273754' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>3. Net Tax Payable in Cash</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: netCashPayable > 0 ? '#f59e0b' : '#6cf8bb', marginTop: '0.5rem' }}>
                {formatINR(netCashPayable)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                Payable via Challan (Electronic Cash Ledger)
              </div>
            </div>
          </div>

          {/* Detailed GSTR-3B Table */}
          <div style={{ backgroundColor: '#162035', borderRadius: '8px', border: '1px solid #273754', padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.75rem' }}>
              Table 3.1 & Table 4 ITC Offset Breakdown
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#0a0f1d', color: '#94a3b8', borderBottom: '1px solid #273754' }}>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Tax Head</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Outward Tax (Liability)</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Input Tax Credit (ITC)</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Net Cash Payable</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #1d2a42' }}>
                  <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600, color: '#f8fafc' }}>Integrated Tax (IGST)</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>{formatINR(outwardIgst)}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: '#6cf8bb' }}>{formatINR(itcIgst)}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 700, color: netIgstPayable > 0 ? '#f59e0b' : '#6cf8bb' }}>
                    {formatINR(netIgstPayable)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1d2a42' }}>
                  <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600, color: '#f8fafc' }}>Central Tax (CGST)</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>{formatINR(outwardCgst)}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: '#6cf8bb' }}>{formatINR(itcCgst)}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 700, color: netCgstPayable > 0 ? '#f59e0b' : '#6cf8bb' }}>
                    {formatINR(netCgstPayable)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1d2a42' }}>
                  <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600, color: '#f8fafc' }}>State/UT Tax (SGST)</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>{formatINR(outwardSgst)}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: '#6cf8bb' }}>{formatINR(itcSgst)}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 700, color: netSgstPayable > 0 ? '#f59e0b' : '#6cf8bb' }}>
                    {formatINR(netSgstPayable)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profit & Loss Statement */}
      {activeMainTab === 'PL' && (
        <div style={{ backgroundColor: '#162035', padding: '1.5rem', borderRadius: '8px', border: '1px solid #273754', maxWidth: '750px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '1rem' }}>
            Profit & Loss Statement (Year to Date)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #273754', paddingBottom: '0.4rem' }}>
              <span style={{ fontWeight: 600, color: '#f8fafc' }}>Gross Sales Revenue (Taxable)</span>
              <span style={{ fontWeight: 700, color: '#6cf8bb' }}>{formatINR(totalSalesRevenue)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #273754', paddingBottom: '0.4rem' }}>
              <span style={{ color: '#94a3b8' }}>Less: Cost of Inward Purchases</span>
              <span style={{ color: '#ef4444' }}>-{formatINR(totalCostOfPurchases)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #273754', paddingBottom: '0.4rem', backgroundColor: '#0a0f1d', padding: '0.5rem', borderRadius: '4px' }}>
              <span style={{ fontWeight: 700, color: '#f8fafc' }}>Gross Operating Profit</span>
              <span style={{ fontWeight: 800, color: grossProfit >= 0 ? '#6cf8bb' : '#ef4444' }}>{formatINR(grossProfit)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #273754', paddingBottom: '0.4rem' }}>
              <span style={{ color: '#94a3b8' }}>Less: Operating & Logistics Expenses</span>
              <span style={{ color: '#ef4444' }}>-{formatINR(estimatedExpenses)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#131b2e', padding: '0.75rem', borderRadius: '6px', border: '1px solid #273754', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>Net Business Profit</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: netProfit >= 0 ? '#6cf8bb' : '#ef4444' }}>{formatINR(netProfit)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Balance Sheet */}
      {activeMainTab === 'BALANCE_SHEET' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div style={{ backgroundColor: '#162035', padding: '1.25rem', borderRadius: '8px', border: '1px solid #273754' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#60a5fa', marginBottom: '0.75rem' }}>
              Assets (Resources Owned)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Customer Receivables (Debtors)</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatINR(invoices.reduce((s, i) => s + i.balanceAmount, 0))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Input Tax Credit Balance (ITC)</span>
                <span style={{ fontWeight: 600, color: '#6cf8bb' }}>{formatINR(totalItc)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Cash & Bank Balances</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatINR(invoices.reduce((s, i) => s + i.paidAmount, 0))}</span>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: '#162035', padding: '1.25rem', borderRadius: '8px', border: '1px solid #273754' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.75rem' }}>
              Liabilities & Equities
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Vendor Payables (Creditors)</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatINR(purchases.reduce((s, p) => s + p.balanceAmount, 0))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>GST Output Tax Liability</span>
                <span style={{ fontWeight: 600, color: '#ef4444' }}>{formatINR(outwardTotalTax)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Retained Net Earnings</span>
                <span style={{ fontWeight: 600, color: '#6cf8bb' }}>{formatINR(netProfit)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
