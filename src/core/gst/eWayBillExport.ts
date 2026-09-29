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

export function formatEWayDate(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
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

  const items: EWayBillJsonItem[] = invoice.items.map((it, idx) => ({
    itemNo: idx + 1,
    productName: it.name.substring(0, 50),
    productDesc: it.name.substring(0, 50),
    hsnCode: parseInt(it.hsnSacCode || '999999', 10) || 999999,
    quantity: it.quantity,
    qtyUnit: it.unit || 'NOS',
    taxableAmount: Math.round(it.taxableAmount * 100) / 100,
    sgstRate: invoice.isIntraState ? it.gstRate / 2 : 0,
    cgstRate: invoice.isIntraState ? it.gstRate / 2 : 0,
    igstRate: invoice.isIntraState ? 0 : it.gstRate,
    cessRate: 0,
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
    fromPlace: 'City Center',
    fromPincode: 400001,
    actFromStateCode: fromStateCodeNum,
    fromStateCode: fromStateCodeNum,
    toGstin: invoice.partyGstin || 'URP',
    toTrdName: invoice.partyName.substring(0, 50),
    toAddr1: (invoice.partyAddress || 'Customer Address').substring(0, 50),
    toAddr2: '',
    toPlace: 'Delivery Location',
    toPincode: 400001,
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
    vehNo: transportOptions.vehicleNumber || 'MH01AB1234',
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
