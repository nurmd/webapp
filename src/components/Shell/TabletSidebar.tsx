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
      className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-black/[0.06] dark:border-white/[0.08] flex-shrink-0 select-none h-screen sticky top-0 z-30 shadow-[1px_0_6px_rgba(0,0,0,0.02)] overflow-x-hidden ${
        isMinimized ? 'w-[68px]' : 'w-56'
      }`}
    >
      {/* Brand Header */}
      <div className={`h-14 px-3 flex items-center border-b border-black/[0.06] dark:border-white/[0.06] flex-shrink-0 ${isMinimized ? 'justify-center' : 'justify-between'}`}>
        <div className={`flex items-center gap-2.5 min-w-0 ${isMinimized ? 'justify-center' : 'flex-1'}`}>
          {/* Brand Initial Badge */}
          <button
            onClick={toggleSidebar}
            type="button"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white flex items-center justify-center font-black text-xs shadow-xs ring-1 ring-black/5 flex-shrink-0 tracking-tight cursor-pointer hover:scale-105 active:scale-95 transition-transform"
            title={`${company.tradeName || company.businessName} (Vyapar PRO)`}
          >
            {brandInitial}
          </button>

          {/* Business Name & Tag */}
          {!isMinimized && (
            <div className="flex flex-col min-w-0 animate-fade-in">
              <span className="font-bold text-xs text-slate-900 dark:text-white truncate leading-tight whitespace-nowrap">
                {company.tradeName || company.businessName}
              </span>
              <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-extrabold uppercase tracking-wider mt-0.5 whitespace-nowrap">
                Vyapar PRO
              </span>
            </div>
          )}
        </div>

        {/* Update Notification Badge in Header (when expanded) */}
        {hasUpdate && onCheckUpdate && !isMinimized && (
          <button
            onClick={onCheckUpdate}
            type="button"
            className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center hover:bg-amber-500/25 transition-colors cursor-pointer relative flex-shrink-0"
            title={`New update v${latestVersion} available!`}
          >
            <span className="material-symbols-outlined text-[16px]">system_update</span>
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </button>
        )}
      </div>

      {/* Primary Action Button: + Create Sale Bill */}
      <div className="p-2 flex-shrink-0">
        <button
          onClick={onNewInvoice}
          type="button"
          className={`group relative h-10 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-xs hover:shadow active:scale-95 transition-all flex items-center cursor-pointer ${
            isMinimized ? 'w-11 mx-auto justify-center px-0' : 'w-full px-3 justify-start gap-2'
          }`}
          title={isMinimized ? 'Create Sale Bill (+)' : undefined}
        >
          <span className="material-symbols-outlined text-[19px] flex-shrink-0 group-hover:rotate-90 transition-transform duration-200">
            add
          </span>
          {!isMinimized && (
            <span className="whitespace-nowrap truncate animate-fade-in">
              Create Sale Bill
            </span>
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-2 no-scrollbar">
        {navSections.map((section, idx) => (
          <div key={section.category}>
            {/* Category Header or Divider Line */}
            <div className="px-1.5 pt-1.5 pb-1 relative h-5 flex items-center">
              {!isMinimized ? (
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap animate-fade-in">
                  {section.category}
                </span>
              ) : idx > 0 ? (
                <div className="h-[1px] w-6 bg-slate-200/80 dark:bg-slate-800/80 mx-auto" />
              ) : null}
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
                    title={isMinimized ? item.label : undefined}
                    className={`relative h-10 rounded-xl flex items-center cursor-pointer select-none active:scale-98 transition-colors ${
                      isMinimized ? 'w-11 mx-auto justify-center px-0' : 'w-full px-2.5 justify-between'
                    } ${
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
                      {!isMinimized && (
                        <span className="text-xs font-semibold whitespace-nowrap truncate animate-fade-in">
                          {item.label}
                        </span>
                      )}
                    </div>

                    {/* Active Right Dot / Lock */}
                    {!isMinimized && (
                      <div className="flex items-center flex-shrink-0">
                        {!isAllowed ? (
                          <span className="material-symbols-outlined text-[13px] text-slate-400">
                            lock
                          </span>
                        ) : isActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                        ) : null}
                      </div>
                    )}

                    {/* Active Left Indicator Bar in Minimized mode */}
                    {isMinimized && isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full bg-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Role & Bottom Expand/Collapse Footer */}
      <div className="p-2 border-t border-black/[0.06] dark:border-white/[0.06] bg-slate-50/50 dark:bg-slate-900/50 flex-shrink-0 flex flex-col gap-1.5">
        {/* User Role Switcher */}
        <button
          onClick={onOpenRoleSwitch}
          type="button"
          className={`flex items-center gap-2 min-w-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left border border-transparent hover:border-black/[0.04] ${
            isMinimized ? 'justify-center w-full' : 'w-full justify-between'
          }`}
          title={`Active: ${activeUser?.name || 'Admin'} (${activeUser?.role || 'OWNER'})`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-[11px] text-white shadow-2xs flex-shrink-0"
              style={{ backgroundColor: activeUser?.avatarColor || '#059669' }}
            >
              {(activeUser?.name || 'A')[0].toUpperCase()}
            </div>
            {!isMinimized && (
              <div className="flex flex-col min-w-0 animate-fade-in">
                <span className="font-bold text-[11px] text-slate-900 dark:text-white truncate leading-tight whitespace-nowrap">
                  {activeUser?.name || 'Admin'}
                </span>
                <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-semibold truncate capitalize whitespace-nowrap">
                  {activeUser?.role?.toLowerCase() || 'owner'}
                </span>
              </div>
            )}
          </div>

          {!isMinimized && (
            <span className="text-[9px] font-mono text-slate-400 font-medium px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-black/[0.05] dark:border-white/[0.06] shadow-2xs">
              v{CURRENT_APP_VERSION}
            </span>
          )}
        </button>

        {/* Sidebar Expand / Collapse Toggle Button at Bottom */}
        <button
          onClick={toggleSidebar}
          type="button"
          className={`h-8 rounded-xl flex items-center gap-2 px-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors cursor-pointer ${
            isMinimized ? 'w-11 mx-auto justify-center' : 'w-full justify-between'
          }`}
          title={isMinimized ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[19px] flex-shrink-0 text-emerald-600 dark:text-emerald-400">
              {isMinimized ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'}
            </span>
            {!isMinimized && (
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap truncate animate-fade-in">
                Collapse Sidebar
              </span>
            )}
          </div>
        </button>
      </div>
    </aside>
  );
};


