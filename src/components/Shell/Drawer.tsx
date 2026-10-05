import React from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { rbac, UserProfile } from '../../services/rbac.ts';
import { CURRENT_APP_VERSION } from '../../services/updateService.ts';

export type AppTab =
  | 'dashboard'
  | 'sales'
  | 'purchases'
  | 'parties'
  | 'cash_bank'
  | 'inventory'
  | 'expenses'
  | 'reports'
  | 'accounting'
  | 'pos'
  | 'settings'
  | 'menu';

interface DrawerProps {
  isOpen: boolean;
  activeTab: AppTab;
  company: CompanyProfile;
  activeUser?: UserProfile;
  onClose: () => void;
  onSelectTab: (tab: AppTab) => void;
  onOpenRoleSwitch?: () => void;
  onCheckUpdate?: () => void;
  hasUpdate?: boolean;
  latestVersion?: string;
  isCheckingUpdate?: boolean;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  activeTab,
  company,
  activeUser,
  onClose,
  onSelectTab,
  onOpenRoleSwitch,
  onCheckUpdate,
  hasUpdate,
  latestVersion,
  isCheckingUpdate,
}) => {
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
        { id: 'reports', label: company.isGstEnabled !== false ? 'Reports & GSTR' : 'Reports & Analytics', icon: 'analytics' },
        { id: 'accounting', label: 'Daybook Journal', icon: 'menu_book' },
        { id: 'menu', label: 'Navigation Menu Hub', icon: 'grid_view' },
        { id: 'settings', label: 'Company Settings', icon: 'settings' },
      ],
    },
  ];

  const brandInitial = (company.tradeName || company.businessName || 'V')[0].toUpperCase();

  return (
    <>
      {/* Backdrop with soft blur */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-slate-950/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Slide-out Drawer Panel */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-[310px] max-w-[85vw] z-50 bg-white dark:bg-slate-900 border-r border-black/[0.06] dark:border-white/[0.08] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-out flex flex-col pt-safe pb-safe ${
          isOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Drawer Header: Brand Identity & Close Button */}
        <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white flex items-center justify-center font-black text-sm shadow-xs ring-1 ring-black/5 flex-shrink-0 tracking-tight">
              {brandInitial}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm text-slate-900 dark:text-white truncate tracking-tight leading-tight">
                {company.tradeName || company.businessName}
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-extrabold uppercase tracking-wider mt-0.5">
                Vyapar PRO
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 cursor-pointer transition-all border border-black/[0.03] dark:border-white/[0.05]"
            type="button"
          >
            <span className="material-symbols-outlined text-[19px]">close</span>
          </button>
        </div>

        {/* Store Profile Card */}
        <div className="p-3 mx-3 my-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-xs shadow-2xs flex-shrink-0"
              style={{ backgroundColor: activeUser?.avatarColor || '#059669' }}
            >
              {activeUser ? activeUser.name[0].toUpperCase() : 'O'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {activeUser?.name || 'Administrator'}
              </div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase flex items-center gap-1 tracking-tight mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{activeUser?.role || 'OWNER'}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              if (onOpenRoleSwitch) onOpenRoleSwitch();
            }}
            className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200/50 dark:border-emerald-800/40 px-2.5 py-1 rounded-xl transition-all cursor-pointer active:scale-95 flex-shrink-0"
          >
            Switch
          </button>
        </div>

        {/* Navigation Links (Organized into categorized sections) */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-3 no-scrollbar">
          {navSections.map((section) => (
            <div key={section.category}>
              <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {section.category}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const hasAccess = rbac.canAccessTab(item.id, activeUser?.role);

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (!hasAccess) {
                          if (onOpenRoleSwitch) onOpenRoleSwitch();
                          return;
                        }
                        onSelectTab(item.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 h-10 rounded-xl transition-all text-left cursor-pointer select-none active:scale-98 ${
                        !hasAccess
                          ? 'opacity-40 text-slate-400 cursor-not-allowed hover:bg-transparent'
                          : isActive
                          ? 'bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 text-white font-bold shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 font-medium'
                      }`}
                      type="button"
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
                        <span className="text-xs truncate">{item.label}</span>
                      </div>

                      {!hasAccess ? (
                        <span
                          className="material-symbols-outlined text-[14px] text-slate-400"
                          title="Locked: Requires Admin/Owner PIN"
                        >
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
        </div>

        {/* Footer Info & App Update */}
        <div className="p-3 border-t border-black/[0.05] dark:border-white/[0.06] text-center flex flex-col items-center gap-1.5 bg-slate-50/50 dark:bg-slate-900/50">
          {onCheckUpdate && (
            <button
              type="button"
              onClick={() => {
                if (hasUpdate) {
                  onClose();
                }
                onCheckUpdate();
              }}
              disabled={isCheckingUpdate}
              className={`w-full py-1.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                hasUpdate
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 active:scale-95 shadow-sm'
                  : 'bg-white dark:bg-slate-800 border-black/[0.05] dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 shadow-2xs'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[15px] ${
                  hasUpdate
                    ? 'animate-bounce text-amber-500'
                    : isCheckingUpdate
                    ? 'animate-spin text-emerald-600'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {isCheckingUpdate ? 'sync' : hasUpdate ? 'system_update' : 'cloud_sync'}
              </span>
              <span className="truncate">
                {isCheckingUpdate
                  ? 'Checking for Updates...'
                  : hasUpdate && latestVersion
                  ? `Update to v${latestVersion} Available`
                  : 'Check for Updates'}
              </span>
            </button>
          )}

          <div className="flex items-center justify-between w-full px-1 pt-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            <span>Vyapar PRO v{CURRENT_APP_VERSION}</span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Offline Ready
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
