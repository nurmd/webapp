import React, { useState } from 'react';
import { ExternalLink, Layers, Eye, Smartphone, Monitor, Palette } from 'lucide-react';

interface StitchScreen {
  id: string;
  title: string;
  html: string;
  screenPng: string;
}

const STITCH_SCREENS: StitchScreen[] = [
  {
    id: 'vyapar_dashboard',
    title: 'Vyapar Dashboard (Sales, Cashflow & Quick Actions)',
    html: '/stitch/stitch_vyapar_billing_app_redesign/vyapar_dashboard/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/vyapar_dashboard/screen.png',
  },
  {
    id: 'create_gst_invoice_1',
    title: 'Create GST Invoice (Standard Layout)',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_1/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_1/screen.png',
  },
  {
    id: 'create_invoice_table_view',
    title: 'Create Invoice (Table Grid Mode)',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_invoice_table_view/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_invoice_table_view/screen.png',
  },
  {
    id: 'create_gst_invoice_executive_dark',
    title: 'Create GST Invoice (Executive Dark Theme)',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_executive_dark/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_executive_dark/screen.png',
  },
  {
    id: 'create_gst_invoice_modern_retail_neo_brutalist',
    title: 'Create GST Invoice (Retail Neo-Brutalist)',
    html: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_modern_retail_neo_brutalist/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/create_gst_invoice_modern_retail_neo_brutalist/screen.png',
  },
  {
    id: 'select_customer_party',
    title: 'Select Customer / Party Modal',
    html: '/stitch/stitch_vyapar_billing_app_redesign/select_customer_party/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/select_customer_party/screen.png',
  },
  {
    id: 'parties_ledger',
    title: 'Parties Ledger (Customers & Outstanding)',
    html: '/stitch/stitch_vyapar_billing_app_redesign/parties_ledger/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/parties_ledger/screen.png',
  },
  {
    id: 'inventory_stock',
    title: 'Inventory & Stock Catalog',
    html: '/stitch/stitch_vyapar_billing_app_redesign/inventory_stock/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/inventory_stock/screen.png',
  },
  {
    id: 'sales_hub',
    title: 'Sales Hub (Quotations, Orders, Invoices)',
    html: '/stitch/stitch_vyapar_billing_app_redesign/sales_hub/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/sales_hub/screen.png',
  },
  {
    id: 'purchases_hub',
    title: 'Purchases Hub (Purchase Bills & POs)',
    html: '/stitch/stitch_vyapar_billing_app_redesign/purchases_hub/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/purchases_hub/screen.png',
  },
  {
    id: 'suppliers_vendors',
    title: 'Suppliers & Vendors Directory',
    html: '/stitch/stitch_vyapar_billing_app_redesign/suppliers_vendors/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/suppliers_vendors/screen.png',
  },
  {
    id: 'business_reports',
    title: 'Business Reports & GSTR Analytics',
    html: '/stitch/stitch_vyapar_billing_app_redesign/business_reports/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/business_reports/screen.png',
  },
  {
    id: 'navigation_menu_hub',
    title: 'Navigation & More Hub',
    html: '/stitch/stitch_vyapar_billing_app_redesign/navigation_menu_hub/code.html',
    screenPng: '/stitch/stitch_vyapar_billing_app_redesign/navigation_menu_hub/screen.png',
  },
];

export const StitchShowcaseView: React.FC = () => {
  const [selectedScreen, setSelectedScreen] = useState<StitchScreen>(STITCH_SCREENS[0]);
  const [viewMode, setViewMode] = useState<'IFRAME' | 'IMAGE'>('IFRAME');

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
      {/* Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        padding: '1.25rem',
        borderRadius: '8px',
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
              ● Synchronized
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Project ID: <code style={{ color: '#60a5fa' }}>5973526274439406288</code> • 13 Interactive Screens Linked
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
            {viewMode === 'IFRAME' ? 'Show Mockup Screenshot' : 'Show Interactive HTML'}
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
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', padding: '0.5rem' }}>
            Stitch Screens ({STITCH_SCREENS.length})
          </div>

          {STITCH_SCREENS.map((screen) => {
            const isSelected = selectedScreen.id === screen.id;
            return (
              <button
                key={screen.id}
                onClick={() => setSelectedScreen(screen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                  backgroundColor: isSelected ? '#1e3a8a' : '#0f172a',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  textAlign: 'left',
                  fontWeight: isSelected ? 600 : 400,
                  transition: 'background-color 0.15s',
                }}
              >
                <Layers size={15} color={isSelected ? '#60a5fa' : '#64748b'} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {screen.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Screen Preview Container */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Preview Toolbar */}
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #334155',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
              {selectedScreen.title}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {viewMode === 'IFRAME' ? 'Live Interactive Preview' : 'Stitch Canvas Export'}
            </span>
          </div>

          {/* Viewer Frame */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#090d16', padding: '1rem', overflow: 'auto' }}>
            {viewMode === 'IFRAME' ? (
              <iframe
                title={selectedScreen.title}
                src={selectedScreen.html}
                style={{
                  width: '100%',
                  maxWidth: '430px',
                  height: '750px',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                }}
              />
            ) : (
              <img
                src={selectedScreen.screenPng}
                alt={selectedScreen.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '750px',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
