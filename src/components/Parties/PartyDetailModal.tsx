import React, { useState, useMemo } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { printPartyLedgerStatement } from '../../core/utils/ledgerStatementPrinter.ts';

interface PartyDetailModalProps {
  party: Party;
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  vouchers?: Voucher[];
  onClose: () => void;
  onEditParty: (party: Party) => void;
  onDeleteParty?: (id: string) => void;
  onRecordPayment: (party: Party, amount: number, paymentMode: string, notes: string) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onCreateInvoice?: (party: Party) => void;
  onCreatePurchase?: (party: Party) => void;
}

interface PassbookEntry {
  id: string;
  date: string;
  docNumber: string;
  type: 'SALE' | 'PURCHASE' | 'PAYMENT_IN' | 'PAYMENT_OUT' | 'OPENING';
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  paymentMode?: string;
  status?: string;
  rawInvoice?: Invoice;
}

export const PartyDetailModal: React.FC<PartyDetailModalProps> = ({
  party,
  company,
  invoices = [],
  purchases = [],
  vouchers = [],
  onClose,
  onEditParty,
  onDeleteParty,
  onRecordPayment,
  onViewInvoice,
  onCreateInvoice,
  onCreatePurchase,
}) => {
  const [txnFilter, setTxnFilter] = useState<'ALL' | 'BILLS' | 'PAYMENTS'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_30_DAYS'>('ALL');
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<string>(
    party.currentBalance !== 0 ? Math.abs(party.currentBalance).toString() : ''
  );
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  const isCustomer = party.type === 'CUSTOMER';
  const isReceivable = party.currentBalance > 0;
  const isPayable = party.currentBalance < 0;

  // Filter party's sales and purchases
  const partyInvoices = useMemo(() => {
    return invoices.filter(
      (inv) => inv.partyId === party.id || inv.partyName.toLowerCase() === party.name.toLowerCase()
    );
  }, [invoices, party]);

  const partyPurchases = useMemo(() => {
    return purchases.filter(
      (pur) => pur.supplierId === party.id || pur.supplierName.toLowerCase() === party.name.toLowerCase()
    );
  }, [purchases, party]);

  // Aggregate totals
  const totalBilled = useMemo(() => {
    return isCustomer
      ? partyInvoices.reduce((s, inv) => s + inv.grandTotal, 0)
      : partyPurchases.reduce((s, pur) => s + pur.grandTotal, 0);
  }, [isCustomer, partyInvoices, partyPurchases]);

  const totalPaid = useMemo(() => {
    return isCustomer
      ? partyInvoices.reduce((s, inv) => s + inv.paidAmount, 0)
      : partyPurchases.reduce((s, pur) => s + pur.paidAmount, 0);
  }, [isCustomer, partyInvoices, partyPurchases]);

  // Build Chronological Passbook with Running Balance
  const passbook: PassbookEntry[] = useMemo(() => {
    const rawEntries: Omit<PassbookEntry, 'runningBalance'>[] = [];

    // Sales Invoices
    partyInvoices.forEach((inv) => {
      rawEntries.push({
        id: `sale-${inv.id}`,
        date: inv.date,
        docNumber: inv.invoiceNumber,
        type: 'SALE',
        description: `Sale #${inv.invoiceNumber} (${inv.items.length} items)`,
        debit: inv.grandTotal,
        credit: 0,
        status: inv.paymentStatus,
        paymentMode: inv.paymentMode,
        rawInvoice: inv,
      });

      if (inv.paidAmount > 0) {
        rawEntries.push({
          id: `pay-inv-${inv.id}`,
          date: inv.date,
          docNumber: `RCPT-${inv.invoiceNumber}`,
          type: 'PAYMENT_IN',
          description: `Payment received (${inv.paymentMode})`,
          debit: 0,
          credit: inv.paidAmount,
          status: 'PAID',
          paymentMode: inv.paymentMode,
        });
      }
    });

    // Purchase Bills
    partyPurchases.forEach((pur) => {
      rawEntries.push({
        id: `pur-${pur.id}`,
        date: pur.date,
        docNumber: pur.billNumber,
        type: 'PURCHASE',
        description: `Purchase Bill #${pur.billNumber}`,
        debit: 0,
        credit: pur.grandTotal,
        status: pur.paymentStatus,
        paymentMode: pur.paymentMode,
      });

      if (pur.paidAmount > 0) {
        rawEntries.push({
          id: `pay-pur-${pur.id}`,
          date: pur.date,
          docNumber: `PYMT-${pur.billNumber}`,
          type: 'PAYMENT_OUT',
          description: `Payment made to vendor (${pur.paymentMode})`,
          debit: pur.paidAmount,
          credit: 0,
          status: 'PAID',
          paymentMode: pur.paymentMode,
        });
      }
    });

    // Accounting Vouchers (Receipts / Payments)
    vouchers.forEach((v) => {
      const isPartyVoucher = v.entries.some(
        (e) => e.accountId === party.id || e.accountName.toLowerCase() === party.name.toLowerCase()
      );

      if (isPartyVoucher) {
        const isDupe = rawEntries.some(
          (e) => e.docNumber === v.voucherNumber || (v.referenceNo && e.docNumber.includes(v.referenceNo))
        );
        if (!isDupe) {
          if (v.voucherType === 'RECEIPT') {
            rawEntries.push({
              id: `vchr-${v.id}`,
              date: v.date,
              docNumber: v.voucherNumber,
              type: 'PAYMENT_IN',
              description: v.narration || 'Payment received',
              debit: 0,
              credit: v.totalAmount,
              status: 'PAID',
            });
          } else if (v.voucherType === 'PAYMENT') {
            rawEntries.push({
              id: `vchr-${v.id}`,
              date: v.date,
              docNumber: v.voucherNumber,
              type: 'PAYMENT_OUT',
              description: v.narration || 'Payment made',
              debit: v.totalAmount,
              credit: 0,
              status: 'PAID',
            });
          }
        }
      }
    });

    // Opening Balance
    const totalDebits = rawEntries.reduce((s, e) => s + e.debit, 0);
    const totalCredits = rawEntries.reduce((s, e) => s + e.credit, 0);
    const calculatedNet = isCustomer ? totalDebits - totalCredits : totalCredits - totalDebits;
    const openingDifference = party.currentBalance - calculatedNet;

    if (Math.abs(openingDifference) >= 1) {
      const openingDate = party.createdAt ? party.createdAt.split('T')[0] : '2026-01-01';
      rawEntries.push({
        id: `opening-${party.id}`,
        date: openingDate,
        docNumber: 'OPENING',
        type: 'OPENING',
        description: 'Opening Balance',
        debit: openingDifference > 0 ? openingDifference : 0,
        credit: openingDifference < 0 ? Math.abs(openingDifference) : 0,
        status: 'OPENING',
      });
    }

    rawEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    return rawEntries.map((entry) => {
      if (isCustomer) {
        running += entry.debit - entry.credit;
      } else {
        running += entry.credit - entry.debit;
      }
      return { ...entry, runningBalance: running };
    });
  }, [party, partyInvoices, partyPurchases, vouchers, isCustomer]);

  // Filtered passbook list
  const filteredPassbook = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().slice(0, 7); // "YYYY-MM"
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return passbook.filter((entry) => {
      // Type filter
      if (txnFilter === 'BILLS' && entry.type !== 'SALE' && entry.type !== 'PURCHASE') return false;
      if (txnFilter === 'PAYMENTS' && entry.type !== 'PAYMENT_IN' && entry.type !== 'PAYMENT_OUT') return false;

      // Date filter
      if (dateFilter === 'THIS_MONTH') {
        if (!entry.date.startsWith(currentMonthPrefix)) return false;
      } else if (dateFilter === 'LAST_30_DAYS') {
        if (new Date(entry.date) < thirtyDaysAgo) return false;
      }

      return true;
    });
  }, [passbook, txnFilter, dateFilter]);

  const handlePrintStatement = () => {
    const printable = filteredPassbook.map((e) => ({
      date: e.date,
      docNumber: e.docNumber,
      type: e.type,
      description: e.description,
      debit: e.debit,
      credit: e.credit,
      runningBalance: e.runningBalance,
    }));
    const periodLabel =
      dateFilter === 'THIS_MONTH'
        ? 'Current Month'
        : dateFilter === 'LAST_30_DAYS'
        ? 'Last 30 Days'
        : 'All Time Passbook';
    printPartyLedgerStatement(party, company, printable, periodLabel);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return;

    const fullNotes = [paymentRef ? `Ref: ${paymentRef}` : '', paymentNotes].filter(Boolean).join(' • ');
    onRecordPayment(party, amt, paymentMode, fullNotes || `Payment of ${formatINR(amt)} on ${paymentDate}`);
    setIsPaymentOpen(false);
  };

  const handleWhatsAppReminder = () => {
    const bizName = company.tradeName || company.businessName || 'Vyapar Books';
    const upiLink = company.upiId
      ? `upi://pay?pa=${encodeURIComponent(company.upiId)}&pn=${encodeURIComponent(bizName)}&am=${Math.abs(
          party.currentBalance
        )}&cu=INR`
      : '';

    const text =
      `*LEDGER STATEMENT - ${bizName}*\n` +
      `Party: *${party.name}*\n` +
      `Date: ${new Date().toLocaleDateString('en-IN')}\n\n` +
      `Total Bills: ${formatINR(totalBilled)}\n` +
      `Total Paid: ${formatINR(totalPaid)}\n` +
      `*Net Balance Due: ${formatINR(Math.abs(party.currentBalance))} ${
        isReceivable ? '(To Collect)' : isPayable ? '(To Pay)' : '(Settled)'
      }*\n\n` +
      (upiLink ? `*Instant UPI Payment Link:*\n${upiLink}\n\n` : '') +
      `Thank you for doing business with us!`;

    const clean = party.phone.replace(/\D/g, '');
    const phone = clean.length === 10 ? `91${clean}` : clean;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleDelete = () => {
    if (window.confirm(`Delete party "${party.name}"? This removes them from your active contacts list.`)) {
      onDeleteParty?.(party.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-lg shadow-2xl border border-outline-variant/30 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Compact Header */}
        <div className="p-3.5 border-b border-outline-variant/20 flex items-center justify-between gap-2 bg-surface-container-low/40 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                isCustomer ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'
              }`}
            >
              {party.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-headline-sm text-sm font-bold text-on-surface truncate">
                  {party.name}
                </h3>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface-variant flex-shrink-0">
                  {party.type}
                </span>
                {party.gstin && (
                  <span className="material-symbols-outlined text-[13px] text-secondary flex-shrink-0" title={`GSTIN: ${party.gstin}`}>
                    verified
                  </span>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                <a href={`tel:${party.phone}`} className="text-secondary font-semibold hover:underline">
                  {party.phone}
                </a>
                {party.billingAddress && party.billingAddress !== 'Local Counter' && (
                  <> • <span>{party.billingAddress}</span></>
                )}
              </p>
            </div>
          </div>

          {/* Action Tools in Header */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <a
              href={`tel:${party.phone}`}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-secondary hover:bg-surface-container transition-colors"
              title="Call Party"
            >
              <span className="material-symbols-outlined text-[18px]">call</span>
            </a>

            <button
              type="button"
              onClick={() => onEditParty(party)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              title="Edit Details"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>

            {onDeleteParty && (
              <button
                type="button"
                onClick={handleDelete}
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                title="Delete Party"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer ml-0.5"
              title="Close"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Compact Financial Strip */}
        <div className="grid grid-cols-3 gap-2 p-2.5 mx-3 mt-2.5 rounded-xl bg-surface-container-low text-xs flex-shrink-0">
          <div>
            <span className="text-[10px] text-outline font-semibold uppercase block">Net Balance</span>
            <span
              className={`font-bold text-sm truncate block ${
                isReceivable
                  ? 'text-error'
                  : isPayable
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-secondary'
              }`}
            >
              {party.currentBalance === 0 ? '₹0' : formatINR(Math.abs(party.currentBalance))}
            </span>
            <span className="text-[9px] text-on-surface-variant font-medium">
              {isReceivable ? 'To Collect' : isPayable ? 'To Pay' : 'Settled'}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-outline font-semibold uppercase block">
              {isCustomer ? 'Total Billed' : 'Total Inward'}
            </span>
            <span className="font-bold text-on-surface text-sm truncate block">
              {formatINR(totalBilled)}
            </span>
            <span className="text-[9px] text-on-surface-variant">
              {isCustomer ? `${partyInvoices.length} Bills` : `${partyPurchases.length} Bills`}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-outline font-semibold uppercase block">
              {isCustomer ? 'Total Received' : 'Total Paid'}
            </span>
            <span className="font-bold text-secondary text-sm truncate block">
              {formatINR(totalPaid)}
            </span>
            <span className="text-[9px] text-on-surface-variant">Collections</span>
          </div>
        </div>

        {/* Credit Limit Indicator Bar */}
        {party.creditLimit && party.creditLimit > 0 && (
          <div className="mx-3 mt-2 p-2 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-xs flex-shrink-0">
            <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant mb-1">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-secondary">credit_score</span>
                <span>Credit Line: {formatINR(Math.abs(party.currentBalance))} of {formatINR(party.creditLimit)}</span>
              </span>
              <span
                className={`text-[10px] font-bold ${
                  party.currentBalance > party.creditLimit ? 'text-error' : 'text-on-surface'
                }`}
              >
                {Math.round((Math.max(0, party.currentBalance) / party.creditLimit) * 100)}% Used
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  party.currentBalance > party.creditLimit ? 'bg-error' : 'bg-secondary'
                }`}
                style={{
                  width: `${Math.min(100, (Math.max(0, party.currentBalance) / party.creditLimit) * 100)}%`,
                }}
              />
            </div>
            {party.currentBalance > party.creditLimit && (
              <p className="text-[10px] text-error font-semibold mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">warning</span>
                <span>Credit limit exceeded by {formatINR(party.currentBalance - party.creditLimit)}</span>
              </p>
            )}
          </div>
        )}

        {/* Inline Record Payment Form (Slides down when button is tapped) */}
        {isPaymentOpen && (
          <form
            onSubmit={handlePaymentSubmit}
            className="p-3 mx-3 my-2 bg-surface-container rounded-xl border border-secondary/30 flex flex-col gap-2.5 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-secondary flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">payments</span>
                <span>Record Payment for {party.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsPaymentOpen(false)}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            {/* Quick Fill Chips */}
            {party.currentBalance !== 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPaymentAmount(Math.abs(party.currentBalance).toString())}
                  className="px-2 py-0.5 rounded-md bg-secondary/15 text-secondary text-[11px] font-bold cursor-pointer hover:bg-secondary/25"
                >
                  Full Due ({formatINR(Math.abs(party.currentBalance))})
                </button>
                {Math.abs(party.currentBalance) > 100 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(Math.round(Math.abs(party.currentBalance) / 2).toString())}
                    className="px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface text-[11px] font-medium cursor-pointer"
                  >
                    50%
                  </button>
                )}
              </div>
            )}

            {/* Amount & Mode */}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-xs font-bold text-on-surface-variant">₹</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1">
                {['UPI', 'CASH', 'BANK'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMode(m)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      paymentMode === m
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'bg-surface text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Reference & Save */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Reference / UTR / Note"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-surface rounded-lg text-xs text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-xs active:scale-95 cursor-pointer whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Filter Tabs & Date Controls Header */}
        <div className="px-3 pt-2 pb-1 flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
              <span>Ledger Passbook</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-container font-semibold text-on-surface-variant">
                {filteredPassbook.length}
              </span>
            </span>
            <div className="inline-flex rounded-lg bg-surface-container p-0.5 text-[11px] font-semibold">
              {(['ALL', 'BILLS', 'PAYMENTS'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTxnFilter(tab)}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer capitalize ${
                    txnFilter === tab
                      ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab === 'ALL' ? 'All' : tab.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Date range filter & Statement Export */}
          <div className="flex items-center justify-between gap-1 text-[10px]">
            <div className="flex items-center gap-1">
              {[
                { key: 'ALL', label: 'All Time' },
                { key: 'THIS_MONTH', label: 'This Month' },
                { key: 'LAST_30_DAYS', label: 'Last 30 Days' },
              ].map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDateFilter(d.key as any)}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer font-medium ${
                    dateFilter === d.key
                      ? 'bg-secondary/15 text-secondary font-bold'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handlePrintStatement}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold cursor-pointer transition-colors"
              title="Print / Save Passbook Statement"
            >
              <span className="material-symbols-outlined text-[13px]">print</span>
              <span>Statement</span>
            </button>
          </div>
        </div>

        {/* Scrollable Passbook Ledger Feed */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5 text-xs min-h-[160px] max-h-[380px]">
          {filteredPassbook.length === 0 ? (
            <div className="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-[24px] text-outline">receipt_long</span>
              <p className="text-xs">No transactions recorded in this period</p>
            </div>
          ) : (
            filteredPassbook.map((entry) => {
              const isCredit = entry.credit > 0;
              const isDebit = entry.debit > 0;

              return (
                <div
                  key={entry.id}
                  className="p-2.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container-low transition-colors flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        entry.type === 'PAYMENT_IN'
                          ? 'bg-secondary/15 text-secondary'
                          : entry.type === 'PAYMENT_OUT'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : entry.type === 'SALE'
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : entry.type === 'PURCHASE'
                          ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {entry.type === 'PAYMENT_IN'
                          ? 'arrow_downward'
                          : entry.type === 'PAYMENT_OUT'
                          ? 'arrow_upward'
                          : entry.type === 'SALE'
                          ? 'point_of_sale'
                          : entry.type === 'PURCHASE'
                          ? 'shopping_bag'
                          : 'account_balance'}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-on-surface truncate text-xs">
                          {entry.type === 'SALE'
                            ? `Sale #${entry.docNumber}`
                            : entry.type === 'PURCHASE'
                            ? `Bill #${entry.docNumber}`
                            : entry.type === 'PAYMENT_IN'
                            ? `Payment In (${entry.paymentMode || 'UPI'})`
                            : entry.type === 'PAYMENT_OUT'
                            ? `Payment Out (${entry.paymentMode || 'Cash'})`
                            : 'Opening Balance'}
                        </span>
                        {entry.status && entry.status !== 'OPENING' && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                              entry.status === 'PAID'
                                ? 'bg-secondary/10 text-secondary'
                                : entry.status === 'PARTIAL'
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-error/10 text-error'
                            }`}
                          >
                            {entry.status}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-on-surface-variant truncate">
                        {entry.date} {entry.description ? `• ${entry.description}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 pl-1">
                    <span
                      className={`font-currency-display-mobile text-xs font-extrabold ${
                        isCredit ? 'text-secondary' : isDebit ? 'text-error' : 'text-on-surface'
                      }`}
                    >
                      {isCredit ? `+ ${formatINR(entry.credit)}` : isDebit ? `- ${formatINR(entry.debit)}` : '₹0'}
                    </span>
                    <span className="text-[9px] font-mono text-outline block mt-0.5">
                      Bal: {formatINR(Math.abs(entry.runningBalance))}
                    </span>
                    {entry.rawInvoice && onViewInvoice && (
                      <button
                        type="button"
                        onClick={() => onViewInvoice(entry.rawInvoice!)}
                        className="text-[10px] text-secondary font-bold hover:underline cursor-pointer"
                      >
                        View Bill
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Simplified & Clean Action Footer */}
        <div className="p-3 border-t border-outline-variant/20 flex items-center gap-2 bg-surface-container-low/40 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsPaymentOpen(!isPaymentOpen)}
            className="flex-1 py-2.5 px-4 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">payments</span>
            <span>{isCustomer ? '+ Record Payment' : '+ Pay Supplier'}</span>
          </button>

          {isCustomer && onCreateInvoice && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateInvoice(party);
              }}
              className="py-2.5 px-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Create new sales invoice for this customer"
            >
              <span className="material-symbols-outlined text-[17px] text-secondary">receipt_long</span>
              <span>+ Invoice</span>
            </button>
          )}

          {!isCustomer && onCreatePurchase && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreatePurchase(party);
              }}
              className="py-2.5 px-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Create new purchase bill for this supplier"
            >
              <span className="material-symbols-outlined text-[17px] text-primary">shopping_bag</span>
              <span>+ Bill</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleWhatsAppReminder}
            className="w-10 h-10 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] flex items-center justify-center cursor-pointer transition-colors active:scale-95 flex-shrink-0"
            title="Send WhatsApp Statement"
          >
            <span className="material-symbols-outlined text-[20px]">chat</span>
          </button>
        </div>
      </div>
    </div>
  );
};
