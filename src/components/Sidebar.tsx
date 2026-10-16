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
    ...((import.meta as any).env?.DEV
      ? [{ id: 'stitch' as NavTab, label: 'Stitch UI Screens', icon: <Layers size={18} /> }]
      : []),
    { id: 'settings', label: 'Business Profile', icon: <Settings size={18} /> },
  ];

  return (
    <aside className="w-60 bg-surface-container-low border-r border-outline-variant/30 flex flex-col p-4 py-3 gap-1 shrink-0">
      <div className="px-2 pb-3 pt-1 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
        Vyapar Fintech Core
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto flex-1">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-left transition-all ${
                isActive
                  ? 'bg-primary-container text-on-primary-container font-bold border border-primary/20 shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container font-medium border border-transparent'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-4 border-t border-outline-variant/30">
        <div className="bg-surface-container-lowest p-3 rounded-xl text-xs text-on-surface-variant border border-outline-variant/30 shadow-xs">
          <div className="font-bold text-on-surface mb-0.5">
            GST India • Vyapar 2.0
          </div>
          <div>Offline First • SQLite / Sync</div>
          <div className="text-secondary mt-1 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" />
            <span>Core Ready</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
