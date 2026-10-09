import React from 'react';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';

export interface PartyInfoCardProps {
  party: Party;
  company: CompanyProfile;
  liveNetBalance: number;
  isReceivable: boolean;
  isPayable: boolean;
  totalBilled: number;
  totalPaid: number;
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
  showPartyDetails,
  setShowPartyDetails,
  onEditParty,
}) => {
  return (
    <section className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/20 shadow-xs flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold tracking-wider text-outline">
            {isReceivable ? "You'll Receive" : isPayable ? "You'll Pay" : 'Net Balance'}
          </span>
          <span
            className={`font-currency-display-mobile text-xl sm:text-2xl font-black mt-0.5 ${
              isReceivable
                ? 'text-error'
                : isPayable
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-secondary'
            }`}
          >
            {liveNetBalance === 0 ? '₹0 (Settled)' : formatINR(Math.abs(liveNetBalance))}
          </span>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isReceivable
                ? 'bg-error/10 text-error'
                : isPayable
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-secondary/10 text-secondary'
            }`}
          >
            {isReceivable ? 'Pending Due' : isPayable ? 'To Pay' : 'All Clear'}
          </span>

          <button
            type="button"
            onClick={() => setShowPartyDetails((prev) => !prev)}
            className="text-secondary text-[11px] font-semibold hover:underline flex items-center gap-0.5 cursor-pointer mt-1"
          >
            <span>{showPartyDetails ? 'Hide Info' : 'Party Info'}</span>
            <span className="material-symbols-outlined text-[14px]">
              {showPartyDetails ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* Quick Sub-Metrics Bar */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/20 text-xs">
        <div className="flex items-center justify-between pr-2">
          <span className="text-on-surface-variant text-[11px]">Total Bills:</span>
          <span className="font-bold text-on-surface">{formatINR(totalBilled)}</span>
        </div>
        <div className="flex items-center justify-between pl-2 border-l border-outline-variant/20">
          <span className="text-on-surface-variant text-[11px]">Total Paid:</span>
          <span className="font-bold text-secondary">{formatINR(totalPaid)}</span>
        </div>
      </div>

      {/* Opening Balance info chip if set */}
      {((typeof party.openingBalance === 'number' && party.openingBalance > 0) || party.openingBalanceDate) && (
        <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-surface-container-low text-on-surface-variant">
          <span className="flex items-center gap-1 font-medium">
            <span className="material-symbols-outlined text-[14px] text-secondary">account_balance_wallet</span>
            <span>Opening Balance:</span>
          </span>
          <div className="flex items-center gap-1.5 font-bold">
            <span className={party.openingBalanceType === 'TO_PAY' ? 'text-error' : 'text-secondary'}>
              {formatINR(party.openingBalance || 0)} ({party.openingBalanceType === 'TO_PAY' ? 'To Pay' : 'To Receive'})
            </span>
            {party.openingBalanceDate && (
              <span className="text-[10px] text-outline font-normal">
                • {party.openingBalanceDate}
              </span>
            )}
            <button
              type="button"
              onClick={() => onEditParty(party)}
              className="p-0.5 text-on-surface-variant hover:text-secondary rounded cursor-pointer ml-1"
              title="Edit Opening Balance"
            >
              <span className="material-symbols-outlined text-[13px]">edit</span>
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Info Drawer */}
      {showPartyDetails && (
        <div className="pt-2.5 border-t border-outline-variant/20 text-xs text-on-surface space-y-1.5 animate-in fade-in">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {company.isGstEnabled !== false && (
              <div>
                <span className="text-outline block">GSTIN</span>
                <span className="font-mono font-bold text-on-surface truncate block">
                  {party.gstin || 'Unregistered'}
                </span>
              </div>
            )}
            <div>
              <span className="text-outline block">PAN</span>
              <span className="font-mono font-bold text-on-surface truncate block">
                {party.pan || 'N/A'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-outline block">Billing Address</span>
              <span className="font-medium text-on-surface truncate block">
                {party.billingAddress || 'Local Counter'}
              </span>
            </div>
            <div className="col-span-2 pt-1 border-t border-outline-variant/15 flex items-center justify-between">
              <span className="text-outline">Opening Balance</span>
              <div className="flex items-center gap-1.5">
                {party.openingBalance ? (
                  <span className="font-bold">
                    {formatINR(party.openingBalance)} ({party.openingBalanceType === 'TO_PAY' ? 'To Pay' : 'To Receive'})
                  </span>
                ) : (
                  <span className="text-outline italic">Not set</span>
                )}
                <button
                  type="button"
                  onClick={() => onEditParty(party)}
                  className="text-secondary font-semibold hover:underline cursor-pointer text-[10px] flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-[12px]">edit</span>
                  <span>{party.openingBalance ? 'Edit' : 'Set'}</span>
                </button>
              </div>
            </div>
          </div>

          {party.creditLimit && party.creditLimit > 0 && (
            <div className="pt-1">
              <div className="flex justify-between text-[10px] text-on-surface-variant font-semibold mb-0.5">
                <span>Credit Line: {formatINR(Math.abs(liveNetBalance))} / {formatINR(party.creditLimit)}</span>
                <span className={liveNetBalance > party.creditLimit ? 'text-error font-bold' : ''}>
                  {Math.round((Math.max(0, liveNetBalance) / party.creditLimit) * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    liveNetBalance > party.creditLimit ? 'bg-error' : 'bg-secondary'
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
