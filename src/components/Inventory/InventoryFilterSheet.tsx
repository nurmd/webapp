import React from 'react';

export interface InventoryFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  totalItemsCount: number;
  filteredCount: number;
  disabledItemsCount: number;
  activeFilterCount: number;
  filterCategory: string;
  setFilterCategory: (cat: string) => void;
  filterStockStatus: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  setFilterStockStatus: (status: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK') => void;
  filterCreatedTimeframe: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';
  setFilterCreatedTimeframe: (tf: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH') => void;
  sortOption: 'DEFAULT' | 'NAME_ASC' | 'NAME_DESC' | 'STOCK_HIGH' | 'STOCK_LOW' | 'CREATED_DESC' | 'CREATED_ASC';
  setSortOption: (opt: 'DEFAULT' | 'NAME_ASC' | 'NAME_DESC' | 'STOCK_HIGH' | 'STOCK_LOW' | 'CREATED_DESC' | 'CREATED_ASC') => void;
  showDisabled: boolean;
  setShowDisabled: (show: boolean) => void;
  onResetFilters: () => void;
  categoryCounts?: Record<string, number>;
}

export const InventoryFilterSheet: React.FC<InventoryFilterSheetProps> = ({
  isOpen,
  onClose,
  categories,
  totalItemsCount,
  filteredCount,
  disabledItemsCount,
  activeFilterCount,
  filterCategory,
  setFilterCategory,
  filterStockStatus,
  setFilterStockStatus,
  filterCreatedTimeframe,
  setFilterCreatedTimeframe,
  sortOption,
  setSortOption,
  showDisabled,
  setShowDisabled,
  onResetFilters,
  categoryCounts,
}) => {
  if (!isOpen) return null;

  return (
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
                onClick={onResetFilters}
                className="text-xs font-semibold text-error hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
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
            <option value="ALL">All Categories ({totalItemsCount})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c} {categoryCounts && categoryCounts[c] !== undefined ? `(${categoryCounts[c]})` : ''}
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
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm active:scale-98 transition-transform cursor-pointer mt-1"
        >
          Apply Filter ({filteredCount} Items)
        </button>
      </div>
    </div>
  );
};
