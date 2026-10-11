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
  
  const docTitle = company.isCompositionScheme
    ? 'Bill of Supply'
    : company.isGstEnabled !== false
    ? 'Tax Invoice'
    : 'Invoice';

  const text = `*${docTitle} from ${company.tradeName || company.businessName}*
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

/**
 * Safely opens an external URL (such as WhatsApp web/app link) in a new window or current tab.
 * Defends against popup blockers and sandbox/webview restrictions by falling back to
 * a simulated link click or direct location navigation if window.open returns null or throws.
 */
export function safeOpenExternalUrl(url: string, target: string = '_blank'): void {
  if (typeof window === 'undefined') return;
  try {
    const win = window.open ? window.open(url, target) : null;
    // When popup blockers block window.open, it returns null or undefined.
    // In such cases, fallback to a simulated anchor click to trigger the protocol handler/intent.
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
    // If window.open throws (e.g. strict security policy or sandboxed iframe without allow-popups)
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
      } catch {
        // Fallback for restricted environments
      }
    }
  }
}
