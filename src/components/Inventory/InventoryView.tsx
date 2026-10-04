import React, { useState, useMemo } from 'react';
import { InventoryItem, StockAdjustment, UnitOfMeasurement, isItemDisabled, isItemActive } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { db } from '../../services/db.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { isItemInBills } from '../../core/utils/itemStatus.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export type ItemTransactionType = 'SALE' | 'PURCHASE' | 'STOCK_IN' | 'STOCK_OUT' | 'WASTAGE' | 'CORRECTION';

export interface ItemTransactionRecord {
  id: string;
  type: ItemTransactionType;
  date: string;
  referenceNo: string;
  partyName?: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalAmount?: number;
  notes?: string;
  isInward: boolean;
}

interface InventoryViewProps {
  items: InventoryItem[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  adjustments?: StockAdjustment[];
  onSaveItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
  onSaveAdjustment: (adj: StockAdjustment) => void;
  onScanBarcodeClick?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  invoices,
  purchases,
  adjustments,
  onSaveItem,
  onDeleteItem,
  onSaveAdjustment,
  onScanBarcodeClick,
}) => {
  // Filter & Sort State (Name, Available Stock, Category, Created Date, Disabled Items)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStockStatus, setFilterStockStatus] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [filterCreatedTimeframe, setFilterCreatedTimeframe] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  const [sortOption, setSortOption] = useState<'DEFAULT' | 'NAME_ASC' | 'NAME_DESC' | 'STOCK_HIGH' | 'STOCK_LOW' | 'CREATED_DESC' | 'CREATED_ASC'>('DEFAULT');
  const [showDisabled, setShowDisabled] = useState(false);

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [activeItemDetail, setActiveItemDetail] = useState<InventoryItem | null>(null);
  const [adjustmentItem, setAdjustmentItem] = useState<InventoryItem | null>(null);
  const [adjType, setAdjType] = useState<'STOCK_IN' | 'STOCK_OUT'>('STOCK_IN');
  const [adjQty, setAdjQty] = useState<number>(1);
  const [adjReason, setAdjReason] = useState('New inventory arrival');

  // Back Navigation for modals
  useBackNavigation(() => {
    if (isModalOpen) { setIsModalOpen(false); return true; }
    if (isFilterModalOpen) { setIsFilterModalOpen(false); return true; }
    if (adjustmentItem !== null) { setAdjustmentItem(null); return true; }
    if (activeItemDetail !== null) { setActiveItemDetail(null); return true; }
    return false;
  }, isModalOpen || isFilterModalOpen || activeItemDetail !== null || adjustmentItem !== null, 20);

  // Privacy toggles: Buy price visibility per item
  const [revealedBuyPrices, setRevealedBuyPrices] = useState<Record<string, boolean>>({});

  const toggleBuyPrice = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setRevealedBuyPrices((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const disabledItemsCount = useMemo(() => items.filter(isItemDisabled).length, [items]);

  const activeFilterCount =
    (filterCategory !== 'ALL' ? 1 : 0) +
    (filterStockStatus !== 'ALL' ? 1 : 0) +
    (filterCreatedTimeframe !== 'ALL' ? 1 : 0) +
    (sortOption !== 'DEFAULT' ? 1 : 0) +
    (showDisabled ? 1 : 0);

  const resetAllFilters = () => {
    setFilterCategory('ALL');
    setFilterStockStatus('ALL');
    setFilterCreatedTimeframe('ALL');
    setSortOption('DEFAULT');
    setShowDisabled(false);
    setSearch('');
  };

  // Recent transactions filter inside Item Detail Modal
  const [txnFilter, setTxnFilter] = useState<'ALL' | 'SALES' | 'PURCHASES' | 'ADJUSTMENTS'>('ALL');

  // Transactions aggregation (Sales, Purchases, Stock Adjustments)
  const allInvoices = invoices || db.getInvoices();
  const allPurchases = purchases || db.getPurchases();
  const allAdjustments = adjustments || db.getStockAdjustments();

  // Aggregate all transactions for activeItemDetail
  const itemTransactions = useMemo(() => {
    if (!activeItemDetail) return [];
    const list: ItemTransactionRecord[] = [];

    // 1. Sales from Invoices
    for (const inv of allInvoices) {
      if (!inv.items) continue;
      for (const it of inv.items) {
        if (
          it.itemId === activeItemDetail.id ||
          (it.name && it.name.trim().toLowerCase() === activeItemDetail.name.trim().toLowerCase())
        ) {
          list.push({
            id: `inv-${inv.id}-${it.itemId || it.name}`,
            type: 'SALE',
            date: inv.date,
            referenceNo: inv.invoiceNumber || 'INV',
            partyName: inv.partyName || 'Cash / Retail Customer',
            quantity: it.quantity,
            unit: it.unit || activeItemDetail.unit,
            unitPrice: it.unitPrice,
            totalAmount: it.totalAmount,
            notes: inv.invoiceType === 'B2B' ? 'B2B Tax Invoice' : 'Retail Sale',
            isInward: false,
          });
        }
      }
    }

    // 2. Purchases from Purchase Bills
    for (const bill of allPurchases) {
      if (!bill.items) continue;
      for (const it of bill.items) {
        if (
          it.itemId === activeItemDetail.id ||
          (it.name && it.name.trim().toLowerCase() === activeItemDetail.name.trim().toLowerCase())
        ) {
          list.push({
            id: `pur-${bill.id}-${it.itemId || it.name}`,
            type: 'PURCHASE',
            date: bill.date,
            referenceNo: bill.billNumber || 'BILL',
            partyName: bill.supplierName || 'Vendor / Supplier',
            quantity: it.quantity,
            unit: it.unit || activeItemDetail.unit,
            unitPrice: it.unitPrice,
            totalAmount: it.totalAmount,
            notes: 'Inward Purchase Bill',
            isInward: true,
          });
        }
      }
    }

    // 3. Stock Adjustments
    for (const adj of allAdjustments) {
      if (
        adj.itemId === activeItemDetail.id ||
        (adj.itemName && adj.itemName.trim().toLowerCase() === activeItemDetail.name.trim().toLowerCase())
      ) {
        const isInward = adj.type === 'STOCK_IN';
        list.push({
          id: `adj-${adj.id}`,
          type: adj.type,
          date: adj.date,
          referenceNo: `ADJ-${adj.id.substring(Math.max(0, adj.id.length - 4))}`,
          partyName: adj.adjustedBy || 'Inventory Manager',
          quantity: adj.quantity,
          unit: activeItemDetail.unit,
          unitPrice: activeItemDetail.purchasePrice,
          totalAmount: adj.quantity * activeItemDetail.purchasePrice,
          notes: adj.reason || (isInward ? 'Manual Stock In' : 'Manual Stock Out'),
          isInward,
        });
      }
    }

    // Sort chronologically (newest first)
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [activeItemDetail, allInvoices, allPurchases, allAdjustments]);

  // Filtered transactions according to selected tab
  const filteredItemTransactions = useMemo(() => {
    if (txnFilter === 'ALL') return itemTransactions;
    if (txnFilter === 'SALES') return itemTransactions.filter((t) => t.type === 'SALE');
    if (txnFilter === 'PURCHASES') return itemTransactions.filter((t) => t.type === 'PURCHASE');
    if (txnFilter === 'ADJUSTMENTS') return itemTransactions.filter((t) => !['SALE', 'PURCHASE'].includes(t.type));
    return itemTransactions;
  }, [itemTransactions, txnFilter]);

  // Summary totals for item transactions
  const itemTxnSummary = useMemo(() => {
    let totalSoldQty = 0;
    let totalSoldAmount = 0;
    let totalPurchasedQty = 0;
    let totalPurchasedAmount = 0;
    let totalAdjustedQty = 0;

    for (const t of itemTransactions) {
      if (t.type === 'SALE') {
        totalSoldQty += t.quantity;
        totalSoldAmount += t.totalAmount || 0;
      } else if (t.type === 'PURCHASE') {
        totalPurchasedQty += t.quantity;
        totalPurchasedAmount += t.totalAmount || 0;
      } else if (t.isInward) {
        totalAdjustedQty += t.quantity;
      } else {
        totalAdjustedQty -= t.quantity;
      }
    }

    return {
      totalSoldQty,
      totalSoldAmount,
      totalPurchasedQty,
      totalPurchasedAmount,
      totalAdjustedQty,
      totalTransactions: itemTransactions.length,
    };
  }, [itemTransactions]);

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
  const [isDisabledState, setIsDisabledState] = useState(false);

  // Financial Metrics (Tactile Fintech Card)
  const totalStockValue = items.reduce((s, i) => s + i.currentStock * i.purchasePrice, 0);
  const lowStockItems = items.filter((i) => i.currentStock <= i.minStockAlert);
  const lowStockCount = lowStockItems.length;
  const categories = Array.from(new Set(items.map((i) => i.category)));

  // Format Valuation for Stitch headline
  const formattedStockValueDisplay =
    totalStockValue >= 100000
      ? `₹${(totalStockValue / 100000).toFixed(2)} Lakh`
      : formatINR(totalStockValue);

  // Multi-criteria filtering & sorting (Name, Available Stock, Category, Created, Disabled)
  const filtered = useMemo(() => {
    return items
      .filter((item) => {
        // 0. Disabled Filter: Hide disabled items by default unless showDisabled is true
        if (!showDisabled && isItemDisabled(item)) {
          return false;
        }

        // 1. Search query (Matches Name, SKU, Barcode, HSN)
        const s = search.toLowerCase().trim();
        const matchesSearch =
          !s ||
          item.name.toLowerCase().includes(s) ||
          (item.sku && item.sku.toLowerCase().includes(s)) ||
          (item.barcode && item.barcode.includes(s)) ||
          item.hsnSacCode.includes(s);

        if (!matchesSearch) return false;

        // 2. Category filter
        if (filterCategory !== 'ALL' && item.category !== filterCategory) {
          return false;
        }

        // 3. Available Stock filter
        if (filterStockStatus === 'IN_STOCK' && item.currentStock <= 0) {
          return false;
        }
        if (filterStockStatus === 'LOW_STOCK' && (item.currentStock > item.minStockAlert || item.currentStock <= 0)) {
          return false;
        }
        if (filterStockStatus === 'OUT_OF_STOCK' && item.currentStock > 0) {
          return false;
        }

        // 4. Created Date timeframe filter
        if (filterCreatedTimeframe !== 'ALL') {
          const createdDate = new Date(item.createdAt || 0);
          const now = new Date();
          if (filterCreatedTimeframe === 'TODAY') {
            if (createdDate.toDateString() !== now.toDateString()) return false;
          } else if (filterCreatedTimeframe === 'WEEK') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(now.getDate() - 7);
            if (createdDate < sevenDaysAgo) return false;
          } else if (filterCreatedTimeframe === 'MONTH') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);
            if (createdDate < thirtyDaysAgo) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortOption) {
          case 'NAME_ASC':
            return a.name.localeCompare(b.name);
          case 'NAME_DESC':
            return b.name.localeCompare(a.name);
          case 'STOCK_HIGH':
            return b.currentStock - a.currentStock;
          case 'STOCK_LOW':
            return a.currentStock - b.currentStock;
          case 'CREATED_DESC':
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          case 'CREATED_ASC':
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          default:
            return 0;
        }
      });
  }, [items, search, filterCategory, filterStockStatus, filterCreatedTimeframe, sortOption, showDisabled]);

  const handleToggleItemStatus = (item: InventoryItem) => {
    const currentlyDisabled = isItemDisabled(item);
    const updated: InventoryItem = {
      ...item,
      isDisabled: !currentlyDisabled,
      isActive: currentlyDisabled,
      updatedAt: new Date().toISOString(),
    };
    onSaveItem(updated);
    if (activeItemDetail && activeItemDetail.id === item.id) {
      setActiveItemDetail(updated);
    }
  };

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
    setIsDisabledState(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setItemType(item.unit === 'HOURS' || item.unit === 'DAYS' ? 'SERVICE' : 'PRODUCT');
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
    setIsDisabledState(isItemDisabled(item));
    setIsModalOpen(true);
    setActiveItemDetail(null);
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
      isActive: !isDisabledState,
      isDisabled: isDisabledState,
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
    setActiveItemDetail(null);
  };

  return (
    <div className="flex flex-col w-full pb-24 bg-surface min-h-screen">
      <div className="flex flex-col w-full max-w-7xl mx-auto md:px-6">
        {/* Top Stock Value & Financial Valuation Summary (Tactile Fintech Card) */}
        <section className="px-margin-mobile pt-space-sm pb-space-xs">
          <div className="bg-primary-container text-on-primary rounded-xl p-space-md shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm text-outline-variant uppercase tracking-wider">
                  Total Stock Value
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="font-currency-display-mobile text-[22px] font-bold text-on-primary">
                    {formattedStockValueDisplay}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-primary-container">
                    · {items.length} Items
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterStockStatus(filterStockStatus === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm transition-all cursor-pointer ${
                  filterStockStatus === 'LOW_STOCK'
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

        {/* Sticky Search & Filter Input Area */}
        <section className="px-margin-mobile pt-space-sm pb-space-xs flex flex-col gap-2">
          <div className="flex items-center gap-space-xs">
            <div className="relative flex-1 flex items-center bg-surface-container-lowest rounded-xl shadow-sm">
              <span className="material-symbols-outlined text-outline ml-3 mr-2 text-[20px]">
                search
              </span>
              <input
                className="w-full h-12 bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none pr-2"
                placeholder="Search items, SKU, or HSN code..."
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {onScanBarcodeClick && (
                <button
                  aria-label="Scan Item Barcode"
                  className="w-10 h-10 mr-1 flex items-center justify-center rounded-lg text-primary active:bg-surface-container-low transition-colors cursor-pointer"
                  type="button"
                  onClick={onScanBarcodeClick}
                >
                  <span className="material-symbols-outlined text-[22px]">barcode_scanner</span>
                </button>
              )}
            </div>
            <button
              aria-label="Filter & Sort Options"
              className={`relative w-12 h-12 flex items-center justify-center rounded-xl bg-surface-container-lowest text-on-surface shadow-sm active:bg-surface-container-low transition-colors cursor-pointer ${
                activeFilterCount > 0 ? 'border-2 border-secondary text-secondary bg-secondary/5 font-bold' : ''
              }`}
              type="button"
              onClick={() => setIsFilterModalOpen(true)}
            >
              <span className="material-symbols-outlined text-[20px]">tune</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-secondary text-on-secondary text-[10px] font-bold flex items-center justify-center shadow">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Active Filter Chips Row (if any filter is active) */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] text-outline font-semibold flex-shrink-0">Active:</span>

              {filterCategory !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setFilterCategory('ALL')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-semibold flex-shrink-0 cursor-pointer hover:bg-secondary/20"
                >
                  <span>Category: {filterCategory}</span>
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              )}

              {filterStockStatus !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setFilterStockStatus('ALL')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-semibold flex-shrink-0 cursor-pointer hover:bg-secondary/20"
                >
                  <span>
                    Stock:{' '}
                    {filterStockStatus === 'IN_STOCK'
                      ? 'In Stock'
                      : filterStockStatus === 'LOW_STOCK'
                      ? 'Low Stock'
                      : 'Out of Stock'}
                  </span>
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              )}

              {filterCreatedTimeframe !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setFilterCreatedTimeframe('ALL')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-semibold flex-shrink-0 cursor-pointer hover:bg-secondary/20"
                >
                  <span>
                    Created:{' '}
                    {filterCreatedTimeframe === 'TODAY'
                      ? 'Today'
                      : filterCreatedTimeframe === 'WEEK'
                      ? 'Last 7 Days'
                      : 'Last 30 Days'}
                  </span>
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              )}

              {sortOption !== 'DEFAULT' && (
                <button
                  type="button"
                  onClick={() => setSortOption('DEFAULT')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-semibold flex-shrink-0 cursor-pointer hover:bg-secondary/20"
                >
                  <span>
                    Sort:{' '}
                    {sortOption === 'NAME_ASC'
                      ? 'Name (A→Z)'
                      : sortOption === 'NAME_DESC'
                      ? 'Name (Z→A)'
                      : sortOption === 'STOCK_HIGH'
                      ? 'Stock (High)'
                      : sortOption === 'STOCK_LOW'
                      ? 'Stock (Low)'
                      : sortOption === 'CREATED_DESC'
                      ? 'Newest'
                      : 'Oldest'}
                  </span>
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              )}

              {showDisabled && (
                <button
                  type="button"
                  onClick={() => setShowDisabled(false)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold flex-shrink-0 cursor-pointer hover:bg-amber-500/25"
                >
                  <span>Disabled items shown ({disabledItemsCount})</span>
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              )}

              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[11px] text-error font-semibold hover:underline flex-shrink-0 cursor-pointer ml-1"
              >
                Clear All
              </button>
            </div>
          )}
        </section>

        {/* Horizontal Scrollable Category Pills */}
        <section className="pt-space-xs pb-space-xs">
          <div className="flex items-center gap-space-xs overflow-x-auto px-margin-mobile no-scrollbar py-0.5">
            <button
              className={`px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap shadow-sm flex items-center gap-1.5 cursor-pointer transition-colors ${
                filterCategory === 'ALL' && filterStockStatus === 'ALL' && !showDisabled
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant active:bg-surface-container-low'
              }`}
              type="button"
              onClick={() => {
                setFilterCategory('ALL');
                setFilterStockStatus('ALL');
                setShowDisabled(false);
              }}
            >
              <span>All Items</span>
              <span className="px-1.5 py-0.2 rounded-full bg-surface-container-lowest/25 text-[10px]">
                {items.length}
              </span>
            </button>

            <button
              className={`px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap shadow-sm active:bg-surface-container-low transition-colors cursor-pointer ${
                filterStockStatus === 'LOW_STOCK'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant'
              }`}
              type="button"
              onClick={() => {
                setFilterStockStatus(filterStockStatus === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK');
              }}
            >
              Low Stock ({lowStockCount})
            </button>

            {disabledItemsCount > 0 && (
              <button
                className={`px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap shadow-sm flex items-center gap-1.5 cursor-pointer transition-colors ${
                  showDisabled
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
                }`}
                type="button"
                onClick={() => setShowDisabled(!showDisabled)}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {showDisabled ? 'check_box' : 'check_box_outline_blank'}
                </span>
                <span>Disabled ({disabledItemsCount})</span>
              </button>
            )}

            {categories.map((cat) => (
              <button
                key={cat}
                className={`px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap shadow-sm active:bg-surface-container-low transition-colors cursor-pointer ${
                  filterCategory === cat && !showDisabled
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-lowest text-on-surface-variant'
                }`}
                type="button"
                onClick={() => {
                  setFilterCategory(filterCategory === cat ? 'ALL' : cat);
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Inventory Line Items Feed (Exact simplified Stitch layout) */}
        <section className="px-margin-mobile md:px-0 grid grid-cols-1 md:grid-cols-2 gap-space-sm pb-28">
          {filtered.length === 0 ? (
            <div className="md:col-span-2 w-full bg-surface-container-lowest rounded-xl shadow-sm p-8 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[36px] text-outline mb-2">
                inventory_2
              </span>
              <p className="font-headline-sm text-sm font-semibold">No stock items match your search.</p>
              <p className="text-body-sm text-outline mt-1">Tap + Add New Item to create an inventory item.</p>
            </div>
          ) : (
            filtered.map((item) => {
              const itemDisabled = isItemDisabled(item);
              const isLow = item.currentStock <= item.minStockAlert && item.currentStock > 0;
              const isOut = item.currentStock <= 0;

              return (
                <div
                  key={item.id}
                  onClick={() => setActiveItemDetail(item)}
                  className={`w-full bg-surface-container-lowest rounded-xl shadow-sm p-3 sm:p-space-md flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99] ${
                    itemDisabled ? 'opacity-70 border border-dashed border-outline-variant/60 bg-surface-container-low/40' : ''
                  }`}
                >
                  {/* Thumbnail / Item Avatar */}
                  <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex-shrink-0 flex items-center justify-center ${
                    itemDisabled ? 'bg-surface-container-high text-outline' : 'bg-surface-container-low text-secondary'
                  }`}>
                    <span className="material-symbols-outlined text-[22px] sm:text-[24px]">
                      {itemDisabled ? 'block' : 'inventory_2'}
                    </span>
                  </div>

                  {/* Information Column */}
                  <div className="flex flex-col min-w-0 flex-1 justify-center">
                    {/* Top Row: Item Name (left) & Available Stock Badge (right) */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className={`font-headline-sm text-sm sm:text-base truncate font-semibold ${
                          itemDisabled ? 'text-on-surface-variant line-through' : 'text-on-surface'
                        }`}>
                          {item.name}
                        </h3>
                        {itemDisabled && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                            Disabled
                          </span>
                        )}
                      </div>

                      {/* Available Stock Badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 whitespace-nowrap ${
                          isOut
                            ? 'bg-error/10 text-error'
                            : isLow
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-secondary/10 text-secondary'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOut
                              ? 'bg-error'
                              : isLow
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-secondary'
                          }`}
                        />
                        <span>
                          {isOut
                            ? 'Out of stock'
                            : isLow
                            ? `${item.currentStock} ${item.unit} left`
                            : `${item.currentStock} ${item.unit}`}
                        </span>
                      </span>
                    </div>

                    {/* Bottom Row: Pricing (Sale left, Buy justified right) */}
                    <div className="flex items-center justify-between gap-2 mt-1 text-xs text-on-surface-variant">
                      {/* Sale Price */}
                      <div className="inline-flex items-baseline gap-1">
                        <span className="text-outline text-[10px] font-label-sm uppercase font-semibold">Sale:</span>
                        <span className="font-headline-sm text-xs sm:text-body-md font-bold text-on-surface">
                          {formatINR(item.salePrice)}
                        </span>
                      </div>

                      {/* Buy Price (Right-justified with click-to-reveal) */}
                      <button
                        type="button"
                        onClick={(e) => toggleBuyPrice(item.id, e)}
                        className="inline-flex items-center justify-end gap-1 cursor-pointer hover:opacity-80 active:scale-95 transition-all text-right ml-auto bg-transparent border-0 p-0"
                        title={revealedBuyPrices[item.id] ? 'Click to hide purchase price' : 'Click to view purchase price'}
                      >
                        <span className="text-outline text-[10px] font-label-sm uppercase font-semibold">Buy:</span>
                        <span className="font-tabular-data text-xs font-semibold text-on-surface-variant font-mono tracking-wider">
                          {revealedBuyPrices[item.id] ? formatINR(item.purchasePrice) : '***'}
                        </span>
                        <span className="material-symbols-outlined text-[14px] text-outline ml-0.5">
                          {revealedBuyPrices[item.id] ? 'visibility' : 'visibility_off'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Sticky Bottom Floating Action Center */}
        <div className="fixed bottom-20 left-0 right-0 z-40 px-margin-mobile pointer-events-none">
          <div className="max-w-md mx-auto flex items-center justify-end pointer-events-auto">
            <button
              onClick={handleOpenAdd}
              aria-label="Add New Item"
              className="w-14 h-14 rounded-full bg-secondary text-on-secondary shadow-xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer hover:opacity-95"
              type="button"
            >
              <span className="material-symbols-outlined text-[30px]">add</span>
            </button>
          </div>
        </div>
      </div>

      {/* Simplified Item Details & Recent Transactions Sheet */}
      {activeItemDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 w-full max-w-lg max-h-[85vh] shadow-2xl border border-outline-variant/30 flex flex-col gap-3.5 overflow-hidden animate-in slide-in-from-bottom">
            {/* Header: Title + Stock Status + Close */}
            <div className="flex items-center justify-between pb-2.5 border-b border-outline-variant/20 flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-headline-sm text-base font-bold text-on-surface truncate">
                    {activeItemDetail.name}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full font-label-sm text-[10px] font-bold flex-shrink-0 ${
                    activeItemDetail.currentStock <= 0
                      ? 'bg-error/15 text-error'
                      : activeItemDetail.currentStock <= activeItemDetail.minStockAlert
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-secondary-container text-on-secondary-container'
                  }`}>
                    {activeItemDetail.currentStock} {activeItemDetail.unit}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant font-mono mt-0.5">
                  {activeItemDetail.category} • HSN: {activeItemDetail.hsnSacCode}
                  {activeItemDetail.sku ? ` • SKU: ${activeItemDetail.sku}` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveItemDetail(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Disabled Item Banner */}
            {isItemDisabled(activeItemDetail) && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-amber-600 text-[18px] flex-shrink-0">block</span>
                  <span className="font-semibold truncate">Item is disabled (hidden from billing)</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleItemStatus(activeItemDetail)}
                  className="px-3 py-1 rounded-lg bg-secondary text-on-secondary font-bold text-xs cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
                >
                  Enable
                </button>
              </div>
            )}

            {/* Historical Bills Reference Banner */}
            {isItemInBills(activeItemDetail.id, allInvoices, allPurchases) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low text-[11px] text-outline flex-shrink-0">
                <span className="material-symbols-outlined text-[16px] text-secondary flex-shrink-0">verified_user</span>
                <span>Referenced in historical bills. Cannot be deleted to preserve accounting records.</span>
              </div>
            )}

            {/* Compact Pricing Bar */}
            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-surface-container-low text-xs flex-shrink-0">
              <div>
                <span className="text-[10px] text-outline font-semibold uppercase block">Sale Price</span>
                <span className="font-bold text-on-surface text-sm">{formatINR(activeItemDetail.salePrice)}</span>
              </div>
              <div>
                <span className="text-[10px] text-outline font-semibold uppercase block">Buy Price</span>
                <button
                  type="button"
                  onClick={() => toggleBuyPrice(activeItemDetail.id)}
                  className="font-bold text-on-surface text-sm flex items-center gap-1 cursor-pointer hover:text-secondary transition-colors"
                >
                  <span className="font-mono">
                    {revealedBuyPrices[activeItemDetail.id]
                      ? formatINR(activeItemDetail.purchasePrice)
                      : '***'}
                  </span>
                  <span className="material-symbols-outlined text-[13px] text-outline">
                    {revealedBuyPrices[activeItemDetail.id] ? 'visibility' : 'visibility_off'}
                  </span>
                </button>
              </div>
              <div>
                <span className="text-[10px] text-outline font-semibold uppercase block">Stock Value</span>
                <span className="font-bold text-on-surface text-sm">
                  {formatINR(activeItemDetail.currentStock * activeItemDetail.purchasePrice)}
                </span>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-between gap-1 flex-shrink-0">
              <span className="text-xs font-bold text-on-surface">Transactions</span>
              <div className="inline-flex rounded-lg bg-surface-container p-0.5 text-[11px] font-semibold">
                {(['ALL', 'SALES', 'PURCHASES', 'ADJUSTMENTS'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTxnFilter(tab)}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer capitalize ${
                      txnFilter === tab
                        ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tab === 'ALL' ? 'All' : tab.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Transaction List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 text-xs min-h-[160px] max-h-[360px]">
              {filteredItemTransactions.length === 0 ? (
                <div className="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1">
                  <span className="material-symbols-outlined text-[24px] text-outline">receipt_long</span>
                  <p className="text-xs">No transactions recorded</p>
                </div>
              ) : (
                filteredItemTransactions.map((txn) => {
                  const isSale = txn.type === 'SALE';
                  const isPurchase = txn.type === 'PURCHASE';

                  return (
                    <div
                      key={txn.id}
                      className="p-2.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container-low transition-colors flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          txn.isInward
                            ? 'bg-secondary/15 text-secondary'
                            : 'bg-error/15 text-error'
                        }`}>
                          <span className="material-symbols-outlined text-[18px]">
                            {txn.isInward ? 'arrow_downward' : 'arrow_upward'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-on-surface truncate text-xs">
                              {isSale ? 'Sale' : isPurchase ? 'Purchase' : txn.type.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] text-outline font-mono truncate">
                              #{txn.referenceNo}
                            </span>
                          </div>
                          <p className="text-[11px] text-on-surface-variant truncate">
                            {txn.partyName || txn.notes} • <span className="text-[10px] text-outline">{txn.date}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className={`text-xs font-bold font-tabular-data block ${
                          txn.isInward ? 'text-secondary' : 'text-error'
                        }`}>
                          {txn.isInward ? '+' : '-'}{txn.quantity} {txn.unit}
                        </span>
                        {txn.totalAmount !== undefined && (
                          <span className="text-[11px] text-on-surface-variant font-medium font-tabular-data block">
                            {formatINR(txn.totalAmount)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Actions: Stock In, Stock Out, Edit, Toggle Enable/Disable, Delete */}
            <div className="pt-2 border-t border-outline-variant/20 flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setAdjustmentItem(activeItemDetail);
                  setAdjType('STOCK_IN');
                  setAdjQty(1);
                  setActiveItemDetail(null);
                }}
                className="flex-1 py-2 px-2.5 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold flex items-center justify-center gap-1 active:scale-95 cursor-pointer shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Stock In</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustmentItem(activeItemDetail);
                  setAdjType('STOCK_OUT');
                  setAdjQty(1);
                  setActiveItemDetail(null);
                }}
                className="flex-1 py-2 px-2.5 rounded-xl bg-surface-container text-on-surface font-label-md text-xs font-bold flex items-center justify-center gap-1 active:scale-95 cursor-pointer hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[16px]">remove</span>
                <span>Stock Out</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenEdit(activeItemDetail)}
                className="w-9 h-9 rounded-xl bg-surface-container text-on-surface flex items-center justify-center active:scale-95 cursor-pointer hover:bg-surface-container-high transition-colors"
                title="Edit Item"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>

              {/* Disable / Enable Toggle Button */}
              <button
                type="button"
                onClick={() => handleToggleItemStatus(activeItemDetail)}
                className={`h-9 px-2.5 rounded-xl font-label-md text-xs font-bold flex items-center justify-center gap-1 active:scale-95 cursor-pointer transition-colors ${
                  isItemDisabled(activeItemDetail)
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                }`}
                title={isItemDisabled(activeItemDetail) ? 'Enable this item' : 'Disable this item'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isItemDisabled(activeItemDetail) ? 'check_circle' : 'block'}
                </span>
                <span className="hidden sm:inline">
                  {isItemDisabled(activeItemDetail) ? 'Enable' : 'Disable'}
                </span>
              </button>

              {/* Delete Button with Protection for Items in Bills */}
              <button
                type="button"
                onClick={() => {
                  const inBills = isItemInBills(activeItemDetail.id, allInvoices, allPurchases);
                  if (inBills) {
                    if (window.confirm('This item is referenced in existing bills and CANNOT be deleted to preserve financial records.\n\nWould you like to DISABLE this item instead to hide it from billing?')) {
                      handleToggleItemStatus(activeItemDetail);
                    }
                    return;
                  }
                  if (window.confirm(`Delete item "${activeItemDetail.name}"?`)) {
                    onDeleteItem(activeItemDetail.id);
                    setActiveItemDetail(null);
                  }
                }}
                className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 cursor-pointer transition-colors ${
                  isItemInBills(activeItemDetail.id, allInvoices, allPurchases)
                    ? 'bg-surface-container text-outline hover:text-error'
                    : 'bg-error/10 text-error hover:bg-error/20'
                }`}
                title={
                  isItemInBills(activeItemDetail.id, allInvoices, allPurchases)
                    ? 'Item is in bills (Cannot delete - Click to disable)'
                    : 'Delete Item'
                }
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isItemInBills(activeItemDetail.id, allInvoices, allPurchases) ? 'lock' : 'delete'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Item Modal */}
      {isModalOpen && (
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

      {/* Stock Adjustment Modal */}
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

      {/* Simplified Filter & Sort Modal */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-sm shadow-2xl flex flex-col gap-3 animate-in slide-in-from-bottom">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">tune</span>
                <h3 className="font-headline-sm text-sm font-bold text-on-surface">Filter &amp; Sort</h3>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="text-xs font-semibold text-error hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            {/* 1. Sort by Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-outline uppercase tracking-wider">
                Sort by Name
              </label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'DEFAULT', label: 'Default' },
                  { id: 'NAME_ASC', label: 'A → Z' },
                  { id: 'NAME_DESC', label: 'Z → A' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSortOption(s.id as any)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold text-center transition-colors cursor-pointer ${
                      sortOption === s.id
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Available Stock */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-outline uppercase tracking-wider">
                Available Stock
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'IN_STOCK', label: 'In Stock' },
                  { id: 'LOW_STOCK', label: 'Low' },
                  { id: 'OUT_OF_STOCK', label: 'Out' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFilterStockStatus(s.id as any)}
                    className={`py-1.5 px-1 rounded-lg text-xs font-semibold text-center transition-colors cursor-pointer ${
                      filterStockStatus === s.id
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Category */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-outline uppercase tracking-wider">
                Category
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-xs font-semibold focus:outline-none focus:border-secondary cursor-pointer"
              >
                <option value="ALL">All Categories ({items.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c} ({items.filter((i) => i.category === c).length})
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Created Date */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-outline uppercase tracking-wider">
                Created Date
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: 'ALL', label: 'All Time' },
                  { id: 'TODAY', label: 'Today' },
                  { id: 'WEEK', label: '7 Days' },
                  { id: 'MONTH', label: '30 Days' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilterCreatedTimeframe(t.id as any)}
                    className={`py-1.5 px-1 rounded-lg text-xs font-semibold text-center transition-colors cursor-pointer ${
                      filterCreatedTimeframe === t.id
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Disabled Items Visibility */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container border border-outline-variant/20">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-on-surface">Show Disabled Items</span>
                <span className="text-[11px] text-outline">
                  {disabledItemsCount === 0
                    ? 'No disabled items'
                    : `${disabledItemsCount} disabled items hidden by default`}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDisabled}
                  onChange={(e) => setShowDisabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
              </label>
            </div>

            {/* Apply Button */}
            <button
              type="button"
              onClick={() => setIsFilterModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm active:scale-98 transition-transform cursor-pointer mt-1"
            >
              Apply Filter ({filtered.length} Items)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
