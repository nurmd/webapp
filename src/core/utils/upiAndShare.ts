import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';

export function getUpiPaymentUrl(company: CompanyProfile, invoice: Invoice): string {
  const upiId = company.upiId || 'merchant@upi';
  const name = encodeURIComponent(company.tradeName || company.businessName);
  const amount = (invoice.balanceAmount > 0 ? invoice.balanceAmount : invoice.grandTotal).toFixed(2);
  const note = encodeURIComponent(`Bill ${invoice.invoiceNumber}`);
  return `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR&tn=${note}`;
}

export function getWhatsAppShareUrl(invoice: Invoice, company: CompanyProfile, partyPhone?: string): string {
  const cleanPhone = (partyPhone || '').replace(/\D/g, '');
  const phone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  
  const text = `*Tax Invoice from ${company.tradeName || company.businessName}*
------------------------------
*Invoice No:* ${invoice.invoiceNumber}
*Date:* ${invoice.date}
*Customer:* ${invoice.partyName}
*Grand Total:* ₹${invoice.grandTotal.toLocaleString('en-IN')}
*Balance Due:* ₹${invoice.balanceAmount.toLocaleString('en-IN')}
*Payment Status:* ${invoice.paymentStatus}
------------------------------
${company.upiId ? `*Pay via UPI:* ${company.upiId}` : ''}
${company.bankName ? `*Bank:* ${company.bankName} | A/C: ${company.accountNumber} | IFSC: ${company.ifscCode}` : ''}

Thank you for your business!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function getPaymentReminderWhatsAppUrl(partyName: string, partyPhone: string, balanceAmount: number, companyName: string, upiId?: string): string {
  const cleanPhone = (partyPhone || '').replace(/\D/g, '');
  const phone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  const text = `Namaste ${partyName},

This is a gentle payment reminder from *${companyName}*.
Your outstanding balance is *₹${balanceAmount.toLocaleString('en-IN')}*.

${upiId ? `You can pay immediately via UPI: *${upiId}*` : ''}

Please let us know once paid or if you have any questions regarding your ledger statement.

Thank you!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
