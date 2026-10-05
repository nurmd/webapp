import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  ShoppingCart,
  Package,
  Users,
  BookOpen,
  FileSpreadsheet,
  Settings,
  Layers,
  ShoppingBag,
  Wallet,
} from 'lucide-react';

import { db } from '../services/db.ts';

export type NavTab =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'purchases'
  | 'expenses'
  | 'inventory'
  | 'parties'
  | 'accounting'
  | 'reports'
  | 'stitch'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const isGstActive = db.getCompany().isGstEnabled !== false;
  const menuItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'pos', label: 'POS Quick Bill', icon: <ShoppingCart size={18} /> },
    { id: 'sales', label: 'Sales Hub', icon: <Receipt size={18} /> },
    { id: 'purchases', label: isGstActive ? 'Purchases & ITC' : 'Purchases', icon: <ShoppingBag size={18} /> },
    { id: 'expenses', label: 'Expenses & Overhead', icon: <Wallet size={18} /> },
    { id: 'inventory', label: 'Stock & Items', icon: <Package size={18} /> },
    { id: 'parties', label: 'Parties Ledger', icon: <Users size={18} /> },
    { id: 'accounting', label: 'Daybook & Accounts', icon: <BookOpen size={18} /> },
    { id: 'reports', label: isGstActive ? 'GST & Financials' : 'Reports & Financials', icon: <FileSpreadsheet size={18} /> },
    { id: 'stitch', label: 'Stitch UI Screens', icon: <Layers size={18} /> },
    { id: 'settings', label: 'Business Profile', icon: <Settings size={18} /> },
  ];

  return (
    <aside style={{
      width: '240px',
      backgroundColor: '#131b2e',
      borderRight: '1px solid #273754',
      display: 'flex',
      flexDirection: 'column',
      padding: '1rem 0.75rem',
      gap: '0.25rem',
      flexShrink: 0,
    }}>
      <div style={{
        padding: '0.25rem 0.5rem 0.75rem 0.5rem',
        fontSize: '0.7rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#64748b',
        fontWeight: 700,
      }}>
        Vyapar Fintech Core
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', flex: 1 }}>
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0.75rem',
                borderRadius: '8px',
                border: isActive ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid transparent',
                backgroundColor: isActive ? '#1e3a8a' : 'transparent',
                color: isActive ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.85rem',
                textAlign: 'left',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #273754' }}>
        <div style={{
          backgroundColor: '#0a0f1d',
          padding: '0.75rem',
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#94a3b8',
          border: '1px solid #1d2a42',
        }}>
          <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: '2px' }}>
            GST India • Vyapar 2.0
          </div>
          <div>Offline First • SQLite / Sync</div>
          <div style={{ color: '#6cf8bb', marginTop: '4px', fontWeight: 600 }}>● Core Ready</div>
        </div>
      </div>
    </aside>
  );
};
