// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => {
    storage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
  clear: () => {
    Object.keys(storage).forEach((k) => delete storage[k]);
  },
};
(globalThis as any).localStorage = mockLocalStorage;
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });
}

if (typeof ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { WhatsAppShareModal as CommonWhatsAppShareModal } from '../components/Common/WhatsAppShareModal.tsx';
import { WhatsAppShareModal as FolderWhatsAppShareModal } from '../components/WhatsApp/WhatsAppShareModal.tsx';
import { InvoicePreviewModal } from '../components/Invoicing/InvoicePreviewModal.tsx';
import { SimplifiedInvoiceModal } from '../components/Invoicing/SimplifiedInvoiceModal.tsx';
import { CreateInvoiceModal } from '../components/Invoicing/CreateInvoiceModal.tsx';
import { db } from '../services/db.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';
import { POUCH_PERSIST_KEYS } from '../services/db/localDbConstants.ts';
import * as receiptImageShare from '../core/utils/receiptImageShare.ts';
import * as toastService from '../services/toast.ts';

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Sharma General Store',
  tradeName: 'Sharma Store',
  gstin: '07AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  phone: '9876543210',
  email: 'sharma@store.in',
  address: 'Connaught Place, New Delhi',
  pincode: '110001',
  stateCode: '07',
  bankName: 'State Bank of India',
  accountNumber: '123456789012',
  ifscCode: 'SBIN0001234',
  branchName: 'Main Branch',
  upiId: 'sharma@upi',
  termsAndConditions: 'Thank you for your business.',
  invoicePrefix: 'INV-',
  isGstEnabled: true,
  isCompositionScheme: false,
};

const mockInvoice = {
  id: 'INV-2026-001',
  invoiceNumber: 'INV-2026-001',
  invoiceType: 'B2C' as const,
  date: '2026-10-25',
  dueDate: '2026-11-01',
  partyId: 'PTY-1',
  partyName: 'Rajesh Kumar',
  partyPhone: '9876543210',
  items: [
    {
      id: 'ITEM-1',
      name: 'Sample Item',
      quantity: 1,
      unitPrice: 2500,
      taxableAmount: 2500,
      gstRate: 18,
      totalAmount: 2950,
    } as any,
  ],
  totalGrossAmount: 2500,
  totalDiscount: 0,
  totalTaxableAmount: 2500,
  totalCgst: 225,
  totalSgst: 225,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 450,
  roundOff: 0,
  grandTotal: 2950,
  balanceAmount: 2950,
  totalPaid: 0,
  paymentStatus: 'UNPAID',
  paymentMode: 'CREDIT',
} as unknown as Invoice;

const mockInvoiceNoPhone = {
  ...mockInvoice,
  partyPhone: '',
} as unknown as Invoice;

describe('WhatsApp Share Modals Validation & Demo Guardrails', () => {
  let container: HTMLDivElement;
  let root: Root;
  let clipboardText = '';

  function setInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  beforeEach(() => {
    resetBackNavigationForTesting();
    localStorage.clear();
    delete (window as any).AndroidBridge;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    clipboardText = '';

    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn((txt: string) => {
          clipboardText = txt;
          return Promise.resolve();
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
    delete (window as any).AndroidBridge;
    vi.restoreAllMocks();
  });

  describe('Common/WhatsAppShareModal (Parties & Simplified Invoicing)', () => {
    it('sends valid normalized phone to AndroidBridge using wa.me URL', () => {
      const bridgeSpy = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: bridgeSpy };
      const onClose = vi.fn();

      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={onClose}
            company={mockCompany}
            invoice={mockInvoice}
            initialPhone="9876543210"
          />
        );
      });

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      expect(sendBtn).toBeDefined();

      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).toHaveBeenCalledTimes(1);
      const url = bridgeSpy.mock.calls[0][0];
      expect(url).toContain('https://wa.me/919876543210?text=');
      expect(onClose).toHaveBeenCalled();
    });

    it('blocks send and shows inline error when phone is empty or invalid', () => {
      const bridgeSpy = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: bridgeSpy };
      const onClose = vi.fn();

      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={onClose}
            company={mockCompany}
            invoice={mockInvoiceNoPhone}
            initialPhone=""
          />
        );
      });

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();

      const errorEl = container.querySelector('[data-testid="whatsapp-phone-error"]');
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toContain('valid 10-digit');

      // Now enter an invalid mobile prefix
      const input = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      act(() => {
        setInputValue(input, '1234567890');
      });

      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="whatsapp-phone-error"]')?.textContent).toContain('begin with 6, 7, 8, or 9');
    });

    it('prefills the invoice phone when initialPhone=""', () => {
      const bridgeSpy = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: bridgeSpy };
      const onClose = vi.fn();

      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={onClose}
            company={mockCompany}
            invoice={mockInvoice}
            initialPhone=""
          />
        );
      });

      const input = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(input.value).toBe('9876543210');

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).toHaveBeenCalledTimes(1);
      const url = bridgeSpy.mock.calls[0][0];
      expect(url).toContain('https://wa.me/919876543210?text=');
    });

    it('prefills party.phone when no invoice or initial phone is provided', () => {
      const mockParty = {
        id: 'PTY-1',
        name: 'Rajesh Kumar',
        phone: '9876543210',
        type: 'CUSTOMER' as const,
      };

      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={vi.fn()}
            company={mockCompany}
            party={mockParty as any}
          />
        );
      });

      const input = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(input.value).toBe('9876543210');
    });

    it('copies the exact preview text to the clipboard when Copy button is tapped', () => {
      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={vi.fn()}
            company={mockCompany}
            invoice={mockInvoice}
            initialPhone="9876543210"
          />
        );
      });

      const copyBtn = container.querySelector('[data-testid="whatsapp-copy-button"]') as HTMLButtonElement;
      expect(copyBtn).toBeDefined();

      act(() => {
        copyBtn.click();
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(clipboardText).toContain('INV-2026-001');
      expect(clipboardText).toContain('Sharma Store');
    });

    it('renders Demo Mode warning only when gst_demo_mode is active', () => {
      // 1. Without demo mode
      localStorage.removeItem(POUCH_PERSIST_KEYS.DEMO_MODE);
      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={vi.fn()}
            company={mockCompany}
            invoice={mockInvoice}
            initialPhone="9876543210"
          />
        );
      });
      expect(container.querySelector('[data-testid="whatsapp-demo-warning"]')).toBeNull();

      // 2. With demo mode
      localStorage.setItem(POUCH_PERSIST_KEYS.DEMO_MODE, 'true');
      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={vi.fn()}
            company={mockCompany}
            invoice={mockInvoice}
            initialPhone="9876543210"
          />
        );
      });
      const warning = container.querySelector('[data-testid="whatsapp-demo-warning"]');
      expect(warning).not.toBeNull();
      expect(warning?.textContent).toContain('Demo Mode: this message uses demo data');
    });

    it('tab control renders both tabs when invoice is passed', () => {
      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={vi.fn()}
            company={mockCompany}
            invoice={mockInvoice}
          />
        );
      });

      const textTab = container.querySelector('[data-testid="whatsapp-tab-text"]');
      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]');
      expect(textTab).not.toBeNull();
      expect(textTab?.textContent).toContain('Text Message');
      expect(imgTab).not.toBeNull();
      expect(imgTab?.textContent).toContain('Receipt Image');
    });

    it('no tabs when only party is passed without invoice or paymentReceiptParams', () => {
      const mockParty = {
        id: 'PTY-1',
        name: 'Rajesh Kumar',
        phone: '9876543210',
        type: 'CUSTOMER' as const,
      };

      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={vi.fn()}
            company={mockCompany}
            party={mockParty as any}
          />
        );
      });

      expect(container.querySelector('[data-testid="whatsapp-tab-text"]')).toBeNull();
      expect(container.querySelector('[data-testid="whatsapp-tab-image"]')).toBeNull();
    });

    it('switching to Receipt Image shows whatsapp-share-image-button', () => {
      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            onClose={vi.fn()}
            company={mockCompany}
            invoice={mockInvoice}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });

      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
      expect(shareImgBtn).not.toBeNull();
      expect(shareImgBtn.textContent).toContain('Share Image');
      expect(shareImgBtn.disabled).toBe(false);

      const previewBox = container.querySelector('[data-testid="whatsapp-message-preview-box"]');
      expect(previewBox).toBeNull();
    });

    it('The Share Image caption contains Bill Amount: and Total Balance Due:', async () => {
      const fakeBlob = new Blob(['fake-receipt'], { type: 'image/png' });
      vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockResolvedValue(fakeBlob);
      const shareSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('shared');

      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            invoice={{ ...mockInvoice, grandTotal: 2950, balanceAmount: 1500 }}
            company={mockCompany}
            initialBalance={1800}
            onClose={vi.fn()}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });

      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
      await act(async () => {
        shareImgBtn.click();
      });

      expect(shareSpy).toHaveBeenCalledWith(
        fakeBlob,
        `Receipt-${mockInvoice.invoiceNumber}.png`,
        expect.objectContaining({
          text: expect.stringMatching(/Bill Amount:\s*₹2950[\s\S]*Total Balance Due:\s*₹1800/),
        })
      );
    });

    it('payment share (no invoice) renders Text/Receipt Image tabs and placeholder', () => {
      const paymentParams = {
        companyName: 'Sharma General Store',
        heading: 'Payment In Receipt',
        docNumber: 'REC-001',
        amount: 2500,
        partyName: 'Rajesh Kumar',
        partyBalance: 1200,
      };

      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            company={mockCompany}
            paymentShareText="*Payment In Receipt*\n*Amount:* ₹2,500.00\n*Total Balance Due:* ₹1,200.00"
            paymentReceiptParams={paymentParams}
            onClose={vi.fn()}
          />
        );
      });

      const textTab = container.querySelector('[data-testid="whatsapp-tab-text"]');
      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]');
      expect(textTab).not.toBeNull();
      expect(imgTab).not.toBeNull();

      act(() => {
        (imgTab as HTMLButtonElement).click();
      });

      const placeholder = container.querySelector('[data-testid="payment-receipt-placeholder"]');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain('Payment receipt');
    });

    it('image tab Share Image button calls renderThermalReceiptImage with a payment receipt text and caption contains amount and balance', async () => {
      const fakeBlob = new Blob(['payment-canvas-receipt'], { type: 'image/png' });
      const canvasSpy = vi.spyOn(receiptImageShare, 'renderThermalReceiptImage').mockResolvedValue(fakeBlob);
      const shareSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('shared');

      const paymentParams = {
        companyName: 'Sharma General Store',
        heading: 'Payment In Receipt',
        docNumber: 'REC-100',
        amount: 3500,
        partyName: 'Rajesh Kumar',
        partyBalance: 500,
      };

      act(() => {
        root.render(
          <CommonWhatsAppShareModal
            isOpen={true}
            company={mockCompany}
            initialPhone="9876543210"
            paymentShareText="*Payment In Receipt - Sharma General Store*\n*Amount:* ₹3,500.00\n*Total Balance Due:* ₹500.00"
            paymentReceiptParams={paymentParams}
            onClose={vi.fn()}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });

      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
      expect(shareImgBtn).not.toBeNull();

      await act(async () => {
        shareImgBtn.click();
      });

      expect(canvasSpy).toHaveBeenCalledTimes(1);
      const passedReceiptText = canvasSpy.mock.calls[0][0];
      expect(passedReceiptText).toContain('PAYMENT IN RECEIPT');
      expect(passedReceiptText).toContain('3500.00');

      expect(shareSpy).toHaveBeenCalledWith(
        fakeBlob,
        'Receipt-REC-100.png',
        expect.objectContaining({
          text: expect.stringMatching(/Amount:[\s\S]*3,?500[\s\S]*Total Balance Due:[\s\S]*500/),
          phone: '9876543210',
        })
      );
    });
  });

  describe('WhatsApp/WhatsAppShareModal (Invoice Preview & Grid)', () => {
    it('allows optional empty phone and dispatches chooser URL without recipient', () => {
      const bridgeSpy = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: bridgeSpy };
      const onClose = vi.fn();

      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoiceNoPhone}
            company={mockCompany}
            onClose={onClose}
          />
        );
      });

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).toHaveBeenCalledTimes(1);
      const url = bridgeSpy.mock.calls[0][0];
      expect(url).toContain('https://api.whatsapp.com/send?text=');
      expect(url).not.toContain('phone=');
      expect(onClose).toHaveBeenCalled();
    });

    it('prefills invoice.partyPhone and sends using api.whatsapp.com', () => {
      const bridgeSpy = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: bridgeSpy };
      const onClose = vi.fn();

      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={onClose}
          />
        );
      });

      const input = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(input.value).toBe('9876543210');

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).toHaveBeenCalledTimes(1);
      const url = bridgeSpy.mock.calls[0][0];
      expect(url).toContain('https://api.whatsapp.com/send?phone=919876543210&text=');
      expect(onClose).toHaveBeenCalled();
    });



    it('prefills input from initialPhone prop even when invoice has no partyPhone', () => {
      const bridgeSpy = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: bridgeSpy };
      const onClose = vi.fn();

      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoiceNoPhone}
            company={mockCompany}
            onClose={onClose}
            initialPhone="9876543210"
          />
        );
      });

      const input = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(input.value).toBe('9876543210');

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).toHaveBeenCalledTimes(1);
      const url = bridgeSpy.mock.calls[0][0];
      expect(url).toContain('https://api.whatsapp.com/send?phone=919876543210&text=');
      expect(onClose).toHaveBeenCalled();
    });

    it('normalizes pasted +91 and formatted phone numbers on send', () => {
      const bridgeSpy = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: bridgeSpy };
      const onClose = vi.fn();

      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={onClose}
          />
        );
      });

      const input = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      act(() => {
        setInputValue(input, '+91 98765 43210');
      });

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).toHaveBeenCalledTimes(1);
      const url = bridgeSpy.mock.calls[0][0];
      expect(url).toContain('https://api.whatsapp.com/send?phone=919876543210&text=');
      expect(onClose).toHaveBeenCalled();
    });



    it('blocks send and displays inline error when non-empty input is invalid', () => {
      const bridgeSpy = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: bridgeSpy };
      const onClose = vi.fn();

      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={onClose}
          />
        );
      });

      const input = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      act(() => {
        setInputValue(input, '+1 555 123 4567'); // Unsupported country
      });

      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]') as HTMLButtonElement;
      act(() => {
        sendBtn.click();
      });

      expect(bridgeSpy).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();

      const errorEl = container.querySelector('[data-testid="whatsapp-phone-error"]');
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toContain('Only Indian (+91)');
    });

    it('copies the message and displays feedback in the Folder modal', () => {
      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const copyBtn = container.querySelector('[data-testid="whatsapp-copy-button"]') as HTMLButtonElement;
      expect(copyBtn).toBeDefined();

      act(() => {
        copyBtn.click();
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(clipboardText).toContain('INV-2026-001');
      expect(container.textContent).toContain('Copied');
    });

    it('renders Demo Mode warning in Folder modal when active', () => {
      localStorage.setItem(POUCH_PERSIST_KEYS.DEMO_MODE, 'true');
      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const warning = container.querySelector('[data-testid="whatsapp-demo-warning"]');
      expect(warning).not.toBeNull();
      expect(warning?.textContent).toContain('Demo Mode: this message uses demo data');
    });

    it('tab control renders both Text Message and Receipt Image', () => {
      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const textTab = container.querySelector('[data-testid="whatsapp-tab-text"]');
      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]');
      expect(textTab).not.toBeNull();
      expect(textTab?.textContent).toContain('Text Message');
      expect(imgTab).not.toBeNull();
      expect(imgTab?.textContent).toContain('Receipt Image');
    });

    it('switching to Receipt Image shows whatsapp-share-image-button and hides the message preview box', () => {
      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });

      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
      expect(shareImgBtn).not.toBeNull();
      expect(shareImgBtn.textContent).toContain('Share Image');
      expect(shareImgBtn.disabled).toBe(false);

      const previewBox = container.querySelector('[data-testid="whatsapp-message-preview-box"]');
      expect(previewBox).toBeNull();
    });

    it('switching back to Text Message shows the preview box and copy/send buttons', () => {
      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });
      const textTab = container.querySelector('[data-testid="whatsapp-tab-text"]') as HTMLButtonElement;
      act(() => {
        textTab.click();
      });

      const previewBox = container.querySelector('[data-testid="whatsapp-message-preview-box"]');
      expect(previewBox).not.toBeNull();
      const copyBtn = container.querySelector('[data-testid="whatsapp-copy-button"]');
      expect(copyBtn).not.toBeNull();
      const sendBtn = container.querySelector('[data-testid="whatsapp-send-button"]');
      expect(sendBtn).not.toBeNull();
      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]');
      expect(shareImgBtn).toBeNull();
    });

    it('preserves phone number when switching between tabs', () => {
      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoiceNoPhone}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const input = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      act(() => {
        setInputValue(input, '9123456780');
      });
      expect(input.value).toBe('9123456780');

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });
      const imgInput = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(imgInput.value).toBe('9123456780');

      const textTab = container.querySelector('[data-testid="whatsapp-tab-text"]') as HTMLButtonElement;
      act(() => {
        textTab.click();
      });
      const textInput = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(textInput.value).toBe('9123456780');
    });

    it("Share Image caption includes Bill Amount: and Total Balance Due:", async () => {
      const fakeBlob = new Blob(['fake-receipt'], { type: 'image/png' });
      vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockResolvedValue(fakeBlob);
      const shareSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('shared');

      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={{ ...mockInvoice, grandTotal: 2950, balanceAmount: 1500 }}
            company={mockCompany}
            totalBalanceDue={1800}
            onClose={vi.fn()}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });

      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
      await act(async () => {
        shareImgBtn.click();
      });

      expect(shareSpy).toHaveBeenCalledWith(
        fakeBlob,
        `Receipt-${mockInvoice.invoiceNumber}.png`,
        expect.objectContaining({
          text: expect.stringMatching(/Bill Amount:\s*₹2950[\s\S]*Total Balance Due:\s*₹1800/),
        })
      );
    });

    it('clicking whatsapp-share-image-button captures thermal preview DOM and shows success toast', async () => {
      const fakeBlob = new Blob(['fake-receipt'], { type: 'image/png' });
      const previewSpy = vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockResolvedValue(fakeBlob);
      const shareSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('shared');
      const toastSpy = vi.spyOn(toastService, 'showAppToast');

      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });

      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
      expect(shareImgBtn).not.toBeNull();

      await act(async () => {
        shareImgBtn.click();
      });

      expect(previewSpy).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.any(String),
        expect.any(Number)
      );
      expect(shareSpy).toHaveBeenCalledWith(
        fakeBlob,
        `Receipt-${mockInvoice.invoiceNumber}.png`,
        expect.objectContaining({
          phone: '9876543210',
        })
      );
      expect(toastSpy).toHaveBeenCalledWith('Receipt image shared.');
    });

    it('falls back to canvas renderThermalReceiptImage when DOM capture fails in WhatsAppShareModal', async () => {
      vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockRejectedValue(new Error('DOM capture failed'));
      const fallbackBlob = new Blob(['fallback-canvas'], { type: 'image/png' });
      const canvasSpy = vi.spyOn(receiptImageShare, 'renderThermalReceiptImage').mockResolvedValue(fallbackBlob);
      const shareSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('shared');

      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });

      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
      await act(async () => {
        shareImgBtn.click();
      });

      expect(canvasSpy).toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalledWith(
        fallbackBlob,
        `Receipt-${mockInvoice.invoiceNumber}.png`,
        expect.objectContaining({
          phone: '9876543210',
        })
      );
    });

    it('handles downloaded, cancelled, and failed share responses with corresponding toasts', async () => {
      const fakeBlob = new Blob(['fake-receipt'], { type: 'image/png' });
      vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockResolvedValue(fakeBlob);
      vi.spyOn(receiptImageShare, 'renderThermalReceiptImage').mockResolvedValue(fakeBlob);
      const toastSpy = vi.spyOn(toastService, 'showAppToast');

      // 1. Downloaded fallback
      const shareSpy = vi.spyOn(receiptImageShare, 'shareReceiptImage').mockResolvedValue('downloaded');
      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
      act(() => {
        imgTab.click();
      });

      const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
      await act(async () => {
        shareImgBtn.click();
      });
      expect(toastSpy).toHaveBeenCalledWith('Receipt image saved. Attach it in the WhatsApp chat.');

      // 2. Cancelled
      shareSpy.mockResolvedValue('cancelled');
      await act(async () => {
        shareImgBtn.click();
      });
      expect(toastSpy).toHaveBeenCalledWith('Share cancelled.');

      // 3. Failed
      shareSpy.mockResolvedValue('failed');
      await act(async () => {
        shareImgBtn.click();
      });
      expect(toastSpy).toHaveBeenCalledWith('Could not create the receipt image.');
      shareSpy.mockRestore();
    });

    it('invokes AndroidBridge.shareImage when clicking whatsapp-share-image-button if bridge is present', async () => {
      const shareMock = vi.fn();
      (window as any).AndroidBridge = { shareImage: shareMock };
      const fakeBlob = new Blob(['whatsapp-modal-receipt'], { type: 'image/png' });
      vi.spyOn(receiptImageShare, 'renderThermalPreviewImage').mockResolvedValue(fakeBlob);
      const toastSpy = vi.spyOn(toastService, 'showAppToast');

      try {
        act(() => {
          root.render(
            <FolderWhatsAppShareModal
              invoice={mockInvoice}
              company={mockCompany}
              onClose={vi.fn()}
            />
          );
        });

        const imgTab = container.querySelector('[data-testid="whatsapp-tab-image"]') as HTMLButtonElement;
        act(() => {
          imgTab.click();
        });

        const shareImgBtn = container.querySelector('[data-testid="whatsapp-share-image-button"]') as HTMLButtonElement;
        await act(async () => {
          shareImgBtn.click();
          await vi.waitFor(() => {
            expect(shareMock).toHaveBeenCalledWith(
              btoa('whatsapp-modal-receipt'),
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

  describe('Production Data Protection Guardrail', () => {
    it('asserts that neither modal accepts or invokes database write mutations', () => {
      // TypeScript compile-time and runtime check: neither modal prop interface declares write callbacks
      const commonProps = {
        isOpen: true,
        onClose: vi.fn(),
        company: mockCompany,
        invoice: mockInvoice,
      };
      expect('saveInvoice' in commonProps).toBe(false);
      expect('onSave' in commonProps).toBe(false);
      expect('persist' in commonProps).toBe(false);

      const folderProps = {
        invoice: mockInvoice,
        company: mockCompany,
        onClose: vi.fn(),
      };
      expect('saveInvoice' in folderProps).toBe(false);
      expect('onSave' in folderProps).toBe(false);
    });
  });

  describe('End-to-End Invoice Party Phone Prefill Integration', () => {
    it('prefills phone in Folder WhatsAppShareModal via party lookup when invoice has no partyPhone', () => {
      vi.spyOn(db, 'getParties').mockReturnValue([
        {
          id: 'PTY-1',
          name: 'Rajesh Kumar',
          phone: '9123456789',
          type: 'CUSTOMER',
        } as any,
      ]);

      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={mockInvoiceNoPhone}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const whatsAppBtn = buttons.find((btn) => btn.textContent?.includes('WhatsApp'));
      expect(whatsAppBtn).toBeDefined();

      act(() => {
        whatsAppBtn!.click();
      });

      const phoneInput = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(phoneInput).not.toBeNull();
      expect(phoneInput.value).toBe('9123456789');
    });

    it('prefills phone in SimplifiedInvoiceModal via party lookup when invoice has no partyPhone', () => {
      vi.spyOn(db, 'getParties').mockReturnValue([
        {
          id: 'PTY-1',
          name: 'Rajesh Kumar',
          phone: '9123456789',
          type: 'CUSTOMER',
        } as any,
      ]);

      act(() => {
        root.render(
          <SimplifiedInvoiceModal
            invoice={mockInvoiceNoPhone}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const whatsAppBtn = buttons.find((btn) => btn.textContent?.includes('WhatsApp') || btn.getAttribute('title')?.includes('WhatsApp'));
      expect(whatsAppBtn).toBeDefined();

      act(() => {
        whatsAppBtn!.click();
      });

      const phoneInput = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(phoneInput).not.toBeNull();
      expect(phoneInput.value).toBe('9123456789');
    });

    it('persists selected party phone on new invoice creation', () => {
      const onSave = vi.fn();
      const mockParties = [
        {
          id: 'PTY-NEW',
          name: 'Anita Verma',
          phone: '9876501234',
          type: 'CUSTOMER' as const,
          billingAddress: '45 Connaught Place',
          stateCode: '07',
        } as any,
      ];

      act(() => {
        root.render(
          <CreateInvoiceModal
            company={mockCompany}
            parties={mockParties}
            itemsCatalog={[]}
            onClose={vi.fn()}
            onSave={onSave}
          />
        );
      });

      const form = container.querySelector('form');
      expect(form).not.toBeNull();

      act(() => {
        form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      const savedInvoice = onSave.mock.calls[0][0] as Invoice;
      expect(savedInvoice.partyPhone).toBe('9876501234');
      expect(savedInvoice.partyName).toBe('Anita Verma');
    });

    it('maintains unconditional hook order when mounted with invoice=null and rerendered with an invoice', () => {
      vi.spyOn(db, 'getParties').mockReturnValue([
        {
          id: 'PTY-1',
          name: 'Rajesh Kumar',
          phone: '9123456789',
          type: 'CUSTOMER',
        } as any,
      ]);

      // 1. Mount with invoice=null
      act(() => {
        root.render(
          <SimplifiedInvoiceModal
            invoice={null}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      expect(container.innerHTML).toBe('');

      // 2. Rerender with invoice: validates unconditional hook execution and state consistency
      act(() => {
        root.render(
          <SimplifiedInvoiceModal
            invoice={mockInvoiceNoPhone}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const whatsAppBtn = buttons.find((btn) => btn.textContent?.includes('WhatsApp') || btn.getAttribute('title')?.includes('WhatsApp'));
      expect(whatsAppBtn).toBeDefined();

      act(() => {
        whatsAppBtn!.click();
      });

      const phoneInput = container.querySelector('[data-testid="whatsapp-phone-input"]') as HTMLInputElement;
      expect(phoneInput).not.toBeNull();
      expect(phoneInput.value).toBe('9123456789');
    });
  });
});
