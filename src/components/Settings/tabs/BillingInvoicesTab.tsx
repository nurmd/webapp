import React, { useState, useEffect } from 'react';
import { CompanyProfile } from '../../../models/company.ts';
import {
  formatDocumentNumberPreview,
  getDocumentSeriesConfig,
  getFinancialYearString,
} from '../../../core/utils/invoiceNumber.ts';
import { db } from '../../../services/db.ts';
import { printSettingsService, AppPrintSettings } from '../../../services/printSettingsService.ts';
import { showAppToast } from '../../../services/toast.ts';

export interface BillingInvoicesTabProps {
  profile: CompanyProfile;
  setProfile?: React.Dispatch<React.SetStateAction<CompanyProfile>>;
  onSave?: (updated: CompanyProfile) => void;
  isGstActive?: boolean;
  defaultPrintOption: string;
  handleDefaultPrintOptionChange: (opt: string) => void;
  setIsQrModalOpen: (open: boolean) => void;
  setActiveSubModal?: (modal: string | null) => void;
  setIsPrefixModalOpen?: (open: boolean) => void;
  setIsEditProfileModalOpen?: (open: boolean) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const BillingInvoicesTab: React.FC<BillingInvoicesTabProps> = ({
  profile,
  setProfile,
  onSave,
  isGstActive = true,
  defaultPrintOption,
  handleDefaultPrintOptionChange,
  setIsQrModalOpen,
  setActiveSubModal,
  setIsPrefixModalOpen,
  setIsEditProfileModalOpen,
  onNavigateToTab,
}) => {
  // Document series previews
  const salesCfg = getDocumentSeriesConfig(profile, 'SALES_INVOICE');
  const posCfg = getDocumentSeriesConfig(profile, 'POS_INVOICE');
  const estCfg = getDocumentSeriesConfig(profile, 'ESTIMATE');
  const cnCfg = getDocumentSeriesConfig(profile, 'CREDIT_NOTE');

  const salesPreview = formatDocumentNumberPreview(salesCfg, salesCfg.startingNumber || 1);
  const posPreview = formatDocumentNumberPreview(posCfg, posCfg.startingNumber || 1);
  const estPreview = formatDocumentNumberPreview(estCfg, estCfg.startingNumber || 1);
  const cnPreview = formatDocumentNumberPreview(cnCfg, cnCfg.startingNumber || 1);

  // Terms and conditions state
  const [termsText, setTermsText] = useState(
    profile.termsAndConditions ?? '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.'
  );
  const [isTermsSaved, setIsTermsSaved] = useState(false);

  useEffect(() => {
    if (profile.termsAndConditions !== undefined) {
      setTermsText(profile.termsAndConditions);
    }
  }, [profile.termsAndConditions]);

  // Default payment due days state
  const [selectedDueDays, setSelectedDueDays] = useState<number>(() => {
    return typeof db.getDefaultDueDays === 'function' ? db.getDefaultDueDays() : 15;
  });

  // Auto round-off state
  const [isAutoRoundOff, setIsAutoRoundOff] = useState<boolean>(() => {
    return typeof db.getAutoRoundOff === 'function' ? db.getAutoRoundOff() : true;
  });

  // Print settings (A4 / Thermal fields and toggles)
  const [printSettings, setPrintSettings] = useState<AppPrintSettings>(() => printSettingsService.getSettings());

  // Bank & UPI inline editor state
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [bankNameInput, setBankNameInput] = useState(profile.bankName || '');
  const [accountNumInput, setAccountNumInput] = useState(profile.accountNumber || '');
  const [ifscInput, setIfscInput] = useState(profile.ifscCode || '');
  const [upiInput, setUpiInput] = useState(profile.upiId || '');

  // Signatory text editing
  const [signatoryInput, setSignatoryInput] = useState(printSettings.a4.signatoryText || 'Authorised Signatory');

  useEffect(() => {
    setBankNameInput(profile.bankName || '');
    setAccountNumInput(profile.accountNumber || '');
    setIfscInput(profile.ifscCode || '');
    setUpiInput(profile.upiId || '');
  }, [profile]);

  const handleOpenPrefixSettings = () => {
    if (setIsPrefixModalOpen) {
      setIsPrefixModalOpen(true);
    } else if (setActiveSubModal) {
      setActiveSubModal('prefix_series');
    }
  };

  const handleToggleCompositionScheme = () => {
    const updated: CompanyProfile = {
      ...profile,
      isCompositionScheme: !profile.isCompositionScheme,
    };
    if (setProfile) setProfile(updated);
    if (onSave) onSave(updated);
    db.saveCompany(updated);
    showAppToast(
      updated.isCompositionScheme
        ? 'Switched to Composition Scheme (Bill of Supply)'
        : 'Switched to Regular GST Tax Invoice'
    );
  };

  const handleSaveTerms = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updated: CompanyProfile = {
      ...profile,
      termsAndConditions: termsText.trim(),
    };
    if (setProfile) setProfile(updated);
    if (onSave) onSave(updated);
    db.saveCompany(updated);
    setIsTermsSaved(true);
    showAppToast('Invoice Terms & Conditions saved');
    setTimeout(() => setIsTermsSaved(false), 2500);
  };

  const handleAddPresetClause = (clause: string) => {
    setTermsText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return clause;
      if (trimmed.includes(clause)) return prev;
      return `${trimmed}\n• ${clause}`;
    });
  };

  const handleSelectDueDays = (days: number) => {
    setSelectedDueDays(days);
    if (typeof db.setDefaultDueDays === 'function') {
      db.setDefaultDueDays(days);
    }
    const label = days === 0 ? 'Due on Receipt (Immediate)' : `Net ${days} Days`;
    showAppToast(`Default payment terms set to ${label}`);
  };

  const handleToggleAutoRoundOff = () => {
    const newVal = !isAutoRoundOff;
    setIsAutoRoundOff(newVal);
    if (typeof db.setAutoRoundOff === 'function') {
      db.setAutoRoundOff(newVal);
    }
    showAppToast(newVal ? 'Auto round-off enabled for invoices' : 'Auto round-off disabled');
  };

  const handleSaveBankDetails = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: CompanyProfile = {
      ...profile,
      bankName: bankNameInput.trim(),
      accountNumber: accountNumInput.trim(),
      ifscCode: ifscInput.trim().toUpperCase(),
      upiId: upiInput.trim(),
    };
    if (setProfile) setProfile(updated);
    if (onSave) onSave(updated);
    db.saveCompany(updated);
    setIsEditingBank(false);
    showAppToast('Bank & UPI details updated on invoices');
  };

  const updateA4Setting = <K extends keyof typeof printSettings.a4>(key: K, value: typeof printSettings.a4[K]) => {
    const updated: AppPrintSettings = {
      ...printSettings,
      a4: {
        ...printSettings.a4,
        [key]: value,
      },
    };
    setPrintSettings(updated);
    printSettingsService.saveSettings(updated);
    showAppToast('Invoice display preferences updated');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Status & Summary Strip */}
      <div className="bg-surface-container-lowest rounded-2xl p-3.5 sm:p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
          <span className="text-xs font-bold text-on-surface">Billing Engine Active</span>
          <span className="text-xs text-on-surface-variant font-mono">
            • FY {getFinancialYearString()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            profile.isCompositionScheme
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
              : 'bg-secondary/15 text-secondary border border-secondary/20'
          }`}>
            {profile.isCompositionScheme ? 'Bill of Supply' : 'GST Tax Invoice'}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-[11px] font-medium">
            Format: {defaultPrintOption === 'Thermal-58mm' ? '2" (58mm)' : defaultPrintOption === 'Thermal-80mm' ? '3" (80mm)' : 'A4 Laser'}
          </span>
        </div>
      </div>

      {/* 1. Invoice Prefix & Numbering Series Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">tag</span>
            </div>
            <div>
              <h3 className="font-label-md text-sm font-bold text-on-surface">Invoice Numbering &amp; Prefix Series</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Custom prefixes, fiscal years &amp; sequence counters across all billing documents</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
            FY {getFinancialYearString()} Active
          </span>
        </div>

        {/* Multi-Series Quick Overview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-surface-container-low/70 rounded-xl p-2.5 flex flex-col gap-0.5 border border-outline-variant/20">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Tax Invoice</span>
            <span className="font-mono text-xs font-extrabold text-secondary truncate">{salesPreview}</span>
            <span className="text-[9px] text-outline">B2B / B2C Standard</span>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-2.5 flex flex-col gap-0.5 border border-outline-variant/20">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">POS Counter</span>
            <span className="font-mono text-xs font-extrabold text-primary truncate">{posPreview}</span>
            <span className="text-[9px] text-outline">Quick Cash Receipt</span>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-2.5 flex flex-col gap-0.5 border border-outline-variant/20">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Estimate</span>
            <span className="font-mono text-xs font-extrabold text-secondary truncate">{estPreview}</span>
            <span className="text-[9px] text-outline">Quotation / Proforma</span>
          </div>

          <div className="bg-surface-container-low/70 rounded-xl p-2.5 flex flex-col gap-0.5 border border-outline-variant/20">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Credit Note</span>
            <span className="font-mono text-xs font-extrabold text-error truncate">{cnPreview}</span>
            <span className="text-[9px] text-outline">GST Table 9B</span>
          </div>
        </div>

        <div className="bg-surface-container-low/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="text-on-surface font-semibold block">Full Functional Multi-Document Control</span>
            <p className="text-[11px] text-on-surface-variant">
              Customize prefixes, delimiters (-, /, .), FY formats, padding digits, and starting counters for 8 document types.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenPrefixSettings}
            className="px-4 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold hover:bg-secondary/90 transition-all shadow-xs flex items-center justify-center gap-1.5 self-start sm:self-auto cursor-pointer active:scale-95 shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>Configure Prefix Series</span>
          </button>
        </div>
      </section>

      {/* 2. Invoice Type & Statutory Compliance (Moved Here) */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              profile.isCompositionScheme ? 'bg-amber-500/15 text-amber-600' : 'bg-secondary/15 text-secondary'
            }`}>
              <span className="material-symbols-outlined text-[22px]">domain_verification</span>
            </div>
            <div>
              <h3 className="font-label-md text-sm font-bold text-on-surface">Invoice Type &amp; Compliance Scheme</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Tax Invoice (Regular) vs. Bill of Supply (Composition Scheme)</p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            profile.isCompositionScheme
              ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
              : 'bg-secondary-container text-on-secondary-container'
          }`}>
            {profile.isCompositionScheme ? 'Composition Scheme' : 'Regular Taxpayer'}
          </span>
        </div>

        <div className="bg-surface-container-low/60 rounded-xl p-3.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-on-surface">
                {profile.isCompositionScheme ? 'Issuing: Bill of Supply' : 'Issuing: Standard GST Tax Invoice'}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
              {profile.isCompositionScheme
                ? 'Section 10 dealers cannot charge tax to customers. Tax breakdown tables and CGST/SGST/IGST columns are suppressed on bills.'
                : 'Standard GST tax invoice with full CGST/SGST/IGST tax rates, HSN summary, and input tax credit (ITC) eligibility for buyers.'}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={Boolean(profile.isCompositionScheme)}
            onClick={handleToggleCompositionScheme}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
              profile.isCompositionScheme ? 'bg-secondary' : 'bg-surface-container-highest'
            }`}
            title={profile.isCompositionScheme ? 'Switch to Regular Tax Invoice' : 'Switch to Composition Bill of Supply'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                profile.isCompositionScheme ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* 3. Invoice Customization & Display Fields (New - Standard Across GST Apps) */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">view_list</span>
            </div>
            <div>
              <h3 className="font-label-md text-sm font-bold text-on-surface">Invoice Columns &amp; Display Fields</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Configure line-item columns, customer balance &amp; statutory elements printed on bills</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
            Bill Layout
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Toggle: Customer Previous Khata Balance on Bill */}
          <div className="bg-surface-container-low/70 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-bold text-on-surface block truncate">Show Customer Balance</span>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                Prints previous khata balance, current bill, and total due at bottom of bills
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Toggle Customer Balance"
              aria-checked={printSettings.a4.showPartyBalance}
              onClick={() => updateA4Setting('showPartyBalance', !printSettings.a4.showPartyBalance)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                printSettings.a4.showPartyBalance ? 'bg-secondary' : 'bg-surface-container-highest'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                  printSettings.a4.showPartyBalance ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Auto Round-Off Grand Total */}
          <div className="bg-surface-container-low/70 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-bold text-on-surface block truncate">Auto Round-Off Grand Total</span>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                Automatically rounds off fractional paise to the nearest rupee (+/- paise)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Toggle Auto Round-Off"
              aria-checked={isAutoRoundOff}
              onClick={handleToggleAutoRoundOff}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                isAutoRoundOff ? 'bg-secondary' : 'bg-surface-container-highest'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                  isAutoRoundOff ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Toggle: HSN / SAC Column */}
          <div className="bg-surface-container-low/70 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-bold text-on-surface block truncate">Show HSN / SAC Column</span>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                Include GST tax classification codes in the item table
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={printSettings.a4.showHsnColumn}
              onClick={() => updateA4Setting('showHsnColumn', !printSettings.a4.showHsnColumn)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                printSettings.a4.showHsnColumn ? 'bg-secondary' : 'bg-surface-container-highest'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                  printSettings.a4.showHsnColumn ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Item Discount Column */}
          <div className="bg-surface-container-low/70 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-bold text-on-surface block truncate">Show Item Discount Column</span>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                Displays percentage &amp; savings per line item
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={printSettings.a4.showDiscountColumn}
              onClick={() => updateA4Setting('showDiscountColumn', !printSettings.a4.showDiscountColumn)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                printSettings.a4.showDiscountColumn ? 'bg-secondary' : 'bg-surface-container-highest'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                  printSettings.a4.showDiscountColumn ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Amount in Words */}
          <div className="bg-surface-container-low/70 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-bold text-on-surface block truncate">Show Amount in Words</span>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                Statutory amount transcription (e.g. Rupees Twelve Hundred Only)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={printSettings.a4.showAmountInWords}
              onClick={() => updateA4Setting('showAmountInWords', !printSettings.a4.showAmountInWords)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                printSettings.a4.showAmountInWords ? 'bg-secondary' : 'bg-surface-container-highest'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                  printSettings.a4.showAmountInWords ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Authorized Signatory Box */}
          <div className="bg-surface-container-low/70 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-bold text-on-surface block truncate">Authorised Signatory Box</span>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                Stamp &amp; signature line at the bottom right of bills
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={printSettings.a4.showSignatureBox}
              onClick={() => updateA4Setting('showSignatureBox', !printSettings.a4.showSignatureBox)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                printSettings.a4.showSignatureBox ? 'bg-secondary' : 'bg-surface-container-highest'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface-container-lowest shadow-sm transition-transform ${
                  printSettings.a4.showSignatureBox ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Signatory Label Input & Default Copy Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div>
            <label className="font-bold text-on-surface block mb-1">Signatory Title</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={signatoryInput}
                onChange={(e) => setSignatoryInput(e.target.value)}
                placeholder="Authorised Signatory"
                className="flex-1 bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none focus:border-secondary"
              />
              <button
                type="button"
                onClick={() => updateA4Setting('signatoryText', signatoryInput.trim() || 'Authorised Signatory')}
                className="px-3 py-1.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs hover:bg-surface-container-high transition-colors"
              >
                Apply
              </button>
            </div>
          </div>

          <div>
            <label className="font-bold text-on-surface block mb-1">Default Copy Label</label>
            <select
              value={printSettings.a4.defaultCopyLabel}
              onChange={(e) => updateA4Setting('defaultCopyLabel', e.target.value)}
              className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none focus:border-secondary"
            >
              <option value="ORIGINAL FOR RECIPIENT">ORIGINAL FOR RECIPIENT</option>
              <option value="DUPLICATE FOR TRANSPORTER">DUPLICATE FOR TRANSPORTER</option>
              <option value="TRIPLICATE FOR SUPPLIER">TRIPLICATE FOR SUPPLIER</option>
              <option value="CUSTOMER COPY">CUSTOMER COPY</option>
              <option value="OFFICE COPY">OFFICE COPY</option>
            </select>
          </div>
        </div>
      </section>

      {/* 4. Invoice Terms & Conditions & Notes (Moved Here) */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">policy</span>
            </div>
            <div>
              <h3 className="font-label-md text-sm font-bold text-on-surface">Invoice Terms &amp; Conditions</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Default legal footer, return policies &amp; declarations printed on customer bills</p>
            </div>
          </div>
          {isTermsSaved && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1 animate-fade-in">
              <span className="material-symbols-outlined text-[13px]">check</span>
              <span>Saved</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSaveTerms} className="flex flex-col gap-2.5">
          <textarea
            rows={3}
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
            placeholder="e.g. 1. Goods once sold will not be taken back.&#10;2. Subject to local jurisdiction."
            className="w-full bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium text-on-surface outline-none focus:border-secondary leading-relaxed resize-y"
          />

          {/* Quick preset insertion chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider shrink-0">
              Add Clause:
            </span>
            {[
              'Goods once sold will not be taken back.',
              'Interest @ 18% p.a. charged after due date.',
              'Subject to local jurisdiction only.',
              'Warranty as per manufacturer policy.',
              'E. & O.E.',
            ].map((clause) => (
              <button
                key={clause}
                type="button"
                onClick={() => handleAddPresetClause(clause)}
                className="px-2 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-[11px] text-on-surface-variant font-medium whitespace-nowrap border border-outline-variant/20 cursor-pointer active:scale-95 transition-all"
              >
                + {clause.split(' ')[0]} {clause.split(' ')[1]}...
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-outline">
              Prints automatically at the footer of A4 Tax Invoices and Thermal Receipts.
            </span>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold hover:bg-secondary/90 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[15px]">save</span>
              <span>Save Terms</span>
            </button>
          </div>
        </form>
      </section>

      {/* 5. Default Payment Terms & Due Date Period */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">calendar_month</span>
            </div>
            <div>
              <h3 className="font-label-md text-sm font-bold text-on-surface">Default Payment Terms &amp; Due Date</h3>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Default credit period automatically applied when creating new invoices</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
            {selectedDueDays === 0 ? 'Immediate' : `Net ${selectedDueDays} Days`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { days: 0, label: 'Due on Receipt', sub: 'Immediate Cash/UPI' },
            { days: 7, label: 'Net 7 Days', sub: 'Weekly Credit' },
            { days: 15, label: 'Net 15 Days', sub: 'Standard 2-Weeks' },
            { days: 30, label: 'Net 30 Days', sub: 'Monthly Credit' },
            { days: 45, label: 'Net 45 Days', sub: 'Extended Terms' },
          ].map((item) => {
            const isSelected = selectedDueDays === item.days;
            return (
              <button
                key={item.days}
                type="button"
                onClick={() => handleSelectDueDays(item.days)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                  isSelected
                    ? 'border-secondary bg-secondary/10 shadow-xs ring-1 ring-secondary'
                    : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container'
                }`}
              >
                <span className={`text-xs font-bold ${isSelected ? 'text-secondary' : 'text-on-surface'}`}>
                  {item.label}
                </span>
                <span className="text-[10px] text-on-surface-variant">{item.sub}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 6. Bank Accounts & UPI Payment Details */}
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

        {isEditingBank ? (
          <form onSubmit={handleSaveBankDetails} className="bg-surface-container-low/70 rounded-xl p-3.5 flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-on-surface block mb-1">Bank Name</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Bank"
                  value={bankNameInput}
                  onChange={(e) => setBankNameInput(e.target.value)}
                  className="w-full bg-surface-container-lowest px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="font-bold text-on-surface block mb-1">Account Number</label>
                <input
                  type="text"
                  placeholder="e.g. 50200012345678"
                  value={accountNumInput}
                  onChange={(e) => setAccountNumInput(e.target.value)}
                  className="w-full bg-surface-container-lowest px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="font-bold text-on-surface block mb-1">IFSC Code</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC0001234"
                  value={ifscInput}
                  onChange={(e) => setIfscInput(e.target.value.toUpperCase())}
                  className="w-full bg-surface-container-lowest px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-mono uppercase font-bold outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="font-bold text-on-surface block mb-1">UPI Collection ID (VPA)</label>
                <input
                  type="text"
                  placeholder="e.g. merchant@upi"
                  value={upiInput}
                  onChange={(e) => setUpiInput(e.target.value.trim())}
                  className="w-full bg-surface-container-lowest px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-medium outline-none focus:border-secondary"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setIsEditingBank(false)}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant font-medium text-xs hover:bg-surface-container"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-secondary text-on-secondary font-bold text-xs shadow-xs hover:bg-secondary/90"
              >
                Save Details
              </button>
            </div>
          </form>
        ) : (
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
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              if (setIsEditProfileModalOpen) {
                setIsEditProfileModalOpen(true);
              } else {
                setIsEditingBank(!isEditingBank);
              }
            }}
            className="flex-1 py-2 px-3 rounded-xl bg-surface-container text-on-surface text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">
              {isEditingBank ? 'close' : 'edit'}
            </span>
            <span>{isEditingBank ? 'Close Editor' : 'Edit Bank Details'}</span>
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

      {/* 7. Default Print Format Direct Selector */}
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

      {/* 8. Automated WhatsApp & SMS Reminders */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
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
        </div>

        <button
          type="button"
          onClick={() => {
            if (setActiveSubModal) {
              setActiveSubModal('whatsapp_alerts');
            } else {
              showAppToast('WhatsApp sharing active with dynamic UPI intent link');
            }
          }}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-xs font-bold text-secondary hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
        >
          Details
        </button>
      </section>
    </div>
  );
};
