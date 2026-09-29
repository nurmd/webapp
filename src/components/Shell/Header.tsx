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
}

export const Header: React.FC<HeaderProps> = ({
  company,
  activeUser,
  onOpenDrawer,
  onNewInvoice,
  onSearchClick,
  onBarcodeClick,
  onProfileClick,
}) => {
  return (
    <header className="fixed top-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30 pt-safe">
      <div className="h-16 px-margin-mobile flex items-center justify-between gap-space-xs max-w-7xl mx-auto">
        {/* Left: Drawer Toggle & Company Name */}
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button
            onClick={onOpenDrawer}
            aria-label="Open Navigation Drawer"
            className="w-11 h-11 flex items-center justify-center text-on-surface-variant active:text-on-surface active:bg-surface-container-low rounded-full transition-colors flex-shrink-0 cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>

          <div className="flex items-center gap-space-xs text-left min-w-0 py-space-xs px-space-xs rounded-lg">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-headline-sm text-[16px] text-on-surface font-bold truncate">
                  {company.businessName}
                </span>
                <span className="material-symbols-outlined text-secondary text-[16px] flex-shrink-0">
                  verified
                </span>
              </div>
              <span className="font-label-sm text-label-sm text-secondary font-semibold flex items-center gap-0.5">
                GSTIN: {company.gstin}
              </span>
            </div>
          </div>
        </div>

        {/* Right Action Icons & Profile */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onSearchClick}
            aria-label="Search transactions"
            className="w-10 h-10 flex items-center justify-center text-on-surface-variant active:text-on-surface active:bg-surface-container-low rounded-full transition-colors cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[22px]">search</span>
          </button>

          <button
            onClick={onBarcodeClick}
            aria-label="Scan QR or Barcode"
            className="w-10 h-10 flex items-center justify-center text-on-surface-variant active:text-on-surface active:bg-surface-container-low rounded-full transition-colors cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[22px]">qr_code_scanner</span>
          </button>

          <button
            onClick={onNewInvoice}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md font-bold shadow-sm active:scale-95 transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>+ New Bill</span>
          </button>

          <button
            onClick={onProfileClick}
            aria-label="Switch User Role & Profile"
            className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors border border-outline-variant/30"
            type="button"
            title="Click to switch role (Owner, Cashier, CA)"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm"
              style={{ backgroundColor: activeUser?.avatarColor || '#006c49' }}
            >
              {activeUser ? activeUser.name[0] : 'O'}
            </div>
            <div className="flex flex-col text-left hidden sm:flex">
              <span className="text-[10px] font-bold text-on-surface leading-tight">
                {activeUser?.name || 'Owner'}
              </span>
              <span className="text-[9px] font-semibold text-secondary uppercase leading-none">
                {activeUser?.role || 'OWNER'}
              </span>
            </div>
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
              expand_more
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
