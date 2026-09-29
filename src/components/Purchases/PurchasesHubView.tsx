import React, { useState } from 'react';
import { PurchaseBill, ItcEligibility } from '../../models/purchase.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InventoryItem } from '../../models/item.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';

interface PurchasesHubViewProps {
  purchases: PurchaseBill[];
  parties: Party[];
  company: CompanyProfile;
  itemsCatalog: InventoryItem[];
  onSavePurchase: (bill: PurchaseBill) => void;
  onDeletePurchase: (id: string) => void;
}

export const PurchasesHubView: React.FC<PurchasesHubViewProps> = ({
  purchases,
  parties,
  company,
  itemsCatalog,
  onSavePurchase,
  onDeletePurchase,
}) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'UNPAID' | 'DUE' | 'PAID'>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBillForPreview, setSelectedBillForPreview] = useState<PurchaseBill | null>(null);

  // Form State
  const suppliers = parties.filter((p) => p.type === 'SUPPLIER' || p.type === 'CUSTOMER');
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || '');
  const [billNumber, setBillNumber] = useState(`PB-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [itcEligibility, setItcEligibility] = useState<ItcEligibility>('ELIGIBLE_INPUTS');
  const [supplierStateCode, setSupplierStateCode] = useState(suppliers[0]?.stateCode || company.stateCode);

  const [lines, setLines] = useState<Array<{
    itemId: string;
    name: string;
    hsnSacCode: string;
    quantity: number;
    unitPrice: number;
    gstRate: number;
  }>>([
    {
      itemId: itemsCatalog[0]?.id || '',
      name: itemsCatalog[0]?.name || 'Purchased Raw Material',
      hsnSacCode: itemsCatalog[0]?.hsnSacCode || '844332',
      quantity: 10,
      unitPrice: itemsCatalog[0]?.purchasePrice || 1000,
      gstRate: itemsCatalog[0]?.gstRate || 18,
    },
  ]);

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

  const handleCreatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = parties.find((p) => p.id === selectedSupplierId) || suppliers[0];
    const supState = supplierStateCode || sup?.stateCode || company.stateCode;
    const isIntra = supState === company.stateCode;

    const calc = calculateInvoice(
      company.stateCode,
      supState,
      lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        gstRate: l.gstRate,
      }))
    );

    const newBill: PurchaseBill = {
      id: 'PUR-' + Date.now(),
      billNumber: billNumber.trim(),
      supplierId: sup?.id || 'SUP-001',
      supplierName: sup?.name || 'Local Vendor',
      supplierGstin: sup?.gstin,
      supplierAddress: sup?.billingAddress || '',
      supplierStateCode: supState,
      placeOfSupplyStateCode: company.stateCode,
      isIntraState: isIntra,
      date: billDate,
      items: lines.map((l, idx) => ({
        itemId: l.itemId,
        name: l.name,
        hsnSacCode: l.hsnSacCode,
        unit: 'PCS',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxableAmount: calc.items[idx]?.taxableAmount || l.quantity * l.unitPrice,
        gstRate: l.gstRate,
        cgstAmount: calc.items[idx]?.cgstAmount || 0,
        sgstAmount: calc.items[idx]?.sgstAmount || 0,
        igstAmount: calc.items[idx]?.igstAmount || 0,
        cessAmount: 0,
        totalAmount: calc.items[idx]?.totalAmount || 0,
      })),
      itcEligibility,
      isRcm: false,
      totalGrossAmount: calc.totalGrossAmount,
      totalDiscount: calc.totalDiscount,
      totalTaxableAmount: calc.totalTaxableAmount,
      totalCgst: calc.totalCgst,
      totalSgst: calc.totalSgst,
      totalIgst: calc.totalIgst,
      totalCess: 0,
      totalTax: calc.totalTax,
      roundOff: calc.roundOff,
      grandTotal: calc.grandTotal,
      paidAmount: calc.grandTotal,
      balanceAmount: 0,
      paymentMode: 'NET_BANKING',
      paymentStatus: 'PAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSavePurchase(newBill);
    setIsModalOpen(false);
  };

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
      {/* 1. Dynamic Micro Financial Insight Metric Carousel (Stitch purchases_hub_simplified) */}
      <section className="pt-space-xs">
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-outline-variant/30">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20 mb-space-sm">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-secondary">
                receipt_long
              </span>
              <span className="font-label-md text-label-md text-on-surface font-semibold">
                {currentMonthName} Purchases
              </span>
            </div>
            <span className="font-label-sm text-label-sm text-secondary flex items-center gap-0.5 bg-secondary-container/50 px-2 py-0.5 rounded-full font-medium">
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
              <span className="font-label-sm text-label-sm text-secondary flex items-center gap-1 font-medium">
                <span className="material-symbols-outlined text-[13px]">account_balance</span> ITC
              </span>
              <span className="font-headline-sm text-headline-sm text-secondary font-bold mt-0.5">
                {formatINR(totalItcClaimable)}
              </span>
              <span className="font-body-sm text-body-sm text-secondary font-medium">Eligible</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Tactical Quick Actions Carousel (Stitch purchases_hub_simplified) */}
      <section className="pt-space-xs">
        <div className="grid grid-cols-2 gap-space-sm">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-secondary text-on-secondary shadow-sm px-space-md py-2.5 rounded-xl flex items-center justify-center gap-1.5 flex-1 active:scale-95 transition-transform cursor-pointer font-bold"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">post_add</span>
            <span className="font-label-md text-label-md whitespace-nowrap">+ Purchase Bill</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
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
                ? 'bg-primary text-on-primary'
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
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-container-lowest border-outline-variant/30 text-on-tertiary-container'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary-fixed-dim" />
            <span>Due Soon</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('PAID')}
            className={`px-3.5 py-1 rounded-full font-label-sm text-label-sm border shadow-sm flex items-center gap-1.5 flex-shrink-0 cursor-pointer transition-all ${
              filterStatus === 'PAID'
                ? 'bg-secondary text-on-secondary border-secondary'
                : 'bg-surface-container-lowest border-outline-variant/30 text-secondary'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Paid</span>
            <span className="bg-secondary-container text-on-secondary-container px-1.5 py-0.2 rounded-full text-label-sm font-bold">
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
                className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-2.5 transition-all hover:border-secondary/40"
              >
                <div className="flex items-start justify-between gap-2 sm:gap-space-sm">
                  <div className="flex items-center gap-2 sm:gap-space-sm min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0 font-bold text-secondary text-base">
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
                          ? 'text-on-tertiary-container bg-surface-container'
                          : 'text-secondary bg-secondary-container/50'
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
                  <span className="font-tabular-data text-tabular-data text-secondary flex-shrink-0 font-bold text-xs ml-2">
                    +{formatINR(bill.totalTax)} ITC
                  </span>
                </div>

                {/* Bottom row actions */}
                <div className="flex items-center justify-between pt-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedBillForPreview(bill)}
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
                        onClick={() => handleQuickPay(bill)}
                        className="h-8 px-space-md rounded-lg bg-error text-on-error font-label-md text-label-md flex items-center gap-1 shadow-sm active:scale-95 transition-transform cursor-pointer font-bold"
                      >
                        <span className="material-symbols-outlined text-[16px]">send_money</span>
                        <span>Pay Now</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 text-on-surface-variant font-body-sm text-xs">
                        <span className="material-symbols-outlined text-[15px] text-secondary">
                          sync
                        </span>
                        <span>Settled</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeletePurchase(bill.id)}
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

      {/* Record Purchase Modal Drawer (Stitch simplified) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
          <div className="bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl p-space-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-secondary text-on-secondary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">post_add</span>
                </div>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Record Supplier Purchase
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreatePurchase} className="space-y-space-sm text-xs">
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant block mb-1 font-bold">
                  Select Supplier / Vendor *
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-surface-container-low rounded-xl px-space-md h-12 text-body-md font-body-md text-on-surface focus:outline-none border border-outline-variant/30"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone}) {s.gstin ? `• ${s.gstin}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-space-sm">
                <div>
                  <label className="font-label-sm text-label-sm text-on-surface-variant block mb-1 font-bold">
                    Bill / Invoice No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    className="w-full h-11 px-space-md bg-surface-container-low rounded-xl font-body-md text-body-md text-on-surface focus:outline-none border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="font-label-sm text-label-sm text-on-surface-variant block mb-1 font-bold">
                    Bill Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full h-11 px-space-md bg-surface-container-low rounded-xl font-body-md text-body-md text-on-surface focus:outline-none border border-outline-variant/30"
                  />
                </div>
              </div>

              {/* Purchase Item Lines */}
              <div className="space-y-2 pt-2">
                <span className="font-bold text-on-surface block">Purchased Products</span>
                {lines.map((l, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 bg-surface-container-low p-3 rounded-xl border border-outline-variant/20"
                  >
                    <div className="col-span-5">
                      <label className="block text-[10px] text-on-surface-variant font-bold mb-0.5">
                        Product
                      </label>
                      <input
                        type="text"
                        required
                        value={l.name}
                        onChange={(e) => {
                          const n = [...lines];
                          n[idx].name = e.target.value;
                          setLines(n);
                        }}
                        className="w-full px-2 py-1.5 bg-surface rounded-lg text-xs font-bold"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-on-surface-variant font-bold mb-0.5">
                        Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={l.quantity}
                        onChange={(e) => {
                          const n = [...lines];
                          n[idx].quantity = parseFloat(e.target.value) || 1;
                          setLines(n);
                        }}
                        className="w-full px-2 py-1.5 bg-surface rounded-lg text-xs font-bold text-center"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] text-on-surface-variant font-bold mb-0.5">
                        Rate (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={l.unitPrice}
                        onChange={(e) => {
                          const n = [...lines];
                          n[idx].unitPrice = parseFloat(e.target.value) || 0;
                          setLines(n);
                        }}
                        className="w-full px-2 py-1.5 bg-surface rounded-lg text-xs font-bold"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-on-surface-variant font-bold mb-0.5">
                        GST %
                      </label>
                      <select
                        value={l.gstRate}
                        onChange={(e) => {
                          const n = [...lines];
                          n[idx].gstRate = parseInt(e.target.value, 10);
                          setLines(n);
                        }}
                        className="w-full px-1 py-1.5 bg-surface rounded-lg text-xs font-bold"
                      >
                        {[0, 5, 12, 18, 28].map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* ITC Eligibility Selection */}
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant block mb-1 font-bold">
                  ITC Eligibility
                </label>
                <select
                  value={itcEligibility}
                  onChange={(e) => setItcEligibility(e.target.value as ItcEligibility)}
                  className="w-full bg-surface-container-low rounded-xl px-space-md h-11 text-xs text-on-surface focus:outline-none border border-outline-variant/30"
                >
                  <option value="ELIGIBLE_INPUTS">Eligible Inputs (Raw Materials / Stock)</option>
                  <option value="ELIGIBLE_CAPITAL_GOODS">Eligible Capital Goods (Machinery / Equipment)</option>
                  <option value="ELIGIBLE_SERVICES">Eligible Input Services</option>
                  <option value="INELIGIBLE_17_5">Ineligible ITC under Sec 17(5)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-on-surface-variant text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm cursor-pointer active:scale-95"
                >
                  Save Inward Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill Preview Details Modal */}
      {selectedBillForPreview && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div>
                <h3 className="font-headline-sm text-base font-bold text-on-surface">
                  {selectedBillForPreview.billNumber}
                </h3>
                <span className="text-xs text-on-surface-variant">
                  {selectedBillForPreview.supplierName} • {formatDate(selectedBillForPreview.date)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillForPreview(null)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Taxable Value:</span>
                <span className="font-bold text-on-surface">
                  {formatINR(selectedBillForPreview.totalTaxableAmount)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Input Tax Credit (ITC):</span>
                <span className="font-bold text-secondary">
                  {formatINR(selectedBillForPreview.totalTax)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Total Bill Value:</span>
                <span className="font-bold text-base text-on-surface">
                  {formatINR(selectedBillForPreview.grandTotal)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-on-surface-variant">Payment Status:</span>
                <span className="font-bold text-secondary">{selectedBillForPreview.paymentStatus}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedBillForPreview(null)}
              className="mt-2 w-full py-2.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
