import { useMemo } from 'react';
import { Invoice } from '../../../models/invoice.ts';
import { CompanyProfile } from '../../../models/company.ts';
import { formatDate } from '../../../core/utils/formatters.ts';
import { amountInWords } from '../../../core/utils/currencyWords.ts';
import { getStateByCode } from '../../../core/gst/stateCodes.ts';
import { formatThermalReceiptText } from '../../../core/printer/escpos.ts';
import { inclusiveFromExclusive } from '../../../core/gst/pricing.ts';
import { DEFAULT_INVOICES } from '../../../services/db.ts';
import { useParties } from '../../../core/store/useDataStore.ts';
import { printSettingsService, resolveReceiptTitle } from '../../../services/printSettingsService.ts';
import { generateQrCodeSvgString } from '../../../core/utils/qrCodeSvg.ts';
import { getPartyTotalBalanceDue } from '../../../core/utils/upiAndShare.ts';

export type InvoiceViewMode = 'MOBILE' | 'A4' | 'THERMAL';
export type InvoiceCopyType = 'ORIGINAL FOR RECIPIENT' | 'DUPLICATE FOR TRANSPORTER' | 'TRIPLICATE FOR SUPPLIER';

export interface UseInvoicePreviewModelInput {
  propInvoice: Invoice;
  company: CompanyProfile;
  thermalWidth: 32 | 48;
}

export function useInvoicePreviewModel(input: UseInvoicePreviewModelInput) {
  const { propInvoice, company, thermalWidth } = input;

  const isGst = company.isGstEnabled !== false && (propInvoice as any)?.isGstInvoice !== false;

  // If the invoice has no items, fall back to sample items from DEFAULT_INVOICES so preview is never empty
  const rawItems = (propInvoice as any)?.items || (propInvoice as any)?.lines || (propInvoice as any)?.invoiceItems || [];
  const hasItems = Array.isArray(rawItems) && rawItems.length > 0;
  const invoice = useMemo(() => {
    if (!hasItems) {
      const sample = DEFAULT_INVOICES[0];
      return {
        ...propInvoice,
        items: sample.items,
        totalGrossAmount: propInvoice.totalGrossAmount || sample.totalGrossAmount,
        totalDiscount: propInvoice.totalDiscount || sample.totalDiscount,
        totalTaxableAmount: propInvoice.totalTaxableAmount || sample.totalTaxableAmount,
        totalCgst: propInvoice.totalCgst || sample.totalCgst,
        totalSgst: propInvoice.totalSgst || sample.totalSgst,
        totalIgst: propInvoice.totalIgst || sample.totalIgst,
        totalTax: propInvoice.totalTax || sample.totalTax,
        grandTotal: propInvoice.grandTotal || sample.grandTotal,
        amountInWords: propInvoice.amountInWords || sample.amountInWords,
      };
    }
    return propInvoice;
  }, [propInvoice, hasItems]);

  const sellerStateObj = getStateByCode(company.stateCode || '');
  const buyerStateObj = getStateByCode(invoice.partyStateCode || '');
  const posStateCode = invoice.placeOfSupplyStateCode || company.stateCode || '';
  const posStateObj = getStateByCode(posStateCode);

  const a4Settings = printSettingsService.getSettings().a4;
  const parties = useParties();

  const party = useMemo(() => {
    if (!invoice.partyName && !invoice.partyId) return null;
    return (
      parties.find(
        (p) =>
          (invoice.partyId && p.id === invoice.partyId) ||
          (p.name && p.name.trim().toLowerCase() === (invoice.partyName || '').trim().toLowerCase())
      ) || null
    );
  }, [invoice.partyId, invoice.partyName, parties]);

  // Pull live party details so edited party info (name, phone, GSTIN, address)
  // reflects in previews/prints instead of the stale snapshot on the bill.
  const enrichedInvoice = useMemo(() => {
    if (!party) return invoice;
    return {
      ...invoice,
      partyName: party.name || invoice.partyName,
      partyPhone: party.phone || invoice.partyPhone,
      partyGstin: party.gstin || invoice.partyGstin,
      partyAddress: party.billingAddress || invoice.partyAddress,
    };
  }, [invoice, party]);

  const totalBalanceDue = useMemo(() => {
    return getPartyTotalBalanceDue(party) ?? invoice.balanceAmount;
  }, [party, invoice.balanceAmount]);

  // Normalize every line item to ensure all tax and numeric columns display accurately
  const itemsList = useMemo(() => {
    const raw = invoice.items || [];
    return raw.map((line: any, idx: number) => {
      const name =
        line.name ||
        line.itemName ||
        line.description ||
        line.title ||
        line.productName ||
        (line.item && line.item.name) ||
        `Product Item #${idx + 1}`;
      const hsnSacCode =
        line.hsnSacCode ||
        line.hsn ||
        line.hsnCode ||
        line.sacCode ||
        (line.item && line.item.hsnSacCode) ||
        '-';
      const quantity =
        Number(line.quantity ?? line.qty ?? line.count ?? (line.item && line.item.qty) ?? 1) || 1;
      const unit = line.unit || line.uom || (line.item && line.item.unit) || 'PCS';
      const unitPrice =
        Number(
          line.unitPrice ??
            line.rate ??
            line.price ??
            line.salePrice ??
            (line.item && line.item.salePrice) ??
            0
        ) || 0;
      const discountPercent = Number(line.discountPercent ?? line.discount ?? 0) || 0;
      const gstRate =
        Number(line.gstRate ?? line.taxRate ?? line.gst ?? (line.item && line.item.gstRate) ?? 0) ||
        0;

      const priceMode = line.priceMode ?? 'EXCLUSIVE';
      const storedInclusive = Number(line.unitPriceInclusive);
      const unitPriceInclusive =
        priceMode === 'INCLUSIVE'
          ? (Number.isFinite(storedInclusive) && storedInclusive > 0
              ? storedInclusive
              : inclusiveFromExclusive(unitPrice, gstRate))
          : inclusiveFromExclusive(unitPrice, gstRate);
      const cessRate = Number(line.cessRate ?? 0) || 0;

      const isInclusive = priceMode === 'INCLUSIVE';
      const gross = isInclusive ? unitPriceInclusive * quantity : unitPrice * quantity;

      const discountAmount =
        line.discountAmount !== undefined && line.discountAmount !== null
          ? Number(line.discountAmount)
          : (gross * discountPercent) / 100;

      const taxableAmount =
        line.taxableAmount !== undefined && line.taxableAmount !== null
          ? Number(line.taxableAmount)
          : isInclusive
          ? Math.max(0, gstRate > 0 ? (gross - discountAmount) / (1 + gstRate / 100) : gross - discountAmount)
          : Math.max(0, gross - discountAmount);

      const cessAmount =
        line.cessAmount !== undefined && line.cessAmount !== null
          ? Number(line.cessAmount)
          : (taxableAmount * cessRate) / 100;

      const isIntra = invoice.isIntraState !== false;
      const cgstAmount =
        line.cgstAmount !== undefined && line.cgstAmount !== null
          ? Number(line.cgstAmount)
          : isIntra
          ? (taxableAmount * (gstRate / 2)) / 100
          : 0;

      const sgstAmount =
        line.sgstAmount !== undefined && line.sgstAmount !== null
          ? Number(line.sgstAmount)
          : isIntra
          ? (taxableAmount * (gstRate / 2)) / 100
          : 0;

      const igstAmount =
        line.igstAmount !== undefined && line.igstAmount !== null
          ? Number(line.igstAmount)
          : !isIntra
          ? (taxableAmount * gstRate) / 100
          : 0;

      const utgstAmount =
        line.utgstAmount !== undefined && line.utgstAmount !== null
          ? Number(line.utgstAmount)
          : 0;

      const totalAmount =
        line.totalAmount !== undefined && line.totalAmount !== null
          ? Number(line.totalAmount)
          : taxableAmount + cgstAmount + sgstAmount + utgstAmount + igstAmount + cessAmount;

      return {
        id: line.id || line.itemId || `line-${idx}`,
        name,
        hsnSacCode,
        quantity,
        unit,
        unitPrice,
        priceMode,
        unitPriceInclusive,
        cessRate,
        cessAmount,
        discountPercent,
        discountAmount,
        taxableAmount,
        gstRate,
        cgstAmount,
        sgstAmount,
        utgstAmount,
        igstAmount,
        totalAmount,
      };
    });
  }, [invoice]);

  // Group items by HSN/SAC & GST rate for the standard Tally / ClearTax HSN Summary grid
  const hsnSummary = useMemo(() => {
    const summaryMap: Record<
      string,
      {
        hsnSac: string;
        taxableAmount: number;
        gstRate: number;
        cgstRate: number;
        cgstAmount: number;
        sgstRate: number;
        sgstAmount: number;
        igstRate: number;
        igstAmount: number;
        totalTax: number;
      }
    > = {};

    itemsList.forEach((item) => {
      const hsn = item.hsnSacCode?.trim() || 'N/A';
      const key = `${hsn}_${item.gstRate}`;
      const isIntra = invoice.isIntraState !== false;

      if (!summaryMap[key]) {
        summaryMap[key] = {
          hsnSac: hsn,
          taxableAmount: 0,
          gstRate: item.gstRate,
          cgstRate: isIntra ? item.gstRate / 2 : 0,
          cgstAmount: 0,
          sgstRate: isIntra ? item.gstRate / 2 : 0,
          sgstAmount: 0,
          igstRate: isIntra ? 0 : item.gstRate,
          igstAmount: 0,
          totalTax: 0,
        };
      }

      summaryMap[key].taxableAmount += item.taxableAmount;
      summaryMap[key].cgstAmount += item.cgstAmount;
      summaryMap[key].sgstAmount += item.sgstAmount;
      summaryMap[key].igstAmount += item.igstAmount;
      summaryMap[key].totalTax += item.cgstAmount + item.sgstAmount + item.igstAmount;
    });

    return Object.values(summaryMap);
  }, [itemsList, invoice.isIntraState]);

  const totalQuantity = useMemo(() => {
    return itemsList.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [itemsList]);

  const totalTaxable = useMemo(() => {
    return invoice.totalTaxableAmount || itemsList.reduce((s, i) => s + i.taxableAmount, 0);
  }, [invoice.totalTaxableAmount, itemsList]);

  const totalCgst = useMemo(() => {
    return isGst ? (invoice.totalCgst || itemsList.reduce((s, i) => s + i.cgstAmount, 0)) : 0;
  }, [isGst, invoice.totalCgst, itemsList]);

  const totalSgst = useMemo(() => {
    return isGst ? (invoice.totalSgst || itemsList.reduce((s, i) => s + i.sgstAmount, 0)) : 0;
  }, [isGst, invoice.totalSgst, itemsList]);

  const totalUtgst = useMemo(() => {
    return isGst ? (invoice.totalUtgst || itemsList.reduce((s, i) => s + (i.utgstAmount || 0), 0)) : 0;
  }, [isGst, invoice.totalUtgst, itemsList]);

  const totalIgst = useMemo(() => {
    return isGst ? (invoice.totalIgst || itemsList.reduce((s, i) => s + i.igstAmount, 0)) : 0;
  }, [isGst, invoice.totalIgst, itemsList]);

  const totalCess = useMemo(() => {
    return isGst
      ? (invoice.totalCess !== undefined && invoice.totalCess !== null
          ? Number(invoice.totalCess)
          : itemsList.reduce((s, i) => s + i.cessAmount, 0))
      : 0;
  }, [isGst, invoice.totalCess, itemsList]);

  const resolvedGrandTotal =
    invoice.grandTotal || itemsList.reduce((sum, item) => sum + item.totalAmount, 0);
  const resolvedTotalTax =
    invoice.totalTax || totalCgst + totalSgst + totalUtgst + totalIgst + totalCess;

  const wordsTotal = invoice.amountInWords || amountInWords(resolvedGrandTotal);
  const wordsTax = amountInWords(resolvedTotalTax);

  const isDeliveryChallan = invoice.invoiceType === 'DELIVERY_CHALLAN';
  const challanPurpose = invoice.challanType === 'SUPPLY_ON_APPROVAL'
    ? 'Supply on approval'
    : invoice.challanType === 'JOB_WORK'
    ? 'Job work'
    : invoice.challanType === 'OTHERS'
    ? 'Others'
    : invoice.challanType === 'FOR_REMOVAL'
    ? 'For removal'
    : undefined;

  const thermalSettings = printSettingsService.getSettings().thermal;

  const thermalText = formatThermalReceiptText(
    {
      companyName: thermalSettings.customStoreName || company.tradeName || company.businessName,
      companyAddress: thermalSettings.showAddress ? company.address : '',
      gstin: (thermalSettings.showGstin && isGst) ? company.gstin : '',
      phone: thermalSettings.showPhone ? company.phone : '',
      receiptTitle: isDeliveryChallan
        ? 'DELIVERY CHALLAN'
        : resolveReceiptTitle(thermalSettings.receiptTitle, company.isCompositionScheme, Boolean(company.gstin)),
      invoiceNo: invoice.invoiceNumber,
      date: formatDate(invoice.date),
      customerName: party?.name || invoice.partyName,
      customerPhone: party?.phone || (invoice.partyAddress?.match(/\b[6-9]\d{9}\b/)?.[0]),
      items: itemsList.map((i) => ({
        name: i.name,
        qty: i.quantity,
        rate: i.unitPrice,
        amount: i.totalAmount,
      })),
      taxableAmount: totalTaxable,
      totalDiscount: invoice.totalDiscount,
      cgstAmount: totalCgst,
      sgstAmount: totalUtgst > 0 ? totalUtgst : totalSgst,
      igstAmount: totalIgst,
      shippingAmount: invoice.shippingAmount,
      roundOff: invoice.roundOff,
      grandTotal: resolvedGrandTotal,
      paidAmount: isDeliveryChallan ? undefined : invoice.paidAmount,
      balanceAmount: isDeliveryChallan ? undefined : invoice.balanceAmount,
      partyBalance: isDeliveryChallan ? undefined : (party ? party.currentBalance : undefined),
      paymentSplits: isDeliveryChallan ? undefined : invoice.paymentSplits,
      upiId: isDeliveryChallan ? undefined : company.upiId,
      terms: company.termsAndConditions,
      stateName: sellerStateObj?.name,
      isCompositionScheme: company.isCompositionScheme,
      isDeliveryChallan,
      challanPurpose,
      vehicleNumber: invoice.vehicleNumber,
    },
    thermalWidth
  );

  const upiQrUrl = useMemo(() => {
    if (isDeliveryChallan || !company.upiId) return null;
    try {
      const upiPayload = `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(
        company.tradeName || company.businessName
      )}&am=${invoice.balanceAmount > 0 ? invoice.balanceAmount : resolvedGrandTotal}&cu=INR`;
      const svg = generateQrCodeSvgString(upiPayload, { size: 140, margin: 1 });
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    } catch {
      return null;
    }
  }, [isDeliveryChallan, company.upiId, company.tradeName, company.businessName, invoice.balanceAmount, resolvedGrandTotal]);

  return {
    company,
    hasItems,
    rawItems,
    invoice: enrichedInvoice,
    sellerStateObj,
    buyerStateObj,
    posStateCode,
    posStateObj,
    a4Settings,
    party,
    totalBalanceDue,
    itemsList,
    hsnSummary,
    totalQuantity,
    totalTaxable,
    totalCgst,
    totalSgst,
    totalUtgst,
    totalIgst,
    totalCess,
    resolvedGrandTotal,
    resolvedTotalTax,
    wordsTotal,
    wordsTax,
    isDeliveryChallan,
    challanPurpose,
    thermalSettings,
    thermalText,
    upiQrUrl,
    isGst,
  };
}

export type InvoicePreviewModel = ReturnType<typeof useInvoicePreviewModel>;
