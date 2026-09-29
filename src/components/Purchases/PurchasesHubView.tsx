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
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const suppliers = parties.filter((p) => p.type === 'SUPPLIER' || p.type === 'CUSTOMER');
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || '');
  const [billNumber, setBillNumber] = useState(`BILL-${Math.floor(1000 + Math.random() * 9000)}`);
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

  // Aggregates
  const totalPurchases = purchases.reduce((s, p) => s + p.grandTotal, 0);
  const totalItcClaimable = purchases
    .filter((p) => p.itcEligibility !== 'INELIGIBLE_17_5')
    .reduce((s, p) => s + p.totalTax, 0);

  const filtered = purchases.filter((p) =>
    p.billNumber.toLowerCase().includes(search.toLowerCase()) ||
    p.supplierName.toLowerCase().includes(search.toLowerCase()) ||
    (p.supplierGstin && p.supplierGstin.toLowerCase().includes(search.toLowerCase()))
  );

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

  return (
    <div className="flex flex-col w-full pb-24 max-w-4xl mx-auto px-margin-mobile py-4 gap-space-sm">
      {/* Top Banner: Metrics (Stitch purchases_hub) */}
      <div className="grid grid-cols-2 gap-space-xs">
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">
            Total Inward Purchases
          </span>
          <div className="font-currency-display-mobile text-currency-display-mobile text-on-surface font-extrabold mt-0.5">
            {formatINR(totalPurchases)}
          </div>
          <span className="text-[11px] text-on-surface-variant mt-1">
            {purchases.length} Supplier Bills Logged
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
          <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
            Eligible Input Tax Credit (ITC)
          </span>
          <div className="font-currency-display-mobile text-currency-display-mobile text-secondary font-extrabold mt-0.5">
            {formatINR(totalItcClaimable)}
          </div>
          <span className="text-[11px] text-secondary font-semibold mt-1">
            Claimable against sales GST
          </span>
        </div>
      </div>

      {/* Action Bar & Search */}
      <div className="flex items-center gap-2 mt-2">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-outline">
            search
          </span>
          <input
            type="text"
            placeholder="Search purchases by supplier, bill no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-container-lowest text-on-surface text-sm pl-11 pr-4 py-2.5 rounded-xl shadow-sm border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
          />
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="h-10 px-4 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ Record Purchase</span>
        </button>
      </div>

      {/* Purchases List */}
      <div className="space-y-2 mt-1">
        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-on-surface-variant border border-outline-variant/20">
            No purchase records found.
          </div>
        ) : (
          filtered.map((bill) => (
            <div
              key={bill.id}
              className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex items-center justify-between gap-3 hover:border-secondary/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="font-headline-sm text-sm text-on-surface font-bold truncate">
                    {bill.supplierName}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                    <span className="font-semibold text-secondary">{bill.billNumber}</span>
                    <span>•</span>
                    <span>{formatDate(bill.date)}</span>
                    {bill.supplierGstin && (
                      <>
                        <span>•</span>
                        <span className="text-[11px] font-mono">{bill.supplierGstin}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex flex-col items-end">
                  <span className="font-tabular-data text-[15px] font-extrabold text-on-surface">
                    {formatINR(bill.grandTotal)}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-secondary-container text-on-secondary-container">
                    ITC: {formatINR(bill.totalTax)}
                  </span>
                </div>

                <button
                  onClick={() => onDeletePurchase(bill.id)}
                  className="w-8 h-8 rounded-lg text-error/60 hover:text-error flex items-center justify-center cursor-pointer"
                  title="Delete"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Record Purchase Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-md shadow-xl border border-outline-variant/30 flex flex-col gap-4">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface">Record Supplier Purchase</h3>

            <form onSubmit={handleCreatePurchase} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Select Supplier *</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => {
                    setSelectedSupplierId(e.target.value);
                    const match = parties.find((p) => p.id === e.target.value);
                    if (match) setSupplierStateCode(match.stateCode);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Supplier Bill # *</label>
                  <input
                    type="text"
                    required
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Bill Date</label>
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Item Purchased</label>
                <input
                  type="text"
                  value={lines[0]?.name}
                  onChange={(e) => {
                    const updated = [...lines];
                    updated[0].name = e.target.value;
                    setLines(updated);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={lines[0]?.quantity}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[0].quantity = parseFloat(e.target.value) || 1;
                      setLines(updated);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm font-bold focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Cost Rate (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={lines[0]?.unitPrice}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[0].unitPrice = parseFloat(e.target.value) || 0;
                      setLines(updated);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm font-bold focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">GST %</label>
                  <select
                    value={lines[0]?.gstRate}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[0].gstRate = parseFloat(e.target.value);
                      setLines(updated);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  >
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Input Tax Credit (ITC)</label>
                <select
                  value={itcEligibility}
                  onChange={(e) => setItcEligibility(e.target.value as ItcEligibility)}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                >
                  <option value="ELIGIBLE_INPUTS">Eligible - Goods / Raw Materials</option>
                  <option value="ELIGIBLE_SERVICES">Eligible - Business Services</option>
                  <option value="ELIGIBLE_CAPITAL_GOODS">Eligible - Capital Assets</option>
                  <option value="INELIGIBLE_17_5">Blocked u/s 17(5) - Ineligible</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm cursor-pointer"
                >
                  Save Inward Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
