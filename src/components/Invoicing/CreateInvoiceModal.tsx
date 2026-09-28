import React, { useState } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { Invoice, InvoiceItemEntry, InvoiceType, PaymentMode } from '../../models/invoice.ts';
import { calculateInvoice, InvoiceItemCalculationInput } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { GST_STATES, getStateList } from '../../core/gst/stateCodes.ts';
import { X, Plus, Trash2, CheckCircle2 } from 'lucide-react';

interface CreateInvoiceModalProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
}

export const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
  company,
  parties,
  itemsCatalog,
  onClose,
  onSave,
}) => {
  const [selectedPartyId, setSelectedPartyId] = useState<string>(parties[0]?.id || '');
  const [customerName, setCustomerName] = useState<string>(parties[0]?.name || '');
  const [customerGstin, setCustomerGstin] = useState<string>(parties[0]?.gstin || '');
  const [customerAddress, setCustomerAddress] = useState<string>(parties[0]?.billingAddress || '');
  const [posStateCode, setPosStateCode] = useState<string>(parties[0]?.stateCode || company.stateCode);

  const [invoiceType, setInvoiceType] = useState<InvoiceType>('B2B');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');

  // Line items state
  const [lines, setLines] = useState<Array<{
    itemId: string;
    name: string;
    hsnSacCode: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    gstRate: number;
  }>>([
    {
      itemId: itemsCatalog[0]?.id || 'CUSTOM',
      name: itemsCatalog[0]?.name || 'Standard Item',
      hsnSacCode: itemsCatalog[0]?.hsnSacCode || '844332',
      quantity: 1,
      unitPrice: itemsCatalog[0]?.salePrice || 1000,
      discountPercent: 0,
      gstRate: itemsCatalog[0]?.gstRate || 18,
    },
  ]);

  // Handle party change
  const handlePartySelect = (partyId: string) => {
    setSelectedPartyId(partyId);
    const p = parties.find((party) => party.id === partyId);
    if (p) {
      setCustomerName(p.name);
      setCustomerGstin(p.gstin || '');
      setCustomerAddress(p.billingAddress);
      setPosStateCode(p.stateCode);
      setInvoiceType(p.gstin ? 'B2B' : 'B2CS');
    }
  };

  // Add line item
  const addLine = () => {
    setLines([
      ...lines,
      {
        itemId: 'CUSTOM',
        name: '',
        hsnSacCode: '998313',
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        gstRate: 18,
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const updateLine = (index: number, field: string, value: any) => {
    const updated = [...lines];
    if (field === 'catalogSelect') {
      const itm = itemsCatalog.find((i) => i.id === value);
      if (itm) {
        updated[index] = {
          itemId: itm.id,
          name: itm.name,
          hsnSacCode: itm.hsnSacCode,
          quantity: 1,
          unitPrice: itm.salePrice,
          discountPercent: 0,
          gstRate: itm.gstRate,
        };
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setLines(updated);
  };

  // Compute live GST calculation using Core GST Engine
  const calculationInputs: InvoiceItemCalculationInput[] = lines.map((l) => ({
    quantity: Number(l.quantity) || 1,
    unitPrice: Number(l.unitPrice) || 0,
    discountPercent: Number(l.discountPercent) || 0,
    gstRate: Number(l.gstRate) || 0,
  }));

  const calcSummary = calculateInvoice(company.stateCode, posStateCode, calculationInputs);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const invoiceItems: InvoiceItemEntry[] = lines.map((l, idx) => {
      const calcItem = calcSummary.items[idx];
      return {
        itemId: l.itemId,
        name: l.name,
        hsnSacCode: l.hsnSacCode,
        unit: 'PCS',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        taxableAmount: calcItem.taxableAmount,
        gstRate: l.gstRate,
        cgstAmount: calcItem.cgstAmount,
        sgstAmount: calcItem.sgstAmount,
        igstAmount: calcItem.igstAmount,
        cessAmount: calcItem.cessAmount,
        totalAmount: calcItem.totalAmount,
      };
    });

    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNumber: `${company.invoicePrefix || 'INV-'}${Math.floor(1000 + Math.random() * 9000)}`,
      invoiceType,
      date: invoiceDate,
      partyId: selectedPartyId,
      partyName: customerName,
      partyGstin: customerGstin || undefined,
      partyAddress: customerAddress,
      partyStateCode: posStateCode,
      placeOfSupplyStateCode: posStateCode,
      isIntraState: calcSummary.isIntraState,
      items: invoiceItems,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: calcSummary.totalDiscount,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: calcSummary.totalCgst,
      totalSgst: calcSummary.totalSgst,
      totalIgst: calcSummary.totalIgst,
      totalCess: calcSummary.totalCess,
      totalTax: calcSummary.totalTax,
      roundOff: calcSummary.roundOff,
      grandTotal: calcSummary.grandTotal,
      amountInWords: amountInWords(calcSummary.grandTotal),
      paymentMode,
      paymentStatus: 'PAID',
      paidAmount: calcSummary.grandTotal,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newInvoice);
  };

  const isIntra = company.stateCode === posStateCode;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: '1rem',
    }}>
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        width: '100%',
        maxWidth: '920px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Generate Tax Invoice
            </h2>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Tax Regime: {isIntra ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Party and Date Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                Select Customer / Party
              </label>
              <select
                value={selectedPartyId}
                onChange={(e) => handlePartySelect(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              >
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.gstin ? `(${p.gstin})` : '(Unregistered)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                Place of Supply (State)
              </label>
              <select
                value={posStateCode}
                onChange={(e) => setPosStateCode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              >
                {getStateList().map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI / QR Code</option>
                <option value="CARD">Debit / Credit Card</option>
                <option value="NET_BANKING">Bank Transfer (NEFT/RTGS)</option>
                <option value="CREDIT">Credit (Due Later)</option>
              </select>
            </div>
          </div>

          {/* Line Items Table */}
          <div style={{ backgroundColor: '#0f172a', borderRadius: '6px', padding: '0.75rem', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc' }}>Itemized Tax Lines</span>
              <button
                type="button"
                onClick={addLine}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  backgroundColor: '#334155',
                  color: '#fff',
                  border: 'none',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Add Line
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {lines.map((l, idx) => {
                const itemCalc = calcSummary.items[idx];
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 30px',
                      gap: '0.5rem',
                      alignItems: 'center',
                      backgroundColor: '#1e293b',
                      padding: '0.5rem',
                      borderRadius: '4px',
                    }}
                  >
                    <div>
                      <select
                        onChange={(e) => updateLine(idx, 'catalogSelect', e.target.value)}
                        style={{ width: '100%', marginBottom: '4px', backgroundColor: '#0f172a', color: '#94a3b8', border: '1px solid #334155', fontSize: '0.75rem', padding: '3px', borderRadius: '4px' }}
                      >
                        <option value="">-- Choose from Catalog --</option>
                        {itemsCatalog.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name} ({cat.hsnSacCode})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Description"
                        value={l.name}
                        onChange={(e) => updateLine(idx, 'name', e.target.value)}
                        required
                        style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '4px 6px', fontSize: '0.8rem', borderRadius: '4px' }}
                      />
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="HSN"
                        value={l.hsnSacCode}
                        onChange={(e) => updateLine(idx, 'hsnSacCode', e.target.value)}
                        style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '6px', fontSize: '0.8rem', borderRadius: '4px' }}
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        placeholder="Qty"
                        min="1"
                        value={l.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                        style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '6px', fontSize: '0.8rem', borderRadius: '4px' }}
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        placeholder="Rate ₹"
                        min="0"
                        value={l.unitPrice}
                        onChange={(e) => updateLine(idx, 'unitPrice', Number(e.target.value))}
                        style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '6px', fontSize: '0.8rem', borderRadius: '4px' }}
                      />
                    </div>

                    <div>
                      <select
                        value={l.gstRate}
                        onChange={(e) => updateLine(idx, 'gstRate', Number(e.target.value))}
                        style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '6px', fontSize: '0.8rem', borderRadius: '4px' }}
                      >
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                      </select>
                    </div>

                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', textAlign: 'right' }}>
                      {formatINR(itemCalc?.totalAmount || 0)}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tax Breakdown Summary Card */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem',
            backgroundColor: '#0f172a',
            padding: '1rem',
            borderRadius: '6px',
            border: '1px solid #334155',
          }}>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div>
                <strong>Amount in Words:</strong>
                <div style={{ color: '#cbd5e1', fontStyle: 'italic', marginTop: '2px' }}>
                  {amountInWords(calcSummary.grandTotal)}
                </div>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                ● Supplier GSTIN: <span style={{ color: '#93c5fd' }}>{company.gstin} ({company.stateCode})</span>
              </div>
              <div style={{ fontSize: '0.75rem' }}>
                ● Recipient State: <span style={{ color: '#86efac' }}>{posStateCode} ({GST_STATES[posStateCode]?.name})</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                <span>Taxable Value:</span>
                <span>{formatINR(calcSummary.totalTaxableAmount)}</span>
              </div>

              {calcSummary.isIntraState ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>CGST:</span>
                    <span>{formatINR(calcSummary.totalCgst)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                    <span>SGST:</span>
                    <span>{formatINR(calcSummary.totalSgst)}</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>IGST (Inter-State):</span>
                  <span>{formatINR(calcSummary.totalIgst)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                <span>Round Off:</span>
                <span>{calcSummary.roundOff > 0 ? `+${calcSummary.roundOff}` : calcSummary.roundOff}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#f8fafc',
                fontWeight: 700,
                fontSize: '1.1rem',
                borderTop: '1px solid #334155',
                paddingTop: '0.5rem',
              }}>
                <span>Total Invoice Value:</span>
                <span style={{ color: '#38bdf8' }}>{formatINR(calcSummary.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={16} /> Save & Generate Tax Invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
