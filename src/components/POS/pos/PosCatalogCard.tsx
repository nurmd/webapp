import React from 'react';
import { InventoryItem } from '../../../models/item.ts';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface PosCatalogCardProps {
  item: InventoryItem;
  inCartQty: number;
  isGstActive: boolean;
  onAdd: () => void;
}

export const PosCatalogGridCard: React.FC<PosCatalogCardProps> = ({
  item,
  inCartQty,
  isGstActive,
  onAdd,
}) => {
  const isLowStock = (item.currentStock || 0) <= (item.minStockAlert || 0);

  return (
    <div
      data-testid={`pos-item-${item.id}`}
      onClick={onAdd}
      className={`bg-surface-container-lowest rounded-xl p-3 shadow-sm border transition-all cursor-pointer flex flex-col justify-between select-none relative group ${
        inCartQty > 0
          ? 'border-secondary ring-1 ring-secondary/50 bg-secondary-container/5'
          : 'border-outline-variant/30 hover:border-secondary'
      }`}
    >
      {/* Top line with Stock Badge and GST Rate */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span
          className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
            isLowStock
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          Stock: {item.currentStock}
        </span>

        {isGstActive && item.gstRate > 0 && (
          <span className="text-[10px] bg-secondary-container/40 text-on-secondary-container px-1 rounded font-bold font-mono">
            {item.gstRate}%
          </span>
        )}
      </div>

      {/* Item Details (Clean, NO HSN) */}
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-secondary transition-colors">
          {item.name}
        </p>
        <p className="text-[11px] text-slate-500 truncate mt-0.5">
          {item.category || 'General'}
        </p>
      </div>

      {/* Price and Add Action */}
      <div className="mt-2.5 pt-2 border-t border-outline-variant/30 flex items-center justify-between">
        <div className="flex items-baseline gap-0.5">
          <span className="text-xs sm:text-sm font-black text-slate-900 font-tabular-data">
            {formatINR(item.salePrice)}
          </span>
          <span className="text-[10px] text-slate-500">/{item.unit.toLowerCase()}</span>
        </div>

        {inCartQty > 0 ? (
          <span className="h-6 px-2 bg-secondary text-on-secondary rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-sm">
            <span>{inCartQty}</span>
          </span>
        ) : (
          <span className="w-6 h-6 bg-slate-100 group-hover:bg-secondary group-hover:text-on-secondary rounded-lg text-slate-600 flex items-center justify-center transition-colors border border-outline-variant/30">
            <span className="material-symbols-outlined text-[15px]">add</span>
          </span>
        )}
      </div>
    </div>
  );
};

export const PosCatalogListRow: React.FC<PosCatalogCardProps> = ({
  item,
  inCartQty,
  isGstActive,
  onAdd,
}) => {
  return (
    <div
      onClick={onAdd}
      className={`p-2.5 flex items-center justify-between gap-3 hover:bg-surface-container-low transition-colors cursor-pointer select-none ${
        inCartQty > 0 ? 'bg-secondary-container/10' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-900 truncate">
            {item.name}
          </span>
          {isGstActive && item.gstRate > 0 && (
            <span className="text-[10px] bg-secondary-container/40 text-on-secondary-container px-1 rounded font-bold font-mono">
              {item.gstRate}%
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
          <span>{item.category || 'General'}</span>
          <span>•</span>
          <span>Stock: {item.currentStock} {item.unit}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <div className="text-xs font-bold text-slate-900 font-tabular-data">
            {formatINR(item.salePrice)}
          </div>
          <div className="text-[10px] text-slate-500">/{item.unit.toLowerCase()}</div>
        </div>

        <button
          type="button"
          className={`h-7 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer ${
            inCartQty > 0
              ? 'bg-secondary text-on-secondary'
              : 'bg-surface-container text-slate-700 hover:bg-surface-container-high border border-outline-variant/30'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {inCartQty > 0 ? 'check' : 'add'}
          </span>
          <span>{inCartQty > 0 ? inCartQty : 'Add'}</span>
        </button>
      </div>
    </div>
  );
};
