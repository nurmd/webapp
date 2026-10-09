import React, { useState } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { Invoice, InvoiceItemEntry, InvoiceType, PaymentMode } from '../../models/invoice.ts';
import { calculateInvoice, InvoiceItemCalculationInput } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { GST_STATES, getStateList } from '../../core/gst/stateCodes.ts';
import { db } from '../../services/db.ts';
import { generateNextInvoiceNumber } from '../../core/utils/invoiceNumber.ts';

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

  // Line items state - clean start without dummy placeholders
  const [lines, setLines] = useState<Array<{
    itemId: string;
    name: string;
    hsnSacCode: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    gstRate: number;
  }>>([]);

  // Handle party change
  const handlePartySelect = (partyId: string) => {
    setSelectedPartyId(partyId);
    const p = parties.find((party) => party.id === partyId) || db.getParties().find((party) => party.id === partyId);
    if (p) {
      setCustomerName(p.name);
      setCustomerGstin(p.gstin || '');
      setCustomerAddress(p.billingAddress || '');
      setPosStateCode(p.stateCode);
      setInvoiceType(p.gstin && p.gstin.length === 15 ? 'B2B' : 'B2CS');
    }
  };

  const addLine = () => {
    setLines([
      ...lines,
      {
        itemId: 'CUSTOM-' + Date.now(),
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
    (updated[index] as any)[field] = value;
    setLines(updated);
  };

  const handleSelectItemFromCatalog = (index: number, itemId: string) => {
    const item = itemsCatalog.find((i) => i.id === itemId);
    if (item) {
      const updated = [...lines];
      updated[index] = {
        itemId: item.id,
        name: item.name,
        hsnSacCode: item.hsnSacCode,
        quantity: 1,
        unitPrice: item.salePrice,
        discountPercent: 0,
        gstRate: item.gstRate,
      };
      setLines(updated);
    }
  };

  // Perform live GST calculation
  const calcInputs: InvoiceItemCalculationInput[] = lines.map((l) => ({
    quantity: Number(l.quantity) || 1,
    unitPrice: Number(l.unitPrice) || 0,
    discountPercent: Number(l.discountPercent) || 0,
    gstRate: Number(l.gstRate) || 0,
  }));

  const calcSummary = calculateInvoice(company.stateCode, posStateCode, calcInputs);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const invoiceItems: InvoiceItemEntry[] = lines.map((l, idx) => {
      const calcItem = calcSummary.items[idx];
      return {
        itemId: l.itemId,
        name: l.name || 'Custom Item',
        hsnSacCode: l.hsnSacCode,
        unit: 'PCS',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        discountAmount: calcItem.discountAmount,
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
      id: 'INV-' + Date.now(),
      invoiceNumber: generateNextInvoiceNumber(company.invoicePrefix || 'INV-', db.getInvoices()),
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
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center font-bold text-base shadow-sm">
              <span className="material-symbols-outlined text-[20px]">post_add</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-[16px] font-bold text-on-surface leading-tight">
                Generate Standard Tax Invoice
              </h2>
              <div className="text-[12px] text-on-surface-variant">
                Regime: {isIntra ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 flex-1">
          {/* Party and Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Select Customer / Party
              </label>
              <select
                value={selectedPartyId}
                onChange={(e) => handlePartySelect(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none shadow-sm"
              >
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.gstin ? `(${p.gstin})` : '(Unregistered)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Place of Supply (State)
              </label>
              <select
                value={posStateCode}
                onChange={(e) => setPosStateCode(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none shadow-sm"
              >
                {getStateList().map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none shadow-sm font-semibold text-secondary"
              >
                <option value="CASH">Cash Drawer</option>
                <option value="UPI">UPI / QR Code</option>
                <option value="CARD">Debit / Credit Card</option>
                <option value="NET_BANKING">Bank Transfer (NEFT/RTGS)</option>
                <option value="CREDIT">Credit (Due Later)</option>
              </select>
            </div>
          </div>

          {/* Line Items Container */}
          <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/30">
            <div className="flex justify-between items-center mb-3">
              <span className="font-label-md text-sm font-bold text-on-surface">
                Itemized Tax Lines ({lines.length})
              </span>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-label-sm text-[12px] font-semibold px-2.5 py-1 rounded-lg hover:bg-surface-container transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px] text-secondary">add</span>
                <span>Add Line</span>
              </button>
            </div>

            {lines.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-surface-container-low/40 border border-outline-variant/30 flex flex-col items-center gap-2">
                <span className="text-xs text-on-surface-variant font-medium">No line items added to this bill yet.</span>
                <button
                  type="button"
                  onClick={addLine}
                  className="px-3.5 py-1.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-xs cursor-pointer active:scale-95"
                >
                  + Add Line Item
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {lines.map((l, idx) => {
                const itemCalc = calcSummary.items[idx];
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center bg-surface-container-lowest p-2 rounded-xl border border-outline-variant/20 shadow-sm"
                  >
                    <div className="col-span-12 sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Item name / description"
                        value={l.name}
                        onChange={(e) => updateLine(idx, 'name', e.target.value)}
                        required
                        className="w-full bg-surface border border-outline-variant/40 text-on-surface px-2.5 py-1.5 text-xs rounded-lg outline-none font-medium"
                      />
                      <select
                        onChange={(e) => handleSelectItemFromCatalog(idx, e.target.value)}
                        className="bg-transparent text-[11px] text-secondary font-medium outline-none mt-0.5 cursor-pointer"
                      >
                        <option value="">Quick pick from catalog...</option>
                        {itemsCatalog.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name} (₹{cat.salePrice})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="text"
                        placeholder="HSN"
                        value={l.hsnSacCode}
                        onChange={(e) => updateLine(idx, 'hsnSacCode', e.target.value)}
                        className="w-full bg-surface border border-outline-variant/40 text-on-surface px-2 py-1.5 text-xs rounded-lg text-center outline-none font-mono"
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-1">
                      <input
                        type="number"
                        placeholder="Qty"
                        min="1"
                        value={l.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                        className="w-full bg-surface border border-outline-variant/40 text-on-surface px-2 py-1.5 text-xs rounded-lg text-right outline-none font-semibold"
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        placeholder="Rate ₹"
                        min="0"
                        value={l.unitPrice}
                        onChange={(e) => updateLine(idx, 'unitPrice', Number(e.target.value))}
                        className="w-full bg-surface border border-outline-variant/40 text-on-surface px-2 py-1.5 text-xs rounded-lg text-right outline-none font-semibold"
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-1">
                      <select
                        value={l.gstRate}
                        onChange={(e) => updateLine(idx, 'gstRate', Number(e.target.value))}
                        className="w-full bg-surface border border-outline-variant/40 text-on-surface px-1 py-1.5 text-xs rounded-lg text-center outline-none"
                      >
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                      </select>
                    </div>

                    <div className="col-span-5 sm:col-span-1 font-tabular-data text-xs font-bold text-on-surface text-right">
                      {formatINR(itemCalc?.totalAmount || 0)}
                    </div>

                    <div className="col-span-2 sm:col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-outline hover:text-error transition-colors p-1"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>

          {/* Tax Breakdown Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
            <div className="flex flex-col gap-1 text-xs text-on-surface-variant">
              <div>
                <strong className="text-on-surface">Amount in Words:</strong>
                <div className="italic text-on-surface mt-0.5 font-medium">
                  {amountInWords(calcSummary.grandTotal)}
                </div>
              </div>
              <div className="mt-2 text-[11px]">
                ● Supplier GSTIN: <strong className="text-secondary">{company.gstin} ({company.stateCode})</strong>
              </div>
              <div className="text-[11px]">
                ● Recipient State: <strong className="text-on-surface">{posStateCode} ({GST_STATES[posStateCode]?.name})</strong>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between text-on-surface-variant">
                <span>Taxable Value:</span>
                <span className="font-tabular-data font-semibold text-on-surface">{formatINR(calcSummary.totalTaxableAmount)}</span>
              </div>

              {calcSummary.isIntraState ? (
                <>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>CGST:</span>
                    <span className="font-tabular-data font-semibold text-on-surface">{formatINR(calcSummary.totalCgst)}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>SGST:</span>
                    <span className="font-tabular-data font-semibold text-on-surface">{formatINR(calcSummary.totalSgst)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-on-surface-variant">
                  <span>IGST (Inter-State):</span>
                  <span className="font-tabular-data font-semibold text-on-surface">{formatINR(calcSummary.totalIgst)}</span>
                </div>
              )}

              <div className="flex justify-between text-on-surface-variant">
                <span>Round Off:</span>
                <span className="font-tabular-data text-on-surface">{calcSummary.roundOff > 0 ? `+${calcSummary.roundOff}` : calcSummary.roundOff}</span>
              </div>

              <div className="flex justify-between font-bold text-base border-t border-outline-variant/30 pt-2 mt-1 text-on-surface">
                <span>Total Invoice Value:</span>
                <span className="font-currency-display text-secondary">{formatINR(calcSummary.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-sm hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 bg-secondary text-on-secondary font-label-md text-sm font-bold px-5 py-2.5 rounded-xl shadow-md hover:bg-secondary/90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span>Save & Generate Invoice</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
