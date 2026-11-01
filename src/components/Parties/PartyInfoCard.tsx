import React from 'react';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { db } from '../../services/db.ts';
import { isSystemParty } from '../../core/utils/systemParties.ts';

export interface PartyInfoCardProps {
  party: Party;
  company: CompanyProfile;
  liveNetBalance: number;
  isReceivable: boolean;
  isPayable: boolean;
  totalBilled: number;
  totalPaid: number;
  unbilledTotal?: number;
  showPartyDetails: boolean;
  setShowPartyDetails: React.Dispatch<React.SetStateAction<boolean>>;
  onEditParty: (party: Party) => void;
}

export const PartyInfoCard: React.FC<PartyInfoCardProps> = ({
  party,
  company,
  liveNetBalance,
  isReceivable,
  isPayable,
  totalBilled,
  totalPaid,
  unbilledTotal,
  showPartyDetails,
  setShowPartyDetails,
  onEditParty,
}) => {
  const group = party.groupId ? db.getPartyGroups().find((g) => g.id === party.groupId) : undefined;
  const category = party.categoryId ? db.getPartyCategories().find((c) => c.id === party.categoryId) : undefined;

  return (
    <section className="bg-slate-900 dark:bg-slate-950 text-white rounded-2xl p-3 sm:p-4 border border-slate-800 shadow-md flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            {isReceivable ? "You'll Receive" : isPayable ? "You'll Pay" : 'Net Balance'}
          </span>
          <span className="font-currency-display-mobile text-xl sm:text-2xl font-black mt-0.5 text-white">
            {liveNetBalance === 0 ? '₹0 (Settled)' : formatINR(Math.abs(liveNetBalance))}
          </span>
          {party.type !== 'CUSTOMER' && typeof unbilledTotal === 'number' && unbilledTotal > 0 && (
            <span className="text-[11px] font-medium text-slate-400 mt-0.5">
              (Unbilled {formatINR(unbilledTotal)})
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isReceivable
                ? 'bg-emerald-500/20 text-emerald-300'
                : isPayable
                ? 'bg-rose-500/20 text-rose-300'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {isReceivable ? 'Pending Due' : isPayable ? 'To Pay' : 'All Clear'}
          </span>

          <button
            type="button"
            onClick={() => setShowPartyDetails((prev) => !prev)}
            className="text-secondary-fixed hover:text-white text-[11px] font-semibold hover:underline flex items-center gap-0.5 cursor-pointer mt-1"
          >
            <span>{showPartyDetails ? 'Hide Info' : 'Party Info'}</span>
            <span className="material-symbols-outlined text-[14px]">
              {showPartyDetails ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* Quick Sub-Metrics Bar: Sticky Label and Amount without wrapping */}
      <div className="flex items-center gap-3 sm:gap-6 pt-2 border-t border-slate-800 text-xs overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 text-[11px] whitespace-nowrap">Total Bill:</span>
          <span className="font-bold text-white whitespace-nowrap">{formatINR(totalBilled)}</span>
        </div>
        <div className="h-3.5 w-px bg-slate-800 shrink-0" />
        <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
          <span className="text-slate-400 text-[11px] whitespace-nowrap">Total Paid:</span>
          <span className="font-bold text-white whitespace-nowrap">{formatINR(totalPaid)}</span>
        </div>
      </div>

      {/* Opening Balance info chip if set */}
      {((typeof party.openingBalance === 'number' && party.openingBalance > 0) || party.openingBalanceDate) && (
        <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700/50">
          <span className="flex items-center gap-1 font-medium">
            <span className="material-symbols-outlined text-[14px] text-secondary-fixed">account_balance_wallet</span>
            <span>Opening Balance:</span>
          </span>
          <div className="flex items-center gap-1.5 font-bold">
            <span className={party.openingBalanceType === 'TO_PAY' ? 'text-rose-400' : 'text-emerald-400'}>
              {formatINR(party.openingBalance || 0)} ({party.openingBalanceType === 'TO_PAY' ? 'To Pay' : 'To Receive'})
            </span>
            {party.openingBalanceDate && (
              <span className="text-[10px] text-slate-400 font-normal">
                • {party.openingBalanceDate}
              </span>
            )}
            {!isSystemParty(party) && (
              <button
                type="button"
                onClick={() => onEditParty(party)}
                className="p-0.5 text-slate-400 hover:text-white rounded cursor-pointer ml-1"
                title="Edit Opening Balance"
              >
                <span className="material-symbols-outlined text-[13px]">edit</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collapsible Info Drawer */}
      {showPartyDetails && (
        <div className="pt-2.5 border-t border-slate-800 text-xs text-slate-200 space-y-1.5 animate-in fade-in">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {company.isGstEnabled !== false && (
              <div>
                <span className="text-slate-400 block">GSTIN</span>
                <span className="font-mono font-bold text-white truncate block">
                  {party.gstin || 'Unregistered'}
                </span>
              </div>
            )}
            <div>
              <span className="text-slate-400 block">PAN</span>
              <span className="font-mono font-bold text-white truncate block">
                {party.pan || 'N/A'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 block">Billing Address</span>
              <span className="font-medium text-slate-200 truncate block">
                {party.billingAddress || 'Local Counter'}
              </span>
            </div>
            {(group || category) && (
              <div className="col-span-2 pt-1 border-t border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                {group && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: `${group.color || '#2563eb'}25`,
                      color: '#93c5fd',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: group.color || '#2563eb' }}
                    />
                    <span>Group: {group.name}</span>
                  </span>
                )}
                {category && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: `${category.color || '#0d9488'}25`,
                      color: '#5eead4',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: category.color || '#0d9488' }}
                    />
                    <span>Category: {category.name}</span>
                  </span>
                )}
              </div>
            )}
            <div className="col-span-2 pt-1 border-t border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Opening Balance</span>
              <div className="flex items-center gap-1.5">
                {party.openingBalance ? (
                  <span className={`font-bold ${party.openingBalanceType === 'TO_PAY' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatINR(party.openingBalance)} ({party.openingBalanceType === 'TO_PAY' ? 'To Pay' : 'To Receive'})
                  </span>
                ) : (
                  <span className="text-slate-400 italic">Not set</span>
                )}
                {!isSystemParty(party) && (
                  <button
                    type="button"
                    onClick={() => onEditParty(party)}
                    className="text-secondary-fixed font-semibold hover:underline cursor-pointer text-[10px] flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[12px]">edit</span>
                    <span>{party.openingBalance ? 'Edit' : 'Set'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {party.creditLimit && party.creditLimit > 0 && (
            <div className="pt-1">
              <div className="flex justify-between text-[10px] text-slate-300 font-semibold mb-0.5">
                <span>Credit Line: {formatINR(Math.abs(liveNetBalance))} / {formatINR(party.creditLimit)}</span>
                <span className={liveNetBalance > party.creditLimit ? 'text-rose-400 font-bold' : ''}>
                  {Math.round((Math.max(0, liveNetBalance) / party.creditLimit) * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    liveNetBalance > party.creditLimit ? 'bg-rose-500' : 'bg-secondary'
                  }`}
                  style={{
                    width: `${Math.min(100, (Math.max(0, liveNetBalance) / party.creditLimit) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
