/**
 * Global toast notification helper
 * Dispatches an 'app_show_toast' CustomEvent that App.tsx listens to
 * and renders via its global floating toast banner.
 */
export function showAppToast(message: string): void {
  if (typeof window !== 'undefined' && message) {
    window.dispatchEvent(new CustomEvent('app_show_toast', { detail: message }));
  }
}
