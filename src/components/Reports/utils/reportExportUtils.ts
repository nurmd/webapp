import { CompanyProfile } from '../../../models/company.ts';

/**
 * Report Export Utilities: RFC 4180 CSV with UTF-8 BOM and CWE-1236 Formula Sanitization,
 * and Professional A4 Printable PDF Document Generator with iframe fallback.
 */

export interface ReportPdfConfig {
  title: string;
  subtitle?: string;
  company: CompanyProfile;
  dateRangeLabel: string;
  orientation?: 'portrait' | 'landscape';
  kpis?: Array<{ label: string; value: string }>;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  summaryRow?: (string | number | null | undefined)[];
  columnAlignments?: ('left' | 'right' | 'center')[];
}

/**
 * Checks whether a value is a genuine numeric value (number or string representation of a number).
 * Examples of genuine negative numbers: -100, -100.50, "-100", "-100.50"
 */
export function isGenuineNumericValue(val: unknown): boolean {
  if (typeof val === 'number') {
    return !Number.isNaN(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return false;
    return /^-?\d+(\.\d+)?$/.test(trimmed);
  }
  return false;
}

/**
 * Sanitizes a cell string against CWE-1236 (Formula Injection).
 * Cells starting with =, +, -, @, \t, or \r are prepended with a single quote (').
 * Genuine negative numbers (e.g. -100.50 or "-100.50") are preserved without a single quote.
 */
export function sanitizeCsvCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) {
    return '';
  }

  // Preserve genuine numbers (including negative numbers)
  if (typeof cell === 'number') {
    return Number.isInteger(cell) ? String(cell) : cell.toFixed(2);
  }

  const str = String(cell);

  // If string is a valid numeric string (e.g. "-100.50" or "42.00"), preserve without formula quote
  if (/^-?\d+(\.\d+)?$/.test(str.trim())) {
    return str;
  }

  // CWE-1236 dangerous formula trigger characters
  const formulaPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  const firstChar = str.charAt(0);

  if (formulaPrefixes.includes(firstChar)) {
    return `'${str}`;
  }

  return str;
}

/**
 * Encodes a CSV field adhering strictly to RFC 4180:
 * Encloses the field in double quotes if it contains commas, double quotes, or newlines.
 * Escapes embedded double quotes by doubling them ("").
 */
export function formatRfc4180Cell(rawCell: string | number | null | undefined): string {
  const sanitized = sanitizeCsvCell(rawCell);
  const needsQuotes = sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n') || sanitized.includes('\r');

  if (needsQuotes) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Generates raw CSV text content with UTF-8 BOM, sanitized cells, and RFC 4180 escaping.
 */
export function generateCsvContent(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  summaryRow?: (string | number | null | undefined)[]
): string {
  const formattedHeader = headers.map(formatRfc4180Cell).join(',');
  const formattedRows = rows.map((r) => r.map(formatRfc4180Cell).join(','));

  const lines = [formattedHeader, ...formattedRows];

  if (summaryRow && summaryRow.length > 0) {
    lines.push(summaryRow.map(formatRfc4180Cell).join(','));
  }

  // Prepends UTF-8 Byte Order Mark (\uFEFF) for seamless Microsoft Excel Unicode rendering
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 1-Click Excel / CSV Export:
 * Assembles RFC 4180 CSV, prepends \uFEFF UTF-8 BOM, creates Blob, and triggers browser file download.
 */
export function exportReportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  summaryRow?: (string | number | null | undefined)[]
): void {
  const csvText = generateCsvContent(headers, rows, summaryRow);
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });

  const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;

  // Browser download trigger
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', safeFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Generates high-fidelity standalone A4 printable HTML document.
 */
export function generateReportHtml(config: ReportPdfConfig): string {
  const orientation = config.orientation || (config.headers.length > 7 ? 'landscape' : 'portrait');
  const company = config.company;

  const kpisHtml = config.kpis && config.kpis.length > 0
    ? `
      <div class="kpi-banner">
        ${config.kpis
          .map(
            (kpi) => `
          <div class="kpi-card">
            <span class="kpi-label">${kpi.label}</span>
            <span class="kpi-value">${kpi.value}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `
    : '';

  const headersHtml = config.headers
    .map((h, i) => {
      const align = config.columnAlignments?.[i] || 'left';
      return `<th class="align-${align}">${h}</th>`;
    })
    .join('');

  const rowsHtml = config.rows
    .map((row, rowIdx) => {
      const cells = row
        .map((cell, colIdx) => {
          const align = config.columnAlignments?.[colIdx] || (typeof cell === 'number' ? 'right' : 'left');
          const displayVal = typeof cell === 'number' ? (Number.isInteger(cell) ? cell.toString() : cell.toFixed(2)) : (cell ?? '');
          return `<td class="align-${align}">${displayVal}</td>`;
        })
        .join('');
      return `<tr class="${rowIdx % 2 === 1 ? 'even-row' : ''}">${cells}</tr>`;
    })
    .join('');

  const summaryHtml = config.summaryRow && config.summaryRow.length > 0
    ? `
      <tfoot>
        <tr class="summary-row">
          ${config.summaryRow
            .map((cell, colIdx) => {
              const align = config.columnAlignments?.[colIdx] || (typeof cell === 'number' ? 'right' : 'left');
              const displayVal = typeof cell === 'number' ? (Number.isInteger(cell) ? cell.toString() : cell.toFixed(2)) : (cell ?? '');
              return `<td class="align-${align}">${displayVal}</td>`;
            })
            .join('')}
        </tr>
      </tfoot>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${config.title} - ${company.tradeName || company.businessName || 'Report'}</title>
  <style>
    @page {
      size: A4 ${orientation};
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
      <span><strong>Print Preview</strong> — Ready for A4 ${orientation}. Use "Save as PDF" in your print dialog.</span>
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      <button class="btn-close" onclick="handleGoBack()">Close</button>
    </div>
  </div>

  <div class="report-header">
    <div>
      <h1 class="company-title">${company.tradeName || company.businessName || 'Business Report'}</h1>
      <div class="company-meta">
        ${company.gstin ? `<div><strong>GSTIN:</strong> ${company.gstin}</div>` : ''}
        ${company.address ? `<div>${company.address}</div>` : ''}
        ${company.phone ? `<div><strong>Phone:</strong> ${company.phone}</div>` : ''}
      </div>
    </div>
    <div class="report-meta">
      <h2 class="report-title">${config.title}</h2>
      ${config.subtitle ? `<div style="color: #64748b; margin-bottom: 4px;">${config.subtitle}</div>` : ''}
      <span class="period-badge">${config.dateRangeLabel}</span>
    </div>
  </div>

  ${kpisHtml}

  <table>
    <thead>
      <tr>
        ${headersHtml}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    ${summaryHtml}
  </table>

  <div class="report-footer">
    <div>Generated automatically by Vyapar Books PRO Reporting Engine</div>
    <div>Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
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
  </script>
</body>
</html>`;
}

// Global in-app report preview handler delegation
let customReportPreviewHandler: ((config: ReportPdfConfig) => void) | null = null;

export function registerReportPreviewHandler(
  handler: ((config: ReportPdfConfig) => void) | null
): void {
  customReportPreviewHandler = handler;
}

/**
 * Direct printable PDF Generator with fallback to hidden <iframe> if window.open is blocked.
 */
export function printReportDocumentDirect(config: ReportPdfConfig): void {
  const htmlContent = generateReportHtml(config);

  try {
    // Attempt opening a print window
    const printWindow = window.open('', '_blank');

    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      return;
    }
  } catch (err) {
    console.warn('Popup blocked or window.open failed, falling back to hidden iframe:', err);
  }

  // Fallback to hidden iframe
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          if (typeof iframe.contentWindow?.print === 'function') {
            iframe.contentWindow.print();
          } else if (typeof window !== 'undefined' && typeof window.print === 'function') {
            window.print();
          }
        } catch (printErr) {
          console.warn('Iframe print call warning:', printErr);
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 3000);
        }
      }, 300);
    }
  } catch (fallbackErr) {
    console.error('Print iframe fallback failed:', fallbackErr);
    // Last resort: window.print directly
    if (typeof window !== 'undefined' && window.print) {
      window.print();
    }
  }
}

/**
 * Printable PDF Generator: delegates to in-app preview modal if registered, or direct print window.
 */
export function printReportDocument(config: ReportPdfConfig): void {
  if (customReportPreviewHandler) {
    customReportPreviewHandler(config);
    return;
  }
  printReportDocumentDirect(config);
}
