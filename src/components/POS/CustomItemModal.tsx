import React, { useState } from 'react';
import { InventoryItem, UnitOfMeasurement } from '../../models/item.ts';

interface CustomItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCustomItem: (item: InventoryItem, qty: number) => void;
}

export const CustomItemModal: React.FC<CustomItemModalProps> = ({
  isOpen,
  onClose,
  onAddCustomItem,
}) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [gstRate, setGstRate] = useState<number>(18);
  const [hsnCode, setHsnCode] = useState('998313');
  const [unit, setUnit] = useState<UnitOfMeasurement>('PCS');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(price);
    const parsedQty = !qty.trim() ? 1 : parseFloat(qty);
    if (!name.trim() || isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedQty) || parsedQty <= 0) {
      return;
    }

    const newItem: InventoryItem = {
      id: `ADHOC-${Date.now()}`,
      name: name.trim(),
      hsnSacCode: hsnCode.trim() || '9983',
      unit,
      salePrice: parsedPrice,
      purchasePrice: 0,
      gstRate,
      currentStock: 9999,
      minStockAlert: 0,
      category: 'Custom / Service',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onAddCustomItem(newItem, parsedQty);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">add_box</span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              Add Custom / Ad-Hoc Item
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-outline mb-1">
              Item / Service Description *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Gift Wrapping / Plastic Bag / Miscellaneous"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-outline mb-1">
                Unit Sale Price (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-sm font-bold text-on-surface outline-none focus:border-secondary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-outline mb-1">
                Quantity <span className="text-[10px] text-outline font-normal">(defaults to 1)</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="1"
                value={qty}
                onChange={(e) => {
                  const sanitized = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = sanitized.split('.');
                  const cleanVal = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
                  setQty(cleanVal);
                }}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-sm font-bold text-on-surface outline-none focus:border-secondary font-tabular-data"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-outline mb-1">GST Tax Slab</label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-2.5 py-2 text-xs font-semibold text-on-surface outline-none focus:border-secondary"
              >
                <option value={0}>0% (Exempt / Nil)</option>
                <option value={0.1}>0.1% GST</option>
                <option value={0.25}>0.25% GST</option>
                <option value={3}>3% GST (Gold/Precious)</option>
                <option value={5}>5% GST</option>
                <option value={12}>12% GST</option>
                <option value={18}>18% GST (Standard)</option>
                <option value={28}>28% GST</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-outline mb-1">Unit of Measure</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitOfMeasurement)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-2.5 py-2 text-xs font-semibold text-on-surface outline-none focus:border-secondary"
              >
                <option value="PCS">PCS (Pieces)</option>
                <option value="NOS">NOS (Numbers)</option>
                <option value="KG">KG (Kilograms)</option>
                <option value="BOX">BOX (Boxes)</option>
                <option value="PKT">PKT (Packets)</option>
                <option value="LTR">LTR (Litres)</option>
                <option value="MTR">MTR (Metres)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-outline mb-1">
              HSN / SAC Code (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. 9983 for services"
              value={hsnCode}
              onChange={(e) => setHsnCode(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-outline hover:bg-surface-container cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-secondary text-on-secondary shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer"
            >
              Add to Bill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
