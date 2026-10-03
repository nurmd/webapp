import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';

export type BackHandler = () => boolean | void;

export interface StackEntry {
  handler: BackHandler;
  priority: number;
  timestamp: number;
}

// Stack of active back navigation handlers
const backHandlerStack: StackEntry[] = [];

let isInitialized = false;
let lastBackPressTime = 0;

/**
 * Registers a back handler onto the stack.
 * Returns an unsubscribe function.
 */
export function registerBackHandler(handler: BackHandler, priority: number = 0): () => void {
  const entry: StackEntry = {
    handler,
    priority,
    timestamp: Date.now(),
  };
  backHandlerStack.push(entry);

  const isCustomAndroid = typeof window !== 'undefined' && !!(window as any).AndroidBridge;
  let pushedHistory = false;
  if (!isCustomAndroid && typeof window !== 'undefined' && window.history) {
    try {
      window.history.pushState({ backHandler: true }, '');
      pushedHistory = true;
    } catch {}
  }

  return () => {
    const idx = backHandlerStack.indexOf(entry);
    if (idx !== -1) {
      backHandlerStack.splice(idx, 1);
    }
    if (pushedHistory && window.history.state?.backHandler) {
      try {
        window.history.back();
      } catch {}
    }
  };
}

/**
 * Executes the highest priority / topmost back handler.
 * Returns true if an active back handler consumed the event.
 */
export function triggerBack(): boolean {
  if (backHandlerStack.length === 0) {
    return false;
  }

  // Find index of highest priority entry; if tied, most recently added (LIFO)
  let bestIdx = backHandlerStack.length - 1;
  for (let i = backHandlerStack.length - 2; i >= 0; i--) {
    if (backHandlerStack[i].priority > backHandlerStack[bestIdx].priority) {
      bestIdx = i;
    }
  }

  const [entry] = backHandlerStack.splice(bestIdx, 1);
  try {
    const result = entry.handler();
    if (result !== false) {
      return true;
    }
  } catch (err) {
    console.error('Error executing back handler:', err);
  }
  // If the handler returned false explicitly, it didn't consume the event; try next
  return triggerBack();
}

function showExitToast() {
  if (typeof window !== 'undefined') {
    const toast = document.createElement('div');
    toast.innerText = 'Press back again to exit app';
    toast.className = 'fixed bottom-16 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-4 py-2 rounded-full z-50 shadow-lg animate-fade-in pointer-events-none';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }
}

// Expose global system back handler for Android native WebView container
if (typeof window !== 'undefined') {
  (window as any).__handleAndroidBack = () => {
    return triggerBack();
  };
}

/**
 * Global initialization of system back button listeners.
 * Handles Capacitor native Android hardware back button and web fallback.
 */
export function initBackNavigation(onRootBack?: () => void) {
  if (isInitialized) return;
  isInitialized = true;

  // 1. Capacitor native Android back button event
  try {
    App.addListener('backButton', () => {
      const handled = triggerBack();
      if (!handled) {
        if (onRootBack) {
          onRootBack();
        } else {
          const now = Date.now();
          if (now - lastBackPressTime < 2000) {
            try {
              if ((window as any).AndroidBridge?.exitApp) {
                (window as any).AndroidBridge.exitApp();
              } else {
                App.exitApp();
              }
            } catch {
              App.exitApp();
            }
          } else {
            lastBackPressTime = now;
            showExitToast();
          }
        }
      }
    });
  } catch (err) {
    // Capacitor App plugin not available
  }

  // 2. Cordova / standard WebView backbutton event fallback
  document.addEventListener('backbutton', (e) => {
    e.preventDefault();
    const handled = triggerBack();
    if (!handled && onRootBack) {
      onRootBack();
    }
  });

  // 3. Browser history popstate fallback
  window.addEventListener('popstate', () => {
    triggerBack();
  });
}

/**
 * React hook to register a back action whenever the component or modal is active.
 * Uses a ref to ensure the handler is always up to date without re-subscribing.
 *
 * Priorities:
 * 0: Base / Tab navigation (Dashboard fallback)
 * 10: Standard modals / views (Invoice, Purchase, Party Detail)
 * 20: Inner / Nested sub-modals (Add Item, Select Party, Date/Discount picker)
 * 30: Overlays (Drawer, Confirmation dialogs, Scanners)
 */
export function useBackNavigation(handler: BackHandler, active: boolean = true, priority: number = 10) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    const wrappedHandler: BackHandler = () => handlerRef.current();
    const unregister = registerBackHandler(wrappedHandler, priority);
    return unregister;
  }, [active, priority]);
}

