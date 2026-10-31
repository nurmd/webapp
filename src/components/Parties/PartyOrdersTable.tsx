import React, { useMemo } from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
import { formatINR } from '../../core/utils/formatters.ts';

export interface PartyOrdersTableProps {
  orders: PurchaseBill[];
  purchaseOrderTotal: number;
  grnTotal: number;
  unbilledOrdersTotal: number;
  onOrderClick: (order: PurchaseBill) => void;
}

export const PartyOrdersTable: React.FC<PartyOrdersTableProps> = ({
  orders,
  purchaseOrderTotal,
  grnTotal,
  unbilledOrdersTotal,
  onOrderClick,
}) => {
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createdB - createdA;
    });
  }, [orders]);

  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-3 sm:p-4 shadow-xs flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-0.5">
        <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <span className="text-xs font-bold text-on-surface">Orders</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-container font-bold text-on-surface-variant">
            {orders.length}
          </span>
        </div>
      </div>

      {/* Totals chips */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5 text-xs font-bold p-2 rounded-xl bg-surface-container-low border border-outline-variant/15">
        <span className="px-2 py-1 rounded-lg bg-surface-container text-on-surface whitespace-nowrap shrink-0">
          PO Total {formatINR(purchaseOrderTotal)}
        </span>
        <span className="px-2 py-1 rounded-lg bg-surface-container text-on-surface whitespace-nowrap shrink-0">
          GRN Total {formatINR(grnTotal)}
        </span>
        <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
          Unbilled {formatINR(unbilledOrdersTotal)}
        </span>
      </div>

      {/* Orders Item Cards Feed */}
      <div className="space-y-1.5">
        {sortedOrders.length === 0 ? (
          <div className="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-[24px] text-outline">shopping_bag</span>
            <p className="text-xs">No purchase orders or GRNs recorded</p>
          </div>
        ) : (
          sortedOrders.map((order) => {
            const isPO = order.purchaseType === 'PO';
            const isCancelled =
              order.isCancelled === true ||
              order.orderStatus === 'CANCELLED' ||
              order.challanStatus === 'CANCELLED';

            let statusBadgeText = '';
            if (isCancelled) {
              statusBadgeText = 'Cancelled';
            } else if (isPO) {
              statusBadgeText = order.orderStatus || 'PENDING';
            } else {
              statusBadgeText = order.isConverted ? 'BILLED' : (order.challanStatus || 'RECEIVED');
            }

            const itemCount = order.items?.length || 0;
            const itemLabel = itemCount === 1 ? '1 item' : `${itemCount} items`;

            return (
              <div
                key={order.id}
                data-testid={`party-order-row-${order.id}`}
                onClick={() => onOrderClick(order)}
                className={`p-2.5 rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isCancelled
                    ? 'bg-surface-container-low/30 opacity-70 hover:opacity-90'
                    : 'bg-surface-container-low/60 hover:bg-surface-container-low active:scale-[0.99]'
                }`}
              >
                {/* Left Icon and Details */}
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isCancelled
                        ? 'bg-outline-variant/30 text-outline'
                        : isPO
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {isPO ? 'shopping_cart' : 'local_shipping'}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      <span
                        className={`font-bold text-xs truncate whitespace-nowrap shrink-0 ${
                          isCancelled ? 'line-through text-outline' : 'text-on-surface'
                        }`}
                      >
                        {isPO ? `PO #${order.billNumber}` : `GRN #${order.billNumber}`}
                      </span>

                      {/* Status badge */}
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full whitespace-nowrap shrink-0 ${
                          isCancelled
                            ? 'bg-outline-variant/30 text-outline'
                            : order.isConverted || statusBadgeText === 'BILLED'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : statusBadgeText === 'FULFILLED' || statusBadgeText === 'RECEIVED'
                            ? 'bg-secondary/10 text-secondary'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {statusBadgeText}
                      </span>

                      {/* Converted bill reference badge */}
                      {order.convertedToBillNumber && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-primary/10 text-primary">
                          Billed → #{order.convertedToBillNumber}
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-on-surface-variant truncate">
                      {order.date} • {itemLabel}
                      {!isPO && ' • Purchase Challan'}
                    </p>
                  </div>
                </div>

                {/* Right Amount & Chevron */}
                <div className="flex items-center gap-1.5 flex-shrink-0 text-right">
                  <div>
                    <span
                      className={`font-currency-display-mobile text-xs font-black block ${
                        isCancelled ? 'line-through text-outline' : 'text-on-surface'
                      }`}
                    >
                      {formatINR(order.grandTotal)}
                    </span>
                  </div>

                  <span className="material-symbols-outlined text-[16px] text-outline ml-0.5">
                    chevron_right
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
