import React, { useState, useMemo } from 'react';
import { ExternalLink, Layers, Eye, Smartphone, Monitor, Search } from 'lucide-react';

export type StitchCategory =
  | 'All'
  | 'Billing & POS'
  | 'Parties & Ledger'
  | 'Inventory & Items'
  | 'Purchases'
  | 'Banking & Payments'
  | 'Reports'
  | 'Settings & Compliance';

export interface StitchScreen {
  id: string;
  title: string;
  category: Exclude<StitchCategory, 'All'>;
  html: string;
  screenPng: string;
}

const STITCH_SCREENS: StitchScreen[] = [
  // --- Billing & POS ---
  {
    id: 'vyapar_dashboard',
    title: 'Vyapar Fintech Dashboard (Sales, Cashflow & Quick Actions)',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/vyapar_dashboard/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/vyapar_dashboard/screen.png',
  },
  {
    id: 'pos_billing_counter',
    title: 'Retail POS Billing Counter (Touch Catalog & Barcode)',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/pos_billing_counter/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/pos_billing_counter/screen.png',
  },
  {
    id: 'create_gst_invoice_1',
    title: 'Create GST Invoice (Standard Layout)',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_1/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_1/screen.png',
  },
  {
    id: 'create_gst_invoice_2',
    title: 'Create GST Invoice (Touch & Responsive Layout)',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_2/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_2/screen.png',
  },
  {
    id: 'create_invoice_table_view',
    title: 'Create Invoice (Desktop Table Grid Mode)',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_invoice_table_view/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_invoice_table_view/screen.png',
  },
  {
    id: 'create_gst_invoice_executive_dark',
    title: 'Create GST Invoice (Executive Dark Theme)',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_executive_dark/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_executive_dark/screen.png',
  },
  {
    id: 'create_gst_invoice_modern_retail_neo_brutalist',
    title: 'Create GST Invoice (Retail Neo-Brutalist Theme)',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_modern_retail_neo_brutalist/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_modern_retail_neo_brutalist/screen.png',
  },
  {
    id: 'sales_hub',
    title: 'Sales Hub (Quotations, Orders & Tax Invoices)',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/sales_hub/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/sales_hub/screen.png',
  },
  {
    id: 'interactive_sales_flow_prototype',
    title: 'Interactive Sales & Checkout Flow Prototype',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/interactive_sales_flow_prototype/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/interactive_sales_flow_prototype/screen.png',
  },
  {
    id: 'invoice_preview_share',
    title: 'Invoice Preview, WhatsApp & Thermal Print Share',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/invoice_preview_share/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/invoice_preview_share/screen.png',
  },
  {
    id: 'invoice_themes_printing',
    title: 'Invoice Themes & Thermal Receipt Customization',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/invoice_themes_printing/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/invoice_themes_printing/screen.png',
  },
  {
    id: 'delivery_challan_e_way_bill',
    title: 'Delivery Challan & E-Way Bill Generation',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/delivery_challan_e_way_bill/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/delivery_challan_e_way_bill/screen.png',
  },
  {
    id: 'prefix_invoice_numbering_series',
    title: 'Invoice Prefix & Auto-Numbering Series',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/prefix_invoice_numbering_series/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/prefix_invoice_numbering_series/screen.png',
  },
  {
    id: 'custom_fields_charges',
    title: 'Custom Charges, Delivery Fees & Line Notes',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/custom_fields_charges/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/custom_fields_charges/screen.png',
  },
  {
    id: 'discounts_pricing_rules',
    title: 'Discounts & Tiered Wholesale Pricing Rules',
    category: 'Billing & POS',
    html: '/stitch/stitch_vyapar_billing_app_redesign/discounts_pricing_rules/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/discounts_pricing_rules/screen.png',
  },

  // --- Parties & Ledger ---
  {
    id: 'select_customer_party',
    title: 'Select Customer / Party Modal',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/select_customer_party/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/select_customer_party/screen.png',
  },
  {
    id: 'parties_ledger_simplified',
    title: 'Parties Ledger (Simplified Material 3)',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/parties_ledger_simplified/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/parties_ledger_simplified/screen.png',
  },
  {
    id: 'parties_ledger',
    title: 'Parties Ledger (Classic Outstanding Directory)',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/parties_ledger/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/parties_ledger/screen.png',
  },
  {
    id: 'add_new_party',
    title: 'Add New Customer / Supplier (GSTIN & Address)',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/add_new_party/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/add_new_party/screen.png',
  },
  {
    id: 'edit_party_ledger',
    title: 'Edit Party Profile & Opening Balances',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/edit_party_ledger/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/edit_party_ledger/screen.png',
  },
  {
    id: 'party_ledger_statement',
    title: 'Party Ledger Statement & Running Balance Passbook',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/party_ledger_statement/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/party_ledger_statement/screen.png',
  },
  {
    id: 'suppliers_vendors_simplified',
    title: 'Suppliers & Vendors (Simplified Material 3)',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/suppliers_vendors_simplified/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/suppliers_vendors_simplified/screen.png',
  },
  {
    id: 'suppliers_vendors',
    title: 'Suppliers & Vendors (Classic Directory)',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/suppliers_vendors/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/suppliers_vendors/screen.png',
  },
  {
    id: 'payment_reminders_follow_up',
    title: 'Payment Reminders & WhatsApp Follow-up Hub',
    category: 'Parties & Ledger',
    html: '/stitch/stitch_vyapar_billing_app_redesign/payment_reminders_follow_up/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/payment_reminders_follow_up/screen.png',
  },

  // --- Inventory & Items ---
  {
    id: 'inventory_stock_simplified',
    title: 'Inventory & Stock Valuation (Simplified Material 3)',
    category: 'Inventory & Items',
    html: '/stitch/stitch_vyapar_billing_app_redesign/inventory_stock_simplified/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/inventory_stock_simplified/screen.png',
  },
  {
    id: 'inventory_stock',
    title: 'Inventory & Stock Catalog (Classic Mode)',
    category: 'Inventory & Items',
    html: '/stitch/stitch_vyapar_billing_app_redesign/inventory_stock/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/inventory_stock/screen.png',
  },
  {
    id: 'add_inventory_item',
    title: 'Add New Inventory Item (HSN, Barcode & Tax Slabs)',
    category: 'Inventory & Items',
    html: '/stitch/stitch_vyapar_billing_app_redesign/add_inventory_item/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/add_inventory_item/screen.png',
  },
  {
    id: 'edit_inventory_item',
    title: 'Edit Inventory Item, Price & Tax Master',
    category: 'Inventory & Items',
    html: '/stitch/stitch_vyapar_billing_app_redesign/edit_inventory_item/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/edit_inventory_item/screen.png',
  },
  {
    id: 'item_details_stock_history',
    title: 'Item Details & Stock In/Out Adjustment Ledger',
    category: 'Inventory & Items',
    html: '/stitch/stitch_vyapar_billing_app_redesign/item_details_stock_history/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/item_details_stock_history/screen.png',
  },
  {
    id: 'item_inventory_settings',
    title: 'Inventory Low-Stock Alerts & Barcode Configuration',
    category: 'Inventory & Items',
    html: '/stitch/stitch_vyapar_billing_app_redesign/item_inventory_settings/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/item_inventory_settings/screen.png',
  },

  // --- Purchases ---
  {
    id: 'purchases_hub_simplified',
    title: 'Purchases Hub (Simplified Material 3 & ITC Breakdown)',
    category: 'Purchases',
    html: '/stitch/stitch_vyapar_billing_app_redesign/purchases_hub_simplified/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/purchases_hub_simplified/screen.png',
  },
  {
    id: 'purchases_hub',
    title: 'Purchases Hub (Classic Bills & Vendor Orders)',
    category: 'Purchases',
    html: '/stitch/stitch_vyapar_billing_app_redesign/purchases_hub/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/purchases_hub/screen.png',
  },
  {
    id: 'create_purchase_bill',
    title: 'Create Inward Purchase Bill (ITC Claim Master)',
    category: 'Purchases',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_purchase_bill/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_purchase_bill/screen.png',
  },
  {
    id: 'interactive_purchases_vendor_payment_prototype',
    title: 'Interactive Purchases & Vendor Settlement Flow',
    category: 'Purchases',
    html: '/stitch/stitch_vyapar_billing_app_redesign/interactive_purchases_vendor_payment_prototype/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/interactive_purchases_vendor_payment_prototype/screen.png',
  },

  // --- Banking & Payments ---
  {
    id: 'record_payment_in',
    title: 'Record Payment In (Customer Receipt Voucher)',
    category: 'Banking & Payments',
    html: '/stitch/stitch_vyapar_billing_app_redesign/record_payment_in/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/record_payment_in/screen.png',
  },
  {
    id: 'record_payment_out',
    title: 'Record Payment Out (Supplier Payment Voucher)',
    category: 'Banking & Payments',
    html: '/stitch/stitch_vyapar_billing_app_redesign/record_payment_out/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/record_payment_out/screen.png',
  },
  {
    id: 'record_payment_in_out',
    title: 'Payment In / Out Dual Cashflow Register',
    category: 'Banking & Payments',
    html: '/stitch/stitch_vyapar_billing_app_redesign/record_payment_in_out/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/record_payment_in_out/screen.png',
  },
  {
    id: 'bank_accounts_upi',
    title: 'Bank Accounts & Dynamic QR Code Hub',
    category: 'Banking & Payments',
    html: '/stitch/stitch_vyapar_billing_app_redesign/bank_accounts_upi/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/bank_accounts_upi/screen.png',
  },
  {
    id: 'add_bank_account',
    title: 'Add Bank Account & UPI VPA Details',
    category: 'Banking & Payments',
    html: '/stitch/stitch_vyapar_billing_app_redesign/add_bank_account/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/add_bank_account/screen.png',
  },
  {
    id: 'cash_balance_cash_in_hand',
    title: 'Cash In Hand & Counter Drawer Register',
    category: 'Banking & Payments',
    html: '/stitch/stitch_vyapar_billing_app_redesign/cash_balance_cash_in_hand/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/cash_balance_cash_in_hand/screen.png',
  },
  {
    id: 'auto_reconciliation_settings',
    title: 'Bank Statement Auto-Reconciliation Settings',
    category: 'Banking & Payments',
    html: '/stitch/stitch_vyapar_billing_app_redesign/auto_reconciliation_settings/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/auto_reconciliation_settings/screen.png',
  },

  // --- Reports ---
  {
    id: 'business_reports',
    title: 'Business Reports & GSTR-1 / GSTR-3B Tax Analytics',
    category: 'Reports',
    html: '/stitch/stitch_vyapar_billing_app_redesign/business_reports/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/business_reports/screen.png',
  },

  // --- Settings & Compliance ---
  {
    id: 'navigation_menu_hub',
    title: 'Navigation Menu & Module Architecture Hub',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/navigation_menu_hub/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/navigation_menu_hub/screen.png',
  },
  {
    id: 'business_settings_profile',
    title: 'Business Settings & Profile Hub',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/business_settings_profile/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/business_settings_profile/screen.png',
  },
  {
    id: 'business_profile_identity_edit',
    title: 'Edit Business Identity, Brand Logo & Signature',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/business_profile_identity_edit/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/business_profile_identity_edit/screen.png',
  },
  {
    id: 'gst_tax_settings',
    title: 'GST Tax Slabs, Composition & Reverse Charge Rules',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/gst_tax_settings/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/gst_tax_settings/screen.png',
  },
  {
    id: 'state_place_of_supply',
    title: 'Place of Supply & State Rule Master',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/state_place_of_supply/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/state_place_of_supply/screen.png',
  },
  {
    id: 'e_way_bill_e_invoice_api',
    title: 'NIC E-Way Bill & E-Invoice Portal Credentials',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/e_way_bill_e_invoice_api/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/e_way_bill_e_invoice_api/screen.png',
  },
  {
    id: 'auto_backup_data_sync',
    title: 'Cloud & Multi-Counter Sync (CouchDB Engine)',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/auto_backup_data_sync/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/auto_backup_data_sync/screen.png',
  },
  {
    id: 'staff_roles_permissions',
    title: 'Staff Roles & 4-Digit PIN Security Permissions',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/staff_roles_permissions/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/staff_roles_permissions/screen.png',
  },
  {
    id: 'app_security_biometric_lock',
    title: 'App Security, Passcode & Biometric Authentication',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/app_security_biometric_lock/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/app_security_biometric_lock/screen.png',
  },
  {
    id: 'automated_whatsapp_sms_alerts',
    title: 'Automated WhatsApp & SMS Messaging Settings',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/automated_whatsapp_sms_alerts/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/automated_whatsapp_sms_alerts/screen.png',
  },
  {
    id: 'app_language_regional_preferences',
    title: 'Regional Language & Vernacular Preferences (English, Hindi)',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/app_language_regional_preferences/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/app_language_regional_preferences/screen.png',
  },
  {
    id: 'vyapar_modern_logo',
    title: 'Brand Vector Graphics & Icon Assets',
    category: 'Settings & Compliance',
    html: '/stitch/stitch_vyapar_billing_app_redesign/vyapar_modern_logo/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/vyapar_modern_logo/screen.png',
  },
];

const CATEGORIES: StitchCategory[] = [
  'All',
  'Billing & POS',
  'Parties & Ledger',
  'Inventory & Items',
  'Purchases',
  'Banking & Payments',
  'Reports',
  'Settings & Compliance',
];

export const StitchShowcaseView: React.FC = () => {
  const [selectedScreen, setSelectedScreen] = useState<StitchScreen>(STITCH_SCREENS[0]);
  const [activeCategory, setActiveCategory] = useState<StitchCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'IFRAME' | 'IMAGE'>('IFRAME');

  const filteredScreens = useMemo(() => {
    return STITCH_SCREENS.filter((screen) => {
      const matchesCategory = activeCategory === 'All' || screen.category === activeCategory;
      const matchesSearch =
        screen.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        screen.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      {/* Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        padding: '1.25rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Linked Stitch Project: Vyapar Modern Fintech
            </h2>
            <span style={{ backgroundColor: '#064e3b', color: '#6ee7b7', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
              ● Synchronized ({STITCH_SCREENS.length} Screens)
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Project ID: <code style={{ color: '#60a5fa' }}>5973526274439406288</code> • Full Production Architecture &amp; UI Systems
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setViewMode(viewMode === 'IFRAME' ? 'IMAGE' : 'IFRAME')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: '#0f172a',
              color: '#fff',
              border: '1px solid #334155',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            {viewMode === 'IFRAME' ? <Eye size={15} /> : <Monitor size={15} />}
            {viewMode === 'IFRAME' ? 'Show Design Screenshot' : 'Show Interactive HTML'}
          </button>

          <a
            href="https://stitch.withgoogle.com/projects/5973526274439406288?pli=1"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              textDecoration: 'none',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            <ExternalLink size={15} /> Open in Stitch
          </a>
        </div>
      </div>

      {/* Category Pills & Search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '4px' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: activeCategory === cat ? '#3b82f6' : '#334155',
                backgroundColor: activeCategory === cat ? '#1d4ed8' : '#0f172a',
                color: activeCategory === cat ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search screens by name or ID (e.g. pos, ledger, payment)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '0.45rem 0.75rem 0.45rem 2rem',
              fontSize: '0.8rem',
              color: '#f8fafc',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Main Showcase Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', flex: 1, minHeight: '650px' }}>
        {/* Screens Sidebar Picker */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          border: '1px solid #334155',
          overflowY: 'auto',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          maxHeight: '750px',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', padding: '0.25rem 0.5rem' }}>
            Screens ({filteredScreens.length})
          </div>

          {filteredScreens.map((screen) => {
            const isSelected = selectedScreen.id === screen.id;
            return (
              <button
                key={screen.id}
                onClick={() => setSelectedScreen(screen)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.2rem',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                  backgroundColor: isSelected ? '#1e3a8a' : '#0f172a',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%' }}>
                  <Layers size={14} style={{ color: isSelected ? '#60a5fa' : '#64748b', flexShrink: 0 }} />
                  <span style={{ fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {screen.title}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.7rem', color: '#64748b' }}>
                  <span>{screen.category}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Viewport Area */}
        <div style={{
          backgroundColor: '#0f172a',
          borderRadius: '8px',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Viewport Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #334155',
            backgroundColor: '#1e293b',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                {selectedScreen.title}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                ({selectedScreen.id})
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a
                href={selectedScreen.html}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  color: '#60a5fa',
                  fontSize: '0.75rem',
                  textDecoration: 'none',
                }}
              >
                <ExternalLink size={13} /> Fullscreen
              </a>
            </div>
          </div>

          {/* Viewport Body */}
          <div style={{ flex: 1, backgroundColor: '#020617', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'auto' }}>
            {viewMode === 'IFRAME' ? (
              <iframe
                title={selectedScreen.title}
                src={selectedScreen.html}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: '650px',
                  border: 'none',
                  backgroundColor: '#ffffff',
                }}
              />
            ) : (
              <img
                src={selectedScreen.screenPng}
                alt={selectedScreen.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
