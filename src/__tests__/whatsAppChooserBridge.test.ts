import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeOpenExternalUrl } from '../core/utils/upiAndShare.ts';
import { openWhatsAppShare } from '../services/whatsappService.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';

describe('WhatsApp Chooser & AndroidBridge Integration', () => {
  const originalOpen = window.open;

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

    safeOpenExternalUrl('https://wa.me/919876543210?text=Hello');

    expect(openWhatsAppUrlSpy).toHaveBeenCalledWith('https://wa.me/919876543210?text=Hello');
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

    safeOpenExternalUrl('https://wa.me/919876543210?text=Hello');

    expect(window.open).toHaveBeenCalledWith('https://wa.me/919876543210?text=Hello', '_blank');
  });

  it('does not route non-WhatsApp external URLs through openWhatsAppUrl', () => {
    const openWhatsAppUrlSpy = vi.fn();
    (window as any).AndroidBridge = {
      openWhatsAppUrl: openWhatsAppUrlSpy,
    };
    const mockWin = { closed: false };
    (window.open as any).mockReturnValue(mockWin);

    safeOpenExternalUrl('https://example.com/invoice/123');

    expect(openWhatsAppUrlSpy).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith('https://example.com/invoice/123', '_blank');
  });

  it('openWhatsAppShare routes through safeOpenExternalUrl and the bridge', () => {
    const openWhatsAppUrlSpy = vi.fn();
    (window as any).AndroidBridge = {
      openWhatsAppUrl: openWhatsAppUrlSpy,
    };

    const company: CompanyProfile = {
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

    const invoice = {
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

    openWhatsAppShare(company, invoice, { phoneNumber: '9876543210' });

    expect(openWhatsAppUrlSpy).toHaveBeenCalled();
    const calledUrl = openWhatsAppUrlSpy.mock.calls[0][0];
    expect(calledUrl).toContain('https://api.whatsapp.com/send?phone=919876543210&text=');
    expect(window.open).not.toHaveBeenCalled();
  });
});
