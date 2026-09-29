import React, { useState, useEffect } from 'react';
import { InventoryItem } from '../../models/item.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Invoice, InvoiceItemEntry } from '../../models/invoice.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { hardwareScanner, audioService } from '../../services/barcodeService.ts';
import { CameraBarcodeScannerModal } from '../Scanner/CameraBarcodeScannerModal.tsx';

interface QuickBillingViewProps {
  company: CompanyProfile;
  items: InventoryItem[];
  onCompleteSale: (invoice: Invoice) => void;
}

export const QuickBillingView: React.FC<QuickBillingViewProps> = ({
  company,
  items,
  onCompleteSale,
}) => {
  const [cart, setCart] = useState<Array<{ item: InventoryItem; qty: number }>>([]);
  const [search, setSearch] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const handleBarcodeScanned = (barcode: string) => {
    const clean = barcode.trim();
    const found = items.find(
      (i) =>
        i.barcode === clean ||
        i.sku?.toLowerCase() === clean.toLowerCase() ||
        i.id === clean ||
        i.name.toLowerCase() === clean.toLowerCase()
    );

    if (found) {
      addToCart(found);
      setScanMessage(`Added: ${found.name}`);
      setTimeout(() => setScanMessage(null), 2500);
    } else {
      audioService.playScanError();
      setScanMessage(`Item not found for barcode: ${clean}`);
      setTimeout(() => setScanMessage(null), 3000);
    }
  };

  useEffect(() => {
    // Listen for hardware USB/Bluetooth barcode scanner guns
    const unsub = hardwareScanner.subscribe((code) => {
      handleBarcodeScanned(code);
    });
    return unsub;
  }, [items]);

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode && i.barcode.includes(search)) ||
      (i.sku && i.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart = (item: InventoryItem) => {
    const existing = cart.find((c) => c.item.id === item.id);
    if (existing) {
      setCart(cart.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c)));
    } else {
      setCart([...cart, { item, qty: 1 }]);
    }
  };

  const updateQty = (itemId: string, delta: number) => {
    setCart(
      cart
        .map((c) => {
          if (c.item.id === itemId) {
            const newQty = c.qty + delta;
            return newQty > 0 ? { ...c, qty: newQty } : null;
          }
          return c;
        })
        .filter(Boolean) as Array<{ item: InventoryItem; qty: number }>
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter((c) => c.item.id !== itemId));
  };

  // Perform invoice calculation
  const calcInputs = cart.map((c) => ({
    quantity: c.qty,
    unitPrice: c.item.salePrice,
    gstRate: c.item.gstRate,
  }));

  const calcSummary = calculateInvoice(company.stateCode, company.stateCode, calcInputs);

  const handleCheckout = () => {
    if (cart.length === 0) return;

    const invoiceItems: InvoiceItemEntry[] = cart.map((c, idx) => {
      const itemCalc = calcSummary.items[idx];
      return {
        itemId: c.item.id,
        name: c.item.name,
        hsnSacCode: c.item.hsnSacCode,
        unit: c.item.unit,
        quantity: c.qty,
        unitPrice: c.item.salePrice,
        taxableAmount: itemCalc.taxableAmount,
        gstRate: c.item.gstRate,
        cgstAmount: itemCalc.cgstAmount,
        sgstAmount: itemCalc.sgstAmount,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: itemCalc.totalAmount,
      };
    });

    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNumber: `${company.invoicePrefix || 'POS-'}${Math.floor(1000 + Math.random() * 9000)}`,
      invoiceType: 'B2CS',
      date: new Date().toISOString().split('T')[0],
      partyName: customerPhone ? `Retail (${customerPhone})` : 'Walk-in Retail Customer',
      partyAddress: 'Local Retail Counter',
      partyStateCode: company.stateCode,
      placeOfSupplyStateCode: company.stateCode,
      isIntraState: true,
      items: invoiceItems,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: 0,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: calcSummary.totalCgst,
      totalSgst: calcSummary.totalSgst,
      totalIgst: 0,
      totalCess: 0,
      totalTax: calcSummary.totalTax,
      roundOff: calcSummary.roundOff,
      grandTotal: calcSummary.grandTotal,
      amountInWords: amountInWords(calcSummary.grandTotal),
      paymentMode,
      paymentStatus: 'PAID',
      paidAmount: calcSummary.grandTotal,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onCompleteSale(newInvoice);
    setCart([]);
    setCustomerPhone('');
  };

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 h-[calc(100vh-64px)] overflow-hidden bg-surface">
      {/* Left: Product Catalog & Search (7 cols) */}
      <div className="lg:col-span-7 flex flex-col p-4 border-r border-outline-variant/30 overflow-y-auto gap-3">
        {/* Search & Scan */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/40 px-3 py-2 shadow-sm">
            <span className="material-symbols-outlined text-outline text-[20px] mr-2">search</span>
            <input
              type="text"
              placeholder="Scan barcode or search product name / SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-on-surface placeholder:text-outline outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors flex-shrink-0 cursor-pointer"
            title="Scan barcode with camera"
          >
            <span className="material-symbols-outlined text-[20px] text-secondary">qr_code_scanner</span>
          </button>
        </div>

        {/* Scan Notification Banner */}
        {scanMessage && (
          <div className="bg-secondary text-on-secondary px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md animate-fade-in">
            <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
            <span>{scanMessage}</span>
          </div>
        )}

        {/* Product Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => addToCart(item)}
              className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 shadow-sm cursor-pointer hover:border-secondary transition-all active:scale-[0.98] flex flex-col justify-between"
            >
              <div>
                <div className="font-label-md text-[13px] font-bold text-on-surface line-clamp-2">
                  {item.name}
                </div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">
                  HSN: {item.hsnSacCode} · {item.gstRate}% GST
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-outline-variant/20">
                <span className="font-currency-display text-sm font-bold text-secondary">
                  {formatINR(item.salePrice)}
                </span>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    item.currentStock <= item.minStockAlert
                      ? 'bg-error-container/40 text-error'
                      : 'bg-secondary-container/40 text-on-secondary-container'
                  }`}
                >
                  {item.currentStock} {item.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Cart & Quick Checkout Counter (5 cols) */}
      <div className="lg:col-span-5 bg-surface-container-low flex flex-col h-full border-t lg:border-t-0">
        {/* Cart Header */}
        <div className="p-3.5 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-lowest">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">shopping_cart</span>
            <span className="font-label-md text-sm font-bold text-on-surface">
              POS Current Cart ({cart.reduce((s, c) => s + c.qty, 0)})
            </span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-xs text-error font-medium hover:underline"
            >
              Clear Cart
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {cart.length === 0 ? (
            <div className="h-full py-12 flex flex-col items-center justify-center text-on-surface-variant gap-2 text-center">
              <span className="material-symbols-outlined text-[44px] text-outline opacity-40">shopping_basket</span>
              <p className="text-sm font-medium">Cart is empty</p>
              <p className="text-xs text-outline">Tap products on the left or scan barcode to add</p>
            </div>
          ) : (
            cart.map((c) => (
              <div
                key={c.item.id}
                className="flex items-center justify-between p-2.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="font-label-md text-xs font-bold text-on-surface truncate">
                    {c.item.name}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">
                    {formatINR(c.item.salePrice)} × {c.qty} ({c.item.gstRate}% GST)
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-surface-container rounded-lg p-0.5 border border-outline-variant/30">
                    <button
                      onClick={() => updateQty(c.item.id, -1)}
                      className="w-6 h-6 flex items-center justify-center text-on-surface hover:bg-surface-container-high rounded"
                    >
                      <span className="material-symbols-outlined text-[14px]">remove</span>
                    </button>
                    <span className="font-tabular-data text-xs font-bold px-2 min-w-[20px] text-center">
                      {c.qty}
                    </span>
                    <button
                      onClick={() => updateQty(c.item.id, 1)}
                      className="w-6 h-6 flex items-center justify-center text-on-surface hover:bg-surface-container-high rounded"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                    </button>
                  </div>

                  <span className="font-tabular-data text-xs font-bold text-on-surface min-w-[65px] text-right">
                    {formatINR(c.item.salePrice * c.qty)}
                  </span>

                  <button
                    onClick={() => removeFromCart(c.item.id)}
                    className="text-outline hover:text-error transition-colors p-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Customer & Payment Mode */}
        <div className="p-3 border-t border-outline-variant/30 bg-surface-container-lowest flex flex-col gap-2">
          <input
            type="tel"
            placeholder="Customer Phone (Optional for WhatsApp Slip)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="w-full bg-surface border border-outline-variant/40 rounded-xl px-3 py-1.5 text-xs text-on-surface outline-none focus:border-secondary"
          />

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setPaymentMode('CASH')}
              className={`py-1.5 rounded-xl font-label-sm text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                paymentMode === 'CASH'
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              <span>Cash</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMode('UPI')}
              className={`py-1.5 rounded-xl font-label-sm text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                paymentMode === 'UPI'
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">qr_code</span>
              <span>UPI</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMode('CARD')}
              className={`py-1.5 rounded-xl font-label-sm text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                paymentMode === 'CARD'
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">credit_card</span>
              <span>Card</span>
            </button>
          </div>
        </div>

        {/* Checkout Summary Bar */}
        <div className="p-4 border-t border-outline-variant/30 bg-surface-container-lowest flex flex-col gap-2">
          <div className="flex justify-between text-xs text-on-surface-variant">
            <span>Taxable Amount:</span>
            <span className="font-tabular-data font-semibold text-on-surface">
              {formatINR(calcSummary.totalTaxableAmount)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-on-surface-variant">
            <span>GST Output (Intra {company.stateCode}):</span>
            <span className="font-tabular-data font-semibold text-on-surface">
              {formatINR(calcSummary.totalCgst + calcSummary.totalSgst)}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-outline-variant/30 pt-2 text-on-surface">
            <span className="font-headline-sm text-sm font-bold">Total Payable:</span>
            <span className="font-currency-display text-xl font-extrabold text-secondary">
              {formatINR(calcSummary.grandTotal)}
            </span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className={`w-full py-2.5 rounded-xl font-label-md text-sm font-bold shadow-md flex items-center justify-center gap-1.5 transition-all mt-1 ${
              cart.length === 0
                ? 'bg-outline-variant/50 text-outline cursor-not-allowed'
                : 'bg-secondary text-on-secondary hover:bg-secondary/90 active:scale-95 cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Charge & Print Receipt</span>
          </button>
        </div>
      </div>

      {/* Live Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </div>
  );
};
