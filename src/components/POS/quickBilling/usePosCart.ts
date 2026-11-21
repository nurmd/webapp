import React, { useState, useCallback, useMemo } from 'react';
import { InventoryItem, ItemPriceMode } from '../../../models/item.ts';
import { roundQuantity } from '../../../core/utils/formatters.ts';
import { exclusiveFromInclusive, inclusiveFromExclusive } from '../../../core/gst/pricing.ts';
import { PosCartItem, createPosCartItem } from '../types.ts';

export interface UsePosCartOptions {
  isGstActive?: boolean;
  isCompositionScheme?: boolean;
}

export interface UsePosCartReturn {
  cart: PosCartItem[];
  setCart: React.Dispatch<React.SetStateAction<PosCartItem[]>>;
  cartDiscountType: 'PERCENT' | 'FLAT';
  setCartDiscountType: React.Dispatch<React.SetStateAction<'PERCENT' | 'FLAT'>>;
  cartDiscountValue: number;
  setCartDiscountValue: React.Dispatch<React.SetStateAction<number>>;
  additionalCharges: number;
  setAdditionalCharges: React.Dispatch<React.SetStateAction<number>>;
  addToCart: (item: InventoryItem, initialQty?: number) => void;
  updateCartQty: (itemId: string, qty: number) => void;
  updateCartExclusivePrice: (itemId: string, raw: number | string) => void;
  updateCartInclusivePrice: (itemId: string, raw: number | string) => void;
  toggleCartPriceMode: (itemId: string) => void;
  updateCartPrice: (itemId: string, unitPrice: number) => void;
  updateCartPriceTier: (itemId: string, tier: 'RETAIL' | 'SEMI_WHOLESALE' | 'WHOLESALE') => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
}

export function usePosCart(options: UsePosCartOptions = {}): UsePosCartReturn {
  const { isGstActive = true, isCompositionScheme = false } = options;

  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [cartDiscountType, setCartDiscountType] = useState<'PERCENT' | 'FLAT'>('FLAT');
  const [cartDiscountValue, setCartDiscountValue] = useState<number>(0);
  const [additionalCharges, setAdditionalCharges] = useState<number>(0);

  const addToCart = useCallback((item: InventoryItem, initialQty = 1) => {
    setCart((prevCart) => {
      const existing = prevCart.find((c) => c.item.id === item.id);
      if (existing) {
        return prevCart.map((c) =>
          c.item.id === item.id ? { ...c, qty: c.qty + initialQty } : c
        );
      }
      const newItem = createPosCartItem(item, initialQty);
      if (!isGstActive || isCompositionScheme) {
        newItem.unitPriceInclusive = newItem.unitPrice;
        newItem.priceMode = 'EXCLUSIVE';
        newItem.cessRate = 0;
      }
      return [...prevCart, newItem];
    });
  }, [isGstActive, isCompositionScheme]);

  const removeFromCart = useCallback((itemId: string) => {
    setCart((prevCart) => prevCart.filter((c) => c.item.id !== itemId));
  }, []);

  const updateCartQty = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    const cleanQty = roundQuantity(qty, 4);
    setCart((prevCart) =>
      prevCart.map((c) => (c.item.id === itemId ? { ...c, qty: cleanQty } : c))
    );
  }, [removeFromCart]);

  const updateCartExclusivePrice = useCallback((itemId: string, raw: number | string) => {
    const value = Math.max(0, Number(raw) || 0);
    setCart((prevCart) =>
      prevCart.map((c) => {
        if (c.item.id !== itemId) return c;
        if (!isGstActive || isCompositionScheme) {
          return {
            ...c,
            unitPrice: value,
            unitPriceInclusive: value,
            priceMode: 'EXCLUSIVE',
          };
        }
        const gst = Number(c.item.gstRate) || 0;
        return {
          ...c,
          unitPrice: value,
          unitPriceInclusive: inclusiveFromExclusive(value, gst),
          priceMode: 'EXCLUSIVE',
        };
      })
    );
  }, [isGstActive, isCompositionScheme]);

  const updateCartInclusivePrice = useCallback((itemId: string, raw: number | string) => {
    const value = Math.max(0, Number(raw) || 0);
    setCart((prevCart) =>
      prevCart.map((c) => {
        if (c.item.id !== itemId) return c;
        if (!isGstActive || isCompositionScheme) {
          return {
            ...c,
            unitPrice: value,
            unitPriceInclusive: value,
            priceMode: 'EXCLUSIVE',
          };
        }
        const gst = Number(c.item.gstRate) || 0;
        return {
          ...c,
          unitPrice: exclusiveFromInclusive(value, gst),
          unitPriceInclusive: value,
          priceMode: 'INCLUSIVE',
        };
      })
    );
  }, [isGstActive, isCompositionScheme]);

  const toggleCartPriceMode = useCallback((itemId: string) => {
    if (!isGstActive || isCompositionScheme) return;
    setCart((prevCart) =>
      prevCart.map((c) => {
        if (c.item.id !== itemId) return c;
        const currentMode = c.priceMode ?? 'EXCLUSIVE';
        const nextMode: ItemPriceMode = currentMode === 'INCLUSIVE' ? 'EXCLUSIVE' : 'INCLUSIVE';
        return {
          ...c,
          priceMode: nextMode,
        };
      })
    );
  }, [isGstActive, isCompositionScheme]);

  const updateCartPrice = useCallback((itemId: string, unitPrice: number) => {
    updateCartExclusivePrice(itemId, unitPrice);
  }, [updateCartExclusivePrice]);

  const updateCartPriceTier = useCallback((itemId: string, tier: 'RETAIL' | 'SEMI_WHOLESALE' | 'WHOLESALE') => {
    setCart((prevCart) =>
      prevCart.map((c) => {
        if (c.item.id !== itemId) return c;
        let basePrice = c.item.salePrice || 0;
        if (tier === 'SEMI_WHOLESALE' && c.item.semiWholesalePrice && c.item.semiWholesalePrice > 0) {
          basePrice = c.item.semiWholesalePrice;
        } else if (tier === 'WHOLESALE' && c.item.wholesalePrice && c.item.wholesalePrice > 0) {
          basePrice = c.item.wholesalePrice;
        }

        if (!isGstActive || isCompositionScheme) {
          return {
            ...c,
            priceTier: tier,
            unitPrice: basePrice,
            unitPriceInclusive: basePrice,
            priceMode: 'EXCLUSIVE',
          };
        }

        const gst = Number(c.item.gstRate) || 0;
        const mode = c.priceMode ?? 'EXCLUSIVE';
        return {
          ...c,
          priceTier: tier,
          unitPrice: mode === 'INCLUSIVE' ? exclusiveFromInclusive(basePrice, gst) : basePrice,
          unitPriceInclusive: mode === 'INCLUSIVE' ? basePrice : inclusiveFromExclusive(basePrice, gst),
        };
      })
    );
  }, [isGstActive, isCompositionScheme]);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  return useMemo(() => ({
    cart,
    setCart,
    cartDiscountType,
    setCartDiscountType,
    cartDiscountValue,
    setCartDiscountValue,
    additionalCharges,
    setAdditionalCharges,
    addToCart,
    updateCartQty,
    updateCartExclusivePrice,
    updateCartInclusivePrice,
    toggleCartPriceMode,
    updateCartPrice,
    updateCartPriceTier,
    removeFromCart,
    clearCart,
  }), [
    cart,
    cartDiscountType,
    cartDiscountValue,
    additionalCharges,
    addToCart,
    updateCartQty,
    updateCartExclusivePrice,
    updateCartInclusivePrice,
    toggleCartPriceMode,
    updateCartPrice,
    updateCartPriceTier,
    removeFromCart,
    clearCart,
  ]);
}
