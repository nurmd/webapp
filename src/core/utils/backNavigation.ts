import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';

export type BackHandler = () => boolean | void;

export interface StackEntry {
  id: string;
  handler: BackHandler;
  priority: number;
  timestamp: number;
}

// Stack of active back navigation handlers
const backHandlerStack: StackEntry[] = [];

let isInitialized = false;
let lastBackPressTime = 0;
let ignorePopstateCount = 0;

/**
 * Registers a back handler onto the stack.
 * Returns an unsubscribe function.
 */
export function registerBackHandler(handler: BackHandler, priority: number = 0): () => void {
  const entryId = `bh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const entry: StackEntry = {
    id: entryId,
    handler,
    priority,
    timestamp: Date.now(),
  };
  backHandlerStack.push(entry);

  const isCustomAndroid = typeof window !== 'undefined' && !!(window as any).AndroidBridge;
  let pushedHistory = false;
  // Only push history state for overlays and modals (priority > 0) to prevent tab pollution
  if (!isCustomAndroid && typeof window !== 'undefined' && window.history && priority > 0) {
    try {
      window.history.pushState({ backHandlerId: entryId }, '');
      pushedHistory = true;
    } catch {}
  }

  return () => {
    const idx = backHandlerStack.findIndex((e) => e.id === entryId);
    if (idx !== -1) {
      backHandlerStack.splice(idx, 1);
    }
    // Only pop history if this specific handler's state is currently at the top of browser history
    if (pushedHistory && typeof window !== 'undefined' && window.history?.state?.backHandlerId === entryId) {
      try {
        ignorePopstateCount++;
        window.history.back();
        // Fallback safety in case the browser does not emit popstate
        setTimeout(() => {
          if (ignorePopstateCount > 0) {
            ignorePopstateCount--;
          }
        }, 300);
      } catch {
        ignorePopstateCount = Math.max(0, ignorePopstateCount - 1);
      }
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

export function showExitToast() {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const existing = document.getElementById('back-exit-toast');
    if (existing) {
      existing.remove();
    }
    const toast = document.createElement('div');
    toast.id = 'back-exit-toast';
    toast.innerText = 'Press back again to exit app';
    toast.className = 'fixed bottom-16 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-4 py-2 rounded-full z-50 shadow-lg animate-fade-in pointer-events-none';
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 2000);
  }
}

export function handleExitOrToast(): boolean {
  const now = Date.now();
  if (now - lastBackPressTime < 2000) {
    try {
      if ((window as any).AndroidBridge?.exitApp) {
        (window as any).AndroidBridge.exitApp();
      } else {
        const p = App.exitApp();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } catch {
      try {
        const p = App.exitApp();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      } catch {}
    }
    return true;
  } else {
    lastBackPressTime = now;
    showExitToast();
    return false;
  }
}

export function getLastBackPressTime(): number {
  return lastBackPressTime;
}

export function setLastBackPressTime(time: number) {
  lastBackPressTime = time;
}

export function resetBackNavigationForTesting() {
  backHandlerStack.length = 0;
  lastBackPressTime = 0;
  ignorePopstateCount = 0;
  globalRootBackHandler = undefined;
  const existing = typeof document !== 'undefined' ? document.getElementById('back-exit-toast') : null;
  if (existing) {
    existing.remove();
  }
}

export type RootBackHandler = () => boolean | void;

let globalRootBackHandler: RootBackHandler | undefined;

// Expose global system back handler for Android native WebView container
if (typeof window !== 'undefined') {
  (window as any).__handleAndroidBack = () => {
    const handled = triggerBack();
    if (handled) {
      return true;
    }
    if (globalRootBackHandler) {
      const rootHandled = globalRootBackHandler();
      if (rootHandled !== false) {
        return true;
      }
    }
    return false;
  };
}

/**
 * Global initialization of system back button listeners.
 * Handles Capacitor native Android hardware back button and web fallback.
 */
export function initBackNavigation(onRootBack?: RootBackHandler) {
  if (onRootBack) {
    globalRootBackHandler = onRootBack;
  }
  if (isInitialized) return;
  isInitialized = true;

  // 1. Capacitor native Android back button event
  try {
    App.addListener('backButton', () => {
      const handled = triggerBack();
      if (!handled) {
        if (globalRootBackHandler) {
          const rootHandled = globalRootBackHandler();
          if (rootHandled !== false) {
            return;
          }
        }
        handleExitOrToast();
      }
    });
  } catch (err) {
    // Capacitor App plugin not available
  }

  // 2. Cordova / standard WebView backbutton event fallback
  document.addEventListener('backbutton', (e) => {
    e.preventDefault();
    const handled = triggerBack();
    if (!handled) {
      if (globalRootBackHandler) {
        const rootHandled = globalRootBackHandler();
        if (rootHandled !== false) {
          return;
        }
      }
      handleExitOrToast();
    }
  });

  // 3. Browser history popstate fallback
  window.addEventListener('popstate', () => {
    if (ignorePopstateCount > 0) {
      ignorePopstateCount--;
      return;
    }
    const handled = triggerBack();
    if (!handled) {
      if (globalRootBackHandler) {
        const rootHandled = globalRootBackHandler();
        if (rootHandled !== false) {
          return;
        }
      }
      handleExitOrToast();
    }
  });
}

/**
 * Triggers the complete system back navigation flow:
 * 1. Closes topmost active modal/overlay
 * 2. If no modal is active, delegates to root handler (e.g. return to dashboard)
 * Returns true if handled, false otherwise.
 */
export function handleSystemBack(): boolean {
  if (typeof window !== 'undefined' && typeof (window as any).__handleAndroidBack === 'function') {
    return (window as any).__handleAndroidBack();
  }
  const handled = triggerBack();
  if (handled) return true;
  if (globalRootBackHandler) {
    const rootHandled = globalRootBackHandler();
    if (rootHandled !== false) return true;
  }
  return false;
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

