import React from 'react';
import { CompanyProfile } from '../../../models/company.ts';

export interface StoreQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CompanyProfile;
}

export const StoreQrModal: React.FC<StoreQrModalProps> = ({
  isOpen,
  onClose,
  profile,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30 text-center flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-secondary text-on-secondary flex items-center justify-center shadow-md">
          <span className="material-symbols-outlined text-[28px]">qr_code_2</span>
        </div>
        <h3 className="font-headline-sm text-base font-bold text-on-surface">{profile.businessName}</h3>
        <p className="text-xs text-on-surface-variant font-medium">Scan with any UPI App to Pay</p>

        {/* QR Mock / Box */}
        <div className="w-48 h-48 rounded-2xl bg-surface p-3 border-2 border-dashed border-secondary/40 flex flex-col items-center justify-center shadow-inner my-2">
          <span className="material-symbols-outlined text-6xl text-secondary">qr_code_2</span>
          <span className="text-[11px] font-mono text-outline font-bold mt-1">
            {profile.upiId || 'merchant@upi'}
          </span>
        </div>

        <p className="text-[11px] text-outline font-semibold">
          This QR code is automatically embedded onto thermal receipts and PDF invoices.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 mt-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-md cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};
