import React, { useState } from 'react';
import { InventoryItem, StockAdjustment, UnitOfMeasurement } from '../../models/item.ts';
import { formatINR } from '../../core/utils/formatters.ts';

interface InventoryViewProps {
  items: InventoryItem[];
  onSaveItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
  onSaveAdjustment: (adj: StockAdjustment) => void;
  onScanBarcodeClick?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  onSaveItem,
  onDeleteItem,
  onSaveAdjustment,
  onScanBarcodeClick,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState<boolean>(false);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustmentItem, setAdjustmentItem] = useState<InventoryItem | null>(null);
  const [adjType, setAdjType] = useState<'STOCK_IN' | 'STOCK_OUT'>('STOCK_IN');
  const [adjQty, setAdjQty] = useState<number>(1);
  const [adjReason, setAdjReason] = useState('New inventory arrival');

  // Form State (Product vs Service, Basic, Pricing, Stock)
  const [itemType, setItemType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hsn, setHsn] = useState('');
  const [category, setCategory] = useState('General');
  const [unit, setUnit] = useState<UnitOfMeasurement>('PCS');
  const [salePrice, setSalePrice] = useState<number>(0);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(18);
  const [currentStock, setCurrentStock] = useState<number>(10);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  // Financial Metrics (Tactile Fintech Card)
  const totalStockValue = items.reduce((s, i) => s + i.currentStock * i.purchasePrice, 0);
  const lowStockItems = items.filter((i) => i.currentStock <= i.minStockAlert);
  const lowStockCount = lowStockItems.length;
  const categories = Array.from(new Set(items.map((i) => i.category)));

  const filtered = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
      (item.barcode && item.barcode.includes(search)) ||
      item.hsnSacCode.includes(search);

    if (filterLowStockOnly) {
      return matchesSearch && item.currentStock <= item.minStockAlert;
    }
    if (selectedCategory !== 'ALL') {
      return matchesSearch && item.category === selectedCategory;
    }
    return matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingItem(null);
    setItemType('PRODUCT');
    setName('');
    setSku(`SKU-${Date.now().toString().slice(-4)}`);
    setBarcode('');
    setHsn('844332');
    setCategory('General');
    setUnit('PCS');
    setSalePrice(0);
    setPurchasePrice(0);
    setGstRate(18);
    setCurrentStock(10);
    setMinStockAlert(5);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setItemType(item.unit === 'HOURS' ? 'SERVICE' : 'PRODUCT');
    setName(item.name);
    setSku(item.sku || '');
    setBarcode(item.barcode || '');
    setHsn(item.hsnSacCode);
    setCategory(item.category);
    setUnit(item.unit);
    setSalePrice(item.salePrice);
    setPurchasePrice(item.purchasePrice);
    setGstRate(item.gstRate);
    setCurrentStock(item.currentStock);
    setMinStockAlert(item.minStockAlert);
    setIsModalOpen(true);
  };

  const handleSaveItemForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const itemToSave: InventoryItem = {
      id: editingItem ? editingItem.id : 'ITM-' + Date.now(),
      name: name.trim(),
      sku: sku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      barcode: barcode.trim() || undefined,
      hsnSacCode: hsn.trim() || '844332',
      category: category.trim() || 'General',
      unit: itemType === 'SERVICE' ? 'HOURS' : unit,
      salePrice: Number(salePrice),
      purchasePrice: Number(purchasePrice),
      gstRate: Number(gstRate),
      currentStock: itemType === 'SERVICE' ? 9999 : Number(currentStock),
      minStockAlert: itemType === 'SERVICE' ? 0 : Number(minStockAlert),
      createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveItem(itemToSave);
    setIsModalOpen(false);
    setEditingItem(null);
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
    <div className="flex flex-col w-full pb-28 max-w-4xl mx-auto bg-surface min-h-screen">
      {/* 1. Top Stock Value & Financial Valuation Summary (Stitch inventory_stock_simplified tactile card) */}
      <section className="px-margin-mobile pt-space-sm pb-space-xs">
        <div className="bg-primary-container text-on-primary rounded-xl p-space-md shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-outline-variant uppercase tracking-wider">
                Total Stock Value
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-currency-display-mobile text-[22px] font-bold text-on-primary">
                  {formatINR(totalStockValue)}
                </span>
                <span className="font-body-sm text-body-sm text-on-primary-container">
                  · {items.length} Items
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setFilterLowStockOnly(!filterLowStockOnly);
                setSelectedCategory('ALL');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm transition-all cursor-pointer ${
                filterLowStockOnly
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary-fixed-dim'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse" />
              <span>{lowStockCount} Need Restock</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Sticky Search & Quick Scan Input Area (Stitch simplified) */}
      <section className="px-margin-mobile pt-space-sm pb-space-xs">
        <div className="flex items-center gap-space-xs">
          <div className="relative flex-1 flex items-center bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/15">
            <span className="material-symbols-outlined text-outline ml-3 mr-2 text-[20px]">
              search
            </span>
            <input
              type="search"
              placeholder="Search items, SKU, or HSN code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-12 bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none pr-2"
            />
            {onScanBarcodeClick && (
              <button
                type="button"
                onClick={onScanBarcodeClick}
                aria-label="Scan Item Barcode"
                className="w-10 h-10 mr-1 flex items-center justify-center rounded-lg text-primary active:bg-surface-container-low transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[22px]">barcode_scanner</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            aria-label="Filter Options"
            className={`w-12 h-12 flex items-center justify-center rounded-xl bg-surface-container-lowest text-on-surface shadow-sm border border-outline-variant/15 active:bg-surface-container-low transition-colors cursor-pointer ${
              filterLowStockOnly ? 'border-secondary text-secondary' : ''
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </button>
        </div>
      </section>

      {/* 3. Horizontal Scrollable Category Pills (Stitch simplified) */}
      <section className="pt-space-xs pb-space-xs">
        <div className="flex items-center gap-space-xs overflow-x-auto px-margin-mobile no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('ALL');
              setFilterLowStockOnly(false);
            }}
            className={`px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap shadow-sm flex items-center gap-1.5 cursor-pointer transition-colors ${
              selectedCategory === 'ALL' && !filterLowStockOnly
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
          >
            <span>All Items</span>
            <span className="px-1.5 py-0.2 rounded-full bg-surface-container-lowest/25 text-[10px]">
              {items.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterLowStockOnly(true);
              setSelectedCategory('ALL');
            }}
            className={`px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap shadow-sm active:bg-surface-container-low transition-colors cursor-pointer ${
              filterLowStockOnly
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface-variant'
            }`}
          >
            Low Stock ({lowStockCount})
          </button>

          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                setFilterLowStockOnly(false);
              }}
              className={`px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap shadow-sm active:bg-surface-container-low transition-colors cursor-pointer ${
                selectedCategory === cat && !filterLowStockOnly
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* 4. Inventory Line Items Feed (Stitch simplified cards) */}
      <section className="px-margin-mobile flex flex-col gap-space-sm pb-28">
        {filtered.length === 0 ? (
          <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm p-8 text-center text-on-surface-variant border border-outline-variant/15">
            <span className="material-symbols-outlined text-[36px] text-outline mb-2">
              inventory_2
            </span>
            <p className="font-headline-sm text-sm font-semibold">No stock items match your search.</p>
            <p className="text-body-sm text-outline mt-1">Tap + Add New Item to create an inventory item.</p>
          </div>
        ) : (
          filtered.map((item) => {
            const isLow = item.currentStock <= item.minStockAlert && item.currentStock > 0;
            const isOut = item.currentStock <= 0;
            const itemStockValue = item.currentStock * item.purchasePrice;

            return (
              <div
                key={item.id}
                className="w-full bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/15 p-space-md flex flex-col gap-2 hover:border-secondary/40 transition-colors"
              >
                {/* Main Row: Image/Icon, Title, Price, Stock & Valuation */}
                <div className="flex items-center justify-between gap-space-sm">
                  <div className="flex items-center gap-space-sm min-w-0 flex-1">
                    {/* Item Avatar Thumbnail */}
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-surface-container-low flex-shrink-0 flex items-center justify-center border border-outline-variant/15">
                      <span className="material-symbols-outlined text-secondary text-[26px]">
                        inventory_2
                      </span>
                    </div>

                    {/* Details Column */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <h3 className="font-headline-sm text-[15px] sm:text-[16px] text-on-surface truncate font-semibold">
                        {item.name}
                      </h3>

                      <div className="flex items-center gap-2 mt-0.5 text-body-sm">
                        <div className="flex items-baseline gap-1">
                          <span className="text-outline text-[11px] font-label-sm uppercase">Sale:</span>
                          <span className="font-headline-sm text-body-md font-bold text-on-surface">
                            {formatINR(item.salePrice)}
                          </span>
                          <span className="text-outline text-[11px]">/{item.unit.toLowerCase()}</span>
                        </div>
                        <span className="text-outline-variant">•</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-outline text-[11px] font-label-sm uppercase">Buy:</span>
                          <span className="font-tabular-data text-body-sm font-semibold text-on-surface-variant">
                            {formatINR(item.purchasePrice)}
                          </span>
                        </div>
                      </div>

                      {/* Stock Badge */}
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOut
                              ? 'bg-error'
                              : isLow
                              ? 'bg-tertiary-fixed-dim animate-pulse'
                              : 'bg-secondary'
                          }`}
                        />
                        <span
                          className={`font-label-sm text-label-sm font-semibold ${
                            isOut
                              ? 'text-error'
                              : isLow
                              ? 'text-on-tertiary-fixed-variant'
                              : 'text-secondary'
                          }`}
                        >
                          {isOut
                            ? '0 (Out of stock)'
                            : isLow
                            ? `${item.currentStock} left (low)`
                            : `${item.currentStock} in stock`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stock Value Column */}
                  <div className="flex flex-col items-end justify-center flex-shrink-0 text-right">
                    <span className="font-label-sm text-[11px] text-outline uppercase tracking-wider">
                      Stock Value
                    </span>
                    <span className="font-tabular-data text-body-md font-bold text-on-surface mt-0.5">
                      {formatINR(itemStockValue)}
                    </span>
                  </div>
                </div>

                {/* Sub-Actions & Meta Row */}
                <div className="flex items-center justify-between pt-2 border-t border-outline-variant/15 text-xs">
                  <div className="flex items-center gap-1.5 text-on-surface-variant flex-wrap">
                    <span className="font-mono text-[11px] text-secondary font-semibold">
                      {item.sku}
                    </span>
                    <span>•</span>
                    <span className="text-[11px]">HSN: {item.hsnSacCode}</span>
                    <span>•</span>
                    <span className="text-[11px]">GST: {item.gstRate}%</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustmentItem(item);
                        setAdjType('STOCK_IN');
                        setAdjQty(1);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-secondary-container text-on-secondary-container font-bold text-xs flex items-center gap-0.5 active:scale-95 cursor-pointer"
                      title="Stock In"
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span>
                      <span>Stock In</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAdjustmentItem(item);
                        setAdjType('STOCK_OUT');
                        setAdjQty(1);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-bold text-xs flex items-center gap-0.5 active:scale-95 cursor-pointer"
                      title="Stock Out"
                    >
                      <span className="material-symbols-outlined text-[15px]">remove</span>
                      <span>Out</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="w-7 h-7 rounded-lg text-on-surface-variant hover:text-on-surface flex items-center justify-center cursor-pointer"
                      title="Edit Item"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      className="w-7 h-7 rounded-lg text-error/60 hover:text-error flex items-center justify-center cursor-pointer"
                      title="Delete Item"
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

      {/* 5. Sticky Bottom Floating Action Center (Stitch simplified) */}
      <div className="fixed bottom-20 left-0 right-0 z-40 px-margin-mobile pointer-events-none">
        <div className="max-w-md mx-auto flex items-center justify-end gap-space-xs pointer-events-auto">
          <button
            onClick={handleOpenAdd}
            className="h-12 px-5 rounded-full bg-secondary text-on-secondary shadow-lg flex items-center gap-2 font-label-md text-label-md active:scale-95 transition-transform cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">add_box</span>
            <span>Add New Item</span>
          </button>
          {onScanBarcodeClick && (
            <button
              onClick={onScanBarcodeClick}
              aria-label="Scan New Barcode"
              className="w-12 h-12 rounded-full bg-primary-container text-on-primary shadow-lg flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px] text-secondary-fixed">
                qr_code_scanner
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 6. Add / Edit Item Modal (Adapted directly from Stitch add_inventory_item/code.html) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-surface-container-lowest rounded-2xl p-5 w-full max-w-lg shadow-xl border border-outline-variant/30 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
                <h3 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface">
                  {editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveItemForm} className="flex flex-col gap-3.5 text-xs">
              {/* Type Selector: Product vs Service */}
              <div className="p-1 rounded-xl bg-surface-container-high flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setItemType('PRODUCT')}
                  className={`flex-1 py-2 rounded-lg font-label-md text-label-md text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    itemType === 'PRODUCT'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">
                    inventory_2
                  </span>
                  <span>Product (Goods)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setItemType('SERVICE')}
                  className={`flex-1 py-2 rounded-lg font-label-md text-label-md text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    itemType === 'SERVICE'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">
                    room_service
                  </span>
                  <span>Service</span>
                </button>
              </div>

              {/* Section 1: Basic Details Card */}
              <div className="bg-surface-container-low/50 rounded-xl p-3.5 border border-outline-variant/20 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-xs font-bold text-on-surface uppercase tracking-wider">
                    Basic Details
                  </span>
                  <span className="font-label-sm text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                    Mandatory
                  </span>
                </div>

                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                    Item Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Basmati Rice Royal Premium 5kg"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-body-md text-sm placeholder:text-outline focus:outline-none focus:border-secondary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Groceries"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                      HSN / SAC Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 100630"
                      value={hsn}
                      onChange={(e) => setHsn(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-mono focus:outline-none focus:border-secondary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                      SKU Code
                    </label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-mono focus:outline-none focus:border-secondary"
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                      Barcode (EAN/UPC)
                    </label>
                    <input
                      type="text"
                      placeholder="Scan or enter"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-mono focus:outline-none focus:border-secondary"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Pricing & GST Tax Rates */}
              <div className="bg-surface-container-low/50 rounded-xl p-3.5 border border-outline-variant/20 flex flex-col gap-2.5">
                <span className="font-label-md text-xs font-bold text-on-surface uppercase tracking-wider">
                  Pricing &amp; Tax Slabs
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                      Sale Price (₹) <span className="text-error">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={salePrice || ''}
                      onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                      className="w-full h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-sm font-bold focus:outline-none focus:border-secondary"
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                      Purchase Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={purchasePrice || ''}
                      onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                      className="w-full h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-secondary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1.5">
                    GST Tax Rate Slab
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0, 5, 12, 18, 28].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setGstRate(rate)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          gstRate === rate
                            ? 'bg-secondary text-on-secondary shadow-sm'
                            : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 3: Stock & Inventory Tracking (only for Product) */}
              {itemType === 'PRODUCT' && (
                <div className="bg-surface-container-low/50 rounded-xl p-3.5 border border-outline-variant/20 flex flex-col gap-2.5">
                  <span className="font-label-md text-xs font-bold text-on-surface uppercase tracking-wider">
                    Stock &amp; Inventory Units
                  </span>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                        Current Stock
                      </label>
                      <input
                        type="number"
                        value={currentStock || ''}
                        onChange={(e) => setCurrentStock(parseFloat(e.target.value) || 0)}
                        className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-bold focus:outline-none focus:border-secondary"
                      />
                    </div>

                    <div>
                      <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                        Unit
                      </label>
                      <select
                        value={unit}
                        onChange={(e) => setUnit(e.target.value as UnitOfMeasurement)}
                        className="w-full h-10 px-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
                      >
                        {['PCS', 'NOS', 'KGS', 'GMS', 'LTR', 'ML', 'BOX', 'BAG', 'MTR', 'ROLL', 'PACK'].map(
                          (u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                        Min Alert
                      </label>
                      <input
                        type="number"
                        value={minStockAlert || ''}
                        onChange={(e) => setMinStockAlert(parseFloat(e.target.value) || 0)}
                        className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm active:scale-95 transition-transform cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  <span>{editingItem ? 'Update Item' : 'Save Item'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Stock Adjustment Sheet / Modal */}
      {adjustmentItem && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-5 w-full max-w-sm shadow-xl border border-outline-variant/30 flex flex-col gap-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h3 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface">
                Adjust Stock: {adjustmentItem.name}
              </h3>
              <button
                type="button"
                onClick={() => setAdjustmentItem(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleApplyAdjustment} className="flex flex-col gap-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjType('STOCK_IN')}
                  className={`py-2 rounded-xl font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                    adjType === 'STOCK_IN'
                      ? 'bg-secondary text-on-secondary shadow-sm'
                      : 'bg-surface-container text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>Stock In</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdjType('STOCK_OUT')}
                  className={`py-2 rounded-xl font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                    adjType === 'STOCK_OUT'
                      ? 'bg-error text-on-error shadow-sm'
                      : 'bg-surface-container text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">remove</span>
                  <span>Stock Out</span>
                </button>
              </div>

              <div>
                <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                  Quantity ({adjustmentItem.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={adjQty}
                  onChange={(e) => setAdjQty(parseFloat(e.target.value) || 1)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-base font-bold focus:outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                  Reason / Note
                </label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setAdjustmentItem(null)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm cursor-pointer active:scale-95"
                >
                  Apply Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
