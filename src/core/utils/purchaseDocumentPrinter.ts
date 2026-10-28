import { PurchaseBill, PurchaseItemEntry } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from './formatters.ts';
import { printHtmlDocument, escapeHtml } from './printBridge.ts';

export function generatePurchaseBillHtml(company: CompanyProfile, bill: PurchaseBill): string {
  const companyName = escapeHtml(company.tradeName || company.businessName || 'Business Enterprise');
  const companyAddr = escapeHtml(company.address || '');
  const companyPhone = escapeHtml(company.phone || '');
  const companyGstin = escapeHtml(company.gstin || '');

  const isChallan = bill.purchaseType === 'CHALLAN';
  const isPO = bill.purchaseType === 'PO';
  const isReturn = bill.purchaseType === 'RETURN';

  const docTitle = isChallan
    ? 'DELIVERY CHALLAN / GRN'
    : isPO
    ? 'PURCHASE ORDER'
    : isReturn
    ? 'PURCHASE RETURN / DEBIT NOTE'
    : 'PURCHASE BILL';

  const docNumber = escapeHtml(bill.billNumber || bill.id);
  const supplierName = escapeHtml(bill.supplierName || 'Cash Supplier');
  const supplierAddr = escapeHtml(bill.supplierAddress || '');
  const supplierGstin = escapeHtml(bill.supplierGstin || '');
  const notes = bill.notes ? escapeHtml(bill.notes) : '';

  const itemsHtml = (bill.items || [])
    .map(
      (item: PurchaseItemEntry, idx: number) => `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 7px 6px; text-align: center; color: #64748b;">${idx + 1}</td>
      <td style="padding: 7px 8px; font-weight: 600; color: #0f172a;">${escapeHtml(item.name)}</td>
      <td style="padding: 7px 6px; text-align: center; color: #475569;">${escapeHtml(item.hsnSacCode || '—')}</td>
      <td style="padding: 7px 6px; text-align: center; font-weight: 600;">${item.quantity} ${escapeHtml(item.unit || '')}</td>
      <td style="padding: 7px 8px; text-align: right;">${formatINR(item.unitPrice)}</td>
      <td style="padding: 7px 8px; text-align: right;">${formatINR(item.taxableAmount)}</td>
      <td style="padding: 7px 6px; text-align: center;">${item.gstRate || 0}%</td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 700; color: #0f172a;">${formatINR(item.totalAmount)}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${docTitle} - #${docNumber}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 20px;
      color: #1e293b;
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      line-height: 1.4;
      font-size: 11px;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .company-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
    }
    .doc-badge {
      font-size: 15px;
      font-weight: 800;
      color: #ea580c;
      text-align: right;
      text-transform: uppercase;
    }
    .meta-box {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
      font-size: 11.5px;
    }
    .card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .card-title {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 10.5px;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      border-top: 1px solid #cbd5e1;
      border-bottom: 2px solid #0f172a;
      padding: 6px 8px;
    }
    tfoot td {
      background: #f8fafc;
      font-weight: 700;
      border-top: 1px solid #cbd5e1;
      padding: 6px 8px;
    }
    .totals-area {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
    }
    .totals-table {
      width: 280px;
      font-size: 11px;
    }
    .totals-table td {
      padding: 3px 6px;
    }
    .grand-total-row td {
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      padding: 6px;
    }
    .notes-box {
      margin-top: 14px;
      padding: 8px 10px;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 11px;
      color: #475569;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 45px;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
    }
    .sig-line {
      border-top: 1px dashed #94a3b8;
      padding-top: 5px;
      width: 170px;
      text-align: center;
    }
    .footer {
      border-top: 1px dashed #cbd5e1;
      margin-top: 24px;
      padding-top: 8px;
      font-size: 9.5px;
      text-align: center;
      color: #94a3b8;
    }
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 10px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Print / Save as PDF</button>
    <button onclick="window.close()" style="padding: 8px 16px; background: #e2e8f0; color: #0f172a; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Close</button>
  </div>
  <div class="header">
    <div>
      <div class="company-title">${companyName}</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
        ${companyGstin ? `<div>GSTIN: ${companyGstin}</div>` : ''}
        ${companyAddr ? `<div>${companyAddr}</div>` : ''}
        ${companyPhone ? `<div>Phone: ${companyPhone}</div>` : ''}
      </div>
    </div>
    <div>
      <div class="doc-badge">${docTitle}</div>
      <div style="font-size: 12px; font-weight: 700; color: #0f172a; text-align: right; margin-top: 2px;">
        #${docNumber}
      </div>
      <div style="font-size: 11px; color: #64748b; text-align: right; margin-top: 2px;">
        Date: ${formatDate(bill.date)}
      </div>
    </div>
  </div>

  <div class="meta-box">
    <div class="card">
      <div class="card-title">Supplier Details</div>
      <div style="font-weight: 700; font-size: 12px; color: #0f172a;">${supplierName}</div>
      ${supplierGstin ? `<div>GSTIN: ${supplierGstin}</div>` : ''}
      ${supplierAddr ? `<div>${supplierAddr}</div>` : ''}
    </div>
    <div class="card">
      <div class="card-title">Billing & Payment Summary</div>
      <div><strong>Status:</strong> ${bill.paymentStatus || 'UNPAID'}</div>
      <div><strong>Mode:</strong> ${bill.paymentMode || 'CASH'}</div>
      ${bill.paidAmount > 0 ? `<div><strong>Paid:</strong> ${formatINR(bill.paidAmount)}</div>` : ''}
      <div><strong>Balance Due:</strong> ${formatINR(bill.balanceAmount || 0)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px; text-align: center;">#</th>
        <th style="text-align: left;">Item Description</th>
        <th style="width: 70px; text-align: center;">HSN</th>
        <th style="width: 70px; text-align: center;">Qty</th>
        <th style="width: 85px; text-align: right;">Rate</th>
        <th style="width: 90px; text-align: right;">Taxable</th>
        <th style="width: 55px; text-align: center;">GST</th>
        <th style="width: 95px; text-align: right;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml || '<tr><td colspan="8" style="text-align: center; padding: 15px; color: #94a3b8;">No items listed</td></tr>'}
    </tbody>
  </table>

  <div class="totals-area">
    <table class="totals-table">
      <tr>
        <td style="color: #64748b;">Taxable Total:</td>
        <td style="text-align: right; font-weight: 600;">${formatINR(bill.totalTaxableAmount || bill.totalGrossAmount)}</td>
      </tr>
      ${bill.totalTax ? `<tr><td style="color: #64748b;">Total GST:</td><td style="text-align: right; font-weight: 600;">${formatINR(bill.totalTax)}</td></tr>` : ''}
      ${bill.roundOff ? `<tr><td style="color: #64748b;">Round Off:</td><td style="text-align: right;">${formatINR(bill.roundOff)}</td></tr>` : ''}
      <tr class="grand-total-row">
        <td>Grand Total:</td>
        <td style="text-align: right;">${formatINR(bill.grandTotal)}</td>
      </tr>
    </table>
  </div>

  ${notes ? `<div class="notes-box"><strong>Notes / Terms:</strong> ${notes}</div>` : ''}

  <div class="signatures">
    <div class="sig-line">Supplier Signature</div>
    <div class="sig-line">For ${companyName}</div>
  </div>

  <div class="footer">
    Generated automatically by Vyapar Books PRO Inward Logistics Engine
  </div>
</body>
</html>`;
}

export function printPurchaseBill(company: CompanyProfile, bill: PurchaseBill): void {
  const html = generatePurchaseBillHtml(company, bill);
  printHtmlDocument(html, `Purchase-${bill.billNumber || bill.id}`, 'A4');
}
