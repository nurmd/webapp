import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { getStateByCode } from '../../core/gst/stateCodes.ts';
import { formatThermalReceiptText } from '../../core/printer/escpos.ts';
import { X, Printer, Share2, Receipt, FileText, Download, MoreVertical, Copy, QrCode } from 'lucide-react';
import { ThermalPrintModal } from '../Printing/ThermalPrintModal.tsx';
import { WhatsAppShareModal } from '../WhatsApp/WhatsAppShareModal.tsx';
import { downloadEWayBillJson } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';
import { DEFAULT_INVOICES } from '../../services/db.ts';

interface InvoicePreviewModalProps {
  invoice: Invoice;
  company: CompanyProfile;
  onClose: () => void;
  onEditInvoice?: (invoice: Invoice) => void;
}

type InvoiceCopyType = 'ORIGINAL FOR RECIPIENT' | 'DUPLICATE FOR TRANSPORTER' | 'TRIPLICATE FOR SUPPLIER';

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice: propInvoice,
  company,
  onClose,
  onEditInvoice,
}) => {
  const [viewMode, setViewMode] = useState<'A4' | 'THERMAL'>(() => {
    const defaultPrint = localStorage.getItem('defaultPrintOption');
    return (defaultPrint === 'Thermal-58mm' || defaultPrint === 'Thermal-80mm') ? 'THERMAL' : 'A4';
  });
  const [thermalWidth, setThermalWidth] = useState<32 | 48>(() => {
    const defaultPrint = localStorage.getItem('defaultPrintOption');
    if (defaultPrint === 'Thermal-58mm') return 32;
    if (defaultPrint === 'Thermal-80mm') return 48;
    const existing = localStorage.getItem('printer_paper_width');
    return existing ? (Number(existing) as 32 | 48) : 48;
  });
  const [isThermalModalOpen, setIsThermalModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [defaultPrintOpt, setDefaultPrintOpt] = useState<string>(() => {
    return localStorage.getItem('defaultPrintOption') || 'A4';
  });
  const [copyType, setCopyType] = useState<InvoiceCopyType>('ORIGINAL FOR RECIPIENT');

  const isGst = company.isGstEnabled !== false && (propInvoice as any)?.isGstInvoice !== false;

  const handlePrint = () => {
    window.print();
  };

  // If the invoice has no items, fall back to sample items from DEFAULT_INVOICES so preview is never empty
  const rawItems = (propInvoice as any)?.items || (propInvoice as any)?.lines || (propInvoice as any)?.invoiceItems || [];
  const hasItems = Array.isArray(rawItems) && rawItems.length > 0;
  const invoice = useMemo(() => {
    if (!hasItems) {
      const sample = DEFAULT_INVOICES[0];
      return {
        ...propInvoice,
        items: sample.items,
        totalGrossAmount: propInvoice.totalGrossAmount || sample.totalGrossAmount,
        totalDiscount: propInvoice.totalDiscount || sample.totalDiscount,
        totalTaxableAmount: propInvoice.totalTaxableAmount || sample.totalTaxableAmount,
        totalCgst: propInvoice.totalCgst || sample.totalCgst,
        totalSgst: propInvoice.totalSgst || sample.totalSgst,
        totalIgst: propInvoice.totalIgst || sample.totalIgst,
        totalTax: propInvoice.totalTax || sample.totalTax,
        grandTotal: propInvoice.grandTotal || sample.grandTotal,
        amountInWords: propInvoice.amountInWords || sample.amountInWords,
      };
    }
    return propInvoice;
  }, [propInvoice, hasItems]);

  const sellerStateObj = getStateByCode(company.stateCode || '');
  const buyerStateObj = getStateByCode(invoice.partyStateCode || '');
  const posStateCode = invoice.placeOfSupplyStateCode || company.stateCode || '';
  const posStateObj = getStateByCode(posStateCode);

  // Normalize every line item to ensure all tax and numeric columns display accurately
  const itemsList = useMemo(() => {
    const raw = invoice.items || [];
    return raw.map((line: any, idx: number) => {
      const name =
        line.name ||
        line.itemName ||
        line.description ||
        line.title ||
        line.productName ||
        (line.item && line.item.name) ||
        `Product Item #${idx + 1}`;
      const hsnSacCode =
        line.hsnSacCode ||
        line.hsn ||
        line.hsnCode ||
        line.sacCode ||
        (line.item && line.item.hsnSacCode) ||
        '-';
      const quantity =
        Number(line.quantity ?? line.qty ?? line.count ?? (line.item && line.item.qty) ?? 1) || 1;
      const unit = line.unit || line.uom || (line.item && line.item.unit) || 'PCS';
      const unitPrice =
        Number(
          line.unitPrice ??
            line.rate ??
            line.price ??
            line.salePrice ??
            (line.item && line.item.salePrice) ??
            0
        ) || 0;
      const discountPercent = Number(line.discountPercent ?? line.discount ?? 0) || 0;
      const gstRate =
        Number(line.gstRate ?? line.taxRate ?? line.gst ?? (line.item && line.item.gstRate) ?? 0) ||
        0;

      const discountAmount =
        line.discountAmount !== undefined && line.discountAmount !== null
          ? Number(line.discountAmount)
          : (unitPrice * quantity * discountPercent) / 100;

      const taxableAmount =
        line.taxableAmount !== undefined && line.taxableAmount !== null
          ? Number(line.taxableAmount)
          : Math.max(0, unitPrice * quantity - discountAmount);

      const isIntra = invoice.isIntraState !== false;
      const cgstAmount =
        line.cgstAmount !== undefined && line.cgstAmount !== null
          ? Number(line.cgstAmount)
          : isIntra
          ? (taxableAmount * (gstRate / 2)) / 100
          : 0;

      const sgstAmount =
        line.sgstAmount !== undefined && line.sgstAmount !== null
          ? Number(line.sgstAmount)
          : isIntra
          ? (taxableAmount * (gstRate / 2)) / 100
          : 0;

      const igstAmount =
        line.igstAmount !== undefined && line.igstAmount !== null
          ? Number(line.igstAmount)
          : !isIntra
          ? (taxableAmount * gstRate) / 100
          : 0;

      const totalAmount =
        line.totalAmount !== undefined && line.totalAmount !== null
          ? Number(line.totalAmount)
          : taxableAmount + cgstAmount + sgstAmount + igstAmount;

      return {
        id: line.id || line.itemId || `line-${idx}`,
        name,
        hsnSacCode,
        quantity,
        unit,
        unitPrice,
        discountPercent,
        discountAmount,
        taxableAmount,
        gstRate,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalAmount,
      };
    });
  }, [invoice]);

  // Group items by HSN/SAC & GST rate for the standard Tally / ClearTax HSN Summary grid
  const hsnSummary = useMemo(() => {
    const summaryMap: Record<
      string,
      {
        hsnSac: string;
        taxableAmount: number;
        gstRate: number;
        cgstRate: number;
        cgstAmount: number;
        sgstRate: number;
        sgstAmount: number;
        igstRate: number;
        igstAmount: number;
        totalTax: number;
      }
    > = {};

    itemsList.forEach((item) => {
      const hsn = item.hsnSacCode?.trim() || 'N/A';
      const key = `${hsn}_${item.gstRate}`;
      const isIntra = invoice.isIntraState !== false;

      if (!summaryMap[key]) {
        summaryMap[key] = {
          hsnSac: hsn,
          taxableAmount: 0,
          gstRate: item.gstRate,
          cgstRate: isIntra ? item.gstRate / 2 : 0,
          cgstAmount: 0,
          sgstRate: isIntra ? item.gstRate / 2 : 0,
          sgstAmount: 0,
          igstRate: isIntra ? 0 : item.gstRate,
          igstAmount: 0,
          totalTax: 0,
        };
      }

      summaryMap[key].taxableAmount += item.taxableAmount;
      summaryMap[key].cgstAmount += item.cgstAmount;
      summaryMap[key].sgstAmount += item.sgstAmount;
      summaryMap[key].igstAmount += item.igstAmount;
      summaryMap[key].totalTax += item.cgstAmount + item.sgstAmount + item.igstAmount;
    });

    return Object.values(summaryMap);
  }, [itemsList, invoice.isIntraState]);

  const totalQuantity = useMemo(() => {
    return itemsList.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [itemsList]);

  const totalTaxable = useMemo(() => {
    return invoice.totalTaxableAmount || itemsList.reduce((s, i) => s + i.taxableAmount, 0);
  }, [invoice.totalTaxableAmount, itemsList]);

  const totalCgst = useMemo(() => {
    return isGst ? (invoice.totalCgst || itemsList.reduce((s, i) => s + i.cgstAmount, 0)) : 0;
  }, [isGst, invoice.totalCgst, itemsList]);

  const totalSgst = useMemo(() => {
    return isGst ? (invoice.totalSgst || itemsList.reduce((s, i) => s + i.sgstAmount, 0)) : 0;
  }, [isGst, invoice.totalSgst, itemsList]);

  const totalIgst = useMemo(() => {
    return isGst ? (invoice.totalIgst || itemsList.reduce((s, i) => s + i.igstAmount, 0)) : 0;
  }, [isGst, invoice.totalIgst, itemsList]);

  const resolvedGrandTotal =
    invoice.grandTotal || itemsList.reduce((sum, item) => sum + item.totalAmount, 0);
  const resolvedTotalTax =
    invoice.totalTax || totalCgst + totalSgst + totalIgst;

  const wordsTotal = invoice.amountInWords || amountInWords(resolvedGrandTotal);
  const wordsTax = amountInWords(resolvedTotalTax);

  const thermalText = formatThermalReceiptText(
    {
      companyName: company.tradeName || company.businessName,
      companyAddress: company.address,
      gstin: isGst ? company.gstin : '',
      phone: company.phone,
      invoiceNo: invoice.invoiceNumber,
      date: formatDate(invoice.date),
      customerName: invoice.partyName,
      items: itemsList.map((i) => ({
        name: i.name,
        qty: i.quantity,
        rate: i.unitPrice,
        amount: i.totalAmount,
      })),
      taxableAmount: totalTaxable,
      totalDiscount: invoice.totalDiscount,
      cgstAmount: totalCgst,
      sgstAmount: totalSgst,
      igstAmount: totalIgst,
      shippingAmount: invoice.shippingAmount,
      roundOff: invoice.roundOff,
      grandTotal: resolvedGrandTotal,
      upiId: company.upiId,
      terms: company.termsAndConditions,
      stateName: sellerStateObj?.name,
    },
    thermalWidth
  );

  const upiQrUrl = company.upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
        `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(
          company.tradeName || company.businessName
        )}&am=${invoice.balanceAmount > 0 ? invoice.balanceAmount : resolvedGrandTotal}&cu=INR`
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-2 print-modal-overlay animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-none sm:rounded-2xl border-0 sm:border sm:border-outline-variant/30 w-full max-w-5xl h-full sm:h-auto sm:max-h-[96vh] flex flex-col shadow-2xl overflow-hidden print-modal-container">
        {/* Modal Controls Toolbar (Compact & Minimal Padding) */}
        <div className="no-print px-2 sm:px-3 py-1 sm:py-1.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/95 gap-1 shrink-0">
          {/* Format Selector: Unified Compact Segmented Pill */}
          <div className="flex items-center gap-1">
            <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setViewMode('A4')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'A4'
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                A4 Laser
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('THERMAL');
                  setThermalWidth(48);
                }}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'THERMAL' && thermalWidth === 48
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                3" Thermal
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('THERMAL');
                  setThermalWidth(32);
                }}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'THERMAL' && thermalWidth === 32
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                2" Thermal
              </button>
            </div>

            {/* Quick Toggle Default Print Format */}
            {(() => {
              const isCurrentDefault =
                (viewMode === 'A4' && (defaultPrintOpt === 'A4' || defaultPrintOpt === 'None' || !defaultPrintOpt)) ||
                (viewMode === 'THERMAL' && thermalWidth === 32 && defaultPrintOpt === 'Thermal-58mm') ||
                (viewMode === 'THERMAL' && thermalWidth === 48 && defaultPrintOpt === 'Thermal-80mm');

              const handleSetDefault = () => {
                const target = viewMode === 'A4' ? 'A4' : thermalWidth === 32 ? 'Thermal-58mm' : 'Thermal-80mm';
                localStorage.setItem('defaultPrintOption', target);
                setDefaultPrintOpt(target);
              };

              return (
                <button
                  type="button"
                  onClick={handleSetDefault}
                  title={isCurrentDefault ? 'Current default print format' : 'Set as default print format'}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer border ${
                    isCurrentDefault
                      ? 'bg-secondary/15 text-secondary border-secondary/40'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface border-outline-variant/30'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {isCurrentDefault ? 'star' : 'star_border'}
                  </span>
                  <span className="hidden md:inline">{isCurrentDefault ? 'Default' : 'Set Default'}</span>
                </button>
              );
            })()}
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            aria-label="Close Preview"
            className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer active:scale-95 ml-auto shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Notice banner if displaying sample fallback items */}
        {!hasItems && (
          <div className="no-print bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs font-semibold text-amber-900 dark:text-amber-200">
            ★ Previewing with standard sample GST items &amp; tax calculations.
          </div>
        )}

        {/* Printable Invoice Container (Scrollable on small mobile screens) */}
        <div className={`overflow-auto py-1 sm:py-2 px-1 flex ${viewMode === 'THERMAL' ? 'justify-center overflow-x-hidden' : 'justify-start sm:justify-center'} bg-slate-200/40 flex-1`}>
          {viewMode === 'THERMAL' ? (
            /* Standard POS Thermal Slip Preview */
            <div
              className={`printable-invoice bg-white text-slate-900 rounded-sm shadow-md border border-slate-300 mx-auto overflow-hidden ${
                thermalWidth === 32 ? 'max-w-[280px] sm:max-w-[300px]' : 'max-w-[320px] sm:max-w-[340px]'
              } w-full font-mono text-xs`}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            >
              {/* Paper Top Dashed Edge */}
              <div className="h-1 border-b border-dashed border-slate-300 bg-slate-50" />

              <div className="p-2 sm:p-2.5 space-y-1">
                {/* Store Header */}
                <div className="text-center space-y-0.5">
                  <h2 className="font-black text-xs sm:text-sm uppercase tracking-tight text-slate-950 leading-tight">
                    {company.tradeName || company.businessName}
                  </h2>
                  {company.address && (
                    <p className="text-[10px] text-slate-600 leading-tight">
                      {company.address}{company.pincode ? ` - ${company.pincode}` : ''}
                    </p>
                  )}
                  {isGst && company.gstin && (
                    <p className="text-[10px] font-bold text-slate-800">
                      GSTIN: {company.gstin}
                    </p>
                  )}
                  {company.phone && (
                    <p className="text-[10px] text-slate-600">
                      Ph: {company.phone}
                    </p>
                  )}
                  <div className="pt-0.5">
                    <span className="inline-block px-1.5 py-0.2 text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-900 border border-slate-300 rounded">
                      {isGst ? 'TAX INVOICE' : 'RETAIL INVOICE'}
                    </span>
                  </div>
                </div>

                {/* Dashed Divider */}
                <div className="border-b border-dashed border-slate-400 my-1" />

                {/* Metadata Row */}
                <div className="text-[10px] space-y-0.5 leading-tight">
                  <div className="flex justify-between items-center">
                    <span><strong className="text-slate-800">Bill:</strong> {invoice.invoiceNumber}</span>
                    <span className="text-slate-700">{formatDate(invoice.date)}</span>
                  </div>
                  {invoice.partyName && (
                    <div className="truncate">
                      <strong className="text-slate-800">Party:</strong> {invoice.partyName}
                    </div>
                  )}
                </div>

                {/* Dashed Divider */}
                <div className="border-b border-dashed border-slate-400 my-1" />

                {/* Item Table */}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-dashed border-slate-400 text-slate-800 font-bold uppercase text-[9px]">
                      <th className="text-left pb-0.5 font-bold">Item</th>
                      <th className="text-center pb-0.5 w-8 font-bold">Qty</th>
                      <th className="text-right pb-0.5 w-10 font-bold">Rate</th>
                      <th className="text-right pb-0.5 w-12 font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-slate-200">
                    {itemsList.map((item, idx) => (
                      <tr key={item.id || idx} className="align-top">
                        <td className="py-0.5 text-left pr-1">
                          <div className="font-semibold text-slate-900 leading-tight break-words">
                            {item.name}
                          </div>
                          {item.discountPercent > 0 && (
                            <span className="text-[8px] text-emerald-700 block">
                              Disc {item.discountPercent}%
                            </span>
                          )}
                        </td>
                        <td className="py-0.5 text-center font-medium text-slate-800">
                          {item.quantity}
                        </td>
                        <td className="py-0.5 text-right font-medium text-slate-800">
                          {item.unitPrice.toFixed(0)}
                        </td>
                        <td className="py-0.5 text-right font-bold text-slate-950">
                          {item.totalAmount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Dashed Divider */}
                <div className="border-b border-dashed border-slate-400 my-1" />

                {/* Totals & Tax Calculation Breakdown */}
                <div className="text-[10px] space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">{isGst ? 'Subtotal (Taxable):' : 'Subtotal:'}</span>
                    <span className="font-medium text-slate-900">₹{totalTaxable.toFixed(2)}</span>
                  </div>

                  {invoice.totalDiscount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Discount:</span>
                      <span>-₹{invoice.totalDiscount.toFixed(2)}</span>
                    </div>
                  )}

                  {totalCgst > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>CGST:</span>
                      <span>₹{totalCgst.toFixed(2)}</span>
                    </div>
                  )}

                  {totalSgst > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>SGST:</span>
                      <span>₹{totalSgst.toFixed(2)}</span>
                    </div>
                  )}

                  {totalIgst > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>IGST:</span>
                      <span>₹{totalIgst.toFixed(2)}</span>
                    </div>
                  )}

                  {((invoice as any).shippingCharges > 0 || (invoice as any).shippingAmount > 0) && (
                    <div className="flex justify-between text-slate-600">
                      <span>Shipping:</span>
                      <span>+₹{Number((invoice as any).shippingCharges || (invoice as any).shippingAmount).toFixed(2)}</span>
                    </div>
                  )}

                  {(invoice as any).roundOff && (invoice as any).roundOff !== 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Round Off:</span>
                      <span>{Number((invoice as any).roundOff) > 0 ? '+' : ''}₹{Number((invoice as any).roundOff).toFixed(2)}</span>
                    </div>
                  )}

                  {/* Grand Total Highlight */}
                  <div className="pt-1 border-t border-b border-slate-900 my-0.5 py-0.5 flex justify-between items-center font-black text-xs text-slate-950">
                    <span className="uppercase tracking-wide">GRAND TOTAL:</span>
                    <span className="text-xs sm:text-sm">₹{resolvedGrandTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Status / Balance Due */}
                {invoice.balanceAmount > 0 && (
                  <div className="flex justify-between items-center text-[10px] text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded">
                    <span>Balance Due:</span>
                    <span>₹{invoice.balanceAmount.toFixed(2)}</span>
                  </div>
                )}

                {/* Dynamic UPI QR Code */}
                {upiQrUrl && (
                  <div className="pt-0.5 text-center flex flex-col items-center">
                    <div className="p-1 bg-white border border-slate-300 rounded inline-block shadow-2xs">
                      <img src={upiQrUrl} alt="UPI QR" className="w-16 h-16 sm:w-20 sm:h-20 block" />
                    </div>
                    {company.upiId && (
                      <p className="text-[9px] text-slate-700 font-bold mt-0.5">
                        UPI: <span className="font-mono">{company.upiId}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Footer Notes */}
                <div className="pt-0.5 border-t border-dashed border-slate-300 text-center space-y-0.5 text-[9px] text-slate-500">
                  <p className="font-medium text-slate-700">{company.termsAndConditions || 'Thank you! Visit again.'}</p>
                  {posStateObj?.name && (
                    <p className="italic">
                      Subject to {posStateObj.name} jurisdiction
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Standard Tally Prime / ClearTax Official GST Tax Invoice */
            <div
              className="printable-invoice bg-white text-slate-950 w-full min-w-[700px] max-w-[850px] shadow-xl flex flex-col text-xs border-2 border-slate-900 mx-auto"
              style={{ color: '#090d16', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              {/* TOP HEADER: Title, Subtitle, Copy Badge & Reverse Charge Notice */}
              <div className="border-b-2 border-slate-900 text-center py-2 px-3 bg-slate-50 relative flex items-center justify-between">
                <div className="text-[10px] font-bold text-slate-700 uppercase tracking-tight text-left">
                  {isGst ? (
                    <>
                      <span>Reverse Charge: <strong>NO</strong></span>
                      {invoice.isIntraState ? (
                        <span className="block text-[9px] text-slate-500">Tax Payable: CGST + SGST</span>
                      ) : (
                        <span className="block text-[9px] text-slate-500">Tax Payable: IGST</span>
                      )}
                    </>
                  ) : (
                    <span>Commercial / Retail Bill</span>
                  )}
                </div>

                <div className="text-center flex-1 mx-2">
                  <h1 className="text-lg sm:text-xl font-black tracking-wider uppercase text-slate-950">
                    {isGst ? 'TAX INVOICE' : 'RETAIL INVOICE'}
                  </h1>
                  {isGst && (
                    <p className="text-[10px] text-slate-600 font-medium">
                      (Issued under Section 31 of CGST Act, 2017 read with Rule 46 of CGST Rules, 2017)
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <span className="inline-block border border-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-white rounded text-slate-900 shadow-2xs">
                    {copyType}
                  </span>
                </div>
              </div>

              {/* SELLER & INVOICE META 2-COLUMN SPLIT (Tally Standard Header) */}
              <div className="grid grid-cols-2 border-b-2 border-slate-900">
                {/* Left Side: Seller / Consignor Details */}
                <div className="p-3 border-r-2 border-slate-900 flex flex-col justify-between bg-white">
                  <div>
                    <h2 className="text-base sm:text-lg font-black uppercase text-slate-950 tracking-tight leading-tight">
                      {company.tradeName || company.businessName}
                    </h2>
                    <p className="text-slate-700 text-xs mt-1 leading-snug whitespace-pre-line font-medium">
                      {company.address}
                      {company.pincode ? ` - ${company.pincode}` : ''}
                    </p>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-300 text-xs space-y-0.5">
                    {isGst && (
                      <div className="flex">
                        <span className="w-24 text-slate-600 font-bold uppercase text-[11px]">GSTIN / UIN:</span>
                        <span className="font-mono font-black text-slate-950 text-xs tracking-wider">
                          {company.gstin || 'UNREGISTERED'}
                        </span>
                      </div>
                    )}
                    {company.stateCode && (
                      <div className="flex">
                        <span className="w-24 text-slate-600 font-semibold uppercase text-[11px]">State:</span>
                        <span className="font-medium text-slate-900">
                          {sellerStateObj?.name || 'N/A'} (State Code: <strong>{company.stateCode}</strong>)
                        </span>
                      </div>
                    )}
                    {company.pan && (
                      <div className="flex">
                        <span className="w-24 text-slate-600 font-semibold uppercase text-[11px]">PAN No.:</span>
                        <span className="font-mono font-medium text-slate-900">{company.pan}</span>
                      </div>
                    )}
                    <div className="flex">
                      <span className="w-24 text-slate-600 font-semibold uppercase text-[11px]">Contact:</span>
                      <span className="text-slate-800">
                        {company.phone}
                        {company.email ? ` | ${company.email}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Invoice & Transportation Details Table */}
                <div className="flex flex-col text-xs divide-y divide-slate-800 bg-slate-50/30">
                  <div className="grid grid-cols-2 divide-x divide-slate-800 p-2 bg-slate-100/60">
                    <div>
                      <span className="text-[9px] text-slate-600 uppercase font-black block tracking-wider">
                        Invoice Number
                      </span>
                      <span className="font-mono font-black text-sm text-slate-950">
                        {invoice.invoiceNumber}
                      </span>
                    </div>
                    <div className="pl-2">
                      <span className="text-[9px] text-slate-600 uppercase font-black block tracking-wider">
                        Invoice Date
                      </span>
                      <span className="font-bold text-xs text-slate-950">
                        {formatDate(invoice.date)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-slate-800 p-2">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase font-bold block">
                        Payment Mode / Terms
                      </span>
                      <span className="font-semibold text-slate-900 uppercase">
                        {invoice.paymentMode} ({invoice.paymentStatus})
                      </span>
                    </div>
                    <div className="pl-2">
                      <span className="text-[9px] text-slate-500 uppercase font-bold block">
                        Due Date
                      </span>
                      <span className="text-slate-900 font-medium">
                        {invoice.dueDate ? formatDate(invoice.dueDate) : '-'}
                      </span>
                    </div>
                  </div>

                  {isGst && (
                    <div className="grid grid-cols-2 divide-x divide-slate-800 p-2">
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">
                          Place of Supply (POS)
                        </span>
                        <span className="font-bold text-slate-950">
                          {posStateObj ? `${posStateObj.name} (${posStateCode})` : posStateCode}
                        </span>
                      </div>
                      <div className="pl-2">
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">
                          Supply Nature
                        </span>
                        <span className="font-semibold text-slate-800">
                          {invoice.isIntraState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 divide-x divide-slate-800 p-2 text-[11px]">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase font-bold block">
                        Delivery Note / Despatch Doc
                      </span>
                      <span className="text-slate-700 italic">As per order</span>
                    </div>
                    <div className="pl-2">
                      <span className="text-[9px] text-slate-500 uppercase font-bold block">
                        Destination
                      </span>
                      <span className="text-slate-700">{buyerStateObj?.name || 'Local'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* BUYER (BILL TO) & CONSIGNEE (SHIP TO) BOXES */}
              <div className="grid grid-cols-2 border-b-2 border-slate-900 bg-white">
                {/* Consignee (Ship to) */}
                <div className="p-3 border-r-2 border-slate-900 bg-slate-50/20">
                  <div className="text-[9px] font-black uppercase tracking-wider text-slate-600 pb-0.5 border-b border-slate-200">
                    Details of Consignee (Shipped To)
                  </div>
                  <div className="font-black text-slate-950 text-sm mt-1">{invoice.partyName}</div>
                  <div className="text-slate-700 text-xs mt-0.5 leading-snug">
                    {invoice.partyAddress || 'Same as Billed Address / Local Counter'}
                  </div>
                  {isGst && (
                    <div className="mt-1.5 space-y-0.5 text-xs">
                      <div>
                        <span className="text-slate-600 font-bold uppercase text-[10px]">GSTIN / UIN: </span>
                        <span className="font-mono font-bold text-slate-950">
                          {invoice.partyGstin || 'Unregistered / B2C Consumer'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600 font-semibold uppercase text-[10px]">State: </span>
                        <span>
                          {buyerStateObj?.name || 'N/A'}
                          {invoice.partyStateCode ? ` (State Code: ${invoice.partyStateCode})` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Buyer (Bill to) */}
                <div className="p-3 bg-slate-50/20">
                  <div className="text-[9px] font-black uppercase tracking-wider text-slate-600 pb-0.5 border-b border-slate-200">
                    Details of Receiver (Billed To)
                  </div>
                  <div className="font-black text-slate-950 text-sm mt-1">{invoice.partyName}</div>
                  <div className="text-slate-700 text-xs mt-0.5 leading-snug">
                    {invoice.partyAddress || 'Direct Cash Counter / Walk-in Customer'}
                  </div>
                  {isGst && (
                    <div className="mt-1.5 space-y-0.5 text-xs">
                      <div>
                        <span className="text-slate-600 font-bold uppercase text-[10px]">GSTIN / UIN: </span>
                        <span className="font-mono font-bold text-slate-950">
                          {invoice.partyGstin || 'Unregistered / B2C Consumer'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600 font-semibold uppercase text-[10px]">State: </span>
                        <span>
                          {buyerStateObj?.name || 'N/A'}
                          {invoice.partyStateCode ? ` (State Code: ${invoice.partyStateCode})` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ITEM TABLE (Standard Tally & ClearTax Comprehensive Grid) */}
              <div className="overflow-x-auto border-b-2 border-slate-900">
                <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-900 text-slate-900 font-black uppercase text-[10px]">
                      <th className="py-2 px-2 text-center w-8 border-r border-slate-400">Sl.</th>
                      <th className="py-2 px-3 border-r border-slate-400 min-w-[220px]">
                        Description of Goods / Services
                      </th>
                      {isGst && (
                        <th className="py-2 px-2 text-center w-20 border-r border-slate-400">
                          HSN/SAC
                        </th>
                      )}
                      <th className="py-2 px-2 text-right w-16 border-r border-slate-400">Qty</th>
                      <th className="py-2 px-2 text-center w-14 border-r border-slate-400">Unit</th>
                      <th className="py-2 px-2.5 text-right w-20 border-r border-slate-400">Rate (₹)</th>
                      <th className="py-2 px-2 text-right w-14 border-r border-slate-400">Disc %</th>
                      {isGst && (
                        <th className="py-2 px-2.5 text-right w-24 border-r border-slate-400">
                          Taxable Value (₹)
                        </th>
                      )}
                      {isGst && (
                        <th className="py-2 px-2 text-center w-14 border-r border-slate-400">
                          GST %
                        </th>
                      )}
                      <th className="py-2 px-3 text-right w-24">
                        {isGst ? 'Total (₹)' : 'Amount (₹)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {itemsList.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-300 font-tabular-data">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-300">
                          <span className="font-bold text-slate-950 block text-xs">{line.name}</span>
                          {line.discountPercent > 0 && (
                            <span className="text-[10px] text-emerald-700 font-semibold block">
                              Discount applied: {line.discountPercent}%
                            </span>
                          )}
                        </td>
                        {isGst && (
                          <td className="py-2 px-2 text-center font-mono text-slate-700 border-r border-slate-300 text-xs">
                            {line.hsnSacCode || '-'}
                          </td>
                        )}
                        <td className="py-2 px-2 text-right font-medium text-slate-900 border-r border-slate-300 font-tabular-data text-xs">
                          {line.quantity}
                        </td>
                        <td className="py-2 px-2 text-center uppercase text-slate-600 border-r border-slate-300 text-xs">
                          {line.unit || 'PCS'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-medium text-slate-900 border-r border-slate-300 font-tabular-data text-xs">
                          {line.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-300 font-tabular-data text-xs">
                          {line.discountPercent > 0 ? `${line.discountPercent}%` : '-'}
                        </td>
                        {isGst && (
                          <td className="py-2 px-2.5 text-right font-semibold text-slate-900 border-r border-slate-300 font-tabular-data text-xs">
                            {line.taxableAmount.toFixed(2)}
                          </td>
                        )}
                        {isGst && (
                          <td className="py-2 px-2 text-center text-slate-800 border-r border-slate-300 font-tabular-data text-xs">
                            {line.gstRate}%
                          </td>
                        )}
                        <td className="py-2 px-3 text-right font-bold text-slate-950 font-tabular-data text-xs">
                          {line.totalAmount.toFixed(2)}
                        </td>
                      </tr>
                    ))}

                    {/* Tax Ledger Rows (Tally Output CGST, SGST, IGST) */}
                    {isGst && invoice.isIntraState && (
                      <>
                        <tr className="bg-slate-50/40">
                          <td className="border-r border-slate-300"></td>
                          <td
                            colSpan={isGst ? 8 : 6}
                            className="py-1.5 px-3 font-bold text-slate-800 border-r border-slate-300 text-right"
                          >
                            Central GST (CGST) Output
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-tabular-data">
                            {totalCgst.toFixed(2)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50/40">
                          <td className="border-r border-slate-300"></td>
                          <td
                            colSpan={isGst ? 8 : 6}
                            className="py-1.5 px-3 font-bold text-slate-800 border-r border-slate-300 text-right"
                          >
                            State GST (SGST) Output
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-tabular-data">
                            {totalSgst.toFixed(2)}
                          </td>
                        </tr>
                      </>
                    )}

                    {isGst && !invoice.isIntraState && (
                      <tr className="bg-slate-50/40">
                        <td className="border-r border-slate-300"></td>
                        <td
                          colSpan={isGst ? 8 : 6}
                          className="py-1.5 px-3 font-bold text-slate-800 border-r border-slate-300 text-right"
                        >
                          Integrated GST (IGST) Output
                        </td>
                        <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-tabular-data">
                          {totalIgst.toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {invoice.roundOff !== 0 && (
                      <tr className="bg-slate-50/40">
                        <td className="border-r border-slate-300"></td>
                        <td
                          colSpan={isGst ? 8 : 6}
                          className="py-1 px-3 text-slate-700 italic border-r border-slate-300 text-right text-[11px]"
                        >
                          Round Off
                        </td>
                        <td className="py-1 px-3 text-right font-medium text-slate-800 text-[11px] font-tabular-data">
                          {invoice.roundOff > 0
                            ? `+${invoice.roundOff.toFixed(2)}`
                            : invoice.roundOff.toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {Boolean(invoice.shippingAmount && invoice.shippingAmount > 0) && (
                      <tr className="bg-slate-50/40">
                        <td className="border-r border-slate-300"></td>
                        <td
                          colSpan={isGst ? 8 : 6}
                          className="py-1 px-3 text-slate-700 italic border-r border-slate-300 text-right text-[11px]"
                        >
                          Shipping / Delivery Charges
                        </td>
                        <td className="py-1 px-3 text-right font-medium text-slate-800 text-[11px] font-tabular-data">
                          +{Number(invoice.shippingAmount).toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {/* Total Grand Row */}
                    <tr className="bg-slate-100 font-black border-t-2 border-slate-900">
                      <td className="border-r border-slate-400"></td>
                      <td className="py-2.5 px-3 uppercase tracking-wider text-slate-950 border-r border-slate-400">
                        Total
                      </td>
                      {isGst && <td className="border-r border-slate-400"></td>}
                      <td className="py-2.5 px-2 text-right border-r border-slate-400 text-slate-950 font-tabular-data">
                        {totalQuantity}
                      </td>
                      <td className="border-r border-slate-400"></td>
                      <td className="border-r border-slate-400"></td>
                      <td className="border-r border-slate-400"></td>
                      {isGst && (
                        <td className="py-2.5 px-2.5 text-right border-r border-slate-400 text-slate-950 font-tabular-data font-black">
                          {totalTaxable.toFixed(2)}
                        </td>
                      )}
                      {isGst && <td className="border-r border-slate-400"></td>}
                      <td className="py-2.5 px-3 text-right text-sm text-slate-950 font-tabular-data font-black">
                        {formatINR(resolvedGrandTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* AMOUNT IN WORDS ROW */}
              <div className="border-b-2 border-slate-900 p-2.5 bg-slate-50/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Invoice Value (in words):
                  </span>
                  <span className="font-extrabold text-xs text-slate-950 uppercase italic">
                    INR {wordsTotal}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Total Tax Amount:
                  </span>
                  <span className="font-black text-xs text-slate-900">
                    {formatINR(resolvedTotalTax)}
                  </span>
                </div>
              </div>

              {/* HSN/SAC TAX BREAKDOWN TABLE (Standard Tally Format) */}
              {isGst && (
                <div className="border-b-2 border-slate-900">
                  <div className="bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-800 border-b border-slate-400">
                    HSN/SAC Tax Breakdown Summary
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-300 text-slate-700 font-bold uppercase text-[9px]">
                          <th rowSpan={2} className="py-1.5 px-2.5 border-r border-slate-300">
                            HSN/SAC Code
                          </th>
                          <th rowSpan={2} className="py-1.5 px-3 text-right border-r border-slate-300">
                            Taxable Value (₹)
                          </th>
                          {invoice.isIntraState ? (
                            <>
                              <th colSpan={2} className="py-1 px-2 text-center border-r border-slate-300">
                                Central Tax (CGST)
                              </th>
                              <th colSpan={2} className="py-1 px-2 text-center border-r border-slate-300">
                                State Tax (SGST)
                              </th>
                            </>
                          ) : (
                            <th colSpan={2} className="py-1 px-2 text-center border-r border-slate-300">
                              Integrated Tax (IGST)
                            </th>
                          )}
                          <th rowSpan={2} className="py-1.5 px-3 text-right">
                            Total Tax Amount (₹)
                          </th>
                        </tr>
                        <tr className="bg-slate-50 border-b border-slate-400 text-slate-700 font-bold uppercase text-[9px]">
                          {invoice.isIntraState ? (
                            <>
                              <th className="py-0.5 px-2 text-center w-12 border-r border-slate-300">
                                Rate %
                              </th>
                              <th className="py-0.5 px-2.5 text-right border-r border-slate-300">
                                Amount (₹)
                              </th>
                              <th className="py-0.5 px-2 text-center w-12 border-r border-slate-300">
                                Rate %
                              </th>
                              <th className="py-0.5 px-2.5 text-right border-r border-slate-300">
                                Amount (₹)
                              </th>
                            </>
                          ) : (
                            <>
                              <th className="py-0.5 px-2 text-center w-12 border-r border-slate-300">
                                Rate %
                              </th>
                              <th className="py-0.5 px-2.5 text-right border-r border-slate-300">
                                Amount (₹)
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {hsnSummary.map((hsnRow, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-2.5 font-mono font-bold text-slate-900 border-r border-slate-200">
                              {hsnRow.hsnSac}
                            </td>
                            <td className="py-1.5 px-3 text-right text-slate-900 font-medium border-r border-slate-200 font-tabular-data">
                              {hsnRow.taxableAmount.toFixed(2)}
                            </td>
                            {invoice.isIntraState ? (
                              <>
                                <td className="py-1.5 px-2 text-center text-slate-700 border-r border-slate-200 font-tabular-data">
                                  {hsnRow.cgstRate}%
                                </td>
                                <td className="py-1.5 px-2.5 text-right text-slate-900 border-r border-slate-200 font-tabular-data">
                                  {hsnRow.cgstAmount.toFixed(2)}
                                </td>
                                <td className="py-1.5 px-2 text-center text-slate-700 border-r border-slate-200 font-tabular-data">
                                  {hsnRow.sgstRate}%
                                </td>
                                <td className="py-1.5 px-2.5 text-right text-slate-900 border-r border-slate-200 font-tabular-data">
                                  {hsnRow.sgstAmount.toFixed(2)}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="py-1.5 px-2 text-center text-slate-700 border-r border-slate-200 font-tabular-data">
                                  {hsnRow.igstRate}%
                                </td>
                                <td className="py-1.5 px-2.5 text-right text-slate-900 border-r border-slate-200 font-tabular-data">
                                  {hsnRow.igstAmount.toFixed(2)}
                                </td>
                              </>
                            )}
                            <td className="py-1.5 px-3 text-right font-bold text-slate-950 font-tabular-data">
                              {hsnRow.totalTax.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {/* Total Tax Summary Row */}
                        <tr className="bg-slate-100 font-black border-t-2 border-slate-400">
                          <td className="py-1.5 px-2.5 uppercase text-slate-900 border-r border-slate-300">
                            Total
                          </td>
                          <td className="py-1.5 px-3 text-right border-r border-slate-300 text-slate-950 font-tabular-data">
                            {totalTaxable.toFixed(2)}
                          </td>
                          {invoice.isIntraState ? (
                            <>
                              <td className="border-r border-slate-300"></td>
                              <td className="py-1.5 px-2.5 text-right border-r border-slate-300 text-slate-950 font-tabular-data">
                                {totalCgst.toFixed(2)}
                              </td>
                              <td className="border-r border-slate-300"></td>
                              <td className="py-1.5 px-2.5 text-right border-r border-slate-300 text-slate-950 font-tabular-data">
                                {totalSgst.toFixed(2)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="border-r border-slate-300"></td>
                              <td className="py-1.5 px-2.5 text-right border-r border-slate-300 text-slate-950 font-tabular-data">
                                {totalIgst.toFixed(2)}
                              </td>
                            </>
                          )}
                          <td className="py-1.5 px-3 text-right font-black text-slate-950 font-tabular-data">
                            {resolvedTotalTax.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 bg-slate-50/40 text-[11px] text-slate-700 border-t border-slate-200">
                    <span className="font-semibold text-slate-500 uppercase text-[10px]">
                      Tax Amount (in words):{' '}
                    </span>
                    <span className="font-bold italic uppercase">INR {wordsTax}</span>
                  </div>
                </div>
              )}

              {/* FOOTER: BANK DETAILS, UPI & SIGNATURE GRID */}
              <div className="grid grid-cols-2 divide-x-2 divide-slate-900 bg-white">
                {/* Left Side: Bank Details, Terms & Legal Declaration */}
                <div className="p-3 flex flex-col justify-between gap-3 bg-slate-50/10">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1 border-b border-slate-200 pb-0.5">
                      Company's Bank Details
                    </div>
                    {company.bankName ? (
                      <div className="text-xs space-y-0.5 text-slate-800">
                        <div>
                          <span className="text-slate-500 font-semibold">Bank Name: </span>
                          <span className="font-bold text-slate-950">{company.bankName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold">A/C No.: </span>
                          <span className="font-mono font-bold text-slate-950">
                            {company.accountNumber}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-semibold">Branch &amp; IFS Code: </span>
                          <span className="font-mono font-bold text-slate-950">
                            {company.branchName ? `${company.branchName}, ` : ''}
                            {company.ifscCode}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">No bank account specified</div>
                    )}
                    {company.upiId && (
                      <div className="text-xs text-emerald-800 font-bold mt-1.5 flex items-center gap-1">
                        <span className="text-slate-500 font-semibold">UPI ID:</span> {company.upiId}
                      </div>
                    )}
                  </div>

                  {/* Declaration & Terms */}
                  <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-600 space-y-1">
                    <div>
                      <strong className="text-slate-800 uppercase">Declaration:</strong>
                      <p className="italic leading-snug">
                        Certified that the particulars given above are true and correct and the amount indicated represents the price actually charged and there is no flow of additional consideration directly or indirectly from the buyer.
                      </p>
                    </div>
                    {company.termsAndConditions && (
                      <div>
                        <strong className="text-slate-800 uppercase">Terms &amp; Conditions:</strong>
                        <p className="leading-snug">{company.termsAndConditions}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: UPI QR Code & Authorised Signatory */}
                <div className="p-3 flex flex-col justify-between items-end text-right bg-slate-50/10">
                  <div className="flex items-center gap-3 w-full justify-end">
                    {upiQrUrl && (
                      <div className="p-1 bg-white border border-slate-300 rounded text-center shadow-xs">
                        <img src={upiQrUrl} alt="UPI QR" className="w-20 h-20 block" />
                        <span className="text-[9px] font-black text-emerald-700 block mt-0.5 tracking-tight uppercase">
                          Scan to Pay
                        </span>
                      </div>
                    )}

                    <div className="text-right">
                      {invoice.balanceAmount > 0 && (
                        <div className="mb-2">
                          <span className="text-[10px] uppercase font-bold text-rose-600 block">
                            Balance Due
                          </span>
                          <span className="font-extrabold text-sm text-rose-700 font-tabular-data">
                            {formatINR(invoice.balanceAmount)}
                          </span>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-600 font-medium">
                        Payment Status:{' '}
                        <span
                          className={`font-bold ${
                            invoice.paymentStatus === 'PAID'
                              ? 'text-emerald-700'
                              : invoice.paymentStatus === 'PARTIAL'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {invoice.paymentStatus}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Signatory Box */}
                  <div className="mt-6 text-center w-full max-w-[220px]">
                    <div className="text-xs font-bold text-slate-900">
                      for {company.tradeName || company.businessName}
                    </div>
                    <div className="h-12 flex items-center justify-center">
                      <span className="text-[10px] text-slate-300 italic select-none">
                        [Signature / Digital Seal]
                      </span>
                    </div>
                    <div className="border-t border-slate-900 pt-1 text-[11px] font-black text-slate-900 uppercase tracking-wider">
                      Authorised Signatory
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bottom Actions Toolbar */}
        <div className="no-print px-2 sm:px-3 py-1.5 border-t border-outline-variant/20 bg-surface-container-low/95 backdrop-blur-md flex items-center justify-between gap-1.5 z-10 shrink-0">
          {/* Left Actions: Edit & Export Menu */}
          <div className="flex items-center gap-1 shrink-0">
            {onEditInvoice && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditInvoice(invoice);
                }}
                className="inline-flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95"
                title="Edit and update invoice"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                <span>Edit</span>
              </button>
            )}

            {/* More Menu (E-Way / E-Invoice / Plain Text) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreActions(!showMoreActions)}
                className="h-7 sm:h-8 px-2 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-xs font-bold border border-outline-variant/30 cursor-pointer active:scale-95"
                title="More Export Options"
              >
                <MoreVertical size={14} />
                <span className="hidden sm:inline">Export</span>
              </button>

              {showMoreActions && (
                <div className="absolute left-0 bottom-9 z-50 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl p-1.5 flex flex-col gap-1 w-52 animate-in fade-in">
                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      downloadEWayBillJson(company, invoice);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                  >
                    <Download size={14} className="text-secondary" />
                    <span>NIC E-Way Bill (JSON)</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      downloadEInvoiceJson(company, invoice);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                  >
                    <Download size={14} className="text-primary" />
                    <span>NIC E-Invoice (JSON)</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(thermalText);
                        alert('Thermal receipt plain text copied to clipboard!');
                      }
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                  >
                    <Receipt size={14} className="text-amber-600" />
                    <span>Copy Raw Slip Text</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Primary Actions: WhatsApp & Print */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="inline-flex items-center gap-1 bg-[#25D366] hover:bg-[#20ba59] text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              <Share2 size={13} />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={viewMode === 'THERMAL' ? () => setIsThermalModalOpen(true) : handlePrint}
              className="inline-flex items-center gap-1 bg-secondary hover:bg-secondary/90 text-on-secondary px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Printer size={13} />
              <span>{viewMode === 'THERMAL' ? 'Print Slip' : 'Print / PDF'}</span>
            </button>
          </div>
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
