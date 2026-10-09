import React, { useState } from 'react';
import { db } from './services/db.ts';
import { pouch } from './services/pouchdb.ts';
import { CompanyProfile } from './models/company.ts';
import { Party } from './models/party.ts';
import { InventoryItem, StockAdjustment } from './models/item.ts';
import { Invoice, PaymentSplit, PaymentMode } from './models/invoice.ts';
import { PurchaseBill } from './models/purchase.ts';
import { Expense } from './models/expense.ts';
import { Voucher } from './core/accounting/voucherTypes.ts';
import {
  createSalesInvoiceVoucher,
  createPurchaseInvoiceVoucher,
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
} from './core/accounting/ledger.ts';

import { Header } from './components/Shell/Header.tsx';
import { Drawer, AppTab } from './components/Shell/Drawer.tsx';
import { BottomNav } from './components/Shell/BottomNav.tsx';
import { TabletSidebar } from './components/Shell/TabletSidebar.tsx';

// Cold-Start Primary View (Statically imported for instant FCP)
import { DashboardView } from './components/Dashboard/DashboardView.tsx';

// Data models and utilities
import { findConflictingInvoice } from './core/utils/invoiceNumber.ts';
import { BankAccount, CashBankTransaction } from './models/bankAccount.ts';
import { rbac, UserProfile } from './services/rbac.ts';
import { updateService, AppReleaseInfo, CURRENT_APP_VERSION } from './services/updateService.ts';
import { initBackNavigation, useBackNavigation } from './core/utils/backNavigation.ts';
import { isItemInBills, getActiveItems } from './core/utils/itemStatus.ts';

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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeUser, setActiveUser] = useState<UserProfile>(rbac.getActiveUser());
  const [isRoleSwitchOpen, setIsRoleSwitchOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Dynamic OTA Update & Notification State
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [latestRelease, setLatestRelease] = useState<AppReleaseInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [company, setCompany] = useState<CompanyProfile>(db.getCompany());
  const [parties, setParties] = useState<Party[]>(db.getParties());
  const [items, setItems] = useState<InventoryItem[]>(db.getItems());
  const [invoices, setInvoices] = useState<Invoice[]>(db.getInvoices());
  const [purchases, setPurchases] = useState<PurchaseBill[]>(db.getPurchases());
  const [expenses, setExpenses] = useState<Expense[]>(db.getExpenses());
  const [vouchers, setVouchers] = useState<Voucher[]>(db.getVouchers());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(db.getBankAccounts());
  const [cashBankTxns, setCashBankTxns] = useState<CashBankTransaction[]>(db.getCashBankTransactions());

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

  // Dedicated Party View Navigation State (Customers vs Suppliers & Status Filter)
  const [partiesSegment, setPartiesSegment] = useState<'CUSTOMERS' | 'SUPPLIERS'>('CUSTOMERS');
  const [partiesFilter, setPartiesFilter] = useState<'ALL' | 'OVERDUE' | 'SETTLED'>('ALL');

  const handleNavigateToParties = (
    segment: 'CUSTOMERS' | 'SUPPLIERS' = 'CUSTOMERS',
    filter: 'ALL' | 'OVERDUE' | 'SETTLED' = 'ALL'
  ) => {
    setPartiesSegment(segment);
    setPartiesFilter(filter);
    setActiveTab('parties');
  };

  // Sync state on change
  const refreshData = () => {
    setCompany(db.getCompany());
    setParties(db.getParties());
    setItems(db.getItems());
    setInvoices(db.getInvoices());
    setPurchases(db.getPurchases());
    setExpenses(db.getExpenses());
    setVouchers(db.getVouchers());
    setBankAccounts(db.getBankAccounts());
    setCashBankTxns(db.getCashBankTransactions());
  };

  const activeTabRef = React.useRef(activeTab);
  activeTabRef.current = activeTab;

  React.useEffect(() => {
    rbac.migrateLegacyPins().catch((err) => {
      console.error('Failed to migrate legacy PINs:', err);
    });
    db.syncAllPartyBalances();
    refreshData();
    initBackNavigation(() => {
      if (activeTabRef.current !== 'dashboard') {
        setActiveTab('dashboard');
      }
    });
  }, []);

  // System Back Navigation for Modals and Tabs with explicit priorities
  useBackNavigation(() => {
    setIsDrawerOpen(false);
    return true;
  }, isDrawerOpen, 30);

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

  useBackNavigation(() => {
    if (activeTab !== 'dashboard') {
      setActiveTab('dashboard');
      return true;
    }
    return false;
  }, activeTab !== 'dashboard', 0);

  React.useEffect(() => {
    // Listen for reactive DB data updates (from local writes, remote CouchDB/PouchDB, or multi-tab BroadcastChannel)
    const unsub = db.subscribe(() => {
      refreshData();
    });
    return unsub;
  }, []);

  React.useEffect(() => {
    // Gracefully dismiss splashscreen overlay after initial render & layout settle
    const timer = setTimeout(() => {
      const splash = document.getElementById('app-splash');
      if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => {
          splash.remove();
        }, 400);
      }
    }, 400);
    return () => clearTimeout(timer);
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  const handleCheckUpdate = async (explicit: boolean = true) => {
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
  };

  const handleSaveInvoice = (newInvoice: Invoice, options?: { openPreview?: boolean }) => {
    // Enforce uniqueness of invoice number under GST compliance
    const conflict = findConflictingInvoice(newInvoice.invoiceNumber, newInvoice.id, invoices);
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

    // Auto-create Double-Entry Accounting Voucher for Sales
    const voucher = createSalesInvoiceVoucher({
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

    refreshData();
    if (newInvoice.partyId) {
      db.recalculatePartyBalance(newInvoice.partyId);
      refreshData();
    }
    setIsStandardInvoiceOpen(false);
    setIsTableGridInvoiceOpen(false);
    setEditingInvoice(null);
    if (options?.openPreview !== false) {
      setPreviewInvoice(newInvoice);
    }
  };

  const handleEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setSelectedPartyForInvoice(null);
    setIsTableGridInvoiceOpen(true);
  };

  const handleCreateInvoiceForParty = (party: Party) => {
    setEditingInvoice(null);
    setSelectedPartyForInvoice(party);
    setIsTableGridInvoiceOpen(true);
  };

  const handleCreatePurchaseForParty = (party: Party) => {
    setEditingPurchase(null);
    setSelectedSupplierForPurchase(party);
    setIsTableGridPurchaseOpen(true);
  };

  const handleEditPurchase = (bill: PurchaseBill) => {
    setEditingPurchase(bill);
    setSelectedSupplierForPurchase(null);
    setIsTableGridPurchaseOpen(true);
  };

  const handleSavePurchase = (newBill: PurchaseBill) => {
    db.savePurchase(newBill);

    // Auto-create Double-Entry Accounting Voucher for Purchase (Input Tax Credit)
    const voucher = createPurchaseInvoiceVoucher({
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

    if (newBill.supplierId) {
      db.recalculatePartyBalance(newBill.supplierId);
    }

    refreshData();
  };

  const handleDeleteInvoice = (id: string) => {
    if (!rbac.canDeleteInvoice(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete invoices. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    const inv = db.getInvoices().find((i) => i.id === id);
    if (window.confirm('Delete this invoice?')) {
      db.deleteInvoice(id);
      if (inv?.partyId) {
        db.recalculatePartyBalance(inv.partyId);
      }
      refreshData();
    }
  };

  const handleDeletePurchase = (id: string) => {
    if (!rbac.canDeletePurchase(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete purchase bills. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    const bill = db.getPurchases().find((b) => b.id === id);
    if (window.confirm('Delete this purchase bill?')) {
      db.deletePurchase(id);
      if (bill?.supplierId) {
        db.recalculatePartyBalance(bill.supplierId);
      }
      refreshData();
    }
  };

  const handleSaveExpense = (newExpense: Expense) => {
    db.saveExpense(newExpense);
    refreshData();
  };

  const handleDeleteExpense = (id: string) => {
    if (!rbac.canDeleteExpense(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete expense vouchers. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    if (window.confirm('Delete this expense voucher?')) {
      db.deleteExpense(id);
      refreshData();
    }
  };

  const handleSaveParty = (party: Party) => {
    db.saveParty(party);
    refreshData();
  };

  const handleRecordPartyPayment = (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[]
  ) => {
    const isPaymentIn = paymentType ? paymentType === 'IN' : party.type === 'CUSTOMER';
    const newBal = isPaymentIn
      ? party.currentBalance - amount
      : party.currentBalance + amount;

    const updatedParty: Party = {
      ...party,
      currentBalance: newBal,
      updatedAt: new Date().toISOString(),
    };
    db.saveParty(updatedParty);

    const docId = Date.now().toString().slice(-6);
    if (isPaymentIn) {
      // 1. Create Double-Entry Receipt Voucher with Split Support
      const voucher = createPaymentReceiptVoucher({
        receiptNumber: `RCPT-${docId}`,
        date: new Date().toISOString().split('T')[0],
        customerName: party.name,
        customerId: party.id,
        amount,
        paymentMode,
        paymentSplits,
        narration: notes || `Payment received from ${party.name}`,
      });
      db.saveVoucher(voucher);

      // 2. FIFO settlement across unpaid invoices for this customer
      let remaining = amount;
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
              });
            }
          });
        } else {
          updatedSplits.push({
            id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            mode: (paymentMode as PaymentMode) || 'CASH',
            amount: settleAmt,
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
      // 1. Create Double-Entry Payment Out Voucher with Split Support
      const voucher = createPaymentOutVoucher({
        voucherNumber: `PYMT-${docId}`,
        date: new Date().toISOString().split('T')[0],
        supplierName: party.name,
        supplierId: party.id,
        amount,
        paymentMode,
        paymentSplits,
        narration: notes || `Payment disbursed to ${party.name}`,
      });
      db.saveVoucher(voucher);

      // 2. FIFO settlement across unpaid purchases for this supplier
      let remaining = amount;
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
              });
            }
          });
        } else {
          updatedSplits.push({
            id: `pymt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            mode: (paymentMode as PaymentMode) || 'CASH',
            amount: settleAmt,
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
    refreshData();
  };

  const handleDeleteParty = (id: string) => {
    if (!rbac.canDeleteParty(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete customer/supplier accounts. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    if (window.confirm('Delete this party?')) {
      db.deleteParty(id);
      refreshData();
    }
  };

  const activeItems = React.useMemo(() => getActiveItems(items), [items]);

  const handleSaveItem = (item: InventoryItem) => {
    db.saveItem(item);
    refreshData();
  };

  const handleDeleteItem = (id: string) => {
    if (!rbac.canDeleteItem(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete inventory items. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    if (isItemInBills(id, invoices, purchases)) {
      showToast('Cannot delete: This item exists in bills. You can disable it instead.');
      return;
    }
    if (window.confirm('Delete this inventory item?')) {
      db.deleteItem(id);
      refreshData();
    }
  };

  const handleSaveAdjustment = (adj: StockAdjustment) => {
    db.saveStockAdjustment(adj);
    refreshData();
  };

  const handleSaveCompany = (updated: CompanyProfile) => {
    if (!rbac.canEditCompanySettings(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can edit company profile and settings. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    db.saveCompany(updated);
    refreshData();
  };

  const handleSaveBankAccount = (account: BankAccount) => {
    db.saveBankAccount(account);
    refreshData();
  };

  const handleDeleteBankAccount = (id: string) => {
    if (!rbac.canDeleteBankAccount(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete bank accounts. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    if (window.confirm('Delete this bank account?')) {
      db.deleteBankAccount(id);
      refreshData();
    }
  };

  const handleSaveCashBankTxn = (txn: CashBankTransaction) => {
    db.saveCashBankTransaction(txn);
    refreshData();
  };

  const handleDeleteCashBankTxn = (id: string) => {
    if (!rbac.canDeleteCashBankTxn(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete cash/bank transactions. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    if (window.confirm('Delete this cash/bank transaction?')) {
      db.deleteCashBankTransaction(id);
      refreshData();
    }
  };

  const handleSelectTab = (tab: AppTab) => {
    if (!rbac.canAccessTab(tab, activeUser.role)) {
      setIsRoleSwitchOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-row selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      {/* Tablet / Desktop Persistent Sidebar Navigation */}
      <TabletSidebar
        activeTab={activeTab}
        company={company}
        activeUser={activeUser}
        onSelectTab={handleSelectTab}
        onNewInvoice={() => {
          setEditingInvoice(null);
          setIsTableGridInvoiceOpen(true);
        }}
        onOpenRoleSwitch={() => setIsRoleSwitchOpen(true)}
        onCheckUpdate={() => handleCheckUpdate(true)}
        hasUpdate={hasUpdate}
        latestVersion={latestRelease?.version}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top App Header */}
        <Header
          company={company}
          activeUser={activeUser}
          onOpenDrawer={() => setIsDrawerOpen(true)}
          onNewInvoice={() => setIsTableGridInvoiceOpen(true)}
          onSearchClick={() => handleSelectTab('menu')}
          onBarcodeClick={() => handleSelectTab('pos')}
          onProfileClick={() => setIsRoleSwitchOpen(true)}
          hasUpdate={hasUpdate}
        />

        {/* Slide-out Navigation Drawer (Mobile) */}
        <Drawer
          isOpen={isDrawerOpen}
          activeTab={activeTab}
          company={company}
          activeUser={activeUser}
          onClose={() => setIsDrawerOpen(false)}
          onSelectTab={handleSelectTab}
          onOpenRoleSwitch={() => setIsRoleSwitchOpen(true)}
          onCheckUpdate={() => handleCheckUpdate(true)}
          hasUpdate={hasUpdate}
          latestVersion={latestRelease?.version}
          isCheckingUpdate={isCheckingUpdate}
        />

        {/* Main Scrollable View Area with safe-area padding */}
        <main className="flex-1 w-full pb-24 md:pb-8">
          <React.Suspense fallback={<ViewLoadingSkeleton />}>
        {activeTab === 'dashboard' && (
          <DashboardView
            company={company}
            invoices={invoices}
            items={activeItems}
            parties={parties}
            onNewInvoice={() => {
              setEditingInvoice(null);
              setIsTableGridInvoiceOpen(true);
            }}
            onQuickPos={() => setActiveTab('pos')}
            onViewInvoice={setPreviewInvoice}
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
              setIsTableGridInvoiceOpen(true);
            }}
            onViewInvoice={setPreviewInvoice}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onQuickPos={() => setActiveTab('pos')}
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
          />
        )}

        {activeTab === 'parties' && (
          <PartiesView
            parties={parties}
            invoices={invoices}
            purchases={purchases}
            vouchers={vouchers}
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
            onNewInvoice={() => {
              setEditingInvoice(null);
              setIsTableGridInvoiceOpen(true);
            }}
            onOpenRoleSwitch={() => setIsRoleSwitchOpen(true)}
            onCheckUpdate={() => handleCheckUpdate(true)}
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
        onSelectTab={setActiveTab}
        onNewInvoice={() => setIsTableGridInvoiceOpen(true)}
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
            onClose={() => {
              setIsTableGridInvoiceOpen(false);
              setEditingInvoice(null);
              setSelectedPartyForInvoice(null);
            }}
            onSave={handleSaveInvoice}
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
            onClose={() => {
              setIsTableGridPurchaseOpen(false);
              setEditingPurchase(null);
              setSelectedSupplierForPurchase(null);
            }}
            onSave={(bill) => {
              handleSavePurchase(bill);
              setIsTableGridPurchaseOpen(false);
              setEditingPurchase(null);
              setSelectedSupplierForPurchase(null);
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
