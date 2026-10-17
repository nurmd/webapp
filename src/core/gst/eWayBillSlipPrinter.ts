import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../utils/formatters.ts';
import { formatEWayDate, EWayBillTransportOptions } from './eWayBillExport.ts';

export interface EWayBillSlipData {
  company: CompanyProfile;
  invoice: Invoice;
  transportOptions?: EWayBillTransportOptions;
}

export function generateEWayBillSlipHtml(
  company: CompanyProfile,
  invoice: Invoice,
  transportOptions: EWayBillTransportOptions = {}
): string {
  const companyName = company.tradeName || company.businessName || 'Consignor Enterprise';
  const companyGstin = company.gstin || 'Unregistered';
  const fromAddr = company.address || 'Registered Office Address';
  const fromState = company.stateCode || '';

  const toPartyName = invoice.partyName || 'Consignee Name';
  const toGstin = invoice.partyGstin || 'URP';
  const toAddr = invoice.shippingAddress || invoice.partyAddress || 'Delivery Address';
  const toState = invoice.partyStateCode || invoice.placeOfSupplyStateCode || '';

  const vehNo = transportOptions.vehicleNumber || invoice.vehicleNumber || '—';
  const transId = transportOptions.transporterId || invoice.transporterId || '—';
  const transName = transportOptions.transporterName || invoice.transporterName || 'Self / Own Transport';
  const distanceKm = transportOptions.transDistance || invoice.transportDistance || 50;

  const modeLabels: Record<string, string> = {
    '1': 'Road',
    '2': 'Rail',
    '3': 'Air',
    '4': 'Ship',
  };
  const modeText = modeLabels[transportOptions.transMode || invoice.transportMode || '1'] || 'Road';
  const vehType = (transportOptions.vehicleType || invoice.vehicleType || 'R') === 'O' ? 'Over Dimensional' : 'Regular';

  // Validity calculation: 1 day per 200 km (standard GST Rule 138(10))
  const validityDays = Math.max(1, Math.ceil(distanceKm / 200));

  const itemsHtml = (invoice.items || [])
    .map(
      (item, idx) => `
    <tr style="border-bottom: 1px solid #e5e7eb; font-size: 11px;">
      <td style="padding: 6px 8px; text-align: center;">${idx + 1}</td>
      <td style="padding: 6px 8px; font-weight: 600;">${item.name}</td>
      <td style="padding: 6px 8px; text-align: center;">${item.hsnSacCode || '—'}</td>
      <td style="padding: 6px 8px; text-align: center;">${item.quantity} ${item.unit || 'PCS'}</td>
      <td style="padding: 6px 8px; text-align: right;">${formatINR(item.taxableAmount)}</td>
      <td style="padding: 6px 8px; text-align: center;">${item.gstRate}%</td>
      <td style="padding: 6px 8px; text-align: right;">${formatINR((item.cgstAmount || 0) + (item.sgstAmount || 0) + (item.igstAmount || 0) + (item.cessAmount || 0))}</td>
      <td style="padding: 6px 8px; text-align: right; font-weight: 700;">${formatINR(item.totalAmount)}</td>
    </tr>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>E-Way Bill Slip - ${invoice.invoiceNumber}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 15px;
            color: #111827;
            background: #fff;
            line-height: 1.35;
          }
          .title-bar {
            text-align: center;
            border-bottom: 2px solid #111827;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .main-heading {
            font-size: 16px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0;
          }
          .sub-heading {
            font-size: 11px;
            color: #4b5563;
            margin-top: 2px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            border: 1px solid #111827;
            margin-bottom: 12px;
            font-size: 11px;
          }
          .meta-cell {
            padding: 6px 10px;
            border-bottom: 1px solid #e5e7eb;
          }
          .meta-cell:nth-child(odd) {
            border-right: 1px solid #111827;
          }
          .section-banner {
            background: #111827;
            color: #ffffff;
            font-size: 11px;
            font-weight: 800;
            padding: 4px 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 10px;
          }
          .detail-box {
            border: 1px solid #111827;
            border-top: none;
            padding: 8px 10px;
            font-size: 11px;
            margin-bottom: 10px;
          }
          .parties-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
          }
          th {
            background: #f3f4f6;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 6px 8px;
            border-top: 1px solid #111827;
            border-bottom: 1px solid #111827;
          }
          .totals-bar {
            display: flex;
            justify-content: flex-end;
            gap: 20px;
            padding: 8px 10px;
            font-size: 11px;
            font-weight: 700;
            background: #f9fafb;
            border: 1px solid #111827;
            border-top: none;
          }
          .sign-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 30px;
            font-size: 11px;
          }
          .sign-box {
            text-align: center;
            border-top: 1px dashed #4b5563;
            padding-top: 6px;
          }
          @media print {
            .no-print {
              display: none !important;
            }
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 15px; display: flex; justify-content: flex-end; gap: 10px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #006c49; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            Print E-Way Slip
          </button>
          <button onclick="window.close()" style="padding: 8px 16px; background: #e5e7eb; color: #111827; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            Close
          </button>
        </div>

        <div class="title-bar">
          <h1 class="main-heading">E-Way Bill Transit Accompanying Slip</h1>
          <div class="sub-heading">Rule 138 of Central Goods and Services Tax Rules, 2017</div>
        </div>

        <div class="meta-grid">
          <div class="meta-cell">
            <strong>E-Way Bill Status:</strong> ${invoice.ewayBillNumber ? `Generated (#${invoice.ewayBillNumber})` : 'Draft Accompanying Slip'}
          </div>
          <div class="meta-cell">
            <strong>Generated Date:</strong> ${formatEWayDate(invoice.date)}
          </div>
          <div class="meta-cell">
            <strong>Invoice / Doc No:</strong> ${invoice.invoiceNumber}
          </div>
          <div class="meta-cell">
            <strong>Approx Distance:</strong> ${distanceKm} KM (Validity: ~${validityDays} Day${validityDays > 1 ? 's' : ''})
          </div>
        </div>

        <!-- PART A: Details of Goods & Counterparties -->
        <div class="section-banner">PART-A: Details of Goods &amp; Counterparties</div>
        <div class="detail-box">
          <div class="parties-grid">
            <div>
              <div style="font-weight: 800; font-size: 12px; margin-bottom: 3px;">CONSIGNOR (FROM):</div>
              <div style="font-weight: 700;">${companyName}</div>
              <div>GSTIN: <strong>${companyGstin}</strong></div>
              <div>Address: ${fromAddr}</div>
              <div>State Code: ${fromState}</div>
            </div>
            <div>
              <div style="font-weight: 800; font-size: 12px; margin-bottom: 3px;">CONSIGNEE (TO):</div>
              <div style="font-weight: 700;">${toPartyName}</div>
              <div>GSTIN: <strong>${toGstin}</strong></div>
              <div>Delivery Address: ${toAddr}</div>
              <div>State Code: ${toState}</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">#</th>
              <th style="text-align: left;">Product Description</th>
              <th style="width: 70px; text-align: center;">HSN</th>
              <th style="width: 70px; text-align: center;">Qty</th>
              <th style="width: 85px; text-align: right;">Taxable (₹)</th>
              <th style="width: 50px; text-align: center;">Rate</th>
              <th style="width: 75px; text-align: right;">Tax (₹)</th>
              <th style="width: 90px; text-align: right;">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals-bar">
          <div>Taxable: ${formatINR(invoice.totalTaxableAmount)}</div>
          <div>Total Tax: ${formatINR(typeof invoice.totalTax === 'number' ? invoice.totalTax : ((invoice.totalCgst || 0) + (invoice.totalSgst || 0) + (invoice.totalIgst || 0) + (invoice.totalCess || 0)))}</div>
          <div style="font-size: 12px; font-weight: 900;">Total Invoice Value: ${formatINR(invoice.grandTotal)}</div>
        </div>

        <!-- PART B: Vehicle & Transporter Details -->
        <div class="section-banner">PART-B: Vehicle &amp; Transport Details</div>
        <div class="detail-box">
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
            <div>
              <strong>Mode of Transport:</strong><br />
              ${modeText}
            </div>
            <div>
              <strong>Vehicle Number:</strong><br />
              <span style="font-family: monospace; font-size: 13px; font-weight: 800;">${vehNo}</span>
            </div>
            <div>
              <strong>Vehicle Type:</strong><br />
              ${vehType}
            </div>
            <div>
              <strong>Transporter ID:</strong><br />
              ${transId}
            </div>
            <div>
              <strong>Transporter Name:</strong><br />
              ${transName}
            </div>
            <div>
              <strong>Trans Doc / GR No:</strong><br />
              ${transportOptions.transDocNo || invoice.transDocNo || '—'}
            </div>
          </div>
        </div>

        <div style="font-size: 10px; color: #4b5563; margin-top: 15px;">
          * Statutory Declaration: Goods are in transit accompanied by this document pursuant to Rule 138 of CGST Rules, 2017.
        </div>

        <div class="sign-grid">
          <div class="sign-box">
            Signature of Transporter / Driver
          </div>
          <div class="sign-box">
            Authorised Signatory for ${companyName}
          </div>
        </div>
      </body>
    </html>
  `;
}

export function printEWayBillSlip(
  company: CompanyProfile,
  invoice: Invoice,
  transportOptions: EWayBillTransportOptions = {}
): void {
  const html = generateEWayBillSlipHtml(company, invoice, transportOptions);

  try {
    const printWindow = window.open('', '_blank');
    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      return;
    }
  } catch (err) {
    console.warn('Popup blocked, attempting iframe print:', err);
  }

  // Fallback iframe
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
      doc.write(html);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          if (typeof iframe.contentWindow?.print === 'function') {
            iframe.contentWindow.print();
          } else if (typeof window !== 'undefined' && typeof window.print === 'function') {
            window.print();
          }
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 3000);
        }
      }, 300);
    }
  } catch (e) {
    if (typeof window !== 'undefined' && window.print) {
      window.print();
    }
  }
}
