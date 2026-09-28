import React, { useState } from 'react';
import { db } from './services/db.ts';
import { CompanyProfile } from './models/company.ts';
import { Party } from './models/party.ts';
import { InventoryItem, StockAdjustment } from './models/item.ts';
import { Invoice } from './models/invoice.ts';
import { PurchaseBill } from './models/purchase.ts';
import { Voucher } from './core/accounting/voucherTypes.ts';
import { createSalesInvoiceVoucher, createPurchaseInvoiceVoucher } from './core/accounting/ledger.ts';

import { Navbar } from './components/Navbar.tsx';
import { Sidebar, NavTab } from './components/Sidebar.tsx';
import { DashboardView } from './components/Dashboard/DashboardView.tsx';
import { SalesHubView } from './components/Sales/SalesHubView.tsx';
import { PurchasesHubView } from './components/Purchases/PurchasesHubView.tsx';
import { CreateInvoiceModal } from './components/Invoicing/CreateInvoiceModal.tsx';
import { TableGridInvoiceModal } from './components/Invoicing/TableGridInvoiceModal.tsx';
import { InvoicePreviewModal } from './components/Invoicing/InvoicePreviewModal.tsx';
import { QuickBillingView } from './components/POS/QuickBillingView.tsx';
import { InventoryView } from './components/Inventory/InventoryView.tsx';
import { PartiesView } from './components/Parties/PartiesView.tsx';
import { Gstr1View } from './components/Reports/Gstr1View.tsx';
import { DaybookView } from './components/Reports/DaybookView.tsx';
import { CompanySettingsView } from './components/Settings/CompanySettingsView.tsx';
import { StitchShowcaseView } from './components/StitchShowcase/StitchShowcaseView.tsx';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [company, setCompany] = useState<CompanyProfile>(db.getCompany());
  const [parties, setParties] = useState<Party[]>(db.getParties());
  const [items, setItems] = useState<InventoryItem[]>(db.getItems());
  const [invoices, setInvoices] = useState<Invoice[]>(db.getInvoices());
  const [purchases, setPurchases] = useState<PurchaseBill[]>(db.getPurchases());
  const [vouchers, setVouchers] = useState<Voucher[]>(db.getVouchers());

  // Modals state
  const [isStandardInvoiceOpen, setIsStandardInvoiceOpen] = useState(false);
  const [isTableGridInvoiceOpen, setIsTableGridInvoiceOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  // Sync state on change
  const refreshData = () => {
    setCompany(db.getCompany());
    setParties(db.getParties());
    setItems(db.getItems());
    setInvoices(db.getInvoices());
    setPurchases(db.getPurchases());
    setVouchers(db.getVouchers());
  };

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
    setPreviewInvoice(newInvoice);
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

  const handleSaveParty = (party: Party) => {
    db.saveParty(party);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Navbar */}
      <Navbar
        company={company}
        onNewInvoice={() => setIsTableGridInvoiceOpen(true)}
        onQuickPos={() => setActiveTab('pos')}
      />

      {/* Main Container */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Navigation Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* View Routing */}
        <main style={{ flex: 1, overflowY: 'auto', backgroundColor: '#0a0f1d' }}>
          {activeTab === 'dashboard' && (
            <DashboardView
              invoices={invoices}
              items={items}
              parties={parties}
              onNewInvoice={() => setIsTableGridInvoiceOpen(true)}
              onQuickPos={() => setActiveTab('pos')}
              onViewInvoice={setPreviewInvoice}
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
              invoices={invoices}
              onOpenStandardInvoice={() => setIsStandardInvoiceOpen(true)}
              onOpenTableGridInvoice={() => setIsTableGridInvoiceOpen(true)}
              onViewInvoice={setPreviewInvoice}
              onDeleteInvoice={handleDeleteInvoice}
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

          {activeTab === 'inventory' && (
            <InventoryView
              items={items}
              onSaveItem={handleSaveItem}
              onDeleteItem={handleDeleteItem}
              onSaveAdjustment={handleSaveAdjustment}
            />
          )}

          {activeTab === 'parties' && (
            <PartiesView
              parties={parties}
              onSaveParty={handleSaveParty}
              onDeleteParty={handleDeleteParty}
            />
          )}

          {activeTab === 'accounting' && (
            <DaybookView vouchers={vouchers} />
          )}

          {activeTab === 'reports' && (
            <Gstr1View invoices={invoices} purchases={purchases} />
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
        </main>
      </div>

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
          onClose={() => setIsTableGridInvoiceOpen(false)}
          onSave={handleSaveInvoice}
          onAddNewParty={() => setActiveTab('parties')}
        />
      )}

      {previewInvoice && (
        <InvoicePreviewModal
          invoice={previewInvoice}
          company={company}
          onClose={() => setPreviewInvoice(null)}
        />
      )}
    </div>
  );
};
