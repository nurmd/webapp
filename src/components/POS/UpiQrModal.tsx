import React, { useState } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR } from '../../core/utils/formatters.ts';

interface UpiQrModalProps {
  isOpen: boolean;
  amount: number;
  company: CompanyProfile;
  invoiceNumber: string;
  onPaymentConfirmed: () => void;
  onClose: () => void;
}

export const UpiQrModal: React.FC<UpiQrModalProps> = ({
  isOpen,
  amount,
  company,
  invoiceNumber,
  onPaymentConfirmed,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const upiId = company.upiId || 'merchant@upi';
  const merchantName = company.tradeName || company.businessName || 'Store';
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
    merchantName
  )}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Bill ${invoiceNumber}`)}`;

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
    upiUrl
  )}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(upiUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-sm shadow-2xl flex flex-col items-center p-5 text-center">
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">qr_code_2</span>
            <span className="font-headline-sm text-sm font-bold text-on-surface">Dynamic UPI QR</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {/* Amount Badge */}
        <div className="mb-3">
          <div className="text-xs text-outline font-semibold">Total Amount Due</div>
          <div className="text-2xl font-black text-secondary font-tabular-data mt-0.5">
            {formatINR(amount)}
          </div>
          <div className="text-[11px] text-outline mt-0.5">Bill #{invoiceNumber}</div>
        </div>

        {/* QR Code Container */}
        <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-200 mb-3 flex flex-col items-center">
          <img
            src={qrImageUrl}
            alt="UPI QR Code"
            className="w-48 h-48 block rounded-lg"
            loading="eager"
          />
          <div className="flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Scan with any UPI App (GPay, PhonePe, Paytm)</span>
          </div>
        </div>

        {/* VPA Details */}
        <div className="bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline-variant/20 flex items-center justify-between w-full mb-4 text-xs">
          <div className="text-left truncate mr-2">
            <span className="text-outline text-[10px] block">Payee VPA:</span>
            <span className="font-mono font-bold text-on-surface truncate">{upiId}</span>
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-2 py-1 text-[11px] font-semibold text-secondary hover:underline cursor-pointer flex-shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-2">
          <button
            type="button"
            onClick={() => {
              onPaymentConfirmed();
              onClose();
            }}
            className="w-full py-2.5 bg-secondary text-on-secondary rounded-xl font-bold text-sm shadow-md hover:bg-secondary/90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span>Payment Received (Confirm)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-1.5 text-xs font-semibold text-outline hover:bg-surface-container rounded-xl cursor-pointer"
          >
            Cancel / Change Payment Mode
          </button>
        </div>
      </div>
    </div>
  );
};
