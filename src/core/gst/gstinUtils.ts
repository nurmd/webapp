import { getStateByCode } from './stateCodes.ts';

// Standard 15-character GSTIN regex format:
// 2 digits (State Code) + 5 uppercase letters (PAN) + 4 digits (PAN) + 1 letter (PAN) + 1 entity num (1-9, A-Z) + 'Z' + 1 check digit/char
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export function isValidGstin(gstin: string): boolean {
  if (!gstin) return false;
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

export function isValidPan(pan: string): boolean {
  if (!pan) return false;
  return PAN_REGEX.test(pan.trim().toUpperCase());
}

export function extractStateCodeFromGstin(gstin: string): string | null {
  const clean = gstin.trim().toUpperCase();
  if (clean.length >= 2) {
    const code = clean.substring(0, 2);
    if (/^\d{2}$/.test(code) && getStateByCode(code)) {
      return code;
    }
  }
  return null;
}

export function extractPanFromGstin(gstin: string): string | null {
  const clean = gstin.trim().toUpperCase();
  if (clean.length >= 12) {
    const pan = clean.substring(2, 12);
    if (isValidPan(pan)) {
      return pan;
    }
  }
  return null;
}
