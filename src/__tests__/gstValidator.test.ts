import { describe, it, expect } from 'vitest';
import { validateGstin, calculateGstinChecksum } from '@/core/gst/validator';
import { getStateByCode, getStateList } from '@/core/gst/stateCodes';

describe('Suite 2: GSTIN Checksum & State Codes', () => {
  it('TC-VAL-01: Valid 15-character GSTIN (27AABCU9603R1ZN) validates successfully', () => {
    const res = validateGstin('27AABCU9603R1ZN');
    expect(res.isValid).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.checksum).toBe('N');
  });

  it('TC-VAL-02: State code (27) and state name (Maharashtra) correctly extracted from valid GSTIN', () => {
    const res = validateGstin('27AABCU9603R1ZN');
    expect(res.stateCode).toBe('27');
    expect(res.stateName).toBe('Maharashtra');
  });

  it('TC-VAL-03: 10-character PAN (AABCU9603R) correctly extracted from characters 3-12', () => {
    const res = validateGstin('27AABCU9603R1ZN');
    expect(res.pan).toBe('AABCU9603R');
    expect(res.entityNumber).toBe('1');
  });

  it('TC-VAL-04: Checksum mismatch on 15th character (27AABCU9603R1Z9) is rejected', () => {
    const res = validateGstin('27AABCU9603R1Z9');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Checksum mismatch');
  });

  it('TC-VAL-05: Altered PAN character producing checksum failure is rejected', () => {
    const res = validateGstin('27AABCU9603Q1ZN');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Checksum mismatch');
  });

  it('TC-VAL-06: GSTIN with invalid length (<15 or >15) is rejected with length error', () => {
    const shortRes = validateGstin('27AABCU9603R1Z');
    expect(shortRes.isValid).toBe(false);
    expect(shortRes.error).toContain('15 characters');

    const longRes = validateGstin('27AABCU9603R1ZN123');
    expect(longRes.isValid).toBe(false);
    expect(longRes.error).toContain('15 characters');
  });

  it('TC-VAL-07: GSTIN with non-existent state code (99 or 00) is rejected', () => {
    const res99 = validateGstin('99AABCU9603R1ZN');
    expect(res99.isValid).toBe(false);
    expect(res99.error).toContain('Invalid State Code');

    const res00 = validateGstin('00AABCU9603R1ZN');
    expect(res00.isValid).toBe(false);
    expect(res00.error).toContain('Invalid State Code');
  });

  it('TC-VAL-08: GSTIN with lowercase letters is normalized and validated', () => {
    const res = validateGstin('27aabcu9603r1zn');
    expect(res.isValid).toBe(true);
    expect(res.stateCode).toBe('27');
    expect(res.pan).toBe('AABCU9603R');
    expect(res.checksum).toBe('N');
  });

  it('TC-VAL-09: GSTIN with invalid format (symbols or bad PAN pattern) is rejected', () => {
    const res = validateGstin('2712345678901ZN');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Invalid GSTIN format');
  });

  it('TC-VAL-10: Modulo 36 algorithm produces identical checksum character for valid inputs', () => {
    const checksum = calculateGstinChecksum('27AABCU9603R1Z');
    expect(checksum).toBe('N');
  });

  it('TC-VAL-11: getStateByCode retrieves correct state details including Union Territory flags', () => {
    const mh = getStateByCode('27');
    expect(mh).toBeDefined();
    expect(mh?.name).toBe('Maharashtra');
    expect(mh?.isUnionTerritory).toBe(false);

    const delhi = getStateByCode('07');
    expect(delhi).toBeDefined();
    expect(delhi?.name).toBe('Delhi');
    expect(delhi?.isUnionTerritory).toBe(true);
  });

  it('TC-VAL-12: getStateList returns sorted list of all 37 standard GST states and territories', () => {
    const list = getStateList();
    expect(list.length).toBe(37);
    for (let i = 0; i < list.length - 1; i++) {
      expect(list[i].name.localeCompare(list[i + 1].name)).toBeLessThanOrEqual(0);
    }
  });
});
