/**
 * Bill intake configuration — stored locally, same offline-first policy as the rest
 * of the app. The proxy token is a shared secret for *your* backend, not a model key;
 * provider keys never reach the browser.
 */
import type { BillIntakeSettings } from './types.ts';

const SETTINGS_KEY = 'gst_bill_intake_settings_v1';

export const DEFAULT_SETTINGS: BillIntakeSettings = {
  enabled: true,
  proxyUrl: '',
  token: '',
  autoPost: false,
  autoPostThreshold: 0.92,
  requireCatalogMatchForAutoPost: true,
  requireKnownSupplierForAutoPost: true,
  defaultItcEligibility: 'ELIGIBLE_INPUTS',
};

type Listener = (settings: BillIntakeSettings) => void;
const listeners = new Set<Listener>();

export function getSettings(): BillIntakeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<BillIntakeSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<BillIntakeSettings>): BillIntakeSettings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* quota — settings are best-effort, the UI keeps the in-memory copy */
  }
  listeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeSettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isConfigured(settings: BillIntakeSettings = getSettings()): boolean {
  return Boolean(settings.proxyUrl.trim());
}
