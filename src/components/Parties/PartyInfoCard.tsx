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
  isCustomer?: boolean;
  isPaymentOpen?: boolean;
  onRecordPayment?: () => void;
  onCreateInvoice?: (party: Party) => void;
  onCreatePurchase?: (party: Party) => void;
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
  isCustomer = party.type === 'CUSTOMER',
  isPaymentOpen = false,
  onRecordPayment,
  onCreateInvoice,
  onCreatePurchase,
}) => {
  const group = party.groupId ? db.getPartyGroups().find((g) => g.id === party.groupId) : undefined;
  const category = party.categoryId ? db.getPartyCategories().find((c) => c.id === party.categoryId) : undefined;

  return (
    <section className="bg-white dark:bg-surface-container-lowest text-on-surface rounded-2xl p-3 sm:p-4 border border-outline-variant/40 shadow-sm flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-600">
            {isReceivable ? "You'll Receive" : isPayable ? "You'll Pay" : 'Net Balance'}
          </span>
          <span className="font-currency-display-mobile text-xl sm:text-2xl font-black mt-0.5 text-slate-900 dark:text-on-surface">
            {liveNetBalance === 0 ? '₹0 (Settled)' : formatINR(Math.abs(liveNetBalance))}
          </span>
          {party.type !== 'CUSTOMER' && typeof unbilledTotal === 'number' && unbilledTotal > 0 && (
            <span className="text-[11px] font-medium text-slate-500 mt-0.5">
              (Unbilled {formatINR(unbilledTotal)})
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isReceivable
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : isPayable
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {isReceivable ? 'Pending Due' : isPayable ? 'To Pay' : 'All Clear'}
          </span>

          <button
            type="button"
            onClick={() => setShowPartyDetails((prev) => !prev)}
            className="text-secondary hover:text-secondary/80 text-[11px] font-semibold hover:underline flex items-center gap-0.5 cursor-pointer mt-1"
          >
            <span>{showPartyDetails ? 'Hide Info' : 'Party Info'}</span>
            <span className="material-symbols-outlined text-[14px]">
              {showPartyDetails ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* Quick Sub-Metrics Bar: Sticky Label and Amount on Left, Action Buttons on Right */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/20 text-xs flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1.5 p-1.5 sm:p-2 rounded-xl bg-slate-50 dark:bg-surface-container-low border border-slate-200/60 shrink-0 whitespace-nowrap">
            <span className="text-slate-600 text-[10px] sm:text-[11px] whitespace-nowrap font-medium">Total Bill:</span>
            <span className="font-bold text-slate-900 whitespace-nowrap">{formatINR(totalBilled)}</span>
          </div>
          <div className="flex items-center gap-1.5 p-1.5 sm:p-2 rounded-xl bg-slate-50 dark:bg-surface-container-low border border-slate-200/60 shrink-0 whitespace-nowrap">
            <span className="text-slate-600 text-[10px] sm:text-[11px] whitespace-nowrap font-medium">Total Paid:</span>
            <span className="font-bold text-slate-900 whitespace-nowrap">{formatINR(totalPaid)}</span>
          </div>
        </div>

        {(onRecordPayment || onCreateInvoice || onCreatePurchase) && (
          <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto justify-end shrink-0 md:hidden mt-1 sm:mt-0">
            {onRecordPayment && (
              <button
                type="button"
                onClick={onRecordPayment}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 py-1.5 px-2 sm:px-2.5 rounded-xl font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs shrink-0 ${
                  isPaymentOpen
                    ? 'bg-secondary text-on-secondary'
                    : 'bg-secondary/10 text-secondary border border-secondary/25 hover:bg-secondary/20'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isPaymentOpen ? 'close' : 'payments'}
                </span>
                <span>{isPaymentOpen ? 'Close Payment' : 'Record Payment'}</span>
              </button>
            )}

            {isCustomer ? (
              onCreateInvoice && (
                <button
                  type="button"
                  onClick={() => onCreateInvoice(party)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1 py-1.5 px-2 sm:px-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90 shrink-0"
                  title="Create new sales invoice for this customer"
                >
                  <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                  <span>New Invoice</span>
                </button>
              )
            ) : (
              onCreatePurchase ? (
                <button
                  type="button"
                  onClick={() => onCreatePurchase(party)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1 py-1.5 px-2 sm:px-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90 shrink-0"
                  title="Create new purchase bill from this supplier"
                >
                  <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                  <span>New Bill</span>
                </button>
              ) : onCreateInvoice && (
                <button
                  type="button"
                  onClick={() => onCreateInvoice(party)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1 py-1.5 px-2 sm:px-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90 shrink-0"
                  title="Create new sales invoice"
                >
                  <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                  <span>New Invoice</span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Collapsible Info Drawer */}
      {showPartyDetails && (
        <div className="pt-2.5 border-t border-outline-variant/20 text-xs text-slate-700 space-y-1.5 animate-in fade-in">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {company.isGstEnabled !== false && (
              <div>
                <span className="text-slate-600 block">GSTIN</span>
                <span className="font-mono font-bold text-slate-900 truncate block">
                  {party.gstin || 'Unregistered'}
                </span>
              </div>
            )}
            <div>
              <span className="text-slate-600 block">PAN</span>
              <span className="font-mono font-bold text-slate-900 truncate block">
                {party.pan || 'N/A'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-600 block">Billing Address</span>
              <span className="font-medium text-slate-900 truncate block">
                {party.billingAddress || 'Local Counter'}
              </span>
            </div>
            {(group || category) && (
              <div className="col-span-2 pt-1 border-t border-outline-variant/20 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                {group && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: `${group.color || '#2563eb'}18`,
                      color: group.color || '#1d4ed8',
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
                      backgroundColor: `${category.color || '#0d9488'}18`,
                      color: category.color || '#0f766e',
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
          </div>

          {party.creditLimit && party.creditLimit > 0 && (
            <div className="pt-1">
              <div className="flex justify-between text-[10px] text-slate-700 font-semibold mb-0.5">
                <span>Credit Line: {formatINR(Math.abs(liveNetBalance))} / {formatINR(party.creditLimit)}</span>
                <span className={liveNetBalance > party.creditLimit ? 'text-rose-700 font-bold' : 'text-slate-900 font-bold'}>
                  {Math.round((Math.max(0, liveNetBalance) / party.creditLimit) * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
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
