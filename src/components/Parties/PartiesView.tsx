import React, { useState } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getPaymentReminderWhatsAppUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
import { PartyDetailModal } from './PartyDetailModal.tsx';

interface PartiesViewProps {
  parties: Party[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  onSaveParty: (party: Party) => void;
  onDeleteParty: (id: string) => void;
  onRecordPartyPayment?: (party: Party, amount: number, paymentMode: string, notes: string) => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

export const PartiesView: React.FC<PartiesViewProps> = ({
  parties,
  invoices = [],
  purchases = [],
  onSaveParty,
  onDeleteParty,
  onRecordPartyPayment,
  onViewInvoice,
}) => {
  const company = db.getCompany();
  // Segmented switch: Customers vs Suppliers (Stitch parties_ledger_simplified)
  const [activeSegment, setActiveSegment] = useState<'CUSTOMERS' | 'SUPPLIERS'>('CUSTOMERS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVERDUE' | 'SETTLED'>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedPartyForLedger, setSelectedPartyForLedger] = useState<Party | null>(null);

  // Party Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('27');
  const [address, setAddress] = useState('');
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

  const activePartiesList = activeSegment === 'CUSTOMERS' ? customers : suppliers;

  const filtered = activePartiesList.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone && p.phone.includes(search)) ||
      (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase())) ||
      p.billingAddress.toLowerCase().includes(search.toLowerCase());

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
    setName('');
    setType(activeSegment === 'CUSTOMERS' ? 'CUSTOMER' : 'SUPPLIER');
    setPhone('');
    setGstin('');
    setStateCode('27');
    setAddress('');
    setOpeningBalance(0);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (party: Party) => {
    setEditingParty(party);
    setName(party.name);
    setType(party.type);
    setPhone(party.phone);
    setGstin(party.gstin || '');
    setStateCode(party.stateCode);
    setAddress(party.billingAddress);
    setOpeningBalance(party.currentBalance);
    setIsModalOpen(true);
  };

  const handleSavePartyForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const partyToSave: Party = {
      id: editingParty ? editingParty.id : 'PTY-' + Date.now(),
      name: name.trim(),
      type,
      phone: phone.trim() || '9999999999',
      gstin: gstin.trim().toUpperCase() || undefined,
      stateCode: stateCode.trim() || '27',
      billingAddress: address.trim() || 'Local Counter',
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
    <div className="flex flex-col w-full pb-28 max-w-4xl mx-auto px-margin-mobile py-3 gap-space-sm">
      {/* 1. Segment Switcher: Customers vs Suppliers (Stitch parties_ledger_simplified) */}
      <section className="pt-space-xs">
        <div className="bg-surface-container p-1 rounded-xl flex items-center shadow-sm">
          <button
            type="button"
            onClick={() => {
              setActiveSegment('CUSTOMERS');
              setStatusFilter('ALL');
            }}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeSegment === 'CUSTOMERS'
                ? 'bg-surface-container-lowest shadow-sm text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                activeSegment === 'CUSTOMERS' ? 'text-secondary' : ''
              }`}
            >
              groups
            </span>
            <span className="font-label-md text-label-md font-bold">Customers</span>
            <span
              className={`font-label-sm text-label-sm px-1.5 py-0.2 rounded-full ${
                activeSegment === 'CUSTOMERS'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {customers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSegment('SUPPLIERS');
              setStatusFilter('ALL');
            }}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeSegment === 'SUPPLIERS'
                ? 'bg-surface-container-lowest shadow-sm text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                activeSegment === 'SUPPLIERS' ? 'text-primary' : ''
              }`}
            >
              local_shipping
            </span>
            <span className="font-label-md text-label-md font-bold">Suppliers</span>
            <span
              className={`font-label-sm text-label-sm px-1.5 py-0.2 rounded-full ${
                activeSegment === 'SUPPLIERS'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {suppliers.length}
            </span>
          </button>
        </div>
      </section>

      {/* 2. Summary Header Card with tactile ambient background (Stitch parties_ledger_simplified) */}
      <section className="pt-space-xs">
        <div className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm border border-outline-variant/20 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
              {activeSegment === 'CUSTOMERS' ? 'Total Receivables' : 'Total Payables'}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
                {formatINR(activeSegment === 'CUSTOMERS' ? totalReceivables : totalPayables)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm font-semibold flex items-center gap-1 ${
                (activeSegment === 'CUSTOMERS' ? overdueCustomersCount : overdueSuppliersCount) > 0
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-secondary-container text-on-secondary-container'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  (activeSegment === 'CUSTOMERS' ? overdueCustomersCount : overdueSuppliersCount) > 0
                    ? 'bg-error'
                    : 'bg-secondary'
                }`}
              />
              {activeSegment === 'CUSTOMERS'
                ? `${overdueCustomersCount} Overdue`
                : `${overdueSuppliersCount} Overdue`}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Search & Filter Bar (Stitch simplified) */}
      <section className="pt-space-xs flex flex-col gap-2">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            type="text"
            placeholder={
              activeSegment === 'CUSTOMERS'
                ? 'Search customer, phone, GSTIN...'
                : 'Search supplier, GSTIN, phone...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-container-lowest pl-10 pr-10 py-2.5 rounded-xl font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none shadow-sm border border-outline-variant/20 transition-all"
          />
          <button
            type="button"
            onClick={() => {
              setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE');
            }}
            className="absolute right-2.5 w-7 h-7 flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
          </button>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full font-label-sm text-label-sm shadow-sm transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-inverse-surface text-inverse-on-surface'
                : 'bg-surface-container-lowest text-on-surface border border-outline-variant/20'
            }`}
          >
            All ({activePartiesList.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('OVERDUE')}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full font-label-sm text-label-sm shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'OVERDUE'
                ? 'bg-inverse-surface text-inverse-on-surface'
                : 'bg-surface-container-lowest text-on-surface border border-outline-variant/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            Overdue ({activeSegment === 'CUSTOMERS' ? overdueCustomersCount : overdueSuppliersCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SETTLED')}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full font-label-sm text-label-sm shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'SETTLED'
                ? 'bg-inverse-surface text-inverse-on-surface'
                : 'bg-surface-container-lowest text-on-surface border border-outline-variant/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            Settled ({activePartiesList.filter((p) => p.currentBalance === 0).length})
          </button>
        </div>
      </section>

      {/* 4. Parties Ledger Card Feed (Stitch parties_ledger_simplified) */}
      <section className="flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-sm">
            No {activeSegment.toLowerCase()} found.
          </div>
        ) : (
          filtered.map((party) => {
            const isReceivable = party.currentBalance > 0;
            const isPayable = party.currentBalance < 0;
            const isSettled = party.currentBalance === 0;
            const latestDoc = getLatestDocRef(party);

            return (
              <div
                key={party.id}
                onClick={() => setSelectedPartyForLedger(party)}
                className="party-card bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/20 flex flex-col gap-3 active:bg-surface-container-low transition-all cursor-pointer hover:border-secondary/40"
              >
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center font-headline-sm text-sm sm:text-headline-sm flex-shrink-0 font-bold ${
                        isReceivable || isPayable
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}
                    >
                      {party.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="font-headline-sm text-sm sm:text-base text-on-surface truncate font-semibold">
                          {party.name}
                        </span>
                        {party.gstin && (
                          <span
                            className="material-symbols-outlined text-[15px] sm:text-[16px] text-secondary flex-shrink-0"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            verified
                          </span>
                        )}
                      </div>
                      <span className="text-on-surface-variant font-body-sm text-[11px] sm:text-xs truncate">
                        {party.billingAddress || party.phone}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0 text-right pl-2 min-w-[76px] sm:min-w-[95px]">
                    <span
                      className={`font-currency-display-mobile text-xs sm:text-base tracking-tight font-extrabold whitespace-nowrap ${
                        isReceivable
                          ? 'text-error'
                          : isPayable
                          ? 'text-error'
                          : 'text-secondary'
                      }`}
                    >
                      {formatINR(Math.abs(party.currentBalance))}
                    </span>
                    <span
                      className={`font-label-sm text-[10px] sm:text-label-sm px-2 py-0.5 rounded-md mt-0.5 font-bold whitespace-nowrap ${
                        isReceivable
                          ? 'text-error bg-error-container/60'
                          : isPayable
                          ? 'text-error bg-error-container/60'
                          : 'text-on-secondary-container bg-secondary-container/60'
                      }`}
                    >
                      {isReceivable
                        ? 'To Collect'
                        : isPayable
                        ? 'To Pay'
                        : 'Settled'}
                    </span>
                  </div>
                </div>

                {/* Sub-row with doc ref and quick collect/remind buttons */}
                <div
                  className="flex items-center justify-between pt-1 border-t border-surface-container"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm">
                    <span className="material-symbols-outlined text-[16px]">receipt</span>
                    <span className="truncate">{latestDoc}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const url = getPaymentReminderWhatsAppUrl(
                          party.name,
                          party.phone,
                          party.currentBalance,
                          company.tradeName || company.businessName,
                          company.upiId
                        );
                        window.open(url, '_blank');
                      }}
                      className="w-9 h-9 rounded-xl bg-surface-container text-secondary flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                      title="WhatsApp Remind"
                    >
                      <span className="material-symbols-outlined text-[18px]">chat</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPartyForLedger(party)}
                      className="h-9 px-3.5 rounded-xl bg-secondary text-on-secondary font-label-md text-label-md flex items-center gap-1 active:scale-95 transition-transform cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[18px]">payments</span>
                      <span>{party.type === 'CUSTOMER' ? 'Collect' : 'Pay Now'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* 5. Bottom Floating Action Button (Stitch simplified FAB) */}
      <div className="fixed bottom-20 right-4 z-40">
        <button
          onClick={handleOpenAddModal}
          className="h-12 px-4 rounded-full bg-primary text-on-primary font-headline-sm text-headline-sm shadow-xl flex items-center gap-2 active:scale-95 transition-transform cursor-pointer"
          type="button"
        >
          <span className="material-symbols-outlined text-[22px]">person_add</span>
          <span className="font-label-md text-label-md">
            {activeSegment === 'CUSTOMERS' ? 'Add Customer' : 'Add Supplier'}
          </span>
        </button>
      </div>

      {/* Add / Edit Party Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-md shadow-xl border border-outline-variant/30 flex flex-col gap-4">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface">
              {editingParty ? 'Edit Party Details' : 'Add New Party'}
            </h3>

            <form onSubmit={handleSavePartyForm} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Party Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('CUSTOMER')}
                    className={`py-2 rounded-xl font-bold cursor-pointer transition-colors ${
                      type === 'CUSTOMER'
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'bg-surface-container-low text-on-surface'
                    }`}
                  >
                    Customer (Buyer)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('SUPPLIER')}
                    className={`py-2 rounded-xl font-bold cursor-pointer transition-colors ${
                      type === 'SUPPLIER'
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'bg-surface-container-low text-on-surface'
                    }`}
                  >
                    Supplier (Vendor)
                  </button>
                </div>
              </div>

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

              <div className="grid grid-cols-2 gap-2">
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
                    {editingParty ? 'Current Balance (₹)' : 'Opening Balance (₹)'}
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={openingBalance || ''}
                    disabled={!!editingParty}
                    onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 ${
                      editingParty ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">
                    GSTIN (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="15-digit GSTIN"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">State Code</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="e.g. 27"
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Street / Market / City"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
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
          onClose={() => setSelectedPartyForLedger(null)}
          onEditParty={(p) => {
            setSelectedPartyForLedger(null);
            handleOpenEditModal(p);
          }}
          onRecordPayment={handleRecordPayment}
          onViewInvoice={onViewInvoice}
        />
      )}
    </div>
  );
};
