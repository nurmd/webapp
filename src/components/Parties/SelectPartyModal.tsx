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

  const filtered = parties.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase())) ||
      p.phone.includes(search);
    const matchesType = filterType === 'ALL' || p.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">person_search</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-[16px] font-bold text-on-surface">
                Select Customer / Party
              </h3>
              <p className="text-[12px] text-on-surface-variant">
                Choose party to autofill billing details & GSTIN
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Filter Pills & Search */}
        <div className="p-3 border-b border-outline-variant/20 flex flex-col gap-2.5 bg-surface">
          {/* Segmented type buttons */}
          <div className="flex items-center p-0.5 bg-surface-container-low rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`flex-1 py-1 px-2 rounded-lg text-center font-label-sm text-[12px] font-semibold transition-all ${
                filterType === 'ALL'
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant'
              }`}
            >
              All ({parties.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('CUSTOMER')}
              className={`flex-1 py-1 px-2 rounded-lg text-center font-label-sm text-[12px] font-semibold transition-all ${
                filterType === 'CUSTOMER'
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant'
              }`}
            >
              Customers ({parties.filter((p) => p.type === 'CUSTOMER').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('SUPPLIER')}
              className={`flex-1 py-1 px-2 rounded-lg text-center font-label-sm text-[12px] font-semibold transition-all ${
                filterType === 'SUPPLIER'
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant'
              }`}
            >
              Suppliers ({parties.filter((p) => p.type === 'SUPPLIER').length})
            </button>
          </div>

          {/* Search bar + Add new */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/40 px-3 py-1.5 shadow-sm">
              <span className="material-symbols-outlined text-outline text-[18px] mr-2">search</span>
              <input
                type="text"
                placeholder="Search by party name, GSTIN, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-outline outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-outline hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onAddNewParty}
              className="flex items-center gap-1 bg-secondary text-on-secondary font-label-sm text-[12px] font-semibold px-3 py-2 rounded-xl shadow-sm hover:bg-secondary/90 transition-colors whitespace-nowrap active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              <span>New</span>
            </button>
          </div>
        </div>

        {/* List of Parties */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant text-sm">
              <span className="material-symbols-outlined text-[36px] text-outline block mb-1">group_off</span>
              No parties found matching "{search}".
            </div>
          ) : (
            filtered.map((party) => (
              <div
                key={party.id}
                onClick={() => onSelectParty(party)}
                className="flex items-center justify-between p-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:border-secondary/50 hover:bg-surface-container-low transition-all cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-label-md text-[14px] font-bold text-on-surface truncate">
                      {party.name}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        party.gstin
                          ? 'bg-secondary/10 text-secondary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {party.gstin ? 'B2B GST' : 'Retail'}
                    </span>
                  </div>

                  <div className="text-[11px] text-on-surface-variant flex items-center gap-2 mt-1">
                    <span>📞 {party.phone}</span>
                    <span>📍 State: {party.stateCode}</span>
                  </div>

                  {party.gstin && (
                    <div className="text-[11px] font-mono text-secondary font-semibold mt-0.5">
                      GSTIN: {party.gstin}
                    </div>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <span className="text-[10px] text-on-surface-variant block uppercase font-medium">Balance</span>
                  <span
                    className={`font-tabular-data text-[13px] font-bold block ${
                      party.currentBalance > 0 ? 'text-error' : 'text-secondary'
                    }`}
                  >
                    {formatINR(party.currentBalance)}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">
                    {party.currentBalance > 0 ? 'To Collect' : 'Settled'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
