import React, { useState, useEffect, useCallback } from 'react';
import { PosCartItem, PosCustomerState, HeldBill } from '../types.ts';
import { PaymentMode } from '../../../models/invoice.ts';
import { ItemPriceMode } from '../../../models/item.ts';
import { exclusiveFromInclusive, inclusiveFromExclusive } from '../../../core/gst/pricing.ts';
import { audioService } from '../../../services/barcodeService.ts';

export const HELD_BILLS_STORAGE_KEY = 'vyapar_pos_held_bills';

export function normalizeHeldCart(
  cartItems: PosCartItem[],
  isGstActive = true,
  isCompositionScheme = false
): PosCartItem[] {
  return cartItems.map((c) => {
    const item = c.item;
    const gst = (!isGstActive || isCompositionScheme) ? 0 : (item.gstRate ?? 18);
    const mode: ItemPriceMode = (!isGstActive || isCompositionScheme)
      ? 'EXCLUSIVE'
      : (c.priceMode || 'EXCLUSIVE');
    let excl = Number(c.unitPrice ?? item.salePrice ?? 0);
    let incl = Number(c.unitPriceInclusive);
    if (!isGstActive || isCompositionScheme) {
      incl = excl;
    } else if (mode === 'EXCLUSIVE') {
      incl = inclusiveFromExclusive(excl, gst);
    } else {
      if (!Number.isFinite(incl) || incl <= 0) {
        incl = inclusiveFromExclusive(excl, gst);
      }
      excl = exclusiveFromInclusive(incl, gst);
    }
    return {
      ...c,
      unitPrice: excl,
      unitPriceInclusive: incl,
      priceMode: mode,
      cessRate: c.cessRate !== undefined ? Number(c.cessRate) || 0 : (item.cessRate ?? 0),
    };
  });
}

export interface UseHeldBillsProps {
  cart: PosCartItem[];
  customer: PosCustomerState;
  cartDiscountType: 'PERCENT' | 'FLAT';
  cartDiscountValue: number;
  additionalCharges: number;
  paymentMode: PaymentMode | 'SPLIT';
  finalPayableTotal: number;
  companyStateCode?: string;
  isGstActive?: boolean;
  isCompositionScheme?: boolean;
  setCart: React.Dispatch<React.SetStateAction<PosCartItem[]>>;
  setCustomer: React.Dispatch<React.SetStateAction<PosCustomerState>>;
  setCartDiscountType: React.Dispatch<React.SetStateAction<'PERCENT' | 'FLAT'>>;
  setCartDiscountValue: React.Dispatch<React.SetStateAction<number>>;
  setAdditionalCharges: React.Dispatch<React.SetStateAction<number>>;
  setPaymentMode: React.Dispatch<React.SetStateAction<PaymentMode | 'SPLIT'>>;
  setCashTendered?: React.Dispatch<React.SetStateAction<string>>;
  setIsMobileCartDrawerOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  setScanMessage?: (msg: { text: string; isError?: boolean } | null) => void;
}

export function useHeldBills({
  cart,
  customer,
  cartDiscountType,
  cartDiscountValue,
  additionalCharges,
  paymentMode,
  finalPayableTotal,
  companyStateCode,
  isGstActive = true,
  isCompositionScheme = false,
  setCart,
  setCustomer,
  setCartDiscountType,
  setCartDiscountValue,
  setAdditionalCharges,
  setPaymentMode,
  setCashTendered,
  setIsMobileCartDrawerOpen,
  setScanMessage,
}: UseHeldBillsProps) {
  // Held bills state with localStorage persistence
  const [heldBills, setHeldBills] = useState<HeldBill[]>(() => {
    try {
      const saved = localStorage.getItem(HELD_BILLS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [pendingResumeBill, setPendingResumeBill] = useState<HeldBill | null>(null);

  // Persist held bills
  useEffect(() => {
    try {
      localStorage.setItem(HELD_BILLS_STORAGE_KEY, JSON.stringify(heldBills));
    } catch (e) {
      console.error('Failed to save held bills:', e);
    }
  }, [heldBills]);

  // Hold / Park Current Bill
  const handleHoldBill = useCallback(() => {
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

    setHeldBills((prev) => [newHold, ...prev]);
    audioService.playScanSuccess();
    setScanMessage?.({ text: `Bill parked as ${newHold.label}` });
    setTimeout(() => setScanMessage?.(null), 2500);

    // Reset current active counter
    setCart([]);
    setCustomer({
      party: null,
      phone: '',
      isB2b: false,
      stateCode: companyStateCode || '27',
    });
    setCartDiscountValue(0);
    setAdditionalCharges(0);
    setCashTendered?.('');
    setIsMobileCartDrawerOpen?.(false);
  }, [
    cart,
    heldBills.length,
    customer,
    cartDiscountType,
    cartDiscountValue,
    additionalCharges,
    paymentMode,
    finalPayableTotal,
    setScanMessage,
    setCart,
    setCustomer,
    companyStateCode,
    setCartDiscountValue,
    setAdditionalCharges,
    setCashTendered,
    setIsMobileCartDrawerOpen,
  ]);

  const applyResumeBill = useCallback((bill: HeldBill) => {
    setCart(normalizeHeldCart(bill.cart, isGstActive, isCompositionScheme));
    setCustomer(bill.customer);
    setCartDiscountType(bill.cartDiscount.type);
    setCartDiscountValue(bill.cartDiscount.value);
    setAdditionalCharges(bill.additionalCharges);
    setPaymentMode(bill.paymentMode);

    setHeldBills((prev) => prev.filter((b) => b.id !== bill.id));
    audioService.playScanSuccess();
    setScanMessage?.({ text: `Resumed ${bill.label}` });
    setTimeout(() => setScanMessage?.(null), 2500);
  }, [
    isGstActive,
    isCompositionScheme,
    setCart,
    setCustomer,
    setCartDiscountType,
    setCartDiscountValue,
    setAdditionalCharges,
    setPaymentMode,
    setScanMessage,
  ]);

  const handleResumeBill = useCallback((bill: HeldBill) => {
    if (cart.length > 0) {
      setPendingResumeBill(bill);
      return;
    }
    applyResumeBill(bill);
  }, [cart.length, applyResumeBill]);

  const handleDiscardHeldBill = useCallback((billId: string) => {
    setHeldBills((prev) => prev.filter((b) => b.id !== billId));
  }, []);

  const handleClearAllHeld = useCallback(() => {
    setHeldBills([]);
  }, []);

  return {
    heldBills,
    setHeldBills,
    pendingResumeBill,
    setPendingResumeBill,
    handleHoldBill,
    handleResumeBill,
    applyResumeBill,
    handleDiscardHeldBill,
    handleClearAllHeld,
  };
}
