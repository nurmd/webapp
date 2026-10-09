import React from 'react';
import { CompanyProfile } from '../../../models/company.ts';

export interface EditBusinessProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CompanyProfile;
  setProfile: React.Dispatch<React.SetStateAction<CompanyProfile>>;
  handleSaveProfile: (e: React.FormEvent) => void;
  isGstActive: boolean;
  stateName: string;
}

export const EditBusinessProfileModal: React.FC<EditBusinessProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  setProfile,
  handleSaveProfile,
  isGstActive,
  stateName,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-outline-variant/30">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[24px]">store</span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">Edit Business Profile</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div>
            <label className="font-bold text-on-surface block mb-1">Business / Registered Name *</label>
            <input
              type="text"
              required
              value={profile.businessName}
              onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
              className="w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
            />
          </div>

          <div>
            <label className="font-bold text-on-surface block mb-1">Trade Name / Slogan</label>
            <input
              type="text"
              value={profile.tradeName || ''}
              onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
              className="w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
            />
          </div>

          {/* Reference to GST & Legal Tax Configuration */}
          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[16px]">tune</span>
                <span className="font-bold text-on-surface text-xs">GST &amp; Legal Tax Configuration</span>
              </div>
              <span className="text-[11px] text-on-surface-variant truncate block mt-0.5">
                {isGstActive
                  ? `GSTIN: ${profile.gstin || 'Not configured'} • State: ${stateName} (${profile.stateCode})`
                  : 'GST Mode: Disabled'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                setTimeout(() => {
                  document.getElementById('gst-tax-config')?.scrollIntoView({ behavior: 'smooth' });
                }, 150);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-surface-container text-secondary font-bold text-[11px] hover:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1"
            >
              <span>Configure</span>
              <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-on-surface block mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-on-surface block mb-1">Email Address</label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full bg-surface-container-low px-3 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-on-surface block mb-1">Registered Address</label>
            <textarea
              rows={2}
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
            />
          </div>

          <div className="pt-2 border-t border-outline-variant/20 space-y-3">
            <h4 className="font-bold text-secondary text-xs uppercase">Banking & Payment Setup</h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-on-surface block mb-1">Bank Name</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Bank"
                  value={profile.bankName || ''}
                  onChange={(e) => setProfile({ ...profile, bankName: e.target.value })}
                  className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-on-surface block mb-1">Account Number</label>
                <input
                  type="text"
                  placeholder="e.g. 50200012345678"
                  value={profile.accountNumber || ''}
                  onChange={(e) => setProfile({ ...profile, accountNumber: e.target.value })}
                  className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-on-surface block mb-1">IFSC Code</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC0001234"
                  value={profile.ifscCode || ''}
                  onChange={(e) => setProfile({ ...profile, ifscCode: e.target.value.toUpperCase() })}
                  className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-mono uppercase font-bold outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-on-surface block mb-1">Default UPI VPA / ID</label>
                <input
                  type="text"
                  placeholder="merchant@upi"
                  value={profile.upiId || ''}
                  onChange={(e) => setProfile({ ...profile, upiId: e.target.value.trim() })}
                  className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-on-surface block mb-1">Invoice Numbering Prefix</label>
              <input
                type="text"
                placeholder="e.g. INV-2024-"
                value={profile.invoicePrefix || ''}
                onChange={(e) => setProfile({ ...profile, invoicePrefix: e.target.value.trim() })}
                className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-outline-variant/20 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-outline-variant/40 text-on-surface font-bold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-md hover:bg-secondary/90 active:scale-95 transition-all"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
