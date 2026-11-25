import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as htmlToImage from 'html-to-image';
import { getThermalPaperWidth } from '../services/printSettingsService.ts';
import * as receiptImageShare from '../core/utils/receiptImageShare.ts';
import { renderThermalPreviewImage } from '../core/utils/receiptImageShare.ts';
import { ThermalReceiptPreview } from '../components/Printing/ThermalReceiptPreview.tsx';
import { WhatsAppShareModal } from '../components/Common/WhatsAppShareModal.tsx';
import { buildThermalReceiptText } from '../core/utils/thermalReceiptText.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';
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
  partyPhone: '9876543210',
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

describe('Thermal Paper Width & WhatsApp Share Regression Suite', () => {
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

  describe('getThermalPaperWidth() precedence', () => {
    it('returns 48 when legacy is 48 and canonical is 32 (original bug)', () => {
      localStorage.setItem('printer_paper_width', '48');
      localStorage.setItem(
        'app_custom_print_settings',
        JSON.stringify({ defaultFormat: 'Thermal-58mm', thermal: { paperWidth: 32 } })
      );
      expect(getThermalPaperWidth()).toBe(48);
    });

    it('returns 32 when legacy is absent and canonical is 32', () => {
      localStorage.setItem(
        'app_custom_print_settings',
        JSON.stringify({ defaultFormat: 'Thermal-58mm', thermal: { paperWidth: 32 } })
      );
      expect(getThermalPaperWidth()).toBe(32);
    });

    it('returns 48 when legacy is absent and canonical is 48', () => {
      localStorage.setItem(
        'app_custom_print_settings',
        JSON.stringify({ defaultFormat: 'Thermal-80mm', thermal: { paperWidth: 48 } })
      );
      expect(getThermalPaperWidth()).toBe(48);
    });

    it('returns 48 when nothing is configured', () => {
      expect(getThermalPaperWidth()).toBe(48);
    });

    it('returns 32 when legacy is 32 and canonical is 48', () => {
      localStorage.setItem('printer_paper_width', '32');
      localStorage.setItem(
        'app_custom_print_settings',
        JSON.stringify({ defaultFormat: 'Thermal-80mm', thermal: { paperWidth: 48 } })
      );
      expect(getThermalPaperWidth()).toBe(32);
    });
  });

  describe('renderThermalPreviewImage dimensions', () => {
    it('passes explicit width and height to html-to-image when node reports > 0 dimensions', async () => {
      const node = document.createElement('div');
      Object.defineProperty(node, 'offsetWidth', { value: 420, configurable: true });
      Object.defineProperty(node, 'scrollWidth', { value: 510, configurable: true });
      Object.defineProperty(node, 'offsetHeight', { value: 600, configurable: true });
      Object.defineProperty(node, 'scrollHeight', { value: 640, configurable: true });

      const bigBlob = new Blob([new Uint8Array(2048)], { type: 'image/png' });
      const toBlobSpy = vi.spyOn(htmlToImage, 'toBlob').mockResolvedValue(bigBlob);

      const res = await renderThermalPreviewImage(node, 'fallback', 48);
      expect(res).toBe(bigBlob);
      expect(toBlobSpy).toHaveBeenCalledWith(
        node,
        expect.objectContaining({
          cacheBust: true,
          pixelRatio: 2,
          width: 510,
          height: 640,
        })
      );
    });

    it('omits width and height when node reports 0 dimensions', async () => {
      const node = document.createElement('div');
      Object.defineProperty(node, 'offsetWidth', { value: 0, configurable: true });
      Object.defineProperty(node, 'scrollWidth', { value: 0, configurable: true });
      Object.defineProperty(node, 'offsetHeight', { value: 0, configurable: true });
      Object.defineProperty(node, 'scrollHeight', { value: 0, configurable: true });

      const bigBlob = new Blob([new Uint8Array(2048)], { type: 'image/png' });
      const toBlobSpy = vi.spyOn(htmlToImage, 'toBlob').mockResolvedValue(bigBlob);

      const res = await renderThermalPreviewImage(node, 'fallback', 48);
      expect(res).toBe(bigBlob);
      expect(toBlobSpy).toHaveBeenCalledTimes(1);
      const passedOptions = toBlobSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(passedOptions).toMatchObject({ cacheBust: true, pixelRatio: 2 });
      expect(passedOptions).not.toHaveProperty('width');
      expect(passedOptions).not.toHaveProperty('height');
    });
  });

  describe('ThermalReceiptPreview layout', () => {
    it('renders a non-shrinking box with shrink-0', () => {
      act(() => {
        root.render(<ThermalReceiptPreview previewText="SAMPLE RECEIPT" width={48} />);
      });
      const el = container.querySelector('[data-testid="thermal-receipt-preview"]');
      expect(el).not.toBeNull();
      expect(el?.className).toContain('shrink-0');
    });
  });

  describe('WhatsAppShareModal in image mode', () => {
    it('forces 80mm (3") / 48 cols even when printer_paper_width is 32, and captured node matches 48-col source text', async () => {
      localStorage.setItem('printer_paper_width', '32');
      localStorage.setItem('whatsappPreviewMode', 'image');
      vi.spyOn(db, 'getParties').mockReturnValue([]);

      const bigBlob = new Blob([new Uint8Array(2048)], { type: 'image/png' });
      const renderPreviewSpy = vi
        .spyOn(receiptImageShare, 'renderThermalPreviewImage')
        .mockResolvedValue(bigBlob);
      const shareSpy = vi
        .spyOn(receiptImageShare, 'shareReceiptImage')
        .mockResolvedValue('shared');

      await act(async () => {
        root.render(
          <WhatsAppShareModal
            isOpen={true}
            onClose={() => {}}
            company={mockCompany}
            invoice={mockInvoice}
          />
        );
      });

      const widthLabel = container.querySelector('[data-testid="share-paper-width"]');
      expect(widthLabel).not.toBeNull();
      expect(widthLabel?.textContent).toContain('80mm (3")');
      expect(widthLabel?.textContent).toContain('48 cols');

      const expected48Text = buildThermalReceiptText(mockInvoice, mockCompany, 48);
      const previewEl = container.querySelector('[data-testid="thermal-receipt-preview"]');
      expect(previewEl).not.toBeNull();
      expect(previewEl?.textContent).toBe(expected48Text);
      expect(previewEl?.textContent).toContain('-'.repeat(48));

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      expect(sendBtn).not.toBeNull();

      await act(async () => {
        sendBtn.click();
      });

      expect(renderPreviewSpy).toHaveBeenCalledTimes(1);
      const [capturedNode, passedFallbackText, passedWidth] = renderPreviewSpy.mock.calls[0];
      expect(passedWidth).toBe(48);
      expect(passedFallbackText).toBe(expected48Text);
      expect(capturedNode).toBe(previewEl);
      expect(capturedNode.textContent).toBe(passedFallbackText);
      expect(shareSpy).toHaveBeenCalledTimes(1);
    });
  });
});
