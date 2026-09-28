import React, { useState } from 'react';
import { PurchaseBill, ItcEligibility } from '../../models/purchase.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InventoryItem } from '../../models/item.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import {
  Search,
  Plus,
  ShoppingBag,
  TrendingDown,
  ShieldCheck,
  AlertOctagon,
  Trash2,
  X,
  CheckCircle2,
} from 'lucide-react';

interface PurchasesHubViewProps {
  purchases: PurchaseBill[];
  parties: Party[];
  company: CompanyProfile;
  itemsCatalog: InventoryItem[];
  onSavePurchase: (bill: PurchaseBill) => void;
  onDeletePurchase: (id: string) => void;
}

export const PurchasesHubView: React.FC<PurchasesHubViewProps> = ({
  purchases,
  parties,
  company,
  itemsCatalog,
  onSavePurchase,
  onDeletePurchase,
}) => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Purchase Bill Form State
  const suppliers = parties.filter((p) => p.type === 'SUPPLIER' || p.type === 'CUSTOMER');
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || '');
  const [billNumber, setBillNumber] = useState(`BILL-${Math.floor(1000 + Math.random() * 9000)}`);
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [itcEligibility, setItcEligibility] = useState<ItcEligibility>('ELIGIBLE_INPUTS');
  const [supplierStateCode, setSupplierStateCode] = useState(suppliers[0]?.stateCode || company.stateCode);

  const [lines, setLines] = useState<Array<{
    itemId: string;
    name: string;
    hsnSacCode: string;
    quantity: number;
    unitPrice: number;
    gstRate: number;
  }>>([
    {
      itemId: itemsCatalog[0]?.id || '',
      name: itemsCatalog[0]?.name || 'Purchased Raw Material',
      hsnSacCode: itemsCatalog[0]?.hsnSacCode || '844332',
      quantity: 5,
      unitPrice: 2000,
      gstRate: 18,
    },
  ]);

  const addLine = () => {
    setLines([...lines, { itemId: '', name: '', hsnSacCode: '844332', quantity: 1, unitPrice: 0, gstRate: 18 }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: string, val: any) => {
    const updated = [...lines];
    (updated[idx] as any)[field] = val;
    setLines(updated);
  };

  // Metrics
  const totalPurchases = purchases.reduce((s, p) => s + p.grandTotal, 0);
  const eligibleItc = purchases
    .filter((p) => p.itcEligibility !== 'INELIGIBLE_17_5')
    .reduce((s, p) => s + p.totalTax, 0);
  const ineligibleItc = purchases
    .filter((p) => p.itcEligibility === 'INELIGIBLE_17_5')
    .reduce((s, p) => s + p.totalTax, 0);
  const totalPayables = purchases.reduce((s, p) => s + p.balanceAmount, 0);

  // Live calculation
  const calcInputs = lines.map((l) => ({
    quantity: Number(l.quantity) || 1,
    unitPrice: Number(l.unitPrice) || 0,
    gstRate: Number(l.gstRate) || 0,
  }));
  const calcSummary = calculateInvoice(supplierStateCode, company.stateCode, calcInputs);

  const handleSaveBill = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((p) => p.id === selectedSupplierId) || suppliers[0];

    const billItems = lines.map((l, idx) => {
      const calcItem = calcSummary.items[idx];
      return {
        itemId: l.itemId || undefined,
        name: l.name,
        hsnSacCode: l.hsnSacCode,
        unit: 'PCS' as const,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxableAmount: calcItem.taxableAmount,
        gstRate: l.gstRate,
        cgstAmount: calcItem.cgstAmount,
        sgstAmount: calcItem.sgstAmount,
        igstAmount: calcItem.igstAmount,
        cessAmount: calcItem.cessAmount,
        totalAmount: calcItem.totalAmount,
      };
    });

    const newBill: PurchaseBill = {
      id: `PUR-${Date.now()}`,
      billNumber,
      date: billDate,
      supplierId: sup?.id || 'SUP-001',
      supplierName: sup?.name || 'Local Supplier',
      supplierGstin: sup?.gstin,
      supplierAddress: sup?.billingAddress || 'Supplier City',
      supplierStateCode,
      placeOfSupplyStateCode: company.stateCode,
      isIntraState: calcSummary.isIntraState,
      items: billItems,
      itcEligibility,
      isRcm: false,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: 0,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: calcSummary.totalCgst,
      totalSgst: calcSummary.totalSgst,
      totalIgst: calcSummary.totalIgst,
      totalCess: calcSummary.totalCess,
      totalTax: calcSummary.totalTax,
      roundOff: calcSummary.roundOff,
      grandTotal: calcSummary.grandTotal,
      paymentMode: 'NET_BANKING',
      paymentStatus: 'PAID',
      paidAmount: calcSummary.grandTotal,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSavePurchase(newBill);
    setIsModalOpen(false);
  };

  const filtered = purchases.filter(
    (p) =>
      p.billNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#162035',
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        border: '1px solid #273754',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
            Purchases & Input Tax Credit (ITC) Hub
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Vendor bills, stock intake, and GSTR-3B Input Tax Credit reconciliation
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: '#00875a',
            color: '#fff',
            border: 'none',
            padding: '0.55rem 1.1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.85rem',
          }}
        >
          <Plus size={16} /> Record Purchase Bill
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div style={{ backgroundColor: '#162035', padding: '1.1rem', borderRadius: '8px', border: '1px solid #273754' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Total Inward Purchases</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>{formatINR(totalPurchases)}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>{purchases.length} vendor bills recorded</div>
        </div>

        <div style={{ backgroundColor: '#162035', padding: '1.1rem', borderRadius: '8px', border: '1px solid #273754' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Claimable ITC (GSTR-3B)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#6cf8bb', marginTop: '4px' }}>{formatINR(eligibleItc)}</div>
          <div style={{ fontSize: '0.75rem', color: '#6cf8bb', marginTop: '2px' }}>Offsets outward GST liability</div>
        </div>

        <div style={{ backgroundColor: '#162035', padding: '1.1rem', borderRadius: '8px', border: '1px solid #273754' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Blocked / Ineligible ITC</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: ineligibleItc > 0 ? '#ef4444' : '#94a3b8', marginTop: '4px' }}>
            {formatINR(ineligibleItc)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Section 17(5) blocked credits</div>
        </div>

        <div style={{ backgroundColor: '#162035', padding: '1.1rem', borderRadius: '8px', border: '1px solid #273754' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Vendor Payables</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: totalPayables > 0 ? '#f59e0b' : '#6cf8bb', marginTop: '4px' }}>
            {formatINR(totalPayables)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Outstanding to creditors</div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        backgroundColor: '#162035',
        padding: '0.5rem 0.85rem',
        borderRadius: '8px',
        border: '1px solid #273754',
      }}>
        <Search size={16} color="#94a3b8" />
        <input
          type="text"
          placeholder="Search by vendor bill # or supplier name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ background: 'none', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '0.85rem' }}
        />
      </div>

      {/* Purchase Bills Table */}
      <div style={{ backgroundColor: '#162035', borderRadius: '8px', border: '1px solid #273754', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#0a0f1d', color: '#94a3b8', borderBottom: '1px solid #273754' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Bill #</th>
              <th style={{ padding: '0.75rem 1rem' }}>Date</th>
              <th style={{ padding: '0.75rem 1rem' }}>Supplier / Vendor</th>
              <th style={{ padding: '0.75rem 1rem' }}>ITC Category</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Input GST (ITC)</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Bill Total</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #1d2a42' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#60a5fa' }}>{p.billNumber}</td>
                <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{formatDate(p.date)}</td>
                <td style={{ padding: '0.75rem 1rem', color: '#f8fafc', fontWeight: 600 }}>
                  {p.supplierName}
                  {p.supplierGstin && <div style={{ fontSize: '0.7rem', color: '#38bdf8' }}>GSTIN: {p.supplierGstin}</div>}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    backgroundColor: p.itcEligibility === 'INELIGIBLE_17_5' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 135, 90, 0.2)',
                    color: p.itcEligibility === 'INELIGIBLE_17_5' ? '#fca5a5' : '#6cf8bb',
                  }}>
                    {p.itcEligibility.replace('_', ' ')}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>{formatINR(p.totalTaxableAmount)}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#6cf8bb' }}>{formatINR(p.totalTax)}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>{formatINR(p.grandTotal)}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <button
                    onClick={() => onDeletePurchase(p.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Record Purchase Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(10, 15, 29, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 70,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#162035',
            borderRadius: '12px',
            border: '1px solid #273754',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #273754', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Record Vendor Purchase Bill (Input Tax Credit)
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBill} style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Supplier / Vendor</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => {
                      setSelectedSupplierId(e.target.value);
                      const s = suppliers.find((p) => p.id === e.target.value);
                      if (s) setSupplierStateCode(s.stateCode);
                    }}
                    style={{ width: '100%', backgroundColor: '#0a0f1d', border: '1px solid #273754', color: '#fff', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.stateCode})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Vendor Bill #</label>
                  <input
                    type="text"
                    required
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    style={{ width: '100%', backgroundColor: '#0a0f1d', border: '1px solid #273754', color: '#fff', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Bill Date</label>
                  <input
                    type="date"
                    required
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    style={{ width: '100%', backgroundColor: '#0a0f1d', border: '1px solid #273754', color: '#fff', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>ITC Eligibility</label>
                  <select
                    value={itcEligibility}
                    onChange={(e) => setItcEligibility(e.target.value as ItcEligibility)}
                    style={{ width: '100%', backgroundColor: '#0a0f1d', border: '1px solid #273754', color: '#fff', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}
                  >
                    <option value="ELIGIBLE_INPUTS">Eligible - Inputs (Goods)</option>
                    <option value="ELIGIBLE_CAPITAL_GOODS">Eligible - Capital Goods</option>
                    <option value="ELIGIBLE_SERVICES">Eligible - Input Services</option>
                    <option value="INELIGIBLE_17_5">Ineligible - Blocked Sec 17(5)</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div style={{ backgroundColor: '#0a0f1d', padding: '0.75rem', borderRadius: '6px', border: '1px solid #273754' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>Purchased Items & Raw Materials</span>
                  <button type="button" onClick={addLine} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>
                    + Add Item
                  </button>
                </div>

                {lines.map((l, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 30px', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <input
                      type="text"
                      placeholder="Item name"
                      value={l.name}
                      onChange={(e) => updateLine(idx, 'name', e.target.value)}
                      required
                      style={{ backgroundColor: '#162035', border: '1px solid #273754', color: '#fff', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
                    />
                    <input
                      type="text"
                      placeholder="HSN"
                      value={l.hsnSacCode}
                      onChange={(e) => updateLine(idx, 'hsnSacCode', e.target.value)}
                      style={{ backgroundColor: '#162035', border: '1px solid #273754', color: '#fff', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      min="1"
                      value={l.quantity}
                      onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                      style={{ backgroundColor: '#162035', border: '1px solid #273754', color: '#fff', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
                    />
                    <input
                      type="number"
                      placeholder="Rate ₹"
                      min="0"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(idx, 'unitPrice', Number(e.target.value))}
                      style={{ backgroundColor: '#162035', border: '1px solid #273754', color: '#fff', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
                    />
                    <select
                      value={l.gstRate}
                      onChange={(e) => updateLine(idx, 'gstRate', Number(e.target.value))}
                      style={{ backgroundColor: '#162035', border: '1px solid #273754', color: '#fff', padding: '4px 6px', borderRadius: '4px', fontSize: '0.8rem' }}
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                    <button type="button" onClick={() => removeLine(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0a0f1d', padding: '0.75rem 1rem', borderRadius: '6px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Taxable: {formatINR(calcSummary.totalTaxableAmount)}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6cf8bb' }}>Input Tax Credit (ITC): {formatINR(calcSummary.totalTax)}</div>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
                  Total Bill: {formatINR(calcSummary.grandTotal)}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid #273754', color: '#94a3b8', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ backgroundColor: '#00875a', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>
                  <CheckCircle2 size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Save Purchase & Claim ITC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
