import React, { useEffect, useRef } from 'react';
import { AppTab } from '../components/Shell/Drawer.tsx';
import { rbac } from '../services/rbac.ts';

export interface ShortcutItem {
  keyLabel: string;
  keyChar: string;
  tab?: AppTab;
  action?: 'toggle_help' | 'close_help';
  label: string;
  description: string;
  mnemonic?: string;
  category: 'Navigation' | 'General';
}

export const SHORTCUT_TAB_MAP: Record<string, AppTab> = {
  d: 'dashboard',
  s: 'sales',
  p: 'payment_in',
  b: 'purchases',
  o: 'payment_out',
  r: 'parties',
  c: 'cash_bank',
  i: 'inventory',
  e: 'expenses',
  a: 'reports',
  g: 'accounting',
  k: 'pos',
  t: 'settings',
  m: 'menu',
};

export const KEYBOARD_SHORTCUTS: ShortcutItem[] = [
  { keyLabel: 'Alt + D', keyChar: 'd', tab: 'dashboard', label: 'Dashboard', description: 'Overview and business summary', category: 'Navigation' },
  { keyLabel: 'Alt + S', keyChar: 's', tab: 'sales', label: 'Sales', description: 'Invoices and sale records', category: 'Navigation' },
  { keyLabel: 'Alt + P', keyChar: 'p', tab: 'payment_in', label: 'Payment In', description: 'Customer receipts and payments', category: 'Navigation' },
  { keyLabel: 'Alt + B', keyChar: 'b', tab: 'purchases', label: 'Purchases', description: 'Vendor bills and purchase orders (B for Bills)', mnemonic: 'B', category: 'Navigation' },
  { keyLabel: 'Alt + O', keyChar: 'o', tab: 'payment_out', label: 'Payment Out', description: 'Vendor payments and disbursements', category: 'Navigation' },
  { keyLabel: 'Alt + R', keyChar: 'r', tab: 'parties', label: 'Parties', description: 'Customers and suppliers (R for paRties)', mnemonic: 'R', category: 'Navigation' },
  { keyLabel: 'Alt + C', keyChar: 'c', tab: 'cash_bank', label: 'Cash & Bank', description: 'Accounts, passbook & bank transfers', category: 'Navigation' },
  { keyLabel: 'Alt + I', keyChar: 'i', tab: 'inventory', label: 'Inventory', description: 'Stock catalog, items & pricing', category: 'Navigation' },
  { keyLabel: 'Alt + E', keyChar: 'e', tab: 'expenses', label: 'Expenses', description: 'Business expense tracking', category: 'Navigation' },
  { keyLabel: 'Alt + A', keyChar: 'a', tab: 'reports', label: 'Reports', description: 'Financial statements & analytics (A for Analytics)', mnemonic: 'A', category: 'Navigation' },
  { keyLabel: 'Alt + G', keyChar: 'g', tab: 'accounting', label: 'Accounting', description: 'Daybook and journal registers', category: 'Navigation' },
  { keyLabel: 'Alt + K', keyChar: 'k', tab: 'pos', label: 'POS Checkout', description: 'Quick billing counter (K for checKout)', mnemonic: 'K', category: 'Navigation' },
  { keyLabel: 'Alt + T', keyChar: 't', tab: 'settings', label: 'Settings', description: 'Company and app configuration', category: 'Navigation' },
  { keyLabel: 'Alt + M', keyChar: 'm', tab: 'menu', label: 'Menu Hub', description: 'Navigation menu and all features', category: 'Navigation' },
  { keyLabel: 'Alt + H', keyChar: 'h', action: 'toggle_help', label: 'Shortcuts Help', description: 'Toggle keyboard shortcuts guide', category: 'General' },
  { keyLabel: '?', keyChar: '?', action: 'toggle_help', label: 'Shortcuts Help', description: 'Press ? (Shift + /) anywhere to view shortcuts', category: 'General' },
  { keyLabel: 'Esc', keyChar: 'Escape', action: 'close_help', label: 'Close Overlay', description: 'Close shortcut help or modal', category: 'General' },
];

/**
 * Checks if an event target is an active text input or contentEditable area
 * where shortcuts should not interfere with standard typing.
 */
export function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  const contentEditable = target.getAttribute('contenteditable');
  if (contentEditable !== null && contentEditable !== 'false') {
    return true;
  }
  if (typeof target.closest === 'function') {
    const parent = target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
    if (parent) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes keyboard event key/code to a lower-case letter.
 * Handles standard letters, uppercase variants, and Mac Option dead-keys.
 */
export function getAltKeyLetter(e: KeyboardEvent): string | null {
  if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) {
    return e.key.toLowerCase();
  }
  if (e.code && e.code.startsWith('Key')) {
    return e.code.slice(3).toLowerCase();
  }
  return null;
}

export interface UseKeyboardShortcutsOptions {
  onNavigateTab: (tab: AppTab) => void;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>> | ((show: boolean | ((prev: boolean) => boolean)) => void);
  enabled?: boolean;
  canAccessTab?: (tab: AppTab) => boolean;
  onEscape?: () => void;
}

/**
 * Global keyboard shortcuts hook for tab navigation and shortcuts help modal.
 * Registers a single window keydown listener with clean unmount and input-field isolation.
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const {
        onNavigateTab,
        showHelp,
        setShowHelp,
        enabled = true,
        canAccessTab,
        onEscape,
      } = optionsRef.current;

      // 1. Never intercept when user is typing in an input, textarea, select, or contentEditable
      if (isInputElement(e.target)) {
        return;
      }

      // 2. Escape: closes the help overlay first, or delegates to onEscape
      if (e.key === 'Escape') {
        if (showHelp) {
          e.preventDefault();
          setShowHelp(false);
          return;
        }
        if (enabled && onEscape) {
          onEscape();
          return;
        }
      }

      // 3. If shortcuts are disabled (e.g. an application modal is open), do nothing
      if (!enabled) {
        return;
      }

      // 4. Toggle help overlay: '?' (Shift + /) or Alt + H
      const isQuestionMark =
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === '?' || (e.shiftKey && e.key === '/'));

      const letter = getAltKeyLetter(e);
      const isAltH = e.altKey && !e.ctrlKey && !e.metaKey && letter === 'h';

      if (isQuestionMark || isAltH) {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      // 5. Alt + <letter> tab navigation (case-insensitive)
      if (e.altKey && !e.ctrlKey && !e.metaKey && letter) {
        const targetTab = SHORTCUT_TAB_MAP[letter];
        if (targetTab) {
          const checkAccess = canAccessTab ?? ((tab: AppTab) => rbac.canAccessTab(tab));
          if (!checkAccess(targetTab)) {
            return;
          }
          e.preventDefault();
          if (showHelp) {
            setShowHelp(false);
          }
          onNavigateTab(targetTab);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
