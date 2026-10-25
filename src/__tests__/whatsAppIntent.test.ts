import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsAppPhone,
  buildWhatsAppSendUrl,
  isWhatsAppIntentUrl,
  getWhatsAppPhoneErrorMessage,
} from '../core/utils/whatsappIntent.ts';

describe('whatsappIntent: URL and Phone Normalization Engine', () => {
  describe('normalizeWhatsAppPhone', () => {
    it('normalizes all 5 accepted Indian phone number formats to identical E.164 and national digits', () => {
      const formats = [
        '9876543210',
        '+91 98765 43210',
        '91-98765-43210',
        '09876543210',
        '0091 98765 43210',
      ];

      for (const format of formats) {
        const result = normalizeWhatsAppPhone(format);
        expect(result.valid).toBe(true);
        expect(result.e164).toBe('919876543210');
        expect(result.national).toBe('9876543210');
        expect(result.reason).toBeUndefined();
      }
    });

    it('rejects empty and whitespace-only inputs with EMPTY reason', () => {
      expect(normalizeWhatsAppPhone('')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'EMPTY',
      });
      expect(normalizeWhatsAppPhone('   ')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'EMPTY',
      });
      expect(normalizeWhatsAppPhone(undefined)).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'EMPTY',
      });
    });

    it('rejects numbers with fewer than 10 national digits with TOO_SHORT reason', () => {
      expect(normalizeWhatsAppPhone('98765')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'TOO_SHORT',
      });
      expect(normalizeWhatsAppPhone('+91 98765')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'TOO_SHORT',
      });
      expect(normalizeWhatsAppPhone('+91')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'TOO_SHORT',
      });
    });

    it('rejects numbers with more than 10 national digits with TOO_LONG reason', () => {
      expect(normalizeWhatsAppPhone('9876543210123')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'TOO_LONG',
      });
      expect(normalizeWhatsAppPhone('+91 9876543210123')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'TOO_LONG',
      });
    });

    it('rejects 10-digit numbers not beginning with 6-9 with INVALID_MOBILE reason', () => {
      expect(normalizeWhatsAppPhone('5551234567')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'INVALID_MOBILE',
      });
      expect(normalizeWhatsAppPhone('1234567890')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'INVALID_MOBILE',
      });
      expect(normalizeWhatsAppPhone('+91 2345678901')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'INVALID_MOBILE',
      });
    });

    it('rejects non-+91 international country codes with UNSUPPORTED_COUNTRY_CODE reason', () => {
      expect(normalizeWhatsAppPhone('+1 555 123 4567')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'UNSUPPORTED_COUNTRY_CODE',
      });
      expect(normalizeWhatsAppPhone('+44 7911 123456')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'UNSUPPORTED_COUNTRY_CODE',
      });
      expect(normalizeWhatsAppPhone('+971 50 123 4567')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'UNSUPPORTED_COUNTRY_CODE',
      });
      expect(normalizeWhatsAppPhone('001 555 123 4567')).toEqual({
        e164: '',
        national: '',
        valid: false,
        reason: 'UNSUPPORTED_COUNTRY_CODE',
      });
    });

    it('does not mutate input strings', () => {
      const raw = ' +91 98765-43210 ';
      const copy = raw.slice();
      normalizeWhatsAppPhone(raw);
      expect(raw).toBe(copy);
    });
  });

  describe('buildWhatsAppSendUrl', () => {
    const sampleMessage = 'Hello World & Thank you!\nTotal: ₹500 #invoice %100 🙏';

    it('generates wa.me app channel URLs with and without a valid phone', () => {
      const withValidPhone = buildWhatsAppSendUrl({
        phone: '+91 98765 43210',
        text: 'Hello',
        channel: 'app',
      });
      expect(withValidPhone.url).toBe('https://wa.me/919876543210?text=Hello');
      expect(withValidPhone.usedPhone).toBe(true);

      const withEmptyPhone = buildWhatsAppSendUrl({
        phone: '',
        text: 'Hello',
        channel: 'app',
      });
      expect(withEmptyPhone.url).toBe('https://wa.me/?text=Hello');
      expect(withEmptyPhone.usedPhone).toBe(false);

      const withInvalidPhone = buildWhatsAppSendUrl({
        phone: '12345',
        text: 'Hello',
        channel: 'app',
      });
      expect(withInvalidPhone.url).toBe('https://wa.me/?text=Hello');
      expect(withInvalidPhone.usedPhone).toBe(false);
    });

    it('generates api.whatsapp.com channel URLs with and without a valid phone', () => {
      const withValidPhone = buildWhatsAppSendUrl({
        phone: '09876543210',
        text: 'Hello',
        channel: 'api',
      });
      expect(withValidPhone.url).toBe('https://api.whatsapp.com/send?phone=919876543210&text=Hello');
      expect(withValidPhone.usedPhone).toBe(true);

      const withoutPhone = buildWhatsAppSendUrl({
        text: 'Hello',
        channel: 'api',
      });
      expect(withoutPhone.url).toBe('https://api.whatsapp.com/send?text=Hello');
      expect(withoutPhone.usedPhone).toBe(false);

      const withInvalidPhone = buildWhatsAppSendUrl({
        phone: '+1 555 123 4567',
        text: 'Hello',
        channel: 'api',
      });
      expect(withInvalidPhone.url).toBe('https://api.whatsapp.com/send?text=Hello');
      expect(withInvalidPhone.usedPhone).toBe(false);
    });

    it('encodes newlines, emoji, &, #, %, and spaces exactly once with no double encoding', () => {
      const result = buildWhatsAppSendUrl({
        phone: '9876543210',
        text: sampleMessage,
        channel: 'app',
      });

      // Validates presence of encoded tokens
      expect(result.url).toContain('%26'); // &
      expect(result.url).toContain('%23'); // #
      expect(result.url).toContain('%25'); // %
      expect(result.url).toContain('%0A'); // \n
      expect(result.url).toContain('%F0%9F%99%8F'); // 🙏
      // Ensures no double encoding (e.g. %2526 for &)
      expect(result.url).not.toContain('%2526');
      expect(result.url).not.toContain('%2523');
      expect(result.url).not.toContain('%2525');
      expect(result.url).not.toContain('%250A');

      const extractedParam = new URL(result.url).searchParams.get('text');
      expect(extractedParam).toBe(sampleMessage);
    });
  });

  describe('isWhatsAppIntentUrl', () => {
    it('returns true for all three supported WhatsApp deep-link prefixes', () => {
      expect(isWhatsAppIntentUrl('https://wa.me/919876543210?text=Hi')).toBe(true);
      expect(isWhatsAppIntentUrl('https://wa.me/?text=Hi')).toBe(true);
      expect(isWhatsAppIntentUrl('https://api.whatsapp.com/send?phone=919876543210')).toBe(true);
      expect(isWhatsAppIntentUrl('whatsapp://send?phone=919876543210')).toBe(true);
      expect(isWhatsAppIntentUrl('HTTPS://WA.ME/919876543210?text=Hi')).toBe(true);
    });

    it('returns false for non-WhatsApp URLs and invalid inputs', () => {
      expect(isWhatsAppIntentUrl('https://example.com')).toBe(false);
      expect(isWhatsAppIntentUrl('upi://pay?pa=merchant@upi')).toBe(false);
      expect(isWhatsAppIntentUrl('tel:+919876543210')).toBe(false);
      expect(isWhatsAppIntentUrl('')).toBe(false);
      expect(isWhatsAppIntentUrl(undefined)).toBe(false);
    });
  });

  describe('getWhatsAppPhoneErrorMessage', () => {
    it('returns descriptive localized messages per validation failure reason', () => {
      expect(getWhatsAppPhoneErrorMessage(normalizeWhatsAppPhone(''))).toContain('valid 10-digit');
      expect(getWhatsAppPhoneErrorMessage(normalizeWhatsAppPhone('12345'))).toContain('10-digit');
      expect(getWhatsAppPhoneErrorMessage(normalizeWhatsAppPhone('9876543210123'))).toContain('not exceed 10 digits');
      expect(getWhatsAppPhoneErrorMessage(normalizeWhatsAppPhone('5551234567'))).toContain('begin with 6, 7, 8, or 9');
      expect(getWhatsAppPhoneErrorMessage(normalizeWhatsAppPhone('+1 555 123 4567'))).toContain('Only Indian (+91)');
      expect(getWhatsAppPhoneErrorMessage(normalizeWhatsAppPhone('9876543210'))).toBe('');
    });
  });
});
