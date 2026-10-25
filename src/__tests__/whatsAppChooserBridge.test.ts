import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeOpenExternalUrl } from '../core/utils/upiAndShare.ts';
import { openWhatsAppShare } from '../services/whatsappService.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';

describe('WhatsApp Chooser & AndroidBridge Integration', () => {
  const originalOpen = window.open;

  const mockCompany: CompanyProfile = {
    id: 'COMP-1',
    businessName: 'Super Store',
    tradeName: 'Super Store',
    gstin: '18AABCB1234F1Z5',
    pan: '',
    stateCode: '18',
    address: '',
    pincode: '',
    phone: '',
    email: '',
    website: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branchName: '',
    upiId: 'super@upi',
    termsAndConditions: '',
    invoicePrefix: 'INV-',
    isGstEnabled: true,
    isCompositionScheme: false,
  };

  const mockInvoice = {
    id: 'INV-100',
    invoiceNumber: 'INV-100',
    invoiceType: 'B2C' as const,
    date: '2026-10-23',
    dueDate: '2026-10-30',
    partyId: 'PTY-1',
    partyName: 'Rahul Traders',
    items: [],
    totalGrossAmount: 1000,
    totalDiscount: 0,
    totalTaxableAmount: 1000,
    totalCgst: 90,
    totalSgst: 90,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 180,
    roundOff: 0,
    grandTotal: 1180,
    balanceAmount: 1180,
    totalPaid: 0,
    paymentStatus: 'UNPAID',
    paymentMode: 'CREDIT',
  } as unknown as Invoice;

  beforeEach(() => {
    delete (window as any).AndroidBridge;
    window.open = vi.fn();
  });

  afterEach(() => {
    delete (window as any).AndroidBridge;
    window.open = originalOpen;
    vi.restoreAllMocks();
  });

  it('routes WhatsApp URLs to window.AndroidBridge.openWhatsAppUrl when present', () => {
    const openWhatsAppUrlSpy = vi.fn();
    (window as any).AndroidBridge = {
      openWhatsAppUrl: openWhatsAppUrlSpy,
    };

    const res = safeOpenExternalUrl('https://wa.me/919876543210?text=Hello');

    expect(openWhatsAppUrlSpy).toHaveBeenCalledWith('https://wa.me/919876543210?text=Hello');
    expect(res).toBe('bridge');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('routes api.whatsapp.com and whatsapp:// schemes to AndroidBridge', () => {
    const openWhatsAppUrlSpy = vi.fn();
    (window as any).AndroidBridge = {
      openWhatsAppUrl: openWhatsAppUrlSpy,
    };

    safeOpenExternalUrl('https://api.whatsapp.com/send?phone=919876543210&text=Test');
    expect(openWhatsAppUrlSpy).toHaveBeenCalledWith('https://api.whatsapp.com/send?phone=919876543210&text=Test');

    safeOpenExternalUrl('whatsapp://send?phone=919876543210');
    expect(openWhatsAppUrlSpy).toHaveBeenCalledWith('whatsapp://send?phone=919876543210');
  });

  it('falls back to window.open in browser when AndroidBridge is absent', () => {
    const mockWin = { closed: false };
    (window.open as any).mockReturnValue(mockWin);

    const res = safeOpenExternalUrl('https://wa.me/919876543210?text=Hello');

    expect(window.open).toHaveBeenCalledWith('https://wa.me/919876543210?text=Hello', '_blank');
    expect(res).toBe('window');
  });

  it('does not route non-WhatsApp external URLs through openWhatsAppUrl', () => {
    const openWhatsAppUrlSpy = vi.fn();
    (window as any).AndroidBridge = {
      openWhatsAppUrl: openWhatsAppUrlSpy,
    };
    const mockWin = { closed: false };
    (window.open as any).mockReturnValue(mockWin);

    const res = safeOpenExternalUrl('https://example.com/invoice/123');

    expect(openWhatsAppUrlSpy).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith('https://example.com/invoice/123', '_blank');
    expect(res).toBe('window');
  });

  it('openWhatsAppShare with +91, 91, and 0 prefixed numbers produces one normalized phone=919876543210 API URL', () => {
    const openWhatsAppUrlSpy = vi.fn();
    (window as any).AndroidBridge = {
      openWhatsAppUrl: openWhatsAppUrlSpy,
    };

    const variants = ['+91 98765 43210', '91-98765-43210', '09876543210', '9876543210'];
    for (const phone of variants) {
      openWhatsAppUrlSpy.mockClear();
      openWhatsAppShare(mockCompany, mockInvoice, { phoneNumber: phone });
      expect(openWhatsAppUrlSpy).toHaveBeenCalled();
      const calledUrl = openWhatsAppUrlSpy.mock.calls[0][0];
      expect(calledUrl).toContain('https://api.whatsapp.com/send?phone=919876543210&text=');
    }
  });

  it('openWhatsAppShare with invalid or missing phone produces chooser URL without phone parameter', () => {
    const openWhatsAppUrlSpy = vi.fn();
    (window as any).AndroidBridge = {
      openWhatsAppUrl: openWhatsAppUrlSpy,
    };

    // Missing phone
    openWhatsAppShare(mockCompany, mockInvoice, {});
    expect(openWhatsAppUrlSpy).toHaveBeenCalled();
    let calledUrl = openWhatsAppUrlSpy.mock.calls[0][0];
    expect(calledUrl.startsWith('https://api.whatsapp.com/send?text=')).toBe(true);
    expect(calledUrl).not.toContain('phone=');

    // Invalid phone
    openWhatsAppUrlSpy.mockClear();
    openWhatsAppShare(mockCompany, mockInvoice, { phoneNumber: '12345' });
    calledUrl = openWhatsAppUrlSpy.mock.calls[0][0];
    expect(calledUrl.startsWith('https://api.whatsapp.com/send?text=')).toBe(true);
    expect(calledUrl).not.toContain('phone=');
  });

  it('falls through gracefully when AndroidBridge throws an exception without crashing', () => {
    (window as any).AndroidBridge = {
      openWhatsAppUrl: vi.fn(() => {
        throw new Error('Bridge runtime detached');
      }),
    };
    const mockWin = { closed: false };
    (window.open as any).mockReturnValue(mockWin);

    let thrown = false;
    let res = '';
    try {
      res = safeOpenExternalUrl('https://wa.me/919876543210?text=Hello');
    } catch {
      thrown = true;
    }

    expect(thrown).toBe(false);
    expect(window.open).toHaveBeenCalledWith('https://wa.me/919876543210?text=Hello', '_blank');
    expect(res).toBe('window');
  });

  it('asserts no duplicate text encoding in generated messages', () => {
    const openWhatsAppUrlSpy = vi.fn();
    (window as any).AndroidBridge = {
      openWhatsAppUrl: openWhatsAppUrlSpy,
    };

    openWhatsAppShare(mockCompany, mockInvoice, {
      phoneNumber: '9876543210',
      overrideTemplate: 'Total: ₹100 & Tax: 18% #INV-1 🙏',
    });

    const calledUrl = openWhatsAppUrlSpy.mock.calls[0][0];
    expect(calledUrl).toContain('%26'); // &
    expect(calledUrl).toContain('%23'); // #
    expect(calledUrl).toContain('%25'); // %
    expect(calledUrl).not.toContain('%2526');
    expect(calledUrl).not.toContain('%2523');
    expect(calledUrl).not.toContain('%2525');
  });
});
