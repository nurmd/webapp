import React from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { rbac, UserProfile } from '../../services/rbac.ts';
import { CURRENT_APP_VERSION } from '../../services/updateService.ts';
import { AppTab } from './Drawer.tsx';

interface TabletSidebarProps {
  activeTab: AppTab;
  company: CompanyProfile;
  activeUser?: UserProfile;
  onSelectTab: (tab: AppTab) => void;
  onNewInvoice: () => void;
  onOpenRoleSwitch?: () => void;
  onCheckUpdate?: () => void;
  hasUpdate?: boolean;
  latestVersion?: string;
}

export const TabletSidebar: React.FC<TabletSidebarProps> = ({
  activeTab,
  company,
  activeUser,
  onSelectTab,
  onNewInvoice,
  onOpenRoleSwitch,
  onCheckUpdate,
  hasUpdate,
  latestVersion,
}) => {
  const brandInitial = (company.tradeName || company.businessName || 'V')[0].toUpperCase();

  const navItems: Array<{ id: AppTab; label: string; icon: string; category?: string }> = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'pos', label: 'Fast POS Counter', icon: 'storefront' },
    { id: 'sales', label: 'Sales Bills', icon: 'point_of_sale' },
    { id: 'purchases', label: 'Purchases', icon: 'shopping_bag' },
    { id: 'parties', label: 'Parties & Ledger', icon: 'group' },
    { id: 'cash_bank', label: 'Cash & Bank', icon: 'account_balance' },
    { id: 'inventory', label: 'Inventory Stock', icon: 'inventory_2' },
    { id: 'expenses', label: 'Expenses', icon: 'receipt_long' },
    { id: 'accounting', label: 'Daybook Journal', icon: 'menu_book' },
    { id: 'reports', label: 'Reports & GSTR', icon: 'analytics' },
    { id: 'menu', label: 'Navigation Hub', icon: 'grid_view' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 flex-col bg-surface-container-lowest border-r border-outline-variant/30 flex-shrink-0 select-none h-screen sticky top-0 z-30">
      {/* Brand Header */}
      <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-secondary to-emerald-700 text-on-secondary flex items-center justify-center font-black text-sm shadow-xs flex-shrink-0">
            {brandInitial}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm text-on-surface truncate leading-tight">
              {company.tradeName || company.businessName}
            </span>
            <span className="text-[10px] text-secondary font-bold uppercase tracking-wider mt-0.5">
              Vyapar PRO
            </span>
          </div>
        </div>

        {/* Update Notification Badge */}
        {hasUpdate && onCheckUpdate && (
          <button
            onClick={onCheckUpdate}
            type="button"
            className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center hover:bg-amber-500/25 transition-colors cursor-pointer relative"
            title={`New update v${latestVersion} available!`}
          >
            <span className="material-symbols-outlined text-[16px]">system_update</span>
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </button>
        )}
      </div>

      {/* Primary Action Button: + New Bill */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onNewInvoice}
          type="button"
          className="w-full h-10 px-3 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-xs hover:shadow active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>+ Create Sale Bill</span>
        </button>
      </div>

      {/* Navigation Links (Scrollable with custom scrollbar) */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const userRole = activeUser?.role || 'OWNER';
          const isAllowed = rbac.canAccessTab(item.id, userRole);

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              disabled={!isAllowed}
              type="button"
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none active:scale-98 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : isAllowed
                  ? 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  : 'opacity-40 cursor-not-allowed text-outline'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="material-symbols-outlined text-[20px] flex-shrink-0"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>

              {!isAllowed && (
                <span className="material-symbols-outlined text-[14px] text-outline">lock</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Role & Version Footer */}
      <div className="p-3 border-t border-outline-variant/20 bg-surface-container-low/40">
        <div className="flex items-center justify-between gap-2">
          {/* Active User Chip */}
          <button
            onClick={onOpenRoleSwitch}
            type="button"
            className="flex items-center gap-2 min-w-0 p-1.5 rounded-lg hover:bg-surface-container transition-colors cursor-pointer text-left flex-1"
            title="Switch User Role"
          >
            <div className="w-7 h-7 rounded-full bg-secondary/15 text-secondary flex items-center justify-center font-bold text-xs flex-shrink-0">
              {(activeUser?.name || 'A')[0].toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs text-on-surface truncate">
                {activeUser?.name || 'Admin'}
              </span>
              <span className="text-[10px] text-on-surface-variant font-medium truncate capitalize">
                {activeUser?.role?.toLowerCase() || 'owner'}
              </span>
            </div>
          </button>

          {/* App Version Tag */}
          <span className="text-[10px] font-mono text-outline font-medium px-1.5 py-0.5 rounded bg-surface-container flex-shrink-0">
            v{CURRENT_APP_VERSION}
          </span>
        </div>
      </div>
    </aside>
  );
};
