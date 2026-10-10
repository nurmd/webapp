import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';

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

function extractPincode(addressStr?: string, defaultPin: number = 400001): number {
  if (!addressStr) return defaultPin;
  const match = addressStr.match(/\b([1-9][0-9]{5})\b/);
  if (match && match[1]) {
    const pin = parseInt(match[1], 10);
    if (!isNaN(pin)) return pin;
  }
  return defaultPin;
}

function extractLocation(addressStr?: string, defaultLoc: string = 'City'): string {
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

export function generateEWayBillJson(
  company: CompanyProfile,
  invoice: Invoice,
  transportOptions: {
    transDistance?: number;
    transporterId?: string;
    transporterName?: string;
    vehicleNumber?: string;
    vehicleType?: 'R' | 'O';
    transMode?: '1' | '2' | '3' | '4';
  } = {}
): EWayBillBulkPayload {
  const fromStateCodeNum = parseInt(company.stateCode, 10) || 27;
  const toStateCodeNum = parseInt(invoice.partyStateCode || invoice.placeOfSupplyStateCode || company.stateCode, 10) || fromStateCodeNum;

  const fromPin = company.pincode
    ? parseInt(company.pincode.replace(/\D/g, ''), 10) || extractPincode(company.address)
    : extractPincode(company.address);
  const fromPlace = company.city || extractLocation(company.address, 'City');

  const toPin = invoice.partyPincode
    ? parseInt(invoice.partyPincode.replace(/\D/g, ''), 10) || extractPincode(invoice.partyAddress)
    : extractPincode(invoice.partyAddress);
  const toPlace = extractLocation(invoice.partyAddress, 'City');

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

  const billEntry: EWayBillBillData = {
    userGstin: company.gstin,
    supplyType: 'O',
    subSupplyType: '1',
    docType: 'INV',
    docNo: invoice.invoiceNumber,
    docDate: formatEWayDate(invoice.date),
    transType: '1',
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
    toAddr1: (invoice.partyAddress || 'Customer Address').substring(0, 50),
    toAddr2: '',
    toPlace,
    toPincode: toPin,
    actToStateCode: toStateCodeNum,
    toStateCode: toStateCodeNum,
    totalValue: Math.round(invoice.totalTaxableAmount * 100) / 100,
    cgstValue: Math.round(invoice.totalCgst * 100) / 100,
    sgstValue: Math.round(invoice.totalSgst * 100) / 100,
    igstValue: Math.round(invoice.totalIgst * 100) / 100,
    cessValue: Math.round(invoice.totalCess * 100) / 100,
    totInvValue: Math.round(invoice.grandTotal * 100) / 100,
    itemList: items,
    transId: transportOptions.transporterId || '',
    transName: transportOptions.transporterName || '',
    transMode: transportOptions.transMode || '1',
    transDistance: transportOptions.transDistance || 50,
    vehNo: transportOptions.vehicleNumber ? transportOptions.vehicleNumber.trim().toUpperCase() : undefined,
    vehType: transportOptions.vehicleType || 'R',
  };

  return {
    version: '1.0.1118',
    billLists: [billEntry],
  };
}

export function downloadEWayBillJson(
  company: CompanyProfile,
  invoice: Invoice,
  transportOptions?: any
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
