/**
 * GST Unit Quantity Code (UQC) mapping and validation.
 * Standardized UQC codes as mandated by GSTN for GSTR-1 Table 12 (HSN Summary)
 * and e-Invoicing.
 */

export const VALID_UQCS = new Set([
  'PCS',
  'NOS',
  'KGS',
  'GMS',
  'LTR',
  'MLT',
  'MTR',
  'MMT',
  'CMTR',
  'BOX',
  'PAC',
  'SET',
  'BAG',
  'DOZ',
  'CTN',
  'PRS',
  'QTL',
  'TON',
  'BTL',
  'ROL',
  'THD',
  'OTH',
]);

const UQC_ALIASES: Record<string, string> = {
  DOZEN: 'DOZ',
  DOZ: 'DOZ',
  PKT: 'PAC',
  PACKET: 'PAC',
  PACK: 'PAC',
  PAC: 'PAC',
  KG: 'KGS',
  KGS: 'KGS',
  GM: 'GMS',
  GMS: 'GMS',
  GRAM: 'GMS',
  L: 'LTR',
  LTR: 'LTR',
  LITRE: 'LTR',
  LITER: 'LTR',
  ML: 'MLT',
  MLT: 'MLT',
  M: 'MTR',
  MTR: 'MTR',
  METRE: 'MTR',
  METER: 'MTR',
  MMT: 'MMT',
  CMTR: 'CMTR',
  BOX: 'BOX',
  SET: 'SET',
  BAG: 'BAG',
  PIECE: 'PCS',
  PIECES: 'PCS',
  PCS: 'PCS',
  NOS: 'NOS',
  PAIR: 'PRS',
  PRS: 'PRS',
  CARTON: 'CTN',
  CTN: 'CTN',
  QUINTAL: 'QTL',
  QTL: 'QTL',
  TON: 'TON',
  MT: 'TON',
  TONNE: 'TON',
  BOTTLE: 'BTL',
  BTL: 'BTL',
  ROLL: 'ROL',
  ROL: 'ROL',
  THD: 'THD',
  HOURS: 'OTH',
  HOUR: 'OTH',
  DAYS: 'OTH',
  DAY: 'OTH',
  WEEK: 'OTH',
  MONTH: 'OTH',
  OTH: 'OTH',
};

/**
 * Maps an internal unit string to its standard GST UQC code.
 * Performs NFC normalization, trimming, and case-insensitive lookup against alias mappings.
 * Returns the valid UQC code or undefined if unknown.
 */
export function toUqc(unit?: string): string | undefined {
  if (!unit || typeof unit !== 'string') return undefined;
  const normalized = unit.normalize('NFC').trim().toUpperCase();
  if (!normalized) return undefined;

  if (UQC_ALIASES[normalized]) {
    return UQC_ALIASES[normalized];
  }

  if (VALID_UQCS.has(normalized)) {
    return normalized;
  }

  return undefined;
}
