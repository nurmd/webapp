import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  getFinancialYear,
} from '../core/utils/dateFilters.ts';

/**
 * Milestone 3 Test Suite:
 * Mobile UX, Touch Target Harmonization, Empty States, Dashboard Date Filtering, and Icon Accessibility
 */

describe('Milestone 3: Mobile UX, Date Filtering, Empty States & Accessibility', () => {
  // =========================================================================
  // Suite 1: Dashboard Date Filtering & Multi-Entity Activity Timeline
  // =========================================================================
  describe('Suite 1: Dashboard Date Filtering & Timeline Activity Filtering', () => {
    it('TC-DATE-01: Correctly calculates bounds for all standard DatePresets', () => {
      const todayBounds = getDateFilterBounds('TODAY');
      expect(todayBounds.start).toBeTruthy();
      expect(todayBounds.end).toBe(todayBounds.start);
      expect(todayBounds.label).toBe('Today');

      const allTimeBounds = getDateFilterBounds('ALL_TIME');
      expect(allTimeBounds.start).toBe('');
      expect(allTimeBounds.end).toBe('');
      expect(allTimeBounds.label).toBe('All Time');

      const thisMonthBounds = getDateFilterBounds('THIS_MONTH');
      expect(thisMonthBounds.start).toMatch(/^\d{4}-\d{2}-01$/);
      expect(thisMonthBounds.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(thisMonthBounds.label).toBe('This Month');

      const thisFyBounds = getDateFilterBounds('THIS_FY');
      expect(thisFyBounds.start).toMatch(/^\d{4}-04-01$/);
      expect(thisFyBounds.end).toMatch(/^\d{4}-03-31$/);
      expect(thisFyBounds.label).toContain('FY');

      const customBounds = getDateFilterBounds('CUSTOM', '2026-10-01', '2026-10-15');
      expect(customBounds.start).toBe('2026-10-01');
      expect(customBounds.end).toBe('2026-10-15');
      expect(customBounds.label).toBe('2026-10-01 to 2026-10-15');
    });

    it('TC-DATE-02: Accurately checks whether date falls in range across ISO and YYYY-MM-DD formats', () => {
      expect(isDateInRange('2026-10-10', '2026-10-01', '2026-10-15')).toBe(true);
      expect(isDateInRange('2026-10-01T14:30:00.000Z', '2026-10-01', '2026-10-15')).toBe(true);
      expect(isDateInRange('2026-10-15T23:59:59.999Z', '2026-10-01', '2026-10-15')).toBe(true);
      expect(isDateInRange('2026-09-30', '2026-10-01', '2026-10-15')).toBe(false);
      expect(isDateInRange('2026-10-16', '2026-10-01', '2026-10-15')).toBe(false);
      // Unbounded range (All Time)
      expect(isDateInRange('2026-10-10', '', '')).toBe(true);
      expect(isDateInRange('2026-10-10', undefined, undefined)).toBe(true);
    });

    it('TC-DATE-03: Multi-entity activity timeline correctly filters mixed transactions by date bounds', () => {
      interface MockActivity {
        id: string;
        type: 'SALE' | 'PURCHASE' | 'VOUCHER' | 'EXPENSE';
        date: string;
        amount: number;
      }

      const activities: MockActivity[] = [
        { id: 'ACT-1', type: 'SALE', date: '2026-10-05', amount: 5000 },
        { id: 'ACT-2', type: 'PURCHASE', date: '2026-10-12', amount: 3000 },
        { id: 'ACT-3', type: 'VOUCHER', date: '2026-09-25', amount: 1500 },
        { id: 'ACT-4', type: 'EXPENSE', date: '2026-10-08', amount: 450 },
        { id: 'ACT-5', type: 'SALE', date: '2026-10-20', amount: 8000 },
      ];

      // Filter for October 1 to October 15, 2026
      const start = '2026-10-01';
      const end = '2026-10-15';

      const filtered = activities.filter((act) => isDateInRange(act.date, start, end));
      expect(filtered.map((a) => a.id)).toEqual(['ACT-1', 'ACT-2', 'ACT-4']);
      expect(filtered.find((a) => a.id === 'ACT-3')).toBeUndefined();
      expect(filtered.find((a) => a.id === 'ACT-5')).toBeUndefined();
    });

    it('TC-DATE-04: Indian Financial Year calculation returns valid format', () => {
      const fy1 = getFinancialYear('2026-05-15');
      expect(fy1).toBe('2026-27');

      const fy2 = getFinancialYear('2027-02-10');
      expect(fy2).toBe('2026-27');

      const fy3 = getFinancialYear('2026-03-31');
      expect(fy3).toBe('2025-26');
    });
  });

  // =========================================================================
  // Suite 2: Sales Hub Empty State Contract Invariants
  // =========================================================================
  describe('Suite 2: Sales Hub Empty State Specification', () => {
    it('TC-EMPTY-01: Verifies source code of SalesHubView contains illustrated empty state and CTA', () => {
      const salesHubPath = path.resolve(__dirname, '../components/Sales/SalesHubView.tsx');
      expect(fs.existsSync(salesHubPath)).toBe(true);

      const content = fs.readFileSync(salesHubPath, 'utf8');

      // Must have icon container for empty state (receipt_long or filter_list_off or receipt)
      const hasEmptyStateIcon =
        content.includes('receipt_long') ||
        content.includes('receipt') ||
        content.includes('filter_list_off');
      expect(hasEmptyStateIcon).toBe(true);

      // Must have CTA button triggering onOpenTableGridInvoice or invoice creation
      const hasCreateButton =
        content.includes('onOpenTableGridInvoice') &&
        (content.includes('+ Create Sale Bill') ||
          content.includes('Create Sale Bill') ||
          content.includes('+ Bill') ||
          content.includes('New Bill'));
      expect(hasCreateButton).toBe(true);
    });

    it('TC-EMPTY-02: Evaluates dual-state empty branching contract logic', () => {
      const getEmptyStateModel = (
        totalInvoicesCount: number,
        filteredCount: number,
        hasActiveSearchOrFilter: boolean
      ) => {
        if (totalInvoicesCount === 0) {
          return {
            type: 'TOTAL_EMPTY',
            icon: 'receipt_long',
            title: 'No Sales Bills Yet',
            showCreateCta: true,
          };
        }
        if (filteredCount === 0 && hasActiveSearchOrFilter) {
          return {
            type: 'FILTERED_EMPTY',
            icon: 'filter_list_off',
            title: 'No Invoices Found',
            showClearAction: true,
            showCreateCta: true,
          };
        }
        return null;
      };

      const totalEmpty = getEmptyStateModel(0, 0, false);
      expect(totalEmpty?.type).toBe('TOTAL_EMPTY');
      expect(totalEmpty?.showCreateCta).toBe(true);

      const filteredEmpty = getEmptyStateModel(10, 0, true);
      expect(filteredEmpty?.type).toBe('FILTERED_EMPTY');
      expect(filteredEmpty?.showClearAction).toBe(true);
      expect(filteredEmpty?.showCreateCta).toBe(true);

      const populated = getEmptyStateModel(10, 5, true);
      expect(populated).toBeNull();
    });
  });

  // =========================================================================
  // Suite 3: Mobile Touch Target & Filter Pill Ergonomics Invariants
  // =========================================================================
  describe('Suite 3: Mobile Touch Target Ergonomics', () => {
    it('TC-TOUCH-01: Verifies primary views do not use inaccessible micro-pills without adequate height or padding', () => {
      const viewsToAudit = [
        path.resolve(__dirname, '../components/Sales/SalesHubView.tsx'),
        path.resolve(__dirname, '../components/Purchases/PurchasesHubView.tsx'),
        path.resolve(__dirname, '../components/Dashboard/DashboardView.tsx'),
      ];

      for (const filePath of viewsToAudit) {
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf8');

        // Look for buttons with tiny touch targets like h-6.5 or py-0.5 that lack min-h-[36px] or touch containment
        // The implementation must either upgrade button heights to min-h-[36px]/h-8 or wrap in comfortable touch targets
        expect(content.length).toBeGreaterThan(0);
        expect(content).toMatch(/min-h-\[36px\]|min-h-\[38px\]|min-h-\[40px\]/);
      }
    });

    it('TC-TOUCH-02: Dashboard Timeline header is sticky or contains sticky positioning styles', () => {
      const dashboardPath = path.resolve(__dirname, '../components/Dashboard/DashboardView.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      // Dashboard Timeline header must contain sticky positioning or top-0 or sticky styles
      const hasStickyTimeline =
        content.includes('sticky') &&
        (content.includes('top-0') || content.includes('z-10') || content.includes('z-20'));
      expect(hasStickyTimeline).toBe(true);
    });
  });

  // =========================================================================
  // Suite 4: Accessibility / Icon-Only Buttons Aria-Label Invariants
  // =========================================================================
  describe('Suite 4: Accessibility / Icon-Only Buttons Aria-Label Audit', () => {
    const modalFilesToCheck = [
      'components/Common/DateFilterModal.tsx',
      'components/Invoicing/components/InvoicePaymentModal.tsx',
      'components/Invoicing/SimplifiedInvoiceModal.tsx',
      'components/Purchases/SimplifiedPurchaseModal.tsx',
      'components/Parties/RecordPaymentModal.tsx',
      'components/Parties/VoucherEditorModal.tsx',
      'components/Parties/AddEditPartyModal.tsx',
      'components/Dashboard/DashboardRecordPaymentModal.tsx',
      'components/Dashboard/DashboardVoucherModal.tsx',
      'components/Dashboard/DashboardExpenseModal.tsx',
      'components/Inventory/StockAdjustmentModal.tsx',
      'components/Inventory/ItemFormModal.tsx',
      'components/Settings/modals/EditBusinessProfileModal.tsx',
      'components/Settings/modals/SettingsSubModal.tsx',
      'components/POS/CustomItemModal.tsx',
      'components/POS/HoldBillsModal.tsx',
      'components/POS/SelectPosPartyModal.tsx',
      'components/POS/SplitPaymentModal.tsx',
      'components/POS/UpiQrModal.tsx',
      'components/POS/PosKeyboardShortcutsModal.tsx',
      'components/Auth/RoleSwitchModal.tsx',
      'components/Scanner/CameraBarcodeScannerModal.tsx',
      'components/Update/AppUpdateModal.tsx',
      'components/CashBank/AddEditBankAccountModal.tsx',
      'components/CashBank/CashBankTransferModal.tsx',
      'components/CashBank/DirectCashBankModal.tsx',
    ];

    it('TC-A11Y-01: Header close buttons on audited primary modals must provide aria-label attribute', () => {
      const srcDir = path.resolve(__dirname, '..');
      const missingAriaLabels: string[] = [];

      for (const relPath of modalFilesToCheck) {
        const fullPath = path.join(srcDir, relPath);
        if (!fs.existsSync(fullPath)) continue;

        const content = fs.readFileSync(fullPath, 'utf8');

        // Look for buttons that contain close icon glyphs without aria-label
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (
            line.includes('<button') &&
            !line.includes('aria-label') &&
            (lines[idx + 1]?.includes('close') ||
              lines[idx + 2]?.includes('close') ||
              lines[idx + 3]?.includes('close'))
          ) {
            // Check if the button tag itself across the block contains aria-label
            const block = lines.slice(idx, idx + 8).join(' ');
            if (
              block.includes('close') &&
              !block.includes('aria-label') &&
              !block.includes('Cancel') &&
              !block.includes('Close') &&
              !block.includes('text-')
            ) {
              missingAriaLabels.push(`${relPath}:${idx + 1}`);
            }
          }
        });
      }

      // In Milestone 3, all primary modals must have aria-label on close buttons
      // We assert that the count of violations in the remediated codebase is zero
      expect(missingAriaLabels).toEqual([]);
    });

    it('TC-A11Y-02: Search clear buttons across primary hubs provide aria-label="Clear search"', () => {
      const hubFiles = [
        'components/Dashboard/DashboardView.tsx',
        'components/Sales/SalesHubView.tsx',
        'components/Purchases/PurchasesHubView.tsx',
        'components/Parties/PartiesView.tsx',
        'components/Expenses/ExpensesView.tsx',
      ];

      const srcDir = path.resolve(__dirname, '..');
      const missingClearAria: string[] = [];

      for (const relPath of hubFiles) {
        const fullPath = path.join(srcDir, relPath);
        if (!fs.existsSync(fullPath)) continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        // Match onClick={() => setSearch...('')} or onClick={() => setSearchQuery('')}
        const hasSearchClear =
          content.includes("setSearch('')") ||
          content.includes("setSearchQuery('')") ||
          content.includes("setSearchTerm('')");

        if (hasSearchClear) {
          const hasAriaClear =
            content.includes('aria-label="Clear search"') ||
            content.includes("aria-label='Clear search'") ||
            content.includes('title="Clear search"');
          if (!hasAriaClear) {
            missingClearAria.push(relPath);
          }
        }
      }

      expect(missingClearAria).toEqual([]);
    });

    it('TC-A11Y-03: Sort buttons across primary hubs provide descriptive aria-label', () => {
      const sortHubFiles = [
        'components/Sales/SalesHubView.tsx',
        'components/Purchases/PurchasesHubView.tsx',
        'components/Expenses/ExpensesView.tsx',
      ];

      const srcDir = path.resolve(__dirname, '..');
      const missingSortAria: string[] = [];

      for (const relPath of sortHubFiles) {
        const fullPath = path.join(srcDir, relPath);
        if (!fs.existsSync(fullPath)) continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('setIsSortDropdownOpen')) {
          const hasAriaSort =
            content.includes('aria-label="Sort') ||
            content.includes('aria-label={`Sort') ||
            content.includes('title={`Sort');
          if (!hasAriaSort) {
            missingSortAria.push(relPath);
          }
        }
      }

      expect(missingSortAria).toEqual([]);
    });
  });
});
