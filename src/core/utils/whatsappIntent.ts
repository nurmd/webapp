/**
 * WhatsApp Intent & URL Normalization Utilities
 * Pure helper module with zero dependencies on React, storage, network, or PouchDB.
 */

export type WhatsAppPhoneReason =
  | 'EMPTY'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVALID_MOBILE'
  | 'UNSUPPORTED_COUNTRY_CODE';

export interface NormalizedWhatsAppPhone {
  e164: string;      // e.g. 919876543210, or '' when invalid
  national: string;  // e.g. 9876543210, or '' when invalid
  valid: boolean;
  reason?: WhatsAppPhoneReason;
}

export interface WhatsAppSendUrlResult {
  url: string;
  phone: NormalizedWhatsAppPhone;
  usedPhone: boolean;
}

/**
 * Normalizes an Indian phone number for WhatsApp deep-linking.
 *
 * Accepted inputs:
 *  - 9876543210
 *  - +91 98765 43210
 *  - 91-98765-43210
 *  - 09876543210
 *  - 0091 98765 43210
 *
 * Normalizes all valid formats to:
 *  - e164: '919876543210'
 *  - national: '9876543210'
 *  - valid: true
 */
export function normalizeWhatsAppPhone(raw?: string): NormalizedWhatsAppPhone {
  if (!raw || typeof raw !== 'string') {
    return { e164: '', national: '', valid: false, reason: 'EMPTY' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { e164: '', national: '', valid: false, reason: 'EMPTY' };
  }

  // Reject non-+91 country codes when '+' prefix is used
  if (trimmed.startsWith('+')) {
    if (!trimmed.startsWith('+91')) {
      return { e164: '', national: '', valid: false, reason: 'UNSUPPORTED_COUNTRY_CODE' };
    }
  }

  // Reject international 00 prefix unless it is 0091
  if (trimmed.startsWith('00') && !trimmed.startsWith('0091')) {
    return { e164: '', national: '', valid: false, reason: 'UNSUPPORTED_COUNTRY_CODE' };
  }

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return { e164: '', national: '', valid: false, reason: 'EMPTY' };
  }

  // Strip +91 / 0091 / 91 country prefixes
  if (trimmed.startsWith('+91')) {
    if (digits.startsWith('91')) {
      digits = digits.slice(2);
    }
  } else if (trimmed.startsWith('0091') || digits.startsWith('0091')) {
    digits = digits.replace(/^0091/, '');
  } else if (digits.length >= 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  // Strip leading trunk 0 if present (e.g. 09876543210 -> 9876543210)
  if (digits.length >= 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 0) {
    return { e164: '', national: '', valid: false, reason: 'TOO_SHORT' };
  }

  if (digits.length < 10) {
    return { e164: '', national: '', valid: false, reason: 'TOO_SHORT' };
  }

  if (digits.length > 10) {
    return { e164: '', national: '', valid: false, reason: 'TOO_LONG' };
  }

  // Valid 10-digit Indian mobile must start with 6, 7, 8, or 9
  if (!/^[6-9]/.test(digits)) {
    return { e164: '', national: '', valid: false, reason: 'INVALID_MOBILE' };
  }

  return {
    e164: `91${digits}`,
    national: digits,
    valid: true,
  };
}

/**
 * Builds a WhatsApp deep link URL for 'app' (wa.me) or 'api' (api.whatsapp.com/send) channels.
 * Encodes text payload exactly once without double-encoding.
 */
export function buildWhatsAppSendUrl(params: {
  phone?: string;
  text: string;
  channel?: 'app' | 'api';
}): WhatsAppSendUrlResult {
  const channel = params.channel || 'app';
  const phone = normalizeWhatsAppPhone(params.phone);
  const encodedText = encodeURIComponent(params.text);

  if (channel === 'api') {
    if (phone.valid) {
      return {
        url: `https://api.whatsapp.com/send?phone=${phone.e164}&text=${encodedText}`,
        phone,
        usedPhone: true,
      };
    }
    return {
      url: `https://api.whatsapp.com/send?text=${encodedText}`,
      phone,
      usedPhone: false,
    };
  }

  // channel: 'app' (wa.me)
  if (phone.valid) {
    return {
      url: `https://wa.me/${phone.e164}?text=${encodedText}`,
      phone,
      usedPhone: true,
    };
  }
  return {
    url: `https://wa.me/?text=${encodedText}`,
    phone,
    usedPhone: false,
  };
}

/**
 * Checks whether an external URL targets WhatsApp intents (wa.me, api.whatsapp.com, or whatsapp://).
 */
export function isWhatsAppIntentUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const normalized = url.trim().toLowerCase();
  return (
    normalized.startsWith('https://wa.me/') ||
    normalized.startsWith('https://api.whatsapp.com/') ||
    normalized.startsWith('whatsapp://')
  );
}

/**
 * Returns a short, user-friendly error message for phone validation failures.
 */
export function getWhatsAppPhoneErrorMessage(validation: NormalizedWhatsAppPhone): string {
  if (validation.valid) return '';

  switch (validation.reason) {
    case 'EMPTY':
      return 'Please enter a valid 10-digit Indian mobile number.';
    case 'TOO_SHORT':
      return 'Enter a valid 10-digit Indian mobile number.';
    case 'TOO_LONG':
      return 'Phone number must not exceed 10 digits.';
    case 'INVALID_MOBILE':
      return 'Indian mobile numbers must begin with 6, 7, 8, or 9.';
    case 'UNSUPPORTED_COUNTRY_CODE':
      return 'Only Indian (+91) phone numbers are currently supported.';
    default:
      return 'Enter a valid 10-digit Indian mobile number.';
  }
}
