import React from 'react';
import { formatINR, formatDate, formatQuantity } from '../../../core/utils/formatters.ts';
import {
  InvoicePreviewModel,
  InvoiceCopyType,
  InvoiceViewMode,
} from './useInvoicePreviewModel.ts';

export interface A4DocumentProps {
  model: InvoicePreviewModel;
  copyType: InvoiceCopyType;
  viewMode: InvoiceViewMode;
  a4FitZoom: boolean;
  containerWidth: number;
  a4ContentHeight: number;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export const A4Document: React.FC<A4DocumentProps> = ({
  model,
  copyType,
  viewMode,
  a4FitZoom,
  containerWidth,
  a4ContentHeight,
  contentRef,
}) => {
  const {
    company,
    isGst,
    invoice,
    isDeliveryChallan,
    challanPurpose,
    sellerStateObj,
    buyerStateObj,
    posStateObj,
    posStateCode,
    a4Settings,
    party,
    itemsList,
    totalUtgst,
    totalCgst,
    totalSgst,
    totalIgst,
    totalCess,
    totalQuantity,
    totalTaxable,
    resolvedGrandTotal,
    wordsTotal,
    resolvedTotalTax,
    hsnSummary,
    wordsTax,
    upiQrUrl,
  } = model;

  return (
    <div
      id="invoice-a4-print-root"
      className={`w-full ${
        viewMode === 'MOBILE'
          ? 'hidden print:flex justify-center'
          : 'flex justify-center overflow-x-auto py-1 sm:py-2'
      }`}
      style={
        viewMode === 'A4' && a4FitZoom && containerWidth < 794
          ? {
              width: `${Math.floor(794 * Math.min(1, Math.max(0.35, (containerWidth - 16) / 794)))}px`,
              height: (a4ContentHeight > 0 ? a4ContentHeight : 1120)
                ? `${Math.ceil((a4ContentHeight > 0 ? a4ContentHeight : 1120) * Math.min(1, Math.max(0.35, (containerWidth - 16) / 794)))}px`
                : undefined,
              minHeight: a4ContentHeight > 0
                ? `${Math.ceil(a4ContentHeight * Math.min(1, Math.max(0.35, (containerWidth - 16) / 794)))}px`
                : undefined,
              overflow: 'hidden',
              position: 'relative',
              margin: '0 auto',
            }
          : undefined
      }
    >
      <div
        ref={contentRef as React.RefObject<HTMLDivElement>}
        className="printable-invoice bg-white text-slate-950 w-full min-w-[700px] max-w-[850px] shadow-xl flex flex-col text-xs border-2 border-slate-900 mx-auto"
        style={{
          color: '#090d16',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          width: viewMode === 'A4' && a4FitZoom && containerWidth < 794 ? '794px' : undefined,
          minWidth: viewMode === 'A4' && a4FitZoom && containerWidth < 794 ? '794px' : undefined,
          maxWidth: viewMode === 'A4' && a4FitZoom && containerWidth < 794 ? '794px' : undefined,
          transform:
            viewMode === 'A4' && a4FitZoom && containerWidth < 794
              ? `scale(${Math.min(1, Math.max(0.35, (containerWidth - 16) / 794))})`
              : undefined,
          transformOrigin: 'top left',
          position: viewMode === 'A4' && a4FitZoom && containerWidth < 794 ? 'absolute' : undefined,
          top: 0,
          left: 0,
        }}
      >
        {/* TOP HEADER: Title, Subtitle, Copy Badge & Reverse Charge Notice */}
        <div className="border-b-2 border-slate-900 text-center py-2 px-3 bg-slate-50 relative flex items-center justify-between">
          <div className="text-[10px] font-bold text-slate-700 uppercase tracking-tight text-left">
            {company.isCompositionScheme ? (
              <div>
                <span className="text-[11px] font-bold text-slate-900 block">Composition Scheme</span>
                <span className="text-[9px] text-slate-500 font-medium">Under Section 10 of CGST Act</span>
              </div>
            ) : isGst ? (
              <>
                <span>Reverse Charge: <strong>{invoice.isRcm ? 'YES' : 'NO'}</strong></span>
                {invoice.isIntraState ? (
                  <span className="block text-[9px] text-slate-500">
                    Tax Payable: {invoice.isUtgst || totalUtgst > 0 ? 'CGST + UTGST' : 'CGST + SGST'}
                  </span>
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
              {invoice.invoiceType === 'DELIVERY_CHALLAN'
                ? 'DELIVERY CHALLAN'
                : company.isCompositionScheme
                ? 'BILL OF SUPPLY'
                : (isGst ? 'TAX INVOICE' : 'RETAIL INVOICE')}
            </h1>
            {invoice.invoiceType === 'DELIVERY_CHALLAN' ? (
              <p className="text-[10px] text-slate-600 font-semibold italic">
                (Issued under Rule 55 of CGST Rules, 2017 &mdash; Not a Tax Invoice)
              </p>
            ) : company.isCompositionScheme ? (
              <p className="text-[10px] text-slate-600 font-semibold italic">
                Composition taxable person, not eligible to collect tax on supplies
              </p>
            ) : isGst ? (
              <p className="text-[10px] text-slate-600 font-medium">
                (Issued under Section 31 of CGST Act, 2017 read with Rule 46 of CGST Rules, 2017)
              </p>
            ) : null}
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
                  {isDeliveryChallan ? 'Challan Number' : 'Invoice Number'}
                </span>
                <span className="font-mono font-black text-sm text-slate-950">
                  {invoice.invoiceNumber}
                </span>
              </div>
              <div className="pl-2">
                <span className="text-[9px] text-slate-600 uppercase font-black block tracking-wider">
                  {isDeliveryChallan ? 'Challan Date' : 'Invoice Date'}
                </span>
                <span className="font-bold text-xs text-slate-950">
                  {formatDate(invoice.date)}
                </span>
              </div>
            </div>

            {isDeliveryChallan ? (
              <div className="grid grid-cols-2 divide-x divide-slate-800 p-2">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase font-bold block">
                    Purpose of Supply (Rule 55)
                  </span>
                  <span className="font-bold text-slate-950 text-[11px]">
                    {challanPurpose || 'For removal'}
                  </span>
                </div>
                <div className="pl-2">
                  <span className="text-[9px] text-slate-500 uppercase font-bold block">
                    Challan Status
                  </span>
                  <span className="font-bold text-indigo-700 text-[11px] uppercase">
                    {invoice.challanStatus || 'DELIVERED'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 divide-x divide-slate-800 p-2">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase font-bold block">
                    Payment Mode / Terms
                  </span>
                  <span className="font-semibold text-slate-900 uppercase">
                    {invoice.paymentMode === 'SPLIT' ? 'Split Payment' : invoice.paymentMode} ({invoice.paymentStatus})
                  </span>
                  {((invoice.paymentSplits && invoice.paymentSplits.length > 1) || (invoice.notes && invoice.notes.includes('Split'))) && (
                    <span className="text-[10px] text-slate-600 block mt-0.5 normal-case font-medium">
                      {invoice.paymentSplits && invoice.paymentSplits.length > 0
                        ? invoice.paymentSplits
                            .filter((s) => s.mode !== 'CREDIT' && s.amount > 0)
                            .map((s) => `${s.mode === 'CREDIT_NOTE' ? 'Sales Return' : s.mode}: ₹${s.amount.toFixed(2)}`)
                            .join(' • ')
                        : invoice.notes?.replace('Split Payment — ', '')}
                    </span>
                  )}
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
            )}

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
                <span className="text-slate-700 font-medium">
                  {invoice.vehicleNumber
                    ? `Vehicle: ${invoice.vehicleNumber}`
                    : invoice.ewayBillNumber
                    ? `E-Way: ${invoice.ewayBillNumber}`
                    : 'As per order'}
                </span>
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
            <div className="font-black text-slate-950 text-sm mt-1">{invoice.consigneeName || invoice.partyName}</div>
            {invoice.consigneeName && invoice.partyName && invoice.consigneeName !== invoice.partyName && (
              <div className="text-[10px] text-slate-500 font-medium">(Party: {invoice.partyName})</div>
            )}
            <div className="text-slate-700 text-xs mt-0.5 leading-snug">
              {invoice.shippingAddress || invoice.partyAddress || 'Same as Billed Address / Local Counter'}
              {invoice.shippingPincode ? ` - ${invoice.shippingPincode}` : ''}
            </div>
            {(invoice.transporterName || invoice.ewayBillNumber) && (
              <div className="mt-1 pt-1 border-t border-dashed border-slate-300 text-[10px] text-slate-700">
                {invoice.transporterName && (
                  <div>
                    <strong className="text-slate-900">Transporter:</strong> {invoice.transporterName}
                    {invoice.transporterId ? ` (${invoice.transporterId})` : ''}
                  </div>
                )}
                {invoice.ewayBillNumber && (
                  <div>
                    <strong className="text-slate-900">E-Way Bill:</strong>{' '}
                    <span className="font-mono font-bold text-slate-900">{invoice.ewayBillNumber}</span>
                  </div>
                )}
              </div>
            )}
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

            {a4Settings.showPartyBalance && party && (
              <div className="mt-2 pt-1 border-t border-slate-200 text-xs flex items-center justify-between">
                <span className="text-slate-600 font-semibold uppercase text-[10px]">
                  Total Party Balance:
                </span>
                <span
                  className={`font-black font-tabular-data ${
                    party.currentBalance > 0
                      ? 'text-rose-700'
                      : party.currentBalance < 0
                      ? 'text-emerald-700'
                      : 'text-slate-800'
                  }`}
                >
                  {formatINR(Math.abs(party.currentBalance))}{' '}
                  {party.currentBalance > 0
                    ? '(Dr - Due)'
                    : party.currentBalance < 0
                    ? '(Cr - Advance)'
                    : ''}
                </span>
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
                <th className="py-2 px-3 border-r border-slate-400 min-w-[180px]">
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
                {isGst && !company.isCompositionScheme && (
                  <th className="py-2 px-2.5 text-right w-24 border-r border-slate-400">
                    Taxable Value (₹)
                  </th>
                )}
                {isGst && !company.isCompositionScheme && (
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
                    <span className="font-bold text-slate-950 block text-xs break-words">{line.name}</span>
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
                    {formatQuantity(line.quantity, 4)}
                  </td>
                  <td className="py-2 px-2 text-center uppercase text-slate-600 border-r border-slate-300 text-xs">
                    {line.unit || 'PCS'}
                  </td>
                  <td className="py-2 px-2.5 text-right font-medium text-slate-900 border-r border-slate-300 font-tabular-data text-xs">
                    {line.unitPrice.toFixed(2)}
                    {isGst && !company.isCompositionScheme && (
                      <span className="text-[10px] text-slate-500 block font-normal">
                        Incl. {line.unitPriceInclusive.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-300 font-tabular-data text-xs">
                    {line.discountPercent > 0 ? `${line.discountPercent}%` : '-'}
                  </td>
                  {isGst && !company.isCompositionScheme && (
                    <td className="py-2 px-2.5 text-right font-semibold text-slate-900 border-r border-slate-300 font-tabular-data text-xs">
                      {line.taxableAmount.toFixed(2)}
                    </td>
                  )}
                  {isGst && !company.isCompositionScheme && (
                    <td className="py-2 px-2 text-center text-slate-800 border-r border-slate-300 font-tabular-data text-xs">
                      {line.gstRate}%
                      {line.cessRate > 0 && (
                        <span className="text-[10px] text-slate-500 block font-normal">
                          CESS {line.cessRate}%
                        </span>
                      )}
                    </td>
                  )}
                  <td className="py-2 px-3 text-right font-bold text-slate-950 font-tabular-data text-xs">
                    {line.totalAmount.toFixed(2)}
                  </td>
                </tr>
              ))}

              {/* Tax Ledger Rows (Tally Output CGST, SGST, IGST) */}
              {isGst && !company.isCompositionScheme && invoice.isIntraState && (
                <>
                  <tr className="bg-slate-50/40">
                    <td className="border-r border-slate-300"></td>
                    <td
                      colSpan={8}
                      className="py-1.5 px-3 font-bold text-slate-800 border-r border-slate-300 text-right"
                    >
                      Central GST (CGST) Output
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-tabular-data">
                      {totalCgst.toFixed(2)}
                    </td>
                  </tr>
                  {totalUtgst > 0 ? (
                    <tr className="bg-slate-50/40">
                      <td className="border-r border-slate-300"></td>
                      <td
                        colSpan={8}
                        className="py-1.5 px-3 font-bold text-slate-800 border-r border-slate-300 text-right"
                      >
                        Union Territory GST (UTGST) Output
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-tabular-data">
                        {totalUtgst.toFixed(2)}
                      </td>
                    </tr>
                  ) : (
                    <tr className="bg-slate-50/40">
                      <td className="border-r border-slate-300"></td>
                      <td
                        colSpan={8}
                        className="py-1.5 px-3 font-bold text-slate-800 border-r border-slate-300 text-right"
                      >
                        State GST (SGST) Output
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-tabular-data">
                        {totalSgst.toFixed(2)}
                      </td>
                    </tr>
                  )}
                </>
              )}

              {isGst && !company.isCompositionScheme && !invoice.isIntraState && (
                <tr className="bg-slate-50/40">
                  <td className="border-r border-slate-300"></td>
                  <td
                    colSpan={8}
                    className="py-1.5 px-3 font-bold text-slate-800 border-r border-slate-300 text-right"
                  >
                    Integrated GST (IGST) Output
                  </td>
                  <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-tabular-data">
                    {totalIgst.toFixed(2)}
                  </td>
                </tr>
              )}

              {isGst && !company.isCompositionScheme && totalCess > 0 && (
                <tr className="bg-slate-50/40">
                  <td className="border-r border-slate-300"></td>
                  <td
                    colSpan={8}
                    className="py-1.5 px-3 font-bold text-slate-800 border-r border-slate-300 text-right"
                  >
                    CESS Output
                  </td>
                  <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-tabular-data">
                    {totalCess.toFixed(2)}
                  </td>
                </tr>
              )}

              {Boolean(invoice.roundOff && invoice.roundOff !== 0) && (
                <tr className="bg-slate-50/40">
                  <td className="border-r border-slate-300"></td>
                  <td
                    colSpan={isGst ? (company.isCompositionScheme ? 6 : 8) : 6}
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
                    colSpan={isGst ? (company.isCompositionScheme ? 6 : 8) : 6}
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
                {isGst && !company.isCompositionScheme && (
                  <td className="py-2.5 px-2.5 text-right border-r border-slate-400 text-slate-950 font-tabular-data font-black">
                    {totalTaxable.toFixed(2)}
                  </td>
                )}
                {isGst && !company.isCompositionScheme && <td className="border-r border-slate-400"></td>}
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
          {!company.isCompositionScheme && (
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Total Tax Amount:
              </span>
              <span className="font-black text-xs text-slate-900">
                {formatINR(resolvedTotalTax)}
              </span>
            </div>
          )}
        </div>

        {/* HSN/SAC TAX BREAKDOWN TABLE (Standard Tally Format) */}
        {isGst && !company.isCompositionScheme && (
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
                {isDeliveryChallan ? 'Statutory Transport Notice' : "Company's Bank Details"}
              </div>
              {isDeliveryChallan ? (
                <div className="text-xs space-y-0.5 text-slate-800">
                  <p className="font-medium">
                    Goods are transported under <strong>Rule 55 of CGST Rules, 2017</strong> for the purpose of <strong>{challanPurpose || 'removal'}</strong>. This document is a delivery challan and does not constitute a demand for payment.
                  </p>
                </div>
              ) : company.bankName ? (
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
              {!isDeliveryChallan && company.upiId && (
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
              {!isDeliveryChallan && upiQrUrl && (
                <div className="p-1 bg-white border border-slate-300 rounded text-center shadow-xs">
                  <img src={upiQrUrl} alt="UPI QR" className="w-20 h-20 block" />
                  <span className="text-[9px] font-black text-emerald-700 block mt-0.5 tracking-tight uppercase">
                    Scan to Pay
                  </span>
                </div>
              )}

              <div className="text-right">
                {!isDeliveryChallan && invoice.balanceAmount > 0 && (
                  <div className="mb-2">
                    <span className="text-[10px] uppercase font-bold text-rose-600 block">
                      Balance Due
                    </span>
                    <span className="font-extrabold text-sm text-rose-700 font-tabular-data">
                      {formatINR(invoice.balanceAmount)}
                    </span>
                  </div>
                )}
                {!isDeliveryChallan ? (
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
                ) : (
                  <div className="text-[11px] text-slate-600 font-medium">
                    Challan Status:{' '}
                    <span className="font-bold text-indigo-700 uppercase">
                      {invoice.challanStatus || 'DELIVERED'}
                    </span>
                  </div>
                )}
                {!isDeliveryChallan && a4Settings.showPartyBalance && party && (
                  <div className="mt-2 pt-1 border-t border-slate-300">
                    <span className="text-[10px] uppercase font-bold text-slate-600 block">
                      Total Party Balance
                    </span>
                    <span
                      className={`font-black text-xs font-tabular-data ${
                        party.currentBalance > 0
                          ? 'text-rose-700'
                          : party.currentBalance < 0
                          ? 'text-emerald-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {formatINR(Math.abs(party.currentBalance))}{' '}
                      {party.currentBalance > 0
                        ? '(Dr)'
                        : party.currentBalance < 0
                        ? '(Cr)'
                        : ''}
                    </span>
                  </div>
                )}
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
    </div>
  );
};
