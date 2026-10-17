import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { GST_STATES } from './stateCodes.ts';

export interface EWayBillJsonItem {
  itemNo: number;
  productName: string;
  productDesc: string;
  hsnCode: number;
  quantity: number;
  qtyUnit: string;
  taxableAmount: number;
  sgstRate: number;
  cgstRate: number;
  igstRate: number;
  cessRate: number;
  cessNonAdvol: number;
}

export interface EWayBillBillData {
  userGstin: string;
  supplyType: 'O' | 'I'; // Outward / Inward
  subSupplyType: '1' | '2' | '3'; // 1 = Supply
  docType: 'INV' | 'BIL' | 'BOE' | 'CHL';
  docNo: string;
  docDate: string; // DD/MM/YYYY
  transType: '1' | '2' | '3' | '4'; // 1 = Regular
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2: string;
  fromPlace: string;
  fromPincode: number;
  actFromStateCode: number;
  fromStateCode: number;
  toGstin: string;
  toTrdName: string;
  toAddr1: string;
  toAddr2: string;
  toPlace: string;
  toPincode: number;
  actToStateCode: number;
  toStateCode: number;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  totInvValue: number;
  itemList: EWayBillJsonItem[];
  transId?: string;
  transName?: string;
  transDocNo?: string;
  transDocDate?: string;
  transMode: '1' | '2' | '3' | '4'; // 1 = Road
  transDistance: number; // in km
  vehNo?: string;
  vehType: 'R' | 'O'; // Regular / Over-dimensional
}

export interface EWayBillBulkPayload {
  version: string;
  billLists: EWayBillBillData[];
}

export const EWAY_BILL_STATUTORY_THRESHOLD = 50000;

export function formatEWayDate(isoDate: string): string {
  if (!isoDate) return '';
  const clean = isoDate.split('T')[0];
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Validates Indian vehicle registration format (e.g. MH01AB1234 or DL01A1234).
 */
export function isValidVehicleNumber(vehNo?: string): boolean {
  if (!vehNo) return false;
  const cleaned = vehNo.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/.test(cleaned);
}

export function extractPincode(addressStr?: string, defaultPin: number = 400001): number {
  if (!addressStr) return defaultPin;
  const match = addressStr.match(/\b([1-9][0-9]{5})\b/);
  if (match && match[1]) {
    const pin = parseInt(match[1], 10);
    if (!isNaN(pin)) return pin;
  }
  return defaultPin;
}

export function extractLocation(addressStr?: string, defaultLoc: string = 'City'): string {
  if (!addressStr) return defaultLoc;
  const parts = addressStr.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1].replace(/\b[1-9][0-9]{5}\b/g, '').trim();
    if (candidate.length >= 2) return candidate.substring(0, 50);
  }
  if (parts.length > 0) {
    return parts[0].substring(0, 50);
  }
  return defaultLoc;
}

/**
 * Maps postal PIN code prefix to 2-digit Indian GST State Code (as integer).
 * Follows India Post Postal Circles and statutory GST state codes.
 */
export function getStateCodeFromPincode(pincode?: number | string): number | undefined {
  if (!pincode) return undefined;
  const pinStr = String(pincode).replace(/\D/g, '');
  if (pinStr.length < 2) return undefined;

  // Specific 3-digit sub-circle overrides
  if (pinStr.length >= 3) {
    const p3 = parseInt(pinStr.substring(0, 3), 10);
    if (p3 === 403) return 30; // Goa (403xxx)
    if (p3 === 605) return 34; // Puducherry (605xxx)
    if (p3 === 744) return 35; // Andaman & Nicobar (744xxx)
    if (p3 === 682) return 31; // Lakshadweep (682xxx - Kavaratti / islands)
    if (p3 === 737) return 11; // Sikkim (737xxx)
    if (p3 === 194) return 38; // Ladakh (194xxx)
    if (p3 === 396) return 26; // Dadra & Nagar Haveli and Daman & Diu (396210 / 396193)
    if ([246, 247, 248, 249, 262, 263].includes(p3)) return 5; // Uttarakhand (Dehradun 248, Haridwar 249, Nainital 263)
    if ([790, 791, 792].includes(p3)) return 12; // Arunachal Pradesh
    if ([793, 794].includes(p3)) return 17; // Meghalaya
    if (p3 === 795) return 14; // Manipur
    if (p3 === 796) return 15; // Mizoram
    if ([797, 798].includes(p3)) return 13; // Nagaland
    if (p3 === 799) return 16; // Tripura
    if ((p3 >= 814 && p3 <= 816) || (p3 >= 825 && p3 <= 835)) return 20; // Jharkhand
  }

  // 2-digit circle mappings
  const p2 = parseInt(pinStr.substring(0, 2), 10);
  switch (p2) {
    case 11:
      return 7; // Delhi
    case 12:
    case 13:
      return 6; // Haryana
    case 14:
    case 15:
      return 3; // Punjab
    case 16:
      return 4; // Chandigarh
    case 17:
      return 2; // Himachal Pradesh
    case 18:
    case 19:
      return 1; // Jammu and Kashmir
    case 20:
    case 21:
    case 22:
    case 23:
    case 24:
    case 25:
    case 26:
    case 27:
    case 28:
      return 9; // Uttar Pradesh
    case 30:
    case 31:
    case 32:
    case 33:
    case 34:
      return 8; // Rajasthan
    case 36:
    case 37:
    case 38:
    case 39:
      return 24; // Gujarat
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
      return 27; // Maharashtra
    case 45:
    case 46:
    case 47:
    case 48:
      return 23; // Madhya Pradesh
    case 49:
      return 22; // Chhattisgarh
    case 50:
      return 36; // Telangana
    case 51:
    case 52:
    case 53:
      return 37; // Andhra Pradesh
    case 56:
    case 57:
    case 58:
    case 59:
      return 29; // Karnataka
    case 60:
    case 61:
    case 62:
    case 63:
    case 64:
      return 33; // Tamil Nadu
    case 67:
    case 68:
    case 69:
      return 32; // Kerala
    case 70:
    case 71:
    case 72:
    case 73:
    case 74:
      return 19; // West Bengal
    case 75:
    case 76:
    case 77:
      return 21; // Odisha
    case 78:
      return 18; // Assam
    case 80:
    case 81:
    case 82:
    case 83:
    case 84:
    case 85:
      return 10; // Bihar
    default:
      return undefined;
  }
}

/**
 * Extracts 2-digit Indian GST State Code from an address string by matching state names.
 */
export function getStateCodeFromAddress(addressStr?: string): number | undefined {
  if (!addressStr) return undefined;
  const upper = addressStr.toUpperCase();
  const stateEntries = Object.values(GST_STATES).sort((a, b) => b.name.length - a.name.length);
  for (const st of stateEntries) {
    const escaped = st.name.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(upper)) {
      const code = parseInt(st.code, 10);
      if (!isNaN(code)) return code;
    }
  }
  return undefined;
}

export interface EWayBillTransportOptions {
  transDistance?: number;
  transporterId?: string;
  transporterName?: string;
  vehicleNumber?: string;
  vehicleType?: 'R' | 'O';
  transMode?: '1' | '2' | '3' | '4';
  transType?: '1' | '2' | '3' | '4';
  transDocNo?: string;
  transDocDate?: string;
}

export function generateEWayBillJson(
  company: CompanyProfile,
  invoice: Invoice,
  transportOptions: EWayBillTransportOptions = {}
): EWayBillBulkPayload {
  const fromStateCodeNum = parseInt(company.stateCode, 10) || 27;
  const toStateCodeNum = parseInt(invoice.partyStateCode || invoice.placeOfSupplyStateCode || company.stateCode, 10) || fromStateCodeNum;

  const fromPin = company.pincode
    ? parseInt(company.pincode.replace(/\D/g, ''), 10) || extractPincode(company.address)
    : extractPincode(company.address);
  const fromPlace = company.city || extractLocation(company.address, 'City');

  // Destination address, pincode, and place: prioritize shipping details (Bill-to Ship-to)
  const effectiveShippingPin = invoice.shippingPincode?.replace(/\D/g, '');
  const effectivePartyPin = invoice.partyPincode?.replace(/\D/g, '');
  const shippingAddressEmbeddedPin = extractPincode(invoice.shippingAddress, 0);

  const toPin = effectiveShippingPin
    ? parseInt(effectiveShippingPin, 10) || extractPincode(invoice.shippingAddress || invoice.partyAddress)
    : shippingAddressEmbeddedPin || (effectivePartyPin
    ? parseInt(effectivePartyPin, 10) || extractPincode(invoice.partyAddress)
    : extractPincode(invoice.shippingAddress || invoice.partyAddress));

  const effectiveConsigneeAddress = (invoice.shippingAddress || invoice.partyAddress || 'Customer Address').trim();
  const toPlace = extractLocation(invoice.shippingAddress || invoice.partyAddress, 'City');

  // Determine transType: '2' (Bill to - Ship to) if shipping address or pincode is specified and differs from billing details
  const shippingAddrTrimmed = invoice.shippingAddress?.trim();
  const partyAddrTrimmed = invoice.partyAddress?.trim();
  const shippingPinTrimmed = invoice.shippingPincode?.trim();
  const partyPinTrimmed = invoice.partyPincode?.trim();

  const isShippingDifferent = Boolean(
    (shippingAddrTrimmed && shippingAddrTrimmed !== partyAddrTrimmed) ||
    (shippingPinTrimmed && shippingPinTrimmed !== partyPinTrimmed) ||
    (shippingAddrTrimmed && !partyAddrTrimmed) ||
    (shippingPinTrimmed && !partyPinTrimmed)
  );

  const resolvedTransType: '1' | '2' | '3' | '4' =
    transportOptions.transType || (isShippingDifferent ? '2' : '1');

  const items: EWayBillJsonItem[] = invoice.items.map((it, idx) => ({
    itemNo: idx + 1,
    productName: it.name.substring(0, 50),
    productDesc: it.name.substring(0, 50),
    hsnCode: parseInt((it.hsnSacCode || '999999').replace(/\D/g, ''), 10) || 999999,
    quantity: it.quantity,
    qtyUnit: it.unit || 'NOS',
    taxableAmount: Math.round(it.taxableAmount * 100) / 100,
    sgstRate: invoice.isIntraState ? it.gstRate / 2 : 0,
    cgstRate: invoice.isIntraState ? it.gstRate / 2 : 0,
    igstRate: invoice.isIntraState ? 0 : it.gstRate,
    cessRate: it.cessRate || 0,
    cessNonAdvol: 0,
  }));

  // Destination state (actToStateCode) under NIC e-Way Bill Rule 138:
  // For Bill to - Ship to (transType '2') or when shipping destination details are provided,
  // actToStateCode must reflect the actual delivery state (derived from shipping pincode/address).
  let resolvedActToStateCode = toStateCodeNum;
  if (resolvedTransType === '2' || isShippingDifferent || invoice.shippingPincode || invoice.shippingAddress) {
    const shippingPin = effectiveShippingPin
      ? parseInt(effectiveShippingPin, 10)
      : (shippingAddressEmbeddedPin || undefined);
    const pinDerived = shippingPin ? getStateCodeFromPincode(shippingPin) : undefined;
    const addrDerived = getStateCodeFromAddress(invoice.shippingAddress);
    resolvedActToStateCode = pinDerived || addrDerived || toStateCodeNum;
  }

  const billEntry: EWayBillBillData = {
    userGstin: company.gstin,
    supplyType: 'O',
    subSupplyType: '1',
    docType: 'INV',
    docNo: invoice.invoiceNumber,
    docDate: formatEWayDate(invoice.date),
    transType: resolvedTransType,
    fromGstin: company.gstin,
    fromTrdName: company.tradeName || company.businessName,
    fromAddr1: (company.address || 'Registered Office').substring(0, 50),
    fromAddr2: '',
    fromPlace,
    fromPincode: fromPin,
    actFromStateCode: fromStateCodeNum,
    fromStateCode: fromStateCodeNum,
    toGstin: invoice.partyGstin || 'URP',
    toTrdName: invoice.partyName.substring(0, 50),
    toAddr1: effectiveConsigneeAddress.substring(0, 50),
    toAddr2: '',
    toPlace,
    toPincode: toPin,
    actToStateCode: resolvedActToStateCode,
    toStateCode: toStateCodeNum,
    totalValue: Math.round(invoice.totalTaxableAmount * 100) / 100,
    cgstValue: Math.round(invoice.totalCgst * 100) / 100,
    sgstValue: Math.round(((invoice.totalSgst || 0) + (invoice.totalUtgst || 0)) * 100) / 100,
    igstValue: Math.round(invoice.totalIgst * 100) / 100,
    cessValue: Math.round(invoice.totalCess * 100) / 100,
    totInvValue: Math.round(invoice.grandTotal * 100) / 100,
    itemList: items,
    transId: transportOptions.transporterId || invoice.transporterId || '',
    transName: transportOptions.transporterName || invoice.transporterName || '',
    transDocNo: invoice.transDocNo || '',
    transDocDate: invoice.transDocDate ? formatEWayDate(invoice.transDocDate) : '',
    transMode: transportOptions.transMode || invoice.transportMode || '1',
    transDistance: transportOptions.transDistance || invoice.transportDistance || 50,
    vehNo: (transportOptions.vehicleNumber || invoice.vehicleNumber)
      ? (transportOptions.vehicleNumber || invoice.vehicleNumber)!.trim().toUpperCase()
      : undefined,
    vehType: transportOptions.vehicleType || invoice.vehicleType || 'R',
  };

  return {
    version: '1.0.1118',
    billLists: [billEntry],
  };
}

export function downloadEWayBillJson(
  company: CompanyProfile,
  invoice: Invoice,
  transportOptions?: EWayBillTransportOptions
): void {
  const payload = generateEWayBillJson(company, invoice, transportOptions);
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', `EWayBill_${invoice.invoiceNumber}.json`);
  document.body.appendChild(a);
  a.click();
  a.remove();
}
