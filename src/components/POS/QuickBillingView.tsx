import React, { useState, useEffect, useRef, useMemo } from 'react';
import { InventoryItem } from '../../models/item.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { Invoice, InvoiceItemEntry, PaymentMode } from '../../models/invoice.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { hardwareScanner, audioService } from '../../services/barcodeService.ts';
import { CameraBarcodeScannerModal } from '../Scanner/CameraBarcodeScannerModal.tsx';
import { ThermalPrintModal } from '../Printing/ThermalPrintModal.tsx';
import { db } from '../../services/db.ts';
import { generateNextInvoiceNumber } from '../../core/utils/invoiceNumber.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

import { PosCartItem, PosCustomerState, HeldBill } from './types.ts';
import { SelectPosPartyModal } from './SelectPosPartyModal.tsx';
import { CustomItemModal } from './CustomItemModal.tsx';
import { HoldBillsModal } from './HoldBillsModal.tsx';
import { UpiQrModal } from './UpiQrModal.tsx';
import { SplitPaymentModal } from './SplitPaymentModal.tsx';
import { PosCheckoutSuccessModal } from './PosCheckoutSuccessModal.tsx';
import { PosKeyboardShortcutsModal } from './PosKeyboardShortcutsModal.tsx';

interface QuickBillingViewProps {
  company: CompanyProfile;
  items: InventoryItem[];
  parties?: Party[];
  onCompleteSale: (invoice: Invoice) => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

const HELD_BILLS_STORAGE_KEY = 'vyapar_pos_held_bills';

export const QuickBillingView: React.FC<QuickBillingViewProps> = ({
  company,
  items,
  parties = db.getParties(),
  onCompleteSale,
  onViewInvoice,
}) => {
  const isGstActive = company.isGstEnabled !== false;

  // Cart state
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [catalogViewMode, setCatalogViewMode] = useState<'GRID' | 'LIST'>('GRID');

  // Customer state
  const [customer, setCustomer] = useState<PosCustomerState>({
    party: null,
    phone: '',
    isB2b: false,
    stateCode: company.stateCode || '27',
  });

  // Discounts and Adjustments
  const [cartDiscountType, setCartDiscountType] = useState<'PERCENT' | 'FLAT'>('FLAT');
  const [cartDiscountValue, setCartDiscountValue] = useState<number>(0);
  const [additionalCharges, setAdditionalCharges] = useState<number>(0);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);

  // Payment & Tender State
  const [paymentMode, setPaymentMode] = useState<PaymentMode | 'SPLIT'>('CASH');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [splitBreakdown, setSplitBreakdown] = useState<{
    cash: number;
    upi: number;
    card: number;
    credit: number;
  } | null>(null);

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [isUpiModalOpen, setIsUpiModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isMobileCartDrawerOpen, setIsMobileCartDrawerOpen] = useState(false);
  const [thermalPrintInvoice, setThermalPrintInvoice] = useState<Invoice | null>(null);

  // Post-sale completed invoice state
  const [completedSale, setCompletedSale] = useState<{
    invoice: Invoice;
    changeDue: number;
    cashTendered: number;
  } | null>(null);

  // Live status ticker & alerts
  const [scanMessage, setScanMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Held bills state with localStorage persistence
  const [heldBills, setHeldBills] = useState<HeldBill[]>(() => {
    try {
      const saved = localStorage.getItem(HELD_BILLS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Persist held bills
  useEffect(() => {
    try {
      localStorage.setItem(HELD_BILLS_STORAGE_KEY, JSON.stringify(heldBills));
    } catch (e) {
      console.error('Failed to save held bills:', e);
    }
  }, [heldBills]);

  // Handle Back Navigation
  useBackNavigation(() => {
    if (completedSale) {
      setCompletedSale(null);
      return true;
    }
    if (thermalPrintInvoice) {
      setThermalPrintInvoice(null);
      return true;
    }
    if (isScannerOpen) {
      setIsScannerOpen(false);
      return true;
    }
    if (isCustomerModalOpen) {
      setIsCustomerModalOpen(false);
      return true;
    }
    if (isCustomItemModalOpen) {
      setIsCustomItemModalOpen(false);
      return true;
    }
    if (isHoldModalOpen) {
      setIsHoldModalOpen(false);
      return true;
    }
    if (isUpiModalOpen) {
      setIsUpiModalOpen(false);
      return true;
    }
    if (isSplitModalOpen) {
      setIsSplitModalOpen(false);
      return true;
    }
    if (isShortcutsModalOpen) {
      setIsShortcutsModalOpen(false);
      return true;
    }
    if (isMobileCartDrawerOpen) {
      setIsMobileCartDrawerOpen(false);
      return true;
    }
    return false;
  }, isScannerOpen || isCustomerModalOpen || isCustomItemModalOpen || isHoldModalOpen || isUpiModalOpen || isSplitModalOpen || isShortcutsModalOpen || isMobileCartDrawerOpen || !!completedSale || !!thermalPrintInvoice, 20);

  // Unique Categories
  const categories = useMemo(() => {
    const list = Array.from(new Set(items.map((i) => i.category || 'General').filter(Boolean)));
    return ['ALL', 'FAST MOVERS', ...list];
  }, [items]);

  // Barcode Handler
  const handleBarcodeScanned = (barcode: string) => {
    const clean = barcode.trim();
    if (!clean) return;

    const found = items.find(
      (i) =>
        i.barcode === clean ||
        i.sku?.toLowerCase() === clean.toLowerCase() ||
        i.id === clean ||
        i.name.toLowerCase() === clean.toLowerCase()
    );

    if (found) {
      addToCart(found);
      audioService.playScanSuccess();
      setScanMessage({ text: `Added: ${found.name}` });
      setTimeout(() => setScanMessage(null), 2500);
    } else {
      audioService.playScanError();
      setScanMessage({ text: `Item not found for barcode: ${clean}`, isError: true });
      setTimeout(() => setScanMessage(null), 3000);
    }
  };

  // Hardware Scanner Gun Listener
  useEffect(() => {
    const unsub = hardwareScanner.subscribe((code) => {
      handleBarcodeScanned(code);
    });
    return unsub;
  }, [items, cart]);

  // POS Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');

      if (e.key === 'F2' || (e.key === '/' && !isInput)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F7') {
        e.preventDefault();
        setIsHoldModalOpen(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        setIsCustomItemModalOpen(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        setPaymentMode('CASH');
        handleCheckout('CASH');
      } else if (e.key === 'F10') {
        e.preventDefault();
        setPaymentMode('UPI');
        setIsUpiModalOpen(true);
      } else if (e.key === 'F12') {
        e.preventDefault();
        setIsCustomerModalOpen(true);
      } else if (e.key === '?' && !isInput) {
        e.preventDefault();
        setIsShortcutsModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, customer, heldBills]);

  // Catalog Filtering
  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        i.name.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.includes(search)) ||
        (i.sku && i.sku.toLowerCase().includes(q));

      let matchesCategory = true;
      if (selectedCategory === 'FAST MOVERS') {
        matchesCategory = (i.currentStock || 0) > 0;
      } else if (selectedCategory !== 'ALL') {
        matchesCategory = (i.category || 'General').toLowerCase() === selectedCategory.toLowerCase();
      }

      return matchesSearch && matchesCategory;
    });
  }, [items, search, selectedCategory]);

  // Cart operations
  const addToCart = (item: InventoryItem, initialQty = 1) => {
    const existing = cart.find((c) => c.item.id === item.id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c.item.id === item.id ? { ...c, qty: c.qty + initialQty } : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          item,
          qty: initialQty,
          unitPrice: item.salePrice,
          discountPercent: 0,
          discountAmount: 0,
        },
      ]);
    }
  };

  const updateCartQty = (itemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart(
      cart.map((c) => (c.item.id === itemId ? { ...c, qty } : c))
    );
  };

  const updateCartPrice = (itemId: string, unitPrice: number) => {
    if (unitPrice < 0) return;
    setCart(
      cart.map((c) => (c.item.id === itemId ? { ...c, unitPrice } : c))
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter((c) => c.item.id !== itemId));
  };

  // Tax and Total Calculations
  const supplierStateCode = company.stateCode || '27';
  const recipientStateCode = customer.stateCode || supplierStateCode;
  const isIntraState = supplierStateCode === recipientStateCode;

  const calcInputs = useMemo(() => {
    return cart.map((c) => ({
      quantity: c.qty,
      unitPrice: c.unitPrice,
      gstRate: isGstActive ? c.item.gstRate : 0,
      discountPercent: c.discountPercent || 0,
      discountAmount: c.discountAmount || 0,
    }));
  }, [cart, isGstActive]);

  const calcSummary = useMemo(() => {
    return calculateInvoice(supplierStateCode, recipientStateCode, calcInputs);
  }, [supplierStateCode, recipientStateCode, calcInputs]);

  // Overall Discount calculation
  const overallDiscountAmt = useMemo(() => {
    if (cartDiscountType === 'FLAT') {
      return Math.min(calcSummary.totalTaxableAmount, cartDiscountValue || 0);
    } else {
      return Number(((calcSummary.totalTaxableAmount * (cartDiscountValue || 0)) / 100).toFixed(2));
    }
  }, [calcSummary.totalTaxableAmount, cartDiscountType, cartDiscountValue]);

  // Final Payable Grand Total
  const finalPayableTotal = useMemo(() => {
    const raw = Math.max(
      0,
      calcSummary.grandTotal - overallDiscountAmt + (additionalCharges || 0)
    );
    return Math.round(raw);
  }, [calcSummary.grandTotal, overallDiscountAmt, additionalCharges]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((s, c) => s + c.qty, 0);
  }, [cart]);

  // Cash change calculation
  const numCashTendered = parseFloat(cashTendered) || 0;
  const cashChangeDue = Math.max(0, numCashTendered - finalPayableTotal);

  // Hold / Park Current Bill
  const handleHoldBill = () => {
    if (cart.length === 0) {
      alert('Cart is empty. Add items to park this bill.');
      return;
    }

    const holdNumber = heldBills.length + 1;
    const newHold: HeldBill = {
      id: `HOLD-${Date.now()}`,
      heldAt: new Date().toISOString(),
      label: `HOLD #${holdNumber}`,
      customer,
      cart,
      cartDiscount: {
        type: cartDiscountType,
        value: cartDiscountValue,
      },
      additionalCharges,
      paymentMode,
      totalAmount: finalPayableTotal,
    };

    setHeldBills([newHold, ...heldBills]);
    audioService.playScanSuccess();
    setScanMessage({ text: `Bill parked as ${newHold.label}` });
    setTimeout(() => setScanMessage(null), 2500);

    // Reset current active counter
    setCart([]);
    setCustomer({
      party: null,
      phone: '',
      isB2b: false,
      stateCode: company.stateCode || '27',
    });
    setCartDiscountValue(0);
    setAdditionalCharges(0);
    setCashTendered('');
    setIsMobileCartDrawerOpen(false);
  };

  const handleResumeBill = (bill: HeldBill) => {
    if (cart.length > 0) {
      if (
        !window.confirm(
          'Active cart has items. Resuming will replace current cart. Continue?'
        )
      ) {
        return;
      }
    }

    setCart(bill.cart);
    setCustomer(bill.customer);
    setCartDiscountType(bill.cartDiscount.type);
    setCartDiscountValue(bill.cartDiscount.value);
    setAdditionalCharges(bill.additionalCharges);
    setPaymentMode(bill.paymentMode);

    setHeldBills(heldBills.filter((b) => b.id !== bill.id));
    audioService.playScanSuccess();
    setScanMessage({ text: `Resumed ${bill.label}` });
    setTimeout(() => setScanMessage(null), 2500);
  };

  const handleDiscardHeldBill = (billId: string) => {
    setHeldBills(heldBills.filter((b) => b.id !== billId));
  };

  const handleClearAllHeld = () => {
    setHeldBills([]);
  };

  // Customer Party Select
  const handleSelectCustomer = (party: Party | null) => {
    if (party) {
      setCustomer({
        party,
        phone: party.phone || '',
        isB2b: !!party.gstin,
        gstin: party.gstin,
        stateCode: party.stateCode || company.stateCode || '27',
      });
    } else {
      setCustomer({
        party: null,
        phone: '',
        isB2b: false,
        stateCode: company.stateCode || '27',
      });
    }
  };

  // Checkout Execution
  // Accepts an optional pre-resolved split breakdown to avoid React async state race.
  const handleCheckout = (modeOverride?: PaymentMode, resolvedSplit?: { cash: number; upi: number; card: number; credit: number } | null) => {
    if (cart.length === 0) return;

    // Use the directly-passed split (avoids async setSplitBreakdown race condition).
    const activeSplit = resolvedSplit !== undefined ? resolvedSplit : splitBreakdown;

    // Determine the primary payment mode label for the invoice.
    // For SPLIT, pick the largest non-zero portion mode (e.g. CASH if cash > upi/card),
    // so the invoice paymentMode field is meaningful for accounting.
    let chosenMode: PaymentMode;
    if (modeOverride && modeOverride !== 'CREDIT') {
      chosenMode = modeOverride;
    } else if (paymentMode === 'SPLIT' || activeSplit) {
      // Pick mode with the highest allocation; fall back to CASH
      const s = activeSplit ?? { cash: 0, upi: 0, card: 0, credit: 0 };
      const max = Math.max(s.cash, s.upi, s.card, s.credit);
      if (max === s.upi) chosenMode = 'UPI';
      else if (max === s.card) chosenMode = 'CARD';
      else if (max === s.credit) chosenMode = 'CREDIT';
      else chosenMode = 'CASH';
    } else {
      chosenMode = (paymentMode as PaymentMode) || 'CASH';
    }

    const invoiceItems: InvoiceItemEntry[] = cart.map((c, idx) => {
      const itemCalc = calcSummary.items[idx];
      return {
        itemId: c.item.id,
        name: c.item.name,
        hsnSacCode: c.item.hsnSacCode,
        unit: c.item.unit,
        quantity: c.qty,
        unitPrice: c.unitPrice,
        taxableAmount: itemCalc.taxableAmount,
        discountPercent: c.discountPercent,
        discountAmount: itemCalc.discountAmount,
        gstRate: c.item.gstRate,
        cgstAmount: itemCalc.cgstAmount,
        sgstAmount: itemCalc.sgstAmount,
        igstAmount: itemCalc.igstAmount,
        cessAmount: itemCalc.cessAmount,
        totalAmount: itemCalc.totalAmount,
      };
    });

    const isB2bInvoice = isGstActive && !!customer.gstin;

    // For split with a credit portion: invoice is PARTIAL — paidNow = non-credit amount,
    // balance = credit (Udhaar) portion still owed.
    const splitCreditPortion = activeSplit?.credit ?? 0;
    const splitPaidNow = activeSplit
      ? (activeSplit.cash + activeSplit.upi + activeSplit.card)
      : 0;
    const isSplitWithCredit = !!activeSplit && splitCreditPortion > 0;
    const isCreditSale = !activeSplit && chosenMode === 'CREDIT';

    const paidAmount = isSplitWithCredit
      ? splitPaidNow
      : isCreditSale
      ? 0
      : finalPayableTotal;

    const balanceAmount = isSplitWithCredit
      ? splitCreditPortion
      : isCreditSale
      ? finalPayableTotal
      : 0;

    const paymentStatus =
      balanceAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

    // Build split note for invoice
    const splitNote = activeSplit
      ? [
          activeSplit.cash > 0 ? `Cash ₹${activeSplit.cash}` : '',
          activeSplit.upi > 0 ? `UPI ₹${activeSplit.upi}` : '',
          activeSplit.card > 0 ? `Card ₹${activeSplit.card}` : '',
          activeSplit.credit > 0 ? `Credit ₹${activeSplit.credit}` : '',
        ]
          .filter(Boolean)
          .join(', ')
      : null;

    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNumber: generateNextInvoiceNumber(
        company.invoicePrefix || 'POS-',
        db.getInvoices()
      ),
      invoiceType: isB2bInvoice ? 'B2B' : 'B2CS',
      isGstInvoice: isGstActive,
      date: new Date().toISOString().split('T')[0],
      partyId: customer.party?.id,
      partyName: customer.party
        ? customer.party.name
        : customer.phone
        ? `Retail (${customer.phone})`
        : 'Walk-in Retail Customer',
      partyGstin: isGstActive ? customer.gstin : undefined,
      partyAddress: customer.party?.billingAddress || 'Local Retail Counter',
      partyStateCode: customer.stateCode,
      placeOfSupplyStateCode: customer.stateCode,
      isIntraState,
      items: invoiceItems,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: calcSummary.totalDiscount + overallDiscountAmt,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: isGstActive ? calcSummary.totalCgst : 0,
      totalSgst: isGstActive ? calcSummary.totalSgst : 0,
      totalIgst: isGstActive ? calcSummary.totalIgst : 0,
      totalCess: 0,
      totalTax: isGstActive ? calcSummary.totalTax : 0,
      roundOff: calcSummary.roundOff,
      shippingAmount: additionalCharges > 0 ? additionalCharges : undefined,
      grandTotal: finalPayableTotal,
      amountInWords: amountInWords(finalPayableTotal),
      paymentMode: chosenMode,
      paymentStatus,
      paidAmount,
      balanceAmount,
      notes: splitNote ? `Split Payment — ${splitNote}` : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onCompleteSale(newInvoice);
    audioService.playScanSuccess();

    // Trigger Success Screen
    setCompletedSale({
      invoice: newInvoice,
      changeDue: chosenMode === 'CASH' && !activeSplit ? cashChangeDue : 0,
      cashTendered: numCashTendered,
    });

    // Reset Form for next sale
    setCart([]);
    setCustomer({
      party: null,
      phone: '',
      isB2b: false,
      stateCode: company.stateCode || '27',
    });
    setCartDiscountValue(0);
    setAdditionalCharges(0);
    setCashTendered('');
    setSplitBreakdown(null);
    setIsMobileCartDrawerOpen(false);
  };

  const handleStartNextSale = () => {
    setCompletedSale(null);
    searchInputRef.current?.focus();
  };

  const previewInvoiceNumber = useMemo(() => {
    return generateNextInvoiceNumber(company.invoicePrefix || 'POS-', db.getInvoices());
  }, [company.invoicePrefix, completedSale]);

  return (
    <div className="flex flex-col md:grid md:grid-cols-12 h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] overflow-hidden bg-surface pb-20 md:pb-0 select-none">
      {/* ======================================================== */}
      {/* Left Catalog Pane (md:col-span-7)                       */}
      {/* ======================================================== */}
      <div className="md:col-span-7 flex flex-col h-full border-r border-outline-variant/25 overflow-hidden bg-surface">
        {/* Top Controls Area (Fixed, not scrolling) */}
        <div className="flex-shrink-0 p-3 pb-2 space-y-2.5 bg-surface border-b border-outline-variant/15">
          {/* Status Ribbon & Quick Tools */}
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-bold text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                POS Counter #01
              </span>
              <span className="text-outline font-mono text-[11px] font-semibold">
                Bill #{previewInvoiceNumber}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsHoldModalOpen(true)}
                className={`px-2.5 py-1 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                  heldBills.length > 0
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shadow-xs animate-pulse-gentle'
                    : 'bg-surface-container text-outline hover:text-on-surface'
                }`}
                title="Parked / Held Bills (F7)"
              >
                <span className="material-symbols-outlined text-[15px]">pause_circle</span>
                <span>Held ({heldBills.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsShortcutsModalOpen(true)}
                className="w-7 h-7 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
                title="Keyboard Shortcuts (?)"
              >
                <span className="material-symbols-outlined text-[15px]">help</span>
              </button>
            </div>
          </div>

          {/* Clean Search & Barcode Bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/30 px-3 py-2 shadow-xs focus-within:border-secondary focus-within:ring-1 focus-within:ring-secondary transition-all">
              <span className="material-symbols-outlined text-outline text-[18px] mr-2">
                barcode_scanner
              </span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Scan barcode or search item... (F2 or /)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm text-on-surface placeholder:text-outline outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-outline hover:text-on-surface ml-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Camera Scanner Button */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="h-9 px-3 bg-primary text-on-primary rounded-xl flex items-center gap-1 font-semibold text-xs shadow-xs active:scale-95 transition-transform flex-shrink-0 cursor-pointer"
              title="Camera Scanner"
            >
              <span className="material-symbols-outlined text-[16px]">photo_camera</span>
              <span className="hidden sm:inline">Scan</span>
            </button>

            {/* Add Custom Non-Catalog Item Button */}
            <button
              type="button"
              onClick={() => setIsCustomItemModalOpen(true)}
              className="h-9 px-3 bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:border-secondary rounded-xl flex items-center gap-1 text-xs font-bold shadow-xs active:scale-95 transition-transform flex-shrink-0 cursor-pointer"
              title="Add Custom Line Item (F8)"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">add_box</span>
              <span>+ Custom</span>
            </button>
          </div>

          {/* Scan Alert Notification */}
          {scanMessage && (
            <div
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm animate-fade-in ${
                scanMessage.isError
                  ? 'bg-error text-on-error'
                  : 'bg-secondary text-on-secondary'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {scanMessage.isError ? 'error' : 'check_circle'}
              </span>
              <span>{scanMessage.text}</span>
            </div>
          )}

          {/* Category Carousel & View Mode Toggle */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1 flex-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold shadow-xs transition-all flex-shrink-0 cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-secondary text-on-secondary font-bold'
                      : 'bg-surface-container-lowest text-on-surface border border-outline-variant/25 hover:bg-surface-container-low'
                  }`}
                >
                  {cat === 'ALL' ? 'All' : cat}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-0.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setCatalogViewMode('GRID')}
                className={`p-1 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                  catalogViewMode === 'GRID'
                    ? 'bg-secondary text-on-secondary'
                    : 'text-outline hover:text-on-surface'
                }`}
                title="Grid Cards"
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
              </button>
              <button
                type="button"
                onClick={() => setCatalogViewMode('LIST')}
                className={`p-1 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                  catalogViewMode === 'LIST'
                    ? 'bg-secondary text-on-secondary'
                    : 'text-outline hover:text-on-surface'
                }`}
                title="Dense List"
              >
                <span className="material-symbols-outlined text-[16px]">view_list</span>
              </button>
            </div>
          </div>
        </div>

        {/* Catalog Items Container (Scrollable only here) */}
        <div className="flex-1 overflow-y-auto min-h-0 p-3">
          {filteredItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-outline gap-2 bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/40">
              <span className="material-symbols-outlined text-4xl text-outline-variant">search_off</span>
              <p className="text-xs font-semibold text-on-surface">No matching items found.</p>
              <button
                type="button"
                onClick={() => setIsCustomItemModalOpen(true)}
                className="text-xs text-secondary font-bold hover:underline cursor-pointer"
              >
                + Add Custom Item to Bill
              </button>
            </div>
          ) : catalogViewMode === 'GRID' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pb-4">
              {filteredItems.map((item) => {
                const inCartQty = cart.find((c) => c.item.id === item.id)?.qty || 0;
                const isLowStock = (item.currentStock || 0) <= (item.minStockAlert || 0);

                return (
                  <div
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className={`bg-surface-container-lowest rounded-xl p-3 shadow-xs border transition-all cursor-pointer flex flex-col justify-between select-none relative group ${
                      inCartQty > 0
                        ? 'border-secondary ring-1 ring-secondary/50 bg-secondary-container/5'
                        : 'border-outline-variant/25 hover:border-secondary hover:shadow-sm'
                    }`}
                  >
                    {/* Top line with Stock Badge and GST Rate */}
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          isLowStock
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : 'bg-surface-container text-outline'
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
                      <p className="text-xs sm:text-sm font-bold text-on-surface truncate group-hover:text-secondary transition-colors">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-outline truncate mt-0.5">
                        {item.category || 'General'}
                      </p>
                    </div>

                    {/* Price and Add Action */}
                    <div className="mt-2.5 pt-2 border-t border-outline-variant/15 flex items-center justify-between">
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-xs sm:text-sm font-black text-on-surface font-tabular-data">
                          {formatINR(item.salePrice)}
                        </span>
                        <span className="text-[10px] text-outline">/{item.unit.toLowerCase()}</span>
                      </div>

                      {inCartQty > 0 ? (
                        <span className="h-6 px-2 bg-secondary text-on-secondary rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-xs">
                          <span>{inCartQty}</span>
                        </span>
                      ) : (
                        <span className="w-6 h-6 bg-surface-container group-hover:bg-secondary group-hover:text-on-secondary rounded-lg text-outline flex items-center justify-center transition-colors">
                          <span className="material-symbols-outlined text-[15px]">add</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Dense List View (Clean, NO HSN) */
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/25 overflow-hidden divide-y divide-outline-variant/15 shadow-xs mb-4">
              {filteredItems.map((item) => {
                const inCartQty = cart.find((c) => c.item.id === item.id)?.qty || 0;
                return (
                  <div
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className={`p-2.5 flex items-center justify-between gap-3 hover:bg-surface-container-low transition-colors cursor-pointer select-none ${
                      inCartQty > 0 ? 'bg-secondary-container/10' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-on-surface truncate">
                          {item.name}
                        </span>
                        {isGstActive && item.gstRate > 0 && (
                          <span className="text-[10px] bg-secondary-container/40 text-on-secondary-container px-1 rounded font-bold font-mono">
                            {item.gstRate}%
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-outline mt-0.5 flex items-center gap-2">
                        <span>{item.category || 'General'}</span>
                        <span>•</span>
                        <span>Stock: {item.currentStock} {item.unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-bold text-on-surface font-tabular-data">
                          {formatINR(item.salePrice)}
                        </div>
                        <div className="text-[10px] text-outline">/{item.unit.toLowerCase()}</div>
                      </div>

                      <button
                        type="button"
                        className={`h-7 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer ${
                          inCartQty > 0
                            ? 'bg-secondary text-on-secondary'
                            : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
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
              })}
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* Right Desktop/Tablet Cart & Checkout Pane (md:col-span-5) */}
      {/* ======================================================== */}
      <div className="hidden md:flex md:col-span-5 bg-surface-container-low flex-col h-full overflow-hidden border-t md:border-t-0">
        {/* Cart Top Section: Customer Selection Bar (Moved to Cart Side) */}
        <div className="flex-shrink-0 p-2.5 bg-surface-container-lowest border-b border-outline-variant/20 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div
              onClick={() => setIsCustomerModalOpen(true)}
              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer hover:opacity-85 transition-opacity"
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold flex-shrink-0 ${
                  customer.party
                    ? 'bg-secondary/10 text-secondary'
                    : 'bg-surface-container text-outline'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {customer.party ? 'person' : 'storefront'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-on-surface truncate">
                    {customer.party ? customer.party.name : 'Walk-in Retail Customer'}
                  </span>
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                      customer.isB2b
                        ? 'bg-primary/10 text-primary font-mono'
                        : 'bg-surface-container text-outline'
                    }`}
                  >
                    {customer.isB2b ? 'B2B' : 'B2C'}
                  </span>
                </div>
                <div className="text-[10px] text-outline truncate flex items-center gap-1.5 mt-0.5">
                  <span>{customer.phone || 'Tap to select customer'}</span>
                  {customer.party && (customer.party.currentBalance || 0) !== 0 && (
                    <span
                      className={`font-semibold ${
                        customer.party.currentBalance > 0 ? 'text-amber-600' : 'text-secondary'
                      }`}
                    >
                      • Bal: {formatINR(customer.party.currentBalance)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {customer.party && (
                <button
                  type="button"
                  onClick={() => handleSelectCustomer(null)}
                  className="w-6 h-6 rounded-md hover:bg-surface-container text-outline flex items-center justify-center cursor-pointer"
                  title="Reset to Walk-in"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                className="px-2 py-1 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg text-[11px] font-bold border border-outline-variant/30 flex items-center gap-0.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[13px]">person_search</span>
                <span>{customer.party ? 'Change' : 'Select'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Cart Sub-Header (Items Count, Hold, Clear) */}
        <div className="flex-shrink-0 px-3 py-2 bg-surface-container-lowest/80 border-b border-outline-variant/20 flex items-center justify-between text-xs">
          <span className="font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-[17px]">shopping_cart</span>
            <span>Current Bill ({totalCartCount})</span>
          </span>

          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleHoldBill}
                  className="text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  title="Hold Bill (F4)"
                >
                  <span className="material-symbols-outlined text-[13px]">pause</span>
                  <span>Hold</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Clear all items from bill?')) setCart([]);
                  }}
                  className="text-[11px] text-error hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {/* Item Table in Cart - THIS IS THE ONLY SCROLLABLE AREA IN THE CART */}
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-outline gap-2 py-12">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline-variant">
                <span className="material-symbols-outlined text-2xl">point_of_sale</span>
              </div>
              <p className="text-xs font-semibold text-on-surface">Cart is Empty</p>
              <p className="text-[11px] text-outline text-center max-w-xs">
                Tap items from catalog or scan barcodes to begin sale.
              </p>
            </div>
          ) : (
            cart.map(({ item, qty, unitPrice }) => (
              <div
                key={item.id}
                className="bg-surface-container-lowest p-2.5 rounded-xl border border-outline-variant/20 shadow-xs flex flex-col gap-1.5 hover:border-secondary/30 transition-all"
              >
                {/* Line 1: Clean Name, Unit/GST, Delete */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-on-surface truncate block">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-outline">
                      {item.unit}{isGstActive && item.gstRate > 0 ? ` • ${item.gstRate}% GST` : ''}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="text-outline hover:text-error cursor-pointer p-0.5"
                    title="Remove item"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>
                </div>

                {/* Line 2: Quantity Stepper, Editable Rate, and Line Total */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/10">
                  {/* Stepper with Direct Input */}
                  <div className="flex items-center gap-1 bg-surface-container-low rounded-lg p-0.5 border border-outline-variant/25">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, qty - 1)}
                      className="w-5 h-5 rounded bg-surface-container-lowest hover:bg-surface-container-high flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={qty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        updateCartQty(item.id, Math.max(1, val));
                      }}
                      className="w-8 text-center text-xs font-bold bg-transparent outline-none font-tabular-data"
                    />
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, qty + 1)}
                      className="w-5 h-5 rounded bg-surface-container-lowest hover:bg-surface-container-high flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  {/* Inline Rate Input */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-outline">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={unitPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateCartPrice(item.id, val);
                      }}
                      className="w-16 bg-surface-container-low border border-outline-variant/25 rounded-md px-1 py-0.5 text-xs font-bold text-on-surface outline-none focus:border-secondary font-tabular-data"
                    />
                  </div>

                  {/* Subtotal */}
                  <div className="text-right">
                    <div className="text-xs font-bold text-on-surface font-tabular-data">
                      {formatINR(qty * unitPrice)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Fixed Summary & Checkout Dock (Never scrolls away) */}
        {cart.length > 0 && (
          <div className="flex-shrink-0 p-3 bg-surface-container-lowest border-t border-outline-variant/25 space-y-2 shadow-xl">
            {/* Bill Adjustments: Discount & Extra Charges */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-lg border border-outline-variant/20">
                <span className="text-[10px] text-outline font-semibold">Disc</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={cartDiscountValue || ''}
                  onChange={(e) => setCartDiscountValue(parseFloat(e.target.value) || 0)}
                  className="w-10 bg-transparent text-xs font-bold outline-none font-tabular-data text-on-surface"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCartDiscountType(cartDiscountType === 'FLAT' ? 'PERCENT' : 'FLAT')
                  }
                  className="text-[9px] font-bold text-secondary px-1 py-0.2 rounded bg-surface-container-lowest border border-outline-variant/30 cursor-pointer"
                >
                  {cartDiscountType === 'FLAT' ? '₹' : '%'}
                </button>
              </div>

              <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-lg border border-outline-variant/20">
                <span className="text-[10px] text-outline font-semibold">Extra ₹</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={additionalCharges || ''}
                  onChange={(e) => setAdditionalCharges(parseFloat(e.target.value) || 0)}
                  className="flex-1 bg-transparent text-xs font-bold outline-none font-tabular-data text-on-surface"
                />
              </div>
            </div>

            {/* Totals Summary */}
            <div className="space-y-0.5 text-xs">
              {isGstActive && (
                <>
                  <div className="flex justify-between text-outline text-[11px]">
                    <span>Taxable</span>
                    <span className="font-tabular-data">{formatINR(calcSummary.totalTaxableAmount)}</span>
                  </div>
                  <div className="flex justify-between text-outline text-[11px] items-center">
                    <button
                      type="button"
                      onClick={() => setShowTaxBreakdown(!showTaxBreakdown)}
                      className="flex items-center gap-0.5 text-secondary font-semibold hover:underline cursor-pointer"
                    >
                      <span>GST ({isIntraState ? 'CGST+SGST' : 'IGST'})</span>
                      <span className="material-symbols-outlined text-[13px]">
                        {showTaxBreakdown ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    <span className="font-tabular-data">{formatINR(calcSummary.totalTax)}</span>
                  </div>

                  {/* Collapsible Tax Detail */}
                  {showTaxBreakdown && (
                    <div className="p-1.5 bg-surface-container-low rounded-lg border border-outline-variant/20 space-y-0.5 text-[10px] text-on-surface-variant">
                      {isIntraState ? (
                        <>
                          <div className="flex justify-between">
                            <span>CGST: {formatINR(calcSummary.totalCgst)}</span>
                            <span>SGST: {formatINR(calcSummary.totalSgst)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span>IGST: {formatINR(calcSummary.totalIgst)}</span>
                        </div>
                      )}
                      {calcSummary.roundOff !== 0 && (
                        <div className="flex justify-between text-outline">
                          <span>Round Off: {calcSummary.roundOff > 0 ? `+₹${calcSummary.roundOff}` : `₹${calcSummary.roundOff}`}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Grand Total */}
              <div className="flex justify-between font-black text-on-surface pt-1 border-t border-outline-variant/20 items-baseline">
                <span className="text-xs">Grand Total</span>
                <span className="text-secondary text-lg font-tabular-data">
                  {formatINR(finalPayableTotal)}
                </span>
              </div>
            </div>

            {/* Payment Mode Selector Tabs */}
            <div className="grid grid-cols-5 gap-1 pt-0.5">
              {(['CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode);
                    if (mode === 'UPI') setIsUpiModalOpen(true);
                    if (mode === 'SPLIT') setIsSplitModalOpen(true);
                  }}
                  className={`py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                    paymentMode === mode
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'bg-surface-container-low border border-outline-variant/25 text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {mode === 'CREDIT' ? 'Udhaar' : mode}
                </button>
              ))}
            </div>

            {/* Cash Tendered Calculator (Clean, visible only on CASH) */}
            {paymentMode === 'CASH' && (
              <div className="bg-surface-container-low p-2 rounded-xl border border-outline-variant/20 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-outline font-semibold">Cash Given:</span>
                  <input
                    type="number"
                    placeholder={`e.g. ${finalPayableTotal}`}
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="w-20 bg-surface-container-lowest border border-outline-variant/30 rounded-md px-1.5 py-0.5 text-xs font-black text-on-surface outline-none focus:border-secondary font-tabular-data text-right"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCashTendered(finalPayableTotal.toString())}
                      className="px-1.5 py-0.5 bg-surface-container-lowest border border-outline-variant/30 rounded text-[9px] font-bold text-secondary cursor-pointer"
                    >
                      Exact
                    </button>
                    {[100, 500, 2000].map((preset) => {
                      if (preset < finalPayableTotal) return null;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setCashTendered(preset.toString())}
                          className="px-1.5 py-0.5 bg-surface-container-lowest border border-outline-variant/30 rounded text-[9px] font-bold text-outline cursor-pointer"
                        >
                          ₹{preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {cashChangeDue > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-outline-variant/15 font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Return Change:</span>
                    <span className="font-tabular-data font-black">
                      {formatINR(cashChangeDue)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Checkout Action Button */}
            <button
              type="button"
              onClick={() => handleCheckout()}
              className="w-full py-2.5 bg-secondary text-on-secondary rounded-xl font-bold text-xs sm:text-sm shadow-md hover:bg-secondary/90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">payments</span>
              <span>Charge {formatINR(finalPayableTotal)} & Print (F9)</span>
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* Mobile Floating Sticky Cart Bar                          */}
      {/* ======================================================== */}
      {cart.length > 0 && !isMobileCartDrawerOpen && (
        <div className="md:hidden fixed bottom-16 left-3 right-3 z-40 bg-on-surface text-surface rounded-2xl p-2.5 shadow-2xl flex items-center justify-between animate-fade-in border border-surface-container-highest/20">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-black text-xs shadow-xs">
              {totalCartCount}
            </div>
            <div>
              <div className="text-[10px] text-surface-variant font-medium">Bill Total</div>
              <div className="text-sm font-bold text-surface">
                {formatINR(finalPayableTotal)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileCartDrawerOpen(true)}
            className="px-3.5 py-1.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-md active:scale-95 transition-transform flex items-center gap-1 cursor-pointer"
          >
            <span>View Cart ({totalCartCount})</span>
            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* Mobile Cart & Checkout Modal Drawer                      */}
      {/* ======================================================== */}
      {isMobileCartDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-fade-in">
          <div className="bg-surface-container-lowest rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border-t border-outline-variant/30">
            {/* Mobile Drawer Header with Customer Selection */}
            <div className="p-3 border-b border-outline-variant/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary text-[20px]">
                    shopping_cart
                  </span>
                  <span className="text-sm font-bold text-on-surface">
                    Current Bill ({totalCartCount} Items)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleHoldBill}
                    className="px-2 py-0.5 text-xs text-amber-700 bg-amber-500/10 rounded-lg font-bold"
                  >
                    Hold
                  </button>
                  <button
                    onClick={() => setIsMobileCartDrawerOpen(false)}
                    className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-outline cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              </div>

              {/* Customer Row on Mobile Cart */}
              <div
                onClick={() => setIsCustomerModalOpen(true)}
                className="p-2 bg-surface-container-low rounded-xl border border-outline-variant/20 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-secondary text-[16px]">
                    {customer.party ? 'person' : 'storefront'}
                  </span>
                  <span className="text-xs font-bold text-on-surface truncate">
                    {customer.party ? customer.party.name : 'Walk-in Retail Customer'}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-secondary">
                  {customer.party ? 'Change' : 'Select'}
                </span>
              </div>
            </div>

            {/* Cart Items List (Clean, NO HSN) */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.map(({ item, qty, unitPrice }) => (
                <div
                  key={item.id}
                  className="bg-surface-container-low/70 p-2.5 rounded-xl border border-outline-variant/20 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-on-surface truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-outline mt-0.5">
                      {formatINR(unitPrice)} × {qty} = {formatINR(unitPrice * qty)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => updateCartQty(item.id, qty - 1)}
                      className="w-6 h-6 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-5 text-center text-xs font-bold">{qty}</span>
                    <button
                      onClick={() => updateCartQty(item.id, qty + 1)}
                      className="w-6 h-6 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-outline hover:text-error ml-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary & Checkout Footer */}
            <div className="p-3 bg-surface-container-low/50 border-t border-outline-variant/20 space-y-2.5">
              <div className="space-y-0.5 text-xs">
                {isGstActive && (
                  <>
                    <div className="flex justify-between text-outline text-[11px]">
                      <span>Taxable Subtotal</span>
                      <span>{formatINR(calcSummary.totalTaxableAmount)}</span>
                    </div>
                    <div className="flex justify-between text-outline text-[11px]">
                      <span>GST Total</span>
                      <span>{formatINR(calcSummary.totalTax)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-black text-on-surface pt-1 border-t border-outline-variant/20">
                  <span className="text-xs">Grand Total</span>
                  <span className="text-secondary text-base">{formatINR(finalPayableTotal)}</span>
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div className="grid grid-cols-5 gap-1">
                {(['CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setPaymentMode(mode);
                      if (mode === 'UPI') setIsUpiModalOpen(true);
                      if (mode === 'SPLIT') setIsSplitModalOpen(true);
                    }}
                    className={`py-1 rounded-lg text-[9px] font-bold cursor-pointer transition-colors ${
                      paymentMode === mode
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface'
                    }`}
                  >
                    {mode === 'CREDIT' ? 'Udhaar' : mode}
                  </button>
                ))}
              </div>

              {/* Charge Button */}
              <button
                type="button"
                onClick={() => handleCheckout()}
                className="w-full py-2.5 bg-secondary text-on-secondary rounded-xl font-bold text-xs sm:text-sm shadow-md hover:bg-secondary/90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                <span>Charge {formatINR(finalPayableTotal)} & Print</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Modals & Overlays                                        */}
      {/* ======================================================== */}

      {/* Customer Selection Modal */}
      {isCustomerModalOpen && (
        <SelectPosPartyModal
          isOpen={isCustomerModalOpen}
          parties={parties}
          selectedParty={customer.party}
          onSelectParty={handleSelectCustomer}
          onClose={() => setIsCustomerModalOpen(false)}
        />
      )}

      {/* Custom Item Modal */}
      {isCustomItemModalOpen && (
        <CustomItemModal
          isOpen={isCustomItemModalOpen}
          onClose={() => setIsCustomItemModalOpen(false)}
          onAddCustomItem={(item, initialQty) => {
            addToCart(item, initialQty);
            audioService.playScanSuccess();
            setScanMessage({ text: `Added: ${item.name}` });
            setTimeout(() => setScanMessage(null), 2500);
          }}
        />
      )}

      {/* Parked / Held Bills Modal */}
      {isHoldModalOpen && (
        <HoldBillsModal
          isOpen={isHoldModalOpen}
          heldBills={heldBills}
          onResumeBill={handleResumeBill}
          onDiscardBill={handleDiscardHeldBill}
          onClearAll={handleClearAllHeld}
          onClose={() => setIsHoldModalOpen(false)}
        />
      )}

      {/* Dynamic UPI QR Code Modal */}
      {isUpiModalOpen && (
        <UpiQrModal
          isOpen={isUpiModalOpen}
          amount={finalPayableTotal}
          company={company}
          invoiceNumber={previewInvoiceNumber}
          onPaymentConfirmed={() => {
            setPaymentMode('UPI');
            handleCheckout('UPI');
          }}
          onClose={() => setIsUpiModalOpen(false)}
        />
      )}

      {/* Split Payment Modal */}
      {isSplitModalOpen && (
        <SplitPaymentModal
          isOpen={isSplitModalOpen}
          grandTotal={finalPayableTotal}
          hasCustomerSelected={!!customer.party}
          onConfirmSplit={(breakdown) => {
            // Save to state for display/reset purposes
            setSplitBreakdown(breakdown);
            setPaymentMode('SPLIT');
            // Pass breakdown DIRECTLY to avoid async state race (Bug fix)
            setIsSplitModalOpen(false);
            handleCheckout(undefined, breakdown);
          }}
          onClose={() => setIsSplitModalOpen(false)}
        />
      )}

      {/* Keyboard Shortcuts Cheat-sheet Modal */}
      {isShortcutsModalOpen && (
        <PosKeyboardShortcutsModal
          isOpen={isShortcutsModalOpen}
          onClose={() => setIsShortcutsModalOpen(false)}
        />
      )}

      {/* Post-Sale Checkout Success Modal */}
      {completedSale && (
        <PosCheckoutSuccessModal
          isOpen={!!completedSale}
          invoice={completedSale.invoice}
          company={company}
          changeDue={completedSale.changeDue}
          cashTendered={completedSale.cashTendered}
          onPrintThermal={() => setThermalPrintInvoice(completedSale.invoice)}
          onViewA4={() => {
            if (onViewInvoice) {
              onViewInvoice(completedSale.invoice);
            }
            setCompletedSale(null);
          }}
          onNextSale={handleStartNextSale}
        />
      )}

      {/* Thermal Receipt Print Modal */}
      {thermalPrintInvoice && (
        <ThermalPrintModal
          invoice={thermalPrintInvoice}
          company={company}
          onClose={() => setThermalPrintInvoice(null)}
        />
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
