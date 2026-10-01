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
    <header className="fixed top-0 left-0 right-0 z-40 bg-surface-container-lowest/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-outline-variant/25 shadow-[0_1px_6px_rgba(0,0,0,0.03)] pt-safe transition-colors">
      <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {/* Left: Navigation Menu Toggle & Brand Identity */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={onOpenDrawer}
            aria-label="Open Navigation Drawer"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-all flex-shrink-0 cursor-pointer relative active:scale-95"
            type="button"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
            {hasUpdate && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-surface animate-pulse"
                title="App Update Available"
              />
            )}
          </button>

          {/* Clean Brand Mark & Business Name */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-secondary to-emerald-700 text-on-secondary flex items-center justify-center font-black text-xs shadow-xs flex-shrink-0">
              {brandInitial}
            </div>

            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs sm:text-sm text-on-surface truncate tracking-tight leading-tight">
                {company.tradeName || company.businessName}
              </span>

              <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-medium truncate mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isGst ? 'bg-secondary' : 'bg-amber-500'
                  }`}
                />
                <span className={`font-semibold truncate ${isGst ? 'text-secondary' : 'text-amber-600 dark:text-amber-400'}`}>
                  {isGst ? (company.gstin ? `GSTIN: ${company.gstin}` : 'GST Registered') : 'Retail Mode'}
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
            className="hidden md:flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant text-xs cursor-pointer border border-outline-variant/20 transition-all w-64 shadow-2xs"
          >
            <div className="flex items-center gap-1.5 text-on-surface-variant truncate">
              <span className="material-symbols-outlined text-[16px]">search</span>
              <span className="truncate">Search bills, parties, stock...</span>
            </div>
            <kbd className="font-mono text-[10px] bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30 text-outline">
              ⌘K
            </kbd>
          </button>
        )}

        {/* Right: Quick Action Controls & Role Switcher */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {/* Mobile Search Button */}
          {onSearchClick && (
            <button
              onClick={onSearchClick}
              aria-label="Search"
              className="md:hidden w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">search</span>
            </button>
          )}

          {/* Quick POS / Barcode Scanner */}
          {onBarcodeClick && (
            <button
              onClick={onBarcodeClick}
              aria-label="POS Counter & Barcode Scanner"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
              type="button"
              title="Quick POS Counter"
            >
              <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
            </button>
          )}

          {/* + New Bill Button (Tablet/Desktop) */}
          <button
            onClick={onNewInvoice}
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/90 text-on-secondary font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>New Bill</span>
          </button>

          {/* User Profile / Role Switch Pill */}
          <button
            onClick={onProfileClick}
            aria-label="Switch User Role & Profile"
            className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-surface-container-low hover:bg-surface-container border border-outline-variant/25 transition-all cursor-pointer active:scale-95 shadow-2xs"
            type="button"
            title="Switch User Role"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-2xs flex-shrink-0"
              style={{ backgroundColor: activeUser?.avatarColor || '#006c49' }}
            >
              {activeUser ? activeUser.name[0].toUpperCase() : 'O'}
            </div>

            <div className="flex flex-col text-left hidden sm:flex min-w-0 pr-0.5">
              <span className="text-[11px] font-bold text-on-surface leading-tight truncate">
                {activeUser?.name || 'Owner'}
              </span>
              <span className="text-[9px] font-semibold text-secondary uppercase leading-none">
                {activeUser?.role || 'OWNER'}
              </span>
            </div>

            <span className="material-symbols-outlined text-[13px] text-outline">
              expand_more
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
