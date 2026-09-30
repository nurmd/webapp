import { getStateByCode } from './stateCodes.ts';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface GstinValidationResult {
  isValid: boolean;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  entityNumber?: string;
  checksum?: string;
  error?: string;
}

/**
 * Validates an Indian Goods and Services Tax Identification Number (GSTIN).
 * 
 * GSTIN Structure (15 Characters):
 * - Characters 1-2: State Code (01 to 38).
 * - Characters 3-12: Permanent Account Number (PAN) of taxpayer.
 * - Character 13: Entity registration number within state (1-9, A-Z).
 * - Character 14: Default character 'Z'.
 * - Character 15: Check digit calculated using Luhn Mod 36 algorithm.
 * 
 * @param gstin - The 15-character GSTIN string to validate.
 * @returns Object with validity flag, extracted State Code, State Name, PAN, Entity Number, and error message if invalid.
 */
export function validateGstin(gstin: string): GstinValidationResult {
  const cleanGstin = gstin.trim().toUpperCase();

  if (cleanGstin.length !== 15) {
    return {
      isValid: false,
      error: `GSTIN must be 15 characters long (got ${cleanGstin.length})`,
    };
  }

  if (!GSTIN_REGEX.test(cleanGstin)) {
    return {
      isValid: false,
      error: 'Invalid GSTIN format (Expected: 2 digits state + 10 chars PAN + 1 entity + Z + 1 checksum)',
    };
  }

  const stateCode = cleanGstin.substring(0, 2);
  const state = getStateByCode(stateCode);
  if (!state) {
    return {
      isValid: false,
      error: `Invalid State Code: ${stateCode}`,
    };
  }

  const pan = cleanGstin.substring(2, 12);
  const entityNumber = cleanGstin.charAt(12);
  const checksumChar = cleanGstin.charAt(14);

  // Calculate Checksum Character
  const expectedChecksum = calculateGstinChecksum(cleanGstin.substring(0, 14));
  const isChecksumValid = checksumChar === expectedChecksum;

  return {
    isValid: isChecksumValid,
    stateCode,
    stateName: state.name,
    pan,
    entityNumber,
    checksum: checksumChar,
    error: isChecksumValid ? undefined : `Checksum mismatch (Expected: ${expectedChecksum}, Got: ${checksumChar})`,
  };
}

/**
 * Computes the 15th Check Digit of a GSTIN using the official Indian Tax Luhn Mod 36 algorithm.
 * 
 * Algorithm:
 * 1. Base 36 character set: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' (indices 0 to 35).
 * 2. Alternating weight factor: 1 for even index, 2 for odd index.
 * 3. Product = characterValue * weightFactor.
 * 4. Add quotient (Math.floor(product / 36)) and remainder (product % 36) to running sum.
 * 5. Checksum index = (36 - (sum % 36)) % 36.
 * 
 * @param input14 - The first 14 characters of the GSTIN.
 * @returns Single check digit character (0-9 or A-Z).
 */
export function calculateGstinChecksum(input14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const char = input14.charAt(i);
    const charVal = CHARS.indexOf(char);
    if (charVal === -1) return '';

    // Multiplier alternates 1, 2, 1, 2...
    const factor = (i % 2 === 0) ? 1 : 2;
    let product = charVal * factor;
    // Quotient + Remainder when divided by 36
    const quotient = Math.floor(product / 36);
    const remainder = product % 36;
    sum += quotient + remainder;
  }

  const remainder = sum % 36;
  const checkDigitIndex = (36 - remainder) % 36;
  return CHARS.charAt(checkDigitIndex);
}
