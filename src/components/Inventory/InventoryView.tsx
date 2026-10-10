import React, { useState, useMemo, useEffect } from 'react';
import { InventoryItem, StockAdjustment, isItemDisabled } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { db } from '../../services/db.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { InventoryItemCard } from './InventoryItemCard.tsx';
import { StockAdjustmentModal } from './StockAdjustmentModal.tsx';
import { InventoryFilterSheet } from './InventoryFilterSheet.tsx';
import { ItemFormModal } from './ItemFormModal.tsx';
import { ItemDetailSheet, ItemTransactionRecord, ItemTransactionType } from './ItemDetailSheet.tsx';
import { SimplifiedInvoiceModal } from '../Invoicing/SimplifiedInvoiceModal.tsx';
import { SimplifiedPurchaseModal } from '../Purchases/SimplifiedPurchaseModal.tsx';

export type { ItemTransactionType, ItemTransactionRecord };

interface InventoryViewProps {
  items: InventoryItem[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  adjustments?: StockAdjustment[];
  onSaveItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
  onSaveAdjustment: (adj: StockAdjustment) => void;
  onScanBarcodeClick?: () => void;
  onOpenSettings?: (tab?: 'profile' | 'items' | 'general' | 'print' | 'audit') => void;
  onViewInvoice?: (invoice: Invoice) => void;
  previewInvoice?: (invoice: Invoice) => void;
  onViewPurchase?: (bill: PurchaseBill) => void;
  previewPurchase?: (bill: PurchaseBill) => void;
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
  onOpenSettings,
  onViewInvoice,
  previewInvoice: previewInvoiceProp,
  onViewPurchase,
  previewPurchase: previewPurchaseProp,
}) => {
  const isGstActive = db.getCompany().isGstEnabled !== false;

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
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewPurchase, setPreviewPurchase] = useState<PurchaseBill | null>(null);
  const company = useMemo(() => db.getCompany(), []);

  const handleViewInvoice = (inv: Invoice) => {
    const viewInv = onViewInvoice || previewInvoiceProp;
    if (viewInv) {
      viewInv(inv);
    } else {
      setPreviewInvoice(inv);
    }
  };

  const handleViewPurchase = (bill: PurchaseBill) => {
    const viewPur = onViewPurchase || previewPurchaseProp;
    if (viewPur) {
      viewPur(bill);
    } else {
      setPreviewPurchase(bill);
    }
  };

  // Back Navigation for modals (priority 20)
  useBackNavigation(() => {
    if (previewInvoice !== null) { setPreviewInvoice(null); return true; }
    if (previewPurchase !== null) { setPreviewPurchase(null); return true; }
    if (isModalOpen) { setIsModalOpen(false); return true; }
    if (isFilterModalOpen) { setIsFilterModalOpen(false); return true; }
    if (adjustmentItem !== null) { setAdjustmentItem(null); return true; }
    if (activeItemDetail !== null) { setActiveItemDetail(null); return true; }
    return false;
  }, isModalOpen || isFilterModalOpen || activeItemDetail !== null || adjustmentItem !== null || previewInvoice !== null || previewPurchase !== null, 20);

  // Privacy toggles: Buy price visibility per item & global setting
  const [showBuyPricesGlobally, setShowBuyPricesGlobally] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gst_hide_buy_prices') !== 'true';
    } catch {
      return true;
    }
  });

  const [revealedBuyPrices, setRevealedBuyPrices] = useState<Record<string, boolean>>({});

  const isBuyPriceVisible = (itemId: string): boolean => {
    if (itemId in revealedBuyPrices) {
      return revealedBuyPrices[itemId];
    }
    return showBuyPricesGlobally;
  };

  const toggleBuyPrice = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const current = isBuyPriceVisible(itemId);
    setRevealedBuyPrices((prev) => ({
      ...prev,
      [itemId]: !current,
    }));
  };

  useEffect(() => {
    const handleSync = () => {
      try {
        setShowBuyPricesGlobally(db.getBuyPriceVisibility());
      } catch {}
    };

    window.addEventListener('storage', handleSync);
    window.addEventListener('gst_buy_price_visibility_change', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('gst_buy_price_visibility_change', handleSync);
    };
  }, []);

  const toggleGlobalBuyPrice = () => {
    setShowBuyPricesGlobally((prev) => {
      const next = !prev;
      db.setBuyPriceVisibility(next);
      setRevealedBuyPrices({});
      return next;
    });
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

  // Transactions aggregation (Sales, Purchases, Stock Adjustments)
  const allInvoices = useMemo(() => invoices || db.getInvoices(), [invoices]);
  const allPurchases = useMemo(() => purchases || db.getPurchases(), [purchases]);
  const allAdjustments = useMemo(() => adjustments || db.getStockAdjustments(), [adjustments]);

  // Find all items with stock discrepancies where transactions exist
  const itemsWithDiscrepancy = useMemo(() => {
    return items.filter((item) => {
      let totalSold = 0;
      let totalPurchased = 0;
      let totalAdjusted = 0;
      let txnCount = 0;
      const normName = (item?.name || '').trim().toLowerCase();

      for (const inv of allInvoices) {
        if (!inv || !inv.items) continue;
        for (const it of inv.items) {
          if (!it) continue;
          if (it.itemId === item.id || (it.name && it.name.trim().toLowerCase() === normName)) {
            totalSold += it.quantity || 0;
            txnCount++;
          }
        }
      }

      for (const bill of allPurchases) {
        if (!bill || !bill.items) continue;
        for (const it of bill.items) {
          if (!it) continue;
          if (it.itemId === item.id || (it.name && it.name.trim().toLowerCase() === normName)) {
            totalPurchased += it.quantity || 0;
            txnCount++;
          }
        }
      }

      for (const adj of allAdjustments) {
        if (!adj) continue;
        if (adj.itemId === item.id || (adj.itemName && adj.itemName.trim().toLowerCase() === normName)) {
          if (adj.type === 'STOCK_IN') totalAdjusted += adj.quantity || 0;
          else totalAdjusted -= adj.quantity || 0;
          txnCount++;
        }
      }

      if (txnCount === 0 || totalPurchased === 0) return false;
      const netStock = Math.max(0, totalPurchased + totalAdjusted - totalSold);
      return item.currentStock > netStock;
    });
  }, [items, allInvoices, allPurchases, allAdjustments]);

  const handleReconcileAllDiscrepancies = () => {
    if (itemsWithDiscrepancy.length === 0) return;
    if (
      !window.confirm(
        `Reconcile stock for ${itemsWithDiscrepancy.length} item(s) to match exact transaction history totals?\n\nThis will correct doubled stock back to accurate purchase/sales levels.`
      )
    ) {
      return;
    }

    let count = 0;
    for (const item of itemsWithDiscrepancy) {
      let totalSold = 0;
      let totalPurchased = 0;
      let totalAdjusted = 0;
      const normName = (item?.name || '').trim().toLowerCase();

      for (const inv of allInvoices) {
        if (!inv || !inv.items) continue;
        for (const it of inv.items) {
          if (!it) continue;
          if (it.itemId === item.id || (it.name && it.name.trim().toLowerCase() === normName)) {
            totalSold += it.quantity || 0;
          }
        }
      }
      for (const bill of allPurchases) {
        if (!bill || !bill.items) continue;
        for (const it of bill.items) {
          if (!it) continue;
          if (it.itemId === item.id || (it.name && it.name.trim().toLowerCase() === normName)) {
            totalPurchased += it.quantity || 0;
          }
        }
      }
      for (const adj of allAdjustments) {
        if (!adj) continue;
        if (adj.itemId === item.id || (adj.itemName && adj.itemName.trim().toLowerCase() === normName)) {
          if (adj.type === 'STOCK_IN') totalAdjusted += adj.quantity || 0;
          else totalAdjusted -= adj.quantity || 0;
        }
      }

      const netStock = Math.max(0, totalPurchased + totalAdjusted - totalSold);
      const updated: InventoryItem = {
        ...item,
        currentStock: netStock,
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(updated);
      onSaveItem(updated);
      count++;
    }

    alert(`Successfully reconciled ${count} item(s) to match transaction records!`);
  };

  const handleReconcileItemStock = (item: InventoryItem, targetStock: number) => {
    const updated: InventoryItem = {
      ...item,
      currentStock: targetStock,
      updatedAt: new Date().toISOString(),
    };
    db.saveItem(updated);
    setActiveItemDetail(updated);
    onSaveItem(updated);
  };

  // Financial Metrics (Tactile Fintech Card)
  const totalStockValue = items.reduce((s, i) => s + i.currentStock * i.purchasePrice, 0);
  const lowStockItems = items.filter((i) => i.currentStock <= i.minStockAlert);
  const lowStockCount = lowStockItems.length;
  const categories = Array.from(new Set(items.map((i) => i.category)));

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [items]);

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

        // 1. Search query (Matches containing text in Name, SKU, Barcode, Category, HSN)
        const s = search.toLowerCase().trim();
        const words = s ? s.split(/\s+/).filter(Boolean) : [];
        const matchesSearch =
          words.length === 0 ||
          words.every((w) =>
            item.name.toLowerCase().includes(w) ||
            (item.sku && item.sku.toLowerCase().includes(w)) ||
            (item.barcode && item.barcode.toLowerCase().includes(w)) ||
            (item.category && item.category.toLowerCase().includes(w)) ||
            item.hsnSacCode.toLowerCase().includes(w)
          );

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
    setIsModalOpen(true);
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
        <section className="sticky top-14 md:top-14 z-20 bg-surface/95 backdrop-blur-md px-margin-mobile pt-space-sm pb-space-xs flex flex-col gap-2 border-b border-outline-variant/10 shadow-xs">
          <div className="flex items-center gap-space-xs">
            <div className="relative flex-1 flex items-center bg-surface-container-lowest rounded-xl shadow-sm">
              <span className="material-symbols-outlined text-outline ml-3 mr-2 text-[20px]">
                search
              </span>
              <input
                className="w-full min-w-0 h-12 bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none pr-2"
                placeholder={isGstActive ? "Search items, SKU, or HSN code..." : "Search items or SKU..."}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearch('');
                  }
                }}
              />
              {search && (
                <button
                  aria-label="Clear Search"
                  title="Clear Search"
                  type="button"
                  onClick={() => setSearch('')}
                  className="w-10 h-10 mr-1 flex-shrink-0 flex items-center justify-center rounded-lg text-outline hover:text-on-surface active:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
            <button
              aria-label={showBuyPricesGlobally ? 'Hide Buy Prices' : 'Show Buy Prices'}
              title={showBuyPricesGlobally ? 'Hide Buy Prices (Privacy Mode)' : 'Show Buy Prices'}
              className={`w-12 h-12 flex items-center justify-center rounded-xl bg-surface-container-lowest shadow-sm active:bg-surface-container-low transition-colors cursor-pointer ${
                !showBuyPricesGlobally ? 'text-outline border border-outline/30' : 'text-primary'
              }`}
              type="button"
              onClick={toggleGlobalBuyPrice}
            >
              <span className="material-symbols-outlined text-[20px]">
                {showBuyPricesGlobally ? 'visibility' : 'visibility_off'}
              </span>
            </button>
            <button
              aria-label="Filter & Sort Options"
              className={`relative w-12 h-12 flex items-center justify-center rounded-xl bg-surface-container-lowest text-on-surface shadow-sm active:bg-surface-container-low transition-colors cursor-pointer ${
                activeFilterCount > 0 ? 'border-2 border-secondary text-secondary bg-secondary/5 font-bold' : ''
              }`}
              type="button"
              onClick={() => setIsFilterModalOpen(true)}
            >
              <span className="material-symbols-outlined text-[20px]">filter_list</span>
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

        {/* Stock Discrepancy Reconciliation Banner */}
        {itemsWithDiscrepancy.length > 0 && (
          <div className="px-margin-mobile pt-1 pb-1">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs animate-fade-in shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">published_with_changes</span>
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-amber-900 dark:text-amber-200 block truncate">
                    {itemsWithDiscrepancy.length} item{itemsWithDiscrepancy.length > 1 ? 's have' : ' has'} stock discrepancy
                  </span>
                  <span className="text-[11px] text-on-surface-variant block mt-0.5 truncate">
                    Catalog stock differs from transaction history (e.g. double counted new items)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReconcileAllDiscrepancies}
                className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs flex-shrink-0 transition-all"
              >
                <span className="material-symbols-outlined text-[15px]">done_all</span>
                <span>Sync All ({itemsWithDiscrepancy.length})</span>
              </button>
            </div>
          </div>
        )}

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

        {/* Inventory Line Items Feed */}
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
            filtered.map((item) => (
              <InventoryItemCard
                key={item.id}
                item={item}
                isBuyPriceVisible={isBuyPriceVisible(item.id)}
                onToggleBuyPrice={(e) => toggleBuyPrice(item.id, e)}
                onClick={() => setActiveItemDetail(item)}
              />
            ))
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

      {/* 1. Item Details & Passbook Sheet */}
      <ItemDetailSheet
        item={activeItemDetail}
        onClose={() => setActiveItemDetail(null)}
        isGstActive={isGstActive}
        allInvoices={allInvoices}
        allPurchases={allPurchases}
        allAdjustments={allAdjustments}
        isBuyPriceVisible={isBuyPriceVisible}
        toggleBuyPrice={toggleBuyPrice}
        onOpenEdit={(item) => {
          setEditingItem(item);
          setIsModalOpen(true);
          setActiveItemDetail(null);
        }}
        onOpenAdjustment={(item, type) => {
          setAdjustmentItem(item);
          setAdjType(type);
          setActiveItemDetail(null);
        }}
        onToggleItemStatus={handleToggleItemStatus}
        onDeleteItem={onDeleteItem}
        onReconcileItemStock={handleReconcileItemStock}
        onViewInvoice={handleViewInvoice}
        previewInvoice={handleViewInvoice}
        onViewPurchase={handleViewPurchase}
        previewPurchase={handleViewPurchase}
      />

      {/* 2. Add / Edit Item Modal */}
      <ItemFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        onSaveItem={onSaveItem}
        isGstActive={isGstActive}
        existingItems={items}
      />

      {/* 3. Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={adjustmentItem !== null}
        item={adjustmentItem}
        onClose={() => setAdjustmentItem(null)}
        onSaveAdjustment={onSaveAdjustment}
        defaultType={adjType}
      />

      {/* 4. Simplified Filter & Sort Sheet */}
      <InventoryFilterSheet
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        categories={categories}
        totalItemsCount={items.length}
        filteredCount={filtered.length}
        disabledItemsCount={disabledItemsCount}
        activeFilterCount={activeFilterCount}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        filterStockStatus={filterStockStatus}
        setFilterStockStatus={setFilterStockStatus}
        filterCreatedTimeframe={filterCreatedTimeframe}
        setFilterCreatedTimeframe={setFilterCreatedTimeframe}
        sortOption={sortOption}
        setSortOption={setSortOption}
        showDisabled={showDisabled}
        setShowDisabled={setShowDisabled}
        onResetFilters={resetAllFilters}
        categoryCounts={categoryCounts}
      />

      {/* 5. Simplified Invoice Preview Modal */}
      {previewInvoice && (
        <SimplifiedInvoiceModal
          invoice={previewInvoice}
          company={company}
          onClose={() => setPreviewInvoice(null)}
        />
      )}

      {/* 6. Simplified Purchase Bill Preview Modal */}
      {previewPurchase && (
        <SimplifiedPurchaseModal
          bill={previewPurchase}
          company={company}
          onClose={() => setPreviewPurchase(null)}
        />
      )}
    </div>
  );
};
