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
      setScanMessage({ text: `Added: ${found.name} (₹${found.salePrice})` });
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
      // Ignore if user is typing in regular text inputs other than global shortcuts
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
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        (i.hsnSacCode && i.hsnSacCode.includes(search));

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

  const updateCartLineDiscount = (itemId: string, discountPercent: number) => {
    setCart(
      cart.map((c) => (c.item.id === itemId ? { ...c, discountPercent } : c))
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
      gstRate: c.item.gstRate,
      discountPercent: c.discountPercent || 0,
      discountAmount: c.discountAmount || 0,
    }));
  }, [cart]);

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

  // Final Payable Grand Total (including additional charges and overall discount)
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

    // Remove from held list
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
  const handleCheckout = (modeOverride?: PaymentMode) => {
    if (cart.length === 0) return;

    const chosenMode = modeOverride || (paymentMode === 'SPLIT' ? 'CASH' : paymentMode);

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

    const isCreditSale = chosenMode === 'CREDIT';
    const isB2bInvoice = !!customer.gstin;

    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNumber: generateNextInvoiceNumber(
        company.invoicePrefix || 'POS-',
        db.getInvoices()
      ),
      invoiceType: isB2bInvoice ? 'B2B' : 'B2CS',
      date: new Date().toISOString().split('T')[0],
      partyId: customer.party?.id,
      partyName: customer.party
        ? customer.party.name
        : customer.phone
        ? `Retail (${customer.phone})`
        : 'Walk-in Retail Customer',
      partyGstin: customer.gstin,
      partyAddress: customer.party?.billingAddress || 'Local Retail Counter',
      partyStateCode: customer.stateCode,
      placeOfSupplyStateCode: customer.stateCode,
      isIntraState,
      items: invoiceItems,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: calcSummary.totalDiscount + overallDiscountAmt,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: calcSummary.totalCgst,
      totalSgst: calcSummary.totalSgst,
      totalIgst: calcSummary.totalIgst,
      totalCess: calcSummary.totalCess,
      totalTax: calcSummary.totalTax,
      roundOff: calcSummary.roundOff,
      shippingAmount: additionalCharges > 0 ? additionalCharges : undefined,
      grandTotal: finalPayableTotal,
      amountInWords: amountInWords(finalPayableTotal),
      paymentMode: chosenMode,
      paymentStatus: isCreditSale ? 'UNPAID' : 'PAID',
      paidAmount: isCreditSale ? 0 : finalPayableTotal,
      balanceAmount: isCreditSale ? finalPayableTotal : 0,
      notes: splitBreakdown
        ? `Split: Cash ₹${splitBreakdown.cash}, UPI ₹${splitBreakdown.upi}, Card ₹${splitBreakdown.card}, Credit ₹${splitBreakdown.credit}`
        : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onCompleteSale(newInvoice);
    audioService.playScanSuccess();

    // Trigger Success Screen
    setCompletedSale({
      invoice: newInvoice,
      changeDue: chosenMode === 'CASH' ? cashChangeDue : 0,
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
    <div className="flex flex-col md:grid md:grid-cols-12 min-h-[calc(100vh-64px)] pb-24 md:pb-0 bg-surface">
      {/* ======================================================== */}
      {/* Left Catalog Pane (md:col-span-7)                       */}
      {/* ======================================================== */}
      <div className="md:col-span-7 flex flex-col p-3 sm:p-4 border-r border-outline-variant/30 gap-2.5 overflow-y-auto">
        {/* Top Operational Status Ribbon */}
        <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-[11px] bg-surface-container-lowest p-2.5 rounded-2xl border border-outline-variant/20 shadow-xs flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 bg-secondary-container/60 text-on-secondary-container px-2.5 py-1 rounded-full font-bold text-xs">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              Counter #01
            </span>
            <span className="text-outline font-mono font-semibold">
              Bill #{previewInvoiceNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Parked Bills Button */}
            <button
              type="button"
              onClick={() => setIsHoldModalOpen(true)}
              className={`px-2.5 py-1 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                heldBills.length > 0
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shadow-xs animate-pulse-gentle'
                  : 'bg-surface-container text-outline hover:text-on-surface'
              }`}
              title="Parked / Held Bills (F7)"
            >
              <span className="material-symbols-outlined text-[16px]">pause_circle</span>
              <span>Held Bills ({heldBills.length})</span>
            </button>

            {/* Keyboard Shortcuts Button */}
            <button
              type="button"
              onClick={() => setIsShortcutsModalOpen(true)}
              className="w-7 h-7 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              title="Keyboard Shortcuts (?)"
            >
              <span className="material-symbols-outlined text-[16px]">help</span>
            </button>
          </div>
        </div>

        {/* Customer / Party Selection Card */}
        <div className="bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/25 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                customer.party
                  ? 'bg-secondary/10 text-secondary'
                  : 'bg-surface-container text-outline'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {customer.party ? 'person' : 'storefront'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                  {customer.party ? customer.party.name : 'Walk-in Retail Customer'}
                </span>
                {customer.isB2b ? (
                  <span className="text-[10px] bg-primary/10 text-primary font-mono px-1.5 py-0.2 rounded font-bold">
                    B2B GSTIN
                  </span>
                ) : (
                  <span className="text-[10px] bg-surface-container text-outline px-1.5 py-0.2 rounded font-semibold">
                    B2C
                  </span>
                )}
              </div>
              <div className="text-[11px] text-outline mt-0.5 truncate flex items-center gap-2">
                <span>{customer.phone || 'No phone entered'}</span>
                {customer.party && (
                  <>
                    <span>•</span>
                    <span
                      className={`font-semibold ${
                        (customer.party.currentBalance || 0) > 0
                          ? 'text-amber-600'
                          : 'text-secondary'
                      }`}
                    >
                      Bal: {formatINR(customer.party.currentBalance || 0)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {customer.party && (
              <button
                type="button"
                onClick={() => handleSelectCustomer(null)}
                className="w-7 h-7 rounded-xl bg-surface-container hover:bg-surface-container-high text-outline flex items-center justify-center cursor-pointer"
                title="Reset to Walk-in Customer"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              className="px-3 py-1.5 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl text-xs font-bold border border-outline-variant/30 flex items-center gap-1 shadow-xs cursor-pointer active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[15px]">person_search</span>
              <span>{customer.party ? 'Change' : 'Select Customer'}</span>
            </button>
          </div>
        </div>

        {/* Scan & Quick SKU Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 px-3.5 py-2.5 shadow-xs focus-within:border-secondary focus-within:ring-1 focus-within:ring-secondary transition-all">
            <span className="material-symbols-outlined text-outline text-[20px] mr-2">
              barcode_scanner
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Scan Barcode or Search Item / SKU / HSN (F2 or /)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs sm:text-sm text-on-surface placeholder:text-outline outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-outline hover:text-on-surface ml-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Camera Scanner Button */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="h-10 px-3.5 bg-primary text-on-primary rounded-2xl flex items-center gap-1.5 font-label-md text-xs font-semibold shadow-xs active:scale-95 transition-transform flex-shrink-0 cursor-pointer"
            title="Scan barcode with device camera"
          >
            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
            <span className="hidden sm:inline">Camera</span>
          </button>

          {/* Add Custom Non-Catalog Item Button */}
          <button
            type="button"
            onClick={() => setIsCustomItemModalOpen(true)}
            className="h-10 px-3 bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:border-secondary rounded-2xl flex items-center gap-1 text-xs font-bold shadow-xs active:scale-95 transition-transform flex-shrink-0 cursor-pointer"
            title="Add Custom / Service Line Item (F8)"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">add_box</span>
            <span className="hidden sm:inline">+ Custom</span>
          </button>
        </div>

        {/* Scan Notification Alert Banner */}
        {scanMessage && (
          <div
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md animate-fade-in ${
              scanMessage.isError
                ? 'bg-error text-on-error'
                : 'bg-secondary text-on-secondary'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {scanMessage.isError ? 'error' : 'check_circle'}
            </span>
            <span>{scanMessage.text}</span>
          </div>
        )}

        {/* Category Pills Carousel & View Mode Toggle */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1 flex-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-xs transition-all flex-shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-secondary text-on-secondary font-bold'
                    : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 hover:bg-surface-container-low'
                }`}
              >
                {cat === 'ALL' ? 'All Items' : cat}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCatalogViewMode('GRID')}
              className={`p-1.5 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                catalogViewMode === 'GRID'
                  ? 'bg-secondary text-on-secondary'
                  : 'text-outline hover:text-on-surface'
              }`}
              title="Grid View"
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
            </button>
            <button
              type="button"
              onClick={() => setCatalogViewMode('LIST')}
              className={`p-1.5 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                catalogViewMode === 'LIST'
                  ? 'bg-secondary text-on-secondary'
                  : 'text-outline hover:text-on-surface'
              }`}
              title="Dense List View"
            >
              <span className="material-symbols-outlined text-[16px]">view_list</span>
            </button>
          </div>
        </div>

        {/* Items Section Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-[18px]">
              inventory_2
            </span>
            <h2 className="font-headline-sm text-xs sm:text-sm font-bold text-on-surface">
              Catalog Items ({filteredItems.length})
            </h2>
          </div>
          <span className="text-[11px] text-outline">Tap item to punch into cart</span>
        </div>

        {/* Catalog Items Display (Grid or Dense List) */}
        {filteredItems.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-outline gap-2 bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/40">
            <span className="material-symbols-outlined text-4xl text-outline-variant">search_off</span>
            <p className="text-xs font-semibold">No items match your filter.</p>
            <button
              type="button"
              onClick={() => setIsCustomItemModalOpen(true)}
              className="text-xs text-secondary font-bold hover:underline cursor-pointer"
            >
              + Add Custom Item to Cart
            </button>
          </div>
        ) : catalogViewMode === 'GRID' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pb-6">
            {filteredItems.map((item) => {
              const inCartQty = cart.find((c) => c.item.id === item.id)?.qty || 0;
              const isLowStock = (item.currentStock || 0) <= (item.minStockAlert || 0);

              return (
                <div
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`bg-surface-container-lowest rounded-2xl p-3 shadow-xs border transition-all cursor-pointer flex flex-col justify-between select-none relative group ${
                    inCartQty > 0
                      ? 'border-secondary ring-1 ring-secondary/50 bg-secondary-container/5'
                      : 'border-outline-variant/30 hover:border-secondary hover:shadow-sm'
                  }`}
                >
                  {/* Top line with Stock Badge and GST Slab */}
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                        isLowStock
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          : 'bg-surface-container text-outline'
                      }`}
                    >
                      Stock: {item.currentStock}
                    </span>

                    <span className="text-[10px] bg-secondary-container/40 text-on-secondary-container px-1 rounded font-bold font-mono">
                      {item.gstRate}% GST
                    </span>
                  </div>

                  {/* Item Details */}
                  <div className="min-w-0">
                    <p className="font-headline-sm text-xs sm:text-sm font-bold text-on-surface truncate group-hover:text-secondary transition-colors">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-outline truncate mt-0.5">
                      {item.hsnSacCode ? `HSN ${item.hsnSacCode}` : item.category || 'General'}
                    </p>
                  </div>

                  {/* Price and Add Action */}
                  <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-headline-sm text-xs sm:text-sm font-black text-on-surface font-tabular-data">
                        {formatINR(item.salePrice)}
                      </span>
                      <span className="text-[10px] text-outline">/{item.unit.toLowerCase()}</span>
                    </div>

                    {inCartQty > 0 ? (
                      <span className="h-6 px-2 bg-secondary text-on-secondary rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs">
                        <span>{inCartQty} in cart</span>
                      </span>
                    ) : (
                      <span className="w-7 h-7 bg-surface-container group-hover:bg-secondary group-hover:text-on-secondary rounded-xl text-outline flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Dense List View */
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 shadow-xs pb-6">
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
                      <span className="text-[10px] bg-secondary-container/40 text-on-secondary-container px-1 rounded font-bold font-mono">
                        {item.gstRate}%
                      </span>
                    </div>
                    <div className="text-[11px] text-outline mt-0.5 flex items-center gap-2">
                      <span>HSN: {item.hsnSacCode || '-'}</span>
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
                      <span className="material-symbols-outlined text-[15px]">
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

      {/* ======================================================== */}
      {/* Right Desktop/Tablet Cart & Checkout Pane (md:col-span-5) */}
      {/* ======================================================== */}
      <div className="hidden md:flex md:col-span-5 bg-surface-container-low flex-col h-full border-t md:border-t-0 overflow-hidden">
        {/* Cart Header */}
        <div className="p-3.5 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-lowest shadow-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">shopping_cart</span>
            <span className="font-label-md text-sm font-bold text-on-surface">
              Active Bill ({totalCartCount} Items)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleHoldBill}
                  className="px-2.5 py-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  title="Park this customer's bill (F4)"
                >
                  <span className="material-symbols-outlined text-[14px]">pause</span>
                  <span>Hold (F4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Clear all items from current cart?')) {
                      setCart([]);
                    }
                  }}
                  className="text-xs text-error font-medium hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {/* Itemized Cart List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-outline gap-2">
              <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-outline-variant">
                <span className="material-symbols-outlined text-3xl">point_of_sale</span>
              </div>
              <p className="text-xs font-semibold text-on-surface">POS Cart is Empty</p>
              <p className="text-[11px] text-outline text-center max-w-xs">
                Scan barcode guns or tap catalog items on the shelf to ring up the sale.
              </p>
            </div>
          ) : (
            cart.map(({ item, qty, unitPrice, discountPercent }) => (
              <div
                key={item.id}
                className="bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/20 shadow-xs flex flex-col gap-2 hover:border-secondary/30 transition-all"
              >
                {/* Line 1: Item Name, Rate, Delete */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-label-md text-xs font-bold text-on-surface truncate block">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-outline">
                      HSN {item.hsnSacCode || '-'} • {item.gstRate}% GST
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="text-outline hover:text-error cursor-pointer p-0.5"
                    title="Remove item"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>

                {/* Line 2: Quantity Controls, Unit Price Input, and Subtotal */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/10">
                  {/* Quantity Stepper & Inline Edit */}
                  <div className="flex items-center gap-1 bg-surface-container-low rounded-xl p-0.5 border border-outline-variant/30">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, qty - 1)}
                      className="w-6 h-6 rounded-lg bg-surface-container-lowest hover:bg-surface-container-high flex items-center justify-center font-bold text-xs cursor-pointer"
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
                      className="w-10 text-center text-xs font-bold bg-transparent outline-none font-tabular-data"
                    />
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.id, qty + 1)}
                      className="w-6 h-6 rounded-lg bg-surface-container-lowest hover:bg-surface-container-high flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  {/* Unit Price Rate Input */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-outline">Rate ₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={unitPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateCartPrice(item.id, val);
                      }}
                      className="w-16 bg-surface-container-low border border-outline-variant/30 rounded-lg px-1.5 py-0.5 text-xs font-bold text-on-surface outline-none focus:border-secondary font-tabular-data"
                    />
                  </div>

                  {/* Line Total */}
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

        {/* Cart Summary & Checkout Dock */}
        {cart.length > 0 && (
          <div className="p-3.5 bg-surface-container-lowest border-t border-outline-variant/30 space-y-2.5 shadow-xl">
            {/* Bill Level Adjustments (Discount & Additional Charges) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-surface-container-low px-2 py-1.5 rounded-xl border border-outline-variant/20">
                <span className="text-[11px] text-outline font-semibold">Bill Disc</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={cartDiscountValue || ''}
                  onChange={(e) => setCartDiscountValue(parseFloat(e.target.value) || 0)}
                  className="w-12 bg-transparent text-xs font-bold outline-none font-tabular-data text-on-surface"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCartDiscountType(cartDiscountType === 'FLAT' ? 'PERCENT' : 'FLAT')
                  }
                  className="text-[10px] font-bold text-secondary px-1 py-0.2 rounded bg-surface-container-lowest border border-outline-variant/30 cursor-pointer"
                >
                  {cartDiscountType === 'FLAT' ? '₹' : '%'}
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-surface-container-low px-2 py-1.5 rounded-xl border border-outline-variant/20">
                <span className="text-[11px] text-outline font-semibold">Extra/Ship ₹</span>
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

            {/* Tax & Grand Total Breakdown */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-outline">
                <span>Taxable Value</span>
                <span className="font-tabular-data">{formatINR(calcSummary.totalTaxableAmount)}</span>
              </div>
              <div className="flex justify-between text-outline items-center">
                <button
                  type="button"
                  onClick={() => setShowTaxBreakdown(!showTaxBreakdown)}
                  className="flex items-center gap-0.5 text-secondary font-semibold hover:underline cursor-pointer"
                >
                  <span>Total GST ({isIntraState ? 'CGST+SGST' : 'IGST'})</span>
                  <span className="material-symbols-outlined text-[14px]">
                    {showTaxBreakdown ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                <span className="font-tabular-data">{formatINR(calcSummary.totalTax)}</span>
              </div>

              {/* Detailed GST Slabs when expanded */}
              {showTaxBreakdown && (
                <div className="p-2 bg-surface-container-low rounded-xl border border-outline-variant/20 space-y-1 text-[11px] text-on-surface-variant">
                  {isIntraState ? (
                    <>
                      <div className="flex justify-between">
                        <span>Output CGST</span>
                        <span>{formatINR(calcSummary.totalCgst)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Output SGST</span>
                        <span>{formatINR(calcSummary.totalSgst)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span>Output IGST (Inter-State)</span>
                      <span>{formatINR(calcSummary.totalIgst)}</span>
                    </div>
                  )}
                  {calcSummary.roundOff !== 0 && (
                    <div className="flex justify-between text-outline">
                      <span>Round Off</span>
                      <span>{calcSummary.roundOff > 0 ? `+₹${calcSummary.roundOff}` : `₹${calcSummary.roundOff}`}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Grand Total */}
              <div className="flex justify-between font-black text-base text-on-surface pt-1.5 border-t border-outline-variant/20 items-baseline">
                <span>Grand Total</span>
                <span className="text-secondary text-xl font-tabular-data">
                  {formatINR(finalPayableTotal)}
                </span>
              </div>
            </div>

            {/* Payment Mode Selector Tabs */}
            <div className="grid grid-cols-5 gap-1 pt-1">
              {(['CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode);
                    if (mode === 'UPI') setIsUpiModalOpen(true);
                    if (mode === 'SPLIT') setIsSplitModalOpen(true);
                  }}
                  className={`py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-colors ${
                    paymentMode === mode
                      ? 'bg-secondary text-on-secondary shadow-xs'
                      : 'bg-surface-container-low border border-outline-variant/25 text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {mode === 'CREDIT' ? 'Udhaar' : mode}
                </button>
              ))}
            </div>

            {/* Cash Tendered Calculator (Visible when CASH is selected) */}
            {paymentMode === 'CASH' && (
              <div className="bg-surface-container-low p-2 rounded-xl border border-outline-variant/20 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-outline font-semibold">Cash Tendered:</span>
                  <input
                    type="number"
                    placeholder={`e.g. ${finalPayableTotal}`}
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="w-24 bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-2 py-1 text-xs font-black text-on-surface outline-none focus:border-secondary font-tabular-data text-right"
                  />
                </div>

                {/* Quick Tender Preset Chips */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  <button
                    type="button"
                    onClick={() => setCashTendered(finalPayableTotal.toString())}
                    className="px-2 py-0.5 bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-[10px] font-bold text-secondary cursor-pointer hover:bg-surface-container"
                  >
                    Exact
                  </button>
                  {[50, 100, 200, 500, 2000].map((preset) => {
                    if (preset < finalPayableTotal) return null;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCashTendered(preset.toString())}
                        className="px-2 py-0.5 bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-[10px] font-bold text-outline hover:text-on-surface cursor-pointer"
                      >
                        ₹{preset}
                      </button>
                    );
                  })}
                </div>

                {/* Change Due Return Alert */}
                {cashChangeDue > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-outline-variant/15 font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Return Change:</span>
                    <span className="font-tabular-data text-sm font-black">
                      {formatINR(cashChangeDue)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Charge Button */}
            <button
              type="button"
              onClick={() => handleCheckout()}
              className="w-full py-3 bg-secondary text-on-secondary rounded-2xl font-black text-sm shadow-md hover:bg-secondary/90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">payments</span>
              <span>Charge {formatINR(finalPayableTotal)} & Print (F9)</span>
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* Mobile Floating Sticky Cart Bar                          */}
      {/* ======================================================== */}
      {cart.length > 0 && !isMobileCartDrawerOpen && (
        <div className="md:hidden fixed bottom-16 left-3 right-3 z-40 bg-on-surface text-surface rounded-2xl p-3 shadow-2xl flex items-center justify-between animate-fade-in border border-surface-container-highest/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-black text-sm shadow-xs">
              {totalCartCount}
            </div>
            <div>
              <div className="font-label-md text-xs text-surface-variant">POS Total</div>
              <div className="font-currency-display-mobile text-base font-bold text-surface">
                {formatINR(finalPayableTotal)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileCartDrawerOpen(true)}
            className="px-4 py-2 bg-secondary text-on-secondary rounded-xl font-label-md text-xs font-bold shadow-md active:scale-95 transition-transform flex items-center gap-1 cursor-pointer"
          >
            <span>View Bill</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* Mobile Cart & Checkout Modal Drawer                      */}
      {/* ======================================================== */}
      {isMobileCartDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-fade-in">
          <div className="bg-surface-container-lowest rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border-t border-outline-variant/30">
            {/* Header */}
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">
                  shopping_cart
                </span>
                <span className="font-headline-sm text-base font-bold text-on-surface">
                  Current Bill ({totalCartCount} Items)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleHoldBill}
                  className="px-2.5 py-1 text-xs text-amber-700 bg-amber-500/10 rounded-lg font-bold"
                >
                  Hold Bill
                </button>
                <button
                  onClick={() => setIsMobileCartDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {cart.map(({ item, qty, unitPrice }) => (
                <div
                  key={item.id}
                  className="bg-surface-container-low/70 p-3 rounded-2xl border border-outline-variant/20 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-label-md text-xs font-bold text-on-surface truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-outline mt-0.5">
                      {formatINR(unitPrice)} × {qty} = {formatINR(unitPrice * qty)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => updateCartQty(item.id, qty - 1)}
                      className="w-7 h-7 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-xs font-bold">{qty}</span>
                    <button
                      onClick={() => updateCartQty(item.id, qty + 1)}
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
            <div className="p-4 bg-surface-container-low/50 border-t border-outline-variant/20 space-y-3">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-outline">
                  <span>Taxable Subtotal</span>
                  <span>{formatINR(calcSummary.totalTaxableAmount)}</span>
                </div>
                <div className="flex justify-between text-outline">
                  <span>GST Total</span>
                  <span>{formatINR(calcSummary.totalTax)}</span>
                </div>
                <div className="flex justify-between font-black text-base text-on-surface pt-1 border-t border-outline-variant/20">
                  <span>Grand Total</span>
                  <span className="text-secondary text-lg">{formatINR(finalPayableTotal)}</span>
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
                    className={`py-1.5 rounded-xl text-[10px] font-bold cursor-pointer transition-colors ${
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
                className="w-full py-3 bg-secondary text-on-secondary rounded-2xl font-black text-sm shadow-md hover:bg-secondary/90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">print</span>
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
            setScanMessage({ text: `Added Custom: ${item.name}` });
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
            setSplitBreakdown(breakdown);
            setPaymentMode('SPLIT');
            handleCheckout('CASH');
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
