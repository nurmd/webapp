import{y as h,K as o,a as n,f as u}from"./index-C77IhLVt.js";function y(i,t){const d=o(i.tradeName||i.businessName||"Business Enterprise"),s=o(i.address||""),p=o(i.phone||""),l=o(i.gstin||""),c=o(t.voucherNumber||t.id),r=o(t.voucherType),g=t.narration?o(t.narration):"",x=t.partyName?o(t.partyName):"",f=(t.entries||[]).map((e,a)=>`
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 7px 8px; text-align: center; color: #64748b;">${a+1}</td>
      <td style="padding: 7px 8px; font-weight: 600; color: #0f172a;">${o(e.accountName)}</td>
      <td style="padding: 7px 8px; text-align: right; color: ${e.debit>0?"#0f172a":"#94a3b8"}; font-weight: ${e.debit>0?"700":"400"};">
        ${e.debit>0?n(e.debit):"—"}
      </td>
      <td style="padding: 7px 8px; text-align: right; color: ${e.credit>0?"#0f172a":"#94a3b8"}; font-weight: ${e.credit>0?"700":"400"};">
        ${e.credit>0?n(e.credit):"—"}
      </td>
    </tr>
  `).join(""),b=(t.entries||[]).reduce((e,a)=>e+(a.debit||0),0),m=(t.entries||[]).reduce((e,a)=>e+(a.credit||0),0);return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Voucher #${c} - ${r}</title>
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
      max-width: 680px;
      margin: 0 auto;
      background: #ffffff;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .company-name {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
    }
    .voucher-title {
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      color: #0284c7;
      text-align: right;
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
      padding: 14px 16px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .amount {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
      font-size: 12px;
    }
    .box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 9px 12px;
    }
    .label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 3px;
    }
    .val {
      font-weight: 600;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 11.5px;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      border-top: 1px solid #cbd5e1;
      border-bottom: 2px solid #94a3b8;
      padding: 7px 8px;
    }
    tfoot td {
      background: #f8fafc;
      font-weight: 800;
      border-top: 2px solid #0f172a;
      border-bottom: 1px solid #cbd5e1;
      padding: 8px;
      color: #0f172a;
    }
    .narration {
      font-size: 11.5px;
      color: #475569;
      font-style: italic;
      margin-top: 14px;
      padding: 10px;
      background: #f8fafc;
      border-radius: 6px;
      border-left: 3px solid #0284c7;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 50px;
      font-size: 11.5px;
      font-weight: 600;
      color: #334155;
    }
    .sig-line {
      border-top: 1px dashed #94a3b8;
      padding-top: 6px;
      width: 180px;
      text-align: center;
    }
    .footer {
      border-top: 1px dashed #cbd5e1;
      margin-top: 30px;
      padding-top: 10px;
      font-size: 10px;
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
      <div class="company-name">${d}</div>
      <div class="company-meta">
        ${l?`<div>GSTIN: ${l}</div>`:""}
        ${s?`<div>${s}</div>`:""}
        ${p?`<div>Phone: ${p}</div>`:""}
      </div>
    </div>
    <div>
      <div class="voucher-title">${r} VOUCHER</div>
      <div style="font-size: 12px; font-weight: 700; color: #475569; text-align: right; margin-top: 2px;">
        #${c}
      </div>
      <div style="font-size: 11px; color: #64748b; text-align: right; margin-top: 2px;">
        Date: ${u(t.date)}
      </div>
    </div>
  </div>

  <div class="hero">
    <div>
      <div class="label">${x?"Party / Account":"Voucher Type"}</div>
      <div style="font-size: 15px; font-weight: 700;">${x||r}</div>
    </div>
    <div style="text-align: right;">
      <div class="label">Total Amount</div>
      <div class="amount">${n(t.totalAmount)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 35px; text-align: center;">#</th>
        <th style="text-align: left;">Account Head / Description</th>
        <th style="width: 130px; text-align: right;">Debit (₹)</th>
        <th style="width: 130px; text-align: right;">Credit (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${f||'<tr><td colspan="4" style="text-align: center; padding: 15px; color: #94a3b8;">No accounting entries</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="text-align: right;">Total</td>
        <td style="text-align: right;">${n(b||t.totalAmount)}</td>
        <td style="text-align: right;">${n(m||t.totalAmount)}</td>
      </tr>
    </tfoot>
  </table>

  ${g?`<div class="narration"><strong>Narration:</strong> ${g}</div>`:""}

  <div class="signatures">
    <div class="sig-line">Prepared / Verified By</div>
    <div class="sig-line">Authorized Signatory</div>
  </div>

  <div class="footer">
    Generated by Vyapar Books PRO • Official Double-Entry Accounting Voucher
  </div>
</body>
</html>`}function $(i,t){const d=y(i,t);h(d,`Voucher-${t.voucherNumber||t.id}`,"A4")}export{$ as p};
