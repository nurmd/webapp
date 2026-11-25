import React, { useState, useMemo, useCallback } from 'react';
import { InventoryItem, isItemDisabled } from '../../models/item.ts';
import { UnitsManagementCard } from './UnitsManagementCard.tsx';
import { ItemFormModal } from './ItemFormModal.tsx';
import { formatINR } from '../../core/utils/formatters.ts';
import { db } from '../../services/db.ts';
import { notifyDocumentSaved } from '../../services/saveConfirmation.ts';
import { useUnits } from '../../core/store/useDataStore.ts';

export interface UnitsPricingViewProps {
  items: InventoryItem[];
  onSaveItem?: (item: InventoryItem) => void;
  onOpenSettings?: () => void;
  isGstActive?: boolean;
}

type SectionTab = 'ALL' | 'UNITS' | 'TIERS';
type TierFilter = 'ALL' | 'MULTI_TIER' | 'RETAIL_ONLY';

function formatPriceTier(tier?: 'RETAIL' | 'SEMI_WHOLESALE' | 'WHOLESALE') {
  if (tier === 'WHOLESALE') return 'Wholesale';
  if (tier === 'SEMI_WHOLESALE') return 'Semi-Wholesale';
  return 'Retail';
}

export const UnitsPricingView: React.FC<UnitsPricingViewProps> = ({
  items,
  onSaveItem,
  onOpenSettings,
  isGstActive = db.getCompany()?.isGstEnabled !== false,
}) => {
  const units = useUnits();
  const [activeSectionTab, setActiveSectionTab] = useState<SectionTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // ItemFormModal state for editing tier pricing
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Statistics
  const activeUnitsCount = useMemo(() => units.filter((u) => u.active).length, [units]);
  const multiTierCount = useMemo(
    () =>
      items.filter(
        (i) =>
          (i.semiWholesalePrice !== undefined && i.semiWholesalePrice > 0) ||
          (i.wholesalePrice !== undefined && i.wholesalePrice > 0)
      ).length,
    [items]
  );
  const subUnitCount = useMemo(
    () => items.filter((i) => i.subUnit && i.subUnitFactor && i.subUnitFactor > 0).length,
    [items]
  );
  const retailOnlyCount = useMemo(() => items.length - multiTierCount, [items.length, multiTierCount]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category?.trim()) set.add(i.category.trim());
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered items list
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = (item.name || '').toLowerCase().includes(query);
        const matchesSku = (item.sku || '').toLowerCase().includes(query);
        const matchesHsn = (item.hsnSacCode || '').toLowerCase().includes(query);
        const matchesCat = (item.category || '').toLowerCase().includes(query);
        if (!matchesName && !matchesSku && !matchesHsn && !matchesCat) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      // Tier filter
      const hasTier =
        (item.semiWholesalePrice !== undefined && item.semiWholesalePrice > 0) ||
        (item.wholesalePrice !== undefined && item.wholesalePrice > 0);

      if (tierFilter === 'MULTI_TIER' && !hasTier) {
        return false;
      }
      if (tierFilter === 'RETAIL_ONLY' && hasTier) {
        return false;
      }

      return true;
    });
  }, [items, searchQuery, selectedCategory, tierFilter]);

  const handleEditItem = useCallback((item: InventoryItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setEditingItem(null);
  }, []);

  const handleModalSave = useCallback(
    (item: InventoryItem) => {
      if (onSaveItem) {
        onSaveItem(item);
      } else {
        db.saveItem(item);
        notifyDocumentSaved({ kind: 'Item' });
      }
      handleModalClose();
    },
    [onSaveItem, handleModalClose]
  );

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-5 max-w-7xl mx-auto w-full animate-fade-in pb-20">
      {/* 1. Header Overview Banner */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-secondary/15 flex items-center justify-center text-secondary flex-shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[26px]">straighten</span>
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface">
                Units &amp; Multi-Tier Pricing
              </h1>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                Manage standard &amp; custom units, sub-units conversions, and wholesale/retail pricing tiers
              </p>
            </div>
          </div>

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">settings</span>
              <span>Inventory Settings</span>
            </button>
          )}
        </div>

        {/* Quick KPI Stats Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-surface-container-low/70 rounded-xl p-3 border border-outline-variant/20 flex flex-col">
            <span className="text-[11px] font-semibold text-on-surface-variant">Units Registry</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black font-mono text-on-surface">{units.length}</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                ({activeUnitsCount} Active)
              </span>
            </div>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-3 border border-outline-variant/20 flex flex-col">
            <span className="text-[11px] font-semibold text-on-surface-variant">Catalog Products</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black font-mono text-on-surface">{items.length}</span>
              <span className="text-[10px] text-on-surface-variant font-medium">SKUs</span>
            </div>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-3 border border-outline-variant/20 flex flex-col">
            <span className="text-[11px] font-semibold text-on-surface-variant">Multi-Tier Rates</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black font-mono text-secondary">{multiTierCount}</span>
              <span className="text-[10px] text-on-surface-variant font-medium">Configured</span>
            </div>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-3 border border-outline-variant/20 flex flex-col">
            <span className="text-[11px] font-semibold text-on-surface-variant">Sub-Units (Conversions)</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black font-mono text-primary">{subUnitCount}</span>
              <span className="text-[10px] text-on-surface-variant font-medium">Items</span>
            </div>
          </div>
        </div>

        {/* Section Navigation Tabs (Segmented Control) */}
        <div className="flex items-center gap-1.5 bg-surface-container p-1 rounded-xl border border-outline-variant/20 w-fit">
          <button
            type="button"
            onClick={() => setActiveSectionTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSectionTab === 'ALL'
                ? 'bg-surface text-on-surface shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            All Sections
          </button>
          <button
            type="button"
            onClick={() => setActiveSectionTab('UNITS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeSectionTab === 'UNITS'
                ? 'bg-surface text-on-surface shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>Units of Measurement</span>
            <span className="px-1.5 py-0.2 rounded-full bg-secondary/15 text-secondary text-[10px]">
              {units.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSectionTab('TIERS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeSectionTab === 'TIERS'
                ? 'bg-surface text-on-surface shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>Multi-Tier Pricing</span>
            <span className="px-1.5 py-0.2 rounded-full bg-secondary/15 text-secondary text-[10px]">
              {multiTierCount}
            </span>
          </button>
        </div>
      </section>

      {/* 2. Section A: Units of Measurement Management */}
      {(activeSectionTab === 'ALL' || activeSectionTab === 'UNITS') && (
        <UnitsManagementCard />
      )}

      {/* 3. Section B: Multi-Tier Pricing Catalog */}
      {(activeSectionTab === 'ALL' || activeSectionTab === 'TIERS') && (
        <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-outline-variant/20 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">price_change</span>
              </div>
              <div>
                <h3 className="font-label-md text-sm font-bold text-on-surface">Multi-Tier Pricing Catalog</h3>
                <p className="font-body-sm text-[11px] text-on-surface-variant">
                  Retail, Semi-Wholesale &amp; Wholesale rates with default billing tiers per product
                </p>
              </div>
            </div>

            <span className="self-start sm:self-auto px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
              {filteredItems.length} of {items.length} Items
            </span>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items by name, SKU, category, or HSN..."
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-secondary transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Filter Controls */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {/* Tier Filter Pills */}
              <div className="inline-flex rounded-xl bg-surface-container p-0.5 text-xs font-semibold shrink-0">
                <button
                  type="button"
                  onClick={() => setTierFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tierFilter === 'ALL'
                      ? 'bg-surface text-on-surface shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  All ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTierFilter('MULTI_TIER')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tierFilter === 'MULTI_TIER'
                      ? 'bg-surface text-on-surface shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  With Tiers ({multiTierCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTierFilter('RETAIL_ONLY')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tierFilter === 'RETAIL_ONLY'
                      ? 'bg-surface text-on-surface shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Retail Only ({retailOnlyCount})
                </button>
              </div>

              {/* Category Dropdown (if multiple categories exist) */}
              {categories.length > 0 && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-9 px-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold text-on-surface focus:outline-none focus:border-secondary shrink-0"
                >
                  <option value="ALL">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Items List */}
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center rounded-xl bg-surface-container-low/40 border border-outline-variant/20 text-on-surface-variant">
              <span className="material-symbols-outlined text-[36px] text-outline mb-2">inventory_2</span>
              <p className="text-sm font-bold text-on-surface">No products match your search or filter</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Try adjusting your search query or reset the filter pills above
              </p>
              {(searchQuery || tierFilter !== 'ALL' || selectedCategory !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setTierFilter('ALL');
                    setSelectedCategory('ALL');
                  }}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-secondary/15 text-secondary text-xs font-bold hover:bg-secondary/25 transition-colors cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filteredItems.map((item) => {
                const hasTiers =
                  (item.semiWholesalePrice !== undefined && item.semiWholesalePrice > 0) ||
                  (item.wholesalePrice !== undefined && item.wholesalePrice > 0);
                const hasSubUnit = item.subUnit && item.subUnitFactor && item.subUnitFactor > 0;
                const disabled = isItemDisabled(item);

                return (
                  <div
                    key={item.id}
                    className={`p-3 sm:p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 hover:bg-surface-container-low transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      disabled ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Left: Product Meta & Units */}
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-on-surface truncate">
                          {item.name}
                        </span>
                        {item.category && (
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[10px] font-semibold">
                            {item.category}
                          </span>
                        )}
                        {disabled && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-error-container/40 text-on-error-container">
                            Disabled
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-xs text-on-surface-variant">
                        <span className="font-mono">
                          Unit: <strong className="text-on-surface">{item.unit}</strong>
                        </span>
                        {hasSubUnit && (
                          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium font-mono">
                            1 {item.unit} = {item.subUnitFactor} {item.subUnit}
                          </span>
                        )}
                        {item.sku && (
                          <span className="text-[11px] font-mono text-outline">
                            SKU: {item.sku}
                          </span>
                        )}
                      </div>

                      {/* Tier Bar (styled matching ItemDetailSheet) */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 px-2.5 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-xs">
                        <span className="text-[10px] text-outline font-bold uppercase tracking-wider">
                          Price Tiers:
                        </span>
                        <span className="font-mono text-on-surface">
                          Retail: <strong className="text-secondary">{formatINR(item.salePrice)}</strong>
                        </span>
                        <span className="font-mono text-on-surface">
                          Semi-Wholesale:{' '}
                          <strong className={item.semiWholesalePrice ? 'text-secondary' : 'text-outline'}>
                            {item.semiWholesalePrice ? formatINR(item.semiWholesalePrice) : '—'}
                          </strong>
                        </span>
                        <span className="font-mono text-on-surface">
                          Wholesale:{' '}
                          <strong className={item.wholesalePrice ? 'text-secondary' : 'text-outline'}>
                            {item.wholesalePrice ? formatINR(item.wholesalePrice) : '—'}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Right: Default Tier Badge & Edit Action */}
                    <div className="flex items-center gap-2.5 flex-shrink-0 self-end sm:self-center">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-on-surface-variant font-medium">
                          Default Tier
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            item.defaultPriceTier === 'WHOLESALE'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : item.defaultPriceTier === 'SEMI_WHOLESALE'
                              ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                              : 'bg-surface-container-high text-on-surface'
                          }`}
                        >
                          {formatPriceTier(item.defaultPriceTier)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleEditItem(item)}
                        aria-label={`Edit Tiers for ${item.name}`}
                        className="px-3 py-1.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-xs active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[16px]">tune</span>
                        <span>Edit Tiers</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 4. Edit Item Modal (reuses ItemFormModal) */}
      {isModalOpen && (
        <ItemFormModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          editingItem={editingItem}
          onSaveItem={handleModalSave}
          isGstActive={isGstActive}
          existingItems={items}
        />
      )}
    </div>
  );
};

export default UnitsPricingView;
