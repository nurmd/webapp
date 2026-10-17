import React, { useState, useMemo, useEffect } from 'react';
import { Party } from '../../../models/party.ts';
import { Invoice } from '../../../models/invoice.ts';
import { PurchaseBill } from '../../../models/purchase.ts';
import { Voucher } from '../../../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../../../models/company.ts';
import { formatINR, formatDate } from '../../../core/utils/formatters.ts';
import {
  computeAgingBreakdown,
  AgingBucket,
  PartyAgingRow,
  AgingBreakdownResult,
} from '../../../core/accounting/aging.ts';
import { exportReportToCsv, printReportDocument, ReportPdfConfig } from '../utils/reportExportUtils.ts';
import { Users, Phone, ArrowUpRight, ArrowDownLeft, FileText } from 'lucide-react';

interface PartyKhataDuesCategoryProps {
  company: CompanyProfile;
  parties: Party[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  vouchers?: Voucher[];
  subReport: string; // 'receivables_aging' | 'payables_aging' | 'party_ledger'
  searchQuery: string;
  dateRangeLabel: string;
  onRegisterExportHandlers?: (handlers: { exportCsv: () => void; exportPdf: () => void }) => void;
}

export const PartyKhataDuesCategory: React.FC<PartyKhataDuesCategoryProps> = ({
  company,
  parties,
  invoices,
  purchases,
  vouchers = [],
  subReport,
  searchQuery,
  dateRangeLabel,
  onRegisterExportHandlers,
}) => {
  const [selectedBucket, setSelectedBucket] = useState<'ALL' | AgingBucket>('ALL');
  const [selectedPartyId, setSelectedPartyId] = useState<string>(() => {
    return parties.length > 0 ? parties[0].id : '';
  });

  const partyPhoneMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parties) {
      if (p.id && p.phone) map.set(p.id, p.phone);
      if (p.name && p.phone) map.set(p.name.toLowerCase(), p.phone);
    }
    return map;
  }, [parties]);

  // 1. Receivables Aging (Customer Dues)
  const receivablesAging: AgingBreakdownResult = useMemo(() => {
    const agingInputs = invoices
      .filter((i) => !i.isCancelled)
      .map((i) => {
        const balance = i.balanceAmount !== undefined ? i.balanceAmount : i.grandTotal - (i.paidAmount || 0);
        return {
          dueDate: i.dueDate,
          date: i.date,
          balanceDue: balance,
          partyId: i.partyId,
          partyName: i.partyName || 'Unknown Customer',
          phone: (i.partyId ? partyPhoneMap.get(i.partyId) : undefined) || (i.partyName ? partyPhoneMap.get(i.partyName.toLowerCase()) : undefined),
        };
      });

    return computeAgingBreakdown(agingInputs);
  }, [invoices, partyPhoneMap]);

  // 2. Payables Aging (Supplier Dues)
  const payablesAging: AgingBreakdownResult = useMemo(() => {
    const agingInputs = purchases
      .filter((p) => !p.isCancelled)
      .map((p) => {
        const balance = p.balanceAmount !== undefined ? p.balanceAmount : p.grandTotal - (p.paidAmount || 0);
        return {
          dueDate: p.dueDate,
          date: p.date,
          balanceDue: balance,
          partyId: p.supplierId,
          partyName: p.supplierName || 'Unknown Supplier',
          phone: (p.supplierId ? partyPhoneMap.get(p.supplierId) : undefined) || (p.supplierName ? partyPhoneMap.get(p.supplierName.toLowerCase()) : undefined),
        };
      });

    return computeAgingBreakdown(agingInputs);
  }, [purchases, partyPhoneMap]);

  // Filter aging party rows by selected bucket and search query
  const q = searchQuery.toLowerCase().trim();

  const filteredReceivablesParties = useMemo(() => {
    let list = receivablesAging.parties;
    if (selectedBucket !== 'ALL') {
      list = list.filter((p) => (p.brackets[selectedBucket] || 0) > 0.01);
    }
    if (q) {
      list = list.filter(
        (p) =>
          p.partyName.toLowerCase().includes(q) ||
          (p.phone && p.phone.toLowerCase().includes(q))
      );
    }
    return list;
  }, [receivablesAging.parties, selectedBucket, q]);

  const filteredPayablesParties = useMemo(() => {
    let list = payablesAging.parties;
    if (selectedBucket !== 'ALL') {
      list = list.filter((p) => (p.brackets[selectedBucket] || 0) > 0.01);
    }
    if (q) {
      list = list.filter(
        (p) =>
          p.partyName.toLowerCase().includes(q) ||
          (p.phone && p.phone.toLowerCase().includes(q))
      );
    }
    return list;
  }, [payablesAging.parties, selectedBucket, q]);

  // 3. Selected Party Ledger Statement / Passbook
  const activeParty = useMemo(() => {
    return parties.find((p) => p.id === selectedPartyId) || parties[0];
  }, [parties, selectedPartyId]);

  const partyPassbookEntries = useMemo(() => {
    if (!activeParty) return [];

    const isCustomer = activeParty.type === 'CUSTOMER';
    const entries: Array<{
      date: string;
      docNumber: string;
      type: string;
      narration: string;
      debit: number;
      credit: number;
      runningBalance: number;
    }> = [];

    // Opening Balance
    const openBal = Math.abs(activeParty.openingBalance || 0);
    let currentBal = 0;

    if (openBal > 0) {
      const isReceivable = activeParty.openingBalanceType === 'TO_RECEIVE';
      const dr = isReceivable ? openBal : 0;
      const cr = isReceivable ? 0 : openBal;
      currentBal = isCustomer ? dr - cr : cr - dr;

      entries.push({
        date: activeParty.openingBalanceDate || activeParty.createdAt?.split('T')[0] || 'Opening',
        docNumber: 'OPENING',
        type: 'Opening Balance',
        narration: `Initial balance brought forward (${activeParty.openingBalanceType || 'TO_RECEIVE'})`,
        debit: dr,
        credit: cr,
        runningBalance: currentBal,
      });
    }

    // Party Invoices
    const pInvoices = invoices.filter(
      (inv) =>
        !inv.isCancelled &&
        (inv.partyId === activeParty.id || (inv.partyName && inv.partyName.toLowerCase() === activeParty.name.toLowerCase()))
    );

    // Party Purchases
    const pPurchases = purchases.filter(
      (pur) =>
        !pur.isCancelled &&
        (pur.supplierId === activeParty.id || (pur.supplierName && pur.supplierName.toLowerCase() === activeParty.name.toLowerCase()))
    );

    // Collect all transactions chronologically
    const allEvents: Array<{
      date: string;
      docNumber: string;
      type: string;
      narration: string;
      debit: number;
      credit: number;
    }> = [];

    for (const inv of pInvoices) {
      // For sales: Invoicing debits customer
      allEvents.push({
        date: inv.date,
        docNumber: inv.invoiceNumber,
        type: 'Sale Invoice',
        narration: `Sales Bill #${inv.invoiceNumber} (${inv.items?.length || 0} items)`,
        debit: inv.grandTotal,
        credit: 0,
      });

      // If invoice was paid/partially paid at billing
      if (inv.paidAmount && inv.paidAmount > 0) {
        allEvents.push({
          date: inv.date,
          docNumber: `RCPT-${inv.invoiceNumber}`,
          type: 'Payment Received',
          narration: `Payment for #${inv.invoiceNumber} (${inv.paymentMode || 'CASH'})`,
          debit: 0,
          credit: inv.paidAmount,
        });
      }
    }

    for (const pur of pPurchases) {
      // For purchases: Purchase credits supplier
      allEvents.push({
        date: pur.date,
        docNumber: pur.billNumber,
        type: 'Purchase Bill',
        narration: `Purchase Bill #${pur.billNumber}`,
        debit: 0,
        credit: pur.grandTotal,
      });

      if (pur.paidAmount && pur.paidAmount > 0) {
        allEvents.push({
          date: pur.date,
          docNumber: `PMT-${pur.billNumber}`,
          type: 'Payment Made',
          narration: `Payment for bill #${pur.billNumber}`,
          debit: pur.paidAmount,
          credit: 0,
        });
      }
    }

    // Sort transactions by date ascending
    allEvents.sort((a, b) => a.date.localeCompare(b.date));

    for (const ev of allEvents) {
      if (isCustomer) {
        currentBal = currentBal + ev.debit - ev.credit;
      } else {
        currentBal = currentBal + ev.credit - ev.debit;
      }

      entries.push({
        ...ev,
        runningBalance: Math.round(currentBal * 100) / 100,
      });
    }

    // Filter by search query if applicable
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.docNumber.toLowerCase().includes(q) ||
        e.narration.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q)
    );
  }, [activeParty, invoices, purchases, q]);

  // Export handlers
  const handleExportCsv = () => {
    if (subReport === 'party_ledger') {
      const headers = ['Date', 'Document #', 'Voucher Type', 'Particulars / Narration', 'Debit (INR)', 'Credit (INR)', 'Running Balance (INR)'];
      const rows = partyPassbookEntries.map((e) => [
        e.date,
        e.docNumber,
        e.type,
        e.narration,
        e.debit,
        e.credit,
        e.runningBalance,
      ]);
      const totalDr = partyPassbookEntries.reduce((s, e) => s + e.debit, 0);
      const totalCr = partyPassbookEntries.reduce((s, e) => s + e.credit, 0);
      exportReportToCsv(`Party_Ledger_${activeParty?.name || 'Party'}_${Date.now()}`, headers, rows, [
        'TOTAL',
        '',
        '',
        '',
        totalDr,
        totalCr,
        activeParty?.currentBalance || 0,
      ]);
    } else {
      const isRec = subReport === 'receivables_aging';
      const agingData = isRec ? receivablesAging : payablesAging;
      const partyList = isRec ? filteredReceivablesParties : filteredPayablesParties;

      const headers = ['Party Name', 'Phone', 'Total Outstanding (INR)', '0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'];
      const rows = partyList.map((p) => [
        p.partyName,
        p.phone || '-',
        p.totalOutstanding,
        p.brackets['0-30'],
        p.brackets['31-60'],
        p.brackets['61-90'],
        p.brackets['90+'],
      ]);

      exportReportToCsv(
        `${isRec ? 'Receivables' : 'Payables'}_Aging_${Date.now()}`,
        headers,
        rows,
        [
          'TOTAL',
          '',
          agingData.totalOutstanding,
          agingData.summary['0-30'],
          agingData.summary['31-60'],
          agingData.summary['61-90'],
          agingData.summary['90+'],
        ]
      );
    }
  };

  const handleExportPdf = () => {
    if (subReport === 'party_ledger') {
      const totalDr = partyPassbookEntries.reduce((s, e) => s + e.debit, 0);
      const totalCr = partyPassbookEntries.reduce((s, e) => s + e.credit, 0);

      const config: ReportPdfConfig = {
        title: `Party Ledger Statement - ${activeParty?.name || 'Party'}`,
        subtitle: `Type: ${activeParty?.type} | Phone: ${activeParty?.phone || 'N/A'} | GSTIN: ${activeParty?.gstin || 'Unregistered'}`,
        company,
        dateRangeLabel,
        orientation: 'portrait',
        kpis: [
          { label: 'Total Billed (Dr)', value: formatINR(totalDr) },
          { label: 'Total Received (Cr)', value: formatINR(totalCr) },
          { label: 'Closing Balance', value: `${formatINR(Math.abs(activeParty?.currentBalance || 0))} ${activeParty?.currentBalance && activeParty.currentBalance > 0 ? 'Dr' : 'Cr'}` },
        ],
        headers: ['Date', 'Doc #', 'Type', 'Particulars', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)'],
        rows: partyPassbookEntries.map((e) => [
          formatDate(e.date),
          e.docNumber,
          e.type,
          e.narration,
          e.debit,
          e.credit,
          e.runningBalance,
        ]),
        summaryRow: ['TOTAL', '', '', '', totalDr, totalCr, activeParty?.currentBalance || 0],
      };
      printReportDocument(config);
    } else {
      const isRec = subReport === 'receivables_aging';
      const agingData = isRec ? receivablesAging : payablesAging;
      const partyList = isRec ? filteredReceivablesParties : filteredPayablesParties;

      const config: ReportPdfConfig = {
        title: `${isRec ? 'Customer Receivables' : 'Supplier Payables'} Aging Report`,
        subtitle: `Overdue Aging Buckets Breakdown (As of ${new Date().toLocaleDateString('en-IN')})`,
        company,
        dateRangeLabel,
        orientation: 'landscape',
        kpis: [
          { label: 'Total Outstanding', value: formatINR(agingData.totalOutstanding) },
          { label: '0-30 Days', value: formatINR(agingData.summary['0-30']) },
          { label: '31-60 Days', value: formatINR(agingData.summary['31-60']) },
          { label: '90+ Days Critical', value: formatINR(agingData.summary['90+']) },
        ],
        headers: ['Party Name', 'Phone', 'Total Due (₹)', '0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'],
        rows: partyList.map((p) => [
          p.partyName,
          p.phone || '-',
          p.totalOutstanding,
          p.brackets['0-30'],
          p.brackets['31-60'],
          p.brackets['61-90'],
          p.brackets['90+'],
        ]),
        summaryRow: [
          'TOTAL',
          '',
          agingData.totalOutstanding,
          agingData.summary['0-30'],
          agingData.summary['31-60'],
          agingData.summary['61-90'],
          agingData.summary['90+'],
        ],
      };
      printReportDocument(config);
    }
  };

  useEffect(() => {
    if (onRegisterExportHandlers) {
      onRegisterExportHandlers({
        exportCsv: handleExportCsv,
        exportPdf: handleExportPdf,
      });
    }
  }, [subReport, filteredReceivablesParties, filteredPayablesParties, partyPassbookEntries, activeParty]);

  const agingBucketsList: Array<{ id: 'ALL' | AgingBucket; label: string }> = [
    { id: 'ALL', label: 'All Overdue' },
    { id: '0-30', label: '0-30 Days' },
    { id: '31-60', label: '31-60 Days' },
    { id: '61-90', label: '61-90 Days' },
    { id: '90+', label: '90+ Days Critical' },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Receivables & Payables Aging Views */}
      {(subReport === 'receivables_aging' || subReport === 'payables_aging') && (
        <div className="space-y-4">
          {/* Aging Bucket Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar bg-surface p-2.5 rounded-xl border border-outline-variant/30">
            {agingBucketsList.map((b) => {
              const isSelected = selectedBucket === b.id;
              const isRec = subReport === 'receivables_aging';
              const bucketSum = b.id === 'ALL'
                ? (isRec ? receivablesAging.totalOutstanding : payablesAging.totalOutstanding)
                : (isRec ? receivablesAging.summary[b.id] : payablesAging.summary[b.id]);

              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBucket(b.id)}
                  aria-label={`Filter by ${b.label}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] flex items-center gap-2 ${
                    isSelected
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                  }`}
                >
                  <span>{b.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isSelected
                        ? 'bg-on-primary/20 text-on-primary'
                        : 'bg-surface-container-highest text-on-surface-variant'
                    }`}
                  >
                    {formatINR(bucketSum)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Aging Table */}
          <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
                  <tr>
                    <th className="p-3">Party Name</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3 text-right">Total Outstanding (₹)</th>
                    <th className="p-3 text-right">0-30 Days</th>
                    <th className="p-3 text-right">31-60 Days</th>
                    <th className="p-3 text-right">61-90 Days</th>
                    <th className="p-3 text-right text-rose-700 dark:text-rose-400">90+ Days Critical</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {(() => {
                    const partyList = subReport === 'receivables_aging' ? filteredReceivablesParties : filteredPayablesParties;
                    if (partyList.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                            No parties found with overdue dues in this category.
                          </td>
                        </tr>
                      );
                    }
                    return partyList.map((p, idx) => (
                      <tr key={idx} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-3 font-semibold text-on-surface">{p.partyName}</td>
                        <td className="p-3 font-mono text-on-surface-variant">{p.phone || '-'}</td>
                        <td className="p-3 text-right font-bold text-primary">{formatINR(p.totalOutstanding)}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(p.brackets['0-30'])}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(p.brackets['31-60'])}</td>
                        <td className="p-3 text-right text-on-surface-variant">{formatINR(p.brackets['61-90'])}</td>
                        <td className="p-3 text-right font-bold text-rose-700 dark:text-rose-400">{formatINR(p.brackets['90+'])}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
                <tfoot className="bg-surface-container-high font-bold border-t border-outline-variant/50">
                  {(() => {
                    const isRec = subReport === 'receivables_aging';
                    const agingData = isRec ? receivablesAging : payablesAging;
                    return (
                      <tr>
                        <td colSpan={2} className="p-3">TOTAL OUTSTANDING</td>
                        <td className="p-3 text-right text-primary">{formatINR(agingData.totalOutstanding)}</td>
                        <td className="p-3 text-right">{formatINR(agingData.summary['0-30'])}</td>
                        <td className="p-3 text-right">{formatINR(agingData.summary['31-60'])}</td>
                        <td className="p-3 text-right">{formatINR(agingData.summary['61-90'])}</td>
                        <td className="p-3 text-right text-rose-700 dark:text-rose-400">{formatINR(agingData.summary['90+'])}</td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Party Ledger Statements (Passbook View) */}
      {subReport === 'party_ledger' && (
        <div className="space-y-4">
          {/* Party Selector Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-outline-variant/30">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="party-select" className="text-xs font-semibold text-on-surface-variant whitespace-nowrap">
                Select Party:
              </label>
              <select
                id="party-select"
                aria-label="Select Party for ledger statement"
                value={selectedPartyId}
                onChange={(e) => setSelectedPartyId(e.target.value)}
                className="w-full sm:w-64 py-1.5 px-3 bg-surface-container-high rounded-lg text-xs font-medium border border-outline-variant/60 focus:outline-hidden focus:ring-1 focus:ring-primary min-h-[38px]"
              >
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type === 'CUSTOMER' ? 'Customer' : 'Supplier'}) - Bal: {formatINR(Math.abs(p.currentBalance || 0))}
                  </option>
                ))}
              </select>
            </div>

            {activeParty && (
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-on-surface-variant">Type: </span>
                  <span className="font-semibold text-on-surface">{activeParty.type}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant">Live Balance: </span>
                  <span
                    className={`font-bold ${
                      (activeParty.currentBalance || 0) > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : (activeParty.currentBalance || 0) < 0
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    {formatINR(Math.abs(activeParty.currentBalance || 0))} {(activeParty.currentBalance || 0) > 0 ? 'Dr (Receivable)' : (activeParty.currentBalance || 0) < 0 ? 'Cr (Advance)' : 'Settled'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Passbook Table */}
          <div className="bg-surface rounded-xl border border-outline-variant/40 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-container-high text-on-surface font-semibold border-b border-outline-variant/50">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Doc #</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Particulars / Narration</th>
                    <th className="p-3 text-right">Debit (₹)</th>
                    <th className="p-3 text-right">Credit (₹)</th>
                    <th className="p-3 text-right">Running Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {partyPassbookEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                        No transactions recorded for {activeParty?.name || 'this party'}.
                      </td>
                    </tr>
                  ) : (
                    partyPassbookEntries.map((e, idx) => {
                      const isDr = e.runningBalance > 0;
                      return (
                        <tr key={idx} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="p-3 text-on-surface-variant whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="p-3 font-semibold text-primary">{e.docNumber}</td>
                          <td className="p-3 font-medium text-on-surface">{e.type}</td>
                          <td className="p-3 text-on-surface-variant max-w-xs truncate">{e.narration}</td>
                          <td className="p-3 text-right font-medium">{e.debit > 0 ? formatINR(e.debit) : '-'}</td>
                          <td className="p-3 text-right font-medium">{e.credit > 0 ? formatINR(e.credit) : '-'}</td>
                          <td className={`p-3 text-right font-bold ${isDr ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                            {formatINR(Math.abs(e.runningBalance))} {isDr ? 'Dr' : 'Cr'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {partyPassbookEntries.length > 0 && (
                  <tfoot className="bg-surface-container-high font-bold border-t border-outline-variant/50">
                    <tr>
                      <td colSpan={4} className="p-3">STATEMENT TOTALS</td>
                      <td className="p-3 text-right">{formatINR(partyPassbookEntries.reduce((s, e) => s + e.debit, 0))}</td>
                      <td className="p-3 text-right">{formatINR(partyPassbookEntries.reduce((s, e) => s + e.credit, 0))}</td>
                      <td className="p-3 text-right text-primary">
                        {formatINR(Math.abs(activeParty?.currentBalance || 0))} {(activeParty?.currentBalance || 0) > 0 ? 'Dr' : 'Cr'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
