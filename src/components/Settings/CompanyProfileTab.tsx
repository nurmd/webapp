import React from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';

export interface CompanyProfileTabProps {
  profile: CompanyProfile;
  isGstActive: boolean;
  stateName: string;
  defaultPrintOption: string;
  handleDefaultPrintOptionChange: (opt: string) => void;
  setIsEditModalOpen: (open: boolean) => void;
  setIsQrModalOpen: (open: boolean) => void;
  setActiveTab?: (tab: any) => void;
  setActiveSubModal: (modal: string | null) => void;
  // Optional GST & Compliance extensions
  handleToggleGst?: (newEnabled?: boolean) => void;
  handleGstinChange?: (gstin: string) => void;
  feedback?: string | null;
  setProfile?: React.Dispatch<React.SetStateAction<CompanyProfile>>;
  onSave?: (updated: CompanyProfile) => void;
  setSavedNotice?: (saved: boolean) => void;
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
  handleToggleGst,
  handleGstinChange,
  feedback,
  setProfile,
  onSave,
  setSavedNotice,
}) => {
  return (
    <div className="flex flex-col gap-4">
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
                  if (setActiveTab) {
                    setActiveTab('general');
                  }
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

      {/* GST & Compliance Section (if handleToggleGst is wired) */}
      {handleToggleGst && (
        <section id="gst-tax-config" className="flex flex-col gap-2.5 scroll-mt-20">
          <div className="px-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-secondary">tune</span>
              <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                GST &amp; Legal Tax Configuration
              </h3>
            </div>
            <span className={`font-label-sm text-[11px] font-bold ${isGstActive ? 'text-secondary' : 'text-on-surface-variant'}`}>
              {isGstActive ? 'GST Mode: Regular' : 'GST Mode: Disabled'}
            </span>
          </div>

          {/* Master GST Billing Toggle Card */}
          <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                isGstActive ? 'bg-secondary/15 text-secondary' : 'bg-surface-container text-on-surface-variant'
              }`}>
                <span className="material-symbols-outlined text-[22px]">
                  {isGstActive ? 'verified' : 'power_settings_new'}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-label-md text-sm font-bold text-on-surface">Enable GST Billing</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isGstActive
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                    {isGstActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <p className="font-body-sm text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                  {isGstActive
                    ? 'Tax rates (CGST/SGST/IGST), GSTIN validation, HSN/SAC codes & E-Way bills active.'
                    : 'Tax calculations and tax tags hidden across the app. Generate clean direct bills.'}
                </p>
              </div>
            </div>

            {/* Interactive Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={isGstActive}
              onClick={() => handleToggleGst()}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                isGstActive ? 'bg-secondary' : 'bg-surface-container-highest'
              }`}
              title={isGstActive ? 'Click to disable GST' : 'Click to enable GST'}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                  isGstActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {!isGstActive && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] flex-shrink-0">info</span>
              <span>GST-related settings below are deactivated. Toggle switch above to activate GST compliance &amp; tax slabs.</span>
            </div>
          )}

          {/* Business GSTIN & State Tax Registration Card */}
          <div className={`bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3.5 ${
            !isGstActive ? 'opacity-65' : ''
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">badge</span>
                <div>
                  <h4 className="font-label-md text-sm font-bold text-on-surface">GSTIN &amp; Tax Registration</h4>
                  <p className="font-body-sm text-[11px] text-on-surface-variant">Business GSTIN number, State Place of Supply &amp; Filing Scheme</p>
                </div>
              </div>
              {isGstActive && (
                <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
                  Regular Taxpayer
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-on-surface block mb-1">
                  GSTIN {isGstActive ? '(15 Digits)' : '(Disabled)'}
                </label>
                <input
                  type="text"
                  maxLength={15}
                  disabled={!isGstActive}
                  value={isGstActive ? profile.gstin : ''}
                  placeholder={isGstActive ? '27AABCU9603R1ZN' : 'Disabled'}
                  onChange={(e) => handleGstinChange && handleGstinChange(e.target.value)}
                  className={`w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-mono font-bold uppercase outline-none focus:border-secondary ${
                    !isGstActive ? 'opacity-50 cursor-not-allowed bg-surface-container' : ''
                  }`}
                />
                {isGstActive && feedback && (
                  <p className="text-[10px] text-secondary font-medium mt-1">{feedback}</p>
                )}
              </div>

              <div>
                <label className="font-bold text-on-surface block mb-1">Default Place of Supply (POS) State</label>
                <select
                  disabled={!isGstActive}
                  value={profile.stateCode}
                  onChange={(e) => {
                    const updated = { ...profile, stateCode: e.target.value };
                    if (setProfile) setProfile(updated);
                    if (onSave) onSave(updated);
                    if (setSavedNotice) {
                      setSavedNotice(true);
                      setTimeout(() => setSavedNotice(false), 2000);
                    }
                  }}
                  className={`w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none focus:border-secondary ${
                    !isGstActive ? 'opacity-50 cursor-not-allowed bg-surface-container' : ''
                  }`}
                >
                  {getStateList().map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-on-surface-variant flex-wrap gap-2">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-secondary">verified</span>
                {isGstActive ? `PAN: ${profile.pan || 'Extracted from GSTIN'} • State: ${stateName} (${profile.stateCode})` : 'Tax calculation disabled'}
              </span>
              {isGstActive && onSave && (
                <button
                  type="button"
                  onClick={() => {
                    onSave(profile);
                    if (setSavedNotice) {
                      setSavedNotice(true);
                      setTimeout(() => setSavedNotice(false), 2000);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-bold text-[11px] hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  Save GSTIN
                </button>
              )}
            </div>
          </div>

          {/* Submodals: GST & Tax Rates, State & Place of Supply, E-Way Bill & E-Invoice */}
          <div className={`bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col ${
            !isGstActive ? 'opacity-65' : ''
          }`}>
            <button
              type="button"
              onClick={() => setActiveSubModal('tax_rates')}
              className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isGstActive ? 'bg-surface-container text-on-surface' : 'bg-surface-container-low text-on-surface-variant'
              }`}>
                <span className="material-symbols-outlined text-[22px]">account_balance</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-label-md text-sm font-bold text-on-surface">GST &amp; Tax Rates</span>
                  {!isGstActive && (
                    <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant text-[10px] font-bold">
                      Disabled
                    </span>
                  )}
                </div>
                <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                  {isGstActive
                    ? 'Slab rates 0%, 0.1%, 0.25%, 3%, 5%, 12%, 18%, 28% • RCM & Cess Ready'
                    : 'Standard slabs dormant while GST is disabled'}
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubModal('place_of_supply')}
              className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isGstActive ? 'bg-surface-container text-on-surface' : 'bg-surface-container-low text-on-surface-variant'
              }`}>
                <span className="material-symbols-outlined text-[22px]">map</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-label-md text-sm font-bold text-on-surface">State &amp; Place of Supply Rules</span>
                  {!isGstActive && (
                    <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant text-[10px] font-bold">
                      Disabled
                    </span>
                  )}
                </div>
                <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                  {stateName} ({profile.stateCode}) • {isGstActive ? 'Auto CGST+SGST / IGST Engine' : 'Intra/Interstate tax engine paused'}
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubModal('eway_bill')}
              className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isGstActive ? 'bg-surface-container text-on-surface' : 'bg-surface-container-low text-on-surface-variant'
              }`}>
                <span className="material-symbols-outlined text-[22px]">local_shipping</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-label-md text-sm font-bold text-on-surface">E-Way Bill &amp; E-Invoice API</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    isGstActive
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                    {isGstActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                  {isGstActive
                    ? 'Threshold ₹50,000 • Official NIC Portal JSON v1.1'
                    : 'NIC JSON generation paused (Disabled)'}
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
            </button>
          </div>
        </section>
      )}

      {/* If legacy mode (no handleToggleGst), render legacy billing & staff groups */}
      {!handleToggleGst && (
        <>
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

              {setActiveTab && (
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
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="px-1 flex items-center justify-between">
              <h3 className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                Payments &amp; Banking
              </h3>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
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
      )}
    </div>
  );
};
