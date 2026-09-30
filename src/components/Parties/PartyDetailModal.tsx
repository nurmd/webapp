import React, { useState, useMemo } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getPaymentReminderWhatsAppUrl } from '../../core/utils/upiAndShare.ts';
import { validateGstin } from '../../core/gst/validator.ts';

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
  rawPurchase?: PurchaseBill;
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
}) => {
  const [activeTab, setActiveTab] = useState<'PASSBOOK' | 'PAYMENT' | 'PROFILE'>('PASSBOOK');
  const [passbookFilter, setPassbookFilter] = useState<'ALL' | 'BILLS' | 'PAYMENTS'>('ALL');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [passbookSearch, setPassbookSearch] = useState<string>('');

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<string>(
    party.currentBalance !== 0 ? Math.abs(party.currentBalance).toString() : ''
  );
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [paymentSuccessToast, setPaymentSuccessToast] = useState<boolean>(false);

  // Profile State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [copiedGstin, setCopiedGstin] = useState<boolean>(false);

  const isCustomer = party.type === 'CUSTOMER';
  const isReceivable = party.currentBalance > 0;
  const isPayable = party.currentBalance < 0;

  // Filter party-specific documents
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

  // Aggregate total billed and paid
  const totalBilled = useMemo(() => {
    return isCustomer
      ? partyInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0)
      : partyPurchases.reduce((sum, pur) => sum + pur.grandTotal, 0);
  }, [isCustomer, partyInvoices, partyPurchases]);

  const totalPaid = useMemo(() => {
    return isCustomer
      ? partyInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0)
      : partyPurchases.reduce((sum, pur) => sum + pur.paidAmount, 0);
  }, [isCustomer, partyInvoices, partyPurchases]);

  // Build Comprehensive Double-Entry Ledger Passbook with Accurate Running Balance
  const passbook: PassbookEntry[] = useMemo(() => {
    const rawEntries: Omit<PassbookEntry, 'runningBalance'>[] = [];

    // 1. Sales Invoices
    partyInvoices.forEach((inv) => {
      rawEntries.push({
        id: `sale-${inv.id}`,
        date: inv.date,
        docNumber: inv.invoiceNumber,
        type: 'SALE',
        description: `Sales Invoice #${inv.invoiceNumber} (${inv.items.length} items)`,
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
          description: `Payment received for #${inv.invoiceNumber} (${inv.paymentMode})`,
          debit: 0,
          credit: inv.paidAmount,
          status: 'PAID',
          paymentMode: inv.paymentMode,
        });
      }
    });

    // 2. Purchase Bills
    partyPurchases.forEach((pur) => {
      rawEntries.push({
        id: `pur-${pur.id}`,
        date: pur.date,
        docNumber: pur.billNumber,
        type: 'PURCHASE',
        description: `Purchase Inward Bill #${pur.billNumber}`,
        debit: 0,
        credit: pur.grandTotal,
        status: pur.paymentStatus,
        paymentMode: pur.paymentMode,
        rawPurchase: pur,
      });

      if (pur.paidAmount > 0) {
        rawEntries.push({
          id: `pay-pur-${pur.id}`,
          date: pur.date,
          docNumber: `PYMT-${pur.billNumber}`,
          type: 'PAYMENT_OUT',
          description: `Payment made for Bill #${pur.billNumber} (${pur.paymentMode})`,
          debit: pur.paidAmount,
          credit: 0,
          status: 'PAID',
          paymentMode: pur.paymentMode,
        });
      }
    });

    // 3. Additional Vouchers recorded in Ledger/Daybook (e.g. standalone payment receipts)
    vouchers.forEach((v) => {
      const isPartyVoucher = v.entries.some(
        (e) =>
          e.accountId === party.id ||
          e.accountName.toLowerCase() === party.name.toLowerCase()
      );

      if (isPartyVoucher) {
        // Skip if already represented by an invoice/bill payment reference
        const isDupe = rawEntries.some(
          (e) =>
            e.docNumber === v.voucherNumber ||
            (v.referenceNo && e.docNumber.includes(v.referenceNo))
        );
        if (!isDupe) {
          if (v.voucherType === 'RECEIPT') {
            rawEntries.push({
              id: `vchr-${v.id}`,
              date: v.date,
              docNumber: v.voucherNumber,
              type: 'PAYMENT_IN',
              description: v.narration || `Payment received from customer`,
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
              description: v.narration || `Payment made to supplier`,
              debit: v.totalAmount,
              credit: 0,
              status: 'PAID',
            });
          }
        }
      }
    });

    // 4. Calculate Opening Balance difference if initial balance was provided
    const totalDebits = rawEntries.reduce((s, e) => s + e.debit, 0);
    const totalCredits = rawEntries.reduce((s, e) => s + e.credit, 0);
    const calculatedNet = isCustomer ? totalDebits - totalCredits : totalCredits - totalDebits;
    const openingDifference = party.currentBalance - calculatedNet;

    if (Math.abs(openingDifference) >= 1) {
      const openingDate = party.createdAt ? party.createdAt.split('T')[0] : '2026-01-01';
      rawEntries.push({
        id: `opening-${party.id}`,
        date: openingDate,
        docNumber: 'OPENING-BAL',
        type: 'OPENING',
        description: 'Initial Opening Balance Forwarded',
        debit: openingDifference > 0 ? openingDifference : 0,
        credit: openingDifference < 0 ? Math.abs(openingDifference) : 0,
        status: 'OPENING',
      });
    }

    // Sort chronologically ascending to compute progressive running balance
    rawEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    return rawEntries.map((entry) => {
      if (isCustomer) {
        running += entry.debit - entry.credit;
      } else {
        running += entry.credit - entry.debit;
      }
      return {
        ...entry,
        runningBalance: running,
      };
    });
  }, [party, partyInvoices, partyPurchases, vouchers, isCustomer]);

  // Filter passbook entries
  const filteredPassbook = useMemo(() => {
    return passbook
      .filter((entry) => {
        if (passbookFilter === 'BILLS') {
          return entry.type === 'SALE' || entry.type === 'PURCHASE';
        }
        if (passbookFilter === 'PAYMENTS') {
          return entry.type === 'PAYMENT_IN' || entry.type === 'PAYMENT_OUT';
        }
        return true;
      })
      .filter((entry) => {
        if (!passbookSearch.trim()) return true;
        const q = passbookSearch.toLowerCase();
        return (
          entry.docNumber.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          entry.date.includes(q) ||
          (entry.paymentMode && entry.paymentMode.toLowerCase().includes(q))
        );
      });
  }, [passbook, passbookFilter, passbookSearch]);

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return;

    const fullNotes = [paymentRef ? `Ref: ${paymentRef}` : '', paymentNotes].filter(Boolean).join(' • ');
    onRecordPayment(party, amt, paymentMode, fullNotes || `Payment of ${formatINR(amt)} on ${paymentDate}`);

    setPaymentSuccessToast(true);
    setTimeout(() => {
      setPaymentSuccessToast(false);
      setActiveTab('PASSBOOK');
    }, 1200);
  };

  const handleShareWhatsAppStatement = () => {
    const bizName = company.tradeName || company.businessName || 'Vyapar Books';
    const upiLink = company.upiId
      ? `upi://pay?pa=${encodeURIComponent(company.upiId)}&pn=${encodeURIComponent(bizName)}&am=${Math.abs(
          party.currentBalance
        )}&cu=INR`
      : '';

    const text =
      `*STATEMENT OF ACCOUNT*\n` +
      `*${bizName}*\n` +
      `GSTIN: ${company.gstin || 'N/A'}\n\n` +
      `*Party Name:* ${party.name}\n` +
      `*Contact:* ${party.phone}\n` +
      `*Date:* ${new Date().toLocaleDateString('en-IN')}\n\n` +
      `*Total Invoices / Bills:* ${isCustomer ? partyInvoices.length : partyPurchases.length} (${formatINR(totalBilled)})\n` +
      `*Total Payments:* ${formatINR(totalPaid)}\n` +
      `*Current Net Balance Due:* ${formatINR(Math.abs(party.currentBalance))} ${
        isReceivable ? '(Dr - To Collect)' : isPayable ? '(Cr - To Pay)' : '(Settled)'
      }\n\n` +
      (upiLink ? `*Instant UPI Payment Link:*\n${upiLink}\n\n` : '') +
      `Thank you for doing business with us!`;

    const phoneDigits = party.phone.replace(/[^0-9]/g, '');
    const target = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
    const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Tax and GSTIN extraction
  const gstinValidation = useMemo(() => {
    if (!party.gstin) return null;
    return validateGstin(party.gstin);
  }, [party.gstin]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedGstin(true);
    setTimeout(() => setCopiedGstin(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl border border-outline-variant/30 overflow-hidden">
        {/* Top Header Card */}
        <div className="bg-surface-container-low p-3.5 sm:p-4 border-b border-outline-variant/20 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0 shadow-sm ${
                  isCustomer ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'
                }`}
              >
                {party.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface truncate">
                    {party.name}
                  </h2>
                  <span
                    className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isCustomer
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-primary-container text-on-primary-container'
                    }`}
                  >
                    {isCustomer ? 'Customer' : 'Supplier'}
                  </span>
                  {party.gstin && (
                    <span
                      className="material-symbols-outlined text-[15px] text-secondary flex-shrink-0"
                      title="Verified Registered Business"
                    >
                      verified
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5 truncate">
                  <a
                    href={`tel:${party.phone}`}
                    className="flex items-center gap-0.5 text-secondary font-semibold hover:underline"
                  >
                    <span className="material-symbols-outlined text-[13px]">call</span>
                    <span>{party.phone}</span>
                  </a>
                  {party.billingAddress && (
                    <>
                      <span className="text-outline-variant">•</span>
                      <span className="truncate">{party.billingAddress}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onEditParty(party)}
                className="px-2.5 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                type="button"
                title="Edit Party Details"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer transition-colors"
                type="button"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          {/* 3 Metric Snapshot Strip */}
          <div className="grid grid-cols-3 gap-2">
            {/* Current Balance */}
            <div className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                Net Balance
              </span>
              <span
                className={`font-currency-display-mobile text-sm sm:text-base font-extrabold mt-0.5 truncate ${
                  isReceivable
                    ? 'text-error'
                    : isPayable
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-secondary'
                }`}
              >
                {party.currentBalance === 0 ? '₹0' : formatINR(Math.abs(party.currentBalance))}
              </span>
              <span className="text-[9px] sm:text-[10px] font-semibold text-on-surface-variant truncate">
                {isReceivable ? 'To Collect (Dr)' : isPayable ? 'To Pay (Cr)' : 'Settled'}
              </span>
            </div>

            {/* Total Invoiced */}
            <div className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                {isCustomer ? 'Total Billed' : 'Total Purchased'}
              </span>
              <span className="font-currency-display-mobile text-sm sm:text-base font-extrabold text-on-surface mt-0.5 truncate">
                {formatINR(totalBilled)}
              </span>
              <span className="text-[9px] sm:text-[10px] text-on-surface-variant truncate">
                {isCustomer ? `${partyInvoices.length} Bills` : `${partyPurchases.length} Inward Bills`}
              </span>
            </div>

            {/* Total Paid */}
            <div className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                {isCustomer ? 'Total Received' : 'Total Paid'}
              </span>
              <span className="font-currency-display-mobile text-sm sm:text-base font-extrabold text-secondary mt-0.5 truncate">
                {formatINR(totalPaid)}
              </span>
              <span className="text-[9px] sm:text-[10px] text-on-surface-variant truncate">
                Collections Recorded
              </span>
            </div>
          </div>

          {/* Quick Action Ribbon */}
          <div className="flex items-center gap-2 pt-0.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('PAYMENT')}
              className="px-3 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              <span>{isCustomer ? '+ Record Payment In' : '+ Record Payment Out'}</span>
            </button>

            <button
              onClick={handleShareWhatsAppStatement}
              className="px-3 py-1.5 rounded-xl bg-[#25D366] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">chat</span>
              <span>WhatsApp Statement</span>
            </button>

            <a
              href={`tel:${party.phone}`}
              className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[15px]">call</span>
              <span>Call</span>
            </a>

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[15px]">print</span>
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-outline-variant/20 bg-surface-container-lowest px-3 sm:px-4">
          <button
            onClick={() => setActiveTab('PASSBOOK')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'PASSBOOK'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
            <span>Transaction Passbook ({passbook.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('PAYMENT')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'PAYMENT'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">add_card</span>
            <span>Record Payment</span>
          </button>

          <button
            onClick={() => setActiveTab('PROFILE')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'PROFILE'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">badge</span>
            <span>Profile &amp; Details</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {/* TAB 1: PASSBOOK LEDGER */}
          {activeTab === 'PASSBOOK' && (
            <div className="flex flex-col gap-3">
              {/* Passbook Controls: Filter Chips, Search & View Mode Switcher */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <button
                    type="button"
                    onClick={() => setPassbookFilter('ALL')}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                      passbookFilter === 'ALL'
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    All ({passbook.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPassbookFilter('BILLS')}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                      passbookFilter === 'BILLS'
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    Bills ({isCustomer ? partyInvoices.length : partyPurchases.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPassbookFilter('PAYMENTS')}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                      passbookFilter === 'PAYMENTS'
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    Payments
                  </button>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-2 text-[15px] text-on-surface-variant">
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Search passbook..."
                      value={passbookSearch}
                      onChange={(e) => setPassbookSearch(e.target.value)}
                      className="pl-7 pr-6 py-1 bg-surface-container-low rounded-lg text-xs border border-outline-variant/30 text-on-surface focus:outline-none w-32 sm:w-44"
                    />
                    {passbookSearch && (
                      <button
                        type="button"
                        onClick={() => setPassbookSearch('')}
                        className="absolute right-1 text-on-surface-variant"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    )}
                  </div>

                  {/* Toggle Table vs Cards view */}
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'CARDS' ? 'TABLE' : 'CARDS')}
                    className="p-1 rounded-lg bg-surface-container-low text-on-surface-variant hover:text-on-surface border border-outline-variant/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title={viewMode === 'CARDS' ? 'Switch to Full Table View' : 'Switch to Compact Mobile View'}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {viewMode === 'CARDS' ? 'table_chart' : 'view_stream'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Empty State */}
              {filteredPassbook.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant bg-surface-container-low rounded-xl border border-outline-variant/20">
                  <span className="material-symbols-outlined text-[36px] text-outline mb-1">
                    receipt_long
                  </span>
                  <p className="text-xs font-semibold text-on-surface">No ledger transactions found</p>
                  <p className="text-[11px] text-outline mt-0.5">
                    {passbookSearch
                      ? 'No entries match your search query.'
                      : 'Record a payment or issue an invoice to start the passbook.'}
                  </p>
                </div>
              ) : viewMode === 'CARDS' ? (
                /* Mobile-Friendly Tactile Cards View */
                <div className="flex flex-col gap-2">
                  {filteredPassbook.map((entry) => {
                    const isCredit = entry.credit > 0;
                    const isDebit = entry.debit > 0;

                    return (
                      <div
                        key={entry.id}
                        className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/20 shadow-xs flex items-center justify-between gap-2.5 hover:border-secondary/30 transition-all"
                      >
                        {/* Left: Direction Icon & Details */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-[18px] flex-shrink-0 ${
                              entry.type === 'PAYMENT_IN'
                                ? 'bg-secondary/10 text-secondary'
                                : entry.type === 'PAYMENT_OUT'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : entry.type === 'SALE'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : entry.type === 'PURCHASE'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                : 'bg-surface-container text-on-surface-variant'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {entry.type === 'PAYMENT_IN'
                                ? 'south_west'
                                : entry.type === 'PAYMENT_OUT'
                                ? 'north_east'
                                : entry.type === 'SALE'
                                ? 'point_of_sale'
                                : entry.type === 'PURCHASE'
                                ? 'shopping_cart'
                                : 'account_balance'}
                            </span>
                          </div>

                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-surface-container text-on-surface-variant uppercase">
                                {entry.type.replace('_', ' ')}
                              </span>
                              <span className="font-mono text-xs font-bold text-on-surface truncate">
                                {entry.docNumber}
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

                            <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">
                              {entry.description}
                            </p>

                            <span className="text-[10px] text-outline font-medium">
                              {entry.date} {entry.paymentMode ? `• ${entry.paymentMode}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Right: Debit/Credit Amount & Progressive Running Balance */}
                        <div className="flex flex-col items-end text-right flex-shrink-0 pl-1">
                          <span
                            className={`font-currency-display-mobile text-xs sm:text-sm font-extrabold ${
                              isCredit
                                ? 'text-secondary'
                                : isDebit
                                ? 'text-error'
                                : 'text-on-surface'
                            }`}
                          >
                            {isCredit
                              ? `+ ${formatINR(entry.credit)}`
                              : isDebit
                              ? `- ${formatINR(entry.debit)}`
                              : '₹0'}
                          </span>

                          <span className="text-[10px] font-mono font-semibold text-on-surface-variant mt-0.5">
                            Bal: {formatINR(Math.abs(entry.runningBalance))}{' '}
                            <span className="text-[9px] font-bold">
                              {entry.runningBalance > 0 ? 'Dr' : entry.runningBalance < 0 ? 'Cr' : ''}
                            </span>
                          </span>

                          {/* Quick Link to View Invoice if available */}
                          {entry.rawInvoice && onViewInvoice && (
                            <button
                              type="button"
                              onClick={() => onViewInvoice(entry.rawInvoice!)}
                              className="text-[10px] text-secondary font-bold hover:underline cursor-pointer mt-0.5 flex items-center gap-0.5"
                            >
                              <span>View Bill</span>
                              <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Full Table View */
                <div className="overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/20 bg-surface-container-low text-on-surface-variant font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Doc #</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                        <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                        <th className="py-2.5 px-3 text-right">Balance (₹)</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 font-body-sm">
                      {filteredPassbook.map((entry) => (
                        <tr key={entry.id} className="hover:bg-surface-container-low/60 transition-colors">
                          <td className="py-2.5 px-3 text-on-surface-variant whitespace-nowrap">
                            {entry.date}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-surface-container text-on-surface-variant whitespace-nowrap">
                              {entry.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-secondary whitespace-nowrap">
                            {entry.rawInvoice && onViewInvoice ? (
                              <button
                                onClick={() => onViewInvoice(entry.rawInvoice!)}
                                className="underline hover:text-secondary-fixed-dim cursor-pointer text-left"
                                type="button"
                              >
                                {entry.docNumber}
                              </button>
                            ) : (
                              entry.docNumber
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-on-surface">{entry.description}</td>
                          <td className="py-2.5 px-3 text-right font-tabular-data font-bold text-error">
                            {entry.debit > 0 ? formatINR(entry.debit) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-tabular-data font-bold text-secondary">
                            {entry.credit > 0 ? formatINR(entry.credit) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-tabular-data font-mono font-bold text-on-surface">
                            {formatINR(Math.abs(entry.runningBalance))}{' '}
                            <span className="text-[10px] text-outline font-semibold">
                              {entry.runningBalance > 0 ? 'Dr' : entry.runningBalance < 0 ? 'Cr' : ''}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {entry.status && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  entry.status === 'PAID'
                                    ? 'bg-secondary/10 text-secondary'
                                    : entry.status === 'PARTIAL'
                                    ? 'bg-amber-100 text-amber-800'
                                    : entry.status === 'OPENING'
                                    ? 'bg-surface-container text-on-surface-variant'
                                    : 'bg-error/10 text-error'
                                }`}
                              >
                                {entry.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RECORD PAYMENT */}
          {activeTab === 'PAYMENT' && (
            <form onSubmit={handlePaymentSubmit} className="flex flex-col gap-3 max-w-lg mx-auto py-1">
              {paymentSuccessToast && (
                <div className="p-3 bg-secondary/15 border border-secondary/30 rounded-xl text-secondary text-xs font-bold flex items-center gap-2 animate-bounce-once">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>Payment recorded successfully! Balance has been updated.</span>
                </div>
              )}

              {/* Outstanding Balance Banner */}
              <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/20 flex items-center justify-between">
                <div>
                  <span className="text-xs text-on-surface-variant font-medium">Outstanding for {party.name}</span>
                  <div className="font-currency-display-mobile text-lg font-extrabold text-on-surface mt-0.5">
                    {formatINR(Math.abs(party.currentBalance))}
                    <span className="text-xs text-outline font-medium ml-1">
                      {isReceivable ? '(Customer Due)' : isPayable ? '(Payable to Vendor)' : '(Fully Settled)'}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    isReceivable ? 'bg-error/10 text-error' : isPayable ? 'bg-amber-500/10 text-amber-600' : 'bg-secondary/10 text-secondary'
                  }`}
                >
                  {isReceivable ? 'Due to Receive' : isPayable ? 'Due to Pay' : 'Settled'}
                </span>
              </div>

              {/* Quick Fill Chips */}
              {party.currentBalance !== 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
                    Quick Fill Amount:
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(Math.abs(party.currentBalance).toString())}
                      className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-secondary cursor-pointer border border-secondary/20"
                    >
                      Full Due ({formatINR(Math.abs(party.currentBalance))})
                    </button>
                    {Math.abs(party.currentBalance) > 100 && (
                      <button
                        type="button"
                        onClick={() => setPaymentAmount(Math.round(Math.abs(party.currentBalance) / 2).toString())}
                        className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-medium text-on-surface cursor-pointer border border-outline-variant/30"
                      >
                        50% ({formatINR(Math.round(Math.abs(party.currentBalance) / 2))})
                      </button>
                    )}
                    {[500, 1000, 2000, 5000].map(
                      (preset) =>
                        preset < Math.abs(party.currentBalance) && (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setPaymentAmount(preset.toString())}
                            className="px-2 py-1 rounded-lg bg-surface-container text-xs font-medium text-on-surface cursor-pointer border border-outline-variant/20 hover:bg-surface-container-high"
                          >
                            ₹{preset}
                          </button>
                        )
                    )}
                  </div>
                </div>
              )}

              {/* Payment Amount Input */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Payment Amount (₹) *
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-lg font-bold text-on-surface-variant">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-surface border border-outline-variant/40 text-on-surface font-extrabold text-base focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Payment Mode
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'UPI', label: 'UPI / QR', icon: 'qr_code' },
                    { id: 'CASH', label: 'Cash', icon: 'payments' },
                    { id: 'BANK_TRANSFER', label: 'Bank', icon: 'account_balance' },
                    { id: 'CHEQUE', label: 'Cheque', icon: 'description' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPaymentMode(mode.id)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all border ${
                        paymentMode === mode.id
                          ? 'bg-secondary text-on-secondary border-secondary shadow-xs scale-[1.02]'
                          : 'bg-surface-container-low text-on-surface border-outline-variant/20 hover:bg-surface-container'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{mode.icon}</span>
                      <span className="text-[11px] truncate">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-outline-variant/30 text-on-surface text-xs focus:border-secondary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">
                    Reference / UTR / Cheque #
                  </label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-outline-variant/30 text-on-surface text-xs focus:border-secondary focus:outline-none"
                    placeholder="e.g. UTR-9821038 or Cheque 0014"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Narration / Notes
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-outline-variant/30 text-on-surface text-xs focus:border-secondary focus:outline-none"
                  placeholder="e.g. Part payment received against Invoice #104"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('PASSBOOK')}
                  className="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs cursor-pointer hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs cursor-pointer shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>Save Payment &amp; Settle Dues</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PARTY PROFILE & COMPLETE DETAILS */}
          {activeTab === 'PROFILE' && (
            <div className="flex flex-col gap-3 max-w-2xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Contact & Communications */}
                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-xs flex flex-col gap-2.5">
                  <div className="flex items-center gap-1.5 text-secondary border-b border-outline-variant/10 pb-1.5">
                    <span className="material-symbols-outlined text-[18px]">contact_phone</span>
                    <span className="text-xs font-bold uppercase tracking-wider">Contact &amp; Address</span>
                  </div>

                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-[10px] text-on-surface-variant font-bold uppercase">Phone Number</span>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-on-surface">{party.phone}</span>
                      <div className="flex items-center gap-1">
                        <a
                          href={`tel:${party.phone}`}
                          className="p-1 rounded-lg bg-surface-container hover:bg-secondary/15 text-secondary transition-colors"
                          title="Call"
                        >
                          <span className="material-symbols-outlined text-[15px]">call</span>
                        </a>
                        <a
                          href={`sms:${party.phone}`}
                          className="p-1 rounded-lg bg-surface-container hover:bg-secondary/15 text-secondary transition-colors"
                          title="SMS"
                        >
                          <span className="material-symbols-outlined text-[15px]">sms</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-[10px] text-on-surface-variant font-bold uppercase">Billing Address</span>
                    <span className="font-medium text-on-surface">
                      {party.billingAddress || 'No address registered'}
                    </span>
                  </div>
                </div>

                {/* 2. Tax & Legal Profile */}
                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-xs flex flex-col gap-2.5">
                  <div className="flex items-center gap-1.5 text-secondary border-b border-outline-variant/10 pb-1.5">
                    <span className="material-symbols-outlined text-[18px]">gavel</span>
                    <span className="text-xs font-bold uppercase tracking-wider">GSTIN &amp; Tax Identity</span>
                  </div>

                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-[10px] text-on-surface-variant font-bold uppercase">GSTIN / UIN</span>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-secondary">
                        {party.gstin || 'Unregistered / Consumer'}
                      </span>
                      {party.gstin && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(party.gstin!)}
                          className="text-[10px] text-on-surface-variant hover:text-on-surface font-semibold flex items-center gap-0.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {copiedGstin ? 'check' : 'content_copy'}
                          </span>
                          <span>{copiedGstin ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {gstinValidation?.pan && (
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="text-[10px] text-on-surface-variant font-bold uppercase">PAN Number</span>
                      <span className="font-mono font-bold text-on-surface">{gstinValidation.pan}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-[10px] text-on-surface-variant font-bold uppercase">Place of Supply</span>
                    <span className="font-medium text-on-surface">
                      State Code: {party.stateCode || '27'}{' '}
                      {gstinValidation?.stateName ? `(${gstinValidation.stateName})` : ''}
                    </span>
                  </div>
                </div>

                {/* 3. Financial & Credit Terms */}
                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-xs flex flex-col gap-2.5">
                  <div className="flex items-center gap-1.5 text-secondary border-b border-outline-variant/10 pb-1.5">
                    <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                    <span className="text-xs font-bold uppercase tracking-wider">Financial Overview</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Outstanding Balance:</span>
                    <span
                      className={`font-bold ${
                        isReceivable ? 'text-error' : isPayable ? 'text-amber-600' : 'text-secondary'
                      }`}
                    >
                      {formatINR(Math.abs(party.currentBalance))}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Lifetime Invoiced:</span>
                    <span className="font-bold text-on-surface">{formatINR(totalBilled)}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Lifetime Payments:</span>
                    <span className="font-bold text-secondary">{formatINR(totalPaid)}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Credit Limit:</span>
                    <span className="font-bold text-on-surface">
                      {party.creditLimit ? formatINR(party.creditLimit) : 'No Limit'}
                    </span>
                  </div>
                </div>

                {/* 4. Ledger Statistics */}
                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-xs flex flex-col gap-2.5">
                  <div className="flex items-center gap-1.5 text-secondary border-b border-outline-variant/10 pb-1.5">
                    <span className="material-symbols-outlined text-[18px]">analytics</span>
                    <span className="text-xs font-bold uppercase tracking-wider">Account History</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Party Type:</span>
                    <span className="font-bold text-on-surface">{party.type}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Total Transactions:</span>
                    <span className="font-bold text-on-surface">{passbook.length} records</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Member Since:</span>
                    <span className="font-medium text-on-surface">
                      {party.createdAt ? party.createdAt.split('T')[0] : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Management & Danger Zone */}
              <div className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/30 flex items-center justify-between gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => onEditParty(party)}
                  className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors border border-outline-variant/30"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Edit Party Details</span>
                </button>

                {onDeleteParty && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 rounded-xl bg-error/10 hover:bg-error/20 text-error text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors border border-error/20"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    <span>Delete Party</span>
                  </button>
                )}
              </div>

              {/* Delete Confirmation Modal */}
              {showDeleteConfirm && (
                <div className="p-4 bg-error-container/20 rounded-xl border border-error/30 flex flex-col gap-2.5 animate-in fade-in">
                  <div className="flex items-center gap-2 text-error">
                    <span className="material-symbols-outlined text-[20px]">warning</span>
                    <h4 className="font-bold text-xs">Are you sure you want to delete {party.name}?</h4>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    This will remove the party from your contact list. Historical invoices and vouchers will remain in the database.
                  </p>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 rounded-lg bg-surface-container text-xs font-bold text-on-surface cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        onDeleteParty?.(party.id);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-error text-on-error text-xs font-bold cursor-pointer active:scale-95"
                    >
                      Yes, Delete Party
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
