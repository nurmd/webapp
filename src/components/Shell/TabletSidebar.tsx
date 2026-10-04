import React, { useState } from 'react';
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
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gst_tablet_sidebar_minimized') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gst_tablet_sidebar_minimized', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

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
    <aside
      className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-black/[0.06] dark:border-white/[0.08] flex-shrink-0 select-none h-screen sticky top-0 z-30 transition-[width] duration-300 ease-in-out shadow-[1px_0_6px_rgba(0,0,0,0.02)] transform-gpu contain-paint ${
        isMinimized ? 'w-[72px]' : 'w-56'
      }`}
    >
      {/* Brand Header */}
      <div className={`border-b border-black/[0.05] dark:border-white/[0.06] ${isMinimized ? 'p-3 flex flex-col items-center gap-2' : 'p-3.5 flex items-center justify-between'}`}>
        {isMinimized ? (
          <>
            <div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white flex items-center justify-center font-black text-sm shadow-xs ring-1 ring-black/5 flex-shrink-0 tracking-tight cursor-pointer hover:scale-105 transition-transform"
              title={`${company.tradeName || company.businessName} (Vyapar PRO)`}
              onClick={toggleSidebar}
            >
              {brandInitial}
            </div>
            <button
              onClick={toggleSidebar}
              type="button"
              className="w-8 h-7 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-center transition-colors cursor-pointer"
              title="Expand Sidebar (Maximized Theme)"
            >
              <span className="material-symbols-outlined text-[18px]">keyboard_double_arrow_right</span>
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white flex items-center justify-center font-black text-sm shadow-xs ring-1 ring-black/5 flex-shrink-0 tracking-tight">
                {brandInitial}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-xs text-slate-900 dark:text-white truncate leading-tight tracking-tight">
                  {company.tradeName || company.businessName}
                </span>
                <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-extrabold uppercase tracking-wider mt-0.5">
                  Vyapar PRO
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
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

              {/* Collapse to Minimized Theme Toggle */}
              <button
                onClick={toggleSidebar}
                type="button"
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-center transition-colors cursor-pointer"
                title="Collapse to Minimized Theme (Compact Rail)"
              >
                <span className="material-symbols-outlined text-[18px]">keyboard_double_arrow_left</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Primary Action Button: + New Bill */}
      <div className={isMinimized ? 'px-2 pt-3 pb-1 flex justify-center' : 'px-3 pt-3 pb-1'}>
        {isMinimized ? (
          <button
            onClick={onNewInvoice}
            type="button"
            className="group relative w-11 h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs hover:shadow active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            title="Create Sale Bill (+)"
          >
            <span className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform duration-300">
              add
            </span>
          </button>
        ) : (
          <button
            onClick={onNewInvoice}
            type="button"
            className="group relative w-full h-9 px-3 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-xs hover:shadow active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px] group-hover:rotate-90 transition-transform duration-300">
              add
            </span>
            <span className="truncate">+ Create Sale Bill</span>
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className={`flex-1 overflow-y-auto ${isMinimized ? 'px-2 py-1 space-y-2' : 'px-2.5 py-1 space-y-2.5'} no-scrollbar`}>
        {navSections.map((section, idx) => (
          <div key={section.category}>
            {isMinimized ? (
              idx > 0 && <div className="my-1.5 mx-auto w-6 h-[1px] bg-slate-200/80 dark:bg-slate-800/80" />
            ) : (
              <div className="px-2 pb-1 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {section.category}
              </div>
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = activeTab === item.id;
                const userRole = activeUser?.role || 'OWNER';
                const isAllowed = rbac.canAccessTab(item.id, userRole);

                if (isMinimized) {
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      disabled={!isAllowed}
                      type="button"
                      title={item.label}
                      className={`relative w-11 h-10 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs font-bold'
                          : isAllowed
                          ? 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                          : 'opacity-40 cursor-not-allowed text-slate-400'
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-[20px]"
                        style={{
                          fontVariationSettings: isActive
                            ? "'FILL' 1, 'wght' 600"
                            : "'FILL' 0, 'wght' 400",
                        }}
                      >
                        {item.icon}
                      </span>
                      {isActive && (
                        <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-3.5 rounded-r-full bg-emerald-500" />
                      )}
                    </button>
                  );
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    disabled={!isAllowed}
                    type="button"
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none active:scale-98 ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 text-white shadow-xs font-bold'
                        : isAllowed
                        ? 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 font-medium'
                        : 'opacity-40 cursor-not-allowed text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="material-symbols-outlined text-[19px] flex-shrink-0"
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
                      <span className="material-symbols-outlined text-[13px] text-slate-400">
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
      <div className={`border-t border-black/[0.05] dark:border-white/[0.06] bg-slate-50/50 dark:bg-slate-900/50 ${isMinimized ? 'p-2 flex flex-col items-center gap-1.5' : 'p-2.5'}`}>
        {isMinimized ? (
          <>
            <button
              onClick={onOpenRoleSwitch}
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-xs text-white shadow-2xs hover:scale-105 transition-transform cursor-pointer"
              style={{ backgroundColor: activeUser?.avatarColor || '#059669' }}
              title={`Active: ${activeUser?.name || 'Admin'} (${activeUser?.role || 'OWNER'})`}
            >
              {(activeUser?.name || 'A')[0].toUpperCase()}
            </button>
            <span className="text-[8px] font-mono text-slate-400 font-medium tracking-tight">
              v{CURRENT_APP_VERSION}
            </span>
          </>
        ) : (
          <div className="flex items-center justify-between gap-1.5">
            {/* Active User Chip */}
            <button
              onClick={onOpenRoleSwitch}
              type="button"
              className="flex items-center gap-2 min-w-0 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left flex-1 border border-transparent hover:border-black/[0.04]"
              title="Switch User Role"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center font-extrabold text-[10px] text-white shadow-2xs flex-shrink-0"
                style={{ backgroundColor: activeUser?.avatarColor || '#059669' }}
              >
                {(activeUser?.name || 'A')[0].toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[11px] text-slate-900 dark:text-white truncate leading-tight">
                  {activeUser?.name || 'Admin'}
                </span>
                <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-semibold truncate capitalize">
                  {activeUser?.role?.toLowerCase() || 'owner'}
                </span>
              </div>
            </button>

            {/* App Version Tag */}
            <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 font-medium px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-black/[0.05] dark:border-white/[0.06] shadow-2xs flex-shrink-0">
              v{CURRENT_APP_VERSION}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};

