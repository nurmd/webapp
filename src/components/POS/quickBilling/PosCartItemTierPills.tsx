import React from 'react';
import type { InventoryItem } from '../../../models/item.ts';

export interface PosCartItemTierPillsProps {
  item: InventoryItem;
  currentTier?: 'RETAIL' | 'SEMI_WHOLESALE' | 'WHOLESALE';
  onSelectTier: (itemId: string, tier: 'RETAIL' | 'SEMI_WHOLESALE' | 'WHOLESALE') => void;
}

export const PosCartItemTierPills: React.FC<PosCartItemTierPillsProps> = ({
  item,
  currentTier,
  onSelectTier,
}) => {
  const hasSemi = item.semiWholesalePrice !== undefined && item.semiWholesalePrice > 0;
  const hasWholesale = item.wholesalePrice !== undefined && item.wholesalePrice > 0;

  if (!hasSemi && !hasWholesale) return null;

  const activeTier = currentTier || 'RETAIL';

  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        type="button"
        onClick={() => onSelectTier(item.id, 'RETAIL')}
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
          activeTier === 'RETAIL'
            ? 'bg-secondary text-on-secondary shadow-xs'
            : 'bg-surface-container text-slate-700 border border-outline-variant/30 hover:bg-surface-container-high'
        }`}
      >
        Retail
      </button>
      <button
        type="button"
        disabled={!hasSemi}
        onClick={() => onSelectTier(item.id, 'SEMI_WHOLESALE')}
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
          activeTier === 'SEMI_WHOLESALE'
            ? 'bg-secondary text-on-secondary shadow-xs'
            : hasSemi
            ? 'bg-surface-container text-slate-700 border border-outline-variant/30 hover:bg-surface-container-high cursor-pointer'
            : 'bg-surface-container-lowest text-outline-variant border border-outline-variant/10 cursor-not-allowed opacity-50'
        }`}
      >
        Semi
      </button>
      <button
        type="button"
        disabled={!hasWholesale}
        onClick={() => onSelectTier(item.id, 'WHOLESALE')}
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
          activeTier === 'WHOLESALE'
            ? 'bg-secondary text-on-secondary shadow-xs'
            : hasWholesale
            ? 'bg-surface-container text-slate-700 border border-outline-variant/30 hover:bg-surface-container-high cursor-pointer'
            : 'bg-surface-container-lowest text-outline-variant border border-outline-variant/10 cursor-not-allowed opacity-50'
        }`}
      >
        Wholesale
      </button>
    </div>
  );
};
