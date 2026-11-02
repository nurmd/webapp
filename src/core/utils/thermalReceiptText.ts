import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import {
  formatThermalReceiptText,
  ThermalReceiptData,
} from '../printer/escpos.ts';
import { printSettingsService } from '../../services/printSettingsService.ts';
import { inclusiveFromExclusive } from '../gst/pricing.ts';
import { db } from '../../services/db.ts';

/**
 * Builds structured receipt data for ESC/POS thermal printing and text rendering.
 * Extracts customer, items, tax breakdown, and company details matching thermal print settings.
 */
export function buildThermalReceiptData(
  invoice: Invoice,
  company: CompanyProfile
): ThermalReceiptData {
  const thermalSettings = printSettingsService.getSettings().thermal;

  let party = null;
  if (invoice.partyName || invoice.partyId) {
    const parties = db.getParties();
    party =
      parties.find(
        (p) =>
          (invoice.partyId && p.id === invoice.partyId) ||
          (p.name && p.name.trim().toLowerCase() === (invoice.partyName || '').trim().toLowerCase())
      ) || null;
  }

  const isDeliveryChallan = invoice.invoiceType === 'DELIVERY_CHALLAN';
  const challanPurpose =
    invoice.challanType === 'SUPPLY_ON_APPROVAL'
      ? 'Supply on approval'
      : invoice.challanType === 'JOB_WORK'
      ? 'Job work'
      : invoice.challanType === 'OTHERS'
      ? 'Others'
      : invoice.challanType === 'FOR_REMOVAL'
      ? 'For removal'
      : undefined;

  return {
    companyName: thermalSettings.customStoreName || company.tradeName || company.businessName,
    companyAddress: thermalSettings.showAddress ? company.address : '',
    gstin: thermalSettings.showGstin ? company.gstin : '',
    isGst: company.isGstEnabled !== false,
    phone: thermalSettings.showPhone ? company.phone : '',
    receiptTitle: isDeliveryChallan
      ? 'DELIVERY CHALLAN'
      : company.isCompositionScheme
      ? (!thermalSettings.receiptTitle || thermalSettings.receiptTitle === 'TAX INVOICE' || thermalSettings.receiptTitle === 'RETAIL INVOICE' ? 'Bill of Supply' : thermalSettings.receiptTitle)
      : thermalSettings.receiptTitle,
    invoiceNo: invoice.invoiceNumber,
    date: invoice.date,
    customerName: invoice.partyName,
    customerPhone: party?.phone || (invoice.partyAddress?.match(/\b[6-9]\d{9}\b/)?.[0]),
    items: invoice.items.map((i) => {
      const stored = Number(i.unitPriceInclusive);
      const isGstActive = company.isGstEnabled !== false && !company.isCompositionScheme;
      const rateInclusive =
        Number.isFinite(stored) && stored > 0
          ? stored
          : isGstActive
          ? inclusiveFromExclusive(i.unitPrice, i.gstRate || 0)
          : undefined;
      return {
        name: i.name,
        qty: i.quantity,
        rate: i.unitPrice,
        rateInclusive,
        cessRate: i.cessRate,
        amount: i.totalAmount,
      };
    }),
    taxableAmount: invoice.totalTaxableAmount,
    totalDiscount: thermalSettings.showItemDiscount ? invoice.totalDiscount : 0,
    cgstAmount: (!company.isCompositionScheme && thermalSettings.showTaxBreakdown) ? invoice.totalCgst : 0,
    sgstAmount: (!company.isCompositionScheme && thermalSettings.showTaxBreakdown) ? invoice.totalSgst : 0,
    igstAmount: (!company.isCompositionScheme && thermalSettings.showTaxBreakdown) ? invoice.totalIgst : 0,
    totalCess:
      !company.isCompositionScheme && thermalSettings.showTaxBreakdown
        ? invoice.totalCess
        : 0,
    shippingAmount: invoice.shippingAmount,
    roundOff: invoice.roundOff,
    grandTotal: invoice.grandTotal,
    paidAmount: isDeliveryChallan ? undefined : invoice.paidAmount,
    balanceAmount: isDeliveryChallan ? undefined : (thermalSettings.showBalanceDue ? invoice.balanceAmount : undefined),
    partyBalance: isDeliveryChallan ? undefined : (thermalSettings.showPartyBalance && party ? party.currentBalance : undefined),
    paymentSplits: isDeliveryChallan ? undefined : invoice.paymentSplits,
    upiId: isDeliveryChallan ? undefined : (thermalSettings.showUpiQr ? company.upiId : undefined),
    terms: thermalSettings.greetingText || company.termsAndConditions,
    isCompositionScheme: Boolean(company.isCompositionScheme),
    isDeliveryChallan,
    challanPurpose,
    vehicleNumber: invoice.vehicleNumber,
  };
}

/**
 * Builds formatted monospace receipt text for 32 or 48 column thermal receipt printers.
 */
export function buildThermalReceiptText(
  invoice: Invoice,
  company: CompanyProfile,
  width: 32 | 48
): string {
  const receiptData = buildThermalReceiptData(invoice, company);
  const thermalSettings = printSettingsService.getSettings().thermal;
  return formatThermalReceiptText(receiptData, width, {
    showPartyBalance: thermalSettings.showPartyBalance,
  });
}
