import React, { useState, useMemo } from 'react';
import { Party } from '../../models/party.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { db } from '../../services/db.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

interface SelectPartyModalProps {
  parties: Party[];
  onSelectParty: (party: Party) => void;
  onClose: () => void;
  onAddNewParty: () => void;
}

export const SelectPartyModal: React.FC<SelectPartyModalProps> = ({
  parties,
  onSelectParty,
  onClose,
  onAddNewParty,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, true, 20);

  const isGstActive = db.getCompany().isGstEnabled !== false;
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [filterBalanceOnly, setFilterBalanceOnly] = useState(false);
  // Party Sort Mode: loops RECENT -> NAME -> AMOUNT -> RECENT on repeated clicks when active
  const [sortMode, setSortMode] = useState<'RECENT' | 'NAME' | 'AMOUNT'>('RECENT');

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

  const handleCustomerClick = () => {
    if (filterType !== 'CUSTOMER') {
      // Normal behavior: select Customer filter and default to latest transaction
      setFilterType('CUSTOMER');
      setSortMode('RECENT');
    } else {
      // Selector already active: cycle sort mode in a loop: RECENT -> NAME -> AMOUNT -> RECENT
      setSortMode((prev) => {
        if (prev === 'RECENT') return 'NAME';
        if (prev === 'NAME') return 'AMOUNT';
        return 'RECENT';
      });
    }
  };

  const handleSupplierClick = () => {
    if (filterType !== 'SUPPLIER') {
      setFilterType('SUPPLIER');
      setSortMode('RECENT');
    } else {
      setSortMode((prev) => {
        if (prev === 'RECENT') return 'NAME';
        if (prev === 'NAME') return 'AMOUNT';
        return 'RECENT';
      });
    }
  };

  const filtered = parties
    .filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase())) ||
        p.phone.includes(search) ||
        p.billingAddress.toLowerCase().includes(search.toLowerCase());

      const matchesType = filterType === 'ALL' || p.type === filterType;
      const matchesBalance = filterBalanceOnly ? p.currentBalance !== 0 : true;

      return matchesSearch && matchesType && matchesBalance;
    });

  // Sorted parties according to active sort mode (Default: latest transaction against party)
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortMode === 'NAME') {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      if (sortMode === 'AMOUNT') {
        const diff = Math.abs(b.currentBalance) - Math.abs(a.currentBalance);
        if (diff !== 0) return diff;
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

  const customersCount = parties.filter((p) => p.type === 'CUSTOMER').length;
  const suppliersCount = parties.filter((p) => p.type === 'SUPPLIER').length;

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">person_search</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-base font-bold text-on-surface">
                Select Customer / Party
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                {isGstActive ? 'Autofill billing details, address & GSTIN' : 'Autofill billing details & address'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Segmented Type Selector (Stitch select_customer_party) */}
        <div className="p-3 border-b border-outline-variant/15 flex flex-col gap-2 bg-surface">
          <div className="flex items-center p-1 bg-surface-container-low rounded-xl gap-1">
            <button
              type="button"
              onClick={() => {
                setFilterType('ALL');
                setSortMode('RECENT');
              }}
              className={`flex-1 py-1.5 px-space-sm rounded-lg text-center font-label-md text-xs font-bold transition-all cursor-pointer ${
                filterType === 'ALL'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All ({parties.length})
            </button>
            <button
              type="button"
              onClick={handleCustomerClick}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center font-label-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1 ${
                filterType === 'CUSTOMER'
                  ? 'bg-surface-container-lowest text-secondary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              title={
                filterType === 'CUSTOMER'
                  ? `Active Customer Selector — Press again to cycle sort: ${sortMode === 'RECENT' ? 'Recent Tx → Name' : sortMode === 'NAME' ? 'Name → Amount' : 'Amount → Recent Tx'}`
                  : 'Show Customers'
              }
            >
              <span>Customers ({customersCount})</span>
              {filterType === 'CUSTOMER' && (
                <span
                  className="material-symbols-outlined text-[13px] text-secondary shrink-0"
                  title={`Sort: ${sortMode === 'RECENT' ? 'Recent Tx' : sortMode === 'NAME' ? 'Name (A-Z)' : 'Amount'}`}
                >
                  {sortMode === 'RECENT' ? 'schedule' : sortMode === 'NAME' ? 'sort_by_alpha' : 'payments'}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleSupplierClick}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center font-label-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1 ${
                filterType === 'SUPPLIER'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              title={
                filterType === 'SUPPLIER'
                  ? `Active Supplier Selector — Press again to cycle sort: ${sortMode === 'RECENT' ? 'Recent Tx → Name' : sortMode === 'NAME' ? 'Name → Amount' : 'Amount → Recent Tx'}`
                  : 'Show Suppliers'
              }
            >
              <span>Suppliers ({suppliersCount})</span>
              {filterType === 'SUPPLIER' && (
                <span
                  className="material-symbols-outlined text-[13px] text-primary shrink-0"
                  title={`Sort: ${sortMode === 'RECENT' ? 'Recent Tx' : sortMode === 'NAME' ? 'Name (A-Z)' : 'Amount'}`}
                >
                  {sortMode === 'RECENT' ? 'schedule' : sortMode === 'NAME' ? 'sort_by_alpha' : 'payments'}
                </span>
              )}
            </button>
          </div>

          {/* Search bar */}
          <div className="relative flex items-center bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 px-3 py-1">
            <span className="material-symbols-outlined text-outline text-[20px] flex-shrink-0 mr-2">
              search
            </span>
            <input
              type="search"
              placeholder={isGstActive ? "Search by name, phone, GSTIN, city..." : "Search by name, phone, city..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent py-2 text-on-surface font-body-md text-xs placeholder:text-outline focus:outline-none"
            />
          </div>

          {/* Quick Pill Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setFilterBalanceOnly(!filterBalanceOnly)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full font-label-sm text-xs shadow-sm transition-all cursor-pointer ${
                filterBalanceOnly
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/20'
              }`}
            >
              <span className="material-symbols-outlined text-[13px] text-secondary">
                account_balance_wallet
              </span>
              <span>With Balance Only</span>
            </button>
          </div>
        </div>

        {/* Parties List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[50vh]">
          {sorted.length === 0 ? (
            <div className="py-8 text-center text-on-surface-variant text-xs flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[32px] text-outline">group_off</span>
              <p>No parties matching your filter criteria.</p>
              <button
                type="button"
                onClick={onAddNewParty}
                className="mt-1 px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-sm"
              >
                + Add New Party
              </button>
            </div>
          ) : (
            sorted.map((party) => {
              const isReceivable = party.currentBalance > 0;
              const isPayable = party.currentBalance < 0;

              return (
                <div
                  key={party.id}
                  onClick={() => onSelectParty(party)}
                  className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/20 shadow-sm flex items-center justify-between gap-3 hover:border-secondary transition-all cursor-pointer active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-surface-container group-hover:bg-secondary-container group-hover:text-on-secondary-container flex items-center justify-center font-bold text-sm text-on-surface flex-shrink-0 transition-colors">
                      {party.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-headline-sm text-xs font-bold text-on-surface truncate group-hover:text-secondary">
                          {party.name}
                        </span>
                        {party.gstin && isGstActive && (
                          <span
                            className="material-symbols-outlined text-[14px] text-secondary flex-shrink-0"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            verified
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-on-surface-variant truncate">
                        {party.phone} • {party.billingAddress || `State ${party.stateCode}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0">
                    <span
                      className={`font-tabular-data text-xs font-bold ${
                        isReceivable
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : isPayable
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-secondary'
                      }`}
                    >
                      {formatINR(Math.abs(party.currentBalance))}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full mt-0.5 ${
                        isReceivable
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : isPayable
                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                          : 'bg-secondary/10 text-secondary'
                      }`}
                    >
                      {isReceivable ? 'To Collect' : isPayable ? 'To Pay' : 'Settled'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-outline-variant/20 bg-surface-container-low flex items-center justify-between">
          <span className="text-[11px] text-on-surface-variant font-medium">
            Showing {filtered.length} of {parties.length} parties
          </span>
          <button
            type="button"
            onClick={onAddNewParty}
            className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-sm flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            <span>+ Add New Party</span>
          </button>
        </div>
      </div>
    </div>
  );
};
