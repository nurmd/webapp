import React, { useState, useEffect, useMemo } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentSplit } from '../../models/invoice.ts';
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
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[],
    discount?: number
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
  const isGstActive = company.isGstEnabled !== false;
  const allVouchers = vouchers || db.getVouchers();
  const allStates = getStateList();

  // Segmented switch: Customers vs Suppliers (Simplified clean layout)
  const [activeSegment, setActiveSegment] = useState<'CUSTOMERS' | 'SUPPLIERS'>(initialSegment);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVERDUE' | 'SETTLED'>(initialStatusFilter);
  // Party Sort Mode: loops RECENT -> NAME -> AMOUNT -> RECENT on repeated clicks when active
  const [sortMode, setSortMode] = useState<'RECENT' | 'NAME' | 'AMOUNT'>('RECENT');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedPartyForLedger, setSelectedPartyForLedger] = useState<Party | null>(null);

  // Precomputed lookup map of latest transaction timestamp against each party
  const partyLatestTxMap = useMemo(() => {
    const map = new Map<string, number>();
    const invList = invoices && invoices.length > 0 ? invoices : db.getInvoices();
    const purList = purchases && purchases.length > 0 ? purchases : db.getPurchases();
    const vchList = allVouchers;

    for (const p of parties) {
      let latest = 0;
      if (p.updatedAt) {
        const t = new Date(p.updatedAt).getTime();
        if (!isNaN(t) && t > latest) latest = t;
      }
      if (p.createdAt) {
        const t = new Date(p.createdAt).getTime();
        if (!isNaN(t) && t > latest) latest = t;
      }
      map.set(p.id, latest);
    }

    const checkAndUpdate = (pId?: string, pName?: string, dateStr?: string, createdStr?: string) => {
      const d = dateStr ? new Date(dateStr).getTime() : 0;
      const c = createdStr ? new Date(createdStr).getTime() : 0;
      const txTime = Math.max(isNaN(d) ? 0 : d, isNaN(c) ? 0 : c);
      if (txTime <= 0) return;

      if (pId && map.has(pId)) {
        if (txTime > (map.get(pId) || 0)) {
          map.set(pId, txTime);
        }
      } else if (pName) {
        const trimmed = pName.trim().toLowerCase();
        for (const p of parties) {
          if (p.name && p.name.trim().toLowerCase() === trimmed) {
            if (txTime > (map.get(p.id) || 0)) {
              map.set(p.id, txTime);
            }
          }
        }
      }
    };

    for (const inv of invList) {
      checkAndUpdate(inv.partyId, inv.partyName, inv.date, inv.createdAt);
    }
    for (const pur of purList) {
      checkAndUpdate(pur.supplierId, pur.supplierName, pur.date, (pur as any).createdAt);
    }
    for (const vch of vchList) {
      checkAndUpdate((vch as any).partyId, (vch as any).partyName, vch.date, vch.createdAt);
      for (const entry of vch.entries || []) {
        checkAndUpdate(entry.accountId, entry.accountName, vch.date, vch.createdAt);
      }
    }

    return map;
  }, [parties, invoices, purchases, allVouchers]);

  // Click handlers for Customer & Supplier selectors with loop sorting when active
  const handleCustomersClick = () => {
    if (activeSegment !== 'CUSTOMERS') {
      // Normal behavior: switch segment & reset default sort to latest transaction
      setActiveSegment('CUSTOMERS');
      setStatusFilter('ALL');
      setSortMode('RECENT');
    } else {
      // Selector is already active: cycle sort mode in a loop: RECENT -> NAME -> AMOUNT -> RECENT
      setSortMode((prev) => {
        if (prev === 'RECENT') return 'NAME';
        if (prev === 'NAME') return 'AMOUNT';
        return 'RECENT';
      });
    }
  };

  const handleSuppliersClick = () => {
    if (activeSegment !== 'SUPPLIERS') {
      setActiveSegment('SUPPLIERS');
      setStatusFilter('ALL');
      setSortMode('RECENT');
    } else {
      setSortMode((prev) => {
        if (prev === 'RECENT') return 'NAME';
        if (prev === 'NAME') return 'AMOUNT';
        return 'RECENT';
      });
    }
  };

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

  useEffect(() => {
    const mainEl = document.getElementById('main-content-scroll');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [selectedPartyForLedger]);

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

  // Sorted parties according to active sort mode (Default: latest transaction against party)
  const sortedParties = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortMode === 'NAME') {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      if (sortMode === 'AMOUNT') {
        const balDiff = Math.abs(b.currentBalance) - Math.abs(a.currentBalance);
        if (balDiff !== 0) return balDiff;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      // Default: RECENT (Latest transaction against the party)
      const timeA = partyLatestTxMap.get(a.id) || 0;
      const timeB = partyLatestTxMap.get(b.id) || 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [filtered, sortMode, partyLatestTxMap]);

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
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[],
    discount?: number
  ) => {
    if (onRecordPartyPayment) {
      onRecordPartyPayment(party, amount, paymentMode, notes, paymentType, paymentSplits, discount);
    } else {
      const isPaymentIn = paymentType ? paymentType === 'IN' : party.type === 'CUSTOMER';
      const totalSettled = amount + (discount || 0);
      const newBal = isPaymentIn
        ? party.currentBalance - totalSettled
        : party.currentBalance + totalSettled;
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
            onClick={handleCustomersClick}
            className={`flex-1 min-h-[40px] py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer text-xs font-bold active:scale-95 ${
              activeSegment === 'CUSTOMERS'
                ? 'bg-surface-container-lowest shadow-xs text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            }`}
            title={
              activeSegment === 'CUSTOMERS'
                ? `Active Customer Selector — Press again to cycle sort: ${sortMode === 'RECENT' ? 'Recent Tx → Name' : sortMode === 'NAME' ? 'Name → Amount' : 'Amount → Recent Tx'}`
                : 'Switch to Customers'
            }
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">groups</span>
            <span>Customers</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary/10 text-secondary font-bold">
              {customers.length}
            </span>
            {activeSegment === 'CUSTOMERS' && (
              <span
                className="material-symbols-outlined text-[14px] text-secondary shrink-0"
                title={`Sort: ${sortMode === 'RECENT' ? 'Recent Tx' : sortMode === 'NAME' ? 'Name (A-Z)' : 'Amount'}`}
              >
                {sortMode === 'RECENT' ? 'schedule' : sortMode === 'NAME' ? 'sort_by_alpha' : 'payments'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleSuppliersClick}
            className={`flex-1 min-h-[40px] py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer text-xs font-bold active:scale-95 ${
              activeSegment === 'SUPPLIERS'
                ? 'bg-surface-container-lowest shadow-xs text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            }`}
            title={
              activeSegment === 'SUPPLIERS'
                ? `Active Supplier Selector — Press again to cycle sort: ${sortMode === 'RECENT' ? 'Recent Tx → Name' : sortMode === 'NAME' ? 'Name → Amount' : 'Amount → Recent Tx'}`
                : 'Switch to Suppliers'
            }
          >
            <span className="material-symbols-outlined text-[16px] text-primary">local_shipping</span>
            <span>Suppliers</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold">
              {suppliers.length}
            </span>
            {activeSegment === 'SUPPLIERS' && (
              <span
                className="material-symbols-outlined text-[14px] text-primary shrink-0"
                title={`Sort: ${sortMode === 'RECENT' ? 'Recent Tx' : sortMode === 'NAME' ? 'Name (A-Z)' : 'Amount'}`}
              >
                {sortMode === 'RECENT' ? 'schedule' : sortMode === 'NAME' ? 'sort_by_alpha' : 'payments'}
              </span>
            )}
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
              isGstActive
                ? (activeSegment === 'CUSTOMERS'
                    ? 'Search customer by name, phone, GSTIN...'
                    : 'Search supplier by name, phone, GSTIN...')
                : (activeSegment === 'CUSTOMERS'
                    ? 'Search customer by name, phone...'
                    : 'Search supplier by name, phone...')
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
              title="Clear search"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`min-h-[36px] sm:min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95 ${
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
            className={`min-h-[36px] sm:min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
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
            className={`min-h-[36px] sm:min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
              statusFilter === 'SETTLED'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Settled ({activeSegment === 'CUSTOMERS' ? settledCustomersCount : settledSuppliersCount})</span>
          </button>

          {/* Quick Sort Toggle Loop Pill */}
          <button
            type="button"
            onClick={activeSegment === 'CUSTOMERS' ? handleCustomersClick : handleSuppliersClick}
            className="min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 bg-surface-container-lowest text-secondary hover:bg-secondary/10 border border-secondary/30 ml-auto shrink-0"
            title={`Click to cycle sort: ${sortMode === 'RECENT' ? 'Recent Transactions' : sortMode === 'NAME' ? 'Name (A-Z)' : 'Amount'}`}
          >
            <span className="material-symbols-outlined text-[15px]">
              {sortMode === 'RECENT' ? 'schedule' : sortMode === 'NAME' ? 'sort_by_alpha' : 'payments'}
            </span>
            <span className="hidden sm:inline">
              {sortMode === 'RECENT' ? 'Recent Tx' : sortMode === 'NAME' ? 'Name (A-Z)' : 'Amount'}
            </span>
          </button>
        </div>
      </section>

      {/* 4. Streamlined Passbook-Style Simplified Parties Feed */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {sortedParties.length === 0 ? (
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
          sortedParties.map((party) => {
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
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : isPayable
                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                        : 'bg-secondary/10 text-secondary'
                    }`}
                  >
                    {party.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span data-testid="party-card-name" className="font-headline-sm text-xs sm:text-sm text-on-surface font-bold truncate">
                        {party.name}
                      </span>
                      {isGstActive && party.gstin && (
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
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : isPayable
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-secondary'
                      }`}
                    >
                      {isSettled ? '₹0' : formatINR(Math.abs(party.currentBalance))}
                    </span>
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded-md mt-0.5 ${
                        isReceivable
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                          : isPayable
                          ? 'text-rose-700 dark:text-rose-400 bg-rose-500/10'
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
                      className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg bg-surface-container-low text-secondary hover:bg-secondary/10 flex items-center justify-center active:scale-95 transition-all cursor-pointer ml-0.5"
                      title="Send WhatsApp Reminder"
                      aria-label="Send WhatsApp reminder"
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
