import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, ItemPriceMode, UnitOfMeasurement, isItemDisabled } from '../../models/item.ts';
import { exclusiveFromInclusive, inclusiveFromExclusive, round2 } from '../../core/gst/pricing.ts';
import { roundQuantity, sanitizeQuantityInput, formatQuantity } from '../../core/utils/formatters.ts';
import { convertQuantityFromBase, convertQuantityToBase } from '../../core/inventory/stockEngine.ts';
import { db } from '../../services/db.ts';
import { useItems, useUnits } from '../../core/store/useDataStore.ts';
import { showAppToast } from '../../services/toast.ts';
import { HsnAutocompleteInput } from '../Common/HsnAutocompleteInput';
import type { HsnItem } from '../../core/gst/hsnCatalog';
import { CategorySelector } from './CategorySelector';
import { ItemCategory } from '../../models/category.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { normalizeEntityName, findDuplicateItem } from '../../core/utils/entityUniqueness.ts';

export interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem: InventoryItem | null;
  onSaveItem: (item: InventoryItem) => void;
  isGstActive?: boolean;
  existingItems?: InventoryItem[];
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  onClose,
  editingItem,
  onSaveItem,
  isGstActive = db.getCompany()?.isGstEnabled !== false,
  existingItems,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 20);

  const storeItems = useItems();

  const [itemType, setItemType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hsn, setHsn] = useState('');
  const [category, setCategory] = useState('General');
  const [unit, setUnit] = useState<UnitOfMeasurement>('PCS');
  const [salePrice, setSalePrice] = useState<number>(0);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [salePriceInclusive, setSalePriceInclusive] = useState<number>(0);
  const [purchasePriceInclusive, setPurchasePriceInclusive] = useState<number>(0);
  const [salePriceMode, setSalePriceMode] = useState<ItemPriceMode>('EXCLUSIVE');
  const [purchasePriceMode, setPurchasePriceMode] = useState<ItemPriceMode>('EXCLUSIVE');
  const [gstRate, setGstRate] = useState<number>(18);
  const [cessRate, setCessRate] = useState<number>(0);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);
  const [isDisabledState, setIsDisabledState] = useState(false);
  const [subUnit, setSubUnit] = useState<string>('');
  const [subUnitFactor, setSubUnitFactor] = useState<string>('');
  const [wholesalePrice, setWholesalePrice] = useState<string>('');
  const [semiWholesalePrice, setSemiWholesalePrice] = useState<string>('');
  const [defaultPriceTier, setDefaultPriceTier] = useState<'RETAIL' | 'SEMI_WHOLESALE' | 'WHOLESALE'>('RETAIL');

  const allRegisteredUnits = useUnits();
  const registeredUnits = useMemo(() => {
    const active = allRegisteredUnits.filter((u) => u.active);
    if (unit && !active.some((u) => u.code === unit)) {
      const match = allRegisteredUnits.find((u) => u.code === unit);
      if (match) return [match, ...active];
      return [{ code: unit, label: unit, kind: 'CUSTOM' as const, active: true }, ...active];
    }
    return active;
  }, [unit, allRegisteredUnits]);

  const nameChanged = !editingItem || normalizeEntityName(name) !== normalizeEntityName(editingItem.name);
  const isDuplicateName = useMemo(() => {
    if (!nameChanged) return false;
    const itemsList = existingItems ?? storeItems;
    return Boolean(findDuplicateItem(name, itemsList, editingItem?.id));
  }, [name, existingItems, storeItems, editingItem, nameChanged]);

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
      if (!isGstActive) {
        setSalePrice(editingItem.salePrice);
        setSalePriceInclusive(editingItem.salePrice);
        setSalePriceMode('EXCLUSIVE');
        setPurchasePrice(editingItem.purchasePrice);
        setPurchasePriceInclusive(editingItem.purchasePrice);
        setPurchasePriceMode('EXCLUSIVE');
      } else {
        const saleMode = editingItem.salePriceMode ?? 'EXCLUSIVE';
        setSalePriceMode(saleMode);
        if (saleMode === 'INCLUSIVE' && editingItem.salePriceInclusive !== undefined) {
          setSalePriceInclusive(editingItem.salePriceInclusive);
          setSalePrice(exclusiveFromInclusive(editingItem.salePriceInclusive, editingItem.gstRate));
        } else {
          setSalePrice(editingItem.salePrice);
          setSalePriceInclusive(inclusiveFromExclusive(editingItem.salePrice, editingItem.gstRate));
        }

        const purchaseMode = editingItem.purchasePriceMode ?? 'EXCLUSIVE';
        setPurchasePriceMode(purchaseMode);
        if (purchaseMode === 'INCLUSIVE' && editingItem.purchasePriceInclusive !== undefined) {
          setPurchasePriceInclusive(editingItem.purchasePriceInclusive);
          setPurchasePrice(exclusiveFromInclusive(editingItem.purchasePriceInclusive, editingItem.gstRate));
        } else {
          setPurchasePrice(editingItem.purchasePrice);
          setPurchasePriceInclusive(inclusiveFromExclusive(editingItem.purchasePrice, editingItem.gstRate));
        }
      }
      setGstRate(editingItem.gstRate);
      setCessRate(editingItem.cessRate || 0);
      setUnit(editingItem.unit);
      setCurrentStock(convertQuantityFromBase(editingItem.currentStock, editingItem.unit, editingItem));
      setMinStockAlert(convertQuantityFromBase(editingItem.minStockAlert, editingItem.unit, editingItem));
      setIsDisabledState(isItemDisabled(editingItem));
      setSubUnit(editingItem.subUnit || '');
      setSubUnitFactor(editingItem.subUnitFactor ? String(editingItem.subUnitFactor) : '');
      setWholesalePrice(
        editingItem.wholesalePrice !== undefined && editingItem.wholesalePrice !== null ? String(editingItem.wholesalePrice) : ''
      );
      setSemiWholesalePrice(
        editingItem.semiWholesalePrice !== undefined && editingItem.semiWholesalePrice !== null ? String(editingItem.semiWholesalePrice) : ''
      );
      setDefaultPriceTier(editingItem.defaultPriceTier || 'RETAIL');
    } else {
      setItemType('PRODUCT');
      setName('');
      setSku(`SKU-${Date.now().toString().slice(-4)}`);
      setBarcode('');
      setHsn(isGstActive ? '844332' : '');
      setCategory('General');
      setUnit('PCS');
      setSubUnit('');
      setSubUnitFactor('');
      setSalePrice(0);
      setSalePriceInclusive(0);
      setSalePriceMode('EXCLUSIVE');
      setPurchasePrice(0);
      setPurchasePriceInclusive(0);
      setPurchasePriceMode('EXCLUSIVE');
      setWholesalePrice('');
      setSemiWholesalePrice('');
      setDefaultPriceTier('RETAIL');
      setGstRate(18);
      setCessRate(0);
      setCurrentStock(0);
      setMinStockAlert(5);
      setIsDisabledState(false);
    }
  }, [editingItem, isOpen, isGstActive]);

  function applyGstRate(nextRate: number) {
    setGstRate(nextRate);
    setSalePrice((current) =>
      salePriceMode === 'INCLUSIVE'
        ? exclusiveFromInclusive(salePriceInclusive, nextRate)
        : current
    );
    setSalePriceInclusive((current) =>
      salePriceMode === 'INCLUSIVE'
        ? current
        : inclusiveFromExclusive(salePrice, nextRate)
    );
    setPurchasePrice((current) =>
      purchasePriceMode === 'INCLUSIVE'
        ? exclusiveFromInclusive(purchasePriceInclusive, nextRate)
        : current
    );
    setPurchasePriceInclusive((current) =>
      purchasePriceMode === 'INCLUSIVE'
        ? current
        : inclusiveFromExclusive(purchasePrice, nextRate)
    );
  }

  const handleSaleExclusiveChange = (raw: string) => {
    const value = Math.max(0, parseFloat(raw) || 0);
    setSalePrice(value);
    setSalePriceMode('EXCLUSIVE');
    setSalePriceInclusive(inclusiveFromExclusive(value, gstRate));
  };

  const handleSaleInclusiveChange = (raw: string) => {
    const value = Math.max(0, parseFloat(raw) || 0);
    setSalePriceInclusive(value);
    setSalePriceMode('INCLUSIVE');
    setSalePrice(exclusiveFromInclusive(value, gstRate));
  };

  const handlePurchaseExclusiveChange = (raw: string) => {
    const value = Math.max(0, parseFloat(raw) || 0);
    setPurchasePrice(value);
    setPurchasePriceMode('EXCLUSIVE');
    setPurchasePriceInclusive(inclusiveFromExclusive(value, gstRate));
  };

  const handlePurchaseInclusiveChange = (raw: string) => {
    const value = Math.max(0, parseFloat(raw) || 0);
    setPurchasePriceInclusive(value);
    setPurchasePriceMode('INCLUSIVE');
    setPurchasePrice(exclusiveFromInclusive(value, gstRate));
  };

  if (!isOpen) return null;

  const handleSaveItemForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isDuplicateName) return;

    if (subUnit.trim()) {
      const factorNum = parseFloat(subUnitFactor);
      if (isNaN(factorNum) || factorNum <= 0) {
        showAppToast('Sub-unit conversion factor must be greater than 0');
        return;
      }
    }

    if (wholesalePrice.trim() !== '') {
      const wp = parseFloat(wholesalePrice);
      if (isNaN(wp) || wp < 0) {
        showAppToast('Wholesale price cannot be negative');
        return;
      }
    }

    if (semiWholesalePrice.trim() !== '') {
      const swp = parseFloat(semiWholesalePrice);
      if (isNaN(swp) || swp < 0) {
        showAppToast('Semi-wholesale price cannot be negative');
        return;
      }
    }

    const isService = itemType === 'SERVICE';
    const resolvedUnit = isService ? 'HOURS' : unit;
    const resolvedSubUnit = subUnit.trim() ? subUnit.trim().toUpperCase() : undefined;
    const resolvedSubUnitFactor = subUnit.trim() && parseFloat(subUnitFactor) > 0 ? parseFloat(subUnitFactor) : undefined;
    const unitConfig = {
      unit: resolvedUnit,
      subUnit: resolvedSubUnit,
      subUnitFactor: resolvedSubUnitFactor,
    };
    const finalCurrentStock = isService ? 9999 : roundQuantity(convertQuantityToBase(Number(currentStock) || 0, resolvedUnit, unitConfig), 4);
    const finalMinStockAlert = isService ? 0 : roundQuantity(convertQuantityToBase(Number(minStockAlert) || 0, resolvedUnit, unitConfig), 4);

    const itemToSave: InventoryItem = {
      id: editingItem ? editingItem.id : 'ITM-' + Date.now(),
      name: name.trim(),
      sku: sku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      barcode: barcode.trim() || undefined,
      hsnSacCode: isGstActive ? (hsn.trim() || '844332') : (hsn.trim() || ''),
      category: category.trim() || 'General',
      unit: resolvedUnit,
      subUnit: resolvedSubUnit,
      subUnitFactor: resolvedSubUnitFactor,
      salePrice: Number(salePrice),
      salePriceInclusive: isGstActive ? round2(salePriceInclusive) : Number(salePrice),
      salePriceMode: isGstActive ? salePriceMode : 'EXCLUSIVE',
      purchasePrice: Number(purchasePrice),
      purchasePriceInclusive: isGstActive ? round2(purchasePriceInclusive) : Number(purchasePrice),
      purchasePriceMode: isGstActive ? purchasePriceMode : 'EXCLUSIVE',
      wholesalePrice: wholesalePrice.trim() !== '' && !isNaN(parseFloat(wholesalePrice)) && parseFloat(wholesalePrice) >= 0 ? parseFloat(wholesalePrice) : undefined,
      semiWholesalePrice: semiWholesalePrice.trim() !== '' && !isNaN(parseFloat(semiWholesalePrice)) && parseFloat(semiWholesalePrice) >= 0 ? parseFloat(semiWholesalePrice) : undefined,
      defaultPriceTier: defaultPriceTier || 'RETAIL',
      gstRate: Number(gstRate),
      cessRate: Number(cessRate) || 0,
      currentStock: finalCurrentStock,
      minStockAlert: finalMinStockAlert,
      isActive: !isDisabledState,
      isDisabled: isDisabledState,
      createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveItem(itemToSave);
    onClose();
  };

  const handleUnitChange = (nextUnit: UnitOfMeasurement) => {
    setUnit(nextUnit);
    if (editingItem) {
      const itemConfig = {
        unit: nextUnit,
        subUnit: subUnit.trim() ? subUnit.trim().toUpperCase() : undefined,
        subUnitFactor: subUnit.trim() && parseFloat(subUnitFactor) > 0 ? parseFloat(subUnitFactor) : undefined,
      };
      setCurrentStock(convertQuantityFromBase(editingItem.currentStock, nextUnit, itemConfig));
      setMinStockAlert(convertQuantityFromBase(editingItem.minStockAlert, nextUnit, itemConfig));
    }
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
            title="Close"
            aria-label="Close inventory item form"
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
                <CategorySelector
                  value={category}
                  onChange={(newCategory, catObj) => {
                    setCategory(newCategory);
                    if (catObj) {
                      // Apply default GST rate if item is new or still on default 18
                      if (catObj.defaultGstRate !== undefined && (!editingItem || gstRate === 18)) {
                        applyGstRate(catObj.defaultGstRate);
                      }
                      // Apply default HSN if currently blank or generic default
                      if (catObj.defaultHsn && (!hsn || hsn === '844332' || hsn === '0000')) {
                        setHsn(catObj.defaultHsn);
                      }
                    }
                  }}
                />
              </div>
              {isGstActive && (
                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                    HSN / SAC Code
                  </label>
                  <HsnAutocompleteInput
                    value={hsn}
                    onChange={(val) => setHsn(val)}
                    onSelectHsn={(item: HsnItem) => {
                      setHsn(item.code);
                      applyGstRate(item.gstRate);
                      if (item.category === 'Services') {
                        setItemType('SERVICE');
                        setUnit('HOURS');
                      }
                    }}
                    placeholder="e.g. 1006 or Rice"
                    isGstEnabled={isGstActive}
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

            {isGstActive ? (
              <div className="flex flex-col gap-3">
                {/* Sale Price Block */}
                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                    Sale Price (₹) <span className="text-error">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-on-surface-variant mb-0.5">
                        Excl. GST
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        aria-label="Sale Price (Excl. GST)"
                        value={salePrice || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleSaleExclusiveChange(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-sm font-bold focus:outline-none focus:border-secondary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-on-surface-variant mb-0.5">
                        Incl. GST
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label="Sale Price (Incl. GST)"
                        value={salePriceInclusive || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleSaleInclusiveChange(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-sm font-bold focus:outline-none focus:border-secondary"
                      />
                    </div>
                  </div>
                  <span className="block text-[10px] text-outline mt-0.5">
                    Last edited: {salePriceMode === 'INCLUSIVE' ? 'Incl. GST' : 'Excl. GST'}
                  </span>
                </div>

                {/* Purchase Price Block */}
                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                    Purchase Price (₹)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-on-surface-variant mb-0.5">
                        Excl. GST
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label="Purchase Price (Excl. GST)"
                        value={purchasePrice || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handlePurchaseExclusiveChange(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-secondary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-on-surface-variant mb-0.5">
                        Incl. GST
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label="Purchase Price (Incl. GST)"
                        value={purchasePriceInclusive || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handlePurchaseInclusiveChange(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-secondary"
                      />
                    </div>
                  </div>
                  <span className="block text-[10px] text-outline mt-0.5">
                    Last edited: {purchasePriceMode === 'INCLUSIVE' ? 'Incl. GST' : 'Excl. GST'}
                  </span>
                </div>

                <p className="text-[11px] text-outline italic">
                  Inclusive price covers GST only. CESS is added on top.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                    Sale Price (₹) <span className="text-error">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    aria-label="Sale Price (Excl. GST)"
                    value={salePrice || ''}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleSaleExclusiveChange(e.target.value)}
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
                    min="0"
                    aria-label="Purchase Price (Excl. GST)"
                    value={purchasePrice || ''}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handlePurchaseExclusiveChange(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>
            )}

            {isGstActive && (
              <div className="flex flex-col gap-2">
                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1.5">
                    GST Tax Rate Slab
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {[0, 0.1, 0.25, 3, 5, 12, 18].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => applyGstRate(rate)}
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
                      onChange={(e) => setCessRate(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0.00"
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono focus:border-secondary focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Multi-Tier Pricing (Retail / Semi-Wholesale / Wholesale) */}
            <div className="pt-2 border-t border-outline-variant/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold text-on-surface uppercase tracking-wider">
                  Tiered Sale Pricing (Optional)
                </span>
                <span className="text-[10px] text-outline font-semibold">Wholesale / Semi-Wholesale</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                    Semi-Wholesale Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 95.00"
                    aria-label="Semi-Wholesale Price"
                    value={semiWholesalePrice}
                    onChange={(e) => setSemiWholesalePrice(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-mono focus:outline-none focus:border-secondary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                    Wholesale Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 90.00"
                    aria-label="Wholesale Price"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-mono focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>
              {(semiWholesalePrice || wholesalePrice) && (
                <div className="flex items-center gap-2 mt-1">
                  <label className="text-[11px] font-semibold text-on-surface-variant whitespace-nowrap">
                    Default Price Tier:
                  </label>
                  <select
                    value={defaultPriceTier}
                    onChange={(e) => setDefaultPriceTier(e.target.value as any)}
                    className="h-8 px-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-secondary"
                  >
                    <option value="RETAIL">Retail</option>
                    {semiWholesalePrice && parseFloat(semiWholesalePrice) > 0 && (
                      <option value="SEMI_WHOLESALE">Semi-Wholesale</option>
                    )}
                    {wholesalePrice && parseFloat(wholesalePrice) > 0 && (
                      <option value="WHOLESALE">Wholesale</option>
                    )}
                  </select>
                </div>
              )}
            </div>
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
                    Current Stock ({unit})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={currentStock === 0 ? '0' : currentStock}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val === '-') {
                        setCurrentStock(val as unknown as number);
                      } else {
                        const sanitized = sanitizeQuantityInput(val, 4);
                        const parsed = parseFloat(sanitized);
                        setCurrentStock(isNaN(parsed) ? 0 : parsed);
                      }
                    }}
                    className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-bold focus:outline-none focus:border-secondary font-tabular-data"
                  />
                  {subUnit && parseFloat(subUnitFactor) > 0 && (
                    <span className="block text-[10px] text-on-surface-variant font-mono mt-0.5">
                      = {formatQuantity((Number(currentStock) || 0) * parseFloat(subUnitFactor), 4)} {subUnit}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                    Unit
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => handleUnitChange(e.target.value as UnitOfMeasurement)}
                    className="w-full h-10 px-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
                  >
                    {registeredUnits.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.code} ({u.label})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
                    Min Alert ({unit})
                  </label>
                  <input
                    type="number"
                    value={minStockAlert || ''}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setMinStockAlert(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
                  />
                  {subUnit && parseFloat(subUnitFactor) > 0 && (
                    <span className="block text-[10px] text-on-surface-variant font-mono mt-0.5">
                      = {formatQuantity((Number(minStockAlert) || 0) * parseFloat(subUnitFactor), 4)} {subUnit}
                    </span>
                  )}
                </div>
              </div>

              {/* Sub-Unit and Factor Conversion */}
              <div className="pt-2 border-t border-outline-variant/20 flex flex-col gap-2">
                <span className="font-label-sm text-xs font-semibold text-on-surface">
                  Sub-Unit &amp; Packaging Conversion (Optional)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                      Sub-Unit
                    </label>
                    <select
                      value={subUnit}
                      aria-label="Sub-Unit"
                      onChange={(e) => {
                        const val = e.target.value;
                        setSubUnit(val);
                        if (!val) {
                          setSubUnitFactor('');
                        }
                      }}
                      className="w-full h-10 px-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
                    >
                      <option value="">None (No Sub-Unit)</option>
                      {registeredUnits
                        .filter((u) => u.code !== unit)
                        .map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.code} ({u.label})
                          </option>
                        ))}
                    </select>
                  </div>

                  {subUnit && (
                    <div>
                      <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                        Conversion Factor (1 {unit} = ? {subUnit})
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-on-surface-variant font-mono whitespace-nowrap">1 {unit} =</span>
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          placeholder="e.g. 12 or 40"
                          aria-label="Sub-Unit Factor"
                          value={subUnitFactor}
                          onChange={(e) => setSubUnitFactor(e.target.value)}
                          className="flex-1 h-10 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-mono font-bold focus:outline-none focus:border-secondary"
                        />
                        <span className="text-xs text-on-surface-variant font-mono">{subUnit}</span>
                      </div>
                    </div>
                  )}
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
              disabled={!name.trim() || isDuplicateName}
              className={`px-5 py-2.5 rounded-full font-label-md text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 ${
                !name.trim() || isDuplicateName
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
