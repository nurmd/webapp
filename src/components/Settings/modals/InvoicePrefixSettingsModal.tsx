import React, { useState, useMemo } from 'react';
import {
  CompanyProfile,
  DocumentSeriesConfig,
  DocumentSeriesType,
  SeriesYearFormat,
  SeriesSeparator,
} from '../../../models/company.ts';
import {
  DOCUMENT_SERIES_LABELS,
  DEFAULT_SERIES_CONFIGS,
  getDocumentSeriesConfig,
  formatDocumentNumberPreview,
  getFinancialYearString,
} from '../../../core/utils/invoiceNumber.ts';
import { useBackNavigation } from '../../../core/utils/backNavigation.ts';
import { showAppToast } from '../../../services/toast.ts';

export interface InvoicePrefixSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CompanyProfile;
  onSave: (updatedProfile: CompanyProfile) => void;
}

const DOCUMENT_TYPES_ORDER: DocumentSeriesType[] = [
  'SALES_INVOICE',
  'POS_INVOICE',
  'ESTIMATE',
  'DELIVERY_CHALLAN',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'PURCHASE_BILL',
  'PAYMENT_RECEIPT',
];

export const InvoicePrefixSettingsModal: React.FC<InvoicePrefixSettingsModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
}) => {
  useBackNavigation(onClose, isOpen, 45);

  const [activeDocType, setActiveDocType] = useState<DocumentSeriesType>('SALES_INVOICE');

  // Local state for all series configs initialized from profile or defaults
  const [seriesMap, setSeriesMap] = useState<Record<DocumentSeriesType, DocumentSeriesConfig>>(() => {
    const map = {} as Record<DocumentSeriesType, DocumentSeriesConfig>;
    DOCUMENT_TYPES_ORDER.forEach((type) => {
      map[type] = { ...getDocumentSeriesConfig(profile, type) };
    });
    return map;
  });

  const activeConfig = seriesMap[activeDocType] || DEFAULT_SERIES_CONFIGS[activeDocType];

  const updateActiveConfig = (patch: Partial<DocumentSeriesConfig>) => {
    setSeriesMap((prev) => ({
      ...prev,
      [activeDocType]: {
        ...prev[activeDocType],
        ...patch,
      },
    }));
  };

  // Live preview for current active document
  const previewNumber = useMemo(() => {
    return formatDocumentNumberPreview(
      activeConfig,
      activeConfig.startingNumber || 1,
      new Date()
    );
  }, [activeConfig]);

  const isGstCompliantLength = previewNumber.length <= 16;

  // Preset helpers
  const applyPreset = (preset: 'GST' | 'CALENDAR' | 'SIMPLE' | 'COMPACT') => {
    if (preset === 'GST') {
      updateActiveConfig({
        separator: '/',
        yearFormat: 'YY_YY',
        paddingDigits: 4,
      });
    } else if (preset === 'CALENDAR') {
      updateActiveConfig({
        separator: '-',
        yearFormat: 'YYYY',
        paddingDigits: 4,
      });
    } else if (preset === 'SIMPLE') {
      updateActiveConfig({
        separator: '-',
        yearFormat: 'NONE',
        paddingDigits: 4,
      });
    } else if (preset === 'COMPACT') {
      updateActiveConfig({
        separator: '',
        yearFormat: 'NONE',
        paddingDigits: 4,
      });
    }
  };

  // Copy style to all document types
  const handleApplyStyleToAll = () => {
    const { separator, yearFormat, paddingDigits } = activeConfig;
    setSeriesMap((prev) => {
      const next = { ...prev };
      DOCUMENT_TYPES_ORDER.forEach((t) => {
        next[t] = {
          ...next[t],
          separator,
          yearFormat,
          paddingDigits,
        };
      });
      return next;
    });
    showAppToast('Applied year format and separator to all document types!');
  };

  // Reset to system defaults
  const handleResetToDefaults = () => {
    const next = {} as Record<DocumentSeriesType, DocumentSeriesConfig>;
    DOCUMENT_TYPES_ORDER.forEach((t) => {
      next[t] = { ...DEFAULT_SERIES_CONFIGS[t] };
    });
    setSeriesMap(next);
    showAppToast('Reset series numbering configurations to system defaults.');
  };

  const handleSave = () => {
    // Legacy sales prefix synchronization
    const salesConfig = seriesMap.SALES_INVOICE;
    const legacyPrefix = formatDocumentNumberPreview(
      { ...salesConfig, paddingDigits: 0 },
      0
    ).replace(/0+$/, '');

    const updatedProfile: CompanyProfile = {
      ...profile,
      invoicePrefix: legacyPrefix || salesConfig.prefix + salesConfig.separator,
      documentSeries: { ...seriesMap },
    };

    onSave(updatedProfile);
    showAppToast('Document series & numbering settings saved successfully!');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-3xl max-h-[92vh] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">tag</span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-on-surface">Document Numbering &amp; Prefix Settings</h2>
              <p className="text-xs text-on-surface-variant">
                Configure prefixes, fiscal year formats &amp; sequence counters across all billing documents
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Document Type Selector Tabs */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-2 uppercase tracking-wider">
              Select Document Type to Configure:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DOCUMENT_TYPES_ORDER.map((docType) => {
                const meta = DOCUMENT_SERIES_LABELS[docType];
                const isSelected = activeDocType === docType;
                const docCfg = seriesMap[docType];
                const sampleNum = formatDocumentNumberPreview(docCfg, docCfg.startingNumber || 1);

                return (
                  <button
                    key={docType}
                    type="button"
                    onClick={() => setActiveDocType(docType)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 active:scale-98 ${
                      isSelected
                        ? 'bg-secondary/10 border-secondary ring-1 ring-secondary shadow-xs'
                        : 'bg-surface-container-low/60 border-outline-variant/30 hover:border-secondary/40 hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`material-symbols-outlined text-[16px] ${isSelected ? 'text-secondary font-bold' : 'text-on-surface-variant'}`}>
                          {meta.icon}
                        </span>
                        <span className={`text-xs font-bold truncate ${isSelected ? 'text-secondary' : 'text-on-surface'}`}>
                          {meta.shortCode}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-medium text-outline truncate max-w-[90px]">
                        {sampleNum}
                      </span>
                    </div>
                    <span className="text-[10px] text-on-surface-variant line-clamp-1">
                      {meta.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="bg-gradient-to-r from-secondary/10 via-surface-container-low to-primary/10 rounded-2xl p-4 sm:p-5 border border-secondary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-secondary">
                  {DOCUMENT_SERIES_LABELS[activeDocType].icon}
                </span>
                <span className="text-xs font-bold text-on-surface uppercase tracking-wide">
                  {DOCUMENT_SERIES_LABELS[activeDocType].title} Next Number Preview
                </span>
              </div>
              <div className="font-mono text-2xl sm:text-3xl font-extrabold text-secondary tracking-wide">
                {previewNumber}
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Will be automatically suggested for the next {DOCUMENT_SERIES_LABELS[activeDocType].shortCode} generated
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-1.5 self-start sm:self-auto">
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  isGstCompliantLength
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">
                  {isGstCompliantLength ? 'check_circle' : 'warning'}
                </span>
                <span>
                  {previewNumber.length} / 16 chars ({isGstCompliantLength ? 'GST Valid' : 'Exceeds 16 chars'})
                </span>
              </div>
              <span className="text-[10px] text-outline">
                GST Rule 46 requires ≤ 16 alphanumeric characters
              </span>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                Quick Format Presets:
              </label>
              <button
                type="button"
                onClick={handleApplyStyleToAll}
                className="text-xs font-bold text-secondary hover:text-secondary-fixed hover:underline flex items-center gap-1 cursor-pointer"
                title="Copy current year format & separator to all document types"
              >
                <span className="material-symbols-outlined text-[14px]">sync_alt</span>
                <span>Apply Style to All Documents</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('GST')}
                className="py-2 px-3 rounded-xl border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 transition-all text-center"
              >
                <span className="font-bold text-secondary">GST Standard</span>
                <span className="text-[10px] font-mono text-outline">{activeConfig.prefix}/26-27/0001</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('CALENDAR')}
                className="py-2 px-3 rounded-xl border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 transition-all text-center"
              >
                <span className="font-bold text-secondary">Calendar Year</span>
                <span className="text-[10px] font-mono text-outline">{activeConfig.prefix}-2026-0001</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('SIMPLE')}
                className="py-2 px-3 rounded-xl border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 transition-all text-center"
              >
                <span className="font-bold text-secondary">Simple Sequential</span>
                <span className="text-[10px] font-mono text-outline">{activeConfig.prefix}-0001</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('COMPACT')}
                className="py-2 px-3 rounded-xl border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 transition-all text-center"
              >
                <span className="font-bold text-secondary">Compact / Minimal</span>
                <span className="text-[10px] font-mono text-outline">{activeConfig.prefix}0001</span>
              </button>
            </div>
          </div>

          {/* Configuration Form Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-container-low/40 p-4 sm:p-5 rounded-2xl border border-outline-variant/20">
            {/* 1. Custom Prefix Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-on-surface">
                Prefix Code
              </label>
              <input
                type="text"
                maxLength={8}
                value={activeConfig.prefix}
                onChange={(e) => updateActiveConfig({ prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                placeholder="e.g. INV, TAX, POS"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold uppercase text-on-surface outline-none focus:border-secondary shadow-xs"
              />
              <span className="text-[11px] text-on-surface-variant">
                1-8 alphanumeric characters (e.g. {DOCUMENT_SERIES_LABELS[activeDocType].shortCode}, BILL, TAX)
              </span>
            </div>

            {/* 2. Separator Choice */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-on-surface">
                Delimiter / Separator
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Hyphen (-)', val: '-' as SeriesSeparator },
                  { label: 'Slash (/)', val: '/' as SeriesSeparator },
                  { label: 'Dot (.)', val: '.' as SeriesSeparator },
                  { label: 'None', val: '' as SeriesSeparator },
                ].map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => updateActiveConfig({ separator: s.val })}
                    className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                      activeConfig.separator === s.val
                        ? 'bg-secondary text-on-secondary border-secondary shadow-xs'
                        : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-secondary/40'
                    }`}
                  >
                    {s.val || '∅'}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-on-surface-variant">
                Used between prefix, fiscal year, and document counter
              </span>
            </div>

            {/* 3. Year Format Choice */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-on-surface">
                Fiscal / Calendar Year Inclusion
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'None', val: 'NONE' as SeriesYearFormat, sub: 'INV-0001' },
                  { label: 'YYYY', val: 'YYYY' as SeriesYearFormat, sub: 'INV-2026-0001' },
                  { label: 'YY-YY (FY)', val: 'YY_YY' as SeriesYearFormat, sub: `INV-${getFinancialYearString()}-0001` },
                ].map((y) => (
                  <button
                    key={y.val}
                    type="button"
                    onClick={() => updateActiveConfig({ yearFormat: y.val })}
                    className={`p-2 text-left rounded-xl border transition-all cursor-pointer flex flex-col justify-center ${
                      activeConfig.yearFormat === y.val
                        ? 'bg-secondary text-on-secondary border-secondary shadow-xs'
                        : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-secondary/40'
                    }`}
                  >
                    <span className="text-xs font-bold leading-tight">{y.label}</span>
                    <span className={`text-[9px] font-mono leading-tight mt-0.5 truncate ${activeConfig.yearFormat === y.val ? 'text-on-secondary/80' : 'text-outline'}`}>
                      {y.sub}
                    </span>
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-on-surface-variant">
                FY 26-27 is the official GST format for April 1 - March 31
              </span>
            </div>

            {/* 4. Sequence Padding Digits */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-on-surface">
                Sequence Zero-Padding
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { digits: 3, sample: '001' },
                  { digits: 4, sample: '0001' },
                  { digits: 5, sample: '00001' },
                  { digits: 6, sample: '000001' },
                ].map((p) => (
                  <button
                    key={p.digits}
                    type="button"
                    onClick={() => updateActiveConfig({ paddingDigits: p.digits })}
                    className={`py-2 px-1 text-center rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center ${
                      activeConfig.paddingDigits === p.digits
                        ? 'bg-secondary text-on-secondary border-secondary shadow-xs'
                        : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-secondary/40'
                    }`}
                  >
                    <span className="text-xs font-bold">{p.digits} Digits</span>
                    <span className={`text-[9px] font-mono mt-0.5 ${activeConfig.paddingDigits === p.digits ? 'text-on-secondary/80' : 'text-outline'}`}>
                      {p.sample}
                    </span>
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-on-surface-variant">
                Ensures proper alphabetical sorting and standard billing width
              </span>
            </div>

            {/* 5. Starting Sequence Counter Number */}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-on-surface">
                  Starting Sequence Counter Number
                </label>
                <span className="text-[11px] font-mono font-bold text-secondary">
                  Counter starts at #{activeConfig.startingNumber || 1}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={999999}
                  value={activeConfig.startingNumber || 1}
                  onChange={(e) => updateActiveConfig({ startingNumber: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-on-surface outline-none focus:border-secondary shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => updateActiveConfig({ startingNumber: 1 })}
                  className="px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-xs font-bold text-on-surface hover:bg-surface-container transition-colors shrink-0 cursor-pointer"
                >
                  Reset to 1
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Useful when migrating mid-year from another billing app or physical invoice book. The generator will start from this number or the next highest unused sequence.
              </p>
            </div>
          </div>

          {/* All Document Series Overview Matrix */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                All Document Series Overview
              </h4>
              <button
                type="button"
                onClick={handleResetToDefaults}
                className="text-xs text-outline hover:text-error transition-colors cursor-pointer"
              >
                Reset All to Defaults
              </button>
            </div>
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 overflow-hidden divide-y divide-outline-variant/20">
              {DOCUMENT_TYPES_ORDER.map((type) => {
                const meta = DOCUMENT_SERIES_LABELS[type];
                const cfg = seriesMap[type];
                const preview = formatDocumentNumberPreview(cfg, cfg.startingNumber || 1);
                const isCurrent = activeDocType === type;

                return (
                  <div
                    key={type}
                    onClick={() => setActiveDocType(type)}
                    className={`px-3.5 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isCurrent ? 'bg-secondary/10' : 'hover:bg-surface-container'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`material-symbols-outlined text-[16px] ${isCurrent ? 'text-secondary font-bold' : 'text-on-surface-variant'}`}>
                        {meta.icon}
                      </span>
                      <span className={`font-medium truncate ${isCurrent ? 'text-secondary font-bold' : 'text-on-surface'}`}>
                        {meta.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-secondary bg-surface-container-lowest px-2 py-0.5 rounded-md border border-outline-variant/20">
                        {preview}
                      </span>
                      <span className="material-symbols-outlined text-[14px] text-outline">
                        chevron_right
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>Save All Series Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
