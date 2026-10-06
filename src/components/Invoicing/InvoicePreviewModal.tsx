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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4 print-modal-overlay animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden print-modal-container">
        {/* Modal Controls Toolbar (Hidden during print) */}
        <div className="no-print px-3 sm:px-4 py-2 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/85 flex-wrap gap-2">
          {/* Format Switcher & Copy Badge Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setViewMode('A4')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-label-sm text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'A4'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <FileText size={14} />
              <span>{isGst ? 'A4 Tax Invoice' : 'A4 Retail Invoice'}</span>
            </button>

            <button
              onClick={() => setViewMode('THERMAL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-label-sm text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'THERMAL'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Receipt size={14} />
              <span>Thermal POS</span>
            </button>

            {viewMode === 'A4' && (
              <div className="flex items-center gap-1 bg-surface-container rounded-xl p-0.5 border border-outline-variant/30 text-[11px] font-bold">
                <button
                  onClick={() => setCopyType('ORIGINAL FOR RECIPIENT')}
                  className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                    copyType === 'ORIGINAL FOR RECIPIENT'
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'text-on-surface-variant'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setCopyType('DUPLICATE FOR TRANSPORTER')}
                  className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                    copyType === 'DUPLICATE FOR TRANSPORTER'
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'text-on-surface-variant'
                  }`}
                >
                  Duplicate
                </button>
                <button
                  onClick={() => setCopyType('TRIPLICATE FOR SUPPLIER')}
                  className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                    copyType === 'TRIPLICATE FOR SUPPLIER'
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'text-on-surface-variant'
                  }`}
                >
                  Triplicate
                </button>
              </div>
            )}

            {viewMode === 'THERMAL' && (
              <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 ml-1">
                <button
                  onClick={() => setThermalWidth(32)}
                  className={`px-2 py-0.5 text-[11px] rounded font-bold cursor-pointer ${
                    thermalWidth === 32
                      ? 'bg-secondary text-on-secondary'
                      : 'text-on-surface-variant'
                  }`}
                >
                  58mm
                </button>
                <button
                  onClick={() => setThermalWidth(48)}
                  className={`px-2 py-0.5 text-[11px] rounded font-bold cursor-pointer ${
                    thermalWidth === 48
                      ? 'bg-secondary text-on-secondary'
                      : 'text-on-surface-variant'
                  }`}
                >
                  80mm
                </button>
              </div>
            )}

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
                  title={isCurrentDefault ? 'Current default format for all invoices' : 'Set as default format for all invoices'}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                    isCurrentDefault
                      ? 'bg-secondary/15 text-secondary border-secondary/40 shadow-xs'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface border-outline-variant/30 hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {isCurrentDefault ? 'check_circle' : 'bookmark_add'}
                  </span>
                  <span>{isCurrentDefault ? 'Default' : 'Set Default'}</span>
                </button>
              );
            })()}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            {onEditInvoice && (
              <button
                onClick={() => {
                  onClose();
                  onEditInvoice(invoice);
                }}
                className="inline-flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95"
                title="Edit and update invoice"
              >
                <span className="material-symbols-outlined text-[15px]">edit</span>
                <span>Edit</span>
              </button>
            )}

            <button
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="inline-flex items-center gap-1 bg-[#25D366] hover:bg-[#20ba59] text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Share2 size={14} />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={viewMode === 'THERMAL' ? () => setIsThermalModalOpen(true) : handlePrint}
              className="inline-flex items-center gap-1.5 bg-secondary hover:bg-secondary/90 text-on-secondary px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Printer size={14} />
              <span>{viewMode === 'THERMAL' ? 'Print Receipt' : 'Print / PDF'}</span>
            </button>

            {/* More Menu (E-Way / E-Invoice) */}
            <div className="relative">
              <button
                onClick={() => setShowMoreActions(!showMoreActions)}
                className="w-8 h-8 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant cursor-pointer"
                title="More Export Options"
              >
                <MoreVertical size={16} />
              </button>

              {showMoreActions && (
                <div className="absolute right-0 top-10 z-50 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl p-1.5 flex flex-col gap-1 w-48 animate-in fade-in">
                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      downloadEWayBillJson(company, invoice);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                  >
                    <Download size={14} className="text-blue-500" />
                    <span>Download E-Way JSON</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      downloadEInvoiceJson(company, invoice);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container text-left cursor-pointer"
                  >
                    <Download size={14} className="text-purple-500" />
                    <span>Download E-Invoice JSON</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Notice banner if displaying sample fallback items */}
        {!hasItems && (
          <div className="no-print bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs font-semibold text-amber-900 dark:text-amber-200">
            ★ Previewing with standard sample GST items &amp; tax calculations.
          </div>
        )}

        {/* Printable Invoice Container (Scrollable on small mobile screens) */}
        <div className="overflow-auto p-2 sm:p-5 flex justify-start sm:justify-center bg-slate-200/50 flex-1">
          {viewMode === 'THERMAL' ? (
            /* Thermal POS Receipt View */
            <div
              className="printable-invoice bg-white text-black p-4 rounded-md shadow-md mx-auto"
              style={{
                fontFamily: 'monospace',
                maxWidth: thermalWidth === 32 ? '300px' : '380px',
                width: '100%',
                whiteSpace: 'pre-wrap',
                fontSize: thermalWidth === 32 ? '0.75rem' : '0.8rem',
                lineHeight: '1.25',
              }}
            >
              {thermalText}
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
