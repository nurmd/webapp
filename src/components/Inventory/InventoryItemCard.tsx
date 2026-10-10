import React from 'react';
import { InventoryItem, isItemDisabled } from '../../models/item.ts';
import { formatINR } from '../../core/utils/formatters.ts';

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
            onClick={onToggleBuyPrice}
            className="inline-flex items-center justify-end gap-1 cursor-pointer hover:opacity-80 active:scale-95 transition-all text-right ml-auto bg-transparent border-0 p-0"
            title={isBuyPriceVisible ? 'Click to hide purchase price' : 'Click to view purchase price'}
          >
            <span className="text-outline text-[10px] font-label-sm uppercase font-semibold">Buy:</span>
            <span className="font-tabular-data text-xs font-semibold text-on-surface-variant font-mono tracking-wider">
              {isBuyPriceVisible ? formatINR(item.purchasePrice) : '***'}
            </span>
            <span className="material-symbols-outlined text-[14px] text-outline ml-0.5">
              {isBuyPriceVisible ? 'visibility' : 'visibility_off'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
