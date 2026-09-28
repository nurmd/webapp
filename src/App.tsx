import React, { useState, useEffect } from 'react';
import { db } from './services/db.ts';
import { CompanyProfile } from './models/company.ts';
import { Party } from './models/party.ts';
import { InventoryItem } from './models/item.ts';
import { Invoice } from './models/invoice.ts';
import { Voucher } from './core/accounting/voucherTypes.ts';
import { createSalesInvoiceVoucher } from './core/accounting/ledger.ts';

import { Navbar } from './components/Navbar.tsx';
import { Sidebar, NavTab } from './components/Sidebar.tsx';
import { DashboardView } from './components/Dashboard/DashboardView.tsx';
import { InvoiceListView } from './components/Invoicing/InvoiceListView.tsx';
import { CreateInvoiceModal } from './components/Invoicing/CreateInvoiceModal.tsx';
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
  const [vouchers, setVouchers] = useState<Voucher[]>(db.getVouchers());

  // Modals state
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  // Sync state on change
  const refreshData = () => {
    setCompany(db.getCompany());
    setParties(db.getParties());
    setItems(db.getItems());
    setInvoices(db.getInvoices());
    setVouchers(db.getVouchers());
  };

  const handleSaveInvoice = (newInvoice: Invoice) => {
    db.saveInvoice(newInvoice);

    // Auto-create Double-Entry Accounting Voucher
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
    setIsNewInvoiceOpen(false);
    setPreviewInvoice(newInvoice);
  };

  const handleDeleteInvoice = (id: string) => {
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      db.deleteInvoice(id);
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

  const handleSaveCompany = (updated: CompanyProfile) => {
    db.saveCompany(updated);
    refreshData();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Navbar */}
      <Navbar
        company={company}
        onNewInvoice={() => setIsNewInvoiceOpen(true)}
        onQuickPos={() => setActiveTab('pos')}
      />

      {/* Main Container */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Navigation Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* View Routing */}
        <main style={{ flex: 1, overflowY: 'auto', backgroundColor: '#0f172a' }}>
          {activeTab === 'dashboard' && (
            <DashboardView
              invoices={invoices}
              items={items}
              parties={parties}
              onNewInvoice={() => setIsNewInvoiceOpen(true)}
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

          {activeTab === 'invoices' && (
            <InvoiceListView
              invoices={invoices}
              onNewInvoice={() => setIsNewInvoiceOpen(true)}
              onViewInvoice={setPreviewInvoice}
              onDeleteInvoice={handleDeleteInvoice}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              items={items}
              onSaveItem={handleSaveItem}
              onDeleteItem={handleDeleteItem}
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
            <Gstr1View invoices={invoices} />
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
      {isNewInvoiceOpen && (
        <CreateInvoiceModal
          company={company}
          parties={parties}
          itemsCatalog={items}
          onClose={() => setIsNewInvoiceOpen(false)}
          onSave={handleSaveInvoice}
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
