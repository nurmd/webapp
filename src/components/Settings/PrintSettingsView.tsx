import React, { useState, useEffect } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import {
  printSettingsService,
  AppPrintSettings,
} from '../../services/printSettingsService.ts';

interface PrintSettingsViewProps {
  company: CompanyProfile;
  onBack?: () => void;
}

export const PrintSettingsView: React.FC<PrintSettingsViewProps> = ({
  company,
  onBack,
}) => {
  const [settings, setSettings] = useState<AppPrintSettings>(() =>
    printSettingsService.getSettings()
  );
  const [activeFormatTab, setActiveFormatTab] = useState<'A4' | 'THERMAL'>('A4');
  const [showLivePreview, setShowLivePreview] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    // If defaultFormat is thermal, pre-select thermal tab
    if (settings.defaultFormat.startsWith('Thermal')) {
      setActiveFormatTab('THERMAL');
    }
  }, []);

  const handleA4Change = <K extends keyof AppPrintSettings['a4']>(
    key: K,
    value: AppPrintSettings['a4'][K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      a4: {
        ...prev.a4,
        [key]: value,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleThermalChange = <K extends keyof AppPrintSettings['thermal']>(
    key: K,
    value: AppPrintSettings['thermal'][K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      thermal: {
        ...prev.thermal,
        [key]: value,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleDefaultFormatChange = (fmt: 'A4' | 'Thermal-58mm' | 'Thermal-80mm') => {
    setSettings((prev) => ({
      ...prev,
      defaultFormat: fmt,
      thermal: {
        ...prev.thermal,
        paperWidth: fmt === 'Thermal-80mm' ? 48 : 32,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    printSettingsService.saveSettings(settings);
    setHasUnsavedChanges(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleReset = () => {
    if (window.confirm('Reset all print settings to recommended defaults?')) {
      const reset = printSettingsService.resetDefaults();
      setSettings(reset);
      setHasUnsavedChanges(false);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    }
  };

  const a4 = settings.a4;
  const thermal = settings.thermal;

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 pb-32 gap-5 animate-fade-in">
      {/* Toast Saved Notification */}
      {savedNotice && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-md mx-auto bg-secondary text-on-secondary px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-fade-in font-bold text-xs">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span>Print settings saved and applied successfully!</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-outline-variant/20 pb-3">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-9 h-9 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer active:scale-95 transition-all"
              title="Back"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
          )}
          <div>
            <h1 className="font-headline-sm text-lg sm:text-xl font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[24px]">print</span>
              <span>Print &amp; Invoice Settings</span>
            </h1>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Customize headers, columns, terms, and paper layout for A4 and Thermal printers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all cursor-pointer"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 ${
              hasUnsavedChanges
                ? 'bg-secondary text-on-secondary hover:bg-secondary/90 active:scale-95'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>{hasUnsavedChanges ? 'Save Changes' : 'Saved'}</span>
          </button>
        </div>
      </div>

      {/* Global Default Print Format Selector Card */}
      <section className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[22px]">devices</span>
          </div>
          <div>
            <div className="font-label-md text-sm font-bold text-on-surface">Default Print Mode</div>
            <div className="font-body-sm text-xs text-on-surface-variant">
              Choose the primary printer format when clicking Print on sales invoices
            </div>
          </div>
        </div>

        <div className="flex bg-surface-container p-1 rounded-xl border border-outline-variant/30 gap-1 self-start sm:self-auto flex-wrap">
          {[
            { id: 'A4' as const, label: 'A4 Laser', icon: 'description' },
            { id: 'Thermal-80mm' as const, label: '3" Thermal (80mm)', icon: 'receipt_long' },
            { id: 'Thermal-58mm' as const, label: '2" Thermal (58mm)', icon: 'receipt' },
          ].map((opt) => {
            const isSelected = settings.defaultFormat === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleDefaultFormatChange(opt.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* TOP TOGGLE: SEPARATED BY TOP TOGGLE FOR A4 AND THERMAL */}
      <div className="flex bg-surface-container-low rounded-2xl p-1.5 gap-1.5 border border-outline-variant/20 shadow-xs sticky top-16 z-30 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveFormatTab('A4')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeFormatTab === 'A4'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm border border-outline-variant/30'
              : 'text-on-surface-variant hover:bg-surface-container-high/60'
          }`}
        >
          <span className="material-symbols-outlined text-[20px] text-primary">description</span>
          <span>A4 Laser / Desktop Invoice</span>
          {settings.defaultFormat === 'A4' && (
            <span className="text-[10px] bg-secondary/15 text-secondary px-2 py-0.5 rounded-full font-black">
              DEFAULT
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveFormatTab('THERMAL')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeFormatTab === 'THERMAL'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm border border-outline-variant/30'
              : 'text-on-surface-variant hover:bg-surface-container-high/60'
          }`}
        >
          <span className="material-symbols-outlined text-[20px] text-secondary">receipt_long</span>
          <span>Thermal POS Slip (58mm / 80mm)</span>
          {settings.defaultFormat.startsWith('Thermal') && (
            <span className="text-[10px] bg-secondary/15 text-secondary px-2 py-0.5 rounded-full font-black">
              DEFAULT
            </span>
          )}
        </button>
      </div>

      {/* TAB CONTENT: A4 LASER SETTINGS */}
      {activeFormatTab === 'A4' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Editable Settings (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Group 1: Document Header & Identity */}
            <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">badge</span>
                <h3 className="font-bold text-sm text-on-surface">Invoice Header &amp; Titles</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    Invoice Title Text
                  </label>
                  <input
                    type="text"
                    value={a4.invoiceTitle}
                    onChange={(e) => handleA4Change('invoiceTitle', e.target.value)}
                    placeholder="TAX INVOICE"
                    className="w-full h-10 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs font-bold text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    Default Copy Label
                  </label>
                  <select
                    value={a4.defaultCopyLabel}
                    onChange={(e) => handleA4Change('defaultCopyLabel', e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs font-bold text-on-surface focus:outline-none focus:border-secondary"
                  >
                    <option value="ORIGINAL FOR RECIPIENT">ORIGINAL FOR RECIPIENT</option>
                    <option value="DUPLICATE FOR TRANSPORTER">DUPLICATE FOR TRANSPORTER</option>
                    <option value="TRIPLICATE FOR SUPPLIER">TRIPLICATE FOR SUPPLIER</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Legal Subtitle / GST Rule Reference
                </label>
                <input
                  type="text"
                  value={a4.invoiceSubtitle}
                  onChange={(e) => handleA4Change('invoiceSubtitle', e.target.value)}
                  placeholder="(Issued under Section 31 of CGST Act, 2017)"
                  className="w-full h-10 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-secondary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/20">
                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showLogo}
                    onChange={(e) => handleA4Change('showLogo', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Store Logo</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showPhone}
                    onChange={(e) => handleA4Change('showPhone', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Phone Number</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showEmail}
                    onChange={(e) => handleA4Change('showEmail', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Email Address</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showReverseCharge}
                    onChange={(e) => handleA4Change('showReverseCharge', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Reverse Charge Notice</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showStateCode}
                    onChange={(e) => handleA4Change('showStateCode', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show State &amp; Code</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showDueDate}
                    onChange={(e) => handleA4Change('showDueDate', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Due Date</span>
                </label>
              </div>
            </div>

            {/* Group 2: Table Columns & Totals */}
            <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">table_chart</span>
                <h3 className="font-bold text-sm text-on-surface">Item Table &amp; Calculation Display</h3>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showHsnColumn}
                    onChange={(e) => handleA4Change('showHsnColumn', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>HSN / SAC Code Column</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showDiscountColumn}
                    onChange={(e) => handleA4Change('showDiscountColumn', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Item Discount Column</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showTaxBreakdown}
                    onChange={(e) => handleA4Change('showTaxBreakdown', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Tax Breakdown Columns</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showTaxSummaryTable}
                    onChange={(e) => handleA4Change('showTaxSummaryTable', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>HSN Tax Summary Table</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showAmountInWords}
                    onChange={(e) => handleA4Change('showAmountInWords', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Total Amount in Words</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showTaxInWords}
                    onChange={(e) => handleA4Change('showTaxInWords', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Tax Amount in Words</span>
                </label>
              </div>
            </div>

            {/* Group 3: Bank Details, UPI QR & Footer */}
            <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">account_balance</span>
                <h3 className="font-bold text-sm text-on-surface">Payment, Signatures &amp; Footer</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showBankDetails}
                    onChange={(e) => handleA4Change('showBankDetails', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Bank Details Box</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showUpiQr}
                    onChange={(e) => handleA4Change('showUpiQr', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Dynamic UPI QR Code</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showPartyBalance}
                    onChange={(e) => handleA4Change('showPartyBalance', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Total Party Balance</span>
                </label>
              </div>

              {a4.showUpiQr && (
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    UPI QR Code Size
                  </label>
                  <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 text-xs font-bold w-fit">
                    {(['small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => handleA4Change('qrSize', sz)}
                        className={`px-3 py-1 rounded-md capitalize transition-all cursor-pointer ${
                          a4.qrSize === sz
                            ? 'bg-secondary text-on-secondary shadow-xs'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-outline-variant/20">
                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a4.showSignatureBox}
                    onChange={(e) => handleA4Change('showSignatureBox', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Signatory Box</span>
                </label>

                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    Signatory Designation Text
                  </label>
                  <input
                    type="text"
                    value={a4.signatoryText}
                    onChange={(e) => handleA4Change('signatoryText', e.target.value)}
                    placeholder="Authorised Signatory"
                    className="w-full h-9 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Terms &amp; Conditions (One per line)
                </label>
                <textarea
                  rows={2}
                  value={a4.termsAndConditions}
                  onChange={(e) => handleA4Change('termsAndConditions', e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-xs text-on-surface font-mono focus:outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Custom Footer Note
                </label>
                <input
                  type="text"
                  value={a4.customFooterNote}
                  onChange={(e) => handleA4Change('customFooterNote', e.target.value)}
                  placeholder="Thank you for your business!"
                  className="w-full h-9 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-secondary"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Live A4 Visual Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-bold text-xs uppercase tracking-wider text-on-surface-variant">
                Live A4 Invoice Preview
              </span>
              <button
                type="button"
                onClick={() => setShowLivePreview(!showLivePreview)}
                className="text-xs font-bold text-secondary cursor-pointer"
              >
                {showLivePreview ? 'Collapse Preview' : 'Show Preview'}
              </button>
            </div>

            {showLivePreview && (
              <div className="bg-white text-slate-900 border-2 border-slate-900 rounded-sm shadow-md p-3 font-sans text-[10px] space-y-2 sticky top-36">
                {/* Header */}
                <div className="border-b border-slate-900 pb-1.5 flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-sm uppercase text-slate-950">
                      {company.tradeName || company.businessName || 'MY BUSINESS'}
                    </h4>
                    {a4.showPhone && company.phone && (
                      <p className="text-[9px] text-slate-600">Ph: {company.phone}</p>
                    )}
                    {a4.showEmail && company.email && (
                      <p className="text-[9px] text-slate-600">Email: {company.email}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-1.5 py-0.5 border border-slate-800 text-[8px] font-bold uppercase rounded bg-slate-50">
                      {a4.defaultCopyLabel.split(' ')[0]}
                    </span>
                    <h5 className="font-black text-xs uppercase text-slate-900 mt-0.5">
                      {a4.invoiceTitle}
                    </h5>
                  </div>
                </div>

                {/* Subtitle */}
                {a4.invoiceSubtitle && (
                  <p className="text-[8px] text-slate-500 text-center italic">
                    {a4.invoiceSubtitle}
                  </p>
                )}

                {/* Sample Items Table */}
                <table className="w-full border-collapse border border-slate-400 text-[9px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-400 text-slate-800 font-bold">
                      <th className="p-1 text-left">Item Description</th>
                      {a4.showHsnColumn && <th className="p-1 text-center">HSN</th>}
                      <th className="p-1 text-center">Qty</th>
                      <th className="p-1 text-right">Rate</th>
                      {a4.showDiscountColumn && <th className="p-1 text-right">Disc</th>}
                      <th className="p-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-1 font-semibold">Basmati Rice 5kg</td>
                      {a4.showHsnColumn && <td className="p-1 text-center text-slate-500">1006</td>}
                      <td className="p-1 text-center">2</td>
                      <td className="p-1 text-right">450.00</td>
                      {a4.showDiscountColumn && <td className="p-1 text-right text-emerald-700">5%</td>}
                      <td className="p-1 text-right font-bold">855.00</td>
                    </tr>
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-between items-center font-bold text-[10px] border-t border-b border-slate-900 py-1">
                  <span>Grand Total:</span>
                  <span>₹855.00</span>
                </div>

                {a4.showPartyBalance && (
                  <div className="flex justify-between items-center text-[9px] font-bold text-rose-700 bg-rose-50/50 px-1 py-0.5 rounded border border-rose-200 my-0.5">
                    <span>Total Party Balance:</span>
                    <span>₹1,250.00 (Dr - Due)</span>
                  </div>
                )}

                {/* Words */}
                {a4.showAmountInWords && (
                  <p className="text-[8px] text-slate-600">
                    INR: Eight Hundred Fifty Five Rupees Only
                  </p>
                )}

                {/* Bank / QR */}
                <div className="flex justify-between items-end pt-1 border-t border-slate-200 text-[8px]">
                  {a4.showBankDetails && (
                    <div className="text-slate-600">
                      <span className="font-bold text-slate-900 block">Bank Details:</span>
                      <span>Bank: {company.bankName || 'State Bank of India'}</span>
                      <br />
                      <span>A/C: {company.accountNumber || '1234567890'}</span>
                    </div>
                  )}
                  {a4.showSignatureBox && (
                    <div className="text-right">
                      <div className="h-6" />
                      <span className="font-bold border-t border-slate-800 pt-0.5 block">
                        {a4.signatoryText}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer Note */}
                {a4.customFooterNote && (
                  <p className="text-[8px] text-center text-slate-500 italic pt-1">
                    {a4.customFooterNote}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: THERMAL POS RECEIPT SETTINGS */}
      {activeFormatTab === 'THERMAL' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Editable Thermal Settings (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Group 1: Hardware & Paper Width */}
            <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">straighten</span>
                <h3 className="font-bold text-sm text-on-surface">Paper Width &amp; Hardware Commands</h3>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Thermal Paper Width
                </label>
                <div className="flex bg-surface-container rounded-xl p-1 border border-outline-variant/30 gap-1">
                  <button
                    type="button"
                    onClick={() => handleThermalChange('paperWidth', 32)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      thermal.paperWidth === 32
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    58mm / 2-Inch (32 Columns)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThermalChange('paperWidth', 48)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      thermal.paperWidth === 48
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    80mm / 3-Inch (48 Columns)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-outline-variant/20">
                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.autoCut}
                    onChange={(e) => handleThermalChange('autoCut', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Send Auto Paper Cut Command</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.kickDrawer}
                    onChange={(e) => handleThermalChange('kickDrawer', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Send Kick Cash Drawer Pulse</span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                  Blank Paper Feed Lines at End: {thermal.extraFeedLines} lines
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={thermal.extraFeedLines}
                  onChange={(e) => handleThermalChange('extraFeedLines', Number(e.target.value))}
                  className="w-full accent-secondary cursor-pointer"
                />
              </div>
            </div>

            {/* Group 2: Store Header & Contact on Slip */}
            <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">store</span>
                <h3 className="font-bold text-sm text-on-surface">Store Header &amp; Branding on Slip</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    Store Header Name
                  </label>
                  <input
                    type="text"
                    value={thermal.customStoreName}
                    onChange={(e) => handleThermalChange('customStoreName', e.target.value)}
                    placeholder={company.tradeName || company.businessName || 'Store Name'}
                    className="w-full h-10 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs font-bold text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    Receipt Badge Text
                  </label>
                  <input
                    type="text"
                    value={thermal.receiptTitle}
                    onChange={(e) => handleThermalChange('receiptTitle', e.target.value)}
                    placeholder="TAX INVOICE"
                    className="w-full h-10 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs font-bold text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/20">
                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.centerHeader}
                    onChange={(e) => handleThermalChange('centerHeader', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Center-align Store Header</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showAddress}
                    onChange={(e) => handleThermalChange('showAddress', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Store Address</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showPhone}
                    onChange={(e) => handleThermalChange('showPhone', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Contact Phone</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showGstin}
                    onChange={(e) => handleThermalChange('showGstin', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show GSTIN Number</span>
                </label>
              </div>
            </div>

            {/* Group 3: Items, Summary & QR */}
            <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">receipt</span>
                <h3 className="font-bold text-sm text-on-surface">Items, Summary &amp; Footer Notes</h3>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showItemDiscount}
                    onChange={(e) => handleThermalChange('showItemDiscount', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Item Discount line</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showRateBreakdown}
                    onChange={(e) => handleThermalChange('showRateBreakdown', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Rate × Qty line</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showHsn}
                    onChange={(e) => handleThermalChange('showHsn', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Item HSN</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showTaxBreakdown}
                    onChange={(e) => handleThermalChange('showTaxBreakdown', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show CGST / SGST lines</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showBalanceDue}
                    onChange={(e) => handleThermalChange('showBalanceDue', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Balance Due line</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showPartyBalance}
                    onChange={(e) => handleThermalChange('showPartyBalance', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Show Total Party Balance</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thermal.showUpiQr}
                    onChange={(e) => handleThermalChange('showUpiQr', e.target.checked)}
                    className="rounded text-secondary focus:ring-secondary w-4 h-4"
                  />
                  <span>Print Dynamic UPI QR</span>
                </label>
              </div>

              <div className="pt-2 border-t border-outline-variant/20 space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    Store Tagline / Greeting
                  </label>
                  <input
                    type="text"
                    value={thermal.greetingText}
                    onChange={(e) => handleThermalChange('greetingText', e.target.value)}
                    placeholder="Thank you! Visit again."
                    className="w-full h-9 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">
                    Jurisdiction / City Note
                  </label>
                  <input
                    type="text"
                    value={thermal.jurisdictionText}
                    onChange={(e) => handleThermalChange('jurisdictionText', e.target.value)}
                    placeholder="Subject to local jurisdiction"
                    className="w-full h-9 px-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Thermal POS Receipt Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-bold text-xs uppercase tracking-wider text-on-surface-variant">
                Live Thermal Slip Preview ({thermal.paperWidth === 32 ? '58mm' : '80mm'})
              </span>
              <button
                type="button"
                onClick={() => setShowLivePreview(!showLivePreview)}
                className="text-xs font-bold text-secondary cursor-pointer"
              >
                {showLivePreview ? 'Collapse Preview' : 'Show Preview'}
              </button>
            </div>

            {showLivePreview && (
              <div
                className={`bg-white text-slate-900 border border-slate-300 rounded-sm shadow-md p-3 font-mono text-[10px] space-y-1.5 sticky top-36 mx-auto ${
                  thermal.paperWidth === 32 ? 'max-w-[280px]' : 'max-w-[340px]'
                } w-full`}
              >
                <div className={thermal.centerHeader ? 'text-center' : 'text-left'}>
                  <h4 className="font-black text-xs uppercase text-slate-950">
                    {thermal.customStoreName || company.tradeName || company.businessName || 'STORE NAME'}
                  </h4>
                  {thermal.showAddress && company.address && (
                    <p className="text-[9px] text-slate-600 leading-tight">{company.address}</p>
                  )}
                  {thermal.showPhone && company.phone && (
                    <p className="text-[9px] text-slate-600">Ph: {company.phone}</p>
                  )}
                  {thermal.showGstin && company.gstin && (
                    <p className="text-[9px] font-bold text-slate-800">GSTIN: {company.gstin}</p>
                  )}
                  <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[8px] font-black uppercase border border-slate-300 rounded bg-slate-50">
                    {thermal.receiptTitle}
                  </span>
                </div>

                <div className="border-b border-dashed border-slate-400 my-1" />

                <div className="flex justify-between text-[9px]">
                  <span>Bill: INV-1001</span>
                  <span>06-Oct-2026</span>
                </div>

                <div className="border-b border-dashed border-slate-400 my-1" />

                {/* Items */}
                <div className="space-y-1 text-[9px]">
                  <div className="flex justify-between text-[8px] font-bold text-slate-500 border-b border-slate-200 pb-0.5">
                    <span>ITEM</span>
                    <div className="flex gap-2">
                      <span>QTY</span>
                      <span>RATE</span>
                      <span>TOTAL</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold">1. Basmati Rice 5kg</div>
                    <div className="flex justify-end gap-2 text-[8px] text-slate-700">
                      <span className="w-6 text-right">1</span>
                      <span className="w-12 text-right">450.00</span>
                      <span className="w-12 text-right font-bold">450.00</span>
                    </div>
                  </div>
                  {thermal.showItemDiscount && (
                    <div className="text-[8px] text-emerald-700 text-right">Disc 5% (-₹8.00)</div>
                  )}
                  <div>
                    <div className="font-semibold">2. Sunflower Oil 1L</div>
                    <div className="flex justify-end gap-2 text-[8px] text-slate-700">
                      <span className="w-6 text-right">1</span>
                      <span className="w-12 text-right">160.00</span>
                      <span className="w-12 text-right font-bold">160.00</span>
                    </div>
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-400 my-1" />

                {/* Totals */}
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹602.00</span>
                  </div>
                  {thermal.showTaxBreakdown && (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>CGST (2.5%):</span>
                        <span>₹15.05</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>SGST (2.5%):</span>
                        <span>₹15.05</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-black text-xs border-t border-b border-slate-900 py-1 my-0.5">
                    <span>GRAND TOTAL:</span>
                    <span>₹632.00</span>
                  </div>
                  {thermal.showBalanceDue && (
                    <div className="flex justify-between text-[9px] text-emerald-700 font-bold">
                      <span>Paid (Cash):</span>
                      <span>₹632.00</span>
                    </div>
                  )}
                  {thermal.showPartyBalance && (
                    <div className="flex justify-between text-[9px] text-rose-700 font-bold border-t border-slate-200 pt-0.5 mt-0.5">
                      <span>Total Party Bal:</span>
                      <span>₹1,250.00 Dr</span>
                    </div>
                  )}
                </div>

                {/* QR Code Placeholder */}
                {thermal.showUpiQr && company.upiId && (
                  <div className="pt-1 text-center flex flex-col items-center">
                    <div className="w-16 h-16 border border-slate-300 rounded flex items-center justify-center bg-slate-50 text-[8px] text-slate-400">
                      [UPI QR]
                    </div>
                    <p className="text-[8px] font-bold mt-0.5 font-mono">{company.upiId}</p>
                  </div>
                )}

                {/* Footer */}
                <div className="border-t border-dashed border-slate-300 pt-1 text-center space-y-0.5 text-[8px] text-slate-600">
                  <p className="font-bold">{thermal.greetingText}</p>
                  {thermal.jurisdictionText && <p className="italic">{thermal.jurisdictionText}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Save Bar on Mobile */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-lg mx-auto bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3 animate-slide-up">
          <div className="text-xs font-bold text-on-surface">Unsaved print customizations</div>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>Save Settings</span>
          </button>
        </div>
      )}
    </div>
  );
};
