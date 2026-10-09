import { describe, it, expect } from 'vitest';
import { amountInWords } from '@/core/utils/currencyWords';

describe('Suite 7: Indian Amount in Words', () => {
  it('TC-CURR-01: Zero amount converts to "Rupees Zero Only"', () => {
    expect(amountInWords(0)).toBe('Rupees Zero Only');
  });

  it('TC-CURR-02: Hundreds and thousands convert accurately', () => {
    expect(amountInWords(1250)).toBe('Rupees One Thousand Two Hundred Fifty Only');
    expect(amountInWords(1250.50)).toBe('Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
  });

  it('TC-CURR-03: Indian Lakhs formatting converts accurately', () => {
    expect(amountInWords(154200)).toBe('Rupees One Lakh Fifty Four Thousand Two Hundred Only');
  });

  it('TC-CURR-04: Indian Crores formatting converts accurately', () => {
    expect(amountInWords(25000000)).toBe('Rupees Two Crore Fifty Lakh Only');
  });
});
