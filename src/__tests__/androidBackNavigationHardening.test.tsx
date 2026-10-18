// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerBackHandler,
  triggerBack,
  initBackNavigation,
  handleExitOrToast,
  showExitToast,
  resetBackNavigationForTesting,
  setLastBackPressTime,
  getLastBackPressTime,
  useBackNavigation,
} from '../core/utils/backNavigation.ts';
import { App } from '@capacitor/app';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

describe('Android Back Navigation Hardening & Invariants Suite (R1, R2, R3, R4)', () => {
  beforeEach(() => {
    resetBackNavigationForTesting();
    vi.restoreAllMocks();
  });

  describe('R1. Strict Priority & LIFO Dismissal Hierarchy', () => {
    it('dismisses overlays and nested pickers in strict priority order (p30 > p25 > p20 > p15 > p10 > p0)', () => {
      const order: string[] = [];

      registerBackHandler(() => {
        order.push('p0_root');
        return true;
      }, 0);

      registerBackHandler(() => {
        order.push('p10_invoice_modal');
        return true;
      }, 10);

      registerBackHandler(() => {
        order.push('p15_reports_subview');
        return true;
      }, 15);

      registerBackHandler(() => {
        order.push('p20_item_submodal');
        return true;
      }, 20);

      registerBackHandler(() => {
        order.push('p25_date_filter');
        return true;
      }, 25);

      registerBackHandler(() => {
        order.push('p30_confirm_drawer');
        return true;
      }, 30);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['p30_confirm_drawer']);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['p30_confirm_drawer', 'p25_date_filter']);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['p30_confirm_drawer', 'p25_date_filter', 'p20_item_submodal']);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['p30_confirm_drawer', 'p25_date_filter', 'p20_item_submodal', 'p15_reports_subview']);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['p30_confirm_drawer', 'p25_date_filter', 'p20_item_submodal', 'p15_reports_subview', 'p10_invoice_modal']);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['p30_confirm_drawer', 'p25_date_filter', 'p20_item_submodal', 'p15_reports_subview', 'p10_invoice_modal', 'p0_root']);

      expect(triggerBack()).toBe(false);
    });

    it('dismisses tied-priority handlers in strict reverse LIFO order', () => {
      const order: string[] = [];

      registerBackHandler(() => {
        order.push('first_submodal');
        return true;
      }, 20);

      registerBackHandler(() => {
        order.push('second_submodal');
        return true;
      }, 20);

      registerBackHandler(() => {
        order.push('third_submodal');
        return true;
      }, 20);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['third_submodal']);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['third_submodal', 'second_submodal']);

      expect(triggerBack()).toBe(true);
      expect(order).toEqual(['third_submodal', 'second_submodal', 'first_submodal']);
    });

    it('dismisses DateFilterModal (p25) while leaving underlying document modal (p10) open', () => {
      let isInvoiceModalOpen = true;
      let isDateFilterOpen = true;

      const unregModal = registerBackHandler(() => {
        isInvoiceModalOpen = false;
        return true;
      }, 10);

      const unregPicker = registerBackHandler(() => {
        isDateFilterOpen = false;
        return true;
      }, 25);

      // 1st back: closes DateFilterModal only
      const handled1 = triggerBack();
      expect(handled1).toBe(true);
      expect(isDateFilterOpen).toBe(false);
      expect(isInvoiceModalOpen).toBe(true);
      unregPicker();

      // 2nd back: closes InvoiceModal
      const handled2 = triggerBack();
      expect(handled2).toBe(true);
      expect(isInvoiceModalOpen).toBe(false);
      unregModal();
    });
  });

  describe('R2. Sub-View & Hub Back Navigation Invariants', () => {
    it('In BusinessReportsView: dedicated report page navigates back to Reports Hub (activeReportPage = "hub")', () => {
      let activeReportPage: string = 'gst_tax';
      let activeTab: string = 'reports';

      initBackNavigation(() => {
        if (activeTab !== 'dashboard') {
          activeTab = 'dashboard';
          return true;
        }
        return false;
      });

      // Priority 15 handler registered when activeReportPage !== 'hub'
      const unregReportsSubview = registerBackHandler(() => {
        activeReportPage = 'hub';
        return true;
      }, 15);

      // 1st back: returns to hub, tab stays reports
      const handled = (window as any).__handleAndroidBack();
      expect(handled).toBe(true);
      expect(activeReportPage).toBe('hub');
      expect(activeTab).toBe('reports');
      unregReportsSubview();

      // 2nd back: on hub, falls through to root handler and navigates to dashboard
      const handledRoot = (window as any).__handleAndroidBack();
      expect(handledRoot).toBe(true);
      expect(activeTab).toBe('dashboard');

      // 3rd back: on dashboard, returns false for Android native exit
      const handledExit = (window as any).__handleAndroidBack();
      expect(handledExit).toBe(false);
    });

    it('In BusinessReportsView: nested DateFilterModal closes first before navigating to hub', () => {
      let activeReportPage = 'cash_flow';
      let isDateFilterOpen = true;

      // Reports Hub sub-view handler (p15)
      const unregReports = registerBackHandler(() => {
        activeReportPage = 'hub';
        return true;
      }, 15);

      // DateFilterModal handler (p25)
      const unregPicker = registerBackHandler(() => {
        isDateFilterOpen = false;
        return true;
      }, 25);

      // 1st back: dismisses DateFilterModal only, still on cash_flow
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(isDateFilterOpen).toBe(false);
      expect(activeReportPage).toBe('cash_flow');
      unregPicker();

      // 2nd back: returns to hub
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(activeReportPage).toBe('hub');
      unregReports();
    });

    it('In PartyDetailPage: back returns to Parties list (selectedPartyForLedger = null)', () => {
      let selectedPartyForLedger: any = { id: 'party-1', name: 'Sharma Electronics' };
      let activeTab = 'parties';

      initBackNavigation(() => {
        if (activeTab !== 'dashboard') {
          activeTab = 'dashboard';
          return true;
        }
        return false;
      });

      // PartyDetailPage registers priority 15 handler
      const unregPartyDetail = registerBackHandler(() => {
        selectedPartyForLedger = null;
        return true;
      }, 15);

      // 1st back: clears party ledger, returns to parties list
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(selectedPartyForLedger).toBeNull();
      expect(activeTab).toBe('parties');
      unregPartyDetail();

      // 2nd back: navigates from parties list to dashboard
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(activeTab).toBe('dashboard');

      // 3rd back: on dashboard, returns false for exit
      expect((window as any).__handleAndroidBack()).toBe(false);
    });

    it('In QuickBillingView POS: navigates back to Sales Hub if opened from sales, otherwise dashboard', () => {
      let activeTab: string = 'pos';
      let previousTab: string = 'sales';

      // POS view back handler (priority 10)
      const unregPos = registerBackHandler(() => {
        activeTab = previousTab === 'sales' ? 'sales' : 'dashboard';
        return true;
      }, 10);

      // Back from POS opened from sales returns to sales
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(activeTab).toBe('sales');
      unregPos();

      // If opened from dashboard:
      activeTab = 'pos';
      previousTab = 'dashboard';
      const unregPosDash = registerBackHandler(() => {
        activeTab = previousTab === 'sales' ? 'sales' : 'dashboard';
        return true;
      }, 10);

      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(activeTab).toBe('dashboard');
      unregPosDash();
    });
  });

  describe('R3. Root Tab & Safe Double-Tap App Exit', () => {
    it('navigates to Dashboard tab when back is pressed on non-dashboard tabs', () => {
      const nonDashboardTabs = ['sales', 'purchases', 'parties', 'inventory', 'expenses', 'reports', 'settings', 'menu'];

      nonDashboardTabs.forEach((tab) => {
        let currentTab = tab;
        initBackNavigation(() => {
          if (currentTab !== 'dashboard') {
            currentTab = 'dashboard';
            return true;
          }
          return false;
        });

        const handled = (window as any).__handleAndroidBack();
        expect(handled).toBe(true);
        expect(currentTab).toBe('dashboard');
      });
    });

    it('shows toast prompt on first back press on root Dashboard', () => {
      resetBackNavigationForTesting();
      const exitSpy = vi.fn();
      (window as any).AndroidBridge = { exitApp: exitSpy };

      initBackNavigation(() => false);

      const result = handleExitOrToast();
      expect(result).toBe(false);
      expect(exitSpy).not.toHaveBeenCalled();

      // Toast must exist in document
      const toast = document.getElementById('back-exit-toast');
      expect(toast).not.toBeNull();
      expect(toast?.innerText).toBe('Press back again to exit app');
    });

    it('exits application cleanly on second back press within 2 seconds', () => {
      resetBackNavigationForTesting();
      const exitSpy = vi.fn();
      (window as any).AndroidBridge = { exitApp: exitSpy };

      // 1st press at t=1000
      setLastBackPressTime(1000);
      vi.spyOn(Date, 'now').mockReturnValue(1800); // 800ms later (< 2000ms)

      const result = handleExitOrToast();
      expect(result).toBe(true);
      expect(exitSpy).toHaveBeenCalledTimes(1);
    });

    it('resets timeout and shows toast prompt again if second press exceeds 2 seconds', () => {
      resetBackNavigationForTesting();
      const exitSpy = vi.fn();
      (window as any).AndroidBridge = { exitApp: exitSpy };

      // 1st press at t=1000
      setLastBackPressTime(1000);
      vi.spyOn(Date, 'now').mockReturnValue(3500); // 2500ms later (> 2000ms)

      const result = handleExitOrToast();
      expect(result).toBe(false);
      expect(exitSpy).not.toHaveBeenCalled();
      expect(getLastBackPressTime()).toBe(3500);

      const toast = document.getElementById('back-exit-toast');
      expect(toast).not.toBeNull();
      expect(toast?.innerText).toBe('Press back again to exit app');
    });

    it('handles document backbutton event fallback for WebView / Cordova', () => {
      resetBackNavigationForTesting();
      let modalClosed = false;

      registerBackHandler(() => {
        modalClosed = true;
        return true;
      }, 10);

      const event = new Event('backbutton', { cancelable: true });
      document.dispatchEvent(event);

      expect(modalClosed).toBe(true);
    });
  });

  describe('R1 & R2 Real Nested Hierarchy & Complex Transitions', () => {
    it('PartyDetailPage: dismissing expanded details (p20) preserves onBack (p15) for subsequent back press', () => {
      resetBackNavigationForTesting();
      let isDetailsExpanded = true;
      let partyDetailClosed = false;
      let activeTab = 'parties';

      initBackNavigation(() => {
        if (activeTab !== 'dashboard') {
          activeTab = 'dashboard';
          return true;
        }
        return false;
      });

      // PartyDetailPage base onBack handler (p15)
      registerBackHandler(() => {
        partyDetailClosed = true;
        return true;
      }, 15);

      // PartyDetailPage expanded details handler (p20)
      const unregDetails = registerBackHandler(() => {
        isDetailsExpanded = false;
        return true;
      }, 20);

      // 1st back: collapses expanded details only; PartyDetailPage remains active
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(isDetailsExpanded).toBe(false);
      expect(partyDetailClosed).toBe(false);
      unregDetails();

      // 2nd back: closes PartyDetailPage back to Parties list
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(partyDetailClosed).toBe(true);
      expect(activeTab).toBe('parties');

      // 3rd back: returns from Parties list to Dashboard
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(activeTab).toBe('dashboard');

      // 4th back: on Dashboard, triggers exit prompt
      expect((window as any).__handleAndroidBack()).toBe(false);
    });

    it('QuickBillingView: ThermalPrintModal (p30) closes before completedSale (p20) before POS tab (p10)', () => {
      resetBackNavigationForTesting();
      let isThermalPrintOpen = true;
      let isCompletedSaleOpen = true;
      let activeTab = 'pos';
      const previousTab = 'sales';

      // POS Tab fallback handler (p10)
      const unregPos = registerBackHandler(() => {
        activeTab = previousTab;
        return true;
      }, 10);

      // PosCheckoutSuccessModal handler (p20)
      const unregSale = registerBackHandler(() => {
        isCompletedSaleOpen = false;
        return true;
      }, 20);

      // ThermalPrintModal handler (p30)
      const unregThermal = registerBackHandler(() => {
        isThermalPrintOpen = false;
        return true;
      }, 30);

      // 1st back: closes ThermalPrintModal (p30) only
      expect(triggerBack()).toBe(true);
      expect(isThermalPrintOpen).toBe(false);
      expect(isCompletedSaleOpen).toBe(true);
      expect(activeTab).toBe('pos');
      unregThermal();

      // 2nd back: closes completedSale (p20)
      expect(triggerBack()).toBe(true);
      expect(isCompletedSaleOpen).toBe(false);
      expect(activeTab).toBe('pos');
      unregSale();

      // 3rd back: navigates from POS to sales hub (p10)
      expect(triggerBack()).toBe(true);
      expect(activeTab).toBe('sales');
      unregPos();
    });

    it('InvoicePreviewModal: ThermalPrintModal (p30) closes without dismissing InvoicePreviewModal (p25)', () => {
      resetBackNavigationForTesting();
      let isThermalPrintOpen = true;
      let isPreviewModalOpen = true;

      // InvoicePreviewModal handler (p25)
      const unregPreview = registerBackHandler(() => {
        isPreviewModalOpen = false;
        return true;
      }, 25);

      // ThermalPrintModal handler (p30)
      const unregThermal = registerBackHandler(() => {
        isThermalPrintOpen = false;
        return true;
      }, 30);

      // 1st back: closes ThermalPrintModal (p30)
      expect(triggerBack()).toBe(true);
      expect(isThermalPrintOpen).toBe(false);
      expect(isPreviewModalOpen).toBe(true);
      unregThermal();

      // 2nd back: closes InvoicePreviewModal (p25)
      expect(triggerBack()).toBe(true);
      expect(isPreviewModalOpen).toBe(false);
      unregPreview();
    });

    it('PrintSettingsView: ConfirmDeleteModal (p30) closes before onBack (p10)', () => {
      resetBackNavigationForTesting();
      let isResetConfirmOpen = true;
      let printSettingsClosed = false;

      // PrintSettingsView onBack handler (p10)
      const unregSettings = registerBackHandler(() => {
        printSettingsClosed = true;
        return true;
      }, 10);

      // ConfirmDeleteModal handler (p30)
      const unregConfirm = registerBackHandler(() => {
        isResetConfirmOpen = false;
        return true;
      }, 30);

      // 1st back: closes ConfirmDeleteModal only
      expect(triggerBack()).toBe(true);
      expect(isResetConfirmOpen).toBe(false);
      expect(printSettingsClosed).toBe(false);
      unregConfirm();

      // 2nd back: navigates back to Settings
      expect(triggerBack()).toBe(true);
      expect(printSettingsClosed).toBe(true);
      unregSettings();
    });

    it('CompanySettingsView: settings sub-modal (p25) closes without dismissing mobile detail view (p15)', () => {
      resetBackNavigationForTesting();
      let isSettingsModalOpen = true;
      let isMobileDetailView = true;
      let activeTab = 'settings';

      initBackNavigation(() => {
        if (activeTab !== 'dashboard') {
          activeTab = 'dashboard';
          return true;
        }
        return false;
      });

      // Priority 15: Return to settings category menu on mobile
      const unregDetailView = registerBackHandler(() => {
        isMobileDetailView = false;
        return true;
      }, 15);

      // Priority 25: Settings dialogs and sub-modals (e.g. edit profile / prefix)
      const unregSubModal = registerBackHandler(() => {
        isSettingsModalOpen = false;
        return true;
      }, 25);

      // 1st back: closes settings sub-modal (p25), mobile detail view remains active
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(isSettingsModalOpen).toBe(false);
      expect(isMobileDetailView).toBe(true);
      expect(activeTab).toBe('settings');
      unregSubModal();

      // 2nd back: exits mobile detail view to settings menu (p15)
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(isMobileDetailView).toBe(false);
      expect(activeTab).toBe('settings');
      unregDetailView();

      // 3rd back: on settings menu, navigates to dashboard
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(activeTab).toBe('dashboard');

      // 4th back: on dashboard, triggers exit prompt
      expect((window as any).__handleAndroidBack()).toBe(false);
    });

    it('InvoicePreviewModal: more actions dropdown (p30) closes without dismissing invoice preview modal (p25)', () => {
      resetBackNavigationForTesting();
      let isMoreActionsOpen = true;
      let isPreviewModalOpen = true;

      // Priority 25: Close preview modal
      const unregPreview = registerBackHandler(() => {
        isPreviewModalOpen = false;
        return true;
      }, 25);

      // Priority 30: Dismiss more actions dropdown
      const unregMoreActions = registerBackHandler(() => {
        isMoreActionsOpen = false;
        return true;
      }, 30);

      // 1st back: closes more actions dropdown (p30)
      expect(triggerBack()).toBe(true);
      expect(isMoreActionsOpen).toBe(false);
      expect(isPreviewModalOpen).toBe(true);
      unregMoreActions();

      // 2nd back: closes invoice preview modal (p25)
      expect(triggerBack()).toBe(true);
      expect(isPreviewModalOpen).toBe(false);
      unregPreview();
    });

    it('SelectPosPartyModal: Add New Party sub-form (p25) closes without dismissing Select Party modal (p20)', () => {
      resetBackNavigationForTesting();
      let isAddingNew = true;
      let isSelectModalOpen = true;

      // Priority 20: Close Select Party modal
      const unregModal = registerBackHandler(() => {
        isSelectModalOpen = false;
        return true;
      }, 20);

      // Priority 25: Dismiss Add New Party sub-form
      const unregAddForm = registerBackHandler(() => {
        isAddingNew = false;
        return true;
      }, 25);

      // 1st back: dismisses Add New Party sub-form (p25)
      expect(triggerBack()).toBe(true);
      expect(isAddingNew).toBe(false);
      expect(isSelectModalOpen).toBe(true);
      unregAddForm();

      // 2nd back: closes Select Party modal (p20)
      expect(triggerBack()).toBe(true);
      expect(isSelectModalOpen).toBe(false);
      unregModal();
    });

    it('QuickBillingView: mobile cart drawer (p15) closes after child POS modal (p20) before returning to Sales hub (p10)', () => {
      resetBackNavigationForTesting();
      let isCustomItemModalOpen = true;
      let isMobileCartDrawerOpen = true;
      let activeTab = 'pos';

      // Priority 10: POS tab fallback
      const unregPosTab = registerBackHandler(() => {
        activeTab = 'sales';
        return true;
      }, 10);

      // Priority 15: Mobile cart drawer
      const unregCartDrawer = registerBackHandler(() => {
        isMobileCartDrawerOpen = false;
        return true;
      }, 15);

      // Priority 20: Custom item modal
      const unregCustomItem = registerBackHandler(() => {
        isCustomItemModalOpen = false;
        return true;
      }, 20);

      // 1st back: closes CustomItemModal (p20)
      expect(triggerBack()).toBe(true);
      expect(isCustomItemModalOpen).toBe(false);
      expect(isMobileCartDrawerOpen).toBe(true);
      expect(activeTab).toBe('pos');
      unregCustomItem();

      // 2nd back: closes mobile cart drawer (p15)
      expect(triggerBack()).toBe(true);
      expect(isMobileCartDrawerOpen).toBe(false);
      expect(activeTab).toBe('pos');
      unregCartDrawer();

      // 3rd back: returns to sales hub (p10)
      expect(triggerBack()).toBe(true);
      expect(activeTab).toBe('sales');
      unregPosTab();
    });

    it('InventoryView: ItemDetailSheet (p15) stays open when closing nested invoice preview (p25)', () => {
      resetBackNavigationForTesting();
      let isInvoicePreviewOpen = true;
      let isItemDetailOpen = true;
      let activeTab = 'inventory';

      initBackNavigation(() => {
        if (activeTab !== 'dashboard') {
          activeTab = 'dashboard';
          return true;
        }
        return false;
      });

      // Priority 15: ItemDetailSheet passbook sub-view
      const unregItemDetail = registerBackHandler(() => {
        isItemDetailOpen = false;
        return true;
      }, 15);

      // Priority 25: SimplifiedInvoiceModal preview
      const unregPreview = registerBackHandler(() => {
        isInvoicePreviewOpen = false;
        return true;
      }, 25);

      // 1st back: closes invoice preview (p25), item detail sheet stays open
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(isInvoicePreviewOpen).toBe(false);
      expect(isItemDetailOpen).toBe(true);
      expect(activeTab).toBe('inventory');
      unregPreview();

      // 2nd back: closes item detail sheet (p15)
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(isItemDetailOpen).toBe(false);
      expect(activeTab).toBe('inventory');
      unregItemDetail();

      // 3rd back: returns to dashboard
      expect((window as any).__handleAndroidBack()).toBe(true);
      expect(activeTab).toBe('dashboard');

      // 4th back: exit prompt
      expect((window as any).__handleAndroidBack()).toBe(false);
    });
  });

  describe('React Component Hook Lifecycle & Multi-Level Dismissal', () => {
    it('reliably handles nested modal dismissal and sub-view return across React component state updates', async () => {
      resetBackNavigationForTesting();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      let currentState: any = {};

      const TestComponent = () => {
        const [isSubView, setIsSubView] = React.useState(true);
        const [isModal, setIsModal] = React.useState(true);

        currentState = { isSubView, isModal };

        useBackNavigation(() => {
          setIsModal(false);
          return true;
        }, isModal, 25);

        useBackNavigation(() => {
          setIsSubView(false);
          return true;
        }, isSubView, 15);

        return (
          <div>
            {isSubView && <div id="subview">SubView</div>}
            {isModal && <div id="modal">Modal</div>}
          </div>
        );
      };

      await act(async () => {
        root.render(<TestComponent />);
      });

      expect(currentState.isModal).toBe(true);
      expect(currentState.isSubView).toBe(true);

      // 1st back: closes modal (p25), sub-view remains open (p15)
      await act(async () => {
        const handled = triggerBack();
        expect(handled).toBe(true);
      });

      expect(currentState.isModal).toBe(false);
      expect(currentState.isSubView).toBe(true);

      // 2nd back: closes sub-view (p15)
      await act(async () => {
        const handled = triggerBack();
        expect(handled).toBe(true);
      });

      expect(currentState.isModal).toBe(false);
      expect(currentState.isSubView).toBe(false);

      // 3rd back: no active handlers left
      expect(triggerBack()).toBe(false);

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
});
