import React from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { UserProfile } from '../../services/rbac.ts';

interface HeaderProps {
  company: CompanyProfile;
  activeUser?: UserProfile;
  onOpenDrawer: () => void;
  onNewInvoice: () => void;
  onSearchClick?: () => void;
  onBarcodeClick?: () => void;
  onProfileClick?: () => void;
  hasUpdate?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  company,
  activeUser,
  onOpenDrawer,
  onNewInvoice,
  onSearchClick,
  onBarcodeClick,
  onProfileClick,
  hasUpdate,
}) => {
  const isGst = company.isGstEnabled !== false;
  const brandInitial = (company.tradeName || company.businessName || 'V')[0].toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-black/[0.06] dark:border-white/[0.08] shadow-[0_1px_4px_rgba(0,0,0,0.03)] pt-safe transition-colors transform-gpu">
      <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {/* Left: Navigation Menu Toggle & Brand Identity */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={onOpenDrawer}
            aria-label="Open Navigation Drawer"
            className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 bg-slate-100/70 hover:bg-slate-200/70 dark:bg-slate-800/60 dark:hover:bg-slate-700/60 active:scale-90 transition-all flex-shrink-0 cursor-pointer relative border border-black/[0.04] dark:border-white/[0.06]"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
            {hasUpdate && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse"
                title="App Update Available"
              />
            )}
          </button>

          {/* Clean Modern Brand Mark & Business Name */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white flex items-center justify-center font-black text-xs shadow-sm ring-1 ring-black/5 flex-shrink-0 tracking-tight">
              {brandInitial}
            </div>

            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate tracking-tight leading-tight">
                {company.tradeName || company.businessName}
              </span>

              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-tight truncate ${
                    isGst
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/40'
                      : 'bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800/40'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isGst ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-amber-500'
                    }`}
                  />
                  <span className="truncate">
                    {isGst ? (company.gstin ? `GSTIN: ${company.gstin}` : 'GST Registered') : 'Retail Mode'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Search Trigger Pill (Visible on Desktop / Tablets) */}
        {onSearchClick && (
          <button
            onClick={onSearchClick}
            type="button"
            className="hidden md:flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-100 text-slate-500 hover:text-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:text-slate-400 text-xs cursor-pointer border border-black/[0.04] dark:border-white/[0.06] transition-all w-64 shadow-2xs"
          >
            <div className="flex items-center gap-1.5 truncate">
              <span className="material-symbols-outlined text-[16px]">search</span>
              <span className="truncate">Search bills, parties, stock...</span>
            </div>
            <kbd className="font-mono text-[10px] bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-black/[0.06] dark:border-white/[0.08] text-slate-500 dark:text-slate-300">
              ⌘K
            </kbd>
          </button>
        )}

        {/* Right: Quick Action Controls & Role Switcher */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Mobile Search Button */}
          {onSearchClick && (
            <button
              onClick={onSearchClick}
              aria-label="Search"
              className="md:hidden w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all cursor-pointer border border-black/[0.03] dark:border-white/[0.05]"
              type="button"
            >
              <span className="material-symbols-outlined text-[19px]">search</span>
            </button>
          )}

          {/* Quick POS / Barcode Scanner */}
          {onBarcodeClick && (
            <button
              onClick={onBarcodeClick}
              aria-label="POS Counter & Barcode Scanner"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all cursor-pointer border border-black/[0.03] dark:border-white/[0.05]"
              type="button"
              title="Quick POS Counter"
            >
              <span className="material-symbols-outlined text-[19px]">qr_code_scanner</span>
            </button>
          )}

          {/* + New Bill Button (Tablet/Desktop) */}
          <button
            onClick={onNewInvoice}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-xs hover:shadow active:scale-95 transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>New Bill</span>
          </button>

          {/* User Profile / Role Switch Pill */}
          <button
            onClick={onProfileClick}
            aria-label="Switch User Role & Profile"
            className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-slate-100/70 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-black/[0.05] dark:border-white/[0.08] transition-all cursor-pointer active:scale-95 shadow-2xs"
            type="button"
            title="Switch User Role"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold shadow-2xs flex-shrink-0"
              style={{ backgroundColor: activeUser?.avatarColor || '#059669' }}
            >
              {activeUser ? activeUser.name[0].toUpperCase() : 'O'}
            </div>

            <div className="flex flex-col text-left hidden sm:flex min-w-0 pr-0.5">
              <span className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                {activeUser?.name || 'Owner'}
              </span>
              <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase leading-none">
                {activeUser?.role || 'OWNER'}
              </span>
            </div>

            <span className="material-symbols-outlined text-[13px] text-slate-400 dark:text-slate-500">
              expand_more
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
