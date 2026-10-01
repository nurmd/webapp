import React, { useState, useMemo, useEffect } from 'react';
import { InventoryItem, UnitOfMeasurement } from '../../models/item.ts';
import { formatINR } from '../../core/utils/formatters.ts';

export interface InvoiceItemData {
  itemId: string;
  name: string;
  description?: string;
  hsnSacCode: string;
  quantity: number;
  unit: UnitOfMeasurement | string;
  unitPrice: number;
  mrp?: number;
  discountPercent: number;
  gstRate: number;
}

interface InvoiceItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveItem: (item: InvoiceItemData) => void;
  onDeleteItem?: () => void;
  initialItem?: InvoiceItemData | null;
  itemsCatalog: InventoryItem[];
  isIntraState: boolean;
}

const COMMON_UNITS: UnitOfMeasurement[] = [
  'PCS',
  'NOS',
  'BOX',
  'PKT',
  'KGS',
  'GMS',
  'LTR',
  'ML',
  'MTR',
  'SET',
  'BAG',
];

const GST_SLABS = [0, 5, 12, 18, 28];

export const InvoiceItemModal: React.FC<InvoiceItemModalProps> = ({
  isOpen,
  onClose,
  onSaveItem,
  onDeleteItem,
  initialItem,
  itemsCatalog,
  isIntraState,
}) => {
  const isEditing = Boolean(initialItem);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isCatalogSearchOpen, setIsCatalogSearchOpen] = useState(!isEditing);

  // Form Fields
  const [itemId, setItemId] = useState(initialItem?.itemId || '');
  const [name, setName] = useState(initialItem?.name || '');
  const [description, setDescription] = useState(initialItem?.description || '');
  const [hsnSacCode, setHsnSacCode] = useState(initialItem?.hsnSacCode || '998313');
  const [quantity, setQuantity] = useState<number>(initialItem?.quantity || 1);
  const [unit, setUnit] = useState<string>(initialItem?.unit || 'PCS');
  const [unitPrice, setUnitPrice] = useState<number>(initialItem?.unitPrice || 0);
  const [mrp, setMrp] = useState<number | undefined>(initialItem?.mrp);
  const [discountPercent, setDiscountPercent] = useState<number>(initialItem?.discountPercent || 0);
  const [gstRate, setGstRate] = useState<number>(initialItem?.gstRate ?? 18);

  // Sync state whenever modal opens or initialItem changes
  useEffect(() => {
    if (isOpen) {
      if (initialItem) {
        setItemId(initialItem.itemId || '');
        setName(initialItem.name || '');
        setDescription(initialItem.description || '');
        setHsnSacCode(initialItem.hsnSacCode || '998313');
        setQuantity(initialItem.quantity || 1);
        setUnit(initialItem.unit || 'PCS');
        setUnitPrice(initialItem.unitPrice || 0);
        setMrp(initialItem.mrp);
        setDiscountPercent(initialItem.discountPercent || 0);
        setGstRate(initialItem.gstRate ?? 18);
        setIsCatalogSearchOpen(false);
      } else {
        // Reset to clean blank item
        setItemId('');
        setName('');
        setDescription('');
        setHsnSacCode('998313');
        setQuantity(1);
        setUnit('PCS');
        setUnitPrice(0);
        setMrp(undefined);
        setDiscountPercent(0);
        setGstRate(18);
        setSearchQuery('');
        setIsCatalogSearchOpen(true);
      }
    }
  }, [isOpen, initialItem]);

  // Catalog item search matches
  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) {
      return itemsCatalog.slice(0, 8);
    }
    const q = searchQuery.toLowerCase().trim();
    return itemsCatalog
      .filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.barcode && it.barcode.toLowerCase().includes(q)) ||
          (it.sku && it.sku.toLowerCase().includes(q)) ||
          (it.hsnSacCode && it.hsnSacCode.includes(q)) ||
          (it.category && it.category.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [itemsCatalog, searchQuery]);

  // Select an item from catalog
  const handleSelectCatalogItem = (item: InventoryItem) => {
    setItemId(item.id);
    setName(item.name);
    setHsnSacCode(item.hsnSacCode || '998313');
    setUnit(item.unit || 'PCS');
    setUnitPrice(item.salePrice || 0);
    setMrp(item.mrp || item.salePrice || 0);
    setGstRate(item.gstRate ?? 18);
    setIsCatalogSearchOpen(false);
  };

  // Live item total calculation ("etitae total")
  const calculation = useMemo(() => {
    const qty = Math.max(0.001, Number(quantity) || 0);
    const rate = Math.max(0, Number(unitPrice) || 0);
    const gross = qty * rate;

    const discPct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    const discountAmount = (gross * discPct) / 100;
    const taxableAmount = Math.max(0, gross - discountAmount);

    const taxPct = Math.max(0, Number(gstRate) || 0);
    const gstAmount = (taxableAmount * taxPct) / 100;

    const cgstAmount = isIntraState ? gstAmount / 2 : 0;
    const sgstAmount = isIntraState ? gstAmount / 2 : 0;
    const igstAmount = isIntraState ? 0 : gstAmount;

    const totalAmount = taxableAmount + gstAmount;

    return {
      gross,
      discountAmount,
      taxableAmount,
      gstAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalAmount,
    };
  }, [quantity, unitPrice, discountPercent, gstRate, isIntraState]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || quantity <= 0) return;

    onSaveItem({
      itemId: itemId || `CUSTOM-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      hsnSacCode: hsnSacCode.trim() || '998313',
      quantity: Number(quantity) || 1,
      unit,
      unitPrice: Number(unitPrice) || 0,
      mrp: mrp ? Number(mrp) : undefined,
      discountPercent: Number(discountPercent) || 0,
      gstRate: Number(gstRate) || 0,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
      <div className="bg-surface-container-lowest w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[92vh] animate-slide-up sm:animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">
                {isEditing ? 'edit_note' : 'add_shopping_cart'}
              </span>
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-on-surface">
                {isEditing ? 'Edit Bill Item' : 'Add Item to Bill'}
              </h2>
              <span className="text-[11px] text-on-surface-variant">
                Select from inventory or enter details manually
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex flex-col gap-3.5 flex-1">
          {/* 1. Item Catalog Search Dropdown */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                <span>Select from Catalog</span>
                <span className="text-[10px] text-secondary lowercase font-normal">(optional)</span>
              </label>

              <button
                type="button"
                onClick={() => setIsCatalogSearchOpen(!isCatalogSearchOpen)}
                className="text-xs text-secondary font-bold hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <span>{isCatalogSearchOpen ? 'Hide Catalog' : 'Browse Inventory'}</span>
                <span className="material-symbols-outlined text-[16px]">
                  {isCatalogSearchOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            </div>

            {isCatalogSearchOpen && (
              <div className="border border-outline-variant/30 rounded-2xl p-2.5 bg-surface-container-low/50 flex flex-col gap-2">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, barcode, SKU or HSN..."
                    className="w-full pl-9 pr-7 py-2 rounded-xl bg-surface-container-lowest text-xs text-on-surface placeholder:text-outline border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">cancel</span>
                    </button>
                  )}
                </div>

                {/* Filtered Results List */}
                <div className="max-h-40 overflow-y-auto divide-y divide-outline-variant/20 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
                  {filteredCatalog.length === 0 ? (
                    <div className="p-3 text-center text-xs text-on-surface-variant">
                      No matching items found. Enter custom item details below.
                    </div>
                  ) : (
                    filteredCatalog.map((item) => {
                      const isSelected = itemId === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectCatalogItem(item)}
                          className={`p-2 sm:p-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-secondary/10 text-secondary'
                              : 'hover:bg-surface-container-low active:bg-surface-container'
                          }`}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-on-surface truncate">
                              {item.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant truncate mt-0.5">
                              {item.hsnSacCode && <span>HSN: {item.hsnSacCode}</span>}
                              <span>•</span>
                              <span>Stock: {item.currentStock} {item.unit}</span>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0">
                            <span className="font-tabular-data text-xs font-black text-on-surface block">
                              {formatINR(item.salePrice)}
                            </span>
                            <span className="text-[10px] font-semibold text-secondary block">
                              {item.gstRate}% GST
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Item Name & Description Fields */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-on-surface-variant">
              Item Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Basmati Rice 5kg, Sony Headphones..."
              className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-on-surface-variant flex items-center justify-between">
              <span>Description / Serial / Batch</span>
              <span className="text-[10px] text-outline lowercase font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Batch #409, IMEI, or product notes..."
              className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
            />
          </div>

          {/* 3. Quantity & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant">
                Quantity <span className="text-error">*</span>
              </label>
              <div className="flex items-center rounded-xl bg-surface-container-low border border-outline-variant/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, Number((quantity - 1).toFixed(2))))}
                  className="w-9 h-9 flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer font-bold"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
                  className="flex-1 text-center font-tabular-data text-xs sm:text-sm font-bold text-on-surface bg-transparent outline-none py-1.5"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(Number((quantity + 1).toFixed(2)))}
                  className="w-9 h-9 flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer font-bold"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all h-[38px]"
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Unit Price & MRP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant">
                Sale Price (₹) <span className="text-error">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={unitPrice || ''}
                  onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value)))}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-black text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant flex items-center justify-between">
                <span>MRP (₹)</span>
                <span className="text-[10px] text-outline lowercase font-normal">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mrp !== undefined ? mrp : ''}
                  onChange={(e) => setMrp(e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                />
              </div>
            </div>
          </div>

          {/* 5. Discount (%) and HSN/SAC */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant flex items-center justify-between">
                <span>Discount (%)</span>
                {calculation.discountAmount > 0 && (
                  <span className="text-[10px] text-secondary font-bold">
                    - {formatINR(calculation.discountAmount)}
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={discountPercent || ''}
                  onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline">
                  %
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant">HSN / SAC</label>
              <input
                type="text"
                value={hsnSacCode}
                onChange={(e) => setHsnSacCode(e.target.value)}
                placeholder="e.g. 998313"
                className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-mono font-medium text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
              />
            </div>
          </div>

          {/* 6. GST Tax Rate Slab */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-on-surface-variant">GST Slab</label>
            <div className="grid grid-cols-5 gap-1.5">
              {GST_SLABS.map((slab) => {
                const isSelected = gstRate === slab;
                return (
                  <button
                    key={slab}
                    type="button"
                    onClick={() => setGstRate(slab)}
                    className={`py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-secondary text-on-secondary border-secondary shadow-xs scale-102'
                        : 'bg-surface-container-low text-on-surface border-outline-variant/30 hover:bg-surface-container'
                    }`}
                  >
                    {slab}%
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. LIVE ESTIMATED TOTAL BREAKDOWN ("etitae total") */}
          <div className="rounded-2xl p-3.5 bg-gradient-to-br from-emerald-500/5 to-secondary/10 border border-secondary/25 flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between pb-1.5 border-b border-secondary/20">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">calculate</span>
                Estimated Item Total
              </span>
              <span className="font-tabular-data text-base sm:text-lg font-black text-secondary">
                {formatINR(calculation.totalAmount)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-on-surface-variant pt-0.5">
              <div className="flex items-center justify-between">
                <span>Gross ({quantity} × ₹{unitPrice}):</span>
                <span className="font-tabular-data font-semibold text-on-surface">
                  {formatINR(calculation.gross)}
                </span>
              </div>

              {calculation.discountAmount > 0 && (
                <div className="flex items-center justify-between text-secondary">
                  <span>Disc ({discountPercent}%):</span>
                  <span className="font-tabular-data font-semibold">
                    - {formatINR(calculation.discountAmount)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span>Taxable Value:</span>
                <span className="font-tabular-data font-semibold text-on-surface">
                  {formatINR(calculation.taxableAmount)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>
                  {isIntraState
                    ? `GST ${gstRate}% (CGST+SGST):`
                    : `IGST ${gstRate}%:`}
                </span>
                <span className="font-tabular-data font-semibold text-on-surface">
                  + {formatINR(calculation.gstAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-2 flex items-center justify-between gap-2">
            {isEditing && onDeleteItem && (
              <button
                type="button"
                onClick={() => {
                  onDeleteItem();
                  onClose();
                }}
                className="py-2.5 px-3 rounded-xl text-error font-bold text-xs hover:bg-error-container/40 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Delete</span>
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!name.trim() || quantity <= 0}
                className={`flex-1 sm:flex-initial py-2.5 px-5 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  !name.trim() || quantity <= 0
                    ? 'bg-outline-variant text-outline cursor-not-allowed'
                    : 'bg-secondary text-on-secondary hover:bg-secondary/90 shadow-secondary/20'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isEditing ? 'check' : 'add'}
                </span>
                <span>{isEditing ? 'Save Changes' : 'Add to Bill'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
