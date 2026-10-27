import React, { useState } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem, ItemPriceMode } from '../../models/item.ts';
import { Invoice, InvoiceItemEntry, InvoiceType, PaymentMode } from '../../models/invoice.ts';
import { calculateInvoice, InvoiceItemCalculationInput } from '../../core/gst/calculator.ts';
import { exclusiveFromInclusive, inclusiveFromExclusive } from '../../core/gst/pricing.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR, roundQuantity, sanitizeQuantityInput } from '../../core/utils/formatters.ts';
import { GST_STATES, getStateList } from '../../core/gst/stateCodes.ts';
import { db } from '../../services/db.ts';
import { generateNextInvoiceNumber, generateNextDocumentNumber } from '../../core/utils/invoiceNumber.ts';
import { DocumentSeriesType } from '../../models/company.ts';
import { draftService } from '../../services/draftService.ts';

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
  const initialDraft = React.useMemo(() => draftService.getInvoiceDraft(), []);

  const [selectedPartyId, setSelectedPartyId] = useState<string>(
    initialDraft?.selectedParty?.id || parties[0]?.id || ''
  );
  const [customerName, setCustomerName] = useState<string>(
    initialDraft?.selectedParty?.name || parties[0]?.name || ''
  );
  const [customerGstin, setCustomerGstin] = useState<string>(
    initialDraft?.selectedParty?.gstin || parties[0]?.gstin || ''
  );
  const [customerAddress, setCustomerAddress] = useState<string>(
    initialDraft?.selectedParty?.billingAddress || parties[0]?.billingAddress || ''
  );
  const [posStateCode, setPosStateCode] = useState<string>(
    initialDraft?.posStateCode || initialDraft?.selectedParty?.stateCode || parties[0]?.stateCode || company.stateCode
  );
  const isGstActive = company.isGstEnabled !== false;

  const [invoiceType, setInvoiceType] = useState<InvoiceType>(company.isCompositionScheme ? 'B2CS' : 'B2B');
  const [invoiceDate, setInvoiceDate] = useState<string>(initialDraft?.invoiceDate || new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');

  // Line items state - clean start without dummy placeholders
  const [lines, setLines] = useState<Array<{
    itemId: string;
    name: string;
    hsnSacCode: string;
    quantity: number;
    unitPrice: number;
    unitPriceInclusive: number;
    priceMode: ItemPriceMode;
    cessRate: number;
    discountPercent: number;
    gstRate: number;
  }>>(() => {
    if (initialDraft?.rows && initialDraft.rows.length > 0) {
      return initialDraft.rows.map((r: any) => {
        const up = Number(r.unitPrice) || 0;
        const gr = Number(r.gstRate) || (company.isCompositionScheme ? 0 : 18);
        const mode: ItemPriceMode = (!isGstActive || company.isCompositionScheme)
          ? 'EXCLUSIVE'
          : (r.priceMode || 'EXCLUSIVE');
        const cess = (!isGstActive || company.isCompositionScheme) ? 0 : (Number(r.cessRate) || 0);

        let finalExcl = up;
        let finalIncl = Number(r.unitPriceInclusive) || 0;

        if (!isGstActive || company.isCompositionScheme) {
          finalExcl = up;
          finalIncl = up;
        } else if (mode === 'INCLUSIVE') {
          if (finalIncl <= 0 && up > 0) {
            finalIncl = inclusiveFromExclusive(up, gr);
          }
          finalExcl = exclusiveFromInclusive(finalIncl, gr);
        } else {
          finalExcl = up;
          finalIncl = inclusiveFromExclusive(up, gr);
        }

        return {
          itemId: r.itemId || 'CUSTOM-' + Date.now(),
          name: r.name,
          hsnSacCode: isGstActive ? (r.hsnSacCode || '998313') : '',
          quantity: Number(r.quantity) || 1,
          unitPrice: finalExcl,
          unitPriceInclusive: finalIncl,
          priceMode: mode,
          cessRate: cess,
          discountPercent: Number(r.discountPercent) || 0,
          gstRate: (!isGstActive || company.isCompositionScheme) ? 0 : gr,
        };
      });
    }
    return [];
  });

  // Handle party change
  const handlePartySelect = (partyId: string) => {
    setSelectedPartyId(partyId);
    const p = parties.find((party) => party.id === partyId) || db.getParties().find((party) => party.id === partyId);
    if (p) {
      setCustomerName(p.name);
      setCustomerGstin(p.gstin || '');
      setCustomerAddress(p.billingAddress || '');
      setPosStateCode(p.stateCode);
      setInvoiceType(company.isCompositionScheme ? 'B2CS' : (p.gstin && p.gstin.length === 15 ? 'B2B' : 'B2CS'));
    }
  };

  const addLine = () => {
    setLines([
      ...lines,
      {
        itemId: 'CUSTOM-' + Date.now(),
        name: '',
        hsnSacCode: isGstActive ? '998313' : '',
        quantity: 1,
        unitPrice: 0,
        unitPriceInclusive: 0,
        priceMode: 'EXCLUSIVE',
        cessRate: 0,
        discountPercent: 0,
        gstRate: (!isGstActive || company.isCompositionScheme) ? 0 : 18,
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const updateLinePrice = (index: number, field: 'exclusive' | 'inclusive', raw: number | string) => {
    const value = Math.max(0, Number(raw) || 0);
    setLines((prev) => {
      const updated = [...prev];
      const row = { ...updated[index] };
      const gst = (!isGstActive || company.isCompositionScheme) ? 0 : (Number(row.gstRate) || 0);
      if (!isGstActive || company.isCompositionScheme) {
        row.unitPrice = value;
        row.unitPriceInclusive = value;
        row.priceMode = 'EXCLUSIVE';
      } else if (field === 'exclusive') {
        row.unitPrice = value;
        row.priceMode = 'EXCLUSIVE';
        row.unitPriceInclusive = inclusiveFromExclusive(value, gst);
      } else {
        row.unitPriceInclusive = value;
        row.priceMode = 'INCLUSIVE';
        row.unitPrice = exclusiveFromInclusive(value, gst);
      }
      updated[index] = row;
      return updated;
    });
  };

  const updateLineGst = (index: number, nextGst: number) => {
    const gst = company.isCompositionScheme ? 0 : (Number(nextGst) || 0);
    setLines((prev) => {
      const updated = [...prev];
      const row = { ...updated[index] };
      row.gstRate = gst;
      if (row.priceMode === 'INCLUSIVE') {
        row.unitPrice = exclusiveFromInclusive(row.unitPriceInclusive, gst);
      } else {
        row.unitPriceInclusive = inclusiveFromExclusive(row.unitPrice, gst);
      }
      updated[index] = row;
      return updated;
    });
  };

  const updateLine = (index: number, field: string, value: any) => {
    if (field === 'unitPrice') {
      updateLinePrice(index, 'exclusive', value);
      return;
    }
    if (field === 'gstRate') {
      updateLineGst(index, Number(value));
      return;
    }
    const updated = [...lines];
    if (field === 'quantity') {
      const parsed = parseFloat(String(value));
      (updated[index] as any).quantity = isNaN(parsed) ? value : roundQuantity(parsed, 4);
    } else if (company.isCompositionScheme && field === 'gstRate') {
      (updated[index] as any).gstRate = 0;
    } else {
      (updated[index] as any)[field] = value;
    }
    setLines(updated);
  };

  const handleSelectItemFromCatalog = (index: number, itemId: string) => {
    const item = itemsCatalog.find((i) => i.id === itemId);
    if (item) {
      const updated = [...lines];
      const itemGst = company.isCompositionScheme ? 0 : item.gstRate;
      if (!isGstActive || company.isCompositionScheme) {
        updated[index] = {
          itemId: item.id,
          name: item.name,
          hsnSacCode: isGstActive ? item.hsnSacCode : '',
          quantity: 1,
          unitPrice: item.salePrice,
          unitPriceInclusive: item.salePrice,
          priceMode: 'EXCLUSIVE',
          cessRate: 0,
          discountPercent: 0,
          gstRate: 0,
        };
      } else {
        const mode: ItemPriceMode = item.salePriceMode ?? 'EXCLUSIVE';
        let excl = item.salePrice;
        let incl = item.salePriceInclusive ?? 0;
        if (mode === 'INCLUSIVE' && incl > 0) {
          excl = exclusiveFromInclusive(incl, itemGst);
        } else {
          incl = inclusiveFromExclusive(excl, itemGst);
        }
        updated[index] = {
          itemId: item.id,
          name: item.name,
          hsnSacCode: item.hsnSacCode,
          quantity: 1,
          unitPrice: excl,
          unitPriceInclusive: incl,
          priceMode: mode,
          cessRate: item.cessRate ?? 0,
          discountPercent: 0,
          gstRate: itemGst,
        };
      }
      setLines(updated);
    }
  };

  // Perform live GST calculation
  const calcInputs: InvoiceItemCalculationInput[] = lines.map((l) => ({
    quantity: Number(l.quantity) || 1,
    unitPrice: Number(l.unitPrice) || 0,
    unitPriceInclusive: Number(l.unitPriceInclusive) || 0,
    priceMode: l.priceMode ?? 'EXCLUSIVE',
    cessPercent: (!isGstActive || company.isCompositionScheme) ? 0 : (Number(l.cessRate) || 0),
    discountPercent: Number(l.discountPercent) || 0,
    gstRate: (!isGstActive || company.isCompositionScheme) ? 0 : (Number(l.gstRate) || 0),
  }));

  const calcSummary = calculateInvoice(company.stateCode, posStateCode, calcInputs);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const invoiceItems: InvoiceItemEntry[] = lines.map((l, idx) => {
      const calcItem = calcSummary.items[idx];
      const excl = Number(l.unitPrice) || 0;
      const gst = (!isGstActive || company.isCompositionScheme) ? 0 : (Number(l.gstRate) || 0);
      const rawIncl = Number(l.unitPriceInclusive) || 0;
      const mode = (!isGstActive || company.isCompositionScheme) ? 'EXCLUSIVE' : (l.priceMode ?? 'EXCLUSIVE');
      const incl = (!isGstActive || company.isCompositionScheme)
        ? excl
        : mode === 'EXCLUSIVE'
        ? inclusiveFromExclusive(excl, gst)
        : (rawIncl > 0 ? rawIncl : inclusiveFromExclusive(excl, gst));
      return {
        itemId: l.itemId,
        name: l.name || 'Custom Item',
        hsnSacCode: isGstActive ? l.hsnSacCode : '',
        unit: 'PCS',
        quantity: l.quantity,
        unitPrice: excl,
        unitPriceInclusive: incl,
        priceMode: mode,
        cessRate: (!isGstActive || company.isCompositionScheme) ? 0 : (Number(l.cessRate) || 0),
        discountPercent: l.discountPercent,
        discountAmount: calcItem?.discountAmount || 0,
        taxableAmount: calcItem?.taxableAmount || 0,
        gstRate: gst,
        cgstAmount: (!isGstActive || company.isCompositionScheme) ? 0 : (calcItem?.cgstAmount || 0),
        sgstAmount: (!isGstActive || company.isCompositionScheme) ? 0 : (calcItem?.sgstAmount || 0),
        utgstAmount: (!isGstActive || company.isCompositionScheme) ? 0 : (calcItem?.utgstAmount || 0),
        igstAmount: (!isGstActive || company.isCompositionScheme) ? 0 : (calcItem?.igstAmount || 0),
        cessAmount: (!isGstActive || company.isCompositionScheme) ? 0 : (calcItem?.cessAmount || 0),
        totalAmount: (!isGstActive || company.isCompositionScheme) ? (calcItem?.taxableAmount || 0) : (calcItem?.totalAmount || 0),
      };
    });

    const docType: DocumentSeriesType =
      invoiceType === 'ESTIMATE'
        ? 'ESTIMATE'
        : invoiceType === 'DELIVERY_CHALLAN'
        ? 'DELIVERY_CHALLAN'
        : invoiceType === 'CREDIT_NOTE'
        ? 'CREDIT_NOTE'
        : invoiceType === 'DEBIT_NOTE'
        ? 'DEBIT_NOTE'
        : 'SALES_INVOICE';

    const selectedParty = parties.find(
      (p) => p.id === selectedPartyId || (customerName && p.name.trim().toLowerCase() === customerName.trim().toLowerCase())
    );

    const newInvoice: Invoice = {
      id: 'INV-' + Date.now(),
      invoiceNumber: generateNextDocumentNumber(docType, company, db.getInvoices()),
      invoiceType: company.isCompositionScheme ? 'B2CS' : invoiceType,
      date: invoiceDate,
      partyId: selectedPartyId,
      partyName: customerName,
      partyPhone: selectedParty?.phone || undefined,
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
      totalUtgst: calcSummary.totalUtgst,
      isUtgst: calcSummary.isUtgst,
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

    draftService.clearInvoiceDraft();
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
                {company.isCompositionScheme ? 'Generate Bill of Supply (Composition Scheme)' : 'Generate Standard Tax Invoice'}
              </h2>
              <div className="text-[12px] text-on-surface-variant">
                {company.isCompositionScheme
                  ? 'Composition Scheme (Section 10 CGST Act) • Tax cannot be collected from recipients'
                  : `Regime: ${isIntra ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}`}
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

            {company.isCompositionScheme && (
              <div className="mb-2.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[17px] text-amber-600 dark:text-amber-400 shrink-0">
                  info
                </span>
                <span>
                  Composition Scheme Dealer: As per Section 10 of CGST Act, you cannot charge GST to your customers on a Bill of Supply.
                </span>
              </div>
            )}

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
                    <div className={isGstActive ? "col-span-12 sm:col-span-4" : "col-span-12 sm:col-span-6"}>
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
                        {itemsCatalog.map((cat) => {
                          if (!isGstActive || company.isCompositionScheme) {
                            return (
                              <option key={cat.id} value={cat.id}>
                                {cat.name} (₹{cat.salePrice})
                              </option>
                            );
                          }
                          const catGst = cat.gstRate || 0;
                          const catMode = cat.salePriceMode ?? 'EXCLUSIVE';
                          let excl = cat.salePrice;
                          let incl = cat.salePriceInclusive ?? 0;
                          if (catMode === 'INCLUSIVE' && incl > 0) {
                            excl = exclusiveFromInclusive(incl, catGst);
                          } else {
                            incl = inclusiveFromExclusive(excl, catGst);
                          }
                          return (
                            <option key={cat.id} value={cat.id}>
                              {cat.name} (₹{excl} / ₹{incl})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {isGstActive && (
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          type="text"
                          placeholder="HSN"
                          value={l.hsnSacCode}
                          onChange={(e) => updateLine(idx, 'hsnSacCode', e.target.value)}
                          className="w-full bg-surface border border-outline-variant/40 text-on-surface px-2 py-1.5 text-xs rounded-lg text-center outline-none font-mono"
                        />
                      </div>
                    )}

                    <div className="col-span-4 sm:col-span-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Qty"
                        value={l.quantity}
                        onChange={(e) => {
                          const sanitized = sanitizeQuantityInput(e.target.value, 4);
                          updateLine(idx, 'quantity', sanitized);
                        }}
                        className="w-full bg-surface border border-outline-variant/40 text-on-surface px-2 py-1.5 text-xs rounded-lg text-right outline-none font-semibold font-tabular-data"
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-2 flex flex-col gap-1">
                      <input
                        type="number"
                        placeholder="Rate ₹"
                        min="0"
                        step="0.01"
                        value={l.unitPrice || ''}
                        onChange={(e) => updateLinePrice(idx, 'exclusive', e.target.value)}
                        className="w-full bg-surface border border-outline-variant/40 text-on-surface px-2 py-1.5 text-xs rounded-lg text-right outline-none font-semibold"
                      />
                      {isGstActive && !company.isCompositionScheme && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            aria-label="Line Rate (Incl. GST)"
                            placeholder="Incl ₹"
                            min="0"
                            step="0.01"
                            value={l.unitPriceInclusive || ''}
                            onChange={(e) => updateLinePrice(idx, 'inclusive', e.target.value)}
                            className="w-full bg-surface border border-outline-variant/40 text-on-surface px-2 py-1 text-xs rounded-lg text-right outline-none font-semibold"
                          />
                          <span className="text-[10px] font-bold text-secondary shrink-0" title={`Active mode: ${l.priceMode}`}>
                            {l.priceMode === 'INCLUSIVE' ? 'Incl.' : 'Excl.'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="col-span-5 sm:col-span-1 flex flex-col gap-1">
                      {(!isGstActive || company.isCompositionScheme) ? (
                        <div
                          className="w-full bg-surface-container border border-outline-variant/30 text-on-surface-variant px-1 py-1.5 text-xs rounded-lg text-center font-bold"
                          title={!isGstActive ? "GST is disabled" : "Tax rate locked to 0% for Composition Scheme"}
                        >
                          0%
                        </div>
                      ) : (
                        <>
                          <select
                            value={l.gstRate}
                            onChange={(e) => updateLineGst(idx, Number(e.target.value))}
                            className="w-full bg-surface border border-outline-variant/40 text-on-surface px-1 py-1.5 text-xs rounded-lg text-center outline-none"
                          >
                            <option value={0}>0%</option>
                            <option value={0.1}>0.1%</option>
                            <option value={0.25}>0.25%</option>
                            <option value={3}>3%</option>
                            <option value={5}>5%</option>
                            <option value={12}>12%</option>
                            <option value={18}>18%</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label="Line CESS Rate (%)"
                            placeholder="CESS %"
                            value={l.cessRate === 0 ? '' : l.cessRate}
                            onChange={(e) => updateLine(idx, 'cessRate', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                            className="w-full bg-surface border border-outline-variant/40 text-on-surface px-1 py-1 text-xs rounded-lg text-center outline-none"
                          />
                        </>
                      )}
                    </div>

                    <div className="col-span-5 sm:col-span-1 font-tabular-data text-xs font-bold text-on-surface text-right">
                      {formatINR(itemCalc?.totalAmount || 0)}
                    </div>

                    <div className="col-span-2 sm:col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        aria-label="Remove item"
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
                <span>{company.isCompositionScheme ? 'Subtotal (Supply Value):' : 'Taxable Value:'}</span>
                <span className="font-tabular-data font-semibold text-on-surface">{formatINR(calcSummary.totalTaxableAmount)}</span>
              </div>

              {!company.isCompositionScheme ? (
                calcSummary.isIntraState ? (
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
                )
              ) : (
                <div className="flex justify-between text-on-surface-variant">
                  <span>GST (Composition 0%):</span>
                  <span className="font-tabular-data font-semibold text-on-surface">₹0.00</span>
                </div>
              )}

              {!company.isCompositionScheme && calcSummary.totalCess > 0 && (
                <div className="flex justify-between text-on-surface-variant">
                  <span>CESS:</span>
                  <span className="font-tabular-data font-semibold text-on-surface">{formatINR(calcSummary.totalCess)}</span>
                </div>
              )}

              <div className="flex justify-between text-on-surface-variant">
                <span>Round Off:</span>
                <span className="font-tabular-data text-on-surface">{calcSummary.roundOff > 0 ? `+${calcSummary.roundOff}` : calcSummary.roundOff}</span>
              </div>

              <div className="flex justify-between font-bold text-base border-t border-outline-variant/30 pt-2 mt-1 text-on-surface">
                <span>Total Value:</span>
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
              <span>{company.isCompositionScheme ? 'Save & Issue Bill of Supply' : 'Save & Generate Invoice'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
