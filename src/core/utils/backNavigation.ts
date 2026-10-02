import { useEffect } from 'react';
import { App } from '@capacitor/app';

type BackHandler = () => boolean | void;

// Stack of active back navigation handlers
const backHandlerStack: BackHandler[] = [];

let isInitialized = false;
let lastBackPressTime = 0;

/**
 * Registers a back handler onto the top of the stack.
 * Returns an unsubscribe function.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlerStack.push(handler);
  return () => {
    const idx = backHandlerStack.lastIndexOf(handler);
    if (idx !== -1) {
      backHandlerStack.splice(idx, 1);
    }
  };
}

/**
 * Executes the topmost back handler.
 * Returns true if an active back handler consumed the event.
 */
export function triggerBack(): boolean {
  if (backHandlerStack.length > 0) {
    const handler = backHandlerStack.pop()!;
    const result = handler();
    // If the handler returned false explicitly, it didn't consume the event
    if (result !== false) {
      return true;
    }
  }
  return false;
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
          // Double-tap to exit protection on root screen
          const now = Date.now();
          if (now - lastBackPressTime < 2000) {
            App.exitApp();
          } else {
            lastBackPressTime = now;
            // Let user know double tap exits
            if (typeof window !== 'undefined') {
              const toast = document.createElement('div');
              toast.innerText = 'Press back again to exit app';
              toast.className = 'fixed bottom-16 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-4 py-2 rounded-full z-50 shadow-lg animate-fade-in pointer-events-none';
              document.body.appendChild(toast);
              setTimeout(() => toast.remove(), 2000);
            }
          }
        }
      }
    });
  } catch (err) {
    console.warn('Capacitor App plugin backButton listener not available:', err);
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
 *
 * Example usage:
 * useBackNavigation(() => {
 *   onClose();
 *   return true;
 * }, isOpen);
 */
export function useBackNavigation(handler: BackHandler, active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const unregister = registerBackHandler(handler);
    return unregister;
  }, [handler, active]);
}
