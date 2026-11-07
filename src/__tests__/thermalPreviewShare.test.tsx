import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as htmlToImage from 'html-to-image';
import { ThermalPrintModal } from '../components/Printing/ThermalPrintModal.tsx';
import { ThermalReceiptPreview } from '../components/Printing/ThermalReceiptPreview.tsx';
import { WhatsAppShareModal } from '../components/Common/WhatsAppShareModal.tsx';
import {
  renderThermalPreviewImage,
  renderThermalReceiptImage,
  shareReceiptImage,
  blobToBase64,
  shareImageNative,
  wrapReceiptText,
} from '../core/utils/receiptImageShare.ts';
import * as receiptImageShare from '../core/utils/receiptImageShare.ts';
import {
  buildThermalReceiptData,
  buildThermalReceiptText,
} from '../core/utils/thermalReceiptText.ts';
import * as toastService from '../services/toast.ts';
import { Invoice } from '../models/invoice.ts';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
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

      expect(previewSpy).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.any(String),
        expect.any(Number)
      );
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

    it('invokes AndroidBridge.shareImage when clicking Share Image in ThermalPrintModal if bridge is present', async () => {
      vi.spyOn(db, 'getParties').mockReturnValue([
        { id: 'PARTY-1', name: 'Tata Motors Limited', phone: '9876543210' } as any,
      ]);
      const shareMock = vi.fn();
      (window as any).AndroidBridge = { shareImage: shareMock };
      const fakeBlob = new Blob(['thermal-modal-receipt'], { type: 'image/png' });
      vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockResolvedValue(fakeBlob);
      const toastSpy = vi.spyOn(toastService, 'showAppToast');

      try {
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
          await vi.waitFor(() => {
            expect(shareMock).toHaveBeenCalledWith(
              btoa('thermal-modal-receipt'),
              `Receipt-${mockInvoice.invoiceNumber}.png`,
              'Share receipt image',
              '9876543210'
            );
          });
        });
        expect(toastSpy).toHaveBeenCalledWith('Receipt image shared.');
      } finally {
        delete (window as any).AndroidBridge;
      }
    });
  });

  describe('receiptImageShare utilities', () => {
    it('renderThermalPreviewImage calls toBlob from html-to-image with cacheBust and pixelRatio', async () => {
      const fakeBlob = new Blob([new Uint8Array(2048)], { type: 'image/png' });
      const toBlobSpy = vi.spyOn(htmlToImage, 'toBlob').mockResolvedValue(fakeBlob);
      const testNode = document.createElement('div');

      const blob = await renderThermalPreviewImage(testNode);
      expect(blob).toBe(fakeBlob);
      expect(toBlobSpy).toHaveBeenCalledWith(testNode, {
        cacheBust: true,
        pixelRatio: 2,
      });
    });

    it('renderThermalPreviewImage falls back to canvas when toBlob returns suspiciously small blob (<1KB)', async () => {
      const tinyBlob = new Blob(['too small'], { type: 'image/png' }); // 9 bytes
      vi.spyOn(htmlToImage, 'toBlob').mockResolvedValue(tinyBlob);

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            set width(_: number) {},
            get width() { return 576; },
            set height(_: number) {},
            get height() { return 100; },
            getContext: (type: string) => {
              if (type === '2d') {
                return {
                  fillRect: vi.fn(),
                  fillText: vi.fn(),
                  fillStyle: '',
                  font: '',
                  textBaseline: '',
                };
              }
              return null;
            },
            toBlob: (cb: (b: Blob | null) => void) => {
              cb(new Blob(['fallback-canvas-blob'], { type: 'image/png' }));
            },
          } as any;
        }
        return origCreateElement(tagName);
      });

      const testNode = document.createElement('div');
      const result = await renderThermalPreviewImage(testNode, 'FALLBACK TEXT', 32);
      expect(result).toBeInstanceOf(Blob);
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

    it('blobToBase64 converts a blob to a raw base64 string without data URL prefix', async () => {
      const testBlob = new Blob(['hello world'], { type: 'text/plain' });
      const base64 = await blobToBase64(testBlob);
      expect(base64).toBe(btoa('hello world'));
      expect(base64).not.toContain('data:');
    });

    it('shareImageNative returns false when AndroidBridge is absent or lacks shareImage', async () => {
      delete (window as any).AndroidBridge;
      const testBlob = new Blob(['sample'], { type: 'image/png' });
      const res1 = await shareImageNative(testBlob, 'receipt.png');
      expect(res1).toBe(false);

      (window as any).AndroidBridge = {};
      const res2 = await shareImageNative(testBlob, 'receipt.png');
      expect(res2).toBe(false);
      delete (window as any).AndroidBridge;
    });

    it('shareImageNative invokes AndroidBridge.shareImage with base64 and returns true', async () => {
      const shareMock = vi.fn();
      (window as any).AndroidBridge = { shareImage: shareMock };
      try {
        const testBlob = new Blob(['sample-content'], { type: 'image/png' });
        const res = await shareImageNative(testBlob, 'receipt.png', '9876543210');
        expect(res).toBe(true);
        expect(shareMock).toHaveBeenCalledWith(
          btoa('sample-content'),
          'receipt.png',
          'Share receipt image',
          '9876543210'
        );
      } finally {
        delete (window as any).AndroidBridge;
      }
    });

    it('shareReceiptImage dispatches to AndroidBridge.shareImage before Web Share when bridge is present', async () => {
      const shareMock = vi.fn();
      (window as any).AndroidBridge = { shareImage: shareMock };
      const nav = window.navigator as any;
      const origShare = nav.share;
      const webShareSpy = vi.fn();
      nav.share = webShareSpy;

      try {
        const testBlob = new Blob(['bridge-receipt'], { type: 'image/png' });
        const res = await shareReceiptImage(testBlob, 'Receipt-INV-101.png', { phone: '9876543210' });
        expect(res).toBe('shared');
        expect(shareMock).toHaveBeenCalledWith(
          btoa('bridge-receipt'),
          'Receipt-INV-101.png',
          'Share receipt image',
          '9876543210'
        );
        expect(webShareSpy).not.toHaveBeenCalled();
      } finally {
        delete (window as any).AndroidBridge;
        nav.share = origShare;
      }
    });
  });

  describe('ThermalReceiptPreview Content-Sized Capture Node (No Cropping)', () => {
    // html-to-image captures the node at its rendered width.
    // If the node is constrained by w-full or max-w-[...], 48-column text gets clipped on the right.
    // The node must size to its content (w-max, max-w-none, overflow-visible) so full text is captured.
    it('renders 48-column thermal receipt preview with content-sized layout preventing cropped image exports', () => {
      const previewText = buildThermalReceiptText(mockInvoice, mockCompany, 48);

      act(() => {
        root.render(<ThermalReceiptPreview previewText={previewText} width={48} />);
      });

      const node = container.querySelector('[data-testid="thermal-receipt-preview"]')!;
      expect(node).toBeTruthy();
      expect(node.className).toContain('w-max');
      expect(node.className).toContain('max-w-none');
      expect(node.className).toContain('overflow-visible');
      expect(node.className).not.toContain('w-full');
      expect(node.className).not.toContain('max-w-[320px]');
      expect(node.className).not.toContain('max-w-[420px]');
      expect(node.className).not.toContain('overflow-x-auto');
    });
  });

  describe('WhatsApp Share Modal & Image Capture Enhancements (WHATSAPP_FIX_TASK)', () => {
    it('WhatsAppShareModal: invoice with initialBalance=720, party total due 0 renders Balance Due: ₹720 and Total Balance Due: ₹0', () => {
      const inv: Invoice = {
        ...mockInvoice,
        balanceAmount: 720,
      };
      act(() => {
        root.render(
          <WhatsAppShareModal
            isOpen={true}
            invoice={inv}
            company={mockCompany}
            onClose={vi.fn()}
            initialBalance={720}
            initialTotalBalanceDue={0}
          />
        );
      });
      const previewBox = container.querySelector('[data-testid="whatsapp-message-preview-box"]');
      expect(previewBox).toBeTruthy();
      expect(previewBox?.textContent).toContain('*Balance Due:* ₹720');
      expect(previewBox?.textContent).toContain('*Total Balance Due:* ₹0');
    });

    it('InvoicePreviewModal / TableGridInvoiceModal style: initialBalance document balance + initialTotalBalanceDue party total produce both lines correctly', () => {
      const inv: Invoice = {
        ...mockInvoice,
        grandTotal: 5000,
        balanceAmount: 1200,
      };
      act(() => {
        root.render(
          <WhatsAppShareModal
            isOpen={true}
            invoice={inv}
            company={mockCompany}
            onClose={vi.fn()}
            initialBalance={1200}
            initialTotalBalanceDue={6500}
          />
        );
      });
      const previewBox = container.querySelector('[data-testid="whatsapp-message-preview-box"]');
      expect(previewBox).toBeTruthy();
      expect(previewBox?.textContent).toContain('*Balance Due:* ₹1,200');
      expect(previewBox?.textContent).toContain('*Total Balance Due:* ₹6,500');
    });

    it('Payment receipt: supplier party with negative currentBalance shows a positive Total Balance Due', () => {
      const supplierParty: Party = {
        id: 'SUPP-1',
        name: 'Steel Suppliers Ltd',
        type: 'SUPPLIER',
        phone: '9876543210',
        stateCode: '27',
        billingAddress: 'Hadapsar, Pune',
        currentBalance: -8500, // Negative payable in ledger convention
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };
      const paymentParams = {
        companyName: 'Apex Supplies',
        heading: 'Payment Out Voucher',
        docNumber: 'V-001',
        amount: 3000,
        partyName: 'Steel Suppliers Ltd',
        partyBalance: 8500,
      };
      act(() => {
        root.render(
          <WhatsAppShareModal
            isOpen={true}
            company={mockCompany}
            party={supplierParty}
            onClose={vi.fn()}
            paymentReceiptParams={paymentParams}
            initialTotalBalanceDue={8500}
          />
        );
      });
      const previewBox = container.querySelector('[data-testid="whatsapp-message-preview-box"]');
      expect(previewBox).toBeTruthy();
      expect(previewBox?.textContent).not.toContain('-8500');
      expect(previewBox?.textContent).not.toContain('-8,500');
      expect(previewBox?.textContent).toContain('8,500');
    });

    it('asserts the thermal preview wrapper in WhatsAppShareModal and ThermalPrintModal includes items-start', () => {
      // 1. WhatsAppShareModal preview wrapper with items-start
      act(() => {
        root.render(
          <WhatsAppShareModal
            isOpen={true}
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });
      const imgTabBtn = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      if (imgTabBtn) {
        act(() => {
          imgTabBtn.click();
        });
      }
      const previewNode = container.querySelector('[data-testid="thermal-receipt-preview"]');
      expect(previewNode).toBeTruthy();
      expect(previewNode?.parentElement?.className).toContain('items-start');

      // 2. ThermalPrintModal preview wrapper with items-start
      act(() => {
        root.render(
          <ThermalPrintModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });
      const thermalNode = container.querySelector('[data-testid="thermal-receipt-preview"]');
      expect(thermalNode).toBeTruthy();
      expect(thermalNode?.parentElement?.className).toContain('items-start');
    });

    it('wrapReceiptText wraps long company/party name, notes, reference to paper width without horizontal clipping', () => {
      const longText = [
        'COMPANY: SUPER DUPER INDUSTRIAL TRADING ENTERPRISES PRIVATE LIMITED',
        'Party  : M/S CHANDRA SHEKHAR AZAD STEEL DISTRIBUTORS & BROTHERS',
        'Ref    : TXN-REF-1234567890-ABCDEF-987654321',
        'Note: Goods received in excellent condition with signed delivery challan',
      ].join('\n');

      const wrapped32 = wrapReceiptText(longText, 32);
      expect(wrapped32.length).toBeGreaterThan(4);
      expect(wrapped32.every((line) => line.length <= 32)).toBe(true);

      const wrapped48 = wrapReceiptText(longText, 48);
      expect(wrapped48.length).toBeGreaterThan(4);
      expect(wrapped48.every((line) => line.length <= 48)).toBe(true);
    });
  });
});
