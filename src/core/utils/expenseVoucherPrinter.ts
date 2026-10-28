import { Expense } from '../../models/expense.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from './formatters.ts';
import { printHtmlDocument, escapeHtml } from './printBridge.ts';

export function generateExpenseVoucherHtml(company: CompanyProfile, exp: Expense): string {
  const companyName = escapeHtml(company.tradeName || company.businessName || 'Business Enterprise');
  const companyAddr = escapeHtml(company.address || '');
  const companyPhone = escapeHtml(company.phone || '');
  const title = escapeHtml(exp.title || 'Expense');
  const category = escapeHtml(exp.category || 'General');
  const voucherNum = escapeHtml(exp.voucherNumber || exp.id);
  const paymentMode = escapeHtml(exp.paymentMode || 'Cash');
  const vendorName = escapeHtml(exp.vendorName || 'Not specified');
  const notes = exp.notes ? escapeHtml(exp.notes) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Expense Voucher #${voucherNum}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
      color: #1e293b;
      max-width: 650px;
      margin: 0 auto;
      background: #ffffff;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .company-name {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
    }
    .voucher-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      margin-top: 4px;
    }
    .company-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .hero {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .amount {
      font-size: 24px;
      font-weight: 800;
      color: #e11d48;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px;
    }
    .label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 4px;
    }
    .val {
      font-weight: 600;
      color: #0f172a;
    }
    .notes {
      font-size: 12px;
      color: #475569;
      font-style: italic;
      margin-top: 12px;
    }
    .footer {
      border-top: 1px dashed #cbd5e1;
      margin-top: 24px;
      padding-top: 12px;
      font-size: 11px;
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
    <div class="company-name">${companyName}</div>
    <div class="voucher-title">Payment / Expense Voucher</div>
    <div class="company-meta">
      ${companyAddr ? `${companyAddr} • ` : ''}${companyPhone ? `Ph: ${companyPhone}` : ''}
    </div>
  </div>

  <div class="hero">
    <div>
      <div class="label">Expense Purpose</div>
      <div style="font-size: 16px; font-weight: 700;">${title}</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Category: ${category}</div>
    </div>
    <div style="text-align: right;">
      <div class="label">Total Paid</div>
      <div class="amount">${formatINR(exp.amount)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div class="label">Voucher Number</div>
      <div class="val">${voucherNum}</div>
    </div>
    <div class="box">
      <div class="label">Date of Payment</div>
      <div class="val">${formatDate(exp.date)}</div>
    </div>
    <div class="box">
      <div class="label">Payment Mode</div>
      <div class="val">${paymentMode}</div>
    </div>
    <div class="box">
      <div class="label">Vendor / Payee</div>
      <div class="val">${vendorName}</div>
    </div>
  </div>

  ${
    exp.taxAmount > 0
      ? `
    <div class="box" style="margin-bottom: 16px;">
      <div class="label">GST Tax Breakdown (${exp.gstRate}% GST)</div>
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
        <span>Taxable Value: <strong>${formatINR(exp.taxableAmount)}</strong></span>
        <span>Total Tax: <strong>${formatINR(exp.taxAmount)}</strong></span>
        <span>ITC Claimable: <strong>${exp.itcEligible ? 'YES' : 'NO'}</strong></span>
      </div>
    </div>
  `
      : ''
  }

  ${notes ? `<div class="notes"><strong>Remarks:</strong> ${notes}</div>` : ''}

  <div style="display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px;">
    <div>Receiver's Signature</div>
    <div>Authorized Signatory</div>
  </div>

  <div class="footer">
    Recorded in Vyapar Books PRO • Computer Generated Voucher
  </div>
</body>
</html>`;
}

export function printExpenseVoucher(company: CompanyProfile, exp: Expense): void {
  const html = generateExpenseVoucherHtml(company, exp);
  printHtmlDocument(html, `Expense-${exp.voucherNumber || exp.id}`, 'A4');
}
