import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ReportPdfPreviewModal } from '../components/Reports/ReportPdfPreviewModal.tsx';
import { ReportPdfConfig, printReportDocument, registerReportPreviewHandler } from '../components/Reports/utils/reportExportUtils.ts';
import { InvoiceHeaderMeta } from '../components/Invoicing/components/InvoiceHeaderMeta.tsx';
import { PurchaseHeaderMeta } from '../components/Purchases/components/PurchaseHeaderMeta.tsx';
import { triggerBack, resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';
import { CompanyProfile } from '../models/company.ts';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Sharma & Sons Traders',
  tradeName: 'Sharma Traders',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  phone: '9876543210',
  email: 'sharma@traders.com',
  address: 'Shop 12, Market Complex, Mumbai',
  pincode: '400001',
  stateCode: '27',
  isGstEnabled: true,
};

const mockPdfConfig: ReportPdfConfig = {
  title: 'Sales Register & Bill-Wise Profit',
  company: mockCompany,
  dateRangeLabel: '01 Oct 2026 to 31 Oct 2026',
  orientation: 'landscape',
  kpis: [
    { label: 'Total Revenue', value: '₹ 1,50,000' },
    { label: 'Gross Profit', value: '₹ 25,000' },
  ],
  headers: ['Invoice #', 'Date', 'Customer', 'Amount', 'Profit'],
  rows: [
    ['INV-001', '01/10/2026', 'Customer A', '₹ 10,000', '₹ 1,500'],
    ['INV-002', '02/10/2026', 'Customer B', '₹ 20,000', '₹ 3,000'],
  ],
  summaryRow: ['TOTAL', '', '', '₹ 30,000', '₹ 4,500'],
};

describe('Reports PDF Preview & Draft Top Bar Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetBackNavigationForTesting();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetBackNavigationForTesting();
    registerReportPreviewHandler(null);
    vi.restoreAllMocks();
  });

  describe('1. ReportPdfPreviewModal Navigation & Back Handling', () => {
    it('renders modal with title, dateRange, company information, and A4 table', () => {
      const handleClose = vi.fn();
      act(() => {
        root.render(
          <ReportPdfPreviewModal
            isOpen={true}
            config={mockPdfConfig}
            onClose={handleClose}
          />
        );
      });

      expect(container.querySelector('[data-testid="report-pdf-preview-modal"]')).not.toBeNull();
      expect(container.textContent).toContain('Sales Register & Bill-Wise Profit');
      expect(container.textContent).toContain('01 Oct 2026 to 31 Oct 2026');
      expect(container.textContent).toContain('Sharma Traders');
      expect(container.textContent).toContain('27AABCU9603R1ZM');
      expect(container.textContent).toContain('Customer A');
      expect(container.textContent).toContain('₹ 30,000');
    });

    it('dismisses preview modal when UI Back button is clicked', () => {
      const handleClose = vi.fn();
      act(() => {
        root.render(
          <ReportPdfPreviewModal
            isOpen={true}
            config={mockPdfConfig}
            onClose={handleClose}
          />
        );
      });

      const backBtn = container.querySelector('[data-testid="report-preview-back-button"]') as HTMLButtonElement;
      expect(backBtn).not.toBeNull();
      expect(backBtn.textContent).toContain('Back');

      act(() => {
        backBtn.click();
      });

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('dismisses preview modal on Android hardware back button via triggerBack (priority 30)', () => {
      const handleClose = vi.fn();
      act(() => {
        root.render(
          <ReportPdfPreviewModal
            isOpen={true}
            config={mockPdfConfig}
            onClose={handleClose}
          />
        );
      });

      // Simulate Android hardware back evaluated through window.__handleAndroidBack()
      const handled = (window as any).__handleAndroidBack ? (window as any).__handleAndroidBack() : triggerBack();
      expect(handled).toBe(true);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('dismisses preview modal on Escape key press', () => {
      const handleClose = vi.fn();
      act(() => {
        root.render(
          <ReportPdfPreviewModal
            isOpen={true}
            config={mockPdfConfig}
            onClose={handleClose}
          />
        );
      });

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('invokes window.print when Print / Save PDF button is clicked', () => {
      const printSpy = vi.fn();
      window.print = printSpy;

      act(() => {
        root.render(
          <ReportPdfPreviewModal
            isOpen={true}
            config={mockPdfConfig}
            onClose={vi.fn()}
          />
        );
      });

      const printBtn = container.querySelector('[data-testid="report-preview-print-button"]') as HTMLButtonElement;
      expect(printBtn).not.toBeNull();

      act(() => {
        printBtn.click();
      });

      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('delegates printReportDocument to custom preview handler when registered', () => {
      const customHandler = vi.fn();
      registerReportPreviewHandler(customHandler);

      printReportDocument(mockPdfConfig);

      expect(customHandler).toHaveBeenCalledTimes(1);
      expect(customHandler).toHaveBeenCalledWith(mockPdfConfig);
    });

    it('toggles between Mobile Cards view and A4 Sheet view seamlessly', () => {
      act(() => {
        root.render(
          <ReportPdfPreviewModal
            isOpen={true}
            config={mockPdfConfig}
            onClose={vi.fn()}
          />
        );
      });

      // Switch to Cards mode explicitly
      const cardsBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Cards'));
      expect(cardsBtn).toBeDefined();

      act(() => {
        cardsBtn?.click();
      });

      // In cards mode, check for Records and Report Summary
      expect(container.textContent).toContain('Records (2)');
      expect(container.textContent).toContain('Report Summary & Totals');

      // Switch to A4 Sheet mode explicitly
      const a4Btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('A4 Sheet'));
      expect(a4Btn).toBeDefined();

      act(() => {
        a4Btn?.click();
      });

      // Verify A4 table is present
      expect(container.querySelector('#report-pdf-print-root')).not.toBeNull();
      expect(container.querySelector('table')).not.toBeNull();
    });
  });

  describe('2. Top Bar Save as Draft & Restore Navigation', () => {
    it('displays Save Draft button in InvoiceHeaderMeta top bar and invokes onSaveDraft', () => {
      const handleSaveDraft = vi.fn();
      act(() => {
        root.render(
          <InvoiceHeaderMeta
            onClose={vi.fn()}
            initialInvoice={null}
            invoiceNumber="INV-001"
            invoiceDate="2026-10-19"
            dueDate="2026-10-26"
            posStateCode="27"
            isGstActive={true}
            isIntraState={true}
            selectedParty={null}
            currentConflict={null}
            invoiceConflictError={null}
            allInvoices={[]}
            onSelectPartyClick={vi.fn()}
            onClearParty={vi.fn()}
            onAddPartyClick={vi.fn()}
            onOpenInvoiceNumberModal={vi.fn()}
            onOpenDueDateModal={vi.fn()}
            onAutoFixConflict={vi.fn()}
            onSaveDraft={handleSaveDraft}
          />
        );
      });

      const draftBtn = container.querySelector('[data-testid="invoice-save-draft-btn"]') as HTMLButtonElement;
      expect(draftBtn).not.toBeNull();
      expect(draftBtn.textContent).toContain('Save Draft');

      act(() => {
        draftBtn.click();
      });

      expect(handleSaveDraft).toHaveBeenCalledTimes(1);
    });

    it('displays Restored Draft pill with Discard action in top bar when draft is restored', () => {
      const handleDiscard = vi.fn();
      act(() => {
        root.render(
          <InvoiceHeaderMeta
            onClose={vi.fn()}
            initialInvoice={null}
            invoiceNumber="INV-001"
            invoiceDate="2026-10-19"
            dueDate="2026-10-26"
            posStateCode="27"
            isGstActive={true}
            isIntraState={true}
            selectedParty={null}
            currentConflict={null}
            invoiceConflictError={null}
            allInvoices={[]}
            onSelectPartyClick={vi.fn()}
            onClearParty={vi.fn()}
            onAddPartyClick={vi.fn()}
            onOpenInvoiceNumberModal={vi.fn()}
            onOpenDueDateModal={vi.fn()}
            onAutoFixConflict={vi.fn()}
            hasRestoredDraft={true}
            onDiscardDraft={handleDiscard}
          />
        );
      });

      const banner = container.querySelector('[data-testid="invoice-draft-banner"]');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Restored');
      expect(banner?.textContent).toContain('Discard Draft');

      const discardBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Discard Draft')
      );
      expect(discardBtn).toBeDefined();

      act(() => {
        discardBtn?.click();
      });

      expect(handleDiscard).toHaveBeenCalledTimes(1);
    });

    it('displays Restore Draft button in top bar when draft is in storage but not restored', () => {
      const handleRestore = vi.fn();
      act(() => {
        root.render(
          <InvoiceHeaderMeta
            onClose={vi.fn()}
            initialInvoice={null}
            invoiceNumber="INV-001"
            invoiceDate="2026-10-19"
            dueDate="2026-10-26"
            posStateCode="27"
            isGstActive={true}
            isIntraState={true}
            selectedParty={null}
            currentConflict={null}
            invoiceConflictError={null}
            allInvoices={[]}
            onSelectPartyClick={vi.fn()}
            onClearParty={vi.fn()}
            onAddPartyClick={vi.fn()}
            onOpenInvoiceNumberModal={vi.fn()}
            onOpenDueDateModal={vi.fn()}
            onAutoFixConflict={vi.fn()}
            hasRestoredDraft={false}
            hasDraftInStorage={true}
            onRestoreDraft={handleRestore}
          />
        );
      });

      const restoreBtn = container.querySelector('[data-testid="invoice-restore-draft-btn"]') as HTMLButtonElement;
      expect(restoreBtn).not.toBeNull();
      expect(restoreBtn.textContent).toContain('Restore Draft');

      act(() => {
        restoreBtn.click();
      });

      expect(handleRestore).toHaveBeenCalledTimes(1);
    });

    it('displays Save Draft and Restore Draft in PurchaseHeaderMeta top bar', () => {
      const handleSaveDraft = vi.fn();
      const handleRestoreDraft = vi.fn();
      act(() => {
        root.render(
          <PurchaseHeaderMeta
            onClose={vi.fn()}
            isEditing={false}
            selectedSupplier={null}
            billNumber="PB-001"
            billDate="2026-10-19"
            dueDate="2026-10-26"
            supplierStateCode="27"
            itcEligibility="ALL_OTHER_ITC"
            isGstActive={true}
            onSelectSupplierClick={vi.fn()}
            onAddSupplierClick={vi.fn()}
            onClearSupplier={vi.fn()}
            onOpenBillNoModal={vi.fn()}
            onOpenDueDateModal={vi.fn()}
            hasRestoredDraft={false}
            hasDraftInStorage={true}
            onSaveDraft={handleSaveDraft}
            onRestoreDraft={handleRestoreDraft}
          />
        );
      });

      const saveBtn = container.querySelector('[data-testid="purchase-save-draft-btn"]') as HTMLButtonElement;
      expect(saveBtn).not.toBeNull();
      expect(saveBtn.textContent).toContain('Save Draft');

      const restoreBtn = container.querySelector('[data-testid="purchase-restore-draft-btn"]') as HTMLButtonElement;
      expect(restoreBtn).not.toBeNull();
      expect(restoreBtn.textContent).toContain('Restore Draft');

      act(() => {
        saveBtn.click();
        restoreBtn.click();
      });

      expect(handleSaveDraft).toHaveBeenCalledTimes(1);
      expect(handleRestoreDraft).toHaveBeenCalledTimes(1);
    });
  });
});
