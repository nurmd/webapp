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
  const [filterType, setFilterType] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
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

  // Metrics
  const totalReceivable = parties
    .filter((p) => p.currentBalance > 0)
    .reduce((s, p) => s + p.currentBalance, 0);

  const totalPayable = parties
    .filter((p) => p.currentBalance < 0)
    .reduce((s, p) => s + Math.abs(p.currentBalance), 0);

  const filtered = parties.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone && p.phone.includes(search)) ||
      (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase()));

    if (filterType === 'CUSTOMER') return matchesSearch && p.type === 'CUSTOMER';
    if (filterType === 'SUPPLIER') return matchesSearch && p.type === 'SUPPLIER';
    return matchesSearch;
  });

  const handleOpenAddModal = () => {
    setEditingParty(null);
    setName('');
    setType('CUSTOMER');
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
      // Default fallback: adjust party balance
      const newBal =
        party.type === 'CUSTOMER'
          ? party.currentBalance - amount
          : party.currentBalance + amount;
      const updatedParty = { ...party, currentBalance: newBal, updatedAt: new Date().toISOString() };
      onSaveParty(updatedParty);
      setSelectedPartyForLedger(updatedParty);
    }
  };

  // Keep selectedPartyForLedger up to date with latest party array
  const activePartyLedger = selectedPartyForLedger
    ? parties.find((p) => p.id === selectedPartyForLedger.id) || selectedPartyForLedger
    : null;

  return (
    <div className="flex flex-col w-full pb-24 max-w-4xl mx-auto px-margin-mobile py-4 gap-space-sm">
      {/* Top Banner: Dual Metrics (Stitch parties_ledger) */}
      <div className="grid grid-cols-2 gap-space-xs">
        {/* You'll Receive */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                You'll Receive
              </span>
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
            </div>
            <div className="font-currency-display-mobile text-currency-display-mobile text-secondary font-extrabold mt-0.5">
              {formatINR(totalReceivable)}
            </div>
          </div>
          <span className="font-body-sm text-xs text-on-surface-variant mt-1">
            {parties.filter((p) => p.currentBalance > 0).length} parties to collect from
          </span>
        </div>

        {/* You'll Give */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-error font-bold uppercase tracking-wider">
                You'll Give
              </span>
              <span className="w-2 h-2 rounded-full bg-error"></span>
            </div>
            <div className="font-currency-display-mobile text-currency-display-mobile text-error font-extrabold mt-0.5">
              {formatINR(totalPayable)}
            </div>
          </div>
          <span className="font-body-sm text-xs text-on-surface-variant mt-1">
            {parties.filter((p) => p.currentBalance < 0).length} suppliers to pay
          </span>
        </div>
      </div>

      {/* Action Bar & Search */}
      <div className="flex items-center gap-2 mt-1">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search party by name, phone, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary transition-colors"
          />
        </div>

        <button
          onClick={handleOpenAddModal}
          className="bg-secondary text-on-secondary px-4 py-2 rounded-xl font-label-md text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform flex-shrink-0 cursor-pointer"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>+ Add Party</span>
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <button
          onClick={() => setFilterType('ALL')}
          className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            filterType === 'ALL'
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          All Parties ({parties.length})
        </button>
        <button
          onClick={() => setFilterType('CUSTOMER')}
          className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            filterType === 'CUSTOMER'
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          Customers ({parties.filter((p) => p.type === 'CUSTOMER').length})
        </button>
        <button
          onClick={() => setFilterType('SUPPLIER')}
          className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            filterType === 'SUPPLIER'
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          Suppliers ({parties.filter((p) => p.type === 'SUPPLIER').length})
        </button>
      </div>

      {/* Parties List */}
      <div className="space-y-2 mt-1">
        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-on-surface-variant border border-outline-variant/20">
            No parties found.
          </div>
        ) : (
          filtered.map((party) => {
            const isReceivable = party.currentBalance > 0;
            const isPayable = party.currentBalance < 0;
            return (
              <div
                key={party.id}
                onClick={() => setSelectedPartyForLedger(party)}
                className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex items-center justify-between gap-3 hover:border-secondary/40 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-surface-container-high group-hover:bg-secondary-container group-hover:text-on-secondary-container transition-colors flex items-center justify-center font-bold text-on-surface text-sm flex-shrink-0">
                    {party.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-headline-sm text-sm text-on-surface font-bold truncate group-hover:text-secondary transition-colors">
                        {party.name}
                      </span>
                      <span className="text-[10px] text-on-surface-variant font-semibold">
                        ({party.type === 'CUSTOMER' ? 'Customer' : 'Supplier'})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                      <span>{party.phone}</span>
                      {party.gstin && (
                        <>
                          <span>•</span>
                          <span className="text-[11px] font-mono text-secondary font-semibold">
                            {party.gstin}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex flex-col items-end">
                    <span
                      className={`font-tabular-data text-[15px] font-extrabold ${
                        isReceivable
                          ? 'text-secondary'
                          : isPayable
                          ? 'text-error'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      {formatINR(Math.abs(party.currentBalance))}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                        isReceivable
                          ? 'bg-secondary-container text-on-secondary-container'
                          : isPayable
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {isReceivable ? 'To Collect' : isPayable ? 'To Pay' : 'Settled'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenEditModal(party)}
                      className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container flex items-center justify-center cursor-pointer"
                      title="Edit Party Details"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>

                    {isReceivable && (
                      <button
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
                        className="w-8 h-8 rounded-lg bg-[#25D366]/15 text-[#25D366] flex items-center justify-center cursor-pointer active:scale-95"
                        title="Send WhatsApp Reminder"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[16px]">send</span>
                      </button>
                    )}

                    <button
                      onClick={() => onDeleteParty(party.id)}
                      className="w-8 h-8 rounded-lg text-error/60 hover:text-error hover:bg-error-container/30 flex items-center justify-center cursor-pointer"
                      title="Delete"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
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
