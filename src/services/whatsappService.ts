import { Invoice } from '../models/invoice.ts';
import { CompanyProfile } from '../models/company.ts';
import { formatINR, formatDate } from '../core/utils/formatters.ts';

export type TemplateLanguage = 'en' | 'hi' | 'hinglish';
export type MessagePurpose = 'invoice' | 'reminder' | 'statement';

export interface WhatsAppTemplateConfig {
  language: TemplateLanguage;
  purpose: MessagePurpose;
  customText?: string;
}

export const DEFAULT_TEMPLATES: Record<MessagePurpose, Record<TemplateLanguage, string>> = {
  invoice: {
    en: `Dear {customer_name},\n\nThank you for choosing *{store_name}*! 🙏\n\n🧾 *Invoice:* #{invoice_no}\n📅 *Date:* {date}\n💰 *Total Amount:* {amount}\n\n💳 *Pay via UPI:*\n{upi_link}\n\nWe look forward to serving you again!`,
    hi: `नमस्ते {customer_name},\n\n*{store_name}* से ख़रीदारी करने के लिए धन्यवाद! 🙏\n\n🧾 *बिल संख्या:* #{invoice_no}\n📅 *दिनांक:* {date}\n💰 *कुल राशि:* {amount}\n\n💳 *UPI से तुरंत भुगतान करें:*\n{upi_link}\n\nशुभकामनाएं!`,
    hinglish: `Namaste {customer_name},\n\n*{store_name}* se shopping karne ke liye shukriya! 🙏\n\n🧾 *Bill No:* #{invoice_no}\n📅 *Date:* {date}\n💰 *Bill Amount:* {amount}\n\n💳 *UPI se payment karein:*\n{upi_link}\n\nAapka din shubh ho!`,
  },
  reminder: {
    en: `Dear {customer_name},\n\nThis is a friendly payment reminder from *{store_name}*.\n\nYour invoice *#{invoice_no}* for *{amount}* is pending payment.\n\n💳 *Pay Instantly via UPI:*\n{upi_link}\n\nThank you!`,
    hi: `नमस्ते {customer_name},\n\n*{store_name}* की ओर से सादर स्मरण।\n\nआपका बिल *#{invoice_no}*, राशि *{amount}* का भुगतान अभी बाकी है।\n\n💳 *UPI से तुरंत भुगतान करें:*\n{upi_link}\n\nसधन्यवाद!`,
    hinglish: `Namaste {customer_name},\n\nYeh *{store_name}* ki taraf se gentle payment reminder hai.\n\nAapka bill *#{invoice_no}* amount *{amount}* pending hai.\n\n💳 *UPI se turant pay karein:*\n{upi_link}\n\nDhanyawad!`,
  },
  statement: {
    en: `Dear {customer_name},\n\nHere is your ledger account summary from *{store_name}*.\n\nOutstanding Due Balance: *{amount}*.\n\n💳 *Clear balance via UPI:*\n{upi_link}\n\nThank you for your valued partnership.`,
    hi: `नमस्ते {customer_name},\n\n*{store_name}* द्वारा आपका खाता सारांश प्रस्तुत है।\n\nबकाया राशि: *{amount}*.\n\n💳 *UPI द्वारा तुरंत भुगतान करें:*\n{upi_link}\n\nधन्यवाद!`,
    hinglish: `Namaste {customer_name},\n\n*{store_name}* ki taraf se aapka ledger statement.\n\nTotal Due Balance: *{amount}*.\n\n💳 *UPI link se clear karein:*\n{upi_link}\n\nShukriya!`,
  },
};

export function buildUpiPayLink(company: CompanyProfile, invoice: Invoice): string {
  if (!company.upiId) return '';
  const note = `Inv_${invoice.invoiceNumber}`.substring(0, 25);
  return `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(
    company.tradeName || company.businessName
  )}&am=${invoice.grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
}

export function formatWhatsAppMessage(
  company: CompanyProfile,
  invoice: Invoice,
  options: {
    language?: TemplateLanguage;
    purpose?: MessagePurpose;
    overrideTemplate?: string;
  } = {}
): string {
  const language = options.language || 'en';
  const purpose = options.purpose || 'invoice';
  const raw = options.overrideTemplate || DEFAULT_TEMPLATES[purpose][language];

  const upiLink = company.upiId
    ? `https://upiqr.in/?pa=${company.upiId}&pn=${encodeURIComponent(
        company.tradeName || company.businessName
      )}&am=${invoice.grandTotal.toFixed(2)}&tn=Inv_${invoice.invoiceNumber}`
    : 'Cash / Bank Transfer';

  const formattedAmount = formatINR(invoice.grandTotal);
  const formattedDate = formatDate(invoice.date);

  return raw
    .replace(/{customer_name}/g, invoice.partyName || 'Valued Customer')
    .replace(/{store_name}/g, company.tradeName || company.businessName)
    .replace(/{invoice_no}/g, invoice.invoiceNumber)
    .replace(/{amount}/g, formattedAmount)
    .replace(/{date}/g, formattedDate)
    .replace(/{upi_link}/g, upiLink);
}

export function openWhatsAppShare(
  company: CompanyProfile,
  invoice: Invoice,
  options: {
    phoneNumber?: string;
    language?: TemplateLanguage;
    purpose?: MessagePurpose;
    overrideTemplate?: string;
  } = {}
): void {
  const message = formatWhatsAppMessage(company, invoice, options);
  const cleanPhone = options.phoneNumber
    ? options.phoneNumber.replace(/\D/g, '')
    : '';

  const phoneParam = cleanPhone ? `phone=91${cleanPhone.slice(-10)}&` : '';
  const url = `https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}
