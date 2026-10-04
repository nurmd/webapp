import React, { useState, useEffect } from 'react';
import { InventoryItem } from '../../models/item.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Invoice, InvoiceItemEntry } from '../../models/invoice.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { hardwareScanner, audioService } from '../../services/barcodeService.ts';
import { CameraBarcodeScannerModal } from '../Scanner/CameraBarcodeScannerModal.tsx';
import { db } from '../../services/db.ts';
import { generateNextInvoiceNumber } from '../../core/utils/invoiceNumber.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

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
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isMobileCartDrawerOpen, setIsMobileCartDrawerOpen] = useState(false);

  useBackNavigation(() => {
    if (isScannerOpen) {
      setIsScannerOpen(false);
      return true;
    }
    if (isMobileCartDrawerOpen) {
      setIsMobileCartDrawerOpen(false);
      return true;
    }
    return false;
  }, isScannerOpen || isMobileCartDrawerOpen, 20);

  // Extract unique categories
  const categories = ['ALL', ...Array.from(new Set(items.map((i) => i.category || 'General').filter(Boolean)))];

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

  const filteredItems = items.filter((i) => {
    const matchesSearch =
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode && i.barcode.includes(search)) ||
      (i.sku && i.sku.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' || (i.category || 'General').toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

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
  const totalCartCount = cart.reduce((s, c) => s + c.qty, 0);

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
      invoiceNumber: generateNextInvoiceNumber(company.invoicePrefix || 'POS-', db.getInvoices()),
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
    setIsMobileCartDrawerOpen(false);
  };

  return (
    <div className="flex flex-col md:grid md:grid-cols-12 min-h-[calc(100vh-64px)] pb-24 md:pb-0 bg-surface">
      {/* Catalog & Quick Shelf Section */}
      <div className="md:col-span-7 flex flex-col p-3 sm:p-4 border-r border-outline-variant/30 gap-2.5 overflow-y-auto">
        {/* Operational Mode Mini Ticker (Stitch pos_billing_counter) */}
        <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-[11px] bg-surface-container-lowest p-2.5 rounded-xl border border-outline-variant/20 shadow-sm">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1 bg-secondary-container/60 text-on-secondary-container px-2 py-0.5 rounded-full font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              Counter #01 Active
            </span>
            <span className="text-outline truncate">Bill #{company.invoicePrefix || 'POS-'}AUTO</span>
          </div>
          <div className="flex items-center gap-1 text-secondary font-semibold text-[11px] flex-shrink-0">
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            <span>Fast Lane Mode</span>
          </div>
        </div>

        {/* Scan & Quick SKU Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/30 px-3 py-2 shadow-sm">
            <span className="material-symbols-outlined text-outline text-[20px] mr-2">search</span>
            <input
              type="text"
              placeholder="Scan Barcode or Search SKU / Item Name"
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
            className="h-10 px-3 bg-primary text-on-primary rounded-xl flex items-center gap-1.5 font-label-md text-xs font-semibold shadow-sm active:scale-95 transition-transform flex-shrink-0 cursor-pointer"
            title="Scan barcode with camera"
          >
            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
            <span className="hidden sm:inline">Camera</span>
          </button>
        </div>

        {/* Scan Alert Banner */}
        {scanMessage && (
          <div className="bg-secondary text-on-secondary px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md animate-fade-in">
            <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
            <span>{scanMessage}</span>
          </div>
        )}

        {/* Quick Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all flex-shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container-low'
              }`}
            >
              {cat === 'ALL' ? 'All Items' : cat}
            </button>
          ))}
        </div>

        {/* Speed Shelf • Fast Movers Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-on-tertiary-container text-[18px]">
              local_fire_department
            </span>
            <h2 className="font-headline-sm text-sm font-bold text-on-surface">Speed Shelf • Fast Movers</h2>
          </div>
          <span className="font-label-sm text-[11px] text-outline">1-Tap Rapid Punch</span>
        </div>

        {/* Shelf Grid with Responsive Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-surface-container-lowest rounded-xl p-3 shadow-sm border border-outline-variant/30 flex flex-col justify-between hover:border-secondary transition-all"
            >
              <div className="flex gap-2 items-start">
                <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center flex-shrink-0 text-secondary">
                  <span className="material-symbols-outlined text-[22px]">inventory_2</span>
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className={`inline-block font-label-sm text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                      item.currentStock <= item.minStockAlert
                        ? 'bg-error-container/40 text-error'
                        : 'bg-secondary-container/40 text-on-secondary-container'
                    }`}
                  >
                    Stock ({item.currentStock})
                  </span>
                  <p className="font-headline-sm text-xs sm:text-sm font-bold text-on-surface truncate mt-0.5">
                    {item.name}
                  </p>
                  <p className="font-body-sm text-[11px] text-on-surface-variant truncate">
                    HSN {item.hsnSacCode}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-baseline gap-0.5">
                  <span className="font-headline-sm text-xs sm:text-sm font-bold text-on-surface font-tabular-data">
                    {formatINR(item.salePrice)}
                  </span>
                  <span className="text-[10px] text-outline">/{item.unit.toLowerCase()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(item)}
                  className="h-7 px-2.5 bg-secondary text-on-secondary rounded-lg font-label-md text-xs font-bold flex items-center gap-0.5 active:scale-90 transition-transform shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">add</span> Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop/Tablet Right Pane: Cart & Checkout (Visible on md+) */}
      <div className="hidden md:flex md:col-span-5 bg-surface-container-low flex-col h-full border-t md:border-t-0">
        <div className="p-3.5 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-lowest">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">shopping_cart</span>
            <span className="font-label-md text-sm font-bold text-on-surface">
              POS Current Cart ({totalCartCount})
            </span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-xs text-error font-medium hover:underline cursor-pointer"
            >
              Clear Cart
            </button>
          )}
        </div>

        {/* Cart List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-outline gap-2">
              <span className="material-symbols-outlined text-4xl text-outline-variant">point_of_sale</span>
              <p className="text-xs font-semibold">Cart is empty. Tap items or scan barcode.</p>
            </div>
          ) : (
            cart.map(({ item, qty }) => (
              <div
                key={item.id}
                className="bg-surface-container-lowest p-2.5 rounded-xl border border-outline-variant/20 flex items-center justify-between gap-2 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-label-md text-xs font-bold text-on-surface truncate">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-outline">
                    {formatINR(item.salePrice)} × {qty} = {formatINR(item.salePrice * qty)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => updateQty(item.id, -1)}
                    className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center font-bold text-xs hover:bg-surface-container-high cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-xs font-bold">{qty}</span>
                  <button
                    onClick={() => updateQty(item.id, 1)}
                    className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center font-bold text-xs hover:bg-surface-container-high cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-outline hover:text-error ml-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Summary & Checkout */}
        {cart.length > 0 && (
          <div className="p-4 bg-surface-container-lowest border-t border-outline-variant/30 space-y-3 shadow-lg">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-outline">
                <span>Taxable Amount</span>
                <span>{formatINR(calcSummary.totalTaxableAmount)}</span>
              </div>
              <div className="flex justify-between text-outline">
                <span>Total GST</span>
                <span>{formatINR(calcSummary.totalTax)}</span>
              </div>
              <div className="flex justify-between font-bold text-base text-on-surface pt-1.5 border-t border-outline-variant/20">
                <span>Grand Total</span>
                <span className="text-secondary">{formatINR(calcSummary.grandTotal)}</span>
              </div>
            </div>

            {/* Customer & Payment Mode */}
            <div className="space-y-2">
              <input
                type="tel"
                placeholder="Customer Phone (Optional for WhatsApp)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-surface-container-low px-3 py-2 rounded-xl text-xs outline-none border border-outline-variant/30"
              />
              <div className="grid grid-cols-3 gap-1.5">
                {(['CASH', 'UPI', 'CARD'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      paymentMode === mode
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'bg-surface-container text-on-surface'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCheckout}
              className="w-full py-3 bg-secondary text-on-secondary rounded-xl font-bold text-sm shadow-md hover:bg-secondary/90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">payments</span>
              <span>Charge {formatINR(calcSummary.grandTotal)} & Print</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Floating Cart Bar (Sticky when cart has items) */}
      {cart.length > 0 && !isMobileCartDrawerOpen && (
        <div className="md:hidden fixed bottom-16 left-3 right-3 z-40 bg-on-surface text-surface rounded-2xl p-3 shadow-2xl flex items-center justify-between animate-fade-in border border-surface-container-highest/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-bold text-sm shadow-sm">
              {totalCartCount}
            </div>
            <div>
              <div className="font-label-md text-xs text-surface-variant">POS Total</div>
              <div className="font-currency-display-mobile text-base font-bold text-surface">
                {formatINR(calcSummary.grandTotal)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileCartDrawerOpen(true)}
            className="px-4 py-2 bg-secondary text-on-secondary rounded-xl font-label-md text-xs font-bold shadow-md active:scale-95 transition-transform flex items-center gap-1 cursor-pointer"
          >
            <span>View Cart</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      )}

      {/* Mobile Cart & Checkout Drawer Modal */}
      {isMobileCartDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-fade-in">
          <div className="bg-surface-container-lowest rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border-t border-outline-variant/30">
            {/* Drawer Header */}
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">shopping_cart</span>
                <span className="font-headline-sm text-base font-bold text-on-surface">
                  Current Bill ({totalCartCount} Items)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-error font-semibold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setIsMobileCartDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {cart.map(({ item, qty }) => (
                <div
                  key={item.id}
                  className="bg-surface-container-low/70 p-3 rounded-xl border border-outline-variant/20 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-label-md text-xs font-bold text-on-surface truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-outline mt-0.5">
                      {formatINR(item.salePrice)} × {qty} = {formatINR(item.salePrice * qty)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="w-7 h-7 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-xs font-bold">{qty}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="w-7 h-7 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-outline hover:text-error ml-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary & Checkout Footer */}
            <div className="p-4 bg-surface-container-low/40 border-t border-outline-variant/20 space-y-3">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-outline">
                  <span>Taxable Subtotal</span>
                  <span>{formatINR(calcSummary.totalTaxableAmount)}</span>
                </div>
                <div className="flex justify-between text-outline">
                  <span>GST Total</span>
                  <span>{formatINR(calcSummary.totalTax)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-on-surface pt-1 border-t border-outline-variant/20">
                  <span>Grand Total</span>
                  <span className="text-secondary">{formatINR(calcSummary.grandTotal)}</span>
                </div>
              </div>

              {/* Customer & Payment Mode Selector */}
              <div className="space-y-2">
                <input
                  type="tel"
                  placeholder="Customer WhatsApp Mobile (Optional)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-surface-container-lowest px-3 py-2.5 rounded-xl text-xs outline-none border border-outline-variant/30 font-medium"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {(['CASH', 'UPI', 'CARD'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                        paymentMode === mode
                          ? 'bg-secondary text-on-secondary shadow-sm'
                          : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                className="w-full py-3 bg-secondary text-on-secondary rounded-xl font-bold text-sm shadow-md hover:bg-secondary/90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">print</span>
                <span>Charge {formatINR(calcSummary.grandTotal)} & Print</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      {isScannerOpen && (
        <CameraBarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={(code) => {
            handleBarcodeScanned(code);
            setIsScannerOpen(false);
          }}
        />
      )}
    </div>
  );
};
