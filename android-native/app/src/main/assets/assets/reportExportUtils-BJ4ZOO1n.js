import{x as h,y as x}from"./index-C77IhLVt.js";function w(t){if(t==null)return"";if(typeof t=="number")return Number.isInteger(t)?String(t):t.toFixed(2);const e=String(t);if(/^-?\d+(\.\d+)?$/.test(e.trim()))return e;const n=["=","+","-","@","	","\r"],a=e.charAt(0);return n.includes(a)?`'${e}`:e}function u(t){const e=w(t);return e.includes(",")||e.includes('"')||e.includes(`
`)||e.includes("\r")?`"${e.replace(/"/g,'""')}"`:e}function y(t,e,n){const a=t.map(u).join(","),d=e.map(p=>p.map(u).join(",")),s=[a,...d];return n&&n.length>0&&s.push(n.map(u).join(",")),"\uFEFF"+s.join(`\r
`)}function B(t,e,n,a){const d=y(e,n,a),s=new Blob([d],{type:"text/csv;charset=utf-8;"}),p=t.endsWith(".csv")?t:`${t}.csv`;if(typeof window<"u"&&typeof document<"u"){const o=URL.createObjectURL(s),r=document.createElement("a");r.href=o,r.setAttribute("download",p),document.body.appendChild(r),r.click(),document.body.removeChild(r),URL.revokeObjectURL(o)}}function v(t){const e=t.orientation||(t.headers.length>7?"landscape":"portrait"),n=t.company,a=t.kpis&&t.kpis.length>0?`
      <div class="kpi-banner">
        ${t.kpis.map(o=>`
          <div class="kpi-card">
            <span class="kpi-label">${o.label}</span>
            <span class="kpi-value">${o.value}</span>
          </div>
        `).join("")}
      </div>
    `:"",d=t.headers.map((o,r)=>{var i;return`<th class="align-${((i=t.columnAlignments)==null?void 0:i[r])||"left"}">${o}</th>`}).join(""),s=t.rows.map((o,r)=>{const l=o.map((i,c)=>{var b;const f=((b=t.columnAlignments)==null?void 0:b[c])||(typeof i=="number"?"right":"left"),g=typeof i=="number"?Number.isInteger(i)?i.toString():i.toFixed(2):i??"";return`<td class="align-${f}">${g}</td>`}).join("");return`<tr class="${r%2===1?"even-row":""}">${l}</tr>`}).join(""),p=t.summaryRow&&t.summaryRow.length>0?`
      <tfoot>
        <tr class="summary-row">
          ${t.summaryRow.map((o,r)=>{var c;const l=((c=t.columnAlignments)==null?void 0:c[r])||(typeof o=="number"?"right":"left"),i=typeof o=="number"?Number.isInteger(o)?o.toString():o.toFixed(2):o??"";return`<td class="align-${l}">${i}</td>`}).join("")}
        </tr>
      </tfoot>
    `:"";return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${t.title} - ${n.tradeName||n.businessName||"Report"}</title>
  <style>
    @page {
      size: A4 ${e};
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 16px;
      color: #1e293b;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.4;
    }
    .no-print {
      margin-bottom: 16px;
      padding: 10px 16px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .no-print button {
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
      border: none;
    }
    .btn-back {
      background: #475569;
      color: #ffffff;
      margin-right: 8px;
    }
    .btn-print {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-close {
      background: #e2e8f0;
      color: #334155;
      margin-left: 8px;
    }
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
    .report-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .company-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .company-meta {
      font-size: 11px;
      color: #475569;
      line-height: 1.5;
    }
    .report-meta {
      text-align: right;
    }
    .report-title {
      font-size: 16px;
      font-weight: 700;
      color: #1e3a8a;
      margin: 0 0 4px 0;
    }
    .period-badge {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
    }
    .kpi-banner {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
    }
    .kpi-label {
      display: block;
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
    }
    .kpi-value {
      display: block;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 10.5px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      white-space: nowrap;
    }
    td {
      border: 1px solid #e2e8f0;
      padding: 5px 8px;
      color: #334155;
    }
    .even-row {
      background: #f8fafc;
    }
    .summary-row td {
      background: #e2e8f0;
      font-weight: 700;
      color: #0f172a;
      border-top: 2px solid #64748b;
      border-bottom: 2px solid #0f172a;
      padding: 6px 8px;
    }
    .align-left { text-align: left; }
    .align-right { text-align: right; }
    .align-center { text-align: center; }
    .report-footer {
      margin-top: 20px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div style="display: flex; align-items: center; gap: 8px;">
      <button class="btn-back" onclick="handleGoBack()" title="Back to reports">← Back</button>
      <span><strong>Print Preview</strong> — Ready for A4 ${e}. Use "Save as PDF" in your print dialog.</span>
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      <button class="btn-close" onclick="handleGoBack()">Close</button>
    </div>
  </div>

  <div class="report-header">
    <div>
      <h1 class="company-title">${n.tradeName||n.businessName||"Business Report"}</h1>
      <div class="company-meta">
        ${n.gstin?`<div><strong>GSTIN:</strong> ${n.gstin}</div>`:""}
        ${n.address?`<div>${n.address}</div>`:""}
        ${n.phone?`<div><strong>Phone:</strong> ${n.phone}</div>`:""}
      </div>
    </div>
    <div class="report-meta">
      <h2 class="report-title">${t.title}</h2>
      ${t.subtitle?`<div style="color: #64748b; margin-bottom: 4px;">${t.subtitle}</div>`:""}
      <span class="period-badge">${t.dateRangeLabel}</span>
    </div>
  </div>

  ${a}

  <table>
    <thead>
      <tr>
        ${d}
      </tr>
    </thead>
    <tbody>
      ${s}
    </tbody>
    ${p}
  </table>

  <div class="report-footer">
    <div>Generated automatically by Vyapar Books PRO Reporting Engine</div>
    <div>Date: ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
  </div>

  <script>
    function handleGoBack() {
      // 1. AndroidBridge native back
      try {
        if (window.AndroidBridge && typeof window.AndroidBridge.goBack === 'function') {
          window.AndroidBridge.goBack();
          return;
        }
      } catch (e) {}

      // 2. Window opened with opener
      try {
        if (window.opener && !window.opener.closed) {
          window.close();
          return;
        }
      } catch (e) {}

      // 3. Browser history back
      if (window.history && window.history.length > 1) {
        window.history.back();
        return;
      }

      // 4. Default window.close fallback
      try {
        window.close();
      } catch (e) {}
    }

    // Android hardware back button integration
    window.__handleAndroidBack = function() {
      handleGoBack();
      return true;
    };

    // Keyboard Escape key support
    window.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        handleGoBack();
      }
    });

    // Browser popstate navigation
    try {
      history.pushState({ reportPreview: true }, '');
      window.addEventListener('popstate', function() {
        handleGoBack();
      });
    } catch (e) {}

    window.onload = function() {
      // Auto-trigger print dialog cleanly
      setTimeout(function() {
        try {
          window.print();
        } catch (e) {
          console.error(e);
        }
      }, 150);
    };
  <\/script>
</body>
</html>`}let m=null;function R(t){m=t}function A(t,e,n="A4"){return h(t,e,n)}function k(t){const e=v(t),a=t.orientation==="landscape"||t.headers.length>7?"A4-landscape":"A4";x(e,t.title,a)}function j(t){if(m){m(t);return}k(t)}export{A as a,k as b,B as e,v as g,j as p,R as r};
