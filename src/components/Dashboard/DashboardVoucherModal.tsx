import React from 'react';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { safeOpenExternalUrl, getPartyTotalBalanceDue } from '../../core/utils/upiAndShare.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { printAccountingVoucher } from '../../core/utils/voucherDocumentPrinter.ts';

export interface DashboardVoucherModalProps {
  voucher: Voucher | null;
  company: CompanyProfile;
  parties?: Party[];
  onClose: () => void;
}

export const DashboardVoucherModal: React.FC<DashboardVoucherModalProps> = ({
  voucher,
  company,
  parties,
  onClose,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, !!voucher, 25);

  const linkedParty = React.useMemo(() => {
    if (!voucher?.partyId || !parties || parties.length === 0) return null;
    return parties.find((p) => p.id === voucher.partyId) || null;
  }, [voucher?.partyId, parties]);

  if (!voucher) return null;

  const isReceipt = voucher.voucherType === 'RECEIPT';
  const isPayment = voucher.voucherType === 'PAYMENT';
  const badgeColor = isReceipt
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    : isPayment
    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';

  const handleShareWhatsApp = () => {
    const partyDue = linkedParty ? getPartyTotalBalanceDue(linkedParty) : null;
    const dueLine = partyDue !== null ? `*Total Balance Due:* ${formatINR(partyDue)}\n` : '';

    const text = `*Voucher Receipt - ${company.tradeName || company.businessName}*\n` +
      `--------------------------------\n` +
      `*Voucher No:* ${voucher.voucherNumber}\n` +
      `*Type:* ${voucher.voucherType}\n` +
      `*Date:* ${voucher.date}\n` +
      `*Amount:* ${formatINR(voucher.totalAmount)}\n` +
      dueLine +
      (voucher.narration ? `*Narration:* ${voucher.narration}\n` : '') +
      `--------------------------------\n` +
      `Recorded in GST Billing App`;
    safeOpenExternalUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const handlePrint = () => {
    printAccountingVoucher(company, voucher);
  };

  const entries = voucher.entries || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 p-3.5 sm:p-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isReceipt
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isReceipt ? 'payments' : 'account_balance_wallet'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-sm text-on-surface truncate">
                  {voucher.voucherNumber}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                  {voucher.voucherType}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant font-medium">
                {formatDate(voucher.date)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
            title="Close"
            aria-label="Close voucher details"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
          {/* Total Amount Hero */}
          <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase font-bold text-on-surface-variant tracking-wider">
                Voucher Amount
              </span>
              <span
                className={`font-tabular-data text-2xl font-black mt-0.5 ${
                  isReceipt
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatINR(voucher.totalAmount)}
              </span>
            </div>
            <div
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 ${
                isReceipt
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isReceipt ? 'south_west' : 'north_east'}
              </span>
              <span>{isReceipt ? 'Money In' : 'Money Out'}</span>
            </div>
          </div>

          {/* Narration */}
          {voucher.narration && (
            <div className="p-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-xs text-on-surface">
              <span className="font-bold text-on-surface-variant block text-[10px] uppercase mb-0.5">
                Narration / Details
              </span>
              <p className="font-medium leading-relaxed">{voucher.narration}</p>
            </div>
          )}

          {/* Reference */}
          {voucher.referenceNo && (
            <div className="flex items-center justify-between text-xs px-1 text-on-surface-variant">
              <span>Reference Number:</span>
              <span className="font-mono font-bold text-on-surface">{voucher.referenceNo}</span>
            </div>
          )}

          {/* Accounting Journal Entries */}
          <div>
            <span className="text-[11px] font-bold uppercase text-on-surface-variant tracking-wider block mb-1.5 px-1">
              Double-Entry Ledger Lines
            </span>
            <div className="rounded-xl border border-outline-variant/20 overflow-hidden divide-y divide-outline-variant/15">
              {entries.length === 0 ? (
                <div className="p-3 text-center text-xs text-on-surface-variant font-medium">
                  No ledger lines recorded.
                </div>
              ) : (
                entries.map((entry, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-surface-container-low/30 flex items-center justify-between text-xs"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-bold text-on-surface truncate">
                        {entry.accountName || entry.accountId}
                      </span>
                      {entry.narration && (
                        <span className="text-[10px] text-on-surface-variant truncate">
                          {entry.narration}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-right font-mono font-bold">
                      {entry.debit > 0 && (
                        <span className="text-blue-600 dark:text-blue-400">
                          Dr {formatINR(entry.debit)}
                        </span>
                      )}
                      {entry.credit > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Cr {formatINR(entry.credit)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Print</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs flex items-center justify-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
