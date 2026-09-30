import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { getStateByCode } from '../../core/gst/stateCodes.ts';
import { formatThermalReceiptText } from '../../core/printer/escpos.ts';
import { X, Printer, Share2, Receipt, FileText, Download, MoreVertical } from 'lucide-react';
import { ThermalPrintModal } from '../Printing/ThermalPrintModal.tsx';
import { WhatsAppShareModal } from '../WhatsApp/WhatsAppShareModal.tsx';
import { downloadEWayBillJson } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';

interface InvoicePreviewModalProps {
  invoice: Invoice;
  company: CompanyProfile;
  onClose: () => void;
  onEditInvoice?: (invoice: Invoice) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice,
  company,
  onClose,
  onEditInvoice,
}) => {
  const [viewMode, setViewMode] = useState<'A4' | 'THERMAL'>('A4');
  const [thermalWidth, setThermalWidth] = useState<32 | 48>(48); // 32 = 58mm, 48 = 80mm
  const [isThermalModalOpen, setIsThermalModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  const isGst = company.isGstEnabled !== false;

  const handlePrint = () => {
    window.print();
  };

  const sellerStateObj = getStateByCode(company.stateCode || '');
  const buyerStateObj = getStateByCode(invoice.partyStateCode || '');
  const posStateCode = invoice.placeOfSupplyStateCode || company.stateCode || '';
  const posStateObj = getStateByCode(posStateCode);

  const wordsTotal = invoice.amountInWords || amountInWords(invoice.grandTotal);
  const wordsTax = amountInWords(invoice.totalTax || 0);

  // Group items by HSN/SAC & GST rate for the standard Tally HSN/SAC Tax Breakdown Summary table
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

    invoice.items.forEach((item) => {
      const hsn = item.hsnSacCode?.trim() || 'N/A';
      const key = `${hsn}_${item.gstRate}`;
      const isIntra = invoice.isIntraState;

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

      summaryMap[key].taxableAmount += item.taxableAmount || 0;
      summaryMap[key].cgstAmount += item.cgstAmount || 0;
      summaryMap[key].sgstAmount += item.sgstAmount || 0;
      summaryMap[key].igstAmount += item.igstAmount || 0;
      summaryMap[key].totalTax +=
        (item.cgstAmount || 0) + (item.sgstAmount || 0) + (item.igstAmount || 0);
    });

    return Object.values(summaryMap);
  }, [invoice]);

  const totalQuantity = useMemo(() => {
    return invoice.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [invoice.items]);

  const thermalText = formatThermalReceiptText(
    {
      companyName: company.tradeName || company.businessName,
      companyAddress: company.address,
      gstin: isGst ? company.gstin : '',
      phone: company.phone,
      invoiceNo: invoice.invoiceNumber,
      date: formatDate(invoice.date),
      customerName: invoice.partyName,
      items: invoice.items.map((i) => ({
        name: i.name,
        qty: i.quantity,
        rate: i.unitPrice,
        amount: i.totalAmount,
      })),
      taxableAmount: invoice.totalTaxableAmount,
      cgstAmount: isGst ? invoice.totalCgst : 0,
      sgstAmount: isGst ? invoice.totalSgst : 0,
      igstAmount: isGst ? invoice.totalIgst : 0,
      grandTotal: invoice.grandTotal,
      upiId: company.upiId,
      terms: company.termsAndConditions,
    },
    thermalWidth
  );

  const upiQrUrl = company.upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
        `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(
          company.tradeName || company.businessName
        )}&am=${invoice.balanceAmount > 0 ? invoice.balanceAmount : invoice.grandTotal}&cu=INR`
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print-modal-overlay animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden print-modal-container">
        {/* Modal Controls Toolbar (Hidden during print) */}
        <div className="no-print px-4 py-2.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/70 flex-wrap gap-2">
          {/* Format Switcher */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode('A4')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-label-sm text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'A4'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <FileText size={14} />
              <span>{isGst ? 'A4 Tax Invoice' : 'A4 Bill of Supply'}</span>
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
              onClick={() => setIsThermalModalOpen(true)}
              className="inline-flex items-center gap-1 bg-surface-container hover:bg-surface-container-high text-on-surface px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-outline-variant/30 active:scale-95"
              title="Print directly to Bluetooth / USB thermal printer"
            >
              <Receipt size={14} className="text-secondary" />
              <span>ESC/POS</span>
            </button>

            <button
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="inline-flex items-center gap-1 bg-[#25D366] hover:bg-[#20ba59] text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Share2 size={14} />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 bg-secondary hover:bg-secondary/90 text-on-secondary px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Printer size={14} />
              <span>Print / PDF</span>
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

        {/* Printable Invoice Container */}
        <div className="overflow-y-auto p-2 sm:p-5 flex justify-center bg-slate-200/50 flex-1">
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
            /* Standard Tally-Style Boxed Grid Tax Invoice / Bill of Supply */
            <div
              className="printable-invoice bg-white text-slate-950 w-full max-w-[800px] shadow-lg flex flex-col text-xs border-2 border-slate-900"
              style={{ color: '#090d16', fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              {/* TOP HEADER: Document Title & Subtitle */}
              <div className="border-b-2 border-slate-900 text-center py-2 px-3 bg-slate-50 relative">
                <div className="text-base sm:text-lg font-black tracking-wider uppercase">
                  {isGst ? 'TAX INVOICE' : 'BILL OF SUPPLY'}
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  {isGst
                    ? '(Issued under Rule 46 of CGST Rules, 2017)'
                    : '(Composition / Non-GST Retail Supply)'}
                </div>
                <div className="absolute right-3 top-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 hidden sm:block border border-slate-400 px-1.5 py-0.5 rounded">
                  Original for Recipient
                </div>
              </div>

              {/* SELLER & INVOICE META 2-COLUMN GRID (Tally Header) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-slate-900">
                {/* Left: Seller Details */}
                <div className="p-3 sm:border-r border-slate-900 flex flex-col justify-between">
                  <div>
                    <h2 className="text-sm sm:text-base font-black uppercase text-slate-900 tracking-tight leading-tight">
                      {company.tradeName || company.businessName}
                    </h2>
                    <p className="text-slate-700 text-xs mt-1 leading-snug whitespace-pre-line">
                      {company.address}
                      {company.pincode ? ` - ${company.pincode}` : ''}
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-slate-200 text-xs space-y-0.5">
                    {isGst && (
                      <div className="flex">
                        <span className="w-24 text-slate-600 font-semibold">GSTIN/UIN:</span>
                        <span className="font-mono font-bold text-slate-950">
                          {company.gstin || 'UNREGISTERED'}
                        </span>
                      </div>
                    )}
                    {company.stateCode && (
                      <div className="flex">
                        <span className="w-24 text-slate-600 font-semibold">State Name:</span>
                        <span className="font-medium text-slate-900">
                          {sellerStateObj?.name || 'N/A'}, Code: {company.stateCode}
                        </span>
                      </div>
                    )}
                    {company.pan && (
                      <div className="flex">
                        <span className="w-24 text-slate-600 font-semibold">PAN/IT No.:</span>
                        <span className="font-mono font-medium text-slate-900">{company.pan}</span>
                      </div>
                    )}
                    <div className="flex">
                      <span className="w-24 text-slate-600 font-semibold">Contact:</span>
                      <span className="text-slate-800">
                        {company.phone}
                        {company.email ? ` | ${company.email}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Invoice & Despatch Details Grid */}
                <div className="flex flex-col text-xs divide-y divide-slate-800">
                  <div className="grid grid-cols-2 divide-x divide-slate-800 p-2 bg-slate-50/70">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">
                        Invoice No.
                      </span>
                      <span className="font-mono font-extrabold text-sm text-slate-900">
                        {invoice.invoiceNumber}
                      </span>
                    </div>
                    <div className="pl-2">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">
                        Dated
                      </span>
                      <span className="font-bold text-xs text-slate-900">
                        {formatDate(invoice.date)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-slate-800 p-2">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">
                        Mode/Terms of Payment
                      </span>
                      <span className="font-semibold text-slate-800">
                        {invoice.paymentMode} ({invoice.paymentStatus})
                      </span>
                    </div>
                    <div className="pl-2">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">
                        Due Date
                      </span>
                      <span className="text-slate-800">
                        {invoice.dueDate ? formatDate(invoice.dueDate) : '-'}
                      </span>
                    </div>
                  </div>

                  {isGst && (
                    <div className="grid grid-cols-2 divide-x divide-slate-800 p-2">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">
                          Place of Supply
                        </span>
                        <span className="font-semibold text-slate-900">
                          {posStateObj ? `${posStateObj.name} (${posStateCode})` : posStateCode}
                        </span>
                      </div>
                      <div className="pl-2">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">
                          Supply Type
                        </span>
                        <span className="font-medium text-slate-800">
                          {invoice.isIntraState ? 'Intra-State (CGST+SGST)' : 'Inter-State (IGST)'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* BUYER & CONSIGNEE SECTION */}
              <div className="grid grid-cols-1 sm:grid-cols-2 border-b-2 border-slate-900">
                {/* Consignee (Ship to) */}
                <div className="p-2.5 sm:border-r border-slate-900 bg-slate-50/30">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                    Consignee (Ship To)
                  </div>
                  <div className="font-bold text-slate-950 text-sm mt-0.5">{invoice.partyName}</div>
                  <div className="text-slate-700 text-xs mt-0.5">
                    {invoice.partyAddress || 'Same as Buyer / Local'}
                  </div>
                  {isGst && (
                    <div className="mt-1.5 space-y-0.5 text-xs">
                      <div>
                        <span className="text-slate-600 font-semibold">GSTIN/UIN: </span>
                        <span className="font-mono font-bold text-slate-900">
                          {invoice.partyGstin || 'Unregistered'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600 font-semibold">State Name: </span>
                        <span>
                          {buyerStateObj?.name || 'N/A'}
                          {invoice.partyStateCode ? `, Code: ${invoice.partyStateCode}` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Buyer (Bill to) */}
                <div className="p-2.5 bg-slate-50/30">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                    Buyer (Bill To)
                  </div>
                  <div className="font-bold text-slate-950 text-sm mt-0.5">{invoice.partyName}</div>
                  <div className="text-slate-700 text-xs mt-0.5">
                    {invoice.partyAddress || 'Cash Counter / Local'}
                  </div>
                  {isGst && (
                    <div className="mt-1.5 space-y-0.5 text-xs">
                      <div>
                        <span className="text-slate-600 font-semibold">GSTIN/UIN: </span>
                        <span className="font-mono font-bold text-slate-900">
                          {invoice.partyGstin || 'Unregistered'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600 font-semibold">State Name: </span>
                        <span>
                          {buyerStateObj?.name || 'N/A'}
                          {invoice.partyStateCode ? `, Code: ${invoice.partyStateCode}` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* TALLY ITEMS GRID */}
              <div className="overflow-x-auto border-b-2 border-slate-900">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-900 text-slate-800 font-black uppercase text-[10px]">
                      <th className="py-1.5 px-2 text-center w-8 border-r border-slate-400">Sl No.</th>
                      <th className="py-1.5 px-2.5 border-r border-slate-400">Description of Goods</th>
                      {isGst && (
                        <th className="py-1.5 px-2 text-center w-20 border-r border-slate-400">
                          HSN/SAC
                        </th>
                      )}
                      <th className="py-1.5 px-2 text-right w-16 border-r border-slate-400">Qty</th>
                      <th className="py-1.5 px-2 text-center w-12 border-r border-slate-400">Unit</th>
                      <th className="py-1.5 px-2.5 text-right w-20 border-r border-slate-400">Rate (₹)</th>
                      {isGst && (
                        <th className="py-1.5 px-2 text-center w-14 border-r border-slate-400">
                          GST %
                        </th>
                      )}
                      <th className="py-1.5 px-3 text-right w-24">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoice.items.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-300">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-300">
                          <span className="font-bold text-slate-900 block">{line.name}</span>
                          {line.discountPercent ? (
                            <span className="text-[10px] text-emerald-700 font-semibold block">
                              Discount: {line.discountPercent}%
                            </span>
                          ) : null}
                        </td>
                        {isGst && (
                          <td className="py-2 px-2 text-center font-mono text-slate-700 border-r border-slate-300">
                            {line.hsnSacCode || '-'}
                          </td>
                        )}
                        <td className="py-2 px-2 text-right font-medium text-slate-900 border-r border-slate-300">
                          {line.quantity}
                        </td>
                        <td className="py-2 px-2 text-center uppercase text-slate-600 border-r border-slate-300">
                          {line.unit || 'NOS'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-medium text-slate-900 border-r border-slate-300">
                          {line.unitPrice.toFixed(2)}
                        </td>
                        {isGst && (
                          <td className="py-2 px-2 text-center text-slate-800 border-r border-slate-300">
                            {line.gstRate}%
                          </td>
                        )}
                        <td className="py-2 px-3 text-right font-bold text-slate-950">
                          {(isGst ? line.taxableAmount : line.totalAmount).toFixed(2)}
                        </td>
                      </tr>
                    ))}

                    {/* Tax & Adjustments Ledger Rows (Tally Style) */}
                    {isGst && invoice.isIntraState && (
                      <>
                        <tr className="bg-slate-50/40">
                          <td className="border-r border-slate-300"></td>
                          <td
                            colSpan={isGst ? 6 : 5}
                            className="py-1.5 px-2.5 font-semibold text-slate-800 border-r border-slate-300 text-right"
                          >
                            Output CGST
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-slate-900">
                            {invoice.totalCgst.toFixed(2)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50/40">
                          <td className="border-r border-slate-300"></td>
                          <td
                            colSpan={isGst ? 6 : 5}
                            className="py-1.5 px-2.5 font-semibold text-slate-800 border-r border-slate-300 text-right"
                          >
                            Output SGST
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-slate-900">
                            {invoice.totalSgst.toFixed(2)}
                          </td>
                        </tr>
                      </>
                    )}

                    {isGst && !invoice.isIntraState && (
                      <tr className="bg-slate-50/40">
                        <td className="border-r border-slate-300"></td>
                        <td
                          colSpan={isGst ? 6 : 5}
                          className="py-1.5 px-2.5 font-semibold text-slate-800 border-r border-slate-300 text-right"
                        >
                          Output IGST
                        </td>
                        <td className="py-1.5 px-3 text-right font-bold text-slate-900">
                          {invoice.totalIgst.toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {invoice.roundOff !== 0 && (
                      <tr className="bg-slate-50/40">
                        <td className="border-r border-slate-300"></td>
                        <td
                          colSpan={isGst ? 6 : 5}
                          className="py-1 px-2.5 text-slate-700 italic border-r border-slate-300 text-right text-[11px]"
                        >
                          Round Off
                        </td>
                        <td className="py-1 px-3 text-right font-medium text-slate-800 text-[11px]">
                          {invoice.roundOff > 0 ? `+${invoice.roundOff.toFixed(2)}` : invoice.roundOff.toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {/* Total Grand Row */}
                    <tr className="bg-slate-100 font-black border-t-2 border-slate-900">
                      <td className="border-r border-slate-400"></td>
                      <td className="py-2 px-2.5 uppercase tracking-wider text-slate-900 border-r border-slate-400">
                        Total
                      </td>
                      {isGst && <td className="border-r border-slate-400"></td>}
                      <td className="py-2 px-2 text-right border-r border-slate-400 text-slate-900">
                        {totalQuantity}
                      </td>
                      <td className="border-r border-slate-400"></td>
                      <td className="border-r border-slate-400"></td>
                      {isGst && <td className="border-r border-slate-400"></td>}
                      <td className="py-2 px-3 text-right text-sm text-slate-950">
                        {formatINR(invoice.grandTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* AMOUNT IN WORDS ROW */}
              <div className="border-b border-slate-900 p-2.5 bg-slate-50/60">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  Amount Chargeable (in words):
                </span>
                <span className="font-extrabold text-xs text-slate-900 italic uppercase">
                  INR {wordsTotal}
                </span>
              </div>

              {/* TALLY HSN/SAC TAX BREAKDOWN TABLE (When GST Enabled) */}
              {isGst && (
                <div className="border-b-2 border-slate-900">
                  <div className="bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-800 border-b border-slate-400">
                    Tax Amount (HSN/SAC Summary)
                  </div>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-300 text-slate-700 font-bold uppercase text-[9px]">
                        <th rowSpan={2} className="py-1.5 px-2 border-r border-slate-300">
                          HSN/SAC
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2 text-right border-r border-slate-300">
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
                        <th rowSpan={2} className="py-1.5 px-2.5 text-right">
                          Total Tax Amount (₹)
                        </th>
                      </tr>
                      <tr className="bg-slate-50 border-b border-slate-400 text-slate-700 font-bold uppercase text-[9px]">
                        {invoice.isIntraState ? (
                          <>
                            <th className="py-0.5 px-2 text-center w-12 border-r border-slate-300">
                              Rate %
                            </th>
                            <th className="py-0.5 px-2 text-right border-r border-slate-300">
                              Amount (₹)
                            </th>
                            <th className="py-0.5 px-2 text-center w-12 border-r border-slate-300">
                              Rate %
                            </th>
                            <th className="py-0.5 px-2 text-right border-r border-slate-300">
                              Amount (₹)
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="py-0.5 px-2 text-center w-12 border-r border-slate-300">
                              Rate %
                            </th>
                            <th className="py-0.5 px-2 text-right border-r border-slate-300">
                              Amount (₹)
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {hsnSummary.map((hsnRow, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="py-1 px-2 font-mono text-slate-800 border-r border-slate-200">
                            {hsnRow.hsnSac}
                          </td>
                          <td className="py-1 px-2 text-right text-slate-900 font-medium border-r border-slate-200">
                            {hsnRow.taxableAmount.toFixed(2)}
                          </td>
                          {invoice.isIntraState ? (
                            <>
                              <td className="py-1 px-2 text-center text-slate-700 border-r border-slate-200">
                                {hsnRow.cgstRate}%
                              </td>
                              <td className="py-1 px-2 text-right text-slate-900 border-r border-slate-200">
                                {hsnRow.cgstAmount.toFixed(2)}
                              </td>
                              <td className="py-1 px-2 text-center text-slate-700 border-r border-slate-200">
                                {hsnRow.sgstRate}%
                              </td>
                              <td className="py-1 px-2 text-right text-slate-900 border-r border-slate-200">
                                {hsnRow.sgstAmount.toFixed(2)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-1 px-2 text-center text-slate-700 border-r border-slate-200">
                                {hsnRow.igstRate}%
                              </td>
                              <td className="py-1 px-2 text-right text-slate-900 border-r border-slate-200">
                                {hsnRow.igstAmount.toFixed(2)}
                              </td>
                            </>
                          )}
                          <td className="py-1 px-2.5 text-right font-bold text-slate-950">
                            {hsnRow.totalTax.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      {/* Total Tax Summary Row */}
                      <tr className="bg-slate-100 font-bold border-t border-slate-400">
                        <td className="py-1 px-2 uppercase text-slate-800 border-r border-slate-300">
                          Total
                        </td>
                        <td className="py-1 px-2 text-right border-r border-slate-300 text-slate-950">
                          {invoice.totalTaxableAmount.toFixed(2)}
                        </td>
                        {invoice.isIntraState ? (
                          <>
                            <td className="border-r border-slate-300"></td>
                            <td className="py-1 px-2 text-right border-r border-slate-300 text-slate-950">
                              {invoice.totalCgst.toFixed(2)}
                            </td>
                            <td className="border-r border-slate-300"></td>
                            <td className="py-1 px-2 text-right border-r border-slate-300 text-slate-950">
                              {invoice.totalSgst.toFixed(2)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="border-r border-slate-300"></td>
                            <td className="py-1 px-2 text-right border-r border-slate-300 text-slate-950">
                              {invoice.totalIgst.toFixed(2)}
                            </td>
                          </>
                        )}
                        <td className="py-1 px-2.5 text-right font-black text-slate-950">
                          {invoice.totalTax.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="p-2 bg-slate-50/40 text-[11px] text-slate-700 border-t border-slate-200">
                    <span className="font-semibold text-slate-500 uppercase text-[10px]">
                      Tax Amount (in words):{' '}
                    </span>
                    <span className="font-bold italic uppercase">INR {wordsTax}</span>
                  </div>
                </div>
              )}

              {/* FOOTER: BANK DETAILS, UPI & SIGNATURE GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x-2 divide-slate-900">
                {/* Left: Bank Details & Terms */}
                <div className="p-3 flex flex-col justify-between gap-2 bg-slate-50/20">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      Company's Bank Details
                    </div>
                    {company.bankName ? (
                      <div className="text-xs space-y-0.5 text-slate-800">
                        <div>
                          <span className="text-slate-500 font-medium">Bank Name: </span>
                          <span className="font-bold text-slate-900">{company.bankName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">A/C No.: </span>
                          <span className="font-mono font-bold text-slate-900">
                            {company.accountNumber}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Branch &amp; IFS Code: </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {company.branchName ? `${company.branchName}, ` : ''}
                            {company.ifscCode}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">No bank details specified</div>
                    )}
                    {company.upiId && (
                      <div className="text-xs text-emerald-800 font-bold mt-1.5 flex items-center gap-1">
                        <span className="text-slate-500 font-normal">UPI ID:</span> {company.upiId}
                      </div>
                    )}
                  </div>

                  {/* Declaration & Terms */}
                  <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-600 space-y-1">
                    <div>
                      <strong className="text-slate-700 uppercase">Declaration:</strong>
                      <p className="italic leading-snug">
                        We declare that this invoice shows the actual price of the goods/services
                        described and that all particulars are true and correct.
                      </p>
                    </div>
                    {company.termsAndConditions && (
                      <div>
                        <strong className="text-slate-700 uppercase">Terms &amp; Conditions:</strong>
                        <p className="leading-snug">{company.termsAndConditions}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: UPI QR Code & Authorised Signatory */}
                <div className="p-3 flex flex-col justify-between items-center sm:items-end text-right bg-slate-50/20">
                  <div className="flex items-center gap-3 w-full justify-between sm:justify-end">
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
                          <span className="font-extrabold text-sm text-rose-700">
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
                    <div className="text-xs font-bold text-slate-800">
                      for {company.tradeName || company.businessName}
                    </div>
                    <div className="h-12 flex items-center justify-center">
                      <span className="text-[10px] text-slate-300 italic select-none">
                        [Signature / Seal]
                      </span>
                    </div>
                    <div className="border-t border-slate-900 pt-1 text-[11px] font-bold text-slate-900 uppercase tracking-wider">
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
