import React, { useState, useEffect } from 'react';
import { InventoryItem, StockAdjustment } from '../../models/item.ts';

export interface StockAdjustmentModalProps {
  isOpen: boolean;
  item: InventoryItem | null;
  onClose: () => void;
  onSaveAdjustment: (adj: StockAdjustment) => void;
  defaultType?: 'STOCK_IN' | 'STOCK_OUT';
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  item,
  onClose,
  onSaveAdjustment,
  defaultType = 'STOCK_IN',
}) => {
  const [adjType, setAdjType] = useState<'STOCK_IN' | 'STOCK_OUT'>(defaultType);
  const [adjQty, setAdjQty] = useState<number | ''>(1);
  const [adjReason, setAdjReason] = useState('New inventory arrival');

  useEffect(() => {
    if (defaultType) {
      setAdjType(defaultType);
    }
    setAdjQty(1);
    setAdjReason('New inventory arrival');
  }, [item, defaultType, isOpen]);

  if (!isOpen || !item) return null;

  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = typeof adjQty === 'number' ? adjQty : parseFloat(adjQty as string);
    if (!item || isNaN(qty) || qty <= 0) return;

    const adj: StockAdjustment = {
      id: 'ADJ-' + Date.now(),
      itemId: item.id,
      itemName: item.name,
      type: adjType,
      quantity: qty,
      reason: adjReason.trim() || (adjType === 'STOCK_IN' ? 'Stock In Addition' : 'Stock Out Reduction'),
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };

    onSaveAdjustment(adj);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl p-5 w-full max-w-sm shadow-xl border border-outline-variant/30 flex flex-col gap-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <h3 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface">
            Adjust Stock: {item.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
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
            <div className="flex items-center justify-between mb-1">
              <label className="block font-label-sm text-xs font-semibold text-on-surface">
                Quantity ({item.unit})
              </label>
              {adjQty !== '' && (
                <button
                  type="button"
                  onClick={() => setAdjQty('')}
                  className="text-[11px] text-secondary hover:underline font-semibold cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                type="number"
                min="0.001"
                step="any"
                required
                placeholder="Enter quantity"
                value={adjQty}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setAdjQty('');
                  } else {
                    const parsed = parseFloat(val);
                    setAdjQty(isNaN(parsed) ? '' : parsed);
                  }
                }}
                className="w-full h-11 px-3 pr-8 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-base font-bold focus:outline-none focus:border-secondary"
              />
              {adjQty !== '' && (
                <button
                  type="button"
                  onClick={() => setAdjQty('')}
                  className="absolute right-2 w-6 h-6 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
                  title="Clear quantity"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>

            {/* Quick Add Chips */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] text-outline font-semibold">Quick add:</span>
              {[1, 5, 10, 25, 50].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setAdjQty((prev) => (Number(prev) || 0) + step)}
                  className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface text-xs font-semibold hover:bg-secondary/15 hover:text-secondary active:scale-95 transition-all cursor-pointer"
                >
                  +{step}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-label-sm text-xs font-semibold text-on-surface mb-1">
              Reason / Note
            </label>
            <input
              type="text"
              value={adjReason}
              placeholder="e.g. New inventory arrival, physical audit correction"
              onChange={(e) => setAdjReason(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adjQty === '' || Number(adjQty) <= 0}
              className={`px-5 py-2 rounded-full font-label-md text-xs font-bold shadow-sm transition-all ${
                adjQty === '' || Number(adjQty) <= 0
                  ? 'bg-surface-container text-outline cursor-not-allowed opacity-60'
                  : 'bg-secondary text-on-secondary cursor-pointer active:scale-95'
              }`}
            >
              Apply Stock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
