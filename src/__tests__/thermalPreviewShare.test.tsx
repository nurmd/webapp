import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as htmlToImage from 'html-to-image';
import { ThermalPrintModal } from '../components/Printing/ThermalPrintModal.tsx';
import {
  renderThermalPreviewImage,
  renderThermalReceiptImage,
  shareReceiptImage,
} from '../core/utils/receiptImageShare.ts';
import * as receiptImageShare from '../core/utils/receiptImageShare.ts';
import {
  buildThermalReceiptData,
  buildThermalReceiptText,
} from '../core/utils/thermalReceiptText.ts';
import * as toastService from '../services/toast.ts';
import { Invoice } from '../models/invoice.ts';
import { CompanyProfile } from '../models/company.ts';
import { db } from '../services/db.ts';

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

describe('Thermal Preview & Receipt Image Share Suite', () => {
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

  describe('thermalReceiptText utility', () => {
    it('buildThermalReceiptData builds complete receipt data with company and items', () => {
      vi.spyOn(db, 'getParties').mockReturnValue([
        { id: 'PARTY-1', name: 'Tata Motors Limited', phone: '9876543210' } as any,
      ]);

      const data = buildThermalReceiptData(mockInvoice, mockCompany);
      expect(data.companyName).toBe('Apex Supplies');
      expect(data.invoiceNo).toBe('INV-2026-101');
      expect(data.customerName).toBe('Tata Motors Limited');
      expect(data.customerPhone).toBe('9876543210');
      expect(data.items).toHaveLength(1);
      expect(data.grandTotal).toBe(3540);
    });

    it('buildThermalReceiptText formats receipt text matching width', () => {
      const text32 = buildThermalReceiptText(mockInvoice, mockCompany, 32);
      expect(text32).toContain('APEX SUPPLIES');
      expect(text32).toContain('Bill No:');

      const text48 = buildThermalReceiptText(mockInvoice, mockCompany, 48);
      expect(text48).toContain('INV-2026-101');
      expect(text48).toContain('APEX SUPPLIES');
    });
  });

  describe('ThermalPrintModal rendering & actions', () => {
    it('renders A4 / PDF button when onPrintA4 is passed', () => {
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

    it('renders Share Image button and captures thermal preview DOM via html-to-image', async () => {
      const fakeBlob = new Blob(['preview-blob'], { type: 'image/png' });
      const previewSpy = vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockResolvedValue(fakeBlob);
      const shareSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('shared');
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
      expect(shareBtn).not.toBeNull();
      expect(shareBtn?.textContent).toContain('Share Image');

      await act(async () => {
        shareBtn?.click();
      });

      expect(previewSpy).toHaveBeenCalledWith(expect.any(HTMLElement));
      expect(shareSpy).toHaveBeenCalledWith(fakeBlob, expect.any(String), expect.any(Object));
      expect(toastSpy).toHaveBeenCalledWith('Receipt image shared.');
    });

    it('falls back to canvas text renderThermalReceiptImage when DOM capture fails in ThermalPrintModal', async () => {
      vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockRejectedValue(new Error('DOM capture failed'));
      const fallbackBlob = new Blob(['fallback-canvas'], { type: 'image/png' });
      const fallbackSpy = vi.spyOn(receiptImageShare, 'renderThermalReceiptImage').mockResolvedValue(fallbackBlob);
      const shareSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('shared');

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
      await act(async () => {
        shareBtn?.click();
      });

      expect(fallbackSpy).toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalledWith(fallbackBlob, expect.any(String), expect.any(Object));
    });
  });

  describe('receiptImageShare utilities', () => {
    it('renderThermalPreviewImage calls toBlob from html-to-image with cacheBust and pixelRatio', async () => {
      const fakeBlob = new Blob(['preview-image'], { type: 'image/png' });
      const toBlobSpy = vi.spyOn(htmlToImage, 'toBlob').mockResolvedValue(fakeBlob);
      const testNode = document.createElement('div');

      const blob = await renderThermalPreviewImage(testNode);
      expect(blob).toBe(fakeBlob);
      expect(toBlobSpy).toHaveBeenCalledWith(testNode, {
        cacheBust: true,
        pixelRatio: 2,
      });
    });

    it('renderThermalPreviewImage rejects when node is missing or toBlob returns null', async () => {
      await expect(renderThermalPreviewImage(null as any)).rejects.toThrow('Target node is missing');

      vi.spyOn(htmlToImage, 'toBlob').mockResolvedValue(null);
      const testNode = document.createElement('div');
      await expect(renderThermalPreviewImage(testNode)).rejects.toThrow('html-to-image failed to produce a Blob');
    });

    it('renderThermalReceiptImage fallback produces a png blob on canvas', async () => {
      let capturedWidth = 0;
      let capturedHeight = 0;
      const fillRectSpy = vi.fn();
      const fillTextSpy = vi.fn();

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
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
          } as any;
        }
        return origCreateElement(tagName);
      });

      const blob = await renderThermalReceiptImage('TEST LINE', 32);
      expect(blob).toBeInstanceOf(Blob);
      expect(capturedWidth).toBe(576);
      expect(fillRectSpy).toHaveBeenCalled();
    });

    it('shareReceiptImage returns cancelled on AbortError and NotAllowedError', async () => {
      const fakeBlob = new Blob(['dummy'], { type: 'image/png' });
      const nav = window.navigator as any;
      const origCanShare = nav.canShare;
      const origShare = nav.share;

      nav.canShare = vi.fn().mockReturnValue(true);

      const abortError = new Error('Abort');
      abortError.name = 'AbortError';
      nav.share = vi.fn().mockRejectedValue(abortError);

      try {
        const res = await shareReceiptImage(fakeBlob, 'test.png');
        expect(res).toBe('cancelled');
      } finally {
        nav.canShare = origCanShare;
        nav.share = origShare;
      }
    });
  });
});
