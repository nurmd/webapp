import React, { useState, useEffect } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getPaymentReminderWhatsAppUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
import { PartyDetailPage } from './PartyDetailPage.tsx';
import { AddEditPartyModal } from './AddEditPartyModal.tsx';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { isValidGstin, extractStateCodeFromGstin, extractPanFromGstin } from '../../core/gst/gstinUtils.ts';

interface PartiesViewProps {
  parties: Party[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  vouchers?: Voucher[];
  initialSegment?: 'CUSTOMERS' | 'SUPPLIERS';
  initialStatusFilter?: 'ALL' | 'OVERDUE' | 'SETTLED';
  onSaveParty: (party: Party) => void;
  onDeleteParty: (id: string) => void;
  onRecordPartyPayment?: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT'
  ) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onCreateInvoice?: (party: Party) => void;
  onCreatePurchase?: (party: Party) => void;
  onRefresh?: () => void;
}

export const PartiesView: React.FC<PartiesViewProps> = ({
  parties,
  invoices = [],
  purchases = [],
  vouchers,
  initialSegment = 'CUSTOMERS',
  initialStatusFilter = 'ALL',
  onSaveParty,
  onDeleteParty,
  onRecordPartyPayment,
  onViewInvoice,
  onEditInvoice,
  onEditPurchase,
  onCreateInvoice,
  onCreatePurchase,
  onRefresh,
}) => {
  const company = db.getCompany();
  const allVouchers = vouchers || db.getVouchers();
  const allStates = getStateList();

  // Segmented switch: Customers vs Suppliers (Simplified clean layout)
  const [activeSegment, setActiveSegment] = useState<'CUSTOMERS' | 'SUPPLIERS'>(initialSegment);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVERDUE' | 'SETTLED'>(initialStatusFilter);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedPartyForLedger, setSelectedPartyForLedger] = useState<Party | null>(null);

  // Sync segment and status filter if parent props change (e.g. from Dashboard click)
  useEffect(() => {
    if (initialSegment) {
      setActiveSegment(initialSegment);
    }
  }, [initialSegment]);

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  // System back navigation handling
  useBackNavigation(() => {
    if (isModalOpen) {
      setIsModalOpen(false);
      setEditingParty(null);
      return true;
    }
    return false;
  }, isModalOpen, 20);

  // Partitioned lists
  const customers = parties.filter((p) => p.type === 'CUSTOMER');
  const suppliers = parties.filter((p) => p.type === 'SUPPLIER');

  // Metrics
  const totalReceivables = customers
    .filter((p) => p.currentBalance > 0)
    .reduce((s, p) => s + p.currentBalance, 0);

  const totalPayables = suppliers
    .filter((p) => p.currentBalance < 0)
    .reduce((s, p) => s + Math.abs(p.currentBalance), 0);

  const overdueCustomersCount = customers.filter((p) => p.currentBalance > 0).length;
  const overdueSuppliersCount = suppliers.filter((p) => p.currentBalance < 0).length;
  const settledCustomersCount = customers.filter((p) => p.currentBalance === 0).length;
  const settledSuppliersCount = suppliers.filter((p) => p.currentBalance === 0).length;

  const activePartiesList = activeSegment === 'CUSTOMERS' ? customers : suppliers;

  const filtered = activePartiesList.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q)) ||
      (p.gstin && p.gstin.toLowerCase().includes(q)) ||
      (p.pan && p.pan.toLowerCase().includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      p.billingAddress.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (statusFilter === 'OVERDUE') {
      return activeSegment === 'CUSTOMERS' ? p.currentBalance > 0 : p.currentBalance < 0;
    }
    if (statusFilter === 'SETTLED') {
      return p.currentBalance === 0;
    }
    return true;
  });

  const handleOpenAddModal = () => {
    setEditingParty(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (party: Party) => {
    setEditingParty(party);
    setIsModalOpen(true);
  };

  const handleRecordPayment = (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT'
  ) => {
    if (onRecordPartyPayment) {
      onRecordPartyPayment(party, amount, paymentMode, notes, paymentType);
    } else {
      const isPaymentIn = paymentType ? paymentType === 'IN' : party.type === 'CUSTOMER';
      const newBal = isPaymentIn
        ? party.currentBalance - amount
        : party.currentBalance + amount;
      const updatedParty = { ...party, currentBalance: newBal, updatedAt: new Date().toISOString() };
      onSaveParty(updatedParty);
      setSelectedPartyForLedger(updatedParty);
    }
  };

  const activePartyLedger = selectedPartyForLedger
    ? parties.find((p) => p.id === selectedPartyForLedger.id) || selectedPartyForLedger
    : null;

  if (activePartyLedger) {
    return (
      <div className="w-full">
        <PartyDetailPage
          party={activePartyLedger}
          company={company}
          invoices={invoices}
          purchases={purchases}
          vouchers={allVouchers}
          onBack={() => setSelectedPartyForLedger(null)}
          onEditParty={(p) => {
            setEditingParty(p);
            setIsModalOpen(true);
          }}
          onDeleteParty={(id) => {
            setSelectedPartyForLedger(null);
            onDeleteParty(id);
          }}
          onRecordPayment={handleRecordPayment}
          onViewInvoice={onViewInvoice}
          onEditInvoice={onEditInvoice}
          onEditPurchase={onEditPurchase}
          onCreateInvoice={onCreateInvoice}
          onCreatePurchase={onCreatePurchase}
          onRefresh={onRefresh}
        />

        <AddEditPartyModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingParty(null);
          }}
          onSave={(savedParty) => {
            onSaveParty(savedParty);
            if (selectedPartyForLedger?.id === savedParty.id) {
              setSelectedPartyForLedger(savedParty);
            }
          }}
          editingParty={editingParty}
          initialType={activeSegment === 'CUSTOMERS' ? 'CUSTOMER' : 'SUPPLIER'}
          parties={parties}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-28 max-w-7xl mx-auto px-margin-mobile md:px-6 py-2 sm:py-3 gap-2 sm:gap-3">
      {/* 1. Unified 1-Glance Financial Balance Summary */}
      <section className="pt-0.5">
        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 shadow-sm border border-outline-variant/20 grid grid-cols-2 divide-x divide-outline-variant/20">
          {/* You'll Get (Receivables) */}
          <div
            onClick={() => {
              setActiveSegment('CUSTOMERS');
              setStatusFilter('ALL');
            }}
            className={`pr-2.5 sm:pr-4 flex flex-col cursor-pointer transition-all ${
              activeSegment === 'CUSTOMERS' ? 'opacity-100 scale-[1.01]' : 'opacity-60 hover:opacity-85'
            }`}
          >
            <div className="flex items-center gap-1.5 text-secondary">
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">call_received</span>
              <span className="font-label-sm text-[10px] sm:text-[11px] uppercase tracking-wider font-bold">
                You'll Get
              </span>
            </div>
            <span className="font-headline-sm text-base sm:text-lg font-extrabold text-secondary mt-0.5 tracking-tight truncate">
              {formatINR(totalReceivables)}
            </span>
            <span className="text-[10px] text-on-surface-variant font-medium mt-0.5 truncate">
              {overdueCustomersCount} customers have dues
            </span>
          </div>

          {/* You'll Give (Payables) */}
          <div
            onClick={() => {
              setActiveSegment('SUPPLIERS');
              setStatusFilter('ALL');
            }}
            className={`pl-2.5 sm:pl-4 flex flex-col cursor-pointer transition-all ${
              activeSegment === 'SUPPLIERS' ? 'opacity-100 scale-[1.01]' : 'opacity-60 hover:opacity-85'
            }`}
          >
            <div className="flex items-center gap-1.5 text-error">
              <span className="material-symbols-outlined text-[16px] sm:text-[18px]">call_made</span>
              <span className="font-label-sm text-[10px] sm:text-[11px] uppercase tracking-wider font-bold">
                You'll Give
              </span>
            </div>
            <span className="font-headline-sm text-base sm:text-lg font-extrabold text-error mt-0.5 tracking-tight truncate">
              {formatINR(totalPayables)}
            </span>
            <span className="text-[10px] text-on-surface-variant font-medium mt-0.5 truncate">
              {overdueSuppliersCount} suppliers to pay
            </span>
          </div>
        </div>
      </section>

      {/* 2. Clean Segment Switcher: Customers vs Suppliers */}
      <section>
        <div className="bg-surface-container/70 p-1 rounded-xl flex items-center shadow-xs">
          <button
            type="button"
            onClick={() => {
              setActiveSegment('CUSTOMERS');
              setStatusFilter('ALL');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeSegment === 'CUSTOMERS'
                ? 'bg-surface-container-lowest shadow-xs text-on-surface font-bold'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">groups</span>
            <span className="text-xs">Customers</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary/10 text-secondary font-bold">
              {customers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSegment('SUPPLIERS');
              setStatusFilter('ALL');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeSegment === 'SUPPLIERS'
                ? 'bg-surface-container-lowest shadow-xs text-on-surface font-bold'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-primary">local_shipping</span>
            <span className="text-xs">Suppliers</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold">
              {suppliers.length}
            </span>
          </button>
        </div>
      </section>

      {/* 3. Search & Quick Filter Pills */}
      <section className="flex flex-col gap-1.5">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder={
              activeSegment === 'CUSTOMERS'
                ? 'Search customer by name, phone, GSTIN...'
                : 'Search supplier by name, phone, GSTIN...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-container-lowest pl-9 pr-8 py-2 rounded-xl text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none shadow-xs border border-outline-variant/20 transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-semibold shadow-xs transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
            }`}
          >
            All ({activePartiesList.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('OVERDUE')}
            className={`px-3 py-1 rounded-full text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'OVERDUE'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            <span>Pending Dues ({activeSegment === 'CUSTOMERS' ? overdueCustomersCount : overdueSuppliersCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SETTLED')}
            className={`px-3 py-1 rounded-full text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'SETTLED'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Settled ({activeSegment === 'CUSTOMERS' ? settledCustomersCount : settledSuppliersCount})</span>
          </button>
        </div>
      </section>

      {/* 4. Streamlined Passbook-Style Simplified Parties Feed */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filtered.length === 0 ? (
          <div className="md:col-span-2 bg-surface-container-lowest rounded-xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-xs">
            <span className="material-symbols-outlined text-[32px] text-outline mb-1">
              person_off
            </span>
            <p className="font-semibold text-xs text-on-surface">No {activeSegment.toLowerCase()} found</p>
            <p className="text-[11px] text-outline mt-0.5">
              {search ? 'Try clearing your search query' : 'Tap the button below to add your first party'}
            </p>
          </div>
        ) : (
          filtered.map((party) => {
            const isReceivable = party.currentBalance > 0;
            const isPayable = party.currentBalance < 0;
            const isSettled = party.currentBalance === 0;

            return (
              <div
                key={party.id}
                onClick={() => setSelectedPartyForLedger(party)}
                className="w-full bg-surface-container-lowest rounded-xl p-3 shadow-xs border border-outline-variant/20 flex items-center justify-between gap-3 active:scale-[0.99] transition-all cursor-pointer hover:shadow-md hover:border-secondary/30"
              >
                {/* Left: Avatar + Details */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                      isReceivable
                        ? 'bg-error/10 text-error'
                        : isPayable
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-secondary/10 text-secondary'
                    }`}
                  >
                    {party.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-headline-sm text-xs sm:text-sm text-on-surface font-bold truncate">
                        {party.name}
                      </span>
                      {party.gstin && (
                        <span
                          className="material-symbols-outlined text-[13px] text-secondary flex-shrink-0"
                          title={`GSTIN: ${party.gstin}`}
                        >
                          verified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant mt-0.5 truncate">
                      <span>{party.phone}</span>
                      {party.billingAddress && party.billingAddress !== 'Local Counter' && (
                        <>
                          <span className="text-outline-variant">•</span>
                          <span className="truncate">{party.billingAddress}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Balance + Quick WhatsApp Icon */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <div className="flex flex-col items-end text-right">
                    <span
                      className={`font-currency-display-mobile text-xs sm:text-sm font-extrabold tracking-tight ${
                        isReceivable
                          ? 'text-error'
                          : isPayable
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-secondary'
                      }`}
                    >
                      {isSettled ? '₹0' : formatINR(Math.abs(party.currentBalance))}
                    </span>
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded-md mt-0.5 ${
                        isReceivable
                          ? 'text-error bg-error/10'
                          : isPayable
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                          : 'text-secondary bg-secondary/10'
                      }`}
                    >
                      {isReceivable ? 'To Collect' : isPayable ? 'To Pay' : 'Settled'}
                    </span>
                  </div>

                  {/* WhatsApp Reminder Shortcut (if pending balance) */}
                  {party.currentBalance !== 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = getPaymentReminderWhatsAppUrl(
                          party.name,
                          party.phone,
                          party.currentBalance,
                          company.tradeName || company.businessName,
                          company.upiId
                        );
                        window.open(url, '_blank');
                      }}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-container-low text-secondary hover:bg-secondary/10 flex items-center justify-center active:scale-95 transition-all cursor-pointer ml-0.5"
                      title="Send WhatsApp Reminder"
                    >
                      <span className="material-symbols-outlined text-[15px] sm:text-[16px]">chat</span>
                    </button>
                  )}

                  <span className="material-symbols-outlined text-[16px] text-outline-variant">
                    chevron_right
                  </span>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* 5. Minimal Bottom Floating Action Button */}
      <div className="fixed bottom-20 right-4 z-40">
        <button
          onClick={handleOpenAddModal}
          className="h-11 px-4 rounded-full bg-secondary text-on-secondary font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer border border-white/10"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>{activeSegment === 'CUSTOMERS' ? '+ Customer' : '+ Supplier'}</span>
        </button>
      </div>

      {/* Comprehensive Add / Edit Party Modal */}
      <AddEditPartyModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingParty(null);
        }}
        onSave={(savedParty) => {
          onSaveParty(savedParty);
          if (selectedPartyForLedger?.id === savedParty.id) {
            setSelectedPartyForLedger(savedParty);
          }
        }}
        editingParty={editingParty}
        initialType={activeSegment === 'CUSTOMERS' ? 'CUSTOMER' : 'SUPPLIER'}
        parties={parties}
      />
    </div>
  );
};
