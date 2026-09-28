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
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'pos'
  | 'invoices'
  | 'inventory'
  | 'parties'
  | 'accounting'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const menuItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'pos', label: 'POS Quick Bill', icon: <ShoppingCart size={18} /> },
    { id: 'invoices', label: 'Invoices (B2B/B2C)', icon: <Receipt size={18} /> },
    { id: 'inventory', label: 'Stock & Items', icon: <Package size={18} /> },
    { id: 'parties', label: 'Parties (Customers)', icon: <Users size={18} /> },
    { id: 'accounting', label: 'Daybook & Ledger', icon: <BookOpen size={18} /> },
    { id: 'reports', label: 'GSTR-1 Reports', icon: <FileSpreadsheet size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  return (
    <aside style={{
      width: '230px',
      backgroundColor: '#1e293b',
      borderRight: '1px solid #334155',
      display: 'flex',
      flexDirection: 'column',
      padding: '1rem 0.75rem',
      gap: '0.25rem',
    }}>
      <div style={{
        padding: '0.25rem 0.5rem 0.75rem 0.5rem',
        fontSize: '0.7rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#64748b',
        fontWeight: 600,
      }}>
        GST Accounting System
      </div>

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
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isActive ? '#2563eb' : 'transparent',
              color: isActive ? '#ffffff' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: isActive ? 600 : 500,
              fontSize: '0.875rem',
              textAlign: 'left',
              transition: 'background-color 0.15s, color 0.15s',
            }}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}

      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
        <div style={{
          backgroundColor: '#0f172a',
          padding: '0.75rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          color: '#94a3b8',
        }}>
          <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '2px' }}>
            GST India v2.0
          </div>
          <div>Offline First • SQLite/Sync</div>
          <div style={{ color: '#10b981', marginTop: '4px' }}>● Ready (Local DB)</div>
        </div>
      </div>
    </aside>
  );
};
