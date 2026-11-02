import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SimplifiedInvoiceModal } from '../components/Invoicing/SimplifiedInvoiceModal.tsx';
import { ThermalPrintModal } from '../components/Printing/ThermalPrintModal.tsx';
import {
  renderThermalReceiptImage,
  shareReceiptImage,
} from '../core/utils/receiptImageShare.ts';
import * as receiptImageShare from '../core/utils/receiptImageShare.ts';
import * as toastService from '../services/toast.ts';
import { Invoice } from '../models/invoice.ts';
import { CompanyProfile } from '../models/company.ts';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Apex Industrial Supplies',
  tradeName: 'Apex Supplies',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  phone: '9876543210',
  email: 'apex@supplies.com',
  address: 'Plot 44, MIDC Industrial Area, Pune',
  pincode: '411018',
  stateCode: '27',
  isGstEnabled: true,
};

const mockInvoice: Invoice = {
  id: 'INV-101',
  invoiceNumber: 'INV-2026-101',
  invoiceType: 'B2B',
  date: '2026-10-28',
  partyId: 'PARTY-1',
  partyName: 'Tata Motors Limited',
  partyGstin: '27AAACT2727Q1ZW',
  partyAddress: 'Pune Industrial Complex',
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  items: [
    {
      itemId: 'ITEM-1',
      name: 'Industrial Valve 2-inch',
      hsnSacCode: '84818030',
      quantity: 2,
      unitPrice: 1500,
      unit: 'PCS',
      taxableAmount: 3000,
      gstRate: 18,
      cgstAmount: 270,
      sgstAmount: 270,
      igstAmount: 0,
      cessAmount: 0,
      total: 3540,
      totalAmount: 3540,
    } as any,
  ],
  totalGrossAmount: 3000,
  totalDiscount: 0,
  totalTaxableAmount: 3000,
  totalCgst: 270,
  totalSgst: 270,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 540,
  roundOff: 0,
  grandTotal: 3540,
  amountInWords: 'Three Thousand Five Hundred Forty Rupees Only',
  paidAmount: 3540,
  balanceAmount: 0,
  paymentStatus: 'PAID',
  paymentMode: 'UPI',
  notes: 'Thank you for your business.',
  terms: 'Payment due within 30 days.',
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
};

describe('Invoice Preview A4 Removal & Thermal Image Share', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const storageStore: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => storageStore[key] ?? null,
        setItem: (key: string, val: string) => {
          storageStore[key] = String(val);
        },
        removeItem: (key: string) => {
          delete storageStore[key];
        },
        clear: () => {
          Object.keys(storageStore).forEach((k) => delete storageStore[k]);
        },
      },
      writable: true,
      configurable: true,
    });

    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // 1. SimplifiedInvoiceModal does not render A4/PDF button even when legacy onOpenFullA4Preview is passed
  it('1. SimplifiedInvoiceModal does not render A4 / PDF button even when legacy onOpenFullA4Preview is passed; Print & WhatsApp buttons render', () => {
    const handlePrint = vi.fn();
    const handleLegacyA4 = vi.fn();

    act(() => {
      root.render(
        <SimplifiedInvoiceModal
          invoice={mockInvoice}
          company={mockCompany}
          onClose={vi.fn()}
          onPrintInvoice={handlePrint}
          {...({ onOpenFullA4Preview: handleLegacyA4 } as any)}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const a4Btn = buttons.find((b) => b.textContent?.includes('A4 / PDF'));
    expect(a4Btn).toBeUndefined();

    const printBtn = buttons.find((b) => b.textContent?.includes('Print Slip') || b.textContent?.includes('Print'));
    expect(printBtn).toBeDefined();

    const whatsAppBtn = buttons.find((b) => b.textContent?.includes('WhatsApp') || b.title?.includes('WhatsApp'));
    expect(whatsAppBtn).toBeDefined();
  });

  // 2. SimplifiedInvoiceModal renders invoice-preview-items-scroll container
  it('2. SimplifiedInvoiceModal wraps items grid in scroll container with max-h-[45vh] and overflow-y-auto', () => {
    act(() => {
      root.render(
        <SimplifiedInvoiceModal
          invoice={mockInvoice}
          company={mockCompany}
          onClose={vi.fn()}
        />
      );
    });

    const scrollContainer = container.querySelector('[data-testid="invoice-preview-items-scroll"]');
    expect(scrollContainer).toBeDefined();
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.className).toContain('max-h-[45vh]');
    expect(scrollContainer?.className).toContain('overflow-y-auto');
  });

  // 3. ThermalPrintModal still renders its A4 / PDF button when onPrintA4 is provided
  it('3. ThermalPrintModal still renders its A4 / PDF button when onPrintA4 is provided', () => {
    const handlePrintA4 = vi.fn();

    act(() => {
      root.render(
        <ThermalPrintModal
          invoice={mockInvoice}
          company={mockCompany}
          onClose={vi.fn()}
          onPrintA4={handlePrintA4}
        />
      );
    });

    const a4Btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('A4 / PDF')
    );
    expect(a4Btn).toBeDefined();

    act(() => {
      a4Btn?.click();
    });

    expect(handlePrintA4).toHaveBeenCalledWith(mockInvoice);
  });

  // 4. ThermalPrintModal renders Share Image button and triggers share flow
  it('4. ThermalPrintModal renders Share Image button and triggers share flow', async () => {
    const fakeBlob = new Blob(['fake-image'], { type: 'image/png' });
    const previewSpy = vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockResolvedValue(fakeBlob);
    const renderReceiptSpy = vi.spyOn(receiptImageShare, 'renderThermalReceiptImage').mockResolvedValue(fakeBlob);
    const shareReceiptSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('shared');
    const toastSpy = vi.spyOn(toastService, 'showAppToast');

    act(() => {
      root.render(
        <ThermalPrintModal
          invoice={mockInvoice}
          company={mockCompany}
          onClose={vi.fn()}
        />
      );
    });

    const shareBtn = container.querySelector<HTMLButtonElement>('[data-testid="share-thermal-image"]');
    expect(shareBtn).toBeDefined();
    expect(shareBtn).not.toBeNull();
    expect(shareBtn?.textContent).toContain('Share Image');

    await act(async () => {
      shareBtn?.click();
    });

    expect(previewSpy.mock.calls.length + renderReceiptSpy.mock.calls.length).toBeGreaterThan(0);
    expect(shareReceiptSpy).toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith('Receipt image shared.');
  });

  // 5. Unit test renderThermalReceiptImage
  it('5. renderThermalReceiptImage correctly measures canvas dimensions for 32 and 48 columns', async () => {
    let capturedWidth = 0;
    let capturedHeight = 0;
    const fillRectSpy = vi.fn();
    const fillTextSpy = vi.fn();

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        const mockCanvas: any = {
          set width(w: number) {
            capturedWidth = w;
          },
          get width() {
            return capturedWidth;
          },
          set height(h: number) {
            capturedHeight = h;
          },
          get height() {
            return capturedHeight;
          },
          getContext: (type: string) => {
            if (type === '2d') {
              return {
                fillRect: fillRectSpy,
                fillText: fillTextSpy,
                fillStyle: '',
                font: '',
                textBaseline: '',
              };
            }
            return null;
          },
          toBlob: (cb: (b: Blob | null) => void) => {
            cb(new Blob(['test-png'], { type: 'image/png' }));
          },
        };
        return mockCanvas;
      }
      return originalCreateElement(tagName);
    });

    const receiptText = 'LINE 1\nLINE 2\nLINE 3';

    // 32 columns -> 576px
    const blob32 = await renderThermalReceiptImage(receiptText, 32);
    expect(blob32).toBeInstanceOf(Blob);
    expect(capturedWidth).toBe(576);
    expect(capturedHeight).toBe(24 * 2 + 3 * 26); // 126
    expect(fillRectSpy).toHaveBeenCalledWith(0, 0, 576, 126);
    expect(fillTextSpy).toHaveBeenCalledTimes(3);

    // 48 columns -> 768px
    const blob48 = await renderThermalReceiptImage(receiptText, 48);
    expect(blob48).toBeInstanceOf(Blob);
    expect(capturedWidth).toBe(768);
    expect(capturedHeight).toBe(126);
    expect(fillRectSpy).toHaveBeenCalledWith(0, 0, 768, 126);
  });

  // 6. Unit test shareReceiptImage
  describe('6. shareReceiptImage behavior matrix', () => {
    const fakeBlob = new Blob(['dummy-image'], { type: 'image/png' });

    it('returns "shared" when navigator.canShare and navigator.share succeed', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      const canShareMock = vi.fn().mockReturnValue(true);

      const nav = window.navigator as any;
      const origCanShare = nav.canShare;
      const origShare = nav.share;

      nav.canShare = canShareMock;
      nav.share = shareMock;

      try {
        const result = await shareReceiptImage(fakeBlob, 'test.png', { phone: '9876543210' });
        expect(result).toBe('shared');
        expect(canShareMock).toHaveBeenCalled();
        expect(shareMock).toHaveBeenCalled();
      } finally {
        nav.canShare = origCanShare;
        nav.share = origShare;
      }
    });

    it('returns "downloaded" and triggers fallback download when navigator.canShare is false/unavailable', async () => {
      const nav = window.navigator as any;
      const origCanShare = nav.canShare;
      nav.canShare = vi.fn().mockReturnValue(false);

      const origCreateObjectUrl = URL.createObjectURL;
      const origRevokeObjectUrl = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      URL.revokeObjectURL = vi.fn();

      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      try {
        const result = await shareReceiptImage(fakeBlob, 'test.png', { phone: '9876543210' });
        expect(result).toBe('downloaded');
        expect(URL.createObjectURL).toHaveBeenCalledWith(fakeBlob);
        expect(appendSpy).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalled();
      } finally {
        nav.canShare = origCanShare;
        URL.createObjectURL = origCreateObjectUrl;
        URL.revokeObjectURL = origRevokeObjectUrl;
      }
    });

    it('returns "failed" when navigator.share throws', async () => {
      const nav = window.navigator as any;
      const origCanShare = nav.canShare;
      const origShare = nav.share;

      nav.canShare = vi.fn().mockReturnValue(true);
      nav.share = vi.fn().mockRejectedValue(new Error('Share canceled or failed'));

      try {
        const result = await shareReceiptImage(fakeBlob, 'test.png');
        expect(result).toBe('failed');
      } finally {
        nav.canShare = origCanShare;
        nav.share = origShare;
      }
    });

    it('returns "cancelled" when navigator.share throws AbortError or NotAllowedError', async () => {
      const nav = window.navigator as any;
      const origCanShare = nav.canShare;
      const origShare = nav.share;

      nav.canShare = vi.fn().mockReturnValue(true);

      const abortError = new Error('The user aborted the share operation.');
      abortError.name = 'AbortError';
      nav.share = vi.fn().mockRejectedValue(abortError);

      try {
        const result1 = await shareReceiptImage(fakeBlob, 'test.png');
        expect(result1).toBe('cancelled');

        const notAllowedError = new Error('Permission denied.');
        notAllowedError.name = 'NotAllowedError';
        nav.share = vi.fn().mockRejectedValue(notAllowedError);

        const result2 = await shareReceiptImage(fakeBlob, 'test.png');
        expect(result2).toBe('cancelled');
      } finally {
        nav.canShare = origCanShare;
        nav.share = origShare;
      }
    });
  });
});
