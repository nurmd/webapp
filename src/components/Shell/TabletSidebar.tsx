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

  const navSections: Array<{
    category: string;
    items: Array<{ id: AppTab; label: string; icon: string }>;
  }> = [
    {
      category: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
        { id: 'pos', label: 'Fast POS Counter', icon: 'storefront' },
      ],
    },
    {
      category: 'Transactions',
      items: [
        { id: 'sales', label: 'Sales & Invoices', icon: 'point_of_sale' },
        { id: 'purchases', label: 'Purchases & Bills', icon: 'shopping_bag' },
        { id: 'parties', label: 'Parties & Ledger', icon: 'group' },
        { id: 'inventory', label: 'Inventory & Stock', icon: 'inventory_2' },
      ],
    },
    {
      category: 'Accounting & More',
      items: [
        { id: 'cash_bank', label: 'Cash & Bank Accounts', icon: 'account_balance' },
        { id: 'expenses', label: 'Expenses & Overheads', icon: 'receipt_long' },
        { id: 'reports', label: 'Reports & GSTR', icon: 'analytics' },
        { id: 'accounting', label: 'Daybook Journal', icon: 'menu_book' },
        { id: 'menu', label: 'Navigation Hub', icon: 'grid_view' },
        { id: 'settings', label: 'Company Settings', icon: 'settings' },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 flex-col bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border-r border-black/[0.05] dark:border-white/[0.08] flex-shrink-0 select-none h-screen sticky top-0 z-30 transition-colors shadow-[1px_0_12px_rgba(0,0,0,0.02)]">
      {/* Brand Header */}
      <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white flex items-center justify-center font-black text-sm shadow-xs ring-1 ring-black/5 flex-shrink-0 tracking-tight">
            {brandInitial}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm text-slate-900 dark:text-white truncate leading-tight tracking-tight">
              {company.tradeName || company.businessName}
            </span>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-extrabold uppercase tracking-wider mt-0.5">
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
          className="group relative w-full h-10 px-3 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-xs hover:shadow active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] group-hover:rotate-90 transition-transform duration-300">
            add
          </span>
          <span>+ Create Sale Bill</span>
          {/* Top specular reflection */}
          <div className="absolute inset-x-2 top-1 h-[1px] bg-white/30 rounded-full pointer-events-none" />
        </button>
      </div>

      {/* Navigation Links with Category Sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-3 no-scrollbar">
        {navSections.map((section) => (
          <div key={section.category}>
            <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {section.category}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
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
                        ? 'bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 text-white shadow-xs font-bold'
                        : isAllowed
                        ? 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 font-medium'
                        : 'opacity-40 cursor-not-allowed text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="material-symbols-outlined text-[20px] flex-shrink-0"
                        style={{
                          fontVariationSettings: isActive
                            ? "'FILL' 1, 'wght' 600"
                            : "'FILL' 0, 'wght' 400",
                        }}
                      >
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </div>

                    {!isAllowed ? (
                      <span className="material-symbols-outlined text-[14px] text-slate-400">
                        lock
                      </span>
                    ) : isActive ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Role & Version Footer */}
      <div className="p-3 border-t border-black/[0.05] dark:border-white/[0.06] bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between gap-2">
          {/* Active User Chip */}
          <button
            onClick={onOpenRoleSwitch}
            type="button"
            className="flex items-center gap-2 min-w-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left flex-1 border border-transparent hover:border-black/[0.04]"
            title="Switch User Role"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-xs text-white shadow-2xs flex-shrink-0"
              style={{ backgroundColor: activeUser?.avatarColor || '#059669' }}
            >
              {(activeUser?.name || 'A')[0].toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                {activeUser?.name || 'Admin'}
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold truncate capitalize">
                {activeUser?.role?.toLowerCase() || 'owner'}
              </span>
            </div>
          </button>

          {/* App Version Tag */}
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-medium px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-black/[0.05] dark:border-white/[0.06] shadow-2xs flex-shrink-0">
            v{CURRENT_APP_VERSION}
          </span>
        </div>
      </div>
    </aside>
  );
};
