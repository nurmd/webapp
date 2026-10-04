import React from 'react';
import { HeldBill } from './types.ts';
import { formatINR } from '../../core/utils/formatters.ts';

interface HoldBillsModalProps {
  isOpen: boolean;
  heldBills: HeldBill[];
  onResumeBill: (bill: HeldBill) => void;
  onDiscardBill: (billId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export const HoldBillsModal: React.FC<HoldBillsModalProps> = ({
  isOpen,
  heldBills,
  onResumeBill,
  onDiscardBill,
  onClearAll,
  onClose,
}) => {
  if (!isOpen) return null;

  const formatTimeAgo = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins === 1) return '1 min ago';
      if (mins < 60) return `${mins} mins ago`;
      const hours = Math.floor(mins / 60);
      return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600 text-[22px]">pause_circle</span>
            <div>
              <h3 className="font-headline-sm text-base font-bold text-on-surface">
                Parked / Held Bills ({heldBills.length})
              </h3>
              <p className="text-[11px] text-outline">
                Saved multi-cart bills waiting for customer resume
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {heldBills.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-outline gap-2 text-center">
              <span className="material-symbols-outlined text-4xl text-outline-variant">
                hourglass_empty
              </span>
              <p className="text-xs font-semibold">No bills currently parked on hold.</p>
              <p className="text-[11px] text-outline max-w-xs">
                When a customer needs to fetch more items, click "Hold Bill" (F4) to park their cart and serve the next person.
              </p>
            </div>
          ) : (
            heldBills.map((bill) => {
              const totalItemsCount = bill.cart.reduce((s, c) => s + c.qty, 0);
              const customerName = bill.customer.party
                ? bill.customer.party.name
                : bill.customer.phone
                ? `Customer (${bill.customer.phone})`
                : 'Walk-in Customer';

              return (
                <div
                  key={bill.id}
                  className="bg-surface-container-low/60 rounded-xl p-3.5 border border-outline-variant/25 flex flex-col gap-2.5 hover:border-secondary/40 transition-all shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold px-2 py-0.5 rounded-lg text-xs">
                        {bill.label}
                      </span>
                      <span className="text-xs font-bold text-on-surface truncate">
                        {customerName}
                      </span>
                    </div>
                    <span className="text-[10px] text-outline flex-shrink-0">
                      {formatTimeAgo(bill.heldAt)}
                    </span>
                  </div>

                  {/* Summary preview of items */}
                  <div className="text-[11px] text-on-surface-variant truncate bg-surface-container-lowest/80 px-2.5 py-1.5 rounded-lg border border-outline-variant/15">
                    {bill.cart.map((c) => `${c.item.name} × ${c.qty}`).join(', ')}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-outline-variant/15">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs text-outline">
                        {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'} •
                      </span>
                      <span className="text-sm font-bold text-secondary font-tabular-data">
                        {formatINR(bill.totalAmount)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onDiscardBill(bill.id)}
                        className="px-2.5 py-1 text-xs text-error hover:bg-error-container/20 rounded-lg font-medium cursor-pointer transition-colors"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onResumeBill(bill);
                          onClose();
                        }}
                        className="px-3.5 py-1 bg-secondary text-on-secondary text-xs font-bold rounded-lg shadow-sm hover:bg-secondary/90 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                        <span>Resume</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {heldBills.length > 0 && (
          <div className="p-3 border-t border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Discard all parked bills?')) {
                  onClearAll();
                }
              }}
              className="text-xs text-error font-medium hover:underline cursor-pointer"
            >
              Clear All Held Bills
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-surface-container hover:bg-surface-container-high cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
