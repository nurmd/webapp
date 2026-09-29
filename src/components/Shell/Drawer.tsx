import React from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { rbac, UserProfile } from '../../services/rbac.ts';

export type AppTab =
  | 'dashboard'
  | 'sales'
  | 'purchases'
  | 'parties'
  | 'inventory'
  | 'expenses'
  | 'reports'
  | 'accounting'
  | 'pos'
  | 'stitch'
  | 'settings';

interface DrawerProps {
  isOpen: boolean;
  activeTab: AppTab;
  company: CompanyProfile;
  activeUser?: UserProfile;
  onClose: () => void;
  onSelectTab: (tab: AppTab) => void;
  onOpenRoleSwitch?: () => void;
  onCheckUpdate?: () => void;
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
}) => {
  const navItems: Array<{ id: AppTab; label: string; icon: string }> = [
    { id: 'dashboard', label: 'Dashboard / Home', icon: 'dashboard' },
    { id: 'sales', label: 'Sales & Invoices', icon: 'point_of_sale' },
    { id: 'purchases', label: 'Purchases & Orders', icon: 'shopping_bag' },
    { id: 'parties', label: 'Parties & Ledger', icon: 'group' },
    { id: 'inventory', label: 'Inventory & Stock', icon: 'inventory_2' },
    { id: 'expenses', label: 'Expenses & Overheads', icon: 'receipt_long' },
    { id: 'reports', label: 'Reports & Analytics (GSTR)', icon: 'analytics' },
    { id: 'accounting', label: 'Daybook & Journal', icon: 'menu_book' },
    { id: 'pos', label: 'Fast Retail POS Counter', icon: 'storefront' },
    { id: 'stitch', label: 'Stitch Showcase Gallery', icon: 'layers' },
    { id: 'settings', label: 'Settings & Business Profile', icon: 'settings' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Slide-out Drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-[310px] max-w-[85vw] z-50 bg-surface-container-lowest shadow-[0_4px_24px_rgba(17,28,45,0.18)] transition-transform duration-300 ease-in-out flex flex-col pt-safe pb-safe ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-space-lg border-b border-outline-variant/30 flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <img
              alt="Vyapar Modern Logo"
              className="h-8 w-auto object-contain flex-shrink-0"
              src="/logo.svg"
            />
            <div className="flex flex-col min-w-0">
              <span className="font-headline-sm text-[16px] text-on-surface font-bold truncate">
                Vyapar Books
              </span>
              <span className="font-label-sm text-label-sm text-secondary font-bold">
                PRO Edition
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container-low cursor-pointer transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Store Profile Card */}
        <div className="px-space-lg py-space-md bg-surface-container-low/60 flex items-center justify-between border-b border-outline-variant/20">
          <div className="flex items-center gap-space-sm min-w-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0"
              style={{ backgroundColor: activeUser?.avatarColor || '#006c49' }}
            >
              {activeUser ? activeUser.name[0] : 'O'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-label-md text-label-md text-on-surface font-bold truncate">
                {activeUser?.name || company.businessName}
              </div>
              <div className="font-label-sm text-[11px] text-secondary font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">badge</span>
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
            className="text-[11px] font-bold text-secondary bg-secondary/10 px-2.5 py-1 rounded-lg hover:bg-secondary/20 transition-colors cursor-pointer"
          >
            Switch
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-space-sm py-space-md space-y-1">
          {navItems.map((item) => {
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
                className={`w-full flex items-center justify-between px-space-md h-12 rounded-xl transition-all text-left cursor-pointer ${
                  !hasAccess
                    ? 'opacity-50 text-on-surface-variant hover:bg-surface-container-low'
                    : isActive
                    ? 'bg-secondary text-on-secondary font-bold shadow-sm'
                    : 'text-on-surface hover:bg-surface-container-low active:bg-surface-container'
                }`}
                type="button"
              >
                <div className="flex items-center gap-space-md min-w-0">
                  <span
                    className={`material-symbols-outlined text-[22px] ${
                      isActive ? 'text-on-secondary' : 'text-on-surface-variant'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="font-label-md text-[14px] truncate">{item.label}</span>
                </div>

                {!hasAccess && (
                  <span
                    className="material-symbols-outlined text-[18px] text-outline"
                    title="Locked: Requires Admin/Owner PIN"
                  >
                    lock
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Info & App Update */}
        <div className="p-space-md border-t border-outline-variant/30 text-center flex flex-col items-center gap-1.5">
          {onCheckUpdate && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onCheckUpdate();
              }}
              className="w-full py-1.5 px-3 rounded-xl bg-secondary/10 border border-secondary/30 text-secondary text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-secondary/20 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] animate-pulse">system_update</span>
              <span>Update to v1.1.0 Available</span>
            </button>
          )}

          <div className="text-[11px] text-on-surface-variant font-medium">
            GST Billing &amp; Accounting v1.0.0
          </div>
          <div className="text-[10px] text-secondary font-semibold">
            ● 100% Offline Capable • Native Storage
          </div>
        </div>
      </aside>
    </>
  );
};
