import React, { useState } from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InventoryItem } from '../../models/item.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { TableGridPurchaseModal } from './TableGridPurchaseModal.tsx';
import { SimplifiedPurchaseModal } from './SimplifiedPurchaseModal.tsx';

interface PurchasesHubViewProps {
  purchases: PurchaseBill[];
  parties: Party[];
  company: CompanyProfile;
  itemsCatalog: InventoryItem[];
  onSavePurchase: (bill: PurchaseBill) => void;
  onDeletePurchase: (id: string) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onAddNewParty?: () => void;
}

export const PurchasesHubView: React.FC<PurchasesHubViewProps> = ({
  purchases,
  parties,
  company,
  itemsCatalog,
  onSavePurchase,
  onDeletePurchase,
  onEditPurchase,
  onAddNewParty,
}) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'UNPAID' | 'DUE' | 'PAID'>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<PurchaseBill | null>(null);
  const [selectedBillForPreview, setSelectedBillForPreview] = useState<PurchaseBill | null>(null);

  // Financial Metrics (Stitch purchases_hub_simplified)
  const totalPurchases = purchases.reduce((s, p) => s + p.grandTotal, 0);
  const unpaidPurchases = purchases.filter((p) => p.paymentStatus !== 'PAID');
  const totalToPay = unpaidPurchases.reduce((s, p) => s + (p.balanceAmount || p.grandTotal), 0);
  const totalItcClaimable = purchases
    .filter((p) => p.itcEligibility !== 'INELIGIBLE_17_5')
    .reduce((s, p) => s + p.totalTax, 0);

  const filtered = purchases.filter((p) => {
    const matchesSearch =
      p.billNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(search.toLowerCase()) ||
      (p.supplierGstin && p.supplierGstin.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterStatus === 'UNPAID') return p.paymentStatus === 'UNPAID';
    if (filterStatus === 'DUE') return p.paymentStatus === 'PARTIAL' || (p.paymentStatus === 'UNPAID' && (p.balanceAmount || 0) > 0);
    if (filterStatus === 'PAID') return p.paymentStatus === 'PAID';
    return true;
  });



  const handleQuickPay = (bill: PurchaseBill) => {
    const updated: PurchaseBill = {
      ...bill,
      paidAmount: bill.grandTotal,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      updatedAt: new Date().toISOString(),
    };
    onSavePurchase(updated);
  };

  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div className="flex flex-col w-full pb-28 max-w-4xl mx-auto px-margin-mobile py-3 gap-space-sm">
      {/* Header Banner & Quick Status (Simplified Purchase Ledger) */}
      <div className="flex items-center justify-between pt-space-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
          <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
            Purchase Ledger
          </span>
        </div>
        <div className="flex items-center gap-1 bg-surface-container-low px-space-sm py-1 rounded-full shadow-sm text-xs font-semibold">
          <span className="material-symbols-outlined text-[15px] text-orange-600 dark:text-orange-400" style={{ fontVariationSettings: "'FILL' 1" }}>
            shopping_bag
          </span>
          <span className="font-label-sm text-on-surface">{currentMonthName}</span>
        </div>
      </div>

      {/* 1. Dynamic Micro Financial Insight Metric Carousel (Stitch purchases_hub_simplified) */}
      <section className="pt-space-xs">
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-outline-variant/30">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20 mb-space-sm">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-orange-600 dark:text-orange-400">
                shopping_bag
              </span>
              <span className="font-label-md text-label-md text-on-surface font-semibold">
                {currentMonthName} Purchases
              </span>
            </div>
            <span className="font-label-sm text-label-sm text-orange-600 dark:text-orange-400 flex items-center gap-0.5 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">
              <span className="material-symbols-outlined text-[13px]">trending_up</span> +8.2%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                Total Purchases
              </span>
              <span className="font-headline-sm text-headline-sm text-on-surface font-bold mt-0.5">
                {formatINR(totalPurchases)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {purchases.length} Bills
              </span>
            </div>

            <div className="flex flex-col border-l border-outline-variant/30 pl-2">
              <span className="font-label-sm text-label-sm text-error flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-error" /> To Pay
              </span>
              <span className="font-headline-sm text-headline-sm text-error font-bold mt-0.5">
                {formatINR(totalToPay)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {unpaidPurchases.length} Pending
              </span>
            </div>

            <div className="flex flex-col border-l border-outline-variant/30 pl-2">
              <span className="font-label-sm text-label-sm text-orange-600 dark:text-orange-400 flex items-center gap-1 font-medium">
                <span className="material-symbols-outlined text-[13px]">account_balance</span> ITC
              </span>
              <span className="font-headline-sm text-headline-sm text-orange-600 dark:text-orange-400 font-bold mt-0.5">
                {formatINR(totalItcClaimable)}
              </span>
              <span className="font-body-sm text-body-sm text-orange-600/80 dark:text-orange-400/80 font-medium">Eligible</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Tactical Quick Actions Carousel (Stitch purchases_hub_simplified) */}
      <section className="pt-space-xs">
        <div className="grid grid-cols-2 gap-space-sm">
          <button
            onClick={() => {
              setEditingBill(null);
              setIsModalOpen(true);
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white shadow-sm shadow-orange-600/25 px-space-md py-2.5 rounded-xl flex items-center justify-center gap-1.5 flex-1 active:scale-95 transition-all cursor-pointer font-bold"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">post_add</span>
            <span className="font-label-md text-label-md whitespace-nowrap">+ Purchase Bill</span>
          </button>

          <button
            onClick={() => {
              setEditingBill(null);
              setIsModalOpen(true);
            }}
            className="bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-sm px-space-md py-2.5 rounded-xl flex items-center justify-center gap-1.5 flex-1 active:bg-surface-container-low transition-colors cursor-pointer font-bold"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
              description
            </span>
            <span className="font-label-md text-label-md whitespace-nowrap">+ Purchase Order</span>
          </button>
        </div>
      </section>

      {/* 3. Smart Search & Filter Segmented Bar (Stitch purchases_hub_simplified) */}
      <section className="pt-space-xs flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[20px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search bill, supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-10 bg-surface-container-lowest rounded-xl font-body-md text-body-md text-on-surface shadow-sm border border-outline-variant/30 focus:outline-none placeholder:text-outline"
            />
          </div>
        </div>

        <div className="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setFilterStatus('ALL')}
            className={`px-3.5 py-1 rounded-full font-label-sm text-label-sm shadow-sm flex items-center gap-1.5 flex-shrink-0 cursor-pointer transition-all ${
              filterStatus === 'ALL'
                ? 'bg-orange-600 text-white'
                : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface'
            }`}
          >
            <span>All</span>
            <span className="bg-surface-container-lowest/20 px-1.5 py-0.2 rounded-full text-label-sm">
              {purchases.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('UNPAID')}
            className={`px-3.5 py-1 rounded-full font-label-sm text-label-sm border shadow-sm flex items-center gap-1.5 flex-shrink-0 cursor-pointer transition-all ${
              filterStatus === 'UNPAID'
                ? 'bg-error text-on-error border-error'
                : 'bg-surface-container-lowest border-outline-variant/30 text-error'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            <span>Unpaid</span>
            <span className="bg-error-container text-on-error-container px-1.5 py-0.2 rounded-full text-label-sm font-bold">
              {unpaidPurchases.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('DUE')}
            className={`px-3.5 py-1 rounded-full font-label-sm text-label-sm border shadow-sm flex items-center gap-1.5 flex-shrink-0 cursor-pointer transition-all ${
              filterStatus === 'DUE'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-surface-container-lowest border-outline-variant/30 text-amber-700 dark:text-amber-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Due Soon</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('PAID')}
            className={`px-3.5 py-1 rounded-full font-label-sm text-label-sm border shadow-sm flex items-center gap-1.5 flex-shrink-0 cursor-pointer transition-all ${
              filterStatus === 'PAID'
                ? 'bg-orange-600 text-white border-orange-600'
                : 'bg-surface-container-lowest border-outline-variant/30 text-orange-600 dark:text-orange-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span>Paid</span>
            <span className="bg-orange-500/15 text-orange-700 dark:text-orange-300 px-1.5 py-0.2 rounded-full text-label-sm font-bold">
              {purchases.filter((p) => p.paymentStatus === 'PAID').length}
            </span>
          </button>
        </div>
      </section>

      {/* 4. Purchase Bills List Stream (Stitch purchases_hub_simplified) */}
      <section className="flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-sm">
            No purchase records found.
          </div>
        ) : (
          filtered.map((bill) => {
            const isUnpaid = bill.paymentStatus === 'UNPAID';
            const isPartial = bill.paymentStatus === 'PARTIAL';
            const itemDesc = bill.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');

            return (
              <div
                key={bill.id}
                onClick={() => setSelectedBillForPreview(bill)}
                className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-2.5 transition-all hover:border-orange-500/40 cursor-pointer active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2 sm:gap-space-sm">
                  <div className="flex items-center gap-2 sm:gap-space-sm min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0 font-bold text-orange-600 dark:text-orange-400 text-base">
                      {bill.supplierName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-label-md text-xs sm:text-label-md text-on-surface font-semibold truncate">
                        {bill.supplierName}
                      </span>
                      <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-[11px] sm:text-xs">
                        <span>{bill.billNumber}</span>
                        <span className="w-1 h-1 rounded-full bg-outline-variant" />
                        <span>{formatDate(bill.date)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0 text-right pl-2 min-w-[76px] sm:min-w-[95px]">
                    <span
                      className={`font-headline-sm text-xs sm:text-base font-bold whitespace-nowrap ${
                        isUnpaid ? 'text-error' : 'text-on-surface'
                      }`}
                    >
                      {formatINR(bill.grandTotal)}
                    </span>
                    <span
                      className={`font-label-sm text-[10px] sm:text-label-sm px-2 py-0.5 rounded-full mt-0.5 flex items-center gap-0.5 font-bold whitespace-nowrap ${
                        isUnpaid
                          ? 'text-error bg-error-container/60'
                          : isPartial
                          ? 'text-amber-700 dark:text-amber-300 bg-amber-500/15'
                          : 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border border-orange-500/20'
                      }`}
                    >
                      {isUnpaid ? (
                        <>
                          <span className="material-symbols-outlined text-[13px]">warning</span>
                          <span>Overdue</span>
                        </>
                      ) : isPartial ? (
                        <>
                          <span className="material-symbols-outlined text-[13px]">schedule</span>
                          <span>Due soon</span>
                        </>
                      ) : (
                        <>
                          <span
                            className="material-symbols-outlined text-[13px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            check_circle
                          </span>
                          <span>Paid</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Line items summary pill with ITC badge */}
                <div className="bg-surface-container-low/60 rounded-xl px-3 py-1.5 flex items-center justify-between text-body-sm">
                  <span className="text-on-surface-variant truncate font-body-sm text-xs">
                    {itemDesc || `${bill.items.length} purchased items`}
                  </span>
                  <span className="font-tabular-data text-tabular-data text-orange-600 dark:text-orange-400 flex-shrink-0 font-bold text-xs ml-2">
                    +{formatINR(bill.totalTax)} ITC
                  </span>
                </div>

                {/* Bottom row actions */}
                <div className="flex items-center justify-between pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBillForPreview(bill);
                    }}
                    className="h-8 px-2.5 rounded-lg bg-surface-container-low text-on-surface font-label-sm text-label-sm flex items-center gap-1 active:bg-surface-container transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                      picture_as_pdf
                    </span>
                    <span>Bill Details</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {isUnpaid || isPartial ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickPay(bill);
                        }}
                        className="h-8 px-space-md rounded-lg bg-error text-on-error font-label-md text-label-md flex items-center gap-1 shadow-sm active:scale-95 transition-transform cursor-pointer font-bold"
                      >
                        <span className="material-symbols-outlined text-[16px]">send_money</span>
                        <span>Pay Now</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 text-on-surface-variant font-body-sm text-xs">
                        <span className="material-symbols-outlined text-[15px] text-orange-600 dark:text-orange-400">
                          sync
                        </span>
                        <span>Settled</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onEditPurchase) {
                          onEditPurchase(bill);
                        } else {
                          setEditingBill(bill);
                        }
                      }}
                      className="w-7 h-7 rounded-lg text-outline hover:text-on-surface flex items-center justify-center cursor-pointer"
                      title="Edit Purchase Bill"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePurchase(bill.id);
                      }}
                      className="w-7 h-7 rounded-lg text-error/60 hover:text-error flex items-center justify-center cursor-pointer"
                      title="Delete Record"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Table Grid Purchase Workstation Modal */}
      {(isModalOpen || editingBill) && (
        <TableGridPurchaseModal
          company={company}
          parties={parties}
          itemsCatalog={itemsCatalog}
          initialBill={editingBill}
          onClose={() => {
            setIsModalOpen(false);
            setEditingBill(null);
          }}
          onSave={(newBill) => {
            onSavePurchase(newBill);
            setIsModalOpen(false);
            setEditingBill(null);
          }}
          onAddNewParty={() => {
            if (onAddNewParty) onAddNewParty();
          }}
        />
      )}

      {/* Simplified Mobile Purchase Bill Preview Modal */}
      {selectedBillForPreview && (
        <SimplifiedPurchaseModal
          bill={selectedBillForPreview}
          company={company}
          onClose={() => setSelectedBillForPreview(null)}
          onEditPurchase={(bill) => {
            setSelectedBillForPreview(null);
            if (onEditPurchase) {
              onEditPurchase(bill);
            } else {
              setEditingBill(bill);
            }
          }}
          onDeletePurchase={(id) => {
            setSelectedBillForPreview(null);
            onDeletePurchase(id);
          }}
        />
      )}
    </div>
  );
};
