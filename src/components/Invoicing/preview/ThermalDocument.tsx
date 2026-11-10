import React from 'react';
import { formatDate, formatQuantity } from '../../../core/utils/formatters.ts';
import { InvoicePreviewModel, InvoiceCopyType } from './useInvoicePreviewModel.ts';

export interface ThermalDocumentProps {
  model: InvoicePreviewModel;
  thermalWidth: 32 | 48;
  copyType: InvoiceCopyType;
}

export const ThermalDocument: React.FC<ThermalDocumentProps> = ({
  model,
  thermalWidth,
  copyType: _copyType,
}) => {
  const {
    company,
    isGst,
    invoice,
    isDeliveryChallan,
    challanPurpose,
    itemsList,
    totalTaxable,
    totalCgst,
    totalUtgst,
    totalSgst,
    totalIgst,
    totalCess,
    resolvedGrandTotal,
    upiQrUrl,
    posStateObj,
  } = model;

  return (
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
              {invoice.invoiceType === 'DELIVERY_CHALLAN'
                ? 'DELIVERY CHALLAN'
                : company.isCompositionScheme
                ? 'BILL OF SUPPLY'
                : isGst
                ? 'TAX INVOICE'
                : 'RETAIL INVOICE'}
            </span>
          </div>
        </div>

        {/* Dashed Divider */}
        <div className="border-b border-dashed border-slate-400 my-1" />

        {/* Metadata Row */}
        <div className="text-[10px] space-y-0.5 leading-tight">
          <div className="flex justify-between items-center">
            <span><strong className="text-slate-800">{isDeliveryChallan ? 'Challan:' : 'Bill:'}</strong> {invoice.invoiceNumber}</span>
            <span className="text-slate-700">{formatDate(invoice.date)}</span>
          </div>
          {invoice.partyName && (
            <div className="truncate">
              <strong className="text-slate-800">Party:</strong> {invoice.partyName}
            </div>
          )}
          {isDeliveryChallan && challanPurpose && (
            <div>
              <strong className="text-slate-800">Purpose:</strong> {challanPurpose}
            </div>
          )}
          {isDeliveryChallan && invoice.vehicleNumber && (
            <div>
              <strong className="text-slate-800">Vehicle:</strong> {invoice.vehicleNumber}
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
                  {isGst && !company.isCompositionScheme && item.cessRate > 0 && (
                    <span className="text-[8px] text-slate-500 block">
                      CESS {item.cessRate}%
                    </span>
                  )}
                </td>
                <td className="py-0.5 text-center font-medium text-slate-800">
                  {formatQuantity(item.quantity, 4)}
                </td>
                <td className="py-0.5 text-right font-medium text-slate-800">
                  <div>{item.unitPrice.toFixed(0)}</div>
                  {isGst && !company.isCompositionScheme && (
                    <div className="text-[8px] text-slate-500">
                      Incl. {item.unitPriceInclusive.toFixed(0)}
                    </div>
                  )}
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
            <span className="text-slate-600">{company.isCompositionScheme ? 'Subtotal:' : isGst ? 'Subtotal (Taxable):' : 'Subtotal:'}</span>
            <span className="font-medium text-slate-900">₹{totalTaxable.toFixed(2)}</span>
          </div>

          {invoice.totalDiscount > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Discount:</span>
              <span>-₹{invoice.totalDiscount.toFixed(2)}</span>
            </div>
          )}

          {!company.isCompositionScheme && (
            <>
              {totalCgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>CGST:</span>
                  <span>₹{totalCgst.toFixed(2)}</span>
                </div>
              )}

              {totalUtgst > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <span>UTGST:</span>
                  <span>₹{totalUtgst.toFixed(2)}</span>
                </div>
              ) : totalSgst > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <span>SGST:</span>
                  <span>₹{totalSgst.toFixed(2)}</span>
                </div>
              ) : null}

              {totalIgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>IGST:</span>
                  <span>₹{totalIgst.toFixed(2)}</span>
                </div>
              )}

              {totalCess > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>CESS:</span>
                  <span>₹{totalCess.toFixed(2)}</span>
                </div>
              )}
            </>
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

        {/* Payment Status / Balance Due - Suppressed for Delivery Challans */}
        {!isDeliveryChallan && invoice.balanceAmount > 0 && (
          <div className="flex justify-between items-center text-[10px] text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded">
            <span>Balance Due:</span>
            <span>₹{invoice.balanceAmount.toFixed(2)}</span>
          </div>
        )}

        {/* Dynamic UPI QR Code - Suppressed for Delivery Challans */}
        {!isDeliveryChallan && upiQrUrl && (
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
  );
};
