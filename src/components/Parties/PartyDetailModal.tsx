import React, { useState } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';

interface PartyDetailModalProps {
  party: Party;
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  onClose: () => void;
  onEditParty: (party: Party) => void;
  onRecordPayment: (party: Party, amount: number, paymentMode: string, notes: string) => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

interface PassbookEntry {
  id: string;
  date: string;
  docNumber: string;
  type: 'SALE' | 'PURCHASE' | 'PAYMENT_IN' | 'PAYMENT_OUT';
  description: string;
  debit: number;
  credit: number;
  status?: string;
  rawInvoice?: Invoice;
}

export const PartyDetailModal: React.FC<PartyDetailModalProps> = ({
  party,
  company,
  invoices,
  purchases,
  onClose,
  onEditParty,
  onRecordPayment,
  onViewInvoice,
}) => {
  const [activeTab, setActiveTab] = useState<'PASSBOOK' | 'PAYMENT' | 'PROFILE'>('PASSBOOK');
  const [paymentAmount, setPaymentAmount] = useState<string>(
    party.currentBalance !== 0 ? Math.abs(party.currentBalance).toString() : ''
  );
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Collect party's sales transactions
  const partyInvoices = invoices.filter(
    (inv) => inv.partyId === party.id || inv.partyName.toLowerCase() === party.name.toLowerCase()
  );

  // Collect party's purchase transactions
  const partyPurchases = purchases.filter(
    (pur) => pur.supplierId === party.id || pur.supplierName.toLowerCase() === party.name.toLowerCase()
  );

  // Build sorted passbook
  const passbook: PassbookEntry[] = [];

  partyInvoices.forEach((inv) => {
    // Sale Bill (Debit for Customer)
    passbook.push({
      id: `sale-${inv.id}`,
      date: inv.date,
      docNumber: inv.invoiceNumber,
      type: 'SALE',
      description: `Sales Invoice #${inv.invoiceNumber} (${inv.items.length} items)`,
      debit: inv.grandTotal,
      credit: 0,
      status: inv.paymentStatus,
      rawInvoice: inv,
    });

    // If paid amount exists on this invoice
    if (inv.paidAmount > 0) {
      passbook.push({
        id: `pay-${inv.id}`,
        date: inv.date,
        docNumber: `RCPT-${inv.invoiceNumber}`,
        type: 'PAYMENT_IN',
        description: `Payment received (${inv.paymentMode})`,
        debit: 0,
        credit: inv.paidAmount,
        status: 'PAID',
      });
    }
  });

  partyPurchases.forEach((pur) => {
    // Purchase Bill (Credit for Supplier)
    passbook.push({
      id: `pur-${pur.id}`,
      date: pur.date,
      docNumber: pur.billNumber,
      type: 'PURCHASE',
      description: `Purchase Inward Bill #${pur.billNumber}`,
      debit: 0,
      credit: pur.grandTotal,
      status: pur.paymentStatus,
    });

    if (pur.paidAmount > 0) {
      passbook.push({
        id: `pay-pur-${pur.id}`,
        date: pur.date,
        docNumber: `PYMT-${pur.billNumber}`,
        type: 'PAYMENT_OUT',
        description: `Payment made to vendor (${pur.paymentMode})`,
        debit: pur.paidAmount,
        credit: 0,
        status: 'PAID',
      });
    }
  });

  // Sort chronologically ascending for passbook running balance
  passbook.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate totals
  const totalBilled = partyInvoices.reduce((s, inv) => s + inv.grandTotal, 0);
  const totalPaid = partyInvoices.reduce((s, inv) => s + inv.paidAmount, 0);

  const isCustomer = party.type === 'CUSTOMER';
  const isReceivable = party.currentBalance > 0;
  const isPayable = party.currentBalance < 0;

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return;
    onRecordPayment(party, amt, paymentMode, paymentNotes);
    setActiveTab('PASSBOOK');
  };

  const handleShareWhatsAppStatement = () => {
    const bizName = company.tradeName || company.businessName || 'Vyapar Books';
    const upiLink = company.upiId
      ? `upi://pay?pa=${encodeURIComponent(company.upiId)}&pn=${encodeURIComponent(
          bizName
        )}&am=${Math.abs(party.currentBalance)}&cu=INR`
      : '';

    const text =
      `*STATEMENT OF ACCOUNT*\n` +
      `*${bizName}*\n` +
      `GSTIN: ${company.gstin || 'N/A'}\n\n` +
      `*Party Name:* ${party.name}\n` +
      `*Contact:* ${party.phone}\n` +
      `*Date:* ${new Date().toLocaleDateString('en-IN')}\n\n` +
      `*Total Invoices:* ${partyInvoices.length} (${formatINR(totalBilled)})\n` +
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

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-outline-variant/30 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header Card */}
        <div className="bg-surface-container-low p-4 sm:p-5 border-b border-outline-variant/20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container font-extrabold flex items-center justify-center text-lg shadow-sm">
                {party.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface">
                    {party.name}
                  </h2>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isCustomer
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-primary-container text-on-primary-container'
                    }`}
                  >
                    {party.type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
                  <a
                    href={`tel:${party.phone}`}
                    className="flex items-center gap-0.5 hover:text-secondary underline"
                  >
                    <span className="material-symbols-outlined text-[13px]">phone</span>
                    {party.phone}
                  </a>
                  {party.gstin && (
                    <>
                      <span>•</span>
                      <span className="font-mono text-secondary font-semibold">
                        GST: {party.gstin}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onEditParty(party)}
                className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[15px]">edit</span>
                <span>Edit</span>
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          {/* Balance & Financial Snapshot Cards */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                Current Balance
              </span>
              <span
                className={`font-currency-display-mobile text-base sm:text-lg font-extrabold mt-0.5 ${
                  isReceivable
                    ? 'text-secondary'
                    : isPayable
                    ? 'text-error'
                    : 'text-on-surface-variant'
                }`}
              >
                {formatINR(Math.abs(party.currentBalance))}
              </span>
              <span className="text-[10px] font-bold text-on-surface-variant">
                {isReceivable ? 'To Collect (Dr)' : isPayable ? 'To Pay (Cr)' : 'Settled ₹0'}
              </span>
            </div>

            <div className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                Total Invoiced
              </span>
              <span className="font-currency-display-mobile text-base sm:text-lg font-extrabold text-on-surface mt-0.5">
                {formatINR(totalBilled)}
              </span>
              <span className="text-[10px] text-on-surface-variant">
                {partyInvoices.length} Bills Issued
              </span>
            </div>

            <div className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                Total Paid
              </span>
              <span className="font-currency-display-mobile text-base sm:text-lg font-extrabold text-secondary mt-0.5">
                {formatINR(totalPaid)}
              </span>
              <span className="text-[10px] text-on-surface-variant">Collections Recorded</span>
            </div>
          </div>

          {/* Quick Actions Row */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              onClick={() => setActiveTab('PAYMENT')}
              className="px-3.5 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              <span>{isCustomer ? '+ Record Payment In' : '+ Record Payment Out'}</span>
            </button>

            <button
              onClick={handleShareWhatsAppStatement}
              className="px-3.5 py-1.5 rounded-xl bg-[#25D366] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              <span>WhatsApp Statement</span>
            </button>

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined text-[15px]">print</span>
              <span>Print Ledger</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-outline-variant/20 bg-surface-container-lowest px-4">
          <button
            onClick={() => setActiveTab('PASSBOOK')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'PASSBOOK'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            Transaction Passbook ({passbook.length})
          </button>
          <button
            onClick={() => setActiveTab('PAYMENT')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'PAYMENT'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            Record Payment
          </button>
          <button
            onClick={() => setActiveTab('PROFILE')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'PROFILE'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
          >
            Party Profile Details
          </button>
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[50vh]">
          {activeTab === 'PASSBOOK' && (
            <div className="flex flex-col gap-2">
              {passbook.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant bg-surface-container-low rounded-xl border border-outline-variant/20">
                  <span className="material-symbols-outlined text-[36px] text-outline">
                    receipt_long
                  </span>
                  <p className="mt-2 text-xs font-medium">No transactions recorded for this party yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/20 text-on-surface-variant font-bold uppercase text-[10px]">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Doc #</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3 text-right">Debit (₹)</th>
                        <th className="py-2 px-3 text-right">Credit (₹)</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 font-body-sm">
                      {passbook.map((entry) => (
                        <tr
                          key={entry.id}
                          className="hover:bg-surface-container-low/60 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-on-surface-variant whitespace-nowrap">
                            {entry.date}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-secondary whitespace-nowrap">
                            {entry.rawInvoice ? (
                              <button
                                onClick={() => onViewInvoice?.(entry.rawInvoice!)}
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
                          <td className="py-2.5 px-3 text-right font-tabular-data font-bold text-on-surface">
                            {entry.debit > 0 ? formatINR(entry.debit) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-tabular-data font-bold text-secondary">
                            {entry.credit > 0 ? formatINR(entry.credit) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {entry.status && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  entry.status === 'PAID'
                                    ? 'bg-secondary-container text-on-secondary-container'
                                    : entry.status === 'PARTIAL'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-error-container text-on-error-container'
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

          {activeTab === 'PAYMENT' && (
            <form onSubmit={handlePaymentSubmit} className="flex flex-col gap-3 max-w-md mx-auto py-2">
              <div className="bg-secondary-container/20 p-3 rounded-xl border border-secondary/20 text-xs">
                <span className="font-bold text-secondary">
                  Recording payment for {party.name}
                </span>
                <p className="text-on-surface-variant mt-0.5">
                  Outstanding: <strong>{formatINR(Math.abs(party.currentBalance))}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Payment Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface font-extrabold text-base focus:border-secondary focus:outline-none"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Payment Mode
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                        paymentMode === mode
                          ? 'bg-secondary text-on-secondary shadow-sm'
                          : 'bg-surface-container text-on-surface'
                      }`}
                    >
                      {mode.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Reference / Narration
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-xs focus:border-secondary focus:outline-none"
                  placeholder="e.g. UTR / Cheque #991024 or settlement notes"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('PASSBOOK')}
                  className="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs cursor-pointer shadow-sm active:scale-95"
                >
                  Save Payment &amp; Balance
                </button>
              </div>
            </form>
          )}

          {activeTab === 'PROFILE' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-surface-container rounded-xl border border-outline-variant/20 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                  Billing Address
                </span>
                <span className="text-on-surface font-medium">
                  {party.billingAddress || 'No address provided'}
                </span>
              </div>

              <div className="p-3 bg-surface-container rounded-xl border border-outline-variant/20 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                  State &amp; State Code
                </span>
                <span className="text-on-surface font-medium">
                  State Code: {party.stateCode || '27'}
                </span>
              </div>

              <div className="p-3 bg-surface-container rounded-xl border border-outline-variant/20 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                  GSTIN / Tax ID
                </span>
                <span className="text-secondary font-mono font-bold">
                  {party.gstin || 'Unregistered / B2C Party'}
                </span>
              </div>

              <div className="p-3 bg-surface-container rounded-xl border border-outline-variant/20 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                  Credit Limit
                </span>
                <span className="text-on-surface font-medium">
                  {party.creditLimit ? formatINR(party.creditLimit) : 'No Credit Limit Set'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
