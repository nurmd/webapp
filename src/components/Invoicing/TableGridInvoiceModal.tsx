import React, { useState } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { Invoice, InvoiceItemEntry, InvoiceType, PaymentMode } from '../../models/invoice.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { SelectPartyModal } from '../Parties/SelectPartyModal.tsx';
import { X, Plus, Trash2, CheckCircle2, User, Printer } from 'lucide-react';

interface TableGridInvoiceModalProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
  onAddNewParty: () => void;
}

interface GridRow {
  itemId: string;
  name: string;
  hsnSacCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  gstRate: number;
}

export const TableGridInvoiceModal: React.FC<TableGridInvoiceModalProps> = ({
  company,
  parties,
  itemsCatalog,
  onClose,
  onSave,
  onAddNewParty,
}) => {
  const [selectedParty, setSelectedParty] = useState<Party | null>(parties[0] || null);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [posStateCode, setPosStateCode] = useState(selectedParty?.stateCode || company.stateCode);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');

  // Grid rows
  const [rows, setRows] = useState<GridRow[]>([
    {
      itemId: itemsCatalog[0]?.id || '',
      name: itemsCatalog[0]?.name || '',
      hsnSacCode: itemsCatalog[0]?.hsnSacCode || '844332',
      quantity: 1,
      unit: itemsCatalog[0]?.unit || 'PCS',
      unitPrice: itemsCatalog[0]?.salePrice || 1000,
      discountPercent: 0,
      gstRate: itemsCatalog[0]?.gstRate || 18,
    },
  ]);

  const addRow = () => {
    setRows([
      ...rows,
      {
        itemId: '',
        name: '',
        hsnSacCode: '998313',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 0,
        discountPercent: 0,
        gstRate: 18,
      },
    ]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, idx) => idx !== index));
  };

  const updateRow = (index: number, field: keyof GridRow, value: any) => {
    const updated = [...rows];
    (updated[index] as any)[field] = value;
    setRows(updated);
  };

  const handleSelectItemFromCatalog = (index: number, itemId: string) => {
    const itm = itemsCatalog.find((i) => i.id === itemId);
    if (itm) {
      const updated = [...rows];
      updated[index] = {
        itemId: itm.id,
        name: itm.name,
        hsnSacCode: itm.hsnSacCode,
        quantity: 1,
        unit: itm.unit,
        unitPrice: itm.salePrice,
        discountPercent: 0,
        gstRate: itm.gstRate,
      };
      setRows(updated);
    }
  };

  // Live calculation
  const calcInputs = rows.map((r) => ({
    quantity: Number(r.quantity) || 1,
    unitPrice: Number(r.unitPrice) || 0,
    discountPercent: Number(r.discountPercent) || 0,
    gstRate: Number(r.gstRate) || 0,
  }));

  const calcSummary = calculateInvoice(company.stateCode, posStateCode, calcInputs);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const invoiceItems: InvoiceItemEntry[] = rows.map((r, idx) => {
      const calcItem = calcSummary.items[idx];
      return {
        itemId: r.itemId || `CUSTOM-${Date.now()}-${idx}`,
        name: r.name || 'Billed Item',
        hsnSacCode: r.hsnSacCode,
        unit: (r.unit as any) || 'PCS',
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        discountPercent: r.discountPercent,
        taxableAmount: calcItem.taxableAmount,
        gstRate: r.gstRate,
        cgstAmount: calcItem.cgstAmount,
        sgstAmount: calcItem.sgstAmount,
        igstAmount: calcItem.igstAmount,
        cessAmount: calcItem.cessAmount,
        totalAmount: calcItem.totalAmount,
      };
    });

    const isB2B = Boolean(selectedParty?.gstin && selectedParty.gstin.length === 15);

    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNumber: `${company.invoicePrefix || 'INV-'}${Math.floor(1000 + Math.random() * 9000)}`,
      invoiceType: isB2B ? 'B2B' : 'B2CS',
      date: invoiceDate,
      dueDate: dueDate || undefined,
      partyId: selectedParty?.id,
      partyName: selectedParty?.name || 'Cash Counter Customer',
      partyGstin: selectedParty?.gstin,
      partyAddress: selectedParty?.billingAddress || 'Local Counter',
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

  return (
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
      zIndex: 60,
      padding: '1rem',
    }}>
      <div style={{
        backgroundColor: '#162035',
        borderRadius: '12px',
        border: '1px solid #273754',
        width: '100%',
        maxWidth: '1150px',
        height: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--card-shadow-lg)',
        overflow: 'hidden',
      }}>
        {/* Header Bar */}
        <div style={{
          padding: '0.85rem 1.5rem',
          borderBottom: '1px solid #273754',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#131b2e',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              color: '#fff',
            }}>
              ₹
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                High-Speed Table Grid Invoice
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Vyapar Desktop Mode • Inline Keyboard Table Editing
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{
              fontSize: '0.75rem',
              backgroundColor: calcSummary.isIntraState ? 'rgba(0, 135, 90, 0.2)' : 'rgba(37, 99, 235, 0.2)',
              color: calcSummary.isIntraState ? '#6cf8bb' : '#93c5fd',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              fontWeight: 600,
            }}>
              {calcSummary.isIntraState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top Meta Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
            gap: '1rem',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #273754',
            backgroundColor: '#0a0f1d',
          }}>
            {/* Party Card Button */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Bill To (Customer / Party) *
              </label>
              <button
                type="button"
                onClick={() => setIsPartyModalOpen(true)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  backgroundColor: '#162035',
                  border: '1px solid #273754',
                  borderRadius: '6px',
                  padding: '0.5rem 0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedParty?.name || 'Select Customer'}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    {selectedParty?.gstin ? `GSTIN: ${selectedParty.gstin}` : 'Retail / Unregistered'}
                  </div>
                </div>
                <User size={16} color="#60a5fa" />
              </button>
            </div>

            {/* Place of Supply */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Place of Supply State *
              </label>
              <select
                value={posStateCode}
                onChange={(e) => setPosStateCode(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#162035',
                  border: '1px solid #273754',
                  color: '#fff',
                  padding: '0.5rem',
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

            {/* Invoice Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#162035',
                  border: '1px solid #273754',
                  color: '#fff',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Payment Mode */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                style={{
                  width: '100%',
                  backgroundColor: '#162035',
                  border: '1px solid #273754',
                  color: '#fff',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI / Dynamic QR</option>
                <option value="CARD">Card POS</option>
                <option value="NET_BANKING">Bank Transfer</option>
                <option value="CREDIT">Credit (Receivable)</option>
              </select>
            </div>
          </div>

          {/* Tabular Grid Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#0a0f1d', color: '#94a3b8', borderBottom: '1px solid #273754' }}>
                  <th style={{ padding: '0.5rem', width: '35px', textAlign: 'center' }}>#</th>
                  <th style={{ padding: '0.5rem', minWidth: '220px' }}>Item Description</th>
                  <th style={{ padding: '0.5rem', width: '90px' }}>HSN</th>
                  <th style={{ padding: '0.5rem', width: '70px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '0.5rem', width: '80px' }}>Unit</th>
                  <th style={{ padding: '0.5rem', width: '110px', textAlign: 'right' }}>Rate (₹)</th>
                  <th style={{ padding: '0.5rem', width: '80px', textAlign: 'right' }}>Disc %</th>
                  <th style={{ padding: '0.5rem', width: '90px', textAlign: 'center' }}>GST Rate</th>
                  <th style={{ padding: '0.5rem', width: '110px', textAlign: 'right' }}>Taxable</th>
                  <th style={{ padding: '0.5rem', width: '120px', textAlign: 'right' }}>Total (₹)</th>
                  <th style={{ padding: '0.5rem', width: '40px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const itemCalc = calcSummary.items[idx];
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #1d2a42' }}>
                      <td style={{ padding: '0.4rem', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>

                      <td style={{ padding: '0.4rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <input
                            type="text"
                            placeholder="Type item or select below..."
                            value={row.name}
                            onChange={(e) => updateRow(idx, 'name', e.target.value)}
                            required
                            style={{
                              backgroundColor: '#0a0f1d',
                              border: '1px solid #273754',
                              color: '#fff',
                              padding: '0.35rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.85rem',
                              width: '100%',
                            }}
                          />
                          <select
                            onChange={(e) => handleSelectItemFromCatalog(idx, e.target.value)}
                            style={{
                              backgroundColor: '#131b2e',
                              border: 'none',
                              color: '#64748b',
                              fontSize: '0.7rem',
                              padding: '2px',
                            }}
                          >
                            <option value="">Quick catalog select...</option>
                            {itemsCatalog.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name} (₹{cat.salePrice})
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="text"
                          value={row.hsnSacCode}
                          onChange={(e) => updateRow(idx, 'hsnSacCode', e.target.value)}
                          style={{
                            backgroundColor: '#0a0f1d',
                            border: '1px solid #273754',
                            color: '#fff',
                            padding: '0.35rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            width: '100%',
                            textAlign: 'center',
                          }}
                        />
                      </td>

                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(idx, 'quantity', Number(e.target.value))}
                          style={{
                            backgroundColor: '#0a0f1d',
                            border: '1px solid #273754',
                            color: '#fff',
                            padding: '0.35rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            width: '100%',
                            textAlign: 'right',
                          }}
                        />
                      </td>

                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="text"
                          value={row.unit}
                          onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                          style={{
                            backgroundColor: '#0a0f1d',
                            border: '1px solid #273754',
                            color: '#fff',
                            padding: '0.35rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            width: '100%',
                          }}
                        />
                      </td>

                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.unitPrice}
                          onChange={(e) => updateRow(idx, 'unitPrice', Number(e.target.value))}
                          style={{
                            backgroundColor: '#0a0f1d',
                            border: '1px solid #273754',
                            color: '#fff',
                            padding: '0.35rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            width: '100%',
                            textAlign: 'right',
                          }}
                        />
                      </td>

                      <td style={{ padding: '0.4rem' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={row.discountPercent}
                          onChange={(e) => updateRow(idx, 'discountPercent', Number(e.target.value))}
                          style={{
                            backgroundColor: '#0a0f1d',
                            border: '1px solid #273754',
                            color: '#fff',
                            padding: '0.35rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            width: '100%',
                            textAlign: 'right',
                          }}
                        />
                      </td>

                      <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                        <select
                          value={row.gstRate}
                          onChange={(e) => updateRow(idx, 'gstRate', Number(e.target.value))}
                          style={{
                            backgroundColor: '#0a0f1d',
                            border: '1px solid #273754',
                            color: '#fff',
                            padding: '0.35rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                          }}
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </td>

                      <td style={{ padding: '0.4rem', textAlign: 'right', color: '#cbd5e1' }}>
                        {formatINR(itemCalc?.taxableAmount || 0)}
                      </td>

                      <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                        {formatINR(itemCalc?.totalAmount || 0)}
                      </td>

                      <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <button
              type="button"
              onClick={addRow}
              style={{
                marginTop: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                backgroundColor: '#1d2a42',
                color: '#60a5fa',
                border: '1px dashed #273754',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <Plus size={14} /> Add Row [Tab/Enter]
            </button>
          </div>

          {/* Bottom Summary & Actions Bar */}
          <div style={{
            backgroundColor: '#0a0f1d',
            borderTop: '1px solid #273754',
            padding: '1rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Amount in Words:</div>
              <div style={{ fontSize: '0.8rem', color: '#cbd5e1', fontStyle: 'italic', maxWidth: '400px' }}>
                {amountInWords(calcSummary.grandTotal)}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                <div>
                  <div style={{ color: '#94a3b8' }}>Taxable</div>
                  <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{formatINR(calcSummary.totalTaxableAmount)}</div>
                </div>

                {calcSummary.isIntraState ? (
                  <>
                    <div>
                      <div style={{ color: '#94a3b8' }}>CGST</div>
                      <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{formatINR(calcSummary.totalCgst)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8' }}>SGST</div>
                      <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{formatINR(calcSummary.totalSgst)}</div>
                    </div>
                  </>
                ) : (
                  <div>
                    <div style={{ color: '#94a3b8' }}>IGST</div>
                    <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{formatINR(calcSummary.totalIgst)}</div>
                  </div>
                )}

                <div>
                  <div style={{ color: '#94a3b8' }}>Round Off</div>
                  <div style={{ fontWeight: 600, color: '#cbd5e1' }}>
                    {calcSummary.roundOff > 0 ? `+${calcSummary.roundOff}` : calcSummary.roundOff}
                  </div>
                </div>

                <div>
                  <div style={{ color: '#94a3b8' }}>Total Payable</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#6cf8bb' }}>
                    {formatINR(calcSummary.grandTotal)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #273754',
                    color: '#94a3b8',
                    padding: '0.55rem 1rem',
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
                    backgroundColor: '#00875a',
                    color: '#fff',
                    border: 'none',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                  }}
                >
                  <CheckCircle2 size={16} /> Save & Generate Tax Invoice
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {isPartyModalOpen && (
        <SelectPartyModal
          parties={parties}
          onSelectParty={(p) => {
            setSelectedParty(p);
            setPosStateCode(p.stateCode);
            setIsPartyModalOpen(false);
          }}
          onClose={() => setIsPartyModalOpen(false)}
          onAddNewParty={() => {
            setIsPartyModalOpen(false);
            onAddNewParty();
          }}
        />
      )}
    </div>
  );
};
