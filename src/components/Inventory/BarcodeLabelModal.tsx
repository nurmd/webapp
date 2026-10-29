import React, { useState, useMemo } from 'react';
import { InventoryItem } from '../../models/item.ts';
import { CompanyProfile } from '../../models/company.ts';
import { generateCode128SvgString } from '../../core/utils/barcode128.ts';
import { generateQrCodeSvgString } from '../../core/utils/qrCodeSvg.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { showAppToast } from '../../services/toast.ts';
import { printCurrentPage } from '../../core/utils/printBridge.ts';

export type LabelLayout = 'THERMAL_50x25' | 'THERMAL_38x25' | 'A4_24UP' | 'A4_30UP';

export interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  company: CompanyProfile;
  initialSelectedItem?: InventoryItem;
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  items,
  company,
  initialSelectedItem,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 32);

  // Selected item ID: either initial or first active item
  const [selectedItemId, setSelectedItemId] = useState<string>(
    initialSelectedItem?.id || (items.length > 0 ? items[0].id : '')
  );

  const [quantity, setQuantity] = useState<number>(10);
  const [layout, setLayout] = useState<LabelLayout>('THERMAL_50x25');
  const [barcodeType, setBarcodeType] = useState<'CODE128' | 'QR'>('CODE128');
  const [showBusinessName, setShowBusinessName] = useState<boolean>(true);
  const [showItemName, setShowItemName] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showHsn, setShowHsn] = useState<boolean>(true);

  const activeItem = useMemo(() => {
    return items.find((i) => i.id === selectedItemId) || items[0] || null;
  }, [items, selectedItemId]);

  // Code to encode: item barcode, or SKU, or fallback to auto-formatted item ID
  const codeValue = useMemo(() => {
    if (!activeItem) return '000000';
    return (
      activeItem.barcode?.trim() ||
      activeItem.sku?.trim() ||
      `ITEM-${activeItem.id.replace(/\D/g, '').slice(-6) || '100001'}`
    );
  }, [activeItem]);

  // Pre-render SVG barcode / QR
  const barcodeSvg = useMemo(() => {
    if (barcodeType === 'QR') {
      return generateQrCodeSvgString(codeValue, {
        size: 64,
        margin: 1,
      });
    }
    return generateCode128SvgString(codeValue, {
      height: 32,
      barWidth: 1.2,
      includeText: true,
      fontSize: 9,
    });
  }, [codeValue, barcodeType]);

  if (!isOpen) return null;

  const handlePrint = () => {
    const isA4 = layout === 'A4_24UP' || layout === 'A4_30UP';
    printCurrentPage('Barcode-Labels', isA4 ? 'A4' : 'default');
  };

  const businessName = company.tradeName || company.businessName || 'Store';
  const priceDisplay = activeItem
    ? activeItem.mrp && activeItem.mrp > activeItem.salePrice
      ? `MRP: ₹${activeItem.mrp.toFixed(2)}`
      : `₹${activeItem.salePrice.toFixed(2)}`
    : '₹0.00';

  // Total label count based on selected quantity
  const labelCount = Math.max(1, Math.min(quantity, 200));
  const labelArray = Array.from({ length: labelCount });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-2 sm:p-4 animate-fade-in print-modal-overlay">
      {/* Main Modal Shell */}
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-4xl h-[92vh] flex flex-col shadow-2xl border border-outline-variant/30 overflow-hidden print-modal-container">
        {/* Sticky Header */}
        <div className="p-3 sm:p-4 border-b border-outline-variant/20 bg-surface-container-low flex items-center justify-between gap-2 shrink-0 no-print">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer transition-colors shrink-0"
              title="Close"
              aria-label="Close barcode label modal"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-on-surface truncate flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[20px]">barcode_scanner</span>
                <span>Barcode &amp; QR Label Sticker Designer</span>
              </h2>
              <p className="text-[11px] text-on-surface-variant truncate">
                Generate high-resolution thermal rolls (50x25mm, 38x25mm) and A4 laser sticker sheets
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all hover:bg-secondary/90 shrink-0"
            title="Print Sticker Labels"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Print ({labelCount} Labels)</span>
          </button>
        </div>

        {/* Content Body: Split into Settings Panel (left) & Live Print Canvas (right) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Controls Panel */}
          <div className="w-full md:w-80 p-3.5 sm:p-4 border-b md:border-b-0 md:border-r border-outline-variant/20 bg-surface-container-lowest overflow-y-auto space-y-4 no-print shrink-0">
            {/* Item Selection */}
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                Select Item
              </label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl px-2.5 py-2 text-xs font-medium text-on-surface focus:outline-secondary"
              >
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({formatINR(i.salePrice)})
                  </option>
                ))}
              </select>
            </div>

            {/* Label Quantity */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                  Quantity of Stickers
                </label>
                {activeItem && activeItem.currentStock > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.min(Math.max(1, Math.round(activeItem.currentStock)), 200))}
                    className="text-[10px] font-bold text-secondary hover:underline cursor-pointer"
                  >
                    Set to Stock ({Math.round(activeItem.currentStock)})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1)))}
                  className="w-full bg-surface border border-outline-variant/40 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-on-surface focus:outline-secondary"
                />
                <div className="flex gap-1">
                  {[1, 5, 24, 30].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQuantity(n)}
                      className="px-2 py-1 text-[11px] font-bold rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant cursor-pointer transition-colors"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Layout Preset */}
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                Paper / Sticker Layout
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'THERMAL_50x25', label: 'Thermal 50×25mm', desc: 'Standard 2" roll' },
                  { id: 'THERMAL_38x25', label: 'Thermal 38×25mm', desc: 'Compact roll' },
                  { id: 'A4_24UP', label: 'A4 24-Up Sheet', desc: '3×8 (70×37mm)' },
                  { id: 'A4_30UP', label: 'A4 30-Up Sheet', desc: '3×10 (70×29mm)' },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLayout(l.id as LabelLayout)}
                    className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                      layout === l.id
                        ? 'bg-secondary/10 border-secondary text-secondary font-bold'
                        : 'bg-surface border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="text-xs">{l.label}</div>
                    <div className="text-[10px] text-outline mt-0.5">{l.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Symbology Type */}
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                Symbology
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setBarcodeType('CODE128')}
                  className={`p-2 rounded-xl border text-center cursor-pointer transition-all text-xs font-bold ${
                    barcodeType === 'CODE128'
                      ? 'bg-secondary text-on-secondary border-secondary'
                      : 'bg-surface border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  1D Barcode (Code128)
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeType('QR')}
                  className={`p-2 rounded-xl border text-center cursor-pointer transition-all text-xs font-bold ${
                    barcodeType === 'QR'
                      ? 'bg-secondary text-on-secondary border-secondary'
                      : 'bg-surface border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  2D QR Code
                </button>
              </div>
            </div>

            {/* Display Toggles */}
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                Label Content Options
              </label>
              <div className="space-y-2 text-xs text-on-surface">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBusinessName}
                    onChange={(e) => setShowBusinessName(e.target.checked)}
                    className="accent-secondary w-4 h-4 rounded"
                  />
                  <span>Show Store / Business Name</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showItemName}
                    onChange={(e) => setShowItemName(e.target.checked)}
                    className="accent-secondary w-4 h-4 rounded"
                  />
                  <span>Show Item Description</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="accent-secondary w-4 h-4 rounded"
                  />
                  <span>Show Selling Price / MRP</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showHsn}
                    onChange={(e) => setShowHsn(e.target.checked)}
                    className="accent-secondary w-4 h-4 rounded"
                  />
                  <span>Show HSN / SAC Code</span>
                </label>
              </div>
            </div>
          </div>

          {/* Live Print Preview Canvas */}
          <div className="flex-1 bg-surface-container-high/40 p-4 sm:p-6 overflow-y-auto flex flex-col items-center">
            <div className="text-[11px] font-bold text-outline-variant uppercase tracking-wider mb-2 no-print">
              Preview Canvas ({labelCount} labels to print)
            </div>

            <div
              id="barcode-print-canvas"
              className={`bg-white shadow-xl rounded-xl p-4 sm:p-6 border border-neutral-300 flex flex-wrap gap-2 justify-center max-w-full ${
                layout === 'A4_24UP' || layout === 'A4_30UP' ? 'w-[210mm]' : 'w-auto'
              }`}
            >
              {labelArray.map((_, idx) => (
                <div
                  key={idx}
                  className={`barcode-label-card bg-white text-black flex flex-col items-center justify-between text-center overflow-hidden font-sans border border-neutral-300 ${
                    layout === 'THERMAL_50x25'
                      ? 'layout-thermal-50x25 w-[190px] h-[95px] p-1.5'
                      : layout === 'THERMAL_38x25'
                      ? 'layout-thermal-38x25 w-[145px] h-[95px] p-1'
                      : layout === 'A4_24UP'
                      ? 'layout-a4-24up w-[260px] h-[140px] p-2'
                      : 'layout-a4-30up w-[260px] h-[112px] p-1.5'
                  }`}
                >
                  {/* Business Name */}
                  {showBusinessName && (
                    <div className="font-extrabold text-[9px] uppercase tracking-wider truncate w-full text-neutral-900 leading-tight">
                      {businessName}
                    </div>
                  )}

                  {/* Item Name */}
                  {showItemName && activeItem && (
                    <div className="font-semibold text-[10px] truncate w-full text-neutral-800 leading-tight">
                      {activeItem.name}
                    </div>
                  )}

                  {/* Barcode or QR Image */}
                  <div
                    className="my-auto flex items-center justify-center max-w-full overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                  />

                  {/* Price & HSN Footer */}
                  <div className="flex items-center justify-between w-full px-1 text-[9px] font-bold text-neutral-900 border-t border-neutral-200 pt-0.5 mt-0.5 leading-none">
                    {showHsn && activeItem?.hsnSacCode ? (
                      <span className="font-mono text-[8px] text-neutral-600">
                        HSN: {activeItem.hsnSacCode}
                      </span>
                    ) : (
                      <span />
                    )}

                    {showPrice && (
                      <span className="text-[10px] font-black text-neutral-950">
                        {priceDisplay}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
