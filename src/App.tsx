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
import { ExpensesView } from './components/Expenses/ExpensesView.tsx';
import { CreateInvoiceModal } from './components/Invoicing/CreateInvoiceModal.tsx';
import { TableGridInvoiceModal } from './components/Invoicing/TableGridInvoiceModal.tsx';
import { InvoicePreviewModal } from './components/Invoicing/InvoicePreviewModal.tsx';
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

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeUser, setActiveUser] = useState<UserProfile>(rbac.getActiveUser());
  const [isRoleSwitchOpen, setIsRoleSwitchOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

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
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

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

  React.useEffect(() => {
    // Listen for PouchDB data changes (local or synced from remote CouchDB)
    const unsub = pouch.subscribeDataChange(() => {
      refreshData();
    });
    return unsub;
  }, []);

  const handleSaveInvoice = (newInvoice: Invoice) => {
    db.saveInvoice(newInvoice);

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
    setIsTableGridInvoiceOpen(true);
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
    notes: string
  ) => {
    const isCustomer = party.type === 'CUSTOMER';
    const newBal = isCustomer
      ? party.currentBalance - amount
      : party.currentBalance + amount;

    const updatedParty: Party = {
      ...party,
      currentBalance: newBal,
      updatedAt: new Date().toISOString(),
    };
    db.saveParty(updatedParty);

    const docId = Date.now().toString().slice(-6);
    if (isCustomer) {
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
        onCheckUpdate={() => setIsUpdateModalOpen(true)}
      />

      {/* Main Scrollable View Area with safe-area padding */}
      <main className="flex-1 w-full pt-16 pb-20">
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
            onSaveParty={handleSaveParty}
            onDeleteParty={handleDeleteParty}
            onRecordPartyPayment={handleRecordPartyPayment}
            onViewInvoice={setPreviewInvoice}
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
            onCheckUpdate={() => setIsUpdateModalOpen(true)}
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
          onClose={() => {
            setIsTableGridInvoiceOpen(false);
            setEditingInvoice(null);
          }}
          onSave={handleSaveInvoice}
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
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
};
