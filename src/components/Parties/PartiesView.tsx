import React, { useState } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getPaymentReminderWhatsAppUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
import { PartyDetailModal } from './PartyDetailModal.tsx';
import { getStateList, getStateByCode } from '../../core/gst/stateCodes.ts';
import { isValidGstin, extractStateCodeFromGstin, extractPanFromGstin } from '../../core/gst/gstinUtils.ts';

interface PartiesViewProps {
  parties: Party[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  vouchers?: Voucher[];
  onSaveParty: (party: Party) => void;
  onDeleteParty: (id: string) => void;
  onRecordPartyPayment?: (party: Party, amount: number, paymentMode: string, notes: string) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onCreateInvoice?: (party: Party) => void;
  onCreatePurchase?: (party: Party) => void;
}

export const PartiesView: React.FC<PartiesViewProps> = ({
  parties,
  invoices = [],
  purchases = [],
  vouchers,
  onSaveParty,
  onDeleteParty,
  onRecordPartyPayment,
  onViewInvoice,
  onCreateInvoice,
  onCreatePurchase,
}) => {
  const company = db.getCompany();
  const allVouchers = vouchers || db.getVouchers();
  const allStates = getStateList();

  // Segmented switch: Customers vs Suppliers (Stitch parties_ledger_simplified)
  const [activeSegment, setActiveSegment] = useState<'CUSTOMERS' | 'SUPPLIERS'>('CUSTOMERS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVERDUE' | 'SETTLED' | 'CREDIT_EXCEEDED'>('ALL');
  const [sortBy, setSortBy] = useState<'HIGHEST_DUE' | 'NAME_ASC' | 'RECENT'>('HIGHEST_DUE');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedPartyForLedger, setSelectedPartyForLedger] = useState<Party | null>(null);

  // Quick Card Payment Modal State
  const [quickPaymentParty, setQuickPaymentParty] = useState<Party | null>(null);
  const [quickPayAmount, setQuickPayAmount] = useState<string>('');
  const [quickPayMode, setQuickPayMode] = useState<string>('UPI');
  const [quickPayNotes, setQuickPayNotes] = useState<string>('');
  const [quickPayDate, setQuickPayDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Party Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [stateCode, setStateCode] = useState('27');
  const [address, setAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [hasSeparateShipping, setHasSeparateShipping] = useState(false);
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);

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

  const creditExceededCount = activePartiesList.filter(
    (p) => p.creditLimit && p.creditLimit > 0 && p.currentBalance > p.creditLimit
  ).length;

  // Filter & Search
  const filtered = activePartiesList
    .filter((p) => {
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
      if (statusFilter === 'CREDIT_EXCEEDED') {
        return !!(p.creditLimit && p.creditLimit > 0 && p.currentBalance > p.creditLimit);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'HIGHEST_DUE') {
        return Math.abs(b.currentBalance) - Math.abs(a.currentBalance);
      }
      if (sortBy === 'NAME_ASC') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'RECENT') {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA;
      }
      return 0;
    });

  const handleOpenAddModal = () => {
    setEditingParty(null);
    setName('');
    setType(activeSegment === 'CUSTOMERS' ? 'CUSTOMER' : 'SUPPLIER');
    setPhone('');
    setEmail('');
    setGstin('');
    setPan('');
    setStateCode('27');
    setAddress('');
    setShippingAddress('');
    setHasSeparateShipping(false);
    setCreditLimit('');
    setOpeningBalance(0);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (party: Party) => {
    setEditingParty(party);
    setName(party.name);
    setType(party.type);
    setPhone(party.phone);
    setEmail(party.email || '');
    setGstin(party.gstin || '');
    setPan(party.pan || '');
    setStateCode(party.stateCode || '27');
    setAddress(party.billingAddress || '');
    setShippingAddress(party.shippingAddress || '');
    setHasSeparateShipping(!!party.shippingAddress && party.shippingAddress !== party.billingAddress);
    setCreditLimit(party.creditLimit ? party.creditLimit.toString() : '');
    setOpeningBalance(party.currentBalance);
    setIsModalOpen(true);
  };

  const handleGstinInputChange = (val: string) => {
    const uppercaseVal = val.toUpperCase().trim();
    setGstin(uppercaseVal);

    // Auto extract State Code
    const detectedState = extractStateCodeFromGstin(uppercaseVal);
    if (detectedState) {
      setStateCode(detectedState);
    }

    // Auto extract PAN
    const detectedPan = extractPanFromGstin(uppercaseVal);
    if (detectedPan) {
      setPan(detectedPan);
    }
  };

  // Duplicate validations
  const duplicatePhoneParty = phone.trim()
    ? parties.find(
        (p) =>
          p.id !== editingParty?.id &&
          p.phone.replace(/\D/g, '') === phone.trim().replace(/\D/g, '') &&
          p.phone !== '9999999999'
      )
    : null;

  const duplicateGstinParty = gstin.trim()
    ? parties.find(
        (p) =>
          p.id !== editingParty?.id &&
          p.gstin &&
          p.gstin.trim().toUpperCase() === gstin.trim().toUpperCase()
      )
    : null;

  const handleSavePartyForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const numCreditLimit = creditLimit.trim() ? parseFloat(creditLimit) : undefined;

    const partyToSave: Party = {
      id: editingParty ? editingParty.id : 'PTY-' + Date.now(),
      name: name.trim(),
      type,
      phone: phone.trim() || '9999999999',
      email: email.trim() || undefined,
      gstin: gstin.trim().toUpperCase() || undefined,
      pan: pan.trim().toUpperCase() || undefined,
      stateCode: stateCode.trim() || '27',
      billingAddress: address.trim() || 'Local Counter',
      shippingAddress: hasSeparateShipping ? shippingAddress.trim() : undefined,
      creditLimit: numCreditLimit && numCreditLimit > 0 ? numCreditLimit : undefined,
      currentBalance: editingParty ? editingParty.currentBalance : openingBalance,
      createdAt: editingParty ? editingParty.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveParty(partyToSave);
    setIsModalOpen(false);
    setEditingParty(null);
    if (selectedPartyForLedger?.id === partyToSave.id) {
      setSelectedPartyForLedger(partyToSave);
    }
  };

  const handleRecordPayment = (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string
  ) => {
    if (onRecordPartyPayment) {
      onRecordPartyPayment(party, amount, paymentMode, notes);
    } else {
      const newBal =
        party.type === 'CUSTOMER'
          ? party.currentBalance - amount
          : party.currentBalance + amount;
      const updatedParty = { ...party, currentBalance: newBal, updatedAt: new Date().toISOString() };
      onSaveParty(updatedParty);
      setSelectedPartyForLedger(updatedParty);
    }
  };

  const handleOpenQuickCollect = (e: React.MouseEvent, party: Party) => {
    e.stopPropagation();
    setQuickPaymentParty(party);
    setQuickPayAmount(party.currentBalance !== 0 ? Math.abs(party.currentBalance).toString() : '');
    setQuickPayMode('UPI');
    setQuickPayNotes('');
    setQuickPayDate(new Date().toISOString().split('T')[0]);
  };

  // Find latest document reference for a party
  const getLatestDocRef = (party: Party) => {
    if (party.type === 'CUSTOMER') {
      const partyInv = invoices
        .filter((i) => i.partyId === party.id || i.partyName.toLowerCase() === party.name.toLowerCase())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return partyInv ? `${partyInv.invoiceNumber} • ${partyInv.date}` : 'No bills yet';
    } else {
      const partyPur = purchases
        .filter((p) => p.supplierId === party.id || p.supplierName.toLowerCase() === party.name.toLowerCase())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return partyPur ? `${partyPur.billNumber} • ${partyPur.date}` : 'No purchases yet';
    }
  };

  const activePartyLedger = selectedPartyForLedger
    ? parties.find((p) => p.id === selectedPartyForLedger.id) || selectedPartyForLedger
    : null;

  return (
    <div className="flex flex-col w-full pb-28 max-w-4xl mx-auto px-margin-mobile py-2 sm:py-3 gap-2.5 sm:gap-3">
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

      {/* 3. Search, Sort & Quick Filter Pills */}
      <section className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder={
                activeSegment === 'CUSTOMERS'
                  ? 'Search by name, phone, GSTIN, PAN...'
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

          {/* Sort Dropdown */}
          <div className="relative flex-shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-2.5 py-2 text-[11px] font-semibold text-on-surface focus:outline-none shadow-xs cursor-pointer"
            >
              <option value="HIGHEST_DUE">Sort: Highest Due</option>
              <option value="NAME_ASC">Sort: Name (A-Z)</option>
              <option value="RECENT">Sort: Recent</option>
            </select>
          </div>
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
          {creditExceededCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('CREDIT_EXCEEDED')}
              className={`px-3 py-1 rounded-full text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'CREDIT_EXCEEDED'
                  ? 'bg-error text-on-error'
                  : 'bg-error/10 text-error border border-error/20'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">warning</span>
              <span>Credit Exceeded ({creditExceededCount})</span>
            </button>
          )}
        </div>
      </section>

      {/* 4. Streamlined Passbook-Style Parties Card Feed (Stitch parties_ledger_simplified) */}
      <section className="flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-xs">
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
            const isCreditExceeded = !!(party.creditLimit && party.creditLimit > 0 && party.currentBalance > party.creditLimit);
            const latestDoc = getLatestDocRef(party);

            return (
              <div
                key={party.id}
                onClick={() => setSelectedPartyForLedger(party)}
                className="w-full bg-surface-container-lowest rounded-2xl p-3.5 shadow-xs border border-outline-variant/20 flex flex-col gap-2.5 active:bg-surface-container-low transition-all cursor-pointer hover:shadow-md hover:border-secondary/30"
              >
                {/* Top Row: Avatar + Name + Balance */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 shadow-xs ${
                        isReceivable
                          ? 'bg-error/15 text-error'
                          : isPayable
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-secondary/15 text-secondary'
                      }`}
                    >
                      {party.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-headline-sm text-sm text-on-surface font-bold truncate">
                          {party.name}
                        </span>
                        {party.gstin && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-secondary bg-secondary/10 px-1.5 py-0.2 rounded-full flex-shrink-0"
                            title={`GSTIN: ${party.gstin}`}
                          >
                            <span className="material-symbols-outlined text-[12px]">verified</span>
                            <span>GST</span>
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

                  {/* Balance Display */}
                  <div className="flex flex-col items-end text-right flex-shrink-0">
                    <span
                      className={`font-currency-display-mobile text-sm sm:text-base font-extrabold tracking-tight ${
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
                </div>

                {/* Credit Limit Alert Banner (if set) */}
                {party.creditLimit && party.creditLimit > 0 && (
                  <div className="flex items-center justify-between text-[10px] px-2 py-1 rounded-lg bg-surface-container-low border border-outline-variant/20">
                    <span className="text-on-surface-variant font-medium">
                      Credit: {formatINR(Math.abs(party.currentBalance))} / {formatINR(party.creditLimit)}
                    </span>
                    <span className={`font-bold ${isCreditExceeded ? 'text-error' : 'text-secondary'}`}>
                      {isCreditExceeded
                        ? `Limit Exceeded by ${formatINR(party.currentBalance - party.creditLimit)}`
                        : `${Math.round((Math.max(0, party.currentBalance) / party.creditLimit) * 100)}% Used`}
                    </span>
                  </div>
                )}

                {/* Bottom Strip: Latest Document + Actions (matching Stitch parties_ledger_simplified) */}
                <div className="flex items-center justify-between pt-1.5 border-t border-outline-variant/20">
                  <div className="flex items-center gap-1.5 text-on-surface-variant text-[11px] truncate">
                    <span className="material-symbols-outlined text-[15px] text-outline">receipt</span>
                    <span className="truncate">{latestDoc}</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* WhatsApp Reminder Shortcut */}
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
                        className="w-8 h-8 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                        title="Send WhatsApp Reminder"
                      >
                        <span className="material-symbols-outlined text-[16px]">chat</span>
                      </button>
                    )}

                    {/* Quick Action Button: Collect (Customer) / Pay (Supplier) */}
                    <button
                      type="button"
                      onClick={(e) => handleOpenQuickCollect(e, party)}
                      className="h-8 px-2.5 sm:px-3 rounded-xl bg-secondary text-on-secondary text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer shadow-xs"
                      title={activeSegment === 'CUSTOMERS' ? 'Quick Collect Payment' : 'Quick Record Payment'}
                    >
                      <span className="material-symbols-outlined text-[15px]">payments</span>
                      <span>{activeSegment === 'CUSTOMERS' ? 'Collect' : 'Pay'}</span>
                    </button>

                    {/* Quick Bill / Invoice shortcut */}
                    {activeSegment === 'CUSTOMERS' && onCreateInvoice && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateInvoice(party);
                        }}
                        className="h-8 px-2.5 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high text-xs font-semibold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                        title="New Sale Invoice for this customer"
                      >
                        <span className="material-symbols-outlined text-[15px] text-secondary">receipt_long</span>
                        <span className="hidden sm:inline">Invoice</span>
                      </button>
                    )}

                    {activeSegment === 'SUPPLIERS' && onCreatePurchase && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreatePurchase(party);
                        }}
                        className="h-8 px-2.5 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high text-xs font-semibold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                        title="New Purchase Bill for this supplier"
                      >
                        <span className="material-symbols-outlined text-[15px] text-primary">shopping_bag</span>
                        <span className="hidden sm:inline">Bill</span>
                      </button>
                    )}

                    <span className="material-symbols-outlined text-[16px] text-outline-variant pl-0.5">
                      chevron_right
                    </span>
                  </div>
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

      {/* Quick Collect / Pay Modal directly from Card */}
      {quickPaymentParty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-outline-variant/30 flex flex-col gap-3.5">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-secondary/15 text-secondary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">payments</span>
                </span>
                <div>
                  <h4 className="font-bold text-xs text-on-surface">
                    {quickPaymentParty.type === 'CUSTOMER' ? 'Collect from' : 'Pay Supplier'}
                  </h4>
                  <p className="font-bold text-sm text-secondary truncate max-w-[200px]">
                    {quickPaymentParty.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickPaymentParty(null)}
                className="text-on-surface-variant hover:text-on-surface p-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex items-center justify-between bg-surface-container-low p-2 rounded-xl text-xs">
              <span className="text-on-surface-variant font-medium">Outstanding Balance:</span>
              <span
                className={`font-bold ${
                  quickPaymentParty.currentBalance > 0
                    ? 'text-error'
                    : quickPaymentParty.currentBalance < 0
                    ? 'text-amber-600'
                    : 'text-secondary'
                }`}
              >
                {formatINR(Math.abs(quickPaymentParty.currentBalance))}
              </span>
            </div>

            {/* Quick Chips */}
            {quickPaymentParty.currentBalance !== 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setQuickPayAmount(Math.abs(quickPaymentParty.currentBalance).toString())}
                  className="px-2.5 py-1 rounded-lg bg-secondary/15 text-secondary text-xs font-bold hover:bg-secondary/25 cursor-pointer"
                >
                  Full Due ({formatINR(Math.abs(quickPaymentParty.currentBalance))})
                </button>
                {Math.abs(quickPaymentParty.currentBalance) > 100 && (
                  <button
                    type="button"
                    onClick={() =>
                      setQuickPayAmount(Math.round(Math.abs(quickPaymentParty.currentBalance) / 2).toString())
                    }
                    className="px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface text-xs font-medium cursor-pointer"
                  >
                    50%
                  </button>
                )}
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = parseFloat(quickPayAmount);
                if (!amt || amt <= 0) return;
                handleRecordPayment(
                  quickPaymentParty,
                  amt,
                  quickPayMode,
                  quickPayNotes || `Quick settlement via ${quickPayMode} on ${quickPayDate}`
                );
                setQuickPaymentParty(null);
              }}
              className="flex flex-col gap-2.5 text-xs"
            >
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={quickPayAmount}
                  onChange={(e) => setQuickPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-base font-bold focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Payment Mode</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['UPI', 'CASH', 'BANK', 'CHEQUE'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setQuickPayMode(m)}
                      className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        quickPayMode === m
                          ? 'bg-secondary text-on-secondary shadow-xs'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Date</label>
                <input
                  type="date"
                  value={quickPayDate}
                  onChange={(e) => setQuickPayDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Notes / Reference No.</label>
                <input
                  type="text"
                  placeholder="e.g. UTR / Cheque No / Cash note"
                  value={quickPayNotes}
                  onChange={(e) => setQuickPayNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setQuickPaymentParty(null)}
                  className="px-3.5 py-1.5 rounded-xl text-on-surface-variant font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-secondary text-on-secondary font-bold shadow-xs active:scale-95 cursor-pointer"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Comprehensive Add / Edit Party Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-surface-container-lowest rounded-2xl p-5 w-full max-w-lg shadow-xl border border-outline-variant/30 flex flex-col gap-3.5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2.5">
              <h3 className="font-headline-sm text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-secondary">person</span>
                <span>{editingParty ? 'Edit Party Details' : 'Add New Party'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Duplicate phone/gstin warning banners */}
            {duplicatePhoneParty && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] flex-shrink-0">warning</span>
                <span>
                  Another party <strong>{duplicatePhoneParty.name}</strong> already has this mobile number.
                </span>
              </div>
            )}
            {duplicateGstinParty && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] flex-shrink-0">warning</span>
                <span>
                  This GSTIN is already registered to <strong>{duplicateGstinParty.name}</strong>.
                </span>
              </div>
            )}

            <form onSubmit={handleSavePartyForm} className="flex flex-col gap-3 text-xs">
              {/* Type Switcher */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Party Category</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('CUSTOMER')}
                    className={`py-2 rounded-xl font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                      type === 'CUSTOMER'
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'bg-surface-container-low text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">groups</span>
                    <span>Customer (Buyer)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('SUPPLIER')}
                    className={`py-2 rounded-xl font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                      type === 'SUPPLIER'
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'bg-surface-container-low text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                    <span>Supplier (Vendor)</span>
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">
                  Party / Business Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Hardware Store"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              {/* Mobile & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. contact@business.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
              </div>

              {/* GSTIN & State Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-on-surface-variant">GSTIN (Optional)</label>
                    {gstin && (
                      <span
                        className={`text-[10px] font-bold ${
                          isValidGstin(gstin) ? 'text-secondary' : 'text-outline'
                        }`}
                      >
                        {isValidGstin(gstin) ? '✓ Valid Format' : '15 characters expected'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="15-digit GSTIN"
                    value={gstin}
                    onChange={(e) => handleGstinInputChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>

                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">State / POS</label>
                  <select
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  >
                    {allStates.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.code} - {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* PAN & Credit Limit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">PAN Number</label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="10-digit PAN"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>

                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">
                    Credit Limit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 50000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
              </div>

              {/* Opening / Current Balance */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">
                  {editingParty ? 'Current Balance (₹)' : 'Opening Balance (₹)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-on-surface-variant font-bold">₹</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={openingBalance || ''}
                    disabled={!!editingParty}
                    onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    className={`w-full pl-8 pr-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 ${
                      editingParty ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
                {!editingParty && (
                  <span className="text-[10px] text-outline mt-0.5 block">
                    Positive: Customer owes you (Receivable) • Negative: You owe supplier (Payable)
                  </span>
                )}
              </div>

              {/* Billing Address */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Billing Address</label>
                <input
                  type="text"
                  placeholder="Street / Shop No / Market / City"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              {/* Separate Shipping Address Toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={hasSeparateShipping}
                    onChange={(e) => setHasSeparateShipping(e.target.checked)}
                    className="w-4 h-4 rounded text-secondary focus:ring-secondary/40"
                  />
                  <span className="font-semibold text-on-surface">Different Shipping / Delivery Address</span>
                </label>
                {hasSeparateShipping && (
                  <input
                    type="text"
                    placeholder="Delivery warehouse / Site address"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 mt-1.5"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm cursor-pointer active:scale-95"
                >
                  {editingParty ? 'Update Party' : 'Save Party'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Party Detail & Ledger Passbook Modal */}
      {activePartyLedger && (
        <PartyDetailModal
          party={activePartyLedger}
          company={company}
          invoices={invoices}
          purchases={purchases}
          vouchers={allVouchers}
          onClose={() => setSelectedPartyForLedger(null)}
          onEditParty={(p) => {
            setSelectedPartyForLedger(null);
            handleOpenEditModal(p);
          }}
          onDeleteParty={(id) => {
            setSelectedPartyForLedger(null);
            onDeleteParty(id);
          }}
          onRecordPayment={handleRecordPayment}
          onViewInvoice={onViewInvoice}
          onCreateInvoice={onCreateInvoice}
          onCreatePurchase={onCreatePurchase}
        />
      )}
    </div>
  );
};
