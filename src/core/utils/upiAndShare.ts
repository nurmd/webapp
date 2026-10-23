import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';

export type WhatsAppTemplateType =
  | 'INVOICE_DELIVERY'
  | 'GENTLE_REMINDER'
  | 'OVERDUE_URGENT'
  | 'PARTY_STATEMENT';

export type WhatsAppLanguage = 'EN' | 'HI';

export interface WhatsAppMessageOptions {
  template?: WhatsAppTemplateType;
  language?: WhatsAppLanguage;
  partyPhone?: string;
  customNote?: string;
  overdueDays?: number;
}

export function cleanIndianPhoneNumber(rawPhone?: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export function getUpiPaymentUrl(company: CompanyProfile, invoiceOrAmount: Invoice | number, notePrefix: string = 'Bill'): string {
  const upiId = company.upiId || 'merchant@upi';
  const name = encodeURIComponent(company.tradeName || company.businessName);
  const amount = typeof invoiceOrAmount === 'number'
    ? invoiceOrAmount.toFixed(2)
    : (invoiceOrAmount.balanceAmount > 0 ? invoiceOrAmount.balanceAmount : invoiceOrAmount.grandTotal).toFixed(2);
  const note = encodeURIComponent(
    typeof invoiceOrAmount === 'number'
      ? `${notePrefix} Payment`
      : `${notePrefix} ${invoiceOrAmount.invoiceNumber}`
  );
  return `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR&tn=${note}`;
}

/**
 * Builds rich, structured WhatsApp message text for invoices, reminders, and statements
 */
export function buildWhatsAppMessage(
  company: CompanyProfile,
  data: {
    invoice?: Invoice;
    party?: Party;
    balanceAmount?: number;
    partyName?: string;
    partyPhone?: string;
  },
  options: WhatsAppMessageOptions = {}
): { text: string; cleanPhone: string; whatsappUrl: string } {
  const template = options.template || (data.invoice ? 'INVOICE_DELIVERY' : 'PARTY_STATEMENT');
  const lang = options.language || 'EN';
  const rawPhone = options.partyPhone || data.partyPhone || data.invoice?.partyPhone || data.party?.phone || '';
  const cleanPhone = cleanIndianPhoneNumber(rawPhone);

  const companyName = company.tradeName || company.businessName || 'Our Business';
  const partyName = data.partyName || data.invoice?.partyName || data.party?.name || 'Valued Customer';
  const balance = typeof data.balanceAmount === 'number'
    ? data.balanceAmount
    : data.invoice?.balanceAmount ?? data.party?.currentBalance ?? 0;
  const grandTotal = data.invoice?.grandTotal ?? balance;

  const upiDetails = company.upiId
    ? lang === 'HI'
      ? `\n💳 *UPI से तुरंत भुगतान करें:* ${company.upiId}`
      : `\n💳 *Pay Instantly via UPI:* ${company.upiId}`
    : '';

  const bankDetails = company.bankName && company.accountNumber
    ? lang === 'HI'
      ? `\n🏦 *बैंक खाता:* ${company.bankName} | खाता सं: ${company.accountNumber} | IFSC: ${company.ifscCode || 'N/A'}`
      : `\n🏦 *Bank Transfer:* ${company.bankName} | A/C: ${company.accountNumber} | IFSC: ${company.ifscCode || 'N/A'}`
    : '';

  let text = '';

  if (template === 'INVOICE_DELIVERY' && data.invoice) {
    const inv = data.invoice;
    const docTitle =
      inv.invoiceType === 'ESTIMATE'
        ? (lang === 'HI' ? 'कोटेशन / अनुमान' : 'Quotation / Estimate')
        : inv.invoiceType === 'SALES_ORDER'
        ? (lang === 'HI' ? 'बिक्री आदेश' : 'Sales Order')
        : inv.invoiceType === 'CREDIT_NOTE'
        ? (lang === 'HI' ? 'क्रेडिट नोट (सेल्स रिटर्न)' : 'Credit Note (Sales Return)')
        : (lang === 'HI' ? 'टैक्स इनवॉइस' : 'Tax Invoice');

    if (lang === 'HI') {
      text = `नमस्ते ${partyName},\n\n*${companyName}* की ओर से आपका ${docTitle} साझा किया गया है।\n` +
        `------------------------------\n` +
        `📄 *क्रमांक:* ${inv.invoiceNumber}\n` +
        `📅 *दिनांक:* ${inv.date}\n` +
        `💰 *कुल राशि:* ₹${inv.grandTotal.toLocaleString('en-IN')}\n` +
        `⚠️ *बकाया राशि:* ₹${inv.balanceAmount.toLocaleString('en-IN')}\n` +
        `📌 *स्थिति:* ${inv.paymentStatus === 'PAID' ? 'पूर्ण भुगतान' : inv.paymentStatus === 'PARTIAL' ? 'आंशिक भुगतान' : 'लंबित'}\n` +
        `------------------------------` +
        `${inv.balanceAmount > 0 ? upiDetails + bankDetails : ''}\n\n` +
        `धन्यवाद! आपका दिन शुभ हो। 🙏`;
    } else {
      text = `Hello ${partyName},\n\nPlease find your ${docTitle} from *${companyName}*.\n` +
        `------------------------------\n` +
        `📄 *Document No:* ${inv.invoiceNumber}\n` +
        `📅 *Date:* ${inv.date}\n` +
        `💰 *Grand Total:* ₹${inv.grandTotal.toLocaleString('en-IN')}\n` +
        `⚠️ *Balance Due:* ₹${inv.balanceAmount.toLocaleString('en-IN')}\n` +
        `📌 *Payment Status:* ${inv.paymentStatus}\n` +
        `------------------------------` +
        `${inv.balanceAmount > 0 ? upiDetails + bankDetails : ''}\n\n` +
        `Thank you for your business!`;
    }
  } else if (template === 'OVERDUE_URGENT') {
    const daysText = options.overdueDays ? ` (${options.overdueDays} days overdue)` : '';
    const daysTextHi = options.overdueDays ? ` (${options.overdueDays} दिनों से लंबित)` : '';

    if (lang === 'HI') {
      text = `⚠️ *अति आवश्यक भुगतान सूचना*\n\n` +
        `नमस्ते ${partyName},\n` +
        `*${companyName}* के रिकॉर्ड अनुसार आपकी कुल बकाया राशि *₹${Math.abs(balance).toLocaleString('en-IN')}* नियत तिथि से अधिक समय${daysTextHi} से लंबित है।\n\n` +
        `कृपया अपने व्यवसाय खाते को सुचारू बनाए रखने हेतु आज ही भुगतान करें।` +
        `${upiDetails}${bankDetails}\n\n` +
        `यदि भुगतान पहले ही कर दिया गया है तो कृपया पावती साझा करें। धन्यवाद!`;
    } else {
      text = `⚠️ *URGENT PAYMENT NOTICE*\n\n` +
        `Dear ${partyName},\n` +
        `As per our records at *${companyName}*, an outstanding balance of *₹${Math.abs(balance).toLocaleString('en-IN')}* is overdue${daysText}.\n\n` +
        `Please expedite this payment today to maintain an uninterrupted credit line.` +
        `${upiDetails}${bankDetails}\n\n` +
        `If you have already processed this payment, kindly share the transaction reference. Thank you!`;
    }
  } else if (template === 'GENTLE_REMINDER') {
    if (lang === 'HI') {
      text = `नमस्ते ${partyName},\n\n` +
        `यह *${companyName}* की ओर से एक विनम्र अनुस्मारक है। आपकी बकाया राशि *₹${Math.abs(balance).toLocaleString('en-IN')}* है।\n` +
        `${upiDetails}${bankDetails}\n\n` +
        `कृपया समयानुसार भुगतान कर सहयोग प्रदान करें। धन्यवाद! 🙏`;
    } else {
      text = `Dear ${partyName},\n\n` +
        `This is a gentle payment reminder from *${companyName}* regarding your pending balance of *₹${Math.abs(balance).toLocaleString('en-IN')}*.\n` +
        `${upiDetails}${bankDetails}\n\n` +
        `Please let us know once paid or if you need any clarification on your account. Thank you!`;
    }
  } else {
    // PARTY_STATEMENT
    if (lang === 'HI') {
      text = `📊 *खाता विवरण सूचना*\n\n` +
        `नमस्ते ${partyName},\n` +
        `*${companyName}* में आपके खाते की वर्तमान स्थिति:\n` +
        `------------------------------\n` +
        `💰 *वर्तमान शुद्ध शेष:* ₹${Math.abs(balance).toLocaleString('en-IN')} (${balance >= 0 ? 'देय' : 'अग्रिम'})\n` +
        `------------------------------` +
        `${balance > 0 ? upiDetails + bankDetails : ''}\n\n` +
        `विस्तृत लेजर विवरण हेतु संपर्क करें। धन्यवाद!`;
    } else {
      text = `📊 *Statement of Account*\n\n` +
        `Dear ${partyName},\n` +
        `Here is the latest balance summary from *${companyName}*:\n` +
        `------------------------------\n` +
        `💰 *Current Net Balance:* ₹${Math.abs(balance).toLocaleString('en-IN')} (${balance >= 0 ? 'To Pay' : 'Advance'})\n` +
        `------------------------------` +
        `${balance > 0 ? upiDetails + bankDetails : ''}\n\n` +
        `Please contact us if you need itemized ledger copies. Thank you!`;
    }
  }

  if (options.customNote && options.customNote.trim()) {
    text += `\n\n📝 *Note:* ${options.customNote.trim()}`;
  }

  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  return { text, cleanPhone, whatsappUrl };
}

/**
 * Backwards compatible helper for single invoice WhatsApp sharing
 */
export function getWhatsAppShareUrl(invoice: Invoice, company: CompanyProfile, partyPhone?: string): string {
  const result = buildWhatsAppMessage(company, { invoice, partyPhone }, { template: 'INVOICE_DELIVERY' });
  return result.whatsappUrl;
}

/**
 * Backwards compatible helper for payment reminder WhatsApp link
 */
export function getPaymentReminderWhatsAppUrl(
  partyName: string,
  partyPhone: string,
  balanceAmount: number,
  companyName: string,
  upiId?: string
): string {
  const cleanPhone = cleanIndianPhoneNumber(partyPhone);
  const text = `Namaste ${partyName},\n\nThis is a gentle payment reminder from *${companyName}*.\nYour outstanding balance is *₹${balanceAmount.toLocaleString('en-IN')}*.\n\n${upiId ? `*Pay immediately via UPI:* ${upiId}\n\n` : ''}Please let us know once paid. Thank you!`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Safely opens an external URL (such as WhatsApp web/app link) in a new window or current tab.
 */
export function safeOpenExternalUrl(url: string, target: string = '_blank'): void {
  if (typeof window === 'undefined') return;

  // Route WhatsApp links directly through AndroidBridge chooser when running inside native app
  const isWhatsApp =
    url.startsWith('https://wa.me/') ||
    url.startsWith('https://api.whatsapp.com/') ||
    url.startsWith('whatsapp://');
  if (isWhatsApp) {
    const bridge = (window as any).AndroidBridge;
    if (bridge && typeof bridge.openWhatsAppUrl === 'function') {
      bridge.openWhatsAppUrl(url);
      return;
    }
  }

  try {
    const win = window.open ? window.open(url, target) : null;
    if (!win || win.closed || typeof win.closed === 'undefined') {
      const a = document.createElement('a');
      a.href = url;
      a.target = target;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (_e) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = target;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      try {
        window.location.assign(url);
      } catch {}
    }
  }
}
