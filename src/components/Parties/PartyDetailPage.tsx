import React, { useState, useEffect } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { db } from '../../services/db.ts';
import { SimplifiedPurchaseModal } from '../Purchases/SimplifiedPurchaseModal.tsx';
import { SimplifiedInvoiceModal } from '../Invoicing/SimplifiedInvoiceModal.tsx';
import { usePartyPassbook, PassbookEntry } from './usePartyPassbook.ts';
import { PartyInfoCard } from './PartyInfoCard.tsx';
import { RecordPaymentModal } from './RecordPaymentModal.tsx';
import { VoucherEditorModal } from './VoucherEditorModal.tsx';
import { PartyPassbookTable } from './PartyPassbookTable.tsx';

export type { PassbookEntry } from './usePartyPassbook.ts';

export interface PartyDetailPageProps {
  party: Party;
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  vouchers?: Voucher[];
  onBack: () => void;
  onEditParty: (party: Party) => void;
  onDeleteParty?: (id: string) => void;
  onRecordPayment: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[]
  ) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onCreateInvoice?: (party: Party) => void;
  onCreatePurchase?: (party: Party) => void;
  onRefresh?: () => void;
}

export const PartyDetailPage: React.FC<PartyDetailPageProps> = ({
  party,
  company,
  invoices = [],
  purchases = [],
  vouchers = [],
  onBack,
  onEditParty,
  onDeleteParty,
  onRecordPayment,
  onViewInvoice,
  onEditInvoice,
  onEditPurchase,
  onCreateInvoice,
  onCreatePurchase,
  onRefresh,
}) => {
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [showPartyDetails, setShowPartyDetails] = useState(false);
  const [editingLedgerEntry, setEditingLedgerEntry] = useState<PassbookEntry | null>(null);
  const [selectedPurchaseBill, setSelectedPurchaseBill] = useState<PurchaseBill | null>(null);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<Invoice | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const offset = window.scrollY || document.documentElement.scrollTop;
      setIsScrolled(offset > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const {
    isCustomer,
    totalBilled,
    totalPaid,
    liveNetBalance,
    isReceivable,
    isPayable,
    txnFilter,
    setTxnFilter,
    txnSortOrder,
    setTxnSortOrder,
    searchTxn,
    setSearchTxn,
    filteredPassbook,
    handlePrintStatement,
    handleWhatsAppReminder,
  } = usePartyPassbook({
    party,
    company,
    invoices,
    purchases,
    vouchers,
  });

  // Priority 15 back navigation handling for Android back button / escape
  useBackNavigation(() => {
    if (selectedInvoiceForView) {
      setSelectedInvoiceForView(null);
      return true;
    }
    if (selectedPurchaseBill) {
      setSelectedPurchaseBill(null);
      return true;
    }
    if (editingLedgerEntry) {
      setEditingLedgerEntry(null);
      return true;
    }
    if (isPaymentOpen) {
      setIsPaymentOpen(false);
      return true;
    }
    if (showPartyDetails) {
      setShowPartyDetails(false);
      return true;
    }
    onBack();
    return true;
  }, true, 15);

  const handleDelete = () => {
    if (window.confirm(`Delete party "${party.name}"? This removes them from your active contacts list.`)) {
      onDeleteParty?.(party.id);
    }
  };

  const handleTransactionClick = (entry: PassbookEntry) => {
    if (entry.type === 'SALE' && entry.rawInvoice) {
      setSelectedInvoiceForView(entry.rawInvoice);
    } else if (entry.type === 'PURCHASE' && entry.rawPurchase) {
      setSelectedPurchaseBill(entry.rawPurchase);
    } else {
      setEditingLedgerEntry(entry);
    }
  };

  const handleDeleteInvoiceBill = (inv: Invoice) => {
    if (!window.confirm(`Delete Invoice #${inv.invoiceNumber}? This will restore inventory stock.`)) return;

    // Restore stock
    const allItems = db.getItems();
    for (const line of inv.items) {
      if (line.itemId) {
        const itm = allItems.find((i) => i.id === line.itemId);
        if (itm) {
          itm.currentStock += line.quantity;
          db.saveItem(itm);
        }
      }
    }

    // Rollback party balance: when deleted, receivable is reduced by unpaid balance
    const unpaidBal = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : (inv.grandTotal - (inv.paidAmount || 0));
    db.saveParty({
      ...party,
      currentBalance: party.currentBalance - unpaidBal,
      updatedAt: new Date().toISOString(),
    });

    db.deleteInvoice(inv.id);
    setSelectedInvoiceForView(null);
    onRefresh?.();
  };

  const handleDeletePurchaseBill = (bill: PurchaseBill) => {
    if (!window.confirm(`Delete Purchase Bill #${bill.billNumber}? This will revert any stock added by this bill.`)) return;

    // Rollback stock
    const allItems = db.getItems();
    for (const line of bill.items) {
      if (line.itemId) {
        const itm = allItems.find((i) => i.id === line.itemId);
        if (itm) {
          itm.currentStock = Math.max(0, itm.currentStock - line.quantity);
          db.saveItem(itm);
        }
      }
    }

    // Rollback party balance: when deleted, liability is reduced by the unpaid balance
    const unpaidBal = typeof bill.balanceAmount === 'number' ? bill.balanceAmount : (bill.grandTotal - (bill.paidAmount || 0));
    db.saveParty({
      ...party,
      currentBalance: party.currentBalance + unpaidBal,
      updatedAt: new Date().toISOString(),
    });

    db.deletePurchase(bill.id);
    setSelectedPurchaseBill(null);
    onRefresh?.();
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col animate-fade-in pb-8">
      {/* 1. Mobile-Optimized Sticky Top Navigation */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-outline-variant/20 px-3 py-2 sm:px-6 sm:py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Back button & Party Identity */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1 rounded-xl text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer flex items-center gap-1"
              title="Back to Parties"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>

            <div
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                isCustomer ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'
              }`}
            >
              {party.name.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface truncate">
                  {party.name}
                </h1>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full flex-shrink-0 ${
                    isCustomer ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'
                  }`}
                >
                  {isCustomer ? 'Buyer' : 'Vendor'}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant truncate">
                <a href={`tel:${party.phone}`} className="text-secondary font-medium hover:underline">
                  {party.phone}
                </a>
              </p>
            </div>
          </div>

          {/* Quick Header Tools (Call, WhatsApp, Edit) */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <a
              href={`tel:${party.phone}`}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-secondary flex items-center justify-center transition-colors"
              title="Call"
            >
              <span className="material-symbols-outlined text-[17px]">call</span>
            </a>

            <button
              type="button"
              onClick={handleWhatsAppReminder}
              className="w-8 h-8 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] flex items-center justify-center cursor-pointer transition-colors"
              title="WhatsApp"
            >
              <span className="material-symbols-outlined text-[17px]">chat</span>
            </button>

            <button
              type="button"
              onClick={() => onEditParty(party)}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
              title="Edit Profile"
            >
              <span className="material-symbols-outlined text-[17px]">edit</span>
            </button>

            {onDeleteParty && (
              <button
                type="button"
                onClick={handleDelete}
                className="w-8 h-8 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 flex items-center justify-center transition-colors cursor-pointer"
                title="Delete Party"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main Responsive Content Container */}
      <main className="max-w-7xl w-full mx-auto p-2.5 sm:p-4 md:p-6 flex-1 flex flex-col gap-2.5 sm:gap-3.5">
        {/* Mobile Floating Card (Compacts upon scroll to just party name and balance with smooth animation) */}
        <div
          className={`md:hidden sticky top-[48px] sm:top-[52px] z-20 transition-all duration-300 ease-in-out ${
            isScrolled
              ? 'py-2 px-3.5 bg-surface-container-lowest/95 backdrop-blur-md rounded-2xl border border-outline-variant/30 shadow-md my-0.5'
              : 'bg-transparent mb-0.5'
          }`}
        >
          {/* Compact View: Just Party Name & Balance */}
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`transition-all duration-300 ease-in-out cursor-pointer ${
              isScrolled
                ? 'opacity-100 max-h-12 scale-100 pointer-events-auto'
                : 'opacity-0 max-h-0 scale-95 pointer-events-none overflow-hidden'
            }`}
            title="Tap to scroll to top"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                    isCustomer ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'
                  }`}
                >
                  {party.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs font-bold text-on-surface truncate">
                    {party.name}
                  </h2>
                  <span className="text-[10px] text-on-surface-variant truncate block -mt-0.5">
                    {isCustomer ? 'Customer' : 'Supplier'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span
                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                    isReceivable
                      ? 'bg-error/10 text-error'
                      : isPayable
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-secondary/10 text-secondary'
                  }`}
                >
                  {isReceivable ? 'Due' : isPayable ? 'To Pay' : 'Settled'}
                </span>
                <span
                  className={`font-currency-display-mobile text-xs font-black ${
                    isReceivable
                      ? 'text-error'
                      : isPayable
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-secondary'
                  }`}
                >
                  {liveNetBalance === 0 ? '₹0' : formatINR(Math.abs(liveNetBalance))}
                </span>
              </div>
            </div>
          </div>

          {/* Full Expanded Card on Mobile (visible when not scrolled) */}
          <div
            className={`transition-all duration-300 ease-in-out ${
              !isScrolled
                ? 'opacity-100 max-h-[1000px] scale-100 pointer-events-auto'
                : 'opacity-0 max-h-0 scale-98 pointer-events-none overflow-hidden'
            }`}
          >
            <PartyInfoCard
              party={party}
              company={company}
              liveNetBalance={liveNetBalance}
              isReceivable={isReceivable}
              isPayable={isPayable}
              totalBilled={totalBilled}
              totalPaid={totalPaid}
              showPartyDetails={showPartyDetails}
              setShowPartyDetails={setShowPartyDetails}
              onEditParty={onEditParty}
            />
          </div>
        </div>

        {/* Responsive Layout: Two-Column on Tablet/Wide, Single-Column on Mobile */}
        <div className="flex flex-col md:flex-row md:items-start md:gap-6 flex-1">
          {/* Left Column (Tablet & Wide View: Non-scrolling Party Details + Payment + New Invoice) */}
          <div className="w-full md:w-[360px] lg:w-[400px] flex-shrink-0 md:sticky md:top-20 md:self-start md:max-h-[calc(100vh-6rem)] md:overflow-y-auto no-scrollbar flex flex-col gap-2.5 sm:gap-3.5">
            {/* Desktop / Tablet Full Party Info Card */}
            <div className="hidden md:block">
              <PartyInfoCard
                party={party}
                company={company}
                liveNetBalance={liveNetBalance}
                isReceivable={isReceivable}
                isPayable={isPayable}
                totalBilled={totalBilled}
                totalPaid={totalPaid}
                showPartyDetails={showPartyDetails}
                setShowPartyDetails={setShowPartyDetails}
                onEditParty={onEditParty}
              />
            </div>

            {/* Quick Actions Bar (Payment & New Invoice / Bill) */}
            <section className="flex items-center gap-2">
              {/* Record Payment */}
              <button
                type="button"
                onClick={() => setIsPaymentOpen(!isPaymentOpen)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs ${
                  isPaymentOpen
                    ? 'bg-secondary text-on-secondary'
                    : 'bg-secondary/10 text-secondary border border-secondary/25 hover:bg-secondary/20'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">
                  {isPaymentOpen ? 'close' : 'payments'}
                </span>
                <span>{isPaymentOpen ? 'Close Payment' : 'Record Payment'}</span>
              </button>

              {/* Action: New Invoice for Customer, New Bill for Supplier */}
              {isCustomer ? (
                onCreateInvoice && (
                  <button
                    type="button"
                    onClick={() => onCreateInvoice(party)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90"
                    title="Create new sales invoice for this customer"
                  >
                    <span className="material-symbols-outlined text-[17px]">receipt_long</span>
                    <span>New Invoice</span>
                  </button>
                )
              ) : (
                onCreatePurchase ? (
                  <button
                    type="button"
                    onClick={() => onCreatePurchase(party)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90"
                    title="Create new purchase bill from this supplier"
                  >
                    <span className="material-symbols-outlined text-[17px]">shopping_bag</span>
                    <span>New Bill</span>
                  </button>
                ) : onCreateInvoice && (
                  <button
                    type="button"
                    onClick={() => onCreateInvoice(party)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90"
                    title="Create new sales invoice"
                  >
                    <span className="material-symbols-outlined text-[17px]">receipt_long</span>
                    <span>New Invoice</span>
                  </button>
                )
              )}

              {/* Print Statement */}
              <button
                type="button"
                onClick={handlePrintStatement}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0"
                title="Print Ledger Statement"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
              </button>
            </section>

            {/* Collapsible Record Payment Drawer */}
            <RecordPaymentModal
              isOpen={isPaymentOpen}
              onClose={() => setIsPaymentOpen(false)}
              party={party}
              liveNetBalance={liveNetBalance}
              isCustomer={isCustomer}
              onRecordPayment={onRecordPayment}
              onRefresh={onRefresh}
            />
          </div>

          {/* Right Column: Transaction Ledger */}
          <div className="w-full flex-1 min-w-0 mt-1 md:mt-0 flex flex-col gap-2.5 sm:gap-3.5">
            <PartyPassbookTable
              filteredPassbook={filteredPassbook}
              txnFilter={txnFilter}
              setTxnFilter={setTxnFilter}
              txnSortOrder={txnSortOrder}
              setTxnSortOrder={setTxnSortOrder}
              searchTxn={searchTxn}
              setSearchTxn={setSearchTxn}
              onTransactionClick={handleTransactionClick}
            />
          </div>
        </div>
      </main>

      {/* Edit Ledger Item Modal */}
      <VoucherEditorModal
        editingLedgerEntry={editingLedgerEntry}
        onClose={() => setEditingLedgerEntry(null)}
        party={party}
        onViewInvoice={onViewInvoice}
        onEditInvoice={onEditInvoice}
        onEditPurchase={onEditPurchase}
        onViewPurchase={(bill) => setSelectedPurchaseBill(bill)}
        onRefresh={onRefresh}
      />

      {/* Simplified Purchase View Modal */}
      {selectedPurchaseBill && (
        <SimplifiedPurchaseModal
          bill={selectedPurchaseBill}
          company={company}
          onClose={() => setSelectedPurchaseBill(null)}
          onEditPurchase={(bill) => {
            setSelectedPurchaseBill(null);
            if (onEditPurchase) onEditPurchase(bill);
          }}
          onDeletePurchase={() => handleDeletePurchaseBill(selectedPurchaseBill)}
        />
      )}

      {/* Simplified Invoice View Modal */}
      {selectedInvoiceForView && (
        <SimplifiedInvoiceModal
          invoice={selectedInvoiceForView}
          company={company}
          onClose={() => setSelectedInvoiceForView(null)}
          onEditInvoice={(inv) => {
            setSelectedInvoiceForView(null);
            if (onEditInvoice) onEditInvoice(inv);
          }}
          onDeleteInvoice={() => handleDeleteInvoiceBill(selectedInvoiceForView)}
          onOpenFullA4Preview={(inv) => {
            setSelectedInvoiceForView(null);
            if (onViewInvoice) onViewInvoice(inv);
          }}
        />
      )}
    </div>
  );
};
