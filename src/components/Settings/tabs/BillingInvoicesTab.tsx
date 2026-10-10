import React from 'react';
import { CompanyProfile } from '../../../models/company.ts';

export interface BillingInvoicesTabProps {
  profile: CompanyProfile;
  defaultPrintOption: string;
  handleDefaultPrintOptionChange: (opt: string) => void;
  setIsQrModalOpen: (open: boolean) => void;
  setActiveSubModal: (modal: string | null) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const BillingInvoicesTab: React.FC<BillingInvoicesTabProps> = ({
  profile,
  defaultPrintOption,
  handleDefaultPrintOptionChange,
  setIsQrModalOpen,
  setActiveSubModal,
  onNavigateToTab,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* 1. Invoice Prefix & Numbering Series Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">tag</span>
            </div>
            <div>
              <h3 className="font-label-md text-sm font-bold text-on-surface">Invoice Numbering &amp; Prefix</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Sequential financial series &amp; POS billing formats</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
            FY 2026-27 Active
          </span>
        </div>

        <div className="bg-surface-container-low/70 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-on-surface-variant font-medium block">Active Invoice Prefix:</span>
            <span className="font-mono text-sm font-bold text-secondary">
              {profile.invoicePrefix || 'INV-2026-'}
            </span>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Auto-increments sequentially: {profile.invoicePrefix || 'INV-2026-'}0001, {profile.invoicePrefix || 'INV-2026-'}0002
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveSubModal('prefix_series')}
            className="px-3.5 py-2 rounded-xl bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">edit</span>
            <span>Configure Series</span>
          </button>
        </div>
      </section>

      {/* 2. Bank Accounts & UPI Payment Details */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
            </div>
            <div>
              <h3 className="font-label-md text-sm font-bold text-on-surface">Payment QR &amp; Bank Details</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Printed on invoices &amp; dynamic UPI collection QR</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
            Instant UPI
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-surface-container-low/70 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[11px] text-on-surface-variant font-medium">Bank Account:</span>
            <span className="font-bold text-on-surface">{profile.bankName || 'HDFC Bank'}</span>
            <span className="font-mono text-[11px] text-on-surface-variant">
              A/C: {profile.accountNumber ? `••••${profile.accountNumber.slice(-4)}` : 'Not Configured'}
            </span>
            <span className="font-mono text-[10px] text-outline">IFSC: {profile.ifscCode || 'HDFC0001234'}</span>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[11px] text-on-surface-variant font-medium">UPI Collection VPA:</span>
            <span className="font-mono font-bold text-secondary truncate">{profile.upiId || 'Not Configured'}</span>
            <span className="text-[10px] text-on-surface-variant">Generates dynamic intent QR code on invoice bills</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setActiveSubModal('banking_upi')}
            className="flex-1 py-2 px-3 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">tune</span>
            <span>Bank &amp; UPI Setup</span>
          </button>
          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="flex-1 py-2 px-3 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">qr_code_2</span>
            <span>View Store QR</span>
          </button>
        </div>
      </section>

      {/* 3. Default Print Format Direct Selector */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">print</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-label-md text-sm font-bold text-on-surface">Default Print Format</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-high text-on-surface-variant">
                  Device Local
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                Format applied when opening or sharing invoices from billing counter
              </p>
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

        {onNavigateToTab && (
          <div className="pt-2 border-t border-outline-variant/15 flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant">Looking for printer margins, thermal paper width, or A4 templates?</span>
            <button
              type="button"
              onClick={() => onNavigateToTab('hardware_printing')}
              className="text-xs font-bold text-secondary hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Hardware &amp; Printing Setup</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        )}
      </section>

      {/* 4. Automated WhatsApp & SMS Reminders */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
        <button
          type="button"
          onClick={() => setActiveSubModal('whatsapp_alerts')}
          className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center text-secondary flex-shrink-0">
            <span className="material-symbols-outlined text-[22px]">chat</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-label-md text-sm font-bold text-on-surface">Automated WhatsApp &amp; SMS Alerts</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-secondary-container text-on-secondary-container">
                Ready
              </span>
            </div>
            <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
              Instant bill PDF sharing • Dynamic UPI Payment reminders &amp; overdue alerts
            </div>
          </div>
          <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
        </button>
      </section>
    </div>
  );
};
