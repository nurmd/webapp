import React, { useState } from 'react';
import { CompanyProfile } from '../models/company.ts';
import { Monitor, Smartphone, Globe, Plus, ShoppingCart, CheckCircle2 } from 'lucide-react';

export function maskGstin(gstin?: string): string {
  if (!gstin) return '';
  const trimmed = gstin.trim();
  if (trimmed.length < 6) return trimmed;
  const prefix = trimmed.slice(0, 2);
  const suffix = trimmed.slice(-3);
  return `${prefix}••••••••${suffix}`;
}

interface NavbarProps {
  company: CompanyProfile;
  onNewInvoice: () => void;
  onQuickPos: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ company, onNewInvoice, onQuickPos }) => {
  const [isGstinMasked, setIsGstinMasked] = useState(true);

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-surface-container-lowest border-b border-outline-variant/30 shrink-0 gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        {/* Brand Logo from Stitch */}
        <img
          src="/logo.svg"
          alt="Vyapar Modern Logo"
          className="w-9 h-9 rounded-xl shadow-xs"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-lg font-extrabold text-on-surface m-0">
              {company.businessName}
            </h1>
            {company.isGstEnabled !== false && (
              <button
                type="button"
                onClick={() => setIsGstinMasked((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/25 active:scale-95 transition-all"
                title={isGstinMasked ? "Click to reveal full GSTIN" : "Click to mask GSTIN for privacy"}
              >
                <CheckCircle2 size={12} />
                <span>GSTIN: {isGstinMasked ? maskGstin(company.gstin) : company.gstin}</span>
                <span className="material-symbols-outlined text-[13px] ml-0.5 opacity-70">
                  {isGstinMasked ? 'visibility' : 'visibility_off'}
                </span>
              </button>
            )}
          </div>
          <div className="text-xs text-on-surface-variant">
            {company.address} • Ph: {company.phone}
          </div>
        </div>
      </div>

      {/* Cross-Platform Badges & Quick Action Buttons */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-2 bg-surface-container-low px-2.5 py-1 rounded-lg border border-outline-variant/30 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400" title="Web / PWA">
            <Globe size={13} /> Web
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="Android APK">
            <Smartphone size={13} /> Android
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400" title="Linux & Windows">
            <Monitor size={13} /> Desktop
          </span>
        </div>

        <button
          onClick={onQuickPos}
          className="flex items-center gap-1.5 bg-secondary text-on-secondary px-3.5 py-2 rounded-xl cursor-pointer font-bold text-xs shadow-xs hover:opacity-95 active:scale-95 transition-all"
        >
          <ShoppingCart size={16} />
          <span>POS Billing</span>
        </button>

        <button
          onClick={onNewInvoice}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-3.5 py-2 rounded-xl cursor-pointer font-bold text-xs shadow-xs hover:opacity-95 active:scale-95 transition-all"
        >
          <Plus size={16} />
          <span>New Invoice</span>
        </button>

        {/* Profile Avatar from Stitch */}
        <img
          src="/avatar.png"
          alt="Merchant Profile"
          className="w-8 h-8 rounded-full object-cover border-2 border-primary/40"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    </header>
  );
};
