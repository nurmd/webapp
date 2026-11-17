import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { InventoryItem } from '../../../models/item.ts';
import { hardwareScanner, audioService } from '../../../services/barcodeService.ts';

export interface UsePosCatalogProps {
  items: InventoryItem[];
  onAddToCart: (item: InventoryItem, initialQty?: number) => void;
}

export function usePosCatalog({ items, onAddToCart }: UsePosCatalogProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [catalogViewMode, setCatalogViewMode] = useState<'GRID' | 'LIST'>('GRID');
  const [scanMessage, setScanMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Unique Categories
  const categories = useMemo(() => {
    const list = Array.from(new Set(items.map((i) => i.category || 'General').filter(Boolean)));
    return ['ALL', 'FAST MOVERS', ...list];
  }, [items]);

  // Catalog Filtering (word-level matching tokens across name, barcode, sku, category, hsnSacCode)
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const words = q ? q.split(/\s+/).filter(Boolean) : [];

    return items.filter((i) => {
      const matchesSearch =
        words.length === 0 ||
        words.every((w) =>
          i.name.toLowerCase().includes(w) ||
          (i.barcode && i.barcode.toLowerCase().includes(w)) ||
          (i.sku && i.sku.toLowerCase().includes(w)) ||
          (i.category && i.category.toLowerCase().includes(w)) ||
          (i.hsnSacCode && i.hsnSacCode.toLowerCase().includes(w))
        );

      let matchesCategory = true;
      if (selectedCategory === 'FAST MOVERS') {
        matchesCategory = (i.currentStock || 0) > 0;
      } else if (selectedCategory !== 'ALL') {
        matchesCategory = (i.category || 'General').toLowerCase() === selectedCategory.toLowerCase();
      }

      return matchesSearch && matchesCategory;
    });
  }, [items, search, selectedCategory]);

  // Barcode & Item Search Handler
  const handleBarcodeScanned = useCallback((barcodeOrQuery: string) => {
    const clean = barcodeOrQuery.trim();
    if (!clean) return;
    const lower = clean.toLowerCase();

    // 1. Try exact match first (barcode, SKU, ID, or exact name)
    let found = items.find(
      (i) =>
        i.barcode === clean ||
        i.sku?.toLowerCase() === lower ||
        i.id === clean ||
        i.name.toLowerCase() === lower
    );

    // 2. If no exact match, find item containing the text typed (substring match)
    if (!found) {
      found = items.find(
        (i) =>
          i.name.toLowerCase().includes(lower) ||
          (i.barcode && i.barcode.toLowerCase().includes(lower)) ||
          (i.sku && i.sku.toLowerCase().includes(lower)) ||
          (i.hsnSacCode && i.hsnSacCode.toLowerCase().includes(lower))
      );
    }

    // 3. Multi-word search if multiple words typed
    if (!found) {
      const words = lower.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        found = items.find((i) =>
          words.every((w) =>
            i.name.toLowerCase().includes(w) ||
            (i.barcode && i.barcode.toLowerCase().includes(w)) ||
            (i.sku && i.sku.toLowerCase().includes(w)) ||
            (i.hsnSacCode && i.hsnSacCode.toLowerCase().includes(w))
          )
        );
      }
    }

    if (found) {
      onAddToCart(found);
      audioService.playScanSuccess();
      setScanMessage({ text: `Added: ${found.name}` });
      setTimeout(() => setScanMessage(null), 2500);
    } else {
      audioService.playScanError();
      setScanMessage({ text: `Item not found matching "${clean}"`, isError: true });
      setTimeout(() => setScanMessage(null), 3000);
    }
  }, [items, onAddToCart]);

  const handleBarcodeScannedRef = useRef(handleBarcodeScanned);
  handleBarcodeScannedRef.current = handleBarcodeScanned;

  // Hardware Scanner Gun Listener (Subscribed once on mount, 0 churn on cart/item updates)
  useEffect(() => {
    const unsub = hardwareScanner.subscribe((code) => {
      handleBarcodeScannedRef.current(code);
    });
    return unsub;
  }, []);

  // Keyboard shortcut tied to search (F2 or / to focus search input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');

      if (e.key === 'F2' || (e.key === '/' && !isInput)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    search,
    setSearch,
    selectedCategory,
    setSelectedCategory,
    catalogViewMode,
    setCatalogViewMode,
    categories,
    filteredItems,
    handleBarcodeScanned,
    searchInputRef,
    scanMessage,
    setScanMessage,
  };
}
