import{R as $,j as e}from"./vendor-react-BmrtlWLx.js";import{y as A,K as n,a as r,a7 as l,f as I,C as D,a8 as B}from"./index-C77IhLVt.js";import{PurchaseDocumentModal as O}from"./PurchaseDocumentModal-DHHzHhrl.js";import{D as G,a as L}from"./DocumentTaxSummary-DxknDkOo.js";import{R as z}from"./ReturnItemPickerModal-e7mv2eI9.js";import"./vendor-capacitor-BjPRKokX.js";import"./vendor-pouchdb-cVEZlOt_.js";import"./vendor-icons-CclsefSr.js";import"./pricing-zI0ToCXQ.js";function H(t,a){const d=n(t.tradeName||t.businessName||"Business Enterprise"),u=n(t.address||""),c=n(t.phone||""),h=n(t.gstin||""),f=a.purchaseType==="CHALLAN",y=a.purchaseType==="PO",g=a.purchaseType==="RETURN",s=f?"DELIVERY CHALLAN / GRN":y?"PURCHASE ORDER":g?"PURCHASE RETURN / DEBIT NOTE":"PURCHASE BILL",p=n(a.billNumber||a.id),x=n(a.supplierName||"Cash Supplier"),b=n(a.supplierAddress||""),v=n(a.supplierGstin||""),m=a.notes?n(a.notes):"",N=(a.items||[]).map((o,j)=>`
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 7px 6px; text-align: center; color: #64748b;">${j+1}</td>
      <td style="padding: 7px 8px; font-weight: 600; color: #0f172a;">${n(o.name)}</td>
      <td style="padding: 7px 6px; text-align: center; color: #475569;">${n(o.hsnSacCode||"—")}</td>
      <td style="padding: 7px 6px; text-align: center; font-weight: 600;">${o.quantity} ${n(o.unit||"")}</td>
      <td style="padding: 7px 8px; text-align: right;">${r(l(o,"unitPrice"))}</td>
      <td style="padding: 7px 8px; text-align: right;">${r(o.taxableAmount)}</td>
      <td style="padding: 7px 6px; text-align: center;">${o.gstRate||0}%</td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 700; color: #0f172a;">${r(l(o,"totalAmount"))}</td>
    </tr>
  `).join("");return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${s} - #${p}</title>
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
      <div class="company-title">${d}</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
        ${h?`<div>GSTIN: ${h}</div>`:""}
        ${u?`<div>${u}</div>`:""}
        ${c?`<div>Phone: ${c}</div>`:""}
      </div>
    </div>
    <div>
      <div class="doc-badge">${s}</div>
      <div style="font-size: 12px; font-weight: 700; color: #0f172a; text-align: right; margin-top: 2px;">
        #${p}
      </div>
      <div style="font-size: 11px; color: #64748b; text-align: right; margin-top: 2px;">
        Date: ${I(a.date)}
      </div>
    </div>
  </div>

  <div class="meta-box">
    <div class="card">
      <div class="card-title">Supplier Details</div>
      <div style="font-weight: 700; font-size: 12px; color: #0f172a;">${x}</div>
      ${v?`<div>GSTIN: ${v}</div>`:""}
      ${b?`<div>${b}</div>`:""}
    </div>
    <div class="card">
      <div class="card-title">Billing & Payment Summary</div>
      <div><strong>Status:</strong> ${a.paymentStatus||"UNPAID"}</div>
      <div><strong>Mode:</strong> ${a.paymentMode||"CASH"}</div>
      ${l(a,"paidAmount")>0?`<div><strong>Paid:</strong> ${r(l(a,"paidAmount"))}</div>`:""}
      <div><strong>Balance Due:</strong> ${r(l(a,"balanceAmount",0))}</div>
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
      ${N||'<tr><td colspan="8" style="text-align: center; padding: 15px; color: #94a3b8;">No items listed</td></tr>'}
    </tbody>
  </table>

  <div class="totals-area">
    <table class="totals-table">
      <tr>
        <td style="color: #64748b;">Taxable Total:</td>
        <td style="text-align: right; font-weight: 600;">${r(l(a,"totalTaxableAmount")||a.totalGrossAmount)}</td>
      </tr>
      ${a.totalTax?`<tr><td style="color: #64748b;">Total GST:</td><td style="text-align: right; font-weight: 600;">${r(a.totalTax)}</td></tr>`:""}
      ${l(a,"roundOff")?`<tr><td style="color: #64748b;">Round Off:</td><td style="text-align: right;">${r(l(a,"roundOff"))}</td></tr>`:""}
      <tr class="grand-total-row">
        <td>Grand Total:</td>
        <td style="text-align: right;">${r(l(a,"grandTotal"))}</td>
      </tr>
    </table>
  </div>

  ${m?`<div class="notes-box"><strong>Notes / Terms:</strong> ${m}</div>`:""}

  <div class="signatures">
    <div class="sig-line">Supplier Signature</div>
    <div class="sig-line">For ${d}</div>
  </div>

  <div class="footer">
    Generated automatically by Vyapar Books PRO Inward Logistics Engine
  </div>
</body>
</html>`}function _(t,a){const d=H(t,a);A(d,`Purchase-${a.billNumber||a.id}`,"A4")}const J=({bill:t,company:a,onClose:d,onEditPurchase:u,onDeletePurchase:c})=>{var T;const[h,f]=$.useState(!1),[y,g]=$.useState(!1);if(!t)return null;const s=t.purchaseType==="CHALLAN",p=t.purchaseType==="PO",x=t.purchaseType==="RETURN",b=t.paymentStatus==="PAID",v=t.paymentStatus==="PARTIAL",m=a.isGstEnabled!==!1,N=()=>{c&&f(!0)},o=s?`Challan #${t.billNumber}`:p?`PO #${t.billNumber}`:x?`Debit Note #${t.billNumber}`:`Bill #${t.billNumber}`,j=s?"move_to_inbox":p?"add_shopping_cart":x?"assignment_turned_in":"shopping_bag",S=s?"bg-teal-500/15 text-teal-600 dark:text-teal-400":p?"bg-indigo-500/15 text-indigo-600 dark:text-indigo-400":x?"bg-amber-500/15 text-amber-600 dark:text-amber-400":"bg-orange-500/15 text-orange-600 dark:text-orange-400",C=e.jsxs("div",{className:"flex items-center gap-1.5 min-w-0 flex-nowrap overflow-x-auto no-scrollbar py-0.5",children:[e.jsx("h3",{className:"font-bold text-sm text-on-surface truncate min-w-0 shrink-0",children:o}),s?e.jsx("span",{className:"text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 whitespace-nowrap shrink-0",children:t.isConverted?"CONVERTED":t.challanStatus||"RECEIVED"}):e.jsx("span",{className:`text-[9px] font-bold px-1.5 py-0.2 rounded-full whitespace-nowrap shrink-0 ${b?"bg-secondary/15 text-secondary":v?"bg-amber-500/15 text-amber-600 dark:text-amber-400":"bg-error/15 text-error"}`,children:t.paymentStatus})]}),P=()=>{const i=`Purchase-${t.billNumber||t.id}`;B(i)||_(a,t)},R=c?e.jsx("button",{type:"button",onClick:N,className:"w-8 h-8 rounded-xl bg-error/15 text-error hover:bg-error/25 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors",title:s?"Delete Purchase Challan":"Delete Purchase Bill","aria-label":"Delete purchase",children:e.jsx("span",{className:"material-symbols-outlined text-[18px]",children:"delete"})}):e.jsx("div",{className:`w-8 h-8 rounded-xl ${S} flex items-center justify-center flex-shrink-0`,children:e.jsx("span",{className:"material-symbols-outlined text-[18px]",children:j})}),k=u&&(!t.isConverted||p)?e.jsxs("button",{type:"button","data-testid":"edit-purchase-btn",onClick:()=>{d(),u(t)},className:"py-1 px-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all",title:s?"Edit Purchase Challan":"Edit Purchase Bill",children:[e.jsx("span",{className:"material-symbols-outlined text-[16px]",children:"edit"}),e.jsx("span",{children:s?"Edit Challan":p?"Edit PO":"Edit Bill"})]}):void 0,E=e.jsxs("div",{className:"flex items-center justify-end gap-2",children:[e.jsxs("button",{type:"button",onClick:P,className:"min-h-[40px] py-2 px-3.5 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-container active:scale-95 transition-all cursor-pointer",title:s?"Print Purchase Challan":"Print Purchase Bill",children:[e.jsx("span",{className:"material-symbols-outlined text-[16px]",children:"print"}),e.jsx("span",{children:"Print"})]}),!x&&!t.isCancelled&&e.jsxs("button",{type:"button","data-testid":"create-purchase-return-btn",onClick:()=>g(!0),className:"min-h-[40px] py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all",title:"Return items from this bill (Debit Note)",children:[e.jsx("span",{className:"material-symbols-outlined text-[16px]",children:"assignment_turned_in"}),e.jsx("span",{children:"Return Items"})]})]});return e.jsxs(e.Fragment,{children:[e.jsxs(O,{isOpen:!!t,onClose:d,title:C,headerLeading:R,headerTrailing:k,closeAriaLabel:"Close purchase details",maxWidth:"xl",customFooter:E,backNavPriority:25,children:[m&&e.jsxs("div",{className:"flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-low/70 py-1.5 px-2.5 rounded-xl",children:[e.jsxs("span",{children:["GSTIN: ",e.jsx("strong",{className:"font-mono text-on-surface",children:t.supplierGstin||"Unregistered"})]}),e.jsxs("span",{children:["ITC: ",e.jsx("strong",{className:"text-on-surface",children:t.itcEligibility==="INELIGIBLE_17_5"||t.itcEligibility==="INELIGIBLE_OTHERS"?"Blocked":"Eligible"})]})]}),e.jsx("div",{"data-testid":"purchase-preview-items-scroll",className:"max-h-[45vh] overflow-y-auto overscroll-contain -mx-0.5 px-0.5 [scrollbar-width:thin] border-t border-b border-outline-variant/20",children:e.jsx(G,{mode:"compact",kind:"purchase",rows:t.items,isGstActive:m,isCompositionScheme:a.isCompositionScheme})}),e.jsx(L,{variant:"compact",title:"Total Bill Value",totalTaxableAmount:t.totalTaxableAmount,totalTax:t.totalTax,totalCess:t.totalCess,finalGrandTotal:t.grandTotal,isGstActive:m,isCompositionScheme:a.isCompositionScheme,accentColor:"orange"}),s?e.jsxs("div",{className:"flex flex-col gap-1 px-3 py-1.5 rounded-xl bg-teal-500/10 text-xs border border-teal-500/20",children:[e.jsxs("div",{className:"flex items-center justify-between text-teal-800 dark:text-teal-300",children:[e.jsxs("span",{className:"text-[11px] font-semibold flex items-center gap-1",children:[e.jsx("span",{className:"material-symbols-outlined text-[14px]",children:"inventory"}),"Goods Receipt Note (GRN):"]}),e.jsx("span",{className:"text-[11px] font-bold",children:t.isConverted?`Converted to Bill #${t.convertedToBillNumber}`:"Inward Stock Recorded"})]}),(t.vehicleNumber||t.transporterName||t.lrNumber||t.ewayBillNumber)&&e.jsxs("div",{className:"flex flex-wrap gap-2 pt-1 border-t border-teal-500/20 text-[10px] text-teal-700 dark:text-teal-300 font-medium",children:[t.vehicleNumber&&e.jsxs("span",{children:["Vehicle: ",t.vehicleNumber]}),t.transporterName&&e.jsxs("span",{children:["Transporter: ",t.transporterName]}),t.lrNumber&&e.jsxs("span",{children:["LR #: ",t.lrNumber]}),t.ewayBillNumber&&e.jsxs("span",{children:["E-Way: ",t.ewayBillNumber]})]})]}):e.jsxs("div",{className:"flex flex-col gap-1 px-3 py-1.5 rounded-xl bg-surface-container text-xs",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("span",{className:"text-[11px] text-on-surface-variant font-medium",children:["Payment (",t.paymentMode==="SPLIT"?"Split Tender":t.paymentMode||"Cash","):"]}),e.jsx("span",{className:"text-[11px] font-bold",children:t.balanceAmount<=.01?e.jsxs("span",{className:"text-secondary flex items-center gap-1 font-bold",children:[e.jsx("span",{className:"material-symbols-outlined text-[15px]",children:"check_circle"}),"Fully Settled"]}):e.jsxs("span",{className:"text-on-surface",children:["Paid: ",e.jsx("span",{className:"text-secondary",children:r(t.paidAmount)})," • Due:"," ",e.jsx("span",{className:"text-error",children:r(t.balanceAmount)})]})})]}),(t.paymentSplits&&t.paymentSplits.length>1||t.notes&&t.notes.includes("Split"))&&e.jsx("div",{className:"flex flex-wrap gap-1.5 pt-0.5 border-t border-outline-variant/15 text-[10px]",children:t.paymentSplits&&t.paymentSplits.length>0?t.paymentSplits.filter(i=>i.mode!=="CREDIT"&&i.amount>0).map((i,w)=>e.jsxs("span",{className:"px-1.5 py-0.5 rounded bg-surface-container-high font-semibold text-on-surface-variant",children:[i.mode==="CREDIT_NOTE"?"Sales Return":i.mode,": ",r(i.amount)]},w)):(((T=t.notes)==null?void 0:T.replace("Split Payment — ",""))||"").split(", ").map((i,w)=>e.jsx("span",{className:"px-1.5 py-0.5 rounded bg-surface-container-high font-semibold text-on-surface-variant",children:i},w))})]})]}),h&&e.jsx(D,{isOpen:h,title:"Delete Purchase Bill?",recordName:`Bill #${t.billNumber}`,description:"Are you sure you want to delete this purchase bill? This will revert any stock added by this bill.",confirmText:"Delete Purchase",onConfirm:()=>{c==null||c(t.id),d()},onClose:()=>f(!1)}),y&&e.jsx(z,{isOpen:y,onClose:()=>g(!1),sourceDocument:t,documentType:"PURCHASE",company:a,onSuccess:()=>{g(!1),d()}})]})};export{J as SimplifiedPurchaseModal};
