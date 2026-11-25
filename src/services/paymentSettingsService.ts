import { PaymentMode } from '../models/invoice.ts';

export const DEFAULT_PAYMENT_MODE_KEY = 'app_default_payment_mode';

export const SALES_PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI / QR' },
  { value: 'NET_BANKING', label: 'Bank Transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CREDIT', label: 'Credit (Udhaar)' },
];

const VALID_DEFAULT_MODES = new Set<PaymentMode>(SALES_PAYMENT_MODES.map((m) => m.value));

export function getDefaultPaymentMode(): PaymentMode {
  try {
    if (typeof localStorage === 'undefined') return 'CASH';
    const raw = localStorage.getItem(DEFAULT_PAYMENT_MODE_KEY);
    if (raw && VALID_DEFAULT_MODES.has(raw as PaymentMode)) {
      return raw as PaymentMode;
    }
  } catch {
    // Ignore storage errors (e.g. private mode)
  }
  return 'CASH';
}

export function setDefaultPaymentMode(mode: PaymentMode): void {
  if (!VALID_DEFAULT_MODES.has(mode)) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEFAULT_PAYMENT_MODE_KEY, mode);
    }
  } catch {
    // Ignore storage errors (e.g. private mode)
  }
}
