import React from 'react';
import { InventoryItem, isItemDisabled } from '../../models/item.ts';
import { formatINR, formatQuantity } from '../../core/utils/formatters.ts';

export interface InventoryItemCardProps {
  item: InventoryItem;
  isBuyPriceVisible: boolean;
  onToggleBuyPrice: (e: React.MouseEvent) => void;
  onClick: () => void;
}

export const InventoryItemCard: React.FC<InventoryItemCardProps> = ({
  item,
  isBuyPriceVisible,
  onToggleBuyPrice,
  onClick,
}) => {
  const itemDisabled = isItemDisabled(item);
  const isLow = item.currentStock <= item.minStockAlert && item.currentStock > 0;
  const isOut = item.currentStock <= 0;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Select ${item.name}`}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
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
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 whitespace-nowrap shadow-2xs ${
              isOut
                ? 'bg-error/15 text-error border border-error/30'
                : isLow
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOut
                  ? 'bg-error'
                  : isLow
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-emerald-600 dark:bg-emerald-400'
              }`}
            />
            <span>
              {isOut
                ? 'Out of stock'
                : isLow
                ? `${formatQuantity(item.currentStock, 4)} ${item.unit} left`
                : `${formatQuantity(item.currentStock, 4)} ${item.unit}`}
            </span>
          </span>
        </div>

        {/* Bottom Row: Pricing (Sale left, Buy justified right) */}
        <div className="flex items-center justify-between gap-2 mt-1.5 text-xs">
          {/* Sale Price */}
          <div className="inline-flex items-baseline gap-1.5">
            <span className="text-[10px] font-extrabold uppercase text-on-surface-variant tracking-wider">Sale:</span>
            <span className="font-headline-sm text-xs sm:text-sm font-extrabold text-on-surface">
              {formatINR(item.salePrice)}
            </span>
          </div>

          {/* Buy Price (Right-justified with click-to-reveal) */}
          <button
            type="button"
            onClick={onToggleBuyPrice}
            className="inline-flex items-center justify-end gap-1.5 cursor-pointer hover:opacity-85 active:scale-95 transition-all text-right ml-auto bg-surface-container-low px-2 py-0.5 rounded-md border border-outline-variant/30"
            title={isBuyPriceVisible ? 'Click to hide purchase price' : 'Click to view purchase price'}
          >
            <span className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">Buy:</span>
            <span className="font-tabular-data text-xs font-bold text-on-surface font-mono tracking-wider">
              {isBuyPriceVisible ? formatINR(item.purchasePrice) : '•••'}
            </span>
            <span className="material-symbols-outlined text-[13px] text-on-surface-variant ml-0.5">
              {isBuyPriceVisible ? 'visibility' : 'visibility_off'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
