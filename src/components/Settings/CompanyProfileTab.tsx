import React from 'react';
import { CompanyProfile } from '../../models/company.ts';

export interface CompanyProfileTabProps {
  profile: CompanyProfile;
  isGstActive: boolean;
  stateName: string;
  defaultPrintOption: string;
  handleDefaultPrintOptionChange: (opt: string) => void;
  setIsEditModalOpen: (open: boolean) => void;
  setIsQrModalOpen: (open: boolean) => void;
  setActiveTab: (tab: 'profile' | 'general' | 'print' | 'audit') => void;
  setActiveSubModal: (modal: string | null) => void;
}

export const CompanyProfileTab: React.FC<CompanyProfileTabProps> = ({
  profile,
  isGstActive,
  stateName,
  defaultPrintOption,
  handleDefaultPrintOptionChange,
  setIsEditModalOpen,
  setIsQrModalOpen,
  setActiveTab,
  setActiveSubModal,
}) => {
  return (
    <>
      {/* 1. Merchant Identity Card (Stitch business_settings_profile) */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4 relative overflow-hidden">
        {/* Subtle Ambient Corner Accent */}
        <div className="absolute -right-12 -top-12 w-36 h-36 bg-secondary-fixed/40 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start gap-3.5 relative">
          {/* Store Avatar / Logo */}
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-center text-secondary font-bold text-2xl shadow-sm overflow-hidden">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="Store Logo" className="w-full h-full object-cover" />
              ) : (
                <span>{profile.businessName.charAt(0) || 'V'}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              aria-label="Upload Store Logo"
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md active:scale-90 transition-transform cursor-pointer"
            >
              <span className="material-symbols-outlined text-[13px]">photo_camera</span>
            </button>
          </div>

          {/* Business Name & Verification */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface truncate">
                {profile.businessName || 'Vyapar Store'}
              </h2>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
              {profile.tradeName || 'Wholesale & Retail Groceries'}
            </p>
            {isGstActive && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                <span>GST Portal Verified</span>
              </div>
            )}
          </div>
        </div>

        {/* Essential Metadata Grid */}
        <div className="bg-surface-container-low/70 rounded-xl p-3.5 flex flex-col gap-2 text-xs">
          {isGstActive && (
            <>
              <div
                onClick={() => {
                  setActiveTab('general');
                  setTimeout(() => {
                    document.getElementById('gst-tax-config')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="flex items-center justify-between text-on-surface hover:bg-surface-container-high/50 p-1 -m-1 rounded-lg transition-colors cursor-pointer"
                title="Click to configure GST & Legal Tax settings"
              >
                <span className="text-on-surface-variant font-medium flex items-center gap-1">
                  <span>GSTIN</span>
                  <span className="material-symbols-outlined text-[13px] text-secondary">tune</span>
                </span>
                <span className="font-tabular-data tracking-wider font-bold text-on-surface">
                  {profile.gstin || '27AAAAA0000A1Z5'}
                </span>
              </div>

              <div className="flex items-center justify-between text-on-surface">
                <span className="text-on-surface-variant font-medium">Taxpayer Status</span>
                <span className="font-bold flex items-center gap-1 text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                  Active • Regular
                </span>
              </div>
            </>
          )}

          <div className="flex items-center justify-between text-on-surface">
            <span className="text-on-surface-variant font-medium">Contact Phone</span>
            <span className="font-medium text-on-surface">{profile.phone || '+91 98000 00000'}</span>
          </div>

          <div className="flex items-center justify-between text-on-surface">
            <span className="text-on-surface-variant font-medium">UPI Payment VPA</span>
            <span className="font-mono text-secondary font-bold truncate max-w-[200px]">
              {profile.upiId || 'Not Configured'}
            </span>
          </div>

          <div className="pt-1.5 border-t border-outline-variant/20 flex items-start gap-1.5 text-on-surface-variant">
            <span className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5 text-secondary">
              location_on
            </span>
            <p className="text-[11px] leading-tight text-on-surface-variant line-clamp-2">
              {profile.address || 'Shop No. 1, Main Market Road'}, {stateName} - {profile.pincode || '411001'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-0.5">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="h-10 px-3 rounded-xl bg-surface-container text-on-surface font-label-md text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[17px]">edit</span>
            <span>Edit Profile</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="h-10 px-3 rounded-xl bg-surface-container text-on-surface font-label-md text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[17px]">qr_code_2</span>
            <span>Store QR</span>
          </button>
        </div>
      </section>

      {/* GROUP 2: Invoicing & Printing Setup (Stitch Design) */}
      <section className="flex flex-col gap-2">
        <div className="px-1 flex items-center justify-between">
          <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
            Billing &amp; Printing Setup
          </h3>
          <span className="font-label-sm text-[11px] text-secondary font-bold">
            Default: {defaultPrintOption === 'Thermal-58mm' ? '2" (58mm) BT' : defaultPrintOption === 'Thermal-80mm' ? '3" (80mm) POS' : 'A4 Laser'}
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
          {/* Default Print Format Direct Toggle */}
          <div className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container-low transition-colors">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">print</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-label-md text-sm font-bold text-on-surface">Default Print Format</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-high text-on-surface-variant">Device Only</span>
                </div>
                <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                  Choose whether invoices open in A4 Laser or Thermal Slip by default
                </div>
              </div>
            </div>

            <div className="flex items-center bg-surface-container p-1 rounded-xl border border-outline-variant/30 gap-1 self-start sm:self-auto flex-wrap">
              {[
                { id: 'A4', label: 'A4 Laser', icon: 'description' },
                { id: 'Thermal-80mm', label: '3" (80mm)', icon: 'receipt_long' },
                { id: 'Thermal-58mm', label: '2" (58mm)', icon: 'receipt' },
              ].map((opt) => {
                const isSelected =
                  defaultPrintOption === opt.id ||
                  (opt.id === 'A4' && (!defaultPrintOption || defaultPrintOption === 'None'));
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleDefaultPrintOptionChange(opt.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thermal Printing Themes & Details Link */}
          <button
            type="button"
            onClick={() => setActiveTab('print')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">tune</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Invoice Themes &amp; Thermal Printing Details</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                Current Default: {defaultPrintOption === 'Thermal-58mm' ? '2-Inch (58mm) Thermal' : defaultPrintOption === 'Thermal-80mm' ? '3-Inch (80mm) Thermal' : 'Standard A4 Laser'}
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>
        </div>
      </section>

      {/* GROUP 3: Banking & UPI Payments (Stitch Design) */}
      <section className="flex flex-col gap-2">
        <div className="px-1 flex items-center justify-between">
          <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
            Payments &amp; Banking
          </h3>
          <span className="font-label-sm text-[11px] text-on-surface-variant font-bold">Default UPI Linked</span>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
          {/* Bank Accounts & Default UPI QR */}
          <button
            type="button"
            onClick={() => setActiveSubModal('banking_upi')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Bank Accounts &amp; Default UPI QR</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                {profile.bankName || 'HDFC Bank'} • UPI: {profile.upiId || 'Not Configured'}
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>
        </div>
      </section>

      {/* GROUP 4: Staff Roles & Permissions (Stitch Design) */}
      <section className="flex flex-col gap-2">
        <div className="px-1">
          <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
            Staff Access &amp; Protection
          </h3>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
          <button
            type="button"
            onClick={() => setActiveSubModal('staff_roles')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">group</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Staff Roles &amp; Permissions</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                3 Roles: Owner (Full PIN), Cashier (Bill Only), CA (Audit &amp; Books)
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>
        </div>
      </section>
    </>
  );
};
