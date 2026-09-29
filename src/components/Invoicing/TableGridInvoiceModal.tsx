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

interface TableGridInvoiceModalProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  initialInvoice?: Invoice | null;
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
  initialInvoice,
  onClose,
  onSave,
  onAddNewParty,
}) => {
  const [selectedParty, setSelectedParty] = useState<Party | null>(() => {
    if (initialInvoice) {
      const found = parties.find(
        (p) => p.id === initialInvoice.partyId || p.name === initialInvoice.partyName
      );
      if (found) return found;
      return {
        id: initialInvoice.partyId || 'CUSTOM_PARTY',
        name: initialInvoice.partyName,
        gstin: initialInvoice.partyGstin,
        phone: '',
        email: '',
        billingAddress: initialInvoice.partyAddress,
        stateCode: initialInvoice.partyStateCode,
        type: 'CUSTOMER',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return parties[0] || null;
  });

  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);

  const [invoiceDate, setInvoiceDate] = useState(
    initialInvoice ? initialInvoice.date : new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState(initialInvoice?.dueDate || '');
  const [posStateCode, setPosStateCode] = useState(
    initialInvoice?.placeOfSupplyStateCode || selectedParty?.stateCode || company.stateCode
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    initialInvoice?.paymentMode || 'CASH'
  );

  // Grid rows
  const [rows, setRows] = useState<GridRow[]>(() => {
    if (initialInvoice && initialInvoice.items.length > 0) {
      return initialInvoice.items.map((it) => ({
        itemId: it.itemId,
        name: it.name,
        hsnSacCode: it.hsnSacCode,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent || 0,
        gstRate: it.gstRate,
      }));
    }
    return [
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
    ];
  });

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
      id: initialInvoice ? initialInvoice.id : `INV-${Date.now()}`,
      invoiceNumber: initialInvoice
        ? initialInvoice.invoiceNumber
        : `${company.invoicePrefix || 'INV-'}${Math.floor(1000 + Math.random() * 9000)}`,
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
      paymentStatus: initialInvoice ? initialInvoice.paymentStatus : 'PAID',
      paidAmount: initialInvoice
        ? Math.min(initialInvoice.paidAmount, calcSummary.grandTotal)
        : calcSummary.grandTotal,
      balanceAmount: initialInvoice
        ? Math.max(0, calcSummary.grandTotal - initialInvoice.paidAmount)
        : 0,
      createdAt: initialInvoice ? initialInvoice.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newInvoice);
  };

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-bold text-base shadow-sm">
              ₹
            </div>
            <div>
              <h2 className="font-headline-sm text-[16px] font-bold text-on-surface leading-tight">
                {initialInvoice ? `Edit & Update Invoice #${initialInvoice.invoiceNumber}` : 'Create Tax Invoice'}
              </h2>
              <span className="text-[12px] text-on-surface-variant">
                Vyapar High-Speed Table Grid Mode • Keyboard Optimized
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[12px] px-2.5 py-1 rounded-full font-semibold border ${
                calcSummary.isIntraState
                  ? 'bg-secondary/10 text-secondary border-secondary/20'
                  : 'bg-primary-container/10 text-primary-container border-primary-container/20'
              }`}
            >
              {calcSummary.isIntraState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          {/* Top Meta Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-outline-variant/20 bg-surface">
            {/* Party Selector Button */}
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Billed To (Customer / Party) *
              </label>
              <button
                type="button"
                onClick={() => setIsPartyModalOpen(true)}
                className="w-full text-left bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 flex items-center justify-between text-on-surface hover:border-secondary transition-colors shadow-sm"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-label-md text-[13px] font-bold truncate">
                    {selectedParty?.name || 'Select Customer'}
                  </div>
                  <div className="text-[11px] text-on-surface-variant truncate">
                    {selectedParty?.gstin ? `GSTIN: ${selectedParty.gstin}` : 'Retail / Unregistered'}
                  </div>
                </div>
                <span className="material-symbols-outlined text-secondary text-[20px] flex-shrink-0">
                  swap_horiz
                </span>
              </button>
            </div>

            {/* Place of Supply */}
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Place of Supply State *
              </label>
              <select
                value={posStateCode}
                onChange={(e) => setPosStateCode(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary shadow-sm outline-none"
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
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary shadow-sm outline-none"
              />
            </div>

            {/* Payment Mode */}
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary shadow-sm outline-none font-semibold text-secondary"
              >
                <option value="CASH">Cash Drawer</option>
                <option value="UPI">UPI / Dynamic QR</option>
                <option value="CARD">Card POS Terminal</option>
                <option value="NET_BANKING">Bank Transfer (NEFT/RTGS)</option>
                <option value="CREDIT">Credit (Accounts Receivable)</option>
              </select>
            </div>
          </div>

          {/* Dense Tabular Grid Area */}
          <div className="flex-1 overflow-auto p-4 bg-surface-container-lowest">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant font-label-sm text-[12px] border-b border-outline-variant/30">
                  <th className="py-2.5 px-3 text-center w-8">#</th>
                  <th className="py-2.5 px-3 min-w-[220px]">Item Description & Catalog</th>
                  <th className="py-2.5 px-2 w-24 text-center">HSN/SAC</th>
                  <th className="py-2.5 px-2 w-20 text-right">Qty</th>
                  <th className="py-2.5 px-2 w-20">Unit</th>
                  <th className="py-2.5 px-2 w-24 text-right">Rate (₹)</th>
                  <th className="py-2.5 px-2 w-20 text-right">Disc %</th>
                  <th className="py-2.5 px-2 w-24 text-center">GST Slab</th>
                  <th className="py-2.5 px-3 w-28 text-right">Taxable</th>
                  <th className="py-2.5 px-3 w-32 text-right">Total (₹)</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {rows.map((row, idx) => {
                  const itemCalc = calcSummary.items[idx];
                  return (
                    <tr key={idx} className="hover:bg-surface-container-low/60 transition-colors">
                      <td className="py-2 px-2 text-center text-outline text-xs">{idx + 1}</td>

                      <td className="py-2 px-3">
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            placeholder="Product or service name..."
                            value={row.name}
                            onChange={(e) => updateRow(idx, 'name', e.target.value)}
                            required
                            className="w-full bg-surface border border-outline-variant/40 rounded-lg px-2.5 py-1 text-sm text-on-surface focus:border-secondary outline-none font-medium"
                          />
                          <select
                            onChange={(e) => handleSelectItemFromCatalog(idx, e.target.value)}
                            className="bg-transparent text-[11px] text-secondary font-medium outline-none cursor-pointer"
                          >
                            <option value="">+ Quick pick from inventory...</option>
                            {itemsCatalog.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name} (₹{cat.salePrice})
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={row.hsnSacCode}
                          onChange={(e) => updateRow(idx, 'hsnSacCode', e.target.value)}
                          className="w-full bg-surface border border-outline-variant/40 rounded-lg px-1.5 py-1 text-sm text-center text-on-surface focus:border-secondary outline-none font-mono"
                        />
                      </td>

                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(idx, 'quantity', Number(e.target.value))}
                          className="w-full bg-surface border border-outline-variant/40 rounded-lg px-1.5 py-1 text-sm text-right text-on-surface focus:border-secondary outline-none font-semibold"
                        />
                      </td>

                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={row.unit}
                          onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                          className="w-full bg-surface border border-outline-variant/40 rounded-lg px-1.5 py-1 text-sm text-on-surface focus:border-secondary outline-none"
                        />
                      </td>

                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.unitPrice}
                          onChange={(e) => updateRow(idx, 'unitPrice', Number(e.target.value))}
                          className="w-full bg-surface border border-outline-variant/40 rounded-lg px-1.5 py-1 text-sm text-right text-on-surface focus:border-secondary outline-none font-semibold"
                        />
                      </td>

                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={row.discountPercent}
                          onChange={(e) => updateRow(idx, 'discountPercent', Number(e.target.value))}
                          className="w-full bg-surface border border-outline-variant/40 rounded-lg px-1.5 py-1 text-sm text-right text-on-surface focus:border-secondary outline-none"
                        />
                      </td>

                      <td className="py-2 px-2 text-center">
                        <select
                          value={row.gstRate}
                          onChange={(e) => updateRow(idx, 'gstRate', Number(e.target.value))}
                          className="w-full bg-surface border border-outline-variant/40 rounded-lg px-1 py-1 text-xs text-center text-on-surface focus:border-secondary outline-none"
                        >
                          <option value={0}>0% GST</option>
                          <option value={5}>5% GST</option>
                          <option value={12}>12% GST</option>
                          <option value={18}>18% GST</option>
                          <option value={28}>28% GST</option>
                        </select>
                      </td>

                      <td className="py-2 px-3 text-right font-tabular-data text-xs text-on-surface-variant font-medium">
                        {formatINR(itemCalc?.taxableAmount || 0)}
                      </td>

                      <td className="py-2 px-3 text-right font-tabular-data text-sm text-on-surface font-bold">
                        {formatINR(itemCalc?.totalAmount || 0)}
                      </td>

                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-outline hover:text-error transition-colors p-1"
                          title="Remove item"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface font-label-sm text-[12px] font-semibold hover:bg-surface-container-high transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px] text-secondary">add_circle</span>
                <span>+ Add Item Row</span>
              </button>

              <span className="text-[12px] text-on-surface-variant">
                Total Line Items: <strong className="text-on-surface">{rows.length}</strong>
              </span>
            </div>
          </div>

          {/* Bottom Summary & Actions Bar */}
          <div className="bg-surface-container-low border-t border-outline-variant/30 px-5 py-3.5 flex items-center justify-between flex-wrap gap-4">
            <div className="min-w-0 max-w-sm">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">
                Amount in Words
              </span>
              <span className="text-xs text-on-surface italic truncate block font-medium">
                {amountInWords(calcSummary.grandTotal)}
              </span>
            </div>

            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-on-surface-variant block text-[10px] uppercase">Taxable</span>
                  <span className="font-tabular-data font-bold text-on-surface text-sm">
                    {formatINR(calcSummary.totalTaxableAmount)}
                  </span>
                </div>

                {calcSummary.isIntraState ? (
                  <>
                    <div>
                      <span className="text-on-surface-variant block text-[10px] uppercase">CGST</span>
                      <span className="font-tabular-data font-semibold text-on-surface text-xs">
                        {formatINR(calcSummary.totalCgst)}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block text-[10px] uppercase">SGST</span>
                      <span className="font-tabular-data font-semibold text-on-surface text-xs">
                        {formatINR(calcSummary.totalSgst)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div>
                    <span className="text-on-surface-variant block text-[10px] uppercase">IGST</span>
                    <span className="font-tabular-data font-semibold text-on-surface text-xs">
                      {formatINR(calcSummary.totalIgst)}
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-on-surface-variant block text-[10px] uppercase">Round Off</span>
                  <span className="font-tabular-data text-on-surface text-xs">
                    {calcSummary.roundOff > 0 ? `+${calcSummary.roundOff}` : calcSummary.roundOff}
                  </span>
                </div>

                <div className="border-l border-outline-variant/40 pl-4">
                  <span className="text-on-surface-variant block text-[10px] uppercase tracking-wider font-semibold">
                    Grand Total
                  </span>
                  <span className="font-currency-display text-lg sm:text-xl font-extrabold text-secondary">
                    {formatINR(calcSummary.grandTotal)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-sm hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 bg-secondary text-on-secondary font-label-md text-sm font-bold px-5 py-2.5 rounded-xl shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  <span>{initialInvoice ? 'Save Updates' : 'Save & Print Invoice'}</span>
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
