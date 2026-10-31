import React, { useState, useMemo } from 'react';
import { db } from '../../services/db.ts';
import { ItemCategory } from '../../models/category.ts';
import { CategoryManagementModal } from './modals/CategoryManagementModal.tsx';

export interface ItemSettingsTabProps {
  allowNegativeStock: boolean;
  onToggleNegativeStock: (enabled: boolean) => void;
  showBuyPricesGlobally: boolean;
  onToggleBuyPrices: (enabled: boolean) => void;
  onOpenCategoryManager?: () => void;
}

export const ItemSettingsTab: React.FC<ItemSettingsTabProps> = ({
  allowNegativeStock,
  onToggleNegativeStock,
  showBuyPricesGlobally,
  onToggleBuyPrices,
  onOpenCategoryManager,
}) => {
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categories, setCategories] = useState<ItemCategory[]>(() => db.getCategories());

  const items = useMemo(() => db.getItems(), []);
  const itemCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      const c = item.category?.trim() || 'General';
      map[c] = (map[c] || 0) + 1;
    }
    return map;
  }, [items]);

  const handleOpenCategories = () => {
    if (onOpenCategoryManager) {
      onOpenCategoryManager();
    } else {
      setIsCategoryModalOpen(true);
    }
  };

  const handleCategoriesUpdated = () => {
    setCategories(db.getCategories());
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Header Overview Banner */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3 relative overflow-hidden">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-secondary/15 flex items-center justify-center text-secondary flex-shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[26px]">inventory_2</span>
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface">
              Items &amp; Inventory Settings
            </h2>
            <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
              Configure stock decrement constraints, item categories, and purchase cost privacy
            </p>
          </div>
        </div>
      </section>

      {/* 2. Item Categories & Hierarchy Management Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">category</span>
            </div>
            <div>
              <h3 className="font-label-md text-sm font-bold text-on-surface">Item Categories &amp; Hierarchy</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                Manage product groups, default GST rates, and HSN codes
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
            {categories.length} Categories
          </span>
        </div>

        {/* Quick Categories Overview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
          {categories.slice(0, 6).map((cat) => {
            const count = itemCounts[cat.name] || 0;
            const color = cat.color || '#64748b';
            const icon = cat.icon || 'category';

            return (
              <div
                key={cat.id}
                className="bg-surface-container-low/70 rounded-xl p-2.5 flex items-center justify-between border border-outline-variant/20 hover:border-outline-variant/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    <span className="material-symbols-outlined text-[16px]">{icon}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-on-surface truncate block">
                      {cat.name}
                    </span>
                    <span className="text-[10px] text-on-surface-variant font-mono">
                      {cat.defaultGstRate !== undefined ? `GST ${cat.defaultGstRate}%` : 'Standard'}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container font-semibold text-on-surface-variant flex-shrink-0">
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleOpenCategories}
            className="flex-1 py-2 px-3 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">tune</span>
            <span>Configure &amp; Manage Categories ({categories.length})</span>
          </button>
        </div>
      </section>

      {/* 3. Negative Stock Constraint Policy Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              allowNegativeStock ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-surface-container text-on-surface'
            }`}>
              <span className="material-symbols-outlined text-[22px]">production_quantity_limits</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                <span className="font-label-md text-sm font-bold text-on-surface whitespace-nowrap shrink-0">
                  Allow Negative Stock
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 ${
                  allowNegativeStock
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}>
                  {allowNegativeStock ? 'Negative Stock Allowed' : 'Clamped to Zero'}
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant mt-1 leading-relaxed">
                {allowNegativeStock
                  ? 'Active: Selling items with zero or insufficient inventory drives stock into negative balances (e.g. -5 PCS) until restocked via purchase bills.'
                  : 'Disabled: Enforce strict non-negative stock constraint. Stock is clamped to 0 and blocked from dropping into negative balance.'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
            <input
              type="checkbox"
              checked={allowNegativeStock}
              onChange={(e) => onToggleNegativeStock(e.target.checked)}
              className="sr-only peer"
              aria-label="Toggle Allow Negative Stock"
            />
            <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
          </label>
        </div>

        {/* Informational Guidance Box */}
        <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
          allowNegativeStock
            ? 'bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-200'
            : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant'
        }`}>
          <span className="material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5">
            {allowNegativeStock ? 'info' : 'verified_user'}
          </span>
          <div className="leading-relaxed">
            {allowNegativeStock ? (
              <span>
                <strong>Wholesale &amp; High-Frequency Retail:</strong> You can punch sales bills without waiting for inward purchase invoices to be entered. When you later enter purchase bills, stock balances automatically reconcile upward.
              </span>
            ) : (
              <span>
                <strong>Strict Physical Inventory:</strong> Prevents issuing bills for out-of-stock items, ensuring your stock valuation never drops into negative numbers.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 4. Cost & Valuation Privacy Mode Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">
                {showBuyPricesGlobally ? 'visibility' : 'visibility_off'}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-label-md text-sm font-bold text-on-surface">
                  Show Buy / Purchase Prices
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-high text-on-surface-variant">
                  Device Only
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant mt-1 leading-relaxed">
                {showBuyPricesGlobally
                  ? 'Visible: Purchase rates, margin percentages, and inventory valuation are shown on this device.'
                  : 'Hidden (***): Purchase rates are masked to protect profit margins and confidentiality on counter-facing screens.'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
            <input
              type="checkbox"
              checked={showBuyPricesGlobally}
              onChange={(e) => onToggleBuyPrices(e.target.checked)}
              className="sr-only peer"
              aria-label="Toggle Buy Price Visibility"
            />
            <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
          </label>
        </div>
      </section>

      {/* 5. Stock Engine Operational Invariants Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <h3 className="font-label-md text-xs font-bold uppercase tracking-wider text-outline">
          Automated Stock Accounting Rules
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-surface-container-low flex items-start gap-2.5">
            <span className="material-symbols-outlined text-secondary text-[18px] flex-shrink-0 mt-0.5">point_of_sale</span>
            <div>
              <div className="font-bold text-on-surface">Sales Invoices &amp; POS</div>
              <div className="text-on-surface-variant text-[11px] mt-0.5">
                Automatically decrements catalog stock. Deleting or cancelling a bill restores original stock.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low flex items-start gap-2.5">
            <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0 mt-0.5">shopping_bag</span>
            <div>
              <div className="font-bold text-on-surface">Purchase Bills</div>
              <div className="text-on-surface-variant text-[11px] mt-0.5">
                Increments catalog stock and updates purchase unit price automatically.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low flex items-start gap-2.5">
            <span className="material-symbols-outlined text-secondary text-[18px] flex-shrink-0 mt-0.5">tune</span>
            <div>
              <div className="font-bold text-on-surface">Stock Adjustments</div>
              <div className="text-on-surface-variant text-[11px] mt-0.5">
                Physical counts, wastage, damages, and manual additions update stock with full MCA audit records.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low flex items-start gap-2.5">
            <span className="material-symbols-outlined text-amber-600 text-[18px] flex-shrink-0 mt-0.5">notification_important</span>
            <div>
              <div className="font-bold text-on-surface">Low Stock Alerts</div>
              <div className="text-on-surface-variant text-[11px] mt-0.5">
                Triggers warning badge and restock filter when stock falls below min-stock alert threshold.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Management Modal */}
      <CategoryManagementModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onCategoriesUpdated={handleCategoriesUpdated}
      />
    </div>
  );
};
