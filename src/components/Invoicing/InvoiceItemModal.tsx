import React, { useState, useMemo, useEffect, useRef } from 'react';
import { InventoryItem, UnitOfMeasurement } from '../../models/item.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { db } from '../../services/db.ts';
import { showAppToast } from '../../services/toast.ts';

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
  discountAmount?: number;
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
  isGstActive?: boolean;
  mode?: 'sale' | 'purchase';
  onItemCreated?: (newItem: InventoryItem) => void;
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
  isGstActive = true,
  mode = 'sale',
  onItemCreated,
}) => {
  const isPurchase = mode === 'purchase';
  const defaultHsn = isPurchase ? '844332' : '998313';
  const isEditing = Boolean(initialItem);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  const accentColorClass = isPurchase ? 'text-orange-600 dark:text-orange-400' : 'text-secondary';
  const accentBgLightClass = isPurchase ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-secondary/10 text-secondary';
  const focusInputClass = isPurchase ? 'outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20' : 'outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20';
  const simpleFocusClass = isPurchase ? 'outline-none focus:border-orange-500' : 'outline-none focus:border-secondary';

  // Form Fields
  const [itemId, setItemId] = useState(initialItem?.itemId || '');
  const [name, setName] = useState(initialItem?.name || '');
  const [description, setDescription] = useState(initialItem?.description || '');
  const [hsnSacCode, setHsnSacCode] = useState(initialItem?.hsnSacCode || defaultHsn);
  const [quantity, setQuantity] = useState<string>(
    initialItem?.quantity !== undefined && initialItem.quantity !== null ? String(initialItem.quantity) : ''
  );
  const [unit, setUnit] = useState<string>(initialItem?.unit || 'PCS');
  const [unitPrice, setUnitPrice] = useState<number>(initialItem?.unitPrice || 0);
  const [mrp, setMrp] = useState<number | undefined>(initialItem?.mrp);
  const [discountPercent, setDiscountPercent] = useState<number>(initialItem?.discountPercent || 0);
  const [discountPercentInput, setDiscountPercentInput] = useState<string>(
    initialItem?.discountPercent ? String(initialItem.discountPercent) : ''
  );
  const [discountAmountInput, setDiscountAmountInput] = useState<string>(
    initialItem?.discountAmount ? String(initialItem.discountAmount) : ''
  );
  const [lastDiscountEdited, setLastDiscountEdited] = useState<'percent' | 'amount'>(
    initialItem?.discountAmount ? 'amount' : 'percent'
  );
  const [gstRate, setGstRate] = useState<number>(initialItem?.gstRate ?? 18);

  // Integrated Search Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [justAddedCount, setJustAddedCount] = useState(0);

  // Quick Create New Item State
  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemSalePrice, setNewItemSalePrice] = useState('');
  const [newItemPurchasePrice, setNewItemPurchasePrice] = useState('');
  const [newItemUnit, setNewItemUnit] = useState<UnitOfMeasurement>('PCS');
  const [newItemHsn, setNewItemHsn] = useState(defaultHsn);
  const [newItemGstRate, setNewGstRate] = useState<number>(18);
  const [newItemStock, setNewItemStock] = useState('0');
  const [newItemCategory, setNewItemCategory] = useState('General');

  // Check if quick item creation name matches an existing catalog item case-insensitively
  const isDuplicateQuickItemName = useMemo(() => {
    const trimmed = newItemName.normalize('NFC').trim().toLowerCase();
    if (!trimmed) return false;
    return itemsCatalog.some((item) => {
      if (!item) return false;
      return (item.name || '').normalize('NFC').trim().toLowerCase() === trimmed;
    });
  }, [newItemName, itemsCatalog]);

  useEffect(() => {
    if (isDuplicateQuickItemName) {
      showAppToast('An item with this name already exists in inventory');
    }
  }, [isDuplicateQuickItemName]);

  // Editable Total State
  const [totalInput, setTotalInput] = useState<string>('');
  const [isEditingTotal, setIsEditingTotal] = useState(false);

  // Sync state whenever modal opens or initialItem changes
  useEffect(() => {
    if (isOpen) {
      if (initialItem) {
        setItemId(initialItem.itemId || '');
        setName(initialItem.name || '');
        setDescription(initialItem.description || '');
        setHsnSacCode(initialItem.hsnSacCode || defaultHsn);
        setQuantity(initialItem.quantity !== undefined && initialItem.quantity !== null ? String(initialItem.quantity) : '');
        setUnit(initialItem.unit || 'PCS');
        setUnitPrice(initialItem.unitPrice || 0);
        setMrp(initialItem.mrp);
        const initDiscPct = initialItem.discountPercent || 0;
        setDiscountPercent(initDiscPct);
        setDiscountPercentInput(initDiscPct > 0 ? String(initDiscPct) : '');
        if (initialItem.discountAmount && initialItem.discountAmount > 0) {
          setDiscountAmountInput(String(initialItem.discountAmount));
          setLastDiscountEdited('amount');
        } else if (initDiscPct > 0 && initialItem.quantity && initialItem.unitPrice) {
          const initGross = initialItem.quantity * initialItem.unitPrice;
          const initAmt = Number(((initGross * initDiscPct) / 100).toFixed(2));
          setDiscountAmountInput(initAmt > 0 ? initAmt.toFixed(2) : '');
          setLastDiscountEdited('percent');
        } else {
          setDiscountAmountInput('');
          setLastDiscountEdited('percent');
        }
        setGstRate(initialItem.gstRate ?? 18);
        setIsEditingTotal(false);
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
    setHsnSacCode(defaultHsn);
    setQuantity('');
    setUnit('PCS');
    setUnitPrice(0);
    setMrp(undefined);
    setDiscountPercent(0);
    setDiscountPercentInput('');
    setDiscountAmountInput('');
    setLastDiscountEdited('percent');
    setGstRate(18);
    setTotalInput('');
    setIsEditingTotal(false);
    setIsDropdownOpen(false);
  };

  // Typeahead catalog suggestions based on containing text typed
  const suggestions = useMemo(() => {
    const q = name.toLowerCase().trim();
    if (!q) {
      return itemsCatalog.slice(0, 6);
    }
    const words = q.split(/\s+/).filter(Boolean);
    return itemsCatalog
      .filter((it) => {
        const n = it.name.toLowerCase();
        const b = (it.barcode || '').toLowerCase();
        const s = (it.sku || '').toLowerCase();
        const c = (it.category || '').toLowerCase();
        const h = (it.hsnSacCode || '').toLowerCase();
        return words.every((w) => n.includes(w) || b.includes(w) || s.includes(w) || c.includes(w) || h.includes(w));
      })
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (aName === q && bName !== q) return -1;
        if (bName === q && aName !== q) return 1;
        if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
        if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
        return 0;
      })
      .slice(0, 8);
  }, [itemsCatalog, name]);

  // Handle catalog item selection
  const handleSelectCatalogItem = (item: InventoryItem) => {
    setItemId(item.id);
    setName(item.name);
    setHsnSacCode(item.hsnSacCode || defaultHsn);
    setUnit(item.unit || 'PCS');
    setUnitPrice(mode === 'purchase' ? (item.purchasePrice || item.salePrice || 0) : (item.salePrice || 0));
    setMrp(item.mrp || item.salePrice || 0);
    setGstRate(item.gstRate ?? 18);
    setIsDropdownOpen(false);
    setTimeout(() => {
      quantityInputRef.current?.focus();
    }, 50);
  };

  const handleOpenCreateItem = (prefillName?: string) => {
    const initialName = (prefillName !== undefined ? prefillName : name).trim();
    setNewItemName(initialName);
    setNewItemSalePrice(mode === 'sale' && unitPrice > 0 ? unitPrice.toString() : '');
    setNewItemPurchasePrice(mode === 'purchase' && unitPrice > 0 ? unitPrice.toString() : '');
    setNewItemUnit((unit as UnitOfMeasurement) || 'PCS');
    setNewItemHsn(hsnSacCode || defaultHsn);
    setNewGstRate(gstRate ?? 18);
    setNewItemStock('0');
    setNewItemCategory('General');
    setIsDropdownOpen(false);
    setIsCreateItemModalOpen(true);
  };

  const handleSaveQuickItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    if (isDuplicateQuickItemName) {
      showAppToast('An item with this name already exists in inventory');
      return;
    }

    const sale = parseFloat(newItemSalePrice) || 0;
    const purchase = parseFloat(newItemPurchasePrice) || (mode === 'purchase' ? sale : 0);

    const createdStock = mode === 'purchase' ? 0 : (parseFloat(newItemStock) || 0);

    const createdItem: InventoryItem = {
      id: 'ITM-' + Date.now(),
      name: newItemName.trim(),
      salePrice: sale,
      purchasePrice: purchase,
      unit: newItemUnit,
      hsnSacCode: newItemHsn.trim() || defaultHsn,
      gstRate: isGstActive ? (Number(newItemGstRate) || 0) : 0,
      currentStock: createdStock,
      minStockAlert: 5,
      category: newItemCategory.trim() || 'General',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveItem(createdItem);
    onItemCreated?.(createdItem);
    handleSelectCatalogItem(createdItem);
    setIsCreateItemModalOpen(false);
  };

  // Clean decimal quantity parser (0 when empty string or invalid)
  const parsedQuantity = useMemo(() => {
    const val = parseFloat(quantity);
    return !isNaN(val) && val > 0 ? val : 0;
  }, [quantity]);

  // When saving or calculating defaults: if empty string, assume 1
  const effectiveQuantity = useMemo(() => {
    if (!quantity.trim()) return 1;
    const val = parseFloat(quantity);
    return !isNaN(val) && val > 0 ? val : 1;
  }, [quantity]);

  const handleQuantityChange = (valStr: string) => {
    const sanitized = valStr.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const cleanVal = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
    setQuantity(cleanVal);
  };

  // Live item total calculation with exact decimal discount handling
  const calculation = useMemo(() => {
    const qty = effectiveQuantity;
    const rate = Math.max(0, Number(unitPrice) || 0);
    const gross = Number((qty * rate).toFixed(2));

    let discountAmount = 0;
    let discPct = 0;

    if (lastDiscountEdited === 'amount') {
      const enteredAmt = parseFloat(discountAmountInput) || 0;
      discountAmount = Math.min(gross, Math.max(0, enteredAmt));
      if (gross > 0 && discountAmount > 0) {
        discPct = parseFloat(((discountAmount / gross) * 100).toFixed(2));
      }
    } else {
      discPct = Math.min(100, Math.max(0, parseFloat(discountPercentInput) || 0));
      discountAmount = Number(((gross * discPct) / 100).toFixed(2));
    }

    const taxableAmount = Math.max(0, Number((gross - discountAmount).toFixed(2)));

    const taxPct = isGstActive ? Math.max(0, Number(gstRate) || 0) : 0;
    const gstAmount = Number(((taxableAmount * taxPct) / 100).toFixed(2));

    const cgstAmount = isIntraState ? Number((gstAmount / 2).toFixed(2)) : 0;
    const sgstAmount = isIntraState ? Number((gstAmount / 2).toFixed(2)) : 0;
    const igstAmount = isIntraState ? 0 : gstAmount;

    let totalAmount = Number((taxableAmount + gstAmount).toFixed(2));

    // If user explicitly typed a total that matches within a small rounding difference (<= 0.02),
    // honor the user's exact entered total so it never falls back or gets rejected
    const parsedTotal = parseFloat(totalInput);
    if (!isNaN(parsedTotal) && parsedTotal > 0 && Math.abs(totalAmount - parsedTotal) <= 0.02) {
      totalAmount = parsedTotal;
    }

    return {
      gross,
      discountAmount,
      taxableAmount,
      gstAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalAmount,
      discountPercent: discPct,
    };
  }, [effectiveQuantity, unitPrice, discountPercentInput, discountAmountInput, lastDiscountEdited, gstRate, isIntraState, isGstActive, totalInput]);

  // Keep totalInput synchronized with calculated total unless user is actively editing it
  useEffect(() => {
    if (!isEditingTotal) {
      const parsed = parseFloat(totalInput);
      if (!isNaN(parsed) && Math.abs(calculation.totalAmount - parsed) <= 0.02) {
        return;
      }
      if (calculation.totalAmount > 0) {
        setTotalInput(calculation.totalAmount.toFixed(2));
      } else {
        setTotalInput('');
      }
    }
  }, [calculation.totalAmount, isEditingTotal]);

  // Sync discount percent and discount amount whenever quantity or unitPrice changes
  useEffect(() => {
    const gross = effectiveQuantity * Math.max(0, Number(unitPrice) || 0);
    if (lastDiscountEdited === 'amount') {
      const amt = parseFloat(discountAmountInput);
      if (!isNaN(amt) && amt > 0 && gross > 0) {
        const rawPct = Math.min(100, (amt / gross) * 100);
        const formattedPct = parseFloat(rawPct.toFixed(2));
        setDiscountPercent(formattedPct);
        setDiscountPercentInput(String(formattedPct));
      } else if (!discountAmountInput.trim()) {
        setDiscountPercent(0);
        setDiscountPercentInput('');
      }
    } else {
      const pct = parseFloat(discountPercentInput);
      if (!isNaN(pct) && pct > 0 && gross > 0) {
        const amt = Number(((gross * pct) / 100).toFixed(2));
        setDiscountAmountInput(amt > 0 ? amt.toFixed(2) : '');
      } else if (!discountPercentInput.trim()) {
        setDiscountAmountInput('');
      }
    }
  }, [effectiveQuantity, unitPrice, lastDiscountEdited]);

  const handleDiscountPercentChange = (valStr: string) => {
    const sanitized = valStr.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const cleanVal = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;

    setDiscountPercentInput(cleanVal);
    setLastDiscountEdited('percent');

    if (!cleanVal.trim()) {
      setDiscountPercent(0);
      setDiscountAmountInput('');
      return;
    }

    const num = Math.min(100, Math.max(0, parseFloat(cleanVal) || 0));
    setDiscountPercent(num);

    const gross = parsedQuantity * Math.max(0, Number(unitPrice) || 0);
    if (gross > 0 && num > 0) {
      const amt = Number(((gross * num) / 100).toFixed(2));
      setDiscountAmountInput(amt > 0 ? amt.toFixed(2) : '');
    } else {
      setDiscountAmountInput('');
    }
  };

  const handleDiscountAmountChange = (valStr: string) => {
    const sanitized = valStr.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const cleanVal = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;

    setDiscountAmountInput(cleanVal);
    setLastDiscountEdited('amount');

    if (!cleanVal.trim()) {
      setDiscountPercent(0);
      setDiscountPercentInput('');
      return;
    }

    const amt = Math.max(0, parseFloat(cleanVal) || 0);
    const gross = parsedQuantity * Math.max(0, Number(unitPrice) || 0);

    if (gross > 0 && amt > 0) {
      // Better handling of decimal discount percent if discount amount is given
      const rawPct = Math.min(100, (amt / gross) * 100);
      const formattedPct = parseFloat(rawPct.toFixed(2));
      setDiscountPercent(formattedPct);
      setDiscountPercentInput(String(formattedPct));
    } else {
      setDiscountPercent(0);
      setDiscountPercentInput('');
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

    const qty = parsedQuantity > 0 ? parsedQuantity : 1;
    const discPct = Math.min(100, Math.max(0, Number(calculation.discountPercent) || 0));
    const discMultiplier = 1 - discPct / 100;
    const taxPct = isGstActive ? Math.max(0, Number(gstRate) || 0) : 0;
    const taxMultiplier = 1 + taxPct / 100;

    const divisor = qty * (discMultiplier > 0 ? discMultiplier : 1) * taxMultiplier;
    if (divisor > 0) {
      // Precision up to 4 decimal places (fractional paisa) to accurately preserve wholesale and GST rates (e.g. 21.165)
      const rawPrice = newTotal / divisor;
      const calculatedPrice = Math.round(rawPrice * 10000) / 10000;
      setUnitPrice(calculatedPrice);
    }
  };

  if (!isOpen) return null;

  const buildItemData = (): InvoiceItemData => {
    let resolvedItemId = itemId;
    if (!resolvedItemId && name.trim()) {
      const q = name.trim().toLowerCase();
      const matched =
        itemsCatalog.find((it) => it.name.trim().toLowerCase() === q) ||
        itemsCatalog.find((it) => it.name.toLowerCase().includes(q));
      if (matched) {
        resolvedItemId = matched.id;
      }
    }

    const qty = parsedQuantity > 0 ? parsedQuantity : 1;
    const discAmt = calculation.discountAmount > 0 ? calculation.discountAmount : undefined;

    return {
      itemId: resolvedItemId || `CUSTOM-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      hsnSacCode: isGstActive ? (hsnSacCode.trim() || defaultHsn) : '',
      quantity: qty,
      unit,
      unitPrice: Number(unitPrice) || 0,
      mrp: mrp ? Number(mrp) : undefined,
      discountPercent: calculation.discountPercent,
      discountAmount: discAmt,
      gstRate: isGstActive ? (Number(gstRate) || 0) : 0,
    };
  };

  // Save and keep modal open for next product
  const handleSaveAndAddMore = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

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
    if (!name.trim()) return;

    onSaveItem(buildItemData());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
      <div className="bg-surface-container-lowest w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[92vh] animate-slide-up sm:animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl ${accentBgLightClass} flex items-center justify-center`}>
              <span className="material-symbols-outlined text-[20px]">
                {isEditing ? 'edit_note' : (isPurchase ? 'inventory_2' : 'add_shopping_cart')}
              </span>
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-on-surface">
                {isEditing
                  ? (isPurchase ? 'Edit Purchased Item' : 'Edit Item')
                  : (isPurchase ? 'Add Item to Purchase Bill' : 'Add Item to Bill')}
              </h2>
              <span className="text-[11px] text-on-surface-variant">
                {justAddedCount > 0 ? (
                  <span className={`${accentColorClass} font-bold`}>
                    ✓ {justAddedCount} item{justAddedCount > 1 ? 's' : ''} added! Ready for next
                  </span>
                ) : (
                  isPurchase
                    ? 'Search inventory or enter vendor product details'
                    : 'Search inventory or enter product details'
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
                <span>Item Name / Search Inventory</span>
                <span className="text-error">*</span>
              </label>

              {itemId && (
                <span className={`text-[10px] ${accentColorClass} font-bold flex items-center gap-0.5`}>
                  <span className="material-symbols-outlined text-[13px]">check_circle</span>
                  Catalog Linked
                </span>
              )}
            </div>

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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isDropdownOpen && suggestions.length > 0 && !itemId) {
                    e.preventDefault();
                    handleSelectCatalogItem(suggestions[0]);
                  }
                }}
                className={`w-full pl-9 pr-8 py-2.5 rounded-xl bg-surface-container-low text-xs sm:text-sm font-bold text-on-surface border border-outline-variant/30 ${focusInputClass} transition-all`}
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
            {isDropdownOpen && (
              <div className="absolute top-[68px] left-0 right-0 z-30 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl max-h-56 overflow-y-auto divide-y divide-outline-variant/20 animate-fade-in">
                {/* Popover Header */}
                <div className="px-3 py-1.5 bg-surface-container-low text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center justify-between">
                  <span>Inventory Catalog {suggestions.length > 0 ? `(${suggestions.length})` : ''}</span>
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(false)}
                    className="text-on-surface-variant hover:text-on-surface cursor-pointer p-0.5"
                    title="Close suggestions"
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                </div>

                {suggestions.length > 0 ? (
                  <>
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
                            {item.hsnSacCode && <span>• HSN {item.hsnSacCode}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`font-tabular-data text-xs font-black ${accentColorClass} block`}>
                            {formatINR(isPurchase ? (item.purchasePrice || item.salePrice || 0) : item.salePrice)}
                          </span>
                          <span className="text-[10px] text-on-surface-variant block uppercase font-medium">
                            {isPurchase ? `Cost / ${item.unit}` : `per ${item.unit}`}
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Add New Item action in search dropdown (only shown if not an exact match with an existing item) */}
                    {!itemsCatalog.some((it) => (it.name || '').normalize('NFC').trim().toLowerCase() === name.normalize('NFC').trim().toLowerCase()) && (
                      <div
                        onClick={() => handleOpenCreateItem(name)}
                        className="p-2.5 bg-surface-container-low/70 hover:bg-surface-container-low flex items-center gap-2 cursor-pointer transition-colors text-xs font-bold border-t border-outline-variant/20"
                      >
                        <div className={`w-6 h-6 rounded-lg ${accentBgLightClass} flex items-center justify-center flex-shrink-0`}>
                          <span className="material-symbols-outlined text-[16px]">add</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className={`${accentColorClass} truncate`}>
                            + Add New Item
                          </span>
                          {name.trim() && (
                            <span className="text-[10px] text-on-surface-variant font-normal truncate">
                              Create &quot;{name.trim()}&quot; in inventory
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Empty state when no catalog item matches */
                  <div className="p-3.5 text-center flex flex-col items-center gap-2.5">
                    <span className="text-xs text-on-surface-variant">
                      No matching items found {name.trim() ? <>for &quot;<strong className="text-on-surface">{name}</strong>&quot;</> : ''}
                    </span>
                    {!itemsCatalog.some((it) => (it.name || '').normalize('NFC').trim().toLowerCase() === name.normalize('NFC').trim().toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => handleOpenCreateItem(name)}
                        className={`py-2 px-3.5 rounded-xl ${accentBgLightClass} ${accentColorClass} font-bold text-xs flex items-center gap-1.5 cursor-pointer hover:opacity-90 active:scale-95 transition-all shadow-xs`}
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        <span>+ Add New Item</span>
                      </button>
                    )}
                  </div>
                )}
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
              className={`w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface border border-outline-variant/30 ${simpleFocusClass} transition-all`}
            />
          </div>

          {/* 3. Quantity & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant">
                Quantity <span className="text-[10px] text-outline font-normal">(defaults to 1)</span>
              </label>
              <input
                ref={quantityInputRef}
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="1"
                className={`w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-bold text-on-surface border border-outline-variant/30 ${simpleFocusClass} transition-all font-tabular-data h-[38px]`}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={`w-full px-2.5 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 ${simpleFocusClass} transition-all h-[38px]`}
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Price & MRP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-on-surface-variant">
                {mode === 'purchase' ? 'Purchase Rate (₹)' : 'Sale Price (₹)'} <span className="text-error">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={unitPrice || ''}
                  onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value)))}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-black text-on-surface border border-outline-variant/30 ${simpleFocusClass} transition-all`}
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
                  step="any"
                  value={mrp !== undefined ? mrp : ''}
                  onChange={(e) => setMrp(e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 ${simpleFocusClass} transition-all`}
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
                  type="text"
                  inputMode="decimal"
                  value={discountPercentInput}
                  onChange={(e) => handleDiscountPercentChange(e.target.value)}
                  placeholder="0"
                  className={`w-full pl-3 pr-7 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 ${simpleFocusClass} transition-all`}
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
                  type="text"
                  inputMode="decimal"
                  value={discountAmountInput}
                  onChange={(e) => handleDiscountAmountChange(e.target.value)}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2 rounded-xl bg-surface-container-low text-xs sm:text-sm font-semibold text-on-surface border border-outline-variant/30 ${simpleFocusClass} transition-all`}
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
                  <span className={`text-[11px] ${accentColorClass} font-semibold`}>
                    Saved {formatINR(calculation.discountAmount)}
                  </span>
                )}
              </div>

              <div className="relative flex items-center w-36 sm:w-44">
                <span className={`absolute left-3 text-sm font-black ${accentColorClass} select-none pointer-events-none`}>
                  ₹
                </span>
                <input
                  id="modal-item-total"
                  type="number"
                  min="0"
                  step="any"
                  value={totalInput}
                  onFocus={() => setIsEditingTotal(true)}
                  onBlur={() => {
                    setIsEditingTotal(false);
                    const entered = parseFloat(totalInput);
                    if (!isNaN(entered) && Math.abs(calculation.totalAmount - entered) <= 0.02) {
                      setTotalInput(entered.toFixed(2));
                    } else if (calculation.totalAmount > 0) {
                      setTotalInput(calculation.totalAmount.toFixed(2));
                    }
                  }}
                  onChange={(e) => handleTotalChange(e.target.value)}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-1.5 rounded-xl bg-surface-container-lowest text-right font-tabular-data font-black text-base sm:text-lg ${accentColorClass} border border-outline-variant/30 ${isPurchase ? 'outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25' : 'outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/25'} transition-all shadow-inner`}
                />
              </div>
            </div>

            {/* Tax Details - only shown when GST is enabled */}
            {isGstActive && (
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
                  <span className={`font-tabular-data font-bold ${accentColorClass}`}>
                    +{formatINR(calculation.gstAmount)}
                  </span>
                </div>
              </div>
            )}
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
                className="py-2.5 px-3.5 rounded-xl text-error font-bold text-xs bg-error-container/20 hover:bg-error-container/40 border border-error/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Delete Item</span>
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-end">
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleSaveAndAddMore}
                  disabled={!name.trim()}
                  className={`flex-1 sm:flex-initial py-2.5 px-4 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    !name.trim()
                      ? 'bg-outline-variant/40 text-outline cursor-not-allowed'
                      : (isPurchase
                          ? 'bg-surface-container-high hover:bg-surface-container-highest text-orange-600 dark:text-orange-400 border border-orange-500/30'
                          : 'bg-surface-container-high hover:bg-surface-container-highest text-secondary border border-secondary/30')
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">playlist_add</span>
                  <span>Save & Add More</span>
                  {justAddedCount > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full ${isPurchase ? 'bg-orange-600 text-white' : 'bg-secondary text-on-secondary'} text-[10px] font-black`}>
                      {justAddedCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={!name.trim()}
                className={`flex-1 sm:flex-initial py-2.5 px-5 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  !name.trim()
                    ? 'bg-outline-variant text-outline cursor-not-allowed'
                    : (isPurchase
                        ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/20'
                        : 'bg-secondary text-on-secondary hover:bg-secondary/90 shadow-secondary/20')
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

      {/* Quick Add New Item to Inventory Modal */}
      {isCreateItemModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 animate-fade-in">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-xl ${accentBgLightClass} flex items-center justify-center`}>
                  <span className="material-symbols-outlined text-[18px]">add_box</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-on-surface">Add New Item to Inventory</h3>
                  <span className="text-[10px] text-on-surface-variant">
                    Saves to catalog & selects for current bill
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateItemModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Quick Item Form */}
            <form onSubmit={handleSaveQuickItem} className="p-4 flex flex-col gap-3 overflow-y-auto text-xs">
              {/* Item Name */}
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                  Item Name <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Wireless Mouse, Cotton Shirt..."
                  className={`w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs font-bold text-on-surface border ${
                    isDuplicateQuickItemName
                      ? 'border-amber-500 focus:border-amber-600'
                      : 'border-outline-variant/30'
                  } ${focusInputClass}`}
                />
                {isDuplicateQuickItemName && (
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

              {/* Prices: Sale Price & Purchase Price */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                    Sale Price (₹) <span className="text-error">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newItemSalePrice}
                    onChange={(e) => setNewItemSalePrice(e.target.value)}
                    placeholder="0.00"
                    className={`w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs font-bold text-on-surface border border-outline-variant/30 ${focusInputClass}`}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                    Purchase Cost (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItemPurchasePrice}
                    onChange={(e) => setNewItemPurchasePrice(e.target.value)}
                    placeholder="0.00"
                    className={`w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs font-bold text-on-surface border border-outline-variant/30 ${focusInputClass}`}
                  />
                </div>
              </div>

              {/* Unit & GST Rate */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                    Unit of Measurement
                  </label>
                  <select
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value as UnitOfMeasurement)}
                    className="w-full px-2.5 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface border border-outline-variant/30 outline-none"
                  >
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                    GST Rate
                  </label>
                  <select
                    value={newItemGstRate}
                    onChange={(e) => setNewGstRate(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface border border-outline-variant/30 outline-none"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={0.1}>0.1%</option>
                    <option value={0.25}>0.25%</option>
                    <option value={3}>3% (Gold/Precious)</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18% (Standard)</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              </div>

              {/* HSN & Opening Stock */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                    HSN / SAC Code
                  </label>
                  <input
                    type="text"
                    value={newItemHsn}
                    onChange={(e) => setNewItemHsn(e.target.value)}
                    placeholder="e.g. 8471"
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs font-mono text-on-surface border border-outline-variant/30 outline-none"
                  />
                </div>

                {isPurchase ? (
                  <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-300 flex flex-col justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider block">Opening Stock: 0</span>
                    <span className="text-[10px] text-on-surface-variant leading-tight mt-0.5">
                      Stock will be added automatically from this purchase bill.
                    </span>
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                      Opening Stock (Qty)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newItemStock}
                      onChange={(e) => setNewItemStock(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface border border-outline-variant/30 outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  placeholder="General"
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface border border-outline-variant/30 outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20 mt-1">
                <button
                  type="button"
                  onClick={() => setIsCreateItemModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-on-surface-variant font-bold text-xs hover:bg-surface-container cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDuplicateQuickItemName || !newItemName.trim()}
                  className={`px-4 py-2 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-1 ${
                    isDuplicateQuickItemName || !newItemName.trim()
                      ? 'bg-outline-variant/60 text-outline cursor-not-allowed opacity-50'
                      : isPurchase
                      ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer active:scale-95'
                      : 'bg-secondary hover:bg-secondary/90 text-on-secondary cursor-pointer active:scale-95'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  <span>Save & Use in Bill</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
