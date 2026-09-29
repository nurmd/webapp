import React, { useState } from 'react';
import { Party } from '../../models/party.ts';
import { formatINR } from '../../core/utils/formatters.ts';

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
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [filterBalanceOnly, setFilterBalanceOnly] = useState(false);

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
    })
    .sort((a, b) => Math.abs(b.currentBalance) - Math.abs(a.currentBalance));

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
                Autofill billing details, address &amp; GSTIN
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
              onClick={() => setFilterType('ALL')}
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
              onClick={() => setFilterType('CUSTOMER')}
              className={`flex-1 py-1.5 px-space-sm rounded-lg text-center font-label-md text-xs font-bold transition-all cursor-pointer ${
                filterType === 'CUSTOMER'
                  ? 'bg-surface-container-lowest text-secondary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Customers ({customersCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('SUPPLIER')}
              className={`flex-1 py-1.5 px-space-sm rounded-lg text-center font-label-md text-xs font-bold transition-all cursor-pointer ${
                filterType === 'SUPPLIER'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Suppliers ({suppliersCount})
            </button>
          </div>

          {/* Search bar */}
          <div className="relative flex items-center bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 px-3 py-1">
            <span className="material-symbols-outlined text-outline text-[20px] flex-shrink-0 mr-2">
              search
            </span>
            <input
              type="search"
              placeholder="Search by name, phone, GSTIN, city..."
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
          {filtered.length === 0 ? (
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
            filtered.map((party) => {
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
                        {party.gstin && (
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
                          ? 'text-error'
                          : isPayable
                          ? 'text-error'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      {formatINR(Math.abs(party.currentBalance))}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full mt-0.5 ${
                        isReceivable
                          ? 'bg-error-container text-on-error-container'
                          : isPayable
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container text-on-surface-variant'
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
