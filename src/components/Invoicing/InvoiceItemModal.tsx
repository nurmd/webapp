import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  const nameInputRef = useRef<HTMLInputElement>(null);

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

  // Integrated Search Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [justAddedCount, setJustAddedCount] = useState(0);

  // Editable Total State
  const [totalInput, setTotalInput] = useState<string>('');
  const [isEditingTotal, setIsEditingTotal] = useState(false);

  // Editable Discount Amount State
  const [discountAmountInput, setDiscountAmountInput] = useState<string>('');
  const [isEditingDiscountAmount, setIsEditingDiscountAmount] = useState(false);

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
        setIsEditingTotal(false);
        setIsEditingDiscountAmount(false);
        setIsDropdownOpen(false);
      } else {
        resetForm();
        setJustAddedCount(0);
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 150);
      }
    }
  }, [isOpen, initialItem]);

  const resetForm = () => {
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
    setTotalInput('');
    setIsEditingTotal(false);
    setDiscountAmountInput('');
    setIsEditingDiscountAmount(false);
    setIsDropdownOpen(false);
  };

  // Typeahead catalog suggestions based on Item Name
  const suggestions = useMemo(() => {
    if (!name.trim()) {
      return itemsCatalog.slice(0, 6);
    }
    const q = name.toLowerCase().trim();
    return itemsCatalog
      .filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.barcode && it.barcode.toLowerCase().includes(q)) ||
          (it.sku && it.sku.toLowerCase().includes(q)) ||
          (it.category && it.category.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [itemsCatalog, name]);

  // Handle catalog item selection
  const handleSelectCatalogItem = (item: InventoryItem) => {
    setItemId(item.id);
    setName(item.name);
    setHsnSacCode(item.hsnSacCode || '998313');
    setUnit(item.unit || 'PCS');
    setUnitPrice(item.salePrice || 0);
    setMrp(item.mrp || item.salePrice || 0);
    setGstRate(item.gstRate ?? 18);
    setIsDropdownOpen(false);
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

  // Keep totalInput synchronized with calculated total unless user is actively editing it
  useEffect(() => {
    if (!isEditingTotal) {
      if (calculation.totalAmount > 0) {
        setTotalInput(calculation.totalAmount.toFixed(2));
      } else {
        setTotalInput('');
      }
    }
  }, [calculation.totalAmount, isEditingTotal]);

  // Keep discountAmountInput synchronized with calculated discount unless user is actively editing it
  useEffect(() => {
    if (!isEditingDiscountAmount) {
      if (calculation.discountAmount > 0) {
        setDiscountAmountInput(calculation.discountAmount.toFixed(2));
      } else {
        setDiscountAmountInput('');
      }
    }
  }, [calculation.discountAmount, isEditingDiscountAmount]);

  const handleDiscountPercentChange = (valStr: string) => {
    if (!valStr.trim()) {
      setDiscountPercent(0);
      return;
    }
    const val = Math.min(100, Math.max(0, Number(valStr)));
    setDiscountPercent(val);
  };

  const handleDiscountAmountChange = (valStr: string) => {
    setDiscountAmountInput(valStr);
    if (!valStr.trim()) {
      setDiscountPercent(0);
      return;
    }
    const val = parseFloat(valStr);
    if (isNaN(val) || val < 0) return;

    const gross = (Number(quantity) || 1) * (Number(unitPrice) || 0);
    if (gross > 0) {
      const calculatedPct = Math.min(100, Math.round(((val / gross) * 100) * 100) / 100);
      setDiscountPercent(calculatedPct);
    }
  };

  // Back-calculate unitPrice when user edits Total directly
  const handleTotalChange = (valStr: string) => {
    setTotalInput(valStr);
    if (!valStr.trim()) {
      setUnitPrice(0);
      return;
    }

    const newTotal = parseFloat(valStr);
    if (isNaN(newTotal) || newTotal < 0) {
      return;
    }

    const qty = Math.max(0.0001, Number(quantity) || 1);
    const discPct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    const discMultiplier = 1 - discPct / 100;
    const taxPct = Math.max(0, Number(gstRate) || 0);
    const taxMultiplier = 1 + taxPct / 100;

    const divisor = qty * (discMultiplier > 0 ? discMultiplier : 1) * taxMultiplier;
    if (divisor > 0) {
      const calculatedPrice = Math.round((newTotal / divisor) * 100) / 100;
      setUnitPrice(calculatedPrice);
    }
  };

  if (!isOpen) return null;

  const buildItemData = (): InvoiceItemData => ({
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

  // Save and keep modal open for next product
  const handleSaveAndAddMore = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || quantity <= 0) return;

    onSaveItem(buildItemData());
    setJustAddedCount((prev) => prev + 1);
    resetForm();
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
  };

  // Save and close modal
  const handleSaveAndClose = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || quantity <= 0) return;

    onSaveItem(buildItemData());
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
                {isEditing ? 'Edit Item' : 'Add Item to Bill'}
              </h2>
              <span className="text-[11px] text-on-surface-variant">
                {justAddedCount > 0 ? (
                  <span className="text-secondary font-bold">
                    ✓ {justAddedCount} item{justAddedCount > 1 ? 's' : ''} added! Ready for next
                  </span>
                ) : (
                  'Search inventory or enter product details'
                )}
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

        {/* Form Body */}
        <form onSubmit={handleSaveAndClose} className="p-4 overflow-y-auto flex flex-col gap-3.5 flex-1">
          {/* 1. Item Name with Integrated Search Dropdown */}
          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-bold text-on-surface-variant flex items-center justify-between">
              <span>Item Name / Search Inventory <span className="text-error">*</span></span>
              {itemId && (
                <span className="text-[10px] text-secondary font-bold flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[13px]">check_circle</span>
                  Catalog Linked
                </span>
              )}
            </label>

            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                search
              </span>
              <input
                ref={nameInputRef}
                type="text"
                required
                value={name}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsDropdownOpen(true);
                  if (itemId) setItemId(''); // user edited name away from linked catalog item
                }}
                placeholder="Type item name or search inventory..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-surface-container-low text-xs sm:text-sm font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all"
              />
              {name && (
                <button
                  type="button"
                  onClick={() => {
                    setName('');
                    setItemId('');
                    setIsDropdownOpen(true);
                    nameInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                </button>
              )}
            </div>

            {/* Integrated Autocomplete / Suggestions Popover */}
            {isDropdownOpen && suggestions.length > 0 && (
              <div className="absolute top-[68px] left-0 right-0 z-30 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl max-h-48 overflow-y-auto divide-y divide-outline-variant/20 animate-fade-in">
                <div className="px-3 py-1.5 bg-surface-container-low text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center justify-between">
                  <span>Inventory Catalog Matches</span>
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(false)}
                    className="text-secondary hover:underline cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                {suggestions.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectCatalogItem(item)}
                    className="p-2.5 flex items-center justify-between gap-2 hover:bg-surface-container-low cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-on-surface truncate">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant truncate mt-0.5">
                        <span>Stock: {item.currentStock} {item.unit}</span>
                        {item.mrp && <span>• MRP ₹{item.mrp}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-tabular-data text-xs font-black text-secondary block">
                        {formatINR(item.salePrice)}
                      </span>
                      <span className="text-[10px] text-on-surface-variant block uppercase font-medium">
                        per {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Optional Description / Batch / IMEI */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-on-surface-variant flex items-center justify-between">
              <span>Description / Notes</span>
              <span className="text-[10px] text-outline lowercase font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Batch #102, IMEI, Size/Color, or custom notes..."
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
                  className="w-9 h-9 flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer font-bold text-base"
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
                  className="w-9 h-9 flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer font-bold text-base"
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

          {/* 4. Sale Price & MRP */}
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

          {/* 5. Discount: Both Percentage (%) and Amount (₹) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant flex items-center justify-between">
                <span>Discount (%)</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={discountPercent || ''}
                  onChange={(e) => handleDiscountPercentChange(e.target.value)}
                  placeholder="0"
                  className="w-full pl-3 pr-7 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline pointer-events-none">
                  %
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant flex items-center justify-between">
                <span>Discount (₹)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline pointer-events-none">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmountInput}
                  onFocus={() => setIsEditingDiscountAmount(true)}
                  onBlur={() => {
                    setIsEditingDiscountAmount(false);
                    if (calculation.discountAmount > 0) {
                      setDiscountAmountInput(calculation.discountAmount.toFixed(2));
                    } else {
                      setDiscountAmountInput('');
                    }
                  }}
                  onChange={(e) => handleDiscountAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                />
              </div>
            </div>
          </div>

          {/* 6. Item Total Card with Tax Details */}
          <div className="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="modal-item-total" className="text-xs font-bold text-on-surface block">
                  Item Total
                </label>
                {calculation.discountAmount > 0 && (
                  <span className="text-[11px] text-secondary font-semibold">
                    Saved {formatINR(calculation.discountAmount)}
                  </span>
                )}
              </div>

              <div className="relative flex items-center w-36 sm:w-44">
                <span className="absolute left-3 text-sm font-black text-secondary select-none pointer-events-none">
                  ₹
                </span>
                <input
                  id="modal-item-total"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalInput}
                  onFocus={() => setIsEditingTotal(true)}
                  onBlur={() => {
                    setIsEditingTotal(false);
                    if (calculation.totalAmount > 0) {
                      setTotalInput(calculation.totalAmount.toFixed(2));
                    }
                  }}
                  onChange={(e) => handleTotalChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-surface-container-lowest text-right font-tabular-data font-black text-base sm:text-lg text-secondary border border-outline-variant/30 outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/25 transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Tax Details */}
            <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-[11px] text-on-surface-variant">
              <div>
                <span>Taxable Value: </span>
                <span className="font-tabular-data font-bold text-on-surface">
                  {formatINR(calculation.taxableAmount)}
                </span>
              </div>
              <div className="text-right">
                <span>
                  {isIntraState
                    ? `GST ${gstRate}% (CGST+SGST): `
                    : `IGST ${gstRate}%: `}
                </span>
                <span className="font-tabular-data font-bold text-secondary">
                  +{formatINR(calculation.gstAmount)}
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

            <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-end">
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleSaveAndAddMore}
                  disabled={!name.trim() || quantity <= 0}
                  className={`flex-1 sm:flex-initial py-2.5 px-4 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    !name.trim() || quantity <= 0
                      ? 'bg-outline-variant/40 text-outline cursor-not-allowed'
                      : 'bg-surface-container-high hover:bg-surface-container-highest text-secondary border border-secondary/30'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">playlist_add</span>
                  <span>Save & Add More</span>
                  {justAddedCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-secondary text-on-secondary text-[10px] font-black">
                      {justAddedCount}
                    </span>
                  )}
                </button>
              )}

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
                <span>{isEditing ? 'Save Changes' : 'Add & Close'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
