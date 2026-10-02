import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from './formatters.ts';

export interface PrintableLedgerEntry {
  date: string;
  docNumber: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export function printPartyLedgerStatement(
  party: Party,
  company: CompanyProfile,
  entries: PrintableLedgerEntry[],
  periodLabel: string = 'All Time'
) {
  const isCustomer = party.type === 'CUSTOMER';
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const netBalance = party.currentBalance;
  const balanceLabel = isCustomer
    ? netBalance > 0
      ? 'Receivable (Dr)'
      : netBalance < 0
      ? 'Advance (Cr)'
      : 'Settled (Nil)'
    : netBalance < 0
    ? 'Payable (Cr)'
    : netBalance > 0
    ? 'Advance Given (Dr)'
    : 'Settled (Nil)';

  const companyName = company.tradeName || company.businessName || 'Business Enterprise';
  const companyGstin = company.gstin ? `GSTIN: ${company.gstin}` : '';
  const companyAddress = company.address || '';
  const companyPhone = company.phone ? `Phone: ${company.phone}` : '';

  const tableRows = entries
    .map(
      (entry, idx) => `
    <tr style="border-bottom: 1px solid #e5e7eb; font-size: 11px;">
      <td style="padding: 7px 8px; text-align: center; color: #6b7280;">${idx + 1}</td>
      <td style="padding: 7px 8px; white-space: nowrap;">${entry.date}</td>
      <td style="padding: 7px 8px; font-weight: 600;">${entry.docNumber}</td>
      <td style="padding: 7px 8px; color: #374151;">${entry.description || entry.type}</td>
      <td style="padding: 7px 8px; text-align: right; color: ${entry.debit > 0 ? '#b91c1c' : '#9ca3af'}; font-weight: ${
        entry.debit > 0 ? '600' : '400'
      }">
        ${entry.debit > 0 ? formatINR(entry.debit) : '-'}
      </td>
      <td style="padding: 7px 8px; text-align: right; color: ${entry.credit > 0 ? '#047857' : '#9ca3af'}; font-weight: ${
        entry.credit > 0 ? '600' : '400'
      }">
        ${entry.credit > 0 ? formatINR(entry.credit) : '-'}
      </td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 700; color: #111827;">
        ${formatINR(Math.abs(entry.runningBalance))} ${entry.runningBalance >= 0 ? 'Dr' : 'Cr'}
      </td>
    </tr>
  `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Ledger Statement - ${party.name}</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #111827;
            background: #fff;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #1f2937;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .title {
            font-size: 20px;
            font-weight: 800;
            color: #111827;
            margin: 0;
            text-transform: uppercase;
          }
          .badge {
            display: inline-block;
            padding: 3px 8px;
            background: #e5e7eb;
            color: #1f2937;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
            background: #f9fafb;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
            font-size: 11px;
          }
          .metric-cards {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 12px;
            margin-bottom: 16px;
          }
          .metric-card {
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 8px 12px;
            background: #ffffff;
          }
          .metric-card.highlight {
            background: #eff6ff;
            border-color: #93c5fd;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background-color: #f3f4f6;
            color: #374151;
            font-weight: 700;
            font-size: 11px;
            padding: 8px;
            border-bottom: 2px solid #d1d5db;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .footer-sign {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 11px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 8px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #006c49; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            Print / Save as PDF
          </button>
          <button onclick="window.close()" style="padding: 8px 16px; background: #e5e7eb; color: #111; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            Close
          </button>
        </div>

        <div class="header-box">
          <div>
            <h1 class="title">${companyName}</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #4b5563;">${companyAddress}</p>
            <p style="margin: 2px 0 0 0; font-size: 12px; color: #4b5563;">${companyGstin} ${companyPhone ? ' • ' + companyPhone : ''}</p>
          </div>
          <div style="text-align: right;">
            <span class="badge">LEDGER PASSBOOK</span>
            <p style="margin: 6px 0 0 0; font-size: 11px; font-weight: 600; color: #374151;">Statement Period: ${periodLabel}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Date: ${new Date().toLocaleDateString('en-IN')}</p>
          </div>
        </div>

        <div class="info-grid">
          <div>
            <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Party Details</div>
            <div style="font-size: 14px; font-weight: 800; color: #111827; margin-top: 2px;">${party.name}</div>
            <div style="color: #4b5563; margin-top: 2px;">Phone: <strong>${party.phone}</strong></div>
            ${party.gstin ? `<div style="color: #4b5563;">GSTIN: <strong>${party.gstin}</strong></div>` : ''}
            ${party.billingAddress ? `<div style="color: #4b5563;">Address: ${party.billingAddress}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Account Type</div>
            <div style="font-size: 13px; font-weight: 700; color: #111827; margin-top: 2px;">
              ${isCustomer ? 'Customer Account' : 'Supplier / Vendor Account'}
            </div>
            ${
              party.creditLimit
                ? `<div style="color: #4b5563; margin-top: 4px;">Credit Limit: <strong>${formatINR(party.creditLimit)}</strong></div>`
                : ''
            }
            <div style="margin-top: 4px; font-weight: 700; color: ${netBalance > 0 ? '#b91c1c' : '#047857'};">
              Status: ${balanceLabel}
            </div>
          </div>
        </div>

        <div class="metric-cards">
          <div class="metric-card">
            <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Total Billed / Inward (Dr)</div>
            <div style="font-size: 16px; font-weight: 800; color: #111827; margin-top: 2px;">${formatINR(totalDebit)}</div>
          </div>
          <div class="metric-card">
            <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Total Paid / Settled (Cr)</div>
            <div style="font-size: 16px; font-weight: 800; color: #047857; margin-top: 2px;">${formatINR(totalCredit)}</div>
          </div>
          <div class="metric-card highlight">
            <div style="font-size: 10px; font-weight: 700; color: #1e40af; text-transform: uppercase;">Net Outstanding Balance</div>
            <div style="font-size: 16px; font-weight: 800; color: ${netBalance > 0 ? '#b91c1c' : netBalance < 0 ? '#b45309' : '#047857'}; margin-top: 2px;">
              ${formatINR(Math.abs(netBalance))}
              <span style="font-size: 11px; font-weight: 600;">(${balanceLabel})</span>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th style="width: 85px; text-align: left;">Date</th>
              <th style="width: 120px; text-align: left;">Doc / Ref #</th>
              <th style="text-align: left;">Particulars</th>
              <th style="width: 100px; text-align: right;">Debit (₹)</th>
              <th style="width: 100px; text-align: right;">Credit (₹)</th>
              <th style="width: 115px; text-align: right;">Balance (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #9ca3af;">No transactions found in this period.</td></tr>'}
          </tbody>
        </table>

        <div class="footer-sign">
          <div>
            <div style="font-weight: 600; font-size: 11px; color: #374151;">Terms & Verification:</div>
            <div style="font-size: 10px; color: #6b7280; max-width: 380px; margin-top: 2px;">
              This is a computer generated ledger statement. Please review all transactions and inform us of any discrepancies within 7 days.
            </div>
            ${
              company.upiId
                ? `<div style="font-size: 10px; color: #006c49; font-weight: 600; margin-top: 4px;">UPI ID: ${company.upiId}</div>`
                : ''
            }
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; font-weight: 700; color: #111827;">For ${companyName}</div>
            <div style="height: 45px;"></div>
            <div style="border-top: 1px dashed #9ca3af; font-size: 10px; color: #6b7280; padding-top: 4px;">
              Authorized Signatory
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
