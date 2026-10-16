import React, { useState, useMemo } from 'react';
import { Party } from '../../models/party.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { validateGstin } from '../../core/gst/validator.ts';
import { db } from '../../services/db.ts';

interface SelectPosPartyModalProps {
  isOpen: boolean;
  parties: Party[];
  selectedParty: Party | null;
  onSelectParty: (party: Party | null) => void;
  onClose: () => void;
}

export const SelectPosPartyModal: React.FC<SelectPosPartyModalProps> = ({
  isOpen,
  parties,
  selectedParty,
  onSelectParty,
  onClose,
}) => {
  const isGstActive = db.getCompany().isGstEnabled !== false;
  const [search, setSearch] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  // Party Sort Mode: loops RECENT -> NAME -> AMOUNT -> RECENT on repeated clicks
  const [sortMode, setSortMode] = useState<'RECENT' | 'NAME' | 'AMOUNT'>('RECENT');

  // New Party Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newGstin, setNewGstin] = useState('');
  const [newStateCode, setNewStateCode] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [gstinError, setGstinError] = useState<string | null>(null);

  // Precomputed lookup map of latest transaction timestamp against each party
  const partyLatestTxMap = useMemo(() => {
    const map = new Map<string, number>();
    const invList = db.getInvoices();
    const purList = db.getPurchases();
    const vchList = db.getVouchers();

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
  }, [parties]);

  if (!isOpen) return null;

  // Filter customers
  const customerParties = parties.filter((p) => p.type === 'CUSTOMER');
  const filtered = customerParties.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      (p.gstin && p.gstin.toLowerCase().includes(q))
    );
  });

  const sortedCustomers = [...filtered].sort((a, b) => {
    if (sortMode === 'NAME') {
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    if (sortMode === 'AMOUNT') {
      const diff = Math.abs(b.currentBalance || 0) - Math.abs(a.currentBalance || 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    // Default: RECENT (Latest transaction against party)
    const timeA = partyLatestTxMap.get(a.id) || 0;
    const timeB = partyLatestTxMap.get(b.id) || 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const handleCycleSort = () => {
    setSortMode((prev) => {
      if (prev === 'RECENT') return 'NAME';
      if (prev === 'NAME') return 'AMOUNT';
      return 'RECENT';
    });
  };

  const handleGstinChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setNewGstin(upper);
    if (!upper) {
      setGstinError(null);
      return;
    }
    const res = validateGstin(upper);
    if (!res.isValid) {
      setGstinError(res.error || 'Invalid GSTIN');
    } else {
      setGstinError(null);
      if (res.stateCode) {
        setNewStateCode(res.stateCode);
      }
    }
  };

  const handleCreateParty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    if (newGstin && gstinError) {
      return;
    }

    const newParty: Party = {
      id: `PTY-${Date.now()}`,
      name: newName.trim(),
      type: 'CUSTOMER',
      phone: newPhone.trim(),
      gstin: newGstin.trim() || undefined,
      stateCode: newStateCode,
      billingAddress: newAddress.trim() || 'Local Counter',
      currentBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveParty(newParty);
    onSelectParty(newParty);
    setIsAddingNew(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">
              person_search
            </span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              {isAddingNew ? 'Add New Customer' : 'Select Customer / Party'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline cursor-pointer"
            title="Close"
            aria-label="Close select customer modal"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {isAddingNew ? (
          <form onSubmit={handleCreateParty} className="p-4 space-y-3.5 overflow-y-auto">
            <div>
              <label className="block text-xs font-semibold text-outline mb-1">
                Customer / Business Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ramesh Kumar or Shanti Traders"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-outline mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  placeholder="10-digit mobile"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-outline mb-1">
                  State / Place of Supply
                </label>
                <select
                  value={newStateCode}
                  onChange={(e) => setNewStateCode(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-2.5 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                >
                  <option value="">-- Select State / POS --</option>
                  {getStateList().map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isGstActive && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-outline">
                    GSTIN (For B2B Invoice, Optional)
                  </label>
                  {gstinError && <span className="text-[11px] text-error font-medium">{gstinError}</span>}
                </div>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="15-digit GSTIN (e.g. 27ABCDE1234F1Z5)"
                  value={newGstin}
                  onChange={(e) => handleGstinChange(e.target.value)}
                  className={`w-full bg-surface-container-low border rounded-xl px-3 py-2 text-sm font-mono uppercase text-on-surface outline-none ${
                    gstinError ? 'border-error' : 'border-outline-variant/30 focus:border-secondary'
                  }`}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-outline mb-1">
                Billing Address (Optional)
              </label>
              <input
                type="text"
                placeholder="Shop/Street, City"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:bg-surface-container cursor-pointer"
              >
                Back to List
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-bold bg-secondary text-on-secondary shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer"
              >
                Save & Select Customer
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden p-4 space-y-3">
            {/* Search and Quick Add */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-surface-container-low rounded-xl border border-outline-variant/30 px-3 py-2">
                <span className="material-symbols-outlined text-outline text-[18px] mr-2">search</span>
                <input
                  type="text"
                  placeholder={isGstActive ? "Search by Customer Name, Phone, or GSTIN..." : "Search by Customer Name or Phone..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-xs text-on-surface placeholder:text-outline outline-none"
                  autoFocus
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="text-outline hover:text-on-surface">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsAddingNew(true)}
                className="px-3 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                <span>+ New</span>
              </button>
            </div>

            {/* Default Walk-in Customer Option */}
            <div
              onClick={() => {
                onSelectParty(null);
                onClose();
              }}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                !selectedParty
                  ? 'bg-secondary-container/20 border-secondary ring-1 ring-secondary'
                  : 'bg-surface-container-low/60 border-outline-variant/20 hover:border-secondary/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-secondary font-bold">
                  <span className="material-symbols-outlined text-[20px]">storefront</span>
                </div>
                <div>
                  <div className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                    <span>Walk-in Retail Customer</span>
                    <span className="text-[10px] bg-secondary-container/60 text-on-secondary-container px-1.5 py-0.2 rounded font-semibold">
                      Default B2C
                    </span>
                  </div>
                  <div className="text-[11px] text-outline">Counter cash/UPI retail sale without ledger account</div>
                </div>
              </div>
              {!selectedParty && (
                <span className="material-symbols-outlined text-secondary text-[20px]">check_circle</span>
              )}
            </div>

            {/* Registered Customers Header & Sort Loop Toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Customers ({customerParties.length})
              </span>
              <button
                type="button"
                onClick={handleCycleSort}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs transition-all cursor-pointer bg-surface-container-low text-secondary hover:bg-secondary/15 border border-secondary/30 active:scale-95"
                title={`Click to cycle sort: ${sortMode === 'RECENT' ? 'Recent Transactions' : sortMode === 'NAME' ? 'Name (A-Z)' : 'Amount'}`}
              >
                <span className="material-symbols-outlined text-[13px]">
                  {sortMode === 'RECENT' ? 'schedule' : sortMode === 'NAME' ? 'sort_by_alpha' : 'payments'}
                </span>
                <span className="hidden sm:inline">
                  {sortMode === 'RECENT' ? 'Recent Tx' : sortMode === 'NAME' ? 'Name (A-Z)' : 'Amount'}
                </span>
              </button>
            </div>

            {/* Customers List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[45vh]">
              {sortedCustomers.length === 0 ? (
                <div className="text-center py-8 text-outline text-xs">
                  {search ? 'No customer matched your search.' : 'No customer parties registered yet.'}
                </div>
              ) : (
                sortedCustomers.map((party) => {
                  const isSelected = selectedParty?.id === party.id;
                  const balance = party.currentBalance || 0;
                  return (
                    <div
                      key={party.id}
                      onClick={() => {
                        onSelectParty(party);
                        onClose();
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-secondary-container/20 border-secondary ring-1 ring-secondary'
                          : 'bg-surface-container-low/50 border-outline-variant/20 hover:border-secondary/40 hover:bg-surface-container-low'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-on-surface truncate">
                            {party.name}
                          </span>
                          {party.gstin && isGstActive && (
                            <span className="text-[10px] bg-primary/10 text-primary font-mono px-1 rounded font-semibold">
                              B2B
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-outline mt-0.5">
                          <span>{party.phone || 'No phone'}</span>
                          <span>•</span>
                          <span>State: {party.stateCode}</span>
                          {party.gstin && isGstActive && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{party.gstin}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <div>
                          <div className="text-[10px] text-outline">Ledger Balance</div>
                          <div
                            className={`text-xs font-bold font-tabular-data ${
                              balance > 0
                                ? 'text-amber-600'
                                : balance < 0
                                ? 'text-secondary'
                                : 'text-outline'
                            }`}
                          >
                            {balance > 0
                              ? `${formatINR(balance)} (Due)`
                              : balance < 0
                              ? `${formatINR(Math.abs(balance))} (Adv)`
                              : '₹0.00'}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="material-symbols-outlined text-secondary text-[20px]">
                            check_circle
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
