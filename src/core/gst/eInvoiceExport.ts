import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatEWayDate } from './eWayBillExport.ts';

export interface EInvoicePayload {
  Version: string;
  TranDtls: {
    TaxSch: string; // "GST"
    SupTyp: string; // "B2B", "SEZWP", "SEZWOP", "EXPWP", "EXPWOP", "DEXP"
    RegRev: 'Y' | 'N';
    EcmGstin: string | null;
    IgstOnIntra: 'Y' | 'N';
  };
  DocDtls: {
    Typ: 'INV' | 'CRN' | 'DBN';
    No: string;
    Dt: string; // DD/MM/YYYY
  };
  SellerDtls: {
    Gstin: string;
    LglNm: string;
    TrdNm?: string;
    Addr1: string;
    Addr2?: string;
    Loc: string;
    Pin: number;
    Stcd: string;
    Ph?: string;
    Em?: string;
  };
  BuyerDtls: {
    Gstin: string;
    LglNm: string;
    Pos: string;
    Addr1: string;
    Addr2?: string;
    Loc: string;
    Pin: number;
    Stcd: string;
    Ph?: string;
    Em?: string;
  };
  ItemList: Array<{
    SlNo: string;
    PrdDesc: string;
    IsServc: 'Y' | 'N';
    HsnCd: string;
    Barcde?: string;
    Qty: number;
    FreeQty: number;
    Unit: string;
    UnitPrice: number;
    TotAmt: number;
    Discount: number;
    PreTaxVal: number;
    AssAmt: number;
    GstRt: number;
    IgstAmt: number;
    CgstAmt: number;
    SgstAmt: number;
    CesRt: number;
    CesAmt: number;
    CesNonAdvlAmt: number;
    StateCesRt: number;
    StateCesAmt: number;
    StateCesNonAdvlAmt: number;
    OthChrg: number;
    TotItemVal: number;
  }>;
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    CesVal: number;
    StCesVal: number;
    Discount: number;
    OthChrg: number;
    RndOffAmt: number;
    TotInvVal: number;
  };
}

/**
 * Extracts a 6-digit Indian PIN code from address string or returns a fallback.
 */
function extractPincode(addressStr?: string, defaultPin: number = 400001): number {
  if (!addressStr) return defaultPin;
  const match = addressStr.match(/\b([1-9][0-9]{5})\b/);
  if (match && match[1]) {
    const pin = parseInt(match[1], 10);
    if (!isNaN(pin)) return pin;
  }
  return defaultPin;
}

/**
 * Extracts city/location from address or falls back to state name / default.
 */
function extractLocation(addressStr?: string, defaultLoc: string = 'City'): string {
  if (!addressStr) return defaultLoc;
  const parts = addressStr.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Usually second-to-last or last part before pin is city
    const candidate = parts[parts.length - 1].replace(/\b[1-9][0-9]{5}\b/g, '').trim();
    if (candidate.length >= 2) return candidate.substring(0, 50);
  }
  if (parts.length > 0) {
    return parts[0].substring(0, 50);
  }
  return defaultLoc;
}

export function generateEInvoiceJson(
  company: CompanyProfile,
  invoice: Invoice
): EInvoicePayload {
  const isIntra = invoice.isIntraState;
  const buyerState = invoice.placeOfSupplyStateCode || company.stateCode;

  // Determine Supply Type
  let supTyp = 'B2B';
  if (invoice.invoiceType === 'EXPORT') {
    supTyp = invoice.exportType === 'WOPAY' ? 'EXPWOP' : 'EXPWP';
  } else if (invoice.supplyType) {
    supTyp = invoice.supplyType;
  }

  // Determine Document Type: INV, CRN, DBN
  let docTyp: 'INV' | 'CRN' | 'DBN' = 'INV';
  if (invoice.invoiceType === 'CREDIT_NOTE') docTyp = 'CRN';
  else if (invoice.invoiceType === 'DEBIT_NOTE') docTyp = 'DBN';

  // Seller Details
  const sellerPin = company.pincode
    ? parseInt(company.pincode.replace(/\D/g, ''), 10) || extractPincode(company.address)
    : extractPincode(company.address);
  const sellerLoc = company.city || extractLocation(company.address, 'City');

  // Buyer Details
  const buyerPin = invoice.partyPincode
    ? parseInt(invoice.partyPincode.replace(/\D/g, ''), 10) || extractPincode(invoice.partyAddress)
    : extractPincode(invoice.partyAddress);
  const buyerLoc = extractLocation(invoice.partyAddress, 'City');

  const itemList = invoice.items.map((it, idx) => {
    const grossTot = Math.round(it.quantity * it.unitPrice * 100) / 100;
    const itemDisc = Math.round((it.discountAmount || 0) * 100) / 100;
    const taxable = Math.round(it.taxableAmount * 100) / 100;
    const rate = it.gstRate;

    const cgst = isIntra ? Math.round(it.cgstAmount * 100) / 100 : 0;
    const sgst = isIntra ? Math.round(it.sgstAmount * 100) / 100 : 0;
    const igst = !isIntra ? Math.round(it.igstAmount * 100) / 100 : 0;
    const cess = Math.round((it.cessAmount || 0) * 100) / 100;

    return {
      SlNo: String(idx + 1),
      PrdDesc: it.name.substring(0, 100),
      IsServc: (it.hsnSacCode && it.hsnSacCode.startsWith('99') ? 'Y' : 'N') as 'Y' | 'N',
      HsnCd: it.hsnSacCode || '999999',
      Barcde: undefined,
      Qty: it.quantity,
      FreeQty: 0,
      Unit: it.unit || 'NOS',
      UnitPrice: it.unitPrice,
      TotAmt: grossTot,
      Discount: itemDisc,
      PreTaxVal: taxable,
      AssAmt: taxable,
      GstRt: rate,
      IgstAmt: igst,
      CgstAmt: cgst,
      SgstAmt: sgst,
      CesRt: it.cessRate || 0,
      CesAmt: cess,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: Math.round((taxable + cgst + sgst + igst + cess) * 100) / 100,
    };
  });

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: supTyp,
      RegRev: invoice.isRcm ? 'Y' : 'N',
      EcmGstin: null,
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: docTyp,
      No: invoice.invoiceNumber,
      Dt: formatEWayDate(invoice.date),
    },
    SellerDtls: {
      Gstin: company.gstin,
      LglNm: company.businessName,
      TrdNm: company.tradeName || company.businessName,
      Addr1: (company.address || 'Registered Office').substring(0, 60),
      Loc: sellerLoc,
      Pin: sellerPin,
      Stcd: company.stateCode,
      Ph: company.phone,
      Em: company.email,
    },
    BuyerDtls: {
      Gstin: invoice.partyGstin || 'URP',
      LglNm: invoice.partyName,
      Pos: buyerState,
      Addr1: (invoice.partyAddress || 'Buyer Office').substring(0, 60),
      Loc: buyerLoc,
      Pin: buyerPin,
      Stcd: buyerState,
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: Math.round(invoice.totalTaxableAmount * 100) / 100,
      CgstVal: Math.round(invoice.totalCgst * 100) / 100,
      SgstVal: Math.round(invoice.totalSgst * 100) / 100,
      IgstVal: Math.round(invoice.totalIgst * 100) / 100,
      CesVal: Math.round(invoice.totalCess * 100) / 100,
      StCesVal: 0,
      Discount: 0,
      OthChrg: Math.round((invoice.shippingAmount || 0) * 100) / 100,
      RndOffAmt: invoice.roundOff || 0,
      TotInvVal: Math.round(invoice.grandTotal * 100) / 100,
    },
  };
}

export function downloadEInvoiceJson(company: CompanyProfile, invoice: Invoice): void {
  const payload = generateEInvoiceJson(company, invoice);
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', `EInvoice_${invoice.invoiceNumber}.json`);
  document.body.appendChild(a);
  a.click();
  a.remove();
}
