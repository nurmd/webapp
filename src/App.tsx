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

import { DashboardView } from './components/Dashboard/DashboardView.tsx';
import { SalesHubView } from './components/Sales/SalesHubView.tsx';
import { PurchasesHubView } from './components/Purchases/PurchasesHubView.tsx';
import { TableGridPurchaseModal } from './components/Purchases/TableGridPurchaseModal.tsx';
import { ExpensesView } from './components/Expenses/ExpensesView.tsx';
import { CreateInvoiceModal } from './components/Invoicing/CreateInvoiceModal.tsx';
import { TableGridInvoiceModal } from './components/Invoicing/TableGridInvoiceModal.tsx';
import { InvoicePreviewModal } from './components/Invoicing/InvoicePreviewModal.tsx';
import { findConflictingInvoice } from './core/utils/invoiceNumber.ts';
import { QuickBillingView } from './components/POS/QuickBillingView.tsx';
import { InventoryView } from './components/Inventory/InventoryView.tsx';
import { PartiesView } from './components/Parties/PartiesView.tsx';
import { BusinessReportsView } from './components/Reports/BusinessReportsView.tsx';
import { DaybookView } from './components/Reports/DaybookView.tsx';
import { CompanySettingsView } from './components/Settings/CompanySettingsView.tsx';
import { StitchShowcaseView } from './components/StitchShowcase/StitchShowcaseView.tsx';
import { NavigationMenuHubView } from './components/Navigation/NavigationMenuHubView.tsx';
import { rbac, UserProfile } from './services/rbac.ts';
import { RoleSwitchModal } from './components/Auth/RoleSwitchModal.tsx';
import { AppUpdateModal } from './components/Update/AppUpdateModal.tsx';
import { updateService, AppReleaseInfo, CURRENT_APP_VERSION } from './services/updateService.ts';
import { initBackNavigation, useBackNavigation } from './core/utils/backNavigation.ts';

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

  // Modals state
  const [isStandardInvoiceOpen, setIsStandardInvoiceOpen] = useState(false);
  const [isTableGridInvoiceOpen, setIsTableGridInvoiceOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [selectedPartyForInvoice, setSelectedPartyForInvoice] = useState<Party | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [isTableGridPurchaseOpen, setIsTableGridPurchaseOpen] = useState(false);
  const [selectedSupplierForPurchase, setSelectedSupplierForPurchase] = useState<Party | null>(null);

  // Sync state on change
  const refreshData = () => {
    setCompany(db.getCompany());
    setParties(db.getParties());
    setItems(db.getItems());
    setInvoices(db.getInvoices());
    setPurchases(db.getPurchases());
    setExpenses(db.getExpenses());
    setVouchers(db.getVouchers());
  };

  const activeTabRef = React.useRef(activeTab);
  activeTabRef.current = activeTab;

  React.useEffect(() => {
    initBackNavigation(() => {
      if (activeTabRef.current !== 'dashboard') {
        setActiveTab('dashboard');
      }
    });
  }, []);

  // System Back Navigation for Modals and Tabs
  useBackNavigation(() => {
    setIsDrawerOpen(false);
    return true;
  }, isDrawerOpen);

  useBackNavigation(() => {
    setIsStandardInvoiceOpen(false);
    return true;
  }, isStandardInvoiceOpen);

  useBackNavigation(() => {
    setIsTableGridInvoiceOpen(false);
    setEditingInvoice(null);
    return true;
  }, isTableGridInvoiceOpen);

  useBackNavigation(() => {
    setIsTableGridPurchaseOpen(false);
    setSelectedSupplierForPurchase(null);
    return true;
  }, isTableGridPurchaseOpen);

  useBackNavigation(() => {
    setPreviewInvoice(null);
    return true;
  }, !!previewInvoice);

  useBackNavigation(() => {
    setIsRoleSwitchOpen(false);
    return true;
  }, isRoleSwitchOpen);

  useBackNavigation(() => {
    setIsUpdateModalOpen(false);
    return true;
  }, isUpdateModalOpen);

  useBackNavigation(() => {
    if (activeTab !== 'dashboard') {
      setActiveTab('dashboard');
      return true;
    }
  }, activeTab !== 'dashboard');

  React.useEffect(() => {
    // Listen for PouchDB data changes (local or synced from remote CouchDB)
    const unsub = pouch.subscribeDataChange(() => {
      refreshData();
    });
    return unsub;
  }, []);

  // Background silent OTA update check on mount
  React.useEffect(() => {
    updateService
      .checkForUpdates()
      .then((res) => {
        if (res.hasUpdate && res.latestRelease) {
          setHasUpdate(true);
          setLatestRelease(res.latestRelease);
        }
      })
      .catch(() => {});
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

  const handleSaveInvoice = (newInvoice: Invoice) => {
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
    setIsStandardInvoiceOpen(false);
    setIsTableGridInvoiceOpen(false);
    setEditingInvoice(null);
    setPreviewInvoice(newInvoice);
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
    setSelectedSupplierForPurchase(party);
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

    refreshData();
  };

  const handleDeleteInvoice = (id: string) => {
    if (!rbac.canDeleteInvoice(activeUser.role)) {
      alert('Permission Denied: Only Business Owners can delete invoices. Please switch user role.');
      setIsRoleSwitchOpen(true);
      return;
    }
    if (window.confirm('Delete this invoice?')) {
      db.deleteInvoice(id);
      refreshData();
    }
  };

  const handleDeletePurchase = (id: string) => {
    if (window.confirm('Delete this purchase bill?')) {
      db.deletePurchase(id);
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
      // Create Double-Entry Payment Out Voucher
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
    }

    refreshData();
  };

  const handleDeleteParty = (id: string) => {
    if (window.confirm('Delete this party?')) {
      db.deleteParty(id);
      refreshData();
    }
  };

  const handleSaveItem = (item: InventoryItem) => {
    db.saveItem(item);
    refreshData();
  };

  const handleDeleteItem = (id: string) => {
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

  const handleSelectTab = (tab: AppTab) => {
    if (!rbac.canAccessTab(tab, activeUser.role)) {
      setIsRoleSwitchOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col selection:bg-secondary-fixed selection:text-on-secondary-fixed">
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

      {/* Slide-out Navigation Drawer */}
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
      <main className="flex-1 w-full pb-24">
        {activeTab === 'dashboard' && (
          <DashboardView
            company={company}
            invoices={invoices}
            items={items}
            parties={parties}
            onNewInvoice={() => {
              setEditingInvoice(null);
              setIsTableGridInvoiceOpen(true);
            }}
            onQuickPos={() => setActiveTab('pos')}
            onViewInvoice={setPreviewInvoice}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'pos' && (
          <QuickBillingView
            company={company}
            items={items}
            onCompleteSale={handleSaveInvoice}
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
            itemsCatalog={items}
            onSavePurchase={handleSavePurchase}
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
          />
        )}

        {activeTab === 'parties' && (
          <PartiesView
            parties={parties}
            invoices={invoices}
            purchases={purchases}
            vouchers={vouchers}
            onSaveParty={handleSaveParty}
            onDeleteParty={handleDeleteParty}
            onRecordPartyPayment={handleRecordPartyPayment}
            onViewInvoice={setPreviewInvoice}
            onEditInvoice={handleEditInvoice}
            onCreateInvoice={handleCreateInvoiceForParty}
            onCreatePurchase={handleCreatePurchaseForParty}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'accounting' && (
          <DaybookView vouchers={vouchers} />
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

        {activeTab === 'stitch' && (
          <StitchShowcaseView />
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
          itemsCatalog={items}
          onClose={() => setIsStandardInvoiceOpen(false)}
          onSave={handleSaveInvoice}
        />
      )}

      {isTableGridInvoiceOpen && (
        <TableGridInvoiceModal
          company={company}
          parties={parties}
          itemsCatalog={items}
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
        />
      )}

      {isTableGridPurchaseOpen && (
        <TableGridPurchaseModal
          company={company}
          parties={parties}
          itemsCatalog={items}
          initialSupplier={selectedSupplierForPurchase}
          onClose={() => {
            setIsTableGridPurchaseOpen(false);
            setSelectedSupplierForPurchase(null);
          }}
          onSave={(bill) => {
            handleSavePurchase(bill);
            setIsTableGridPurchaseOpen(false);
            setSelectedSupplierForPurchase(null);
          }}
          onAddNewParty={() => setActiveTab('parties')}
        />
      )}

      {previewInvoice && (
        <InvoicePreviewModal
          invoice={previewInvoice}
          company={company}
          onClose={() => setPreviewInvoice(null)}
          onEditInvoice={handleEditInvoice}
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
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl border border-white/10 flex items-center gap-2 max-w-[90vw] animate-bounce-once">
          <span className="material-symbols-outlined text-[18px] text-secondary">info</span>
          <span className="truncate">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
