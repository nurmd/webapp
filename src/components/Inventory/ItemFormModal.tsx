import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, UnitOfMeasurement, isItemDisabled } from '../../models/item.ts';
import { db } from '../../services/db.ts';
import { showAppToast } from '../../services/toast.ts';

export interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem: InventoryItem | null;
  onSaveItem: (item: InventoryItem) => void;
  isGstActive: boolean;
  existingItems?: InventoryItem[];
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  onClose,
  editingItem,
  onSaveItem,
  isGstActive,
  existingItems,
}) => {
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
  const [cessRate, setCessRate] = useState<number>(0);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);
  const [isDisabledState, setIsDisabledState] = useState(false);

  const isDuplicateName = useMemo(() => {
    const trimmed = name.normalize('NFC').trim().toLowerCase();
    if (!trimmed) return false;
    const itemsList = existingItems ?? db.getItems();
    return itemsList.some((item) => {
      if (!item) return false;
      // Exclude the item currently being edited strictly by id
      if (editingItem && String(item.id) === String(editingItem.id)) {
        return false;
      }
      return (item.name || '').normalize('NFC').trim().toLowerCase() === trimmed;
    });
  }, [name, existingItems, editingItem]);

  useEffect(() => {
    if (isDuplicateName) {
      showAppToast('An item with this name already exists in inventory');
    }
  }, [isDuplicateName]);

  useEffect(() => {
    if (editingItem) {
      setItemType(editingItem.unit === 'HOURS' || editingItem.unit === 'DAYS' ? 'SERVICE' : 'PRODUCT');
      setName(editingItem.name);
      setSku(editingItem.sku || '');
      setBarcode(editingItem.barcode || '');
      setHsn(editingItem.hsnSacCode);
      setCategory(editingItem.category);
      setUnit(editingItem.unit);
      setSalePrice(editingItem.salePrice);
      setPurchasePrice(editingItem.purchasePrice);
      setGstRate(editingItem.gstRate);
      setCessRate(editingItem.cessRate || 0);
      setCurrentStock(editingItem.currentStock);
      setMinStockAlert(editingItem.minStockAlert);
      setIsDisabledState(isItemDisabled(editingItem));
    } else {
      setItemType('PRODUCT');
      setName('');
      setSku(`SKU-${Date.now().toString().slice(-4)}`);
      setBarcode('');
      setHsn(isGstActive ? '844332' : '0000');
      setCategory('General');
      setUnit('PCS');
      setSalePrice(0);
      setPurchasePrice(0);
      setGstRate(18);
      setCessRate(0);
      setCurrentStock(0);
      setMinStockAlert(5);
      setIsDisabledState(false);
    }
  }, [editingItem, isOpen, isGstActive]);

  if (!isOpen) return null;

  const handleSaveItemForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isDuplicateName) {
      showAppToast('An item with this name already exists in inventory');
      return;
    }

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
      cessRate: Number(cessRate) || 0,
      currentStock: itemType === 'SERVICE' ? 9999 : Number(currentStock),
      minStockAlert: itemType === 'SERVICE' ? 0 : Number(minStockAlert),
      isActive: !isDisabledState,
      isDisabled: isDisabledState,
      createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveItem(itemToSave);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-surface-container-lowest rounded-2xl p-5 w-full max-w-lg shadow-xl border border-outline-variant/30 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
            <h3 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface">
              {editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
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
                className={`w-full h-11 px-3 rounded-lg bg-surface-container-lowest border ${
                  isDuplicateName
                    ? 'border-amber-500 focus:border-amber-600'
                    : 'border-outline-variant/30 focus:border-secondary'
                } text-on-surface font-body-md text-sm placeholder:text-outline focus:outline-none`}
              />
              {isDuplicateName && (
                <div
                  role="alert"
                  className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-medium animate-fade-in"
                >
                  <span className="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400 shrink-0">
                    warning
                  </span>
                  <span>An item with this name already exists in inventory</span>
                </div>
              )}
            </div>

            <div className={isGstActive ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
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
              {isGstActive && (
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
              )}
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
              {isGstActive ? 'Pricing & Tax Slabs' : 'Pricing'}
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
                  onFocus={(e) => e.target.select()}
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
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-secondary"
                />
              </div>
            </div>

            {isGstActive && (
              <div className="flex flex-col gap-2">
                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1.5">
                    GST Tax Rate Slab
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {[0, 0.1, 0.25, 3, 5, 12, 18, 28].map((rate) => (
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

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                      CESS Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cessRate || ''}
                      onChange={(e) => setCessRate(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono focus:border-secondary focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Stock & Inventory Tracking */}
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
                    onFocus={(e) => e.target.select()}
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
                    {['PCS', 'NOS', 'KGS', 'GMS', 'LTR', 'ML', 'BOX', 'BAG', 'MTR', 'PKT', 'SET'].map(
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
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setMinStockAlert(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Item Status (Active vs Disabled) */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low/50 border border-outline-variant/20">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-on-surface">Item Status</span>
              <span className="text-[11px] text-outline">
                {isDisabledState
                  ? 'Disabled (hidden from billing & item pickers)'
                  : 'Active (available for sales & purchases)'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsDisabledState(!isDisabledState)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                isDisabledState
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  : 'bg-secondary/15 text-secondary border border-secondary/30'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isDisabledState ? 'block' : 'check_circle'}
              </span>
              <span>{isDisabledState ? 'Disabled' : 'Active'}</span>
            </button>
          </div>

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDuplicateName || !name.trim()}
              className={`px-5 py-2.5 rounded-full font-label-md text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 ${
                isDuplicateName || !name.trim()
                  ? 'bg-outline-variant/60 text-outline cursor-not-allowed opacity-50'
                  : 'bg-secondary text-on-secondary active:scale-95 transition-transform cursor-pointer'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              <span>{editingItem ? 'Update Item' : 'Save Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
