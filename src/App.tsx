import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from './services/db.ts';
import { pouch } from './services/pouchdb.ts';
import { CompanyProfile } from './models/company.ts';
import { Party } from './models/party.ts';
import { InventoryItem, StockAdjustment } from './models/item.ts';
import { Invoice, PaymentSplit, PaymentMode, InvoiceType } from './models/invoice.ts';
import { PurchaseBill } from './models/purchase.ts';
import { Expense } from './models/expense.ts';
import { Voucher } from './core/accounting/voucherTypes.ts';
import {
  createSalesInvoiceVoucher,
  createPurchaseInvoiceVoucher,
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
  createReversalVoucher,
} from './core/accounting/ledger.ts';

import { Header } from './components/Shell/Header.tsx';
import { AppTab } from './components/Shell/Drawer.tsx';
import { BottomNav } from './components/Shell/BottomNav.tsx';
import { TabletSidebar } from './components/Shell/TabletSidebar.tsx';
import {
  useCompany,
  useParties,
  useItems,
  useInvoices,
  usePurchases,
  useExpenses,
  useVouchers,
  useBankAccounts,
  useCashBankTxns,
} from './core/store/useDataStore.ts';

// Cold-Start Primary View (Statically imported for instant FCP)
import { DashboardView } from './components/Dashboard/DashboardView.tsx';

// Data models and utilities
import { findConflictingInvoice } from './core/utils/invoiceNumber.ts';
import { BankAccount, CashBankTransaction } from './models/bankAccount.ts';
import { rbac, UserProfile } from './services/rbac.ts';
import { updateService, AppReleaseInfo, CURRENT_APP_VERSION } from './services/updateService.ts';
import { withWalkInCustomer, isSystemParty } from './core/utils/systemParties.ts';
import { initBackNavigation, useBackNavigation } from './core/utils/backNavigation.ts';
import { isItemInBills, getActiveItems } from './core/utils/itemStatus.ts';
import { ConfirmDeleteModal } from './components/Common/ConfirmDeleteModal.tsx';


// Secondary Views (Dynamic Code-Splitting with named-export unwrapping)
const BusinessReportsView = React.lazy(() =>
  import('./components/Reports/BusinessReportsView.tsx').then((m) => ({ default: m.BusinessReportsView }))
);
const CompanySettingsView = React.lazy(() =>
  import('./components/Settings/CompanySettingsView.tsx').then((m) => ({ default: m.CompanySettingsView }))
);
const DaybookView = React.lazy(() =>
  import('./components/Reports/DaybookView.tsx').then((m) => ({ default: m.DaybookView }))
);
const ExpensesView = React.lazy(() =>
  import('./components/Expenses/ExpensesView.tsx').then((m) => ({ default: m.ExpensesView }))
);
const CashBankManagementView = React.lazy(() =>
  import('./components/CashBank/CashBankManagementView.tsx').then((m) => ({ default: m.CashBankManagementView }))
);
const PrintSettingsView = React.lazy(() =>
  import('./components/Settings/PrintSettingsView.tsx').then((m) => ({ default: m.PrintSettingsView }))
);
const PurchasesHubView = React.lazy(() =>
  import('./components/Purchases/PurchasesHubView.tsx').then((m) => ({ default: m.PurchasesHubView }))
);
const InventoryView = React.lazy(() =>
  import('./components/Inventory/InventoryView.tsx').then((m) => ({ default: m.InventoryView }))
);
const PartiesView = React.lazy(() =>
  import('./components/Parties/PartiesView.tsx').then((m) => ({ default: m.PartiesView }))
);
const NavigationMenuHubView = React.lazy(() =>
  import('./components/Navigation/NavigationMenuHubView.tsx').then((m) => ({ default: m.NavigationMenuHubView }))
);
const SalesHubView = React.lazy(() =>
  import('./components/Sales/SalesHubView.tsx').then((m) => ({ default: m.SalesHubView }))
);
const QuickBillingView = React.lazy(() =>
  import('./components/POS/QuickBillingView.tsx').then((m) => ({ default: m.QuickBillingView }))
);
const QuotationsEstimatesView = React.lazy(() =>
  import('./components/Sales/QuotationsEstimatesView.tsx').then((m) => ({ default: m.QuotationsEstimatesView }))
);
const SalesOrdersView = React.lazy(() =>
  import('./components/Orders/SalesOrdersView.tsx').then((m) => ({ default: m.SalesOrdersView }))
);
const DeliveryChallansView = React.lazy(() =>
  import('./components/Challans/DeliveryChallansView.tsx').then((m) => ({ default: m.DeliveryChallansView }))
);
const SalesReturnsView = React.lazy(() =>
  import('./components/Returns/SalesReturnsView.tsx').then((m) => ({ default: m.SalesReturnsView }))
);
const PurchaseOrdersView = React.lazy(() =>
  import('./components/Orders/PurchaseOrdersView.tsx').then((m) => ({ default: m.PurchaseOrdersView }))
);
const PurchaseChallansView = React.lazy(() =>
  import('./components/Purchases/PurchaseChallansView.tsx').then((m) => ({ default: m.PurchaseChallansView }))
);
const PurchaseReturnsView = React.lazy(() =>
  import('./components/Returns/PurchaseReturnsView.tsx').then((m) => ({ default: m.PurchaseReturnsView }))
);
const PaymentTransactionsView = React.lazy(() =>
  import('./components/Payments/PaymentTransactionsView.tsx').then((m) => ({ default: m.PaymentTransactionsView }))
);

// Heavy Modals (Dynamic Code-Splitting with named-export unwrapping)
const TableGridInvoiceModal = React.lazy(() =>
  import('./components/Invoicing/TableGridInvoiceModal.tsx').then((m) => ({ default: m.TableGridInvoiceModal }))
);
const TableGridPurchaseModal = React.lazy(() =>
  import('./components/Purchases/TableGridPurchaseModal.tsx').then((m) => ({ default: m.TableGridPurchaseModal }))
);
const ThermalPrintModal = React.lazy(() =>
  import('./components/Printing/ThermalPrintModal.tsx').then((m) => ({ default: m.ThermalPrintModal }))
);
const RoleSwitchModal = React.lazy(() =>
  import('./components/Auth/RoleSwitchModal.tsx').then((m) => ({ default: m.RoleSwitchModal }))
);
const CreateInvoiceModal = React.lazy(() =>
  import('./components/Invoicing/CreateInvoiceModal.tsx').then((m) => ({ default: m.CreateInvoiceModal }))
);
const SimplifiedInvoiceModal = React.lazy(() =>
  import('./components/Invoicing/SimplifiedInvoiceModal.tsx').then((m) => ({ default: m.SimplifiedInvoiceModal }))
);
const AppUpdateModal = React.lazy(() =>
  import('./components/Update/AppUpdateModal.tsx').then((m) => ({ default: m.AppUpdateModal }))
);

// Zero-CLS Suspense Fallbacks
const ViewLoadingSkeleton: React.FC = () => (
  <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 animate-pulse">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-surface-container-high rounded-lg" />
        <div className="h-4 w-72 bg-surface-container rounded" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-28 bg-surface-container-high rounded-xl" />
        <div className="h-10 w-32 bg-surface-container-high rounded-xl" />
      </div>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-24 bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/30 space-y-3">
          <div className="h-4 w-20 bg-surface-container rounded" />
          <div className="h-6 w-28 bg-surface-container-high rounded" />
        </div>
      ))}
    </div>
    <div className="h-80 bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/30 space-y-4">
      <div className="h-6 w-36 bg-surface-container rounded" />
      <div className="space-y-3 pt-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-full bg-surface-container-low rounded-lg" />
        ))}
      </div>
    </div>
  </div>
);

const ModalLoadingFallback: React.FC<{ title?: string }> = ({ title = 'Loading...' }) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-surface-container-lowest text-on-surface rounded-2xl p-6 shadow-2xl border border-outline-variant/40 flex flex-col items-center gap-3 max-w-xs w-full">
      <div className="w-9 h-9 border-3 border-secondary/30 border-t-secondary rounded-full animate-spin" />
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      <p className="text-xs text-on-surface-variant">Preparing interface...</p>
    </div>
  </div>
);

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [activeUser, setActiveUser] = useState<UserProfile>(rbac.getActiveUser());
  const [isRoleSwitchOpen, setIsRoleSwitchOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Dynamic OTA Update & Notification State
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [latestRelease, setLatestRelease] = useState<AppReleaseInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // React 18 Granular External Store Subscriptions
  const company = useCompany();
  const rawParties = useParties();
  const items = useItems();
  const invoices = useInvoices();
  const purchases = usePurchases();
  const expenses = useExpenses();
  const vouchers = useVouchers();
  const bankAccounts = useBankAccounts();
  const cashBankTxns = useCashBankTxns();

  const parties = useMemo(() => {
    return withWalkInCustomer(rawParties, company.stateCode, invoices);
  }, [rawParties, company.stateCode, invoices]);

  // Modals state
  const [isStandardInvoiceOpen, setIsStandardInvoiceOpen] = useState(false);
  const [isTableGridInvoiceOpen, setIsTableGridInvoiceOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [selectedPartyForInvoice, setSelectedPartyForInvoice] = useState<Party | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [isTableGridPurchaseOpen, setIsTableGridPurchaseOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseBill | null>(null);
  const [selectedSupplierForPurchase, setSelectedSupplierForPurchase] = useState<Party | null>(null);
  const [invoiceModalDefaultType, setInvoiceModalDefaultType] = useState<InvoiceType | undefined>(undefined);
  const [purchaseModalDefaultType, setPurchaseModalDefaultType] = useState<'BILL' | 'PO' | 'RETURN' | 'CHALLAN' | undefined>(undefined);

  // Declarative Confirm Delete Modal State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    recordName?: string;
    confirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {},
  });

  // Dedicated Party View Navigation State (Customers vs Suppliers & Status Filter)
  const [partiesSegment, setPartiesSegment] = useState<'CUSTOMERS' | 'SUPPLIERS'>('CUSTOMERS');
  const [partiesFilter, setPartiesFilter] = useState<'ALL' | 'OVERDUE' | 'SETTLED'>('ALL');

  const handleNavigateToParties = useCallback((
    segment: 'CUSTOMERS' | 'SUPPLIERS' = 'CUSTOMERS',
    filter: 'ALL' | 'OVERDUE' | 'SETTLED' = 'ALL'
  ) => {
    setPartiesSegment(segment);
    setPartiesFilter(filter);
    setActiveTab((prevTab) => {
      if (prevTab !== 'parties') {
        previousTabRef.current = prevTab;
      }
      return 'parties';
    });
  }, []);

  // Stable refresh callback for child view onRefresh prop compatibility
  const refreshData = useCallback(() => {
    db.notifyListeners();
  }, []);

  const activeTabRef = React.useRef(activeTab);
  activeTabRef.current = activeTab;
  const previousTabRef = React.useRef<AppTab>('dashboard');
  const hasSyncedPartyBalances = React.useRef(false);

  React.useEffect(() => {
    rbac.migrateLegacyPins().catch((err) => {
      console.error('Failed to migrate legacy PINs:', err);
    });
    if (!hasSyncedPartyBalances.current) {
      hasSyncedPartyBalances.current = true;
      try {
        db.syncAllPartyBalances();
      } catch (err) {
        console.warn('Failed to sync party balances on startup:', err);
      }
    }
    initBackNavigation(() => {
      if (activeTabRef.current !== 'dashboard') {
        setActiveTab('dashboard');
        return true;
      }
      return false;
    });
  }, []);

  // System Back Navigation for Modals and Tabs with explicit priorities
  useBackNavigation(() => {
    setIsStandardInvoiceOpen(false);
    return true;
  }, isStandardInvoiceOpen, 10);

  useBackNavigation(() => {
    setIsTableGridInvoiceOpen(false);
    setEditingInvoice(null);
    return true;
  }, isTableGridInvoiceOpen, 10);

  useBackNavigation(() => {
    setIsTableGridPurchaseOpen(false);
    setSelectedSupplierForPurchase(null);
    return true;
  }, isTableGridPurchaseOpen, 10);

  useBackNavigation(() => {
    setPreviewInvoice(null);
    return true;
  }, !!previewInvoice, 25);

  useBackNavigation(() => {
    setPrintInvoice(null);
    return true;
  }, !!printInvoice, 25);

  useBackNavigation(() => {
    setIsRoleSwitchOpen(false);
    return true;
  }, isRoleSwitchOpen, 25);

  useBackNavigation(() => {
    setIsUpdateModalOpen(false);
    return true;
  }, isUpdateModalOpen, 25);

  // Quick Billing POS: navigate to parent sales hub or dashboard on back
  useBackNavigation(() => {
    const fallbackTab = previousTabRef.current === 'sales' ? 'sales' : 'dashboard';
    setActiveTab(fallbackTab);
    return true;
  }, activeTab === 'pos', 10);

  React.useEffect(() => {
    // Gracefully dismiss splashscreen overlay after initial render & fonts are fully ready
    let isCancelled = false;
    let fadeTimer: NodeJS.Timeout | number;

    const dismissSplash = () => {
      if (isCancelled) return;
      const splash = document.getElementById('app-splash');
      if (splash && !splash.classList.contains('fade-out')) {
        splash.classList.add('fade-out');
        fadeTimer = setTimeout(() => {
          splash.remove();
        }, 400);
      }
    };

    if (typeof document !== 'undefined' && 'fonts' in document && document.fonts.ready) {
      Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500))
      ]).then(() => {
        requestAnimationFrame(() => {
          setTimeout(dismissSplash, 60);
        });
      }).catch(dismissSplash);
    } else {
      fadeTimer = setTimeout(dismissSplash, 600);
    }

    return () => {
      isCancelled = true;
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  // Background silent OTA / PWA update check on mount & listen for Service Worker updates
  React.useEffect(() => {
    const unsubPwa = updateService.onPwaUpdate((info) => {
      setHasUpdate(true);
      setLatestRelease(info);
      showToast(`PWA update available from GitHub (v${info.version})!`);
    });

    updateService
      .checkForUpdates()
      .then((res) => {
        if (res.hasUpdate && res.latestRelease) {
          setHasUpdate(true);
          setLatestRelease(res.latestRelease);
        }
      })
      .catch(() => {});

    return () => {
      unsubPwa();
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  }, []);

  React.useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        showToast(customEvent.detail);
      }
    };
    window.addEventListener('app_show_toast', handleToastEvent);
    return () => {
      window.removeEventListener('app_show_toast', handleToastEvent);
    };
  }, [showToast]);

  const handleCheckUpdate = useCallback(async (explicit: boolean = true) => {
    if (hasUpdate && latestRelease) {
      setIsUpdateModalOpen(true);
      return;
    }

    setIsCheckingUpdate(true);
    try {
      const res = await updateService.checkForUpdates();
      if (res.hasUpdate && res.latestRelease) {
        setHasUpdate(true);
        setLatestRelease(res.latestRelease);
        setIsUpdateModalOpen(true);
      } else if (res.error) {
        if (explicit) {
          showToast(`Update check failed: ${res.error}`);
        }
      } else {
        setHasUpdate(false);
        if (explicit) {
          showToast(`You are on the latest version (v${CURRENT_APP_VERSION}).`);
        }
      }
    } catch (_err) {
      if (explicit) {
        showToast('Unable to check for updates. Please verify your network connection.');
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [hasUpdate, latestRelease, showToast]);

  const handleCheckUpdateFromChrome = useCallback(() => {
    handleCheckUpdate(true);
  }, [handleCheckUpdate]);

  const handleSaveInvoice = useCallback((
    newInvoice: Invoice,
    options?: { openPreview?: boolean; openPrint?: boolean }
  ) => {
    // Enforce uniqueness of invoice number under GST compliance
    const conflict = findConflictingInvoice(newInvoice.invoiceNumber, newInvoice.id, db.getInvoices());
    if (conflict) {
      showToast(`Conflict: Invoice #${newInvoice.invoiceNumber} already exists for ${conflict.partyName} (${conflict.date}). Only unique numbers allowed.`);
      return;
    }

    try {
      db.saveInvoice(newInvoice);
    } catch (err: any) {
      showToast(err.message || 'Cannot save invoice.');
      return;
    }

    // Auto-create Double-Entry Accounting Voucher for Sales (only for taxable sales, not quotes or orders)
    const isOrderOrEstimate =
      newInvoice.invoiceType === 'ESTIMATE' ||
      newInvoice.invoiceType === 'SALES_ORDER' ||
      newInvoice.invoiceType === 'DELIVERY_CHALLAN';

    const existingVoucher = db.getVouchers().find(
      (v) =>
        !v.isReversed &&
        !v.isCancelled &&
        v.voucherType === 'SALES' &&
        !v.voucherNumber.startsWith('VCH-REV-') &&
        (v.referenceNo === newInvoice.invoiceNumber || v.voucherNumber === `VCH-SAL-${newInvoice.invoiceNumber}`)
    );

    if (!isOrderOrEstimate && !newInvoice.isCancelled) {
      const voucher = createSalesInvoiceVoucher({
        id: existingVoucher?.id,
        invoiceNumber: newInvoice.invoiceNumber,
        date: newInvoice.date,
        customerName: newInvoice.partyName,
        customerId: newInvoice.partyId || 'ACC_CASH',
        taxableAmount: newInvoice.totalTaxableAmount,
        cgstAmount: newInvoice.totalCgst,
        sgstAmount: newInvoice.totalSgst,
        igstAmount: newInvoice.totalIgst,
        cessAmount: newInvoice.totalCess,
        grandTotal: newInvoice.grandTotal,
        isCashSale: newInvoice.paymentMode === 'CASH',
        roundOff: newInvoice.roundOff,
        paymentSplits: newInvoice.paymentSplits,
      });
      db.saveVoucher(voucher);
    } else if (existingVoucher) {
      // Document was converted/edited to an estimate/order or cancelled: reverse any existing active voucher
      const rev = createReversalVoucher({
        originalVoucher: existingVoucher,
        reason: `Reversal of Sales Voucher #${existingVoucher.voucherNumber} for non-taxable/cancelled document`,
      });
      db.saveVoucher(rev);
      db.saveVoucher({
        ...existingVoucher,
        isReversed: true,
        reversalVoucherId: rev.id,
      });
    }

    if (newInvoice.partyId) {
      db.recalculatePartyBalance(newInvoice.partyId);
    }
    setIsStandardInvoiceOpen(false);
    setIsTableGridInvoiceOpen(false);
    setEditingInvoice(null);
    if (options?.openPrint) {
      setPrintInvoice(newInvoice);
    }
    if (options?.openPreview !== false) {
      setPreviewInvoice(newInvoice);
    }
  }, [showToast]);

  const handleEditInvoice = useCallback((inv: Invoice) => {
    setEditingInvoice(inv);
    setSelectedPartyForInvoice(null);
    setIsTableGridInvoiceOpen(true);
  }, []);

  const handleCreateInvoiceForParty = useCallback((party: Party) => {
    setEditingInvoice(null);
    setSelectedPartyForInvoice(party);
    setIsTableGridInvoiceOpen(true);
  }, []);

  const handleCreatePurchaseForParty = useCallback((party: Party) => {
    setEditingPurchase(null);
    setSelectedSupplierForPurchase(party);
    setIsTableGridPurchaseOpen(true);
  }, []);

  const handleEditPurchase = useCallback((bill: PurchaseBill) => {
    setEditingPurchase(bill);
    setSelectedSupplierForPurchase(null);
    setIsTableGridPurchaseOpen(true);
  }, []);

  const handleOpenNewInvoice = useCallback(() => {
    setEditingInvoice(null);
    setSelectedPartyForInvoice(null);
    setInvoiceModalDefaultType(undefined);
    setIsTableGridInvoiceOpen(true);
  }, []);

  const handleOpenNewQuotation = useCallback(() => {
    setEditingInvoice(null);
    setSelectedPartyForInvoice(null);
    setInvoiceModalDefaultType('ESTIMATE');
    setIsTableGridInvoiceOpen(true);
  }, []);

  const handleOpenNewSalesOrder = useCallback(() => {
    setEditingInvoice(null);
    setSelectedPartyForInvoice(null);
    setInvoiceModalDefaultType('SALES_ORDER');
    setIsTableGridInvoiceOpen(true);
  }, []);

  const handleOpenNewDeliveryChallan = useCallback(() => {
    setEditingInvoice(null);
    setSelectedPartyForInvoice(null);
    setInvoiceModalDefaultType('DELIVERY_CHALLAN');
    setIsTableGridInvoiceOpen(true);
  }, []);

  const handleOpenNewSalesReturn = useCallback(() => {
    setEditingInvoice(null);
    setSelectedPartyForInvoice(null);
    setInvoiceModalDefaultType('CREDIT_NOTE');
    setIsTableGridInvoiceOpen(true);
  }, []);

  const handleOpenNewPurchaseOrder = useCallback(() => {
    setEditingPurchase(null);
    setSelectedSupplierForPurchase(null);
    setPurchaseModalDefaultType('PO');
    setIsTableGridPurchaseOpen(true);
  }, []);

  const handleOpenNewPurchaseReturn = useCallback(() => {
    setEditingPurchase(null);
    setSelectedSupplierForPurchase(null);
    setPurchaseModalDefaultType('RETURN');
    setIsTableGridPurchaseOpen(true);
  }, []);

  const handleOpenNewPurchaseChallan = useCallback(() => {
    setEditingPurchase(null);
    setSelectedSupplierForPurchase(null);
    setPurchaseModalDefaultType('CHALLAN');
    setIsTableGridPurchaseOpen(true);
  }, []);

  const handleSavePurchase = useCallback((newBill: PurchaseBill) => {
    db.savePurchase(newBill);

    // Auto-create Double-Entry Accounting Voucher for Purchase (only for inward bills, not purchase orders or challans)
    const isPurchaseOrder = newBill.purchaseType === 'PO';
    const isPurchaseChallan = newBill.purchaseType === 'CHALLAN';
    const existingVoucher = db.getVouchers().find(
      (v) =>
        !v.isReversed &&
        !v.isCancelled &&
        v.voucherType === 'PURCHASE' &&
        !v.voucherNumber.startsWith('VCH-REV-') &&
        !v.voucherNumber.startsWith('VCH-RCM-') &&
        (v.referenceNo === newBill.billNumber || v.voucherNumber === `VCH-PUR-${newBill.billNumber}`)
    );

    if (!isPurchaseOrder && !isPurchaseChallan && !newBill.isCancelled) {
      const voucher = createPurchaseInvoiceVoucher({
        id: existingVoucher?.id,
        billNumber: newBill.billNumber,
        date: newBill.date,
        supplierName: newBill.supplierName,
        supplierId: newBill.supplierId,
        taxableAmount: newBill.totalTaxableAmount,
        cgstAmount: newBill.totalCgst,
        sgstAmount: newBill.totalSgst,
        igstAmount: newBill.totalIgst,
        cessAmount: newBill.totalCess,
        grandTotal: newBill.grandTotal,
        isCashPurchase: newBill.paymentMode === 'CASH',
        roundOff: newBill.roundOff,
        paymentSplits: newBill.paymentSplits,
      });
      db.saveVoucher(voucher);
    } else if (existingVoucher) {
      // Document was converted/edited to a PO or cancelled: reverse any existing active voucher
      const rev = createReversalVoucher({
        originalVoucher: existingVoucher,
        reason: `Reversal of Purchase Voucher #${existingVoucher.voucherNumber} for non-inward/cancelled bill`,
      });
      db.saveVoucher(rev);
      db.saveVoucher({
        ...existingVoucher,
        isReversed: true,
        reversalVoucherId: rev.id,
      });
    }

    if (newBill.supplierId) {
      db.recalculatePartyBalance(newBill.supplierId);
    }
  }, []);

  const handleDeleteInvoice = useCallback((id: string) => {
    if (!rbac.canDeleteInvoice(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete invoices. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    const inv = db.getInvoices().find((i) => i.id === id);
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Invoice?',
      recordName: inv ? `Invoice #${inv.invoiceNumber}` : undefined,
      description: 'Are you sure you want to delete this invoice? This will restore inventory stock and recalculate party balance.',
      confirmText: 'Delete Invoice',
      onConfirm: () => {
        db.deleteInvoice(id);
        if (inv?.partyId) {
          db.recalculatePartyBalance(inv.partyId);
        }
      },
    });
  }, [activeUser.role]);

  const handleDeletePurchase = useCallback((id: string) => {
    if (!rbac.canDeletePurchase(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete purchase bills. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    const bill = db.getPurchases().find((b) => b.id === id);
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Purchase Bill?',
      recordName: bill ? `Bill #${bill.billNumber}` : undefined,
      description: 'Are you sure you want to delete this purchase bill? This will revert inventory stock and recalculate party balance.',
      confirmText: 'Delete Purchase',
      onConfirm: () => {
        db.deletePurchase(id);
        if (bill?.supplierId) {
          db.recalculatePartyBalance(bill.supplierId);
        }
      },
    });
  }, [activeUser.role]);

  const handleSaveExpense = useCallback((newExpense: Expense) => {
    db.saveExpense(newExpense);
  }, []);

  const handleDeleteExpense = useCallback((id: string) => {
    if (!rbac.canDeleteExpense(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete expense vouchers. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    const exp = db.getExpenses().find((e) => e.id === id);
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Expense Voucher?',
      recordName: exp ? `${exp.category}: ₹${exp.amount.toFixed(2)}` : undefined,
      description: 'Are you sure you want to delete this expense voucher? This action cannot be undone.',
      confirmText: 'Delete Expense',
      onConfirm: () => {
        db.deleteExpense(id);
      },
    });
  }, [activeUser.role]);

  const handleSaveParty = useCallback((party: Party) => {
    db.saveParty(party);
  }, []);

  const handleRecordPartyPayment = useCallback((
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[],
    discount: number = 0,
    bankAccountId?: string
  ) => {
    const isPaymentIn = paymentType ? paymentType === 'IN' : party.type === 'CUSTOMER';
    const disc = Number((discount || 0).toFixed(2));
    const totalSettled = Number((amount + disc).toFixed(2));
    const newBal = isPaymentIn
      ? party.currentBalance - totalSettled
      : party.currentBalance + totalSettled;

    const updatedParty: Party = {
      ...party,
      currentBalance: newBal,
      updatedAt: new Date().toISOString(),
    };
    db.saveParty(updatedParty);

    const docId = Date.now().toString().slice(-6);
    const bankAcc = bankAccountId ? db.getBankAccounts().find((a) => a.id === bankAccountId) : undefined;
    if (isPaymentIn) {
      // 1. Create Double-Entry Receipt Voucher with Split Support and Discount Allowed
      const voucher = createPaymentReceiptVoucher({
        receiptNumber: `RCPT-${docId}`,
        date: new Date().toISOString().split('T')[0],
        customerName: party.name,
        customerId: party.id,
        amount,
        discount: disc,
        paymentMode,
        bankAccountId,
        bankAccountName: bankAcc?.accountName,
        paymentSplits,
        narration: notes || `Payment received from ${party.name}${disc > 0 ? ` (Discount: ₹${disc.toFixed(2)})` : ''}`,
      });
      db.saveVoucher(voucher);

      // 2. FIFO settlement across unpaid invoices for this customer
      let remaining = totalSettled;
      const unpaidInvoices = db
        .getInvoices()
        .filter(
          (inv) =>
            (inv.partyId === party.id || inv.partyName.toLowerCase() === party.name.toLowerCase()) &&
            inv.balanceAmount > 0
        )
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const inv of unpaidInvoices) {
        if (remaining <= 0) break;
        const settleAmt = Math.min(remaining, inv.balanceAmount);
        const newPaid = inv.paidAmount + settleAmt;
        const newBalInv = inv.grandTotal - newPaid;

        // Maintain payment splits on settled invoice
        const updatedSplits: PaymentSplit[] = (inv.paymentSplits?.filter((s) => s.mode !== 'CREDIT') || []).map((s) => ({ ...s }));
        if (paymentSplits && paymentSplits.length > 0) {
          const ratio = amount > 0 ? settleAmt / amount : 1;
          paymentSplits.forEach((s) => {
            if (s.amount > 0 && s.mode !== 'CREDIT') {
              updatedSplits.push({
                id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                mode: s.mode,
                amount: Number((s.amount * ratio).toFixed(2)),
                accountId: s.accountId,
                accountName: s.accountName,
                reference: s.reference,
                referenceNo: s.referenceNo,
              });
            }
          });
        } else {
          updatedSplits.push({
            id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            mode: (paymentMode as PaymentMode) || 'CASH',
            amount: settleAmt,
            accountId: paymentMode === 'CASH' ? 'ACC_CASH' : bankAccountId,
            accountName: paymentMode === 'CASH' ? 'Cash-in-hand' : bankAcc?.accountName,
          });
        }
        if (newBalInv > 0) {
          updatedSplits.push({
            id: `split-bal-${Date.now()}`,
            mode: 'CREDIT',
            amount: newBalInv,
          });
        }

        const nonCredit = updatedSplits.filter((s) => s.mode !== 'CREDIT');
        const resolvedMode: PaymentMode = nonCredit.length > 1 ? 'SPLIT' : (nonCredit[0]?.mode || 'CASH');

        const updatedInv: Invoice = {
          ...inv,
          paidAmount: newPaid,
          balanceAmount: Math.max(0, newBalInv),
          paymentStatus: newBalInv <= 0.01 ? 'PAID' : 'PARTIAL',
          paymentMode: resolvedMode,
          paymentSplits: updatedSplits,
          updatedAt: new Date().toISOString(),
        };
        db.saveInvoice(updatedInv);
        remaining -= settleAmt;
      }
    } else {
      // 1. Create Double-Entry Payment Out Voucher with Split Support and Discount Received
      const voucher = createPaymentOutVoucher({
        voucherNumber: `PYMT-${docId}`,
        date: new Date().toISOString().split('T')[0],
        supplierName: party.name,
        supplierId: party.id,
        amount,
        discount: disc,
        paymentMode,
        bankAccountId,
        bankAccountName: bankAcc?.accountName,
        paymentSplits,
        narration: notes || `Payment disbursed to ${party.name}${disc > 0 ? ` (Discount: ₹${disc.toFixed(2)})` : ''}`,
      });
      db.saveVoucher(voucher);

      // 2. FIFO settlement across unpaid purchases for this supplier
      let remaining = totalSettled;
      const unpaidPurchases = db
        .getPurchases()
        .filter(
          (pur) =>
            (pur.supplierId === party.id || pur.supplierName.toLowerCase() === party.name.toLowerCase()) &&
            pur.balanceAmount > 0
        )
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const pur of unpaidPurchases) {
        if (remaining <= 0) break;
        const settleAmt = Math.min(remaining, pur.balanceAmount);
        const newPaid = pur.paidAmount + settleAmt;
        const newBalPur = pur.grandTotal - newPaid;

        const updatedSplits: PaymentSplit[] = (pur.paymentSplits?.filter((s) => s.mode !== 'CREDIT') || []).map((s) => ({ ...s }));
        if (paymentSplits && paymentSplits.length > 0) {
          const ratio = amount > 0 ? settleAmt / amount : 1;
          paymentSplits.forEach((s) => {
            if (s.amount > 0 && s.mode !== 'CREDIT') {
              updatedSplits.push({
                id: `pymt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                mode: s.mode,
                amount: Number((s.amount * ratio).toFixed(2)),
                accountId: s.accountId,
                accountName: s.accountName,
                reference: s.reference,
                referenceNo: s.referenceNo,
              });
            }
          });
        } else {
          updatedSplits.push({
            id: `pymt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            mode: (paymentMode as PaymentMode) || 'CASH',
            amount: settleAmt,
            accountId: paymentMode === 'CASH' ? 'ACC_CASH' : bankAccountId,
            accountName: paymentMode === 'CASH' ? 'Cash-in-hand' : bankAcc?.accountName,
          });
        }
        if (newBalPur > 0) {
          updatedSplits.push({
            id: `split-bal-${Date.now()}`,
            mode: 'CREDIT',
            amount: newBalPur,
          });
        }

        const nonCredit = updatedSplits.filter((s) => s.mode !== 'CREDIT');
        const resolvedMode: PaymentMode = nonCredit.length > 1 ? 'SPLIT' : (nonCredit[0]?.mode || 'CASH');

        const updatedPur: PurchaseBill = {
          ...pur,
          paidAmount: newPaid,
          balanceAmount: Math.max(0, newBalPur),
          paymentStatus: newBalPur <= 0.01 ? 'PAID' : 'PARTIAL',
          paymentMode: resolvedMode,
          paymentSplits: updatedSplits,
          updatedAt: new Date().toISOString(),
        };
        db.savePurchase(updatedPur);
        remaining -= settleAmt;
      }
    }

    db.recalculatePartyBalance(party.id);
  }, []);

  const handleDeleteParty = useCallback((id: string) => {
    if (isSystemParty(id)) {
      alert('System party cannot be deleted.');
      return;
    }
    if (!rbac.canDeleteParty(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete customer/supplier accounts. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    const party = db.getParties().find((p) => p.id === id);
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Party Account?',
      recordName: party ? party.name : undefined,
      description: 'Are you sure you want to delete this party? This removes them from your active contacts list.',
      confirmText: 'Delete Party',
      onConfirm: () => {
        db.deleteParty(id);
      },
    });
  }, [activeUser.role]);

  const activeItems = React.useMemo(() => getActiveItems(items), [items]);

  const handleSaveItem = useCallback((item: InventoryItem) => {
    const trimmed = (item.name || '').normalize('NFC').trim().toLowerCase();
    const isDup = db.getItems().some(
      (existing) =>
        String(existing.id) !== String(item.id) &&
        (existing.name || '').normalize('NFC').trim().toLowerCase() === trimmed
    );
    if (isDup) {
      showToast('An item with this name already exists in inventory');
      return;
    }
    db.saveItem(item);
  }, [showToast]);

  const handleDeleteItem = useCallback((id: string) => {
    if (!rbac.canDeleteItem(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete inventory items. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    if (isItemInBills(id, db.getInvoices(), db.getPurchases())) {
      showToast('Cannot delete: This item exists in bills. You can disable it instead.');
      return;
    }
    const item = db.getItems().find((it) => it.id === id);
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Inventory Item?',
      recordName: item ? item.name : undefined,
      description: 'Are you sure you want to delete this item? This action cannot be undone.',
      confirmText: 'Delete Item',
      onConfirm: () => {
        db.deleteItem(id);
      },
    });
  }, [activeUser.role, showToast]);

  const handleSaveAdjustment = useCallback((adj: StockAdjustment) => {
    db.saveStockAdjustment(adj);
  }, []);

  const handleSaveCompany = useCallback((updated: CompanyProfile) => {
    if (!rbac.canEditCompanySettings(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can edit company profile and settings. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    db.saveCompany(updated);
  }, [activeUser.role]);

  const handleSaveBankAccount = useCallback((account: BankAccount) => {
    db.saveBankAccount(account);
  }, []);

  const handleDeleteBankAccount = useCallback((id: string) => {
    if (!rbac.canDeleteBankAccount(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete bank accounts. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    const acc = db.getBankAccounts().find((a) => a.id === id);
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Bank Account?',
      recordName: acc ? `${acc.accountName} (${acc.accountNumber})` : undefined,
      description: 'Are you sure you want to delete this bank account? This action cannot be undone.',
      confirmText: 'Delete Account',
      onConfirm: () => {
        db.deleteBankAccount(id);
      },
    });
  }, [activeUser.role]);

  const handleSaveCashBankTxn = useCallback((txn: CashBankTransaction) => {
    db.saveCashBankTransaction(txn);
  }, []);

  const handleDeleteCashBankTxn = useCallback((id: string) => {
    if (!rbac.canDeleteCashBankTxn(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete cash/bank transactions. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    const txn = db.getCashBankTransactions().find((t) => t.id === id);
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Cash/Bank Transaction?',
      recordName: txn ? `${txn.type}: ₹${txn.amount.toFixed(2)}` : undefined,
      description: 'Are you sure you want to delete this transaction? This action cannot be undone.',
      confirmText: 'Delete Transaction',
      onConfirm: () => {
        db.deleteCashBankTransaction(id);
      },
    });
  }, [activeUser.role]);

  useEffect(() => {
    const mainEl = document.getElementById('main-content-scroll');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [activeTab]);

  const [reportsDeepLink, setReportsDeepLink] = useState<{
    report: 'bank_statement';
    accountId: string;
    datePreset: 'THIS_FY';
  } | null>(null);

  // Clear reports deep link on every exit path (including global Android back navigation)
  useEffect(() => {
    if (activeTab !== 'reports' && reportsDeepLink !== null) {
      setReportsDeepLink(null);
    }
  }, [activeTab, reportsDeepLink]);

  const handleSelectTab = useCallback((tab: AppTab) => {
    if (!rbac.canAccessTab(tab, activeUser.role)) {
      setIsRoleSwitchOpen(true);
      return;
    }
    setActiveTab((curTab) => {
      if (curTab === 'reports' && tab !== 'reports') {
        setReportsDeepLink(null);
      }
      if (tab !== curTab) {
        previousTabRef.current = curTab;
      }
      return tab;
    });
  }, [activeUser.role]);

  const handleOpenAccountStatement = useCallback((accountId: string) => {
    setReportsDeepLink({
      report: 'bank_statement',
      accountId,
      datePreset: 'THIS_FY',
    });
    handleSelectTab('reports');
  }, [handleSelectTab]);

  // Navigation Chrome Callbacks
  const handleOpenMore = useCallback(() => handleSelectTab('menu'), [handleSelectTab]);
  const handleOpenSettings = useCallback(() => handleSelectTab('settings'), [handleSelectTab]);
  const handleOpenRoleSwitch = useCallback(() => setIsRoleSwitchOpen(true), []);
  const handleCloseRoleSwitch = useCallback(() => setIsRoleSwitchOpen(false), []);
  const handleSearchClick = useCallback(() => handleSelectTab('menu'), [handleSelectTab]);
  const handleBarcodeClick = useCallback(() => handleSelectTab('pos'), [handleSelectTab]);

  return (
    <div className="h-screen h-[100dvh] bg-surface font-body-md text-on-surface antialiased flex flex-row overflow-hidden selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      {/* Tablet / Desktop Persistent Sidebar Navigation */}
      <TabletSidebar
        activeTab={activeTab}
        company={company}
        activeUser={activeUser}
        onSelectTab={handleSelectTab}
        onOpenRoleSwitch={handleOpenRoleSwitch}
        onCheckUpdate={handleCheckUpdateFromChrome}
        hasUpdate={hasUpdate}
        latestVersion={latestRelease?.version}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top App Header - Detached & Pinned at Top */}
        <div className="flex-shrink-0 z-30">
          <Header
            company={company}
            activeUser={activeUser}
            onOpenMore={handleOpenMore}
            onOpenSettings={handleOpenSettings}
            onNewInvoice={handleOpenNewInvoice}
            onSearchClick={handleSearchClick}
            onBarcodeClick={handleBarcodeClick}
            onProfileClick={handleOpenRoleSwitch}
            hasUpdate={hasUpdate}
          />
        </div>

        {/* Main Working Screen Area - Rendered strictly below topbar with independent scroll containment */}
        <main id="main-content-scroll" className="flex-1 min-h-0 w-full overflow-y-auto pb-24 md:pb-8 overscroll-contain">
          <React.Suspense fallback={<ViewLoadingSkeleton />}>
        {activeTab === 'dashboard' && (
          <DashboardView
            company={company}
            invoices={invoices}
            purchases={purchases}
            vouchers={vouchers}
            expenses={expenses}
            items={activeItems}
            parties={parties}
            onNewInvoice={handleOpenNewInvoice}
            onQuickPos={() => {
              previousTabRef.current = 'dashboard';
              setActiveTab('pos');
            }}
            onViewInvoice={setPreviewInvoice}
            onPrintInvoice={setPrintInvoice}
            onEditInvoice={handleEditInvoice}
            onEditPurchase={handleEditPurchase}
            onRecordPartyPayment={handleRecordPartyPayment}
            onRefresh={refreshData}
            onNavigateTab={handleSelectTab}
            onNavigateToParties={handleNavigateToParties}
          />
        )}

        {activeTab === 'pos' && (
          <QuickBillingView
            company={company}
            items={activeItems}
            parties={parties}
            onCompleteSale={(inv) => handleSaveInvoice(inv, { openPreview: false })}
            onViewInvoice={setPreviewInvoice}
          />
        )}

        {activeTab === 'sales' && (
          <SalesHubView
            company={company}
            invoices={invoices}
            onOpenStandardInvoice={() => setIsStandardInvoiceOpen(true)}
            onOpenTableGridInvoice={() => {
              setEditingInvoice(null);
              setInvoiceModalDefaultType(undefined);
              setIsTableGridInvoiceOpen(true);
            }}
            onViewInvoice={setPreviewInvoice}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onQuickPos={() => {
              previousTabRef.current = 'sales';
              setActiveTab('pos');
            }}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'payment_in' && (
          <PaymentTransactionsView
            flow="IN"
            company={company}
            accounts={bankAccounts}
            transactions={cashBankTxns}
            invoices={invoices}
            purchases={purchases}
            expenses={expenses}
            vouchers={vouchers}
            onSaveTransaction={handleSaveCashBankTxn}
            onDeleteTransaction={handleDeleteCashBankTxn}
            onNavigateTab={handleSelectTab}
          />
        )}

        {activeTab === 'quotations' && (
          <QuotationsEstimatesView
            company={company}
            invoices={invoices}
            onNewQuotation={handleOpenNewQuotation}
            onViewInvoice={setPreviewInvoice}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'sales_orders' && (
          <SalesOrdersView
            company={company}
            invoices={invoices}
            onNewSalesOrder={handleOpenNewSalesOrder}
            onViewInvoice={setPreviewInvoice}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'delivery_challans' && (
          <DeliveryChallansView
            company={company}
            invoices={invoices}
            onNewDeliveryChallan={handleOpenNewDeliveryChallan}
            onViewInvoice={setPreviewInvoice}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'sales_returns' && (
          <SalesReturnsView
            company={company}
            invoices={invoices}
            onNewSalesReturn={handleOpenNewSalesReturn}
            onViewInvoice={setPreviewInvoice}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
          />
        )}

        {activeTab === 'purchases' && (
          <PurchasesHubView
            purchases={purchases}
            parties={parties}
            company={company}
            itemsCatalog={activeItems}
            onSavePurchase={handleSavePurchase}
            onDeletePurchase={handleDeletePurchase}
            onEditPurchase={handleEditPurchase}
          />
        )}

        {activeTab === 'payment_out' && (
          <PaymentTransactionsView
            flow="OUT"
            company={company}
            accounts={bankAccounts}
            transactions={cashBankTxns}
            invoices={invoices}
            purchases={purchases}
            expenses={expenses}
            vouchers={vouchers}
            onSaveTransaction={handleSaveCashBankTxn}
            onDeleteTransaction={handleDeleteCashBankTxn}
            onNavigateTab={handleSelectTab}
          />
        )}

        {activeTab === 'purchase_orders' && (
          <PurchaseOrdersView
            company={company}
            purchases={purchases}
            onNewPurchaseOrder={handleOpenNewPurchaseOrder}
            onViewPurchase={handleEditPurchase}
            onEditPurchase={handleEditPurchase}
            onDeletePurchase={handleDeletePurchase}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'purchase_challans' && (
          <PurchaseChallansView
            company={company}
            purchases={purchases}
            onNewPurchaseChallan={handleOpenNewPurchaseChallan}
            onViewPurchase={handleEditPurchase}
            onEditPurchase={handleEditPurchase}
            onDeletePurchase={handleDeletePurchase}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'purchase_returns' && (
          <PurchaseReturnsView
            company={company}
            purchases={purchases}
            onNewPurchaseReturn={handleOpenNewPurchaseReturn}
            onViewPurchase={handleEditPurchase}
            onEditPurchase={handleEditPurchase}
            onDeletePurchase={handleDeletePurchase}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesView
            expenses={expenses}
            onSaveExpense={handleSaveExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            items={items}
            invoices={invoices}
            purchases={purchases}
            onSaveItem={handleSaveItem}
            onDeleteItem={handleDeleteItem}
            onSaveAdjustment={handleSaveAdjustment}
            onScanBarcodeClick={() => handleSelectTab('pos')}
            onViewInvoice={setPreviewInvoice}
            onOpenSettings={(tab) => {
              handleSelectTab('settings');
              if (tab) {
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('switch_settings_tab', { detail: tab }));
                }, 50);
              }
            }}
          />
        )}

        {activeTab === 'parties' && (
          <PartiesView
            parties={parties}
            invoices={invoices}
            purchases={purchases}
            vouchers={vouchers}
            bankAccounts={bankAccounts}
            initialSegment={partiesSegment}
            initialStatusFilter={partiesFilter}
            onSaveParty={handleSaveParty}
            onDeleteParty={handleDeleteParty}
            onRecordPartyPayment={handleRecordPartyPayment}
            onViewInvoice={setPreviewInvoice}
            onEditInvoice={handleEditInvoice}
            onEditPurchase={handleEditPurchase}
            onCreateInvoice={handleCreateInvoiceForParty}
            onCreatePurchase={handleCreatePurchaseForParty}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'accounting' && (
          <DaybookView vouchers={vouchers} />
        )}

        {activeTab === 'cash_bank' && (
          <CashBankManagementView
            company={company}
            accounts={bankAccounts}
            transactions={cashBankTxns}
            invoices={invoices}
            purchases={purchases}
            expenses={expenses}
            vouchers={vouchers}
            onSaveAccount={handleSaveBankAccount}
            onDeleteAccount={handleDeleteBankAccount}
            onSaveTransaction={handleSaveCashBankTxn}
            onDeleteTransaction={handleDeleteCashBankTxn}
            onNavigateTab={handleSelectTab}
            onOpenAccountStatement={handleOpenAccountStatement}
          />
        )}

        {activeTab === 'reports' && (
          <BusinessReportsView
            company={company}
            invoices={invoices}
            purchases={purchases}
            expenses={expenses}
            items={items}
            parties={parties}
            vouchers={vouchers}
            bankAccounts={bankAccounts}
            cashBankTxns={cashBankTxns}
            initialReportPage={reportsDeepLink?.report}
            initialAccountId={reportsDeepLink?.accountId}
            initialDatePreset={reportsDeepLink?.datePreset}
            onSaveTransaction={handleSaveCashBankTxn}
            onDeleteTransaction={handleDeleteCashBankTxn}
            onNavigateTab={handleSelectTab}
          />
        )}

        {activeTab === 'settings' && (
          <CompanySettingsView
            company={company}
            onSave={handleSaveCompany}
          />
        )}

        {activeTab === 'print_settings' && (
          <PrintSettingsView
            company={company}
            onBack={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'menu' && (
          <NavigationMenuHubView
            company={company}
            invoices={invoices}
            purchases={purchases}
            parties={parties}
            items={items}
            expenses={expenses}
            vouchers={vouchers}
            onNavigate={handleSelectTab}
            onNavigateToParties={handleNavigateToParties}
            onOpenRoleSwitch={handleOpenRoleSwitch}
            onCheckUpdate={handleCheckUpdateFromChrome}
            hasUpdate={hasUpdate}
            latestVersion={latestRelease?.version}
            isCheckingUpdate={isCheckingUpdate}
          />
        )}
          </React.Suspense>
      </main>
      </div>

      {/* Modern Touch Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onNewInvoice={handleOpenNewInvoice}
      />

      {/* Modals */}
      {isStandardInvoiceOpen && (
        <React.Suspense fallback={<ModalLoadingFallback title="Loading Standard Invoice..." />}>
          <CreateInvoiceModal
            company={company}
            parties={parties}
            itemsCatalog={activeItems}
            onClose={() => setIsStandardInvoiceOpen(false)}
            onSave={handleSaveInvoice}
          />
        </React.Suspense>
      )}

      {isTableGridInvoiceOpen && (
        <React.Suspense fallback={<ModalLoadingFallback title="Loading Invoice Editor..." />}>
          <TableGridInvoiceModal
            company={company}
            parties={parties}
            itemsCatalog={activeItems}
            initialInvoice={editingInvoice}
            initialParty={selectedPartyForInvoice}
            existingInvoices={invoices}
            defaultInvoiceType={invoiceModalDefaultType}
            onClose={() => {
              setIsTableGridInvoiceOpen(false);
              setEditingInvoice(null);
              setSelectedPartyForInvoice(null);
              setInvoiceModalDefaultType(undefined);
            }}
            onSave={(inv, opts) => {
              handleSaveInvoice(inv, opts);
              setInvoiceModalDefaultType(undefined);
            }}
            onAddNewParty={() => setActiveTab('parties')}
            onPartyCreated={handleSaveParty}
          />
        </React.Suspense>
      )}

      {isTableGridPurchaseOpen && (
        <React.Suspense fallback={<ModalLoadingFallback title="Loading Purchase Entry..." />}>
          <TableGridPurchaseModal
            company={company}
            parties={parties}
            itemsCatalog={activeItems}
            initialBill={editingPurchase}
            initialSupplier={selectedSupplierForPurchase}
            defaultPurchaseType={purchaseModalDefaultType}
            onClose={() => {
              setIsTableGridPurchaseOpen(false);
              setEditingPurchase(null);
              setSelectedSupplierForPurchase(null);
              setPurchaseModalDefaultType(undefined);
            }}
            onSave={(bill) => {
              handleSavePurchase(bill);
              setIsTableGridPurchaseOpen(false);
              setEditingPurchase(null);
              setSelectedSupplierForPurchase(null);
              setPurchaseModalDefaultType(undefined);
            }}
            onAddNewParty={() => setActiveTab('parties')}
            onPartyCreated={handleSaveParty}
          />
        </React.Suspense>
      )}

      {/* Simplified Mobile Invoice Preview Modal (Home transactions, Invoice Save, etc.) */}
      {previewInvoice && (
        <React.Suspense fallback={<ModalLoadingFallback title="Loading Invoice Preview..." />}>
          <SimplifiedInvoiceModal
            invoice={previewInvoice}
            company={company}
            onClose={() => setPreviewInvoice(null)}
            onEditInvoice={(inv) => {
              setPreviewInvoice(null);
              handleEditInvoice(inv);
            }}
            onDeleteInvoice={(id) => {
              setPreviewInvoice(null);
              handleDeleteInvoice(id);
            }}
            onPrintInvoice={(inv) => {
              setPrintInvoice(inv);
            }}
            onOpenFullA4Preview={(inv) => {
              setPrintInvoice(inv);
            }}
          />
        </React.Suspense>
      )}

      {/* Thermal POS Receipt Print Modal */}
      {printInvoice && (
        <React.Suspense fallback={<ModalLoadingFallback title="Loading Print Dialog..." />}>
          <ThermalPrintModal
            invoice={printInvoice}
            company={company}
            onClose={() => setPrintInvoice(null)}
          />
        </React.Suspense>
      )}

      {/* Global Declarative Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={deleteConfirmation.isOpen}
        title={deleteConfirmation.title}
        recordName={deleteConfirmation.recordName}
        description={deleteConfirmation.description}
        confirmText={deleteConfirmation.confirmText || 'Delete'}
        onConfirm={deleteConfirmation.onConfirm}
        onClose={() => setDeleteConfirmation((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* 4-Digit PIN Security Role Switch Modal */}
      {isRoleSwitchOpen && (
        <React.Suspense fallback={<ModalLoadingFallback title="Loading Security Verification..." />}>
          <RoleSwitchModal
            isOpen={isRoleSwitchOpen}
            onClose={() => setIsRoleSwitchOpen(false)}
            onRoleChanged={(newUser) => {
              setActiveUser(newUser);
              if (!rbac.canAccessTab(activeTab, newUser.role)) {
                setActiveTab('dashboard');
              }
            }}
          />
        </React.Suspense>
      )}

      {/* App Auto-Update Modal */}
      {isUpdateModalOpen && (
        <React.Suspense fallback={<ModalLoadingFallback title="Loading Update Details..." />}>
          <AppUpdateModal
            isOpen={isUpdateModalOpen}
            releaseInfo={latestRelease}
            onClose={() => setIsUpdateModalOpen(false)}
          />
        </React.Suspense>
      )}

      {/* Floating Status Toast Notification */}
      {toastMessage && (
        <div
          onClick={() => {
            if (hasUpdate) setIsUpdateModalOpen(true);
          }}
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl border border-white/10 flex items-center gap-2 max-w-[90vw] animate-bounce-once ${
            hasUpdate ? 'cursor-pointer hover:bg-neutral-800 ring-2 ring-secondary/50' : ''
          }`}
        >
          <span className="material-symbols-outlined text-[18px] text-secondary">
            {hasUpdate ? 'cloud_download' : 'info'}
          </span>
          <span className="truncate">{toastMessage}</span>
          {hasUpdate && (
            <span className="bg-secondary text-on-secondary text-[10px] px-2 py-0.5 rounded-full font-bold ml-1">
              Update
            </span>
          )}
        </div>
      )}
    </div>
  );
};
