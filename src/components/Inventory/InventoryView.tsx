import React, { useState } from 'react';
import { InventoryItem, StockAdjustment, UnitOfMeasurement } from '../../models/item.ts';
import { formatINR } from '../../core/utils/formatters.ts';

interface InventoryViewProps {
  items: InventoryItem[];
  onSaveItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
  onSaveAdjustment: (adj: StockAdjustment) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  onSaveItem,
  onDeleteItem,
  onSaveAdjustment,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [adjustmentItem, setAdjustmentItem] = useState<InventoryItem | null>(null);
  const [adjType, setAdjType] = useState<'STOCK_IN' | 'STOCK_OUT'>('STOCK_IN');
  const [adjQty, setAdjQty] = useState<number>(1);
  const [adjReason, setAdjReason] = useState('New inventory arrival');

  // New Item State
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [hsn, setHsn] = useState('');
  const [category, setCategory] = useState('Hardware');
  const [unit, setUnit] = useState<UnitOfMeasurement>('PCS');
  const [salePrice, setSalePrice] = useState<number>(0);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(18);
  const [currentStock, setCurrentStock] = useState<number>(10);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  // Metrics
  const totalStockValue = items.reduce((s, i) => s + (i.currentStock * i.purchasePrice), 0);
  const lowStockCount = items.filter((i) => i.currentStock <= i.minStockAlert).length;
  const categories = Array.from(new Set(items.map((i) => i.category)));

  const filtered = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
      item.hsnSacCode.includes(search);

    if (selectedCategory !== 'ALL') return matchesSearch && item.category === selectedCategory;
    return matchesSearch;
  });

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newItem: InventoryItem = {
      id: 'ITM-' + Date.now(),
      name: name.trim(),
      sku: sku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      hsnSacCode: hsn.trim() || '844332',
      category,
      unit,
      salePrice,
      purchasePrice,
      gstRate,
      currentStock,
      minStockAlert,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveItem(newItem);
    setIsModalOpen(false);
    // Reset
    setName('');
    setSku('');
    setHsn('');
    setSalePrice(0);
    setPurchasePrice(0);
    setCurrentStock(10);
  };

  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentItem || adjQty <= 0) return;

    const adj: StockAdjustment = {
      id: 'ADJ-' + Date.now(),
      itemId: adjustmentItem.id,
      itemName: adjustmentItem.name,
      type: adjType,
      quantity: adjQty,
      reason: adjReason,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };

    onSaveAdjustment(adj);
    setAdjustmentItem(null);
    setAdjQty(1);
  };

  return (
    <div className="flex flex-col w-full pb-24 max-w-4xl mx-auto px-margin-mobile py-4 gap-space-sm">
      {/* Top Banner: Metrics (Stitch inventory_stock) */}
      <div className="grid grid-cols-3 gap-space-xs">
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">
            Stock Valuation
          </span>
          <div className="font-currency-display-mobile text-currency-display-mobile text-on-surface font-extrabold mt-0.5">
            {formatINR(totalStockValue)}
          </div>
          <span className="text-[11px] text-secondary font-semibold mt-1">Asset Cost Value</span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">
            Total Products
          </span>
          <div className="font-currency-display-mobile text-currency-display-mobile text-secondary font-extrabold mt-0.5">
            {items.length}
          </div>
          <span className="text-[11px] text-on-surface-variant mt-1">Active Catalog SKUs</span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
          <span className="font-label-sm text-label-sm text-error font-bold uppercase tracking-wider">
            Low Stock Alerts
          </span>
          <div className="font-currency-display-mobile text-currency-display-mobile text-error font-extrabold mt-0.5">
            {lowStockCount}
          </div>
          <span className="text-[11px] text-error font-semibold mt-1">Reorder Required</span>
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
            placeholder="Search items by name, SKU, HSN..."
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
          <span className="material-symbols-outlined text-[18px]">add_box</span>
          <span>+ Add Item</span>
        </button>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'ALL'
              ? 'bg-secondary text-on-secondary shadow-sm'
              : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
          }`}
          type="button"
        >
          All Items ({items.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === cat
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            {cat} ({items.filter((i) => i.category === cat).length})
          </button>
        ))}
      </div>

      {/* Items List */}
      <div className="space-y-2 mt-1">
        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-on-surface-variant border border-outline-variant/20">
            No inventory items found.
          </div>
        ) : (
          filtered.map((item) => {
            const isLow = item.currentStock <= item.minStockAlert;
            return (
              <div
                key={item.id}
                className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col gap-2 hover:border-secondary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant flex-shrink-0">
                      <span className="material-symbols-outlined text-[22px]">inventory_2</span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="font-headline-sm text-sm text-on-surface font-bold truncate">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                        <span className="font-mono text-secondary font-semibold">{item.sku}</span>
                        <span>•</span>
                        <span>HSN {item.hsnSacCode}</span>
                        <span>•</span>
                        <span className="text-[11px] bg-surface-container px-1.5 py-0.2 rounded font-medium">
                          {item.category}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className="font-tabular-data text-[16px] font-extrabold text-on-surface">
                      {formatINR(item.salePrice)}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      Cost: {formatINR(item.purchasePrice)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[11px] flex items-center gap-1 ${
                        isLow
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${isLow ? 'bg-error' : 'bg-secondary'}`}
                      />
                      {item.currentStock} {item.unit} in stock
                    </span>
                    <span className="text-on-surface-variant font-medium">
                      GST {item.gstRate}%
                    </span>
                  </div>

                  {/* Stock In / Out Adjustment Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setAdjustmentItem(item);
                        setAdjType('STOCK_IN');
                        setAdjQty(1);
                      }}
                      className="px-2 py-1 rounded-lg bg-secondary-container text-on-secondary-container font-bold text-xs flex items-center gap-0.5 active:scale-95 cursor-pointer"
                      title="Add Stock"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span>
                      <span>Stock In</span>
                    </button>

                    <button
                      onClick={() => {
                        setAdjustmentItem(item);
                        setAdjType('STOCK_OUT');
                        setAdjQty(1);
                      }}
                      className="px-2 py-1 rounded-lg bg-surface-container-low text-on-surface-variant font-bold text-xs flex items-center gap-0.5 active:scale-95 cursor-pointer"
                      title="Reduce Stock"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[15px]">remove</span>
                      <span>Stock Out</span>
                    </button>

                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="w-7 h-7 rounded-lg text-error/60 hover:text-error flex items-center justify-center cursor-pointer"
                      title="Delete Item"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-md shadow-xl border border-outline-variant/30 flex flex-col gap-4">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface">Add Inventory Product</h3>

            <form onSubmit={handleCreateItem} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Thermal Printer 80mm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">SKU / Item Code</label>
                  <input
                    type="text"
                    placeholder="PRN-80"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">HSN / SAC Code</label>
                  <input
                    type="text"
                    placeholder="844332"
                    value={hsn}
                    onChange={(e) => setHsn(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="Hardware / Consumables"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Unit of Measure</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  >
                    <option value="PCS">PCS (Pieces)</option>
                    <option value="BOX">BOX (Boxes)</option>
                    <option value="KG">KG (Kilograms)</option>
                    <option value="MTR">MTR (Meters)</option>
                    <option value="NOS">NOS (Numbers)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Sale Price (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={salePrice || ''}
                    onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm font-bold focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Purchase Price</label>
                  <input
                    type="number"
                    min="0"
                    value={purchasePrice || ''}
                    onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">GST Rate</label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(parseFloat(e.target.value))}
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Current Stock Qty</label>
                  <input
                    type="number"
                    value={currentStock || ''}
                    onChange={(e) => setCurrentStock(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1">Low Stock Alert at</label>
                  <input
                    type="number"
                    value={minStockAlert || ''}
                    onChange={(e) => setMinStockAlert(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
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
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustmentItem && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm shadow-xl border border-outline-variant/30 flex flex-col gap-4">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface">
              {adjType === 'STOCK_IN' ? 'Stock In (Add Inventory)' : 'Stock Out (Reduce Inventory)'}
            </h3>
            <div className="text-xs text-on-surface-variant">
              Item: <strong>{adjustmentItem.name}</strong> • Current Stock: {adjustmentItem.currentStock} {adjustmentItem.unit}
            </div>

            <form onSubmit={handleApplyAdjustment} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Quantity ({adjustmentItem.unit}) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={adjQty}
                  onChange={(e) => setAdjQty(parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-lg font-extrabold focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant mb-1">Reason / Note</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentItem(null)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl font-bold text-xs shadow-sm cursor-pointer ${
                    adjType === 'STOCK_IN' ? 'bg-secondary text-on-secondary' : 'bg-error text-on-error'
                  }`}
                >
                  Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
