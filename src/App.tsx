import React, { useState } from 'react';
import { db } from './services/db.ts';
import { pouch } from './services/pouchdb.ts';
import { CompanyProfile } from './models/company.ts';
import { Party } from './models/party.ts';
import { InventoryItem, StockAdjustment } from './models/item.ts';
import { Invoice } from './models/invoice.ts';
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

import { DashboardView } from './components/Dashboard/DashboardView.tsx';
import { SalesHubView } from './components/Sales/SalesHubView.tsx';
import { PurchasesHubView } from './components/Purchases/PurchasesHubView.tsx';
import { TableGridPurchaseModal } from './components/Purchases/TableGridPurchaseModal.tsx';
import { ExpensesView } from './components/Expenses/ExpensesView.tsx';
import { CreateInvoiceModal } from './components/Invoicing/CreateInvoiceModal.tsx';
import { TableGridInvoiceModal } from './components/Invoicing/TableGridInvoiceModal.tsx';
import { InvoicePreviewModal } from './components/Invoicing/InvoicePreviewModal.tsx';
import { SimplifiedInvoiceModal } from './components/Invoicing/SimplifiedInvoiceModal.tsx';
import { findConflictingInvoice } from './core/utils/invoiceNumber.ts';
import { QuickBillingView } from './components/POS/QuickBillingView.tsx';
import { InventoryView } from './components/Inventory/InventoryView.tsx';
import { PartiesView } from './components/Parties/PartiesView.tsx';
import { BusinessReportsView } from './components/Reports/BusinessReportsView.tsx';
import { DaybookView } from './components/Reports/DaybookView.tsx';
import { CashBankManagementView } from './components/CashBank/CashBankManagementView.tsx';
import { BankAccount, CashBankTransaction } from './models/bankAccount.ts';
import { CompanySettingsView } from './components/Settings/CompanySettingsView.tsx';
import { NavigationMenuHubView } from './components/Navigation/NavigationMenuHubView.tsx';
import { rbac, UserProfile } from './services/rbac.ts';
import { RoleSwitchModal } from './components/Auth/RoleSwitchModal.tsx';
import { AppUpdateModal } from './components/Update/AppUpdateModal.tsx';
import { updateService, AppReleaseInfo, CURRENT_APP_VERSION } from './services/updateService.ts';
import { initBackNavigation, useBackNavigation } from './core/utils/backNavigation.ts';
import { isItemInBills, getActiveItems } from './core/utils/itemStatus.ts';

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
  const [fullA4Invoice, setFullA4Invoice] = useState<Invoice | null>(null);
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
    setFullA4Invoice(null);
    return true;
  }, !!fullA4Invoice, 25);

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
    paymentType?: 'IN' | 'OUT'
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
      // 1. Create Double-Entry Receipt Voucher
      const voucher = createPaymentReceiptVoucher({
        receiptNumber: `RCPT-${docId}`,
        date: new Date().toISOString().split('T')[0],
        customerName: party.name,
        customerId: party.id,
        amount,
        paymentMode,
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
        const updatedInv: Invoice = {
          ...inv,
          paidAmount: newPaid,
          balanceAmount: Math.max(0, newBalInv),
          paymentStatus: newBalInv <= 0.01 ? 'PAID' : 'PARTIAL',
          updatedAt: new Date().toISOString(),
        };
        db.saveInvoice(updatedInv);
        remaining -= settleAmt;
      }
    } else {
      // 1. Create Double-Entry Payment Out Voucher
      const voucher = createPaymentOutVoucher({
        voucherNumber: `PYMT-${docId}`,
        date: new Date().toISOString().split('T')[0],
        supplierName: party.name,
        supplierId: party.id,
        amount,
        paymentMode,
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
        const updatedPur: PurchaseBill = {
          ...pur,
          paidAmount: newPaid,
          balanceAmount: Math.max(0, newBalPur),
          paymentStatus: newBalPur <= 0.01 ? 'PAID' : 'PARTIAL',
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
    db.saveCompany(updated);
    refreshData();
  };

  const handleSaveBankAccount = (account: BankAccount) => {
    db.saveBankAccount(account);
    refreshData();
  };

  const handleDeleteBankAccount = (id: string) => {
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
            onViewInvoice={setFullA4Invoice}
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
        <CreateInvoiceModal
          company={company}
          parties={parties}
          itemsCatalog={activeItems}
          onClose={() => setIsStandardInvoiceOpen(false)}
          onSave={handleSaveInvoice}
        />
      )}

      {isTableGridInvoiceOpen && (
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
      )}

      {isTableGridPurchaseOpen && (
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
      )}

      {/* Simplified Mobile Invoice Preview Modal (Home transactions, Invoice Save, etc.) */}
      {previewInvoice && (
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
          onOpenFullA4Preview={(inv) => {
            setPreviewInvoice(null);
            setFullA4Invoice(inv);
          }}
        />
      )}

      {/* Full A4 / Thermal Document Preview & Print Modal */}
      {fullA4Invoice && (
        <InvoicePreviewModal
          invoice={fullA4Invoice}
          company={company}
          onClose={() => setFullA4Invoice(null)}
          onEditInvoice={(inv) => {
            setFullA4Invoice(null);
            handleEditInvoice(inv);
          }}
        />
      )}

      {/* 4-Digit PIN Security Role Switch Modal */}
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

      {/* App Auto-Update Modal */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        releaseInfo={latestRelease}
        onClose={() => setIsUpdateModalOpen(false)}
      />

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
