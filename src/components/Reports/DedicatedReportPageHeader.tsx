import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Printer,
  FileSpreadsheet,
  Search,
  X,
} from 'lucide-react';
import { DatePreset, DateFilterRange, getDateFilterBounds } from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';

export interface SubReportTabOption {
  id: string;
  label: string;
  badge?: string | number;
}

interface DedicatedReportPageHeaderProps {
  title: string;
  subtitle: string;
  icon?: React.ComponentType<{ size?: string | number; className?: string }>;
  onBack: () => void;
  datePreset?: DatePreset;
  customStart?: string;
  customEnd?: string;
  onSelectDateRange?: (preset: DatePreset, start?: string, end?: string) => void;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  isExportingPdf?: boolean;
  isExportingExcel?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  subReports?: SubReportTabOption[];
  activeSubReport?: string;
  onSelectSubReport?: (id: string) => void;
  extraActions?: React.ReactNode;
}

export const DedicatedReportPageHeader: React.FC<DedicatedReportPageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  onBack,
  datePreset = 'THIS_MONTH',
  customStart,
  customEnd,
  onSelectDateRange,
  onExportPdf,
  onExportExcel,
  isExportingPdf = false,
  isExportingExcel = false,
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search records...',
  subReports = [],
  activeSubReport,
  onSelectSubReport,
  extraActions,
}) => {
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  const dateBounds: DateFilterRange = getDateFilterBounds(datePreset, customStart, customEnd);

  const formatDisplayPeriod = () => {
    if (datePreset === 'TODAY') return 'Today';
    if (datePreset === 'YESTERDAY') return 'Yesterday';
    if (datePreset === 'THIS_MONTH') return 'This Month';
    if (datePreset === 'THIS_QUARTER') return 'This Quarter';
    if (datePreset === 'THIS_FY') return 'This FY';
    if (datePreset === 'ALL_TIME') return 'All Time';
    if (customStart && customEnd) return `${customStart} - ${customEnd}`;
    return dateBounds.label;
  };

  return (
    <div className="space-y-2.5 sm:space-y-4 mb-4 sm:mb-6">
      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-4 bg-surface-container-low p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-outline-variant/40 shadow-xs">
        {/* Left: Back Button & Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-container-high text-on-surface font-semibold text-xs border border-outline-variant/40 shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
            aria-label="Back to Reports Hub"
          >
            <ArrowLeft size={14} />
            <span>Reports Hub</span>
          </button>

          <div className="h-5 w-px bg-outline-variant/40 hidden sm:block shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary hidden sm:inline-flex shrink-0">
                <Icon size={18} />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-on-surface tracking-tight m-0 truncate">
                {title}
              </h1>
              <p className="text-[11px] sm:text-xs text-on-surface-variant m-0 truncate">
                {subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Date Picker & Export Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap self-start lg:self-auto">
          {extraActions}

          {onSelectDateRange && (
            <button
              type="button"
              onClick={() => setIsDateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-outline-variant/40 transition-all cursor-pointer shadow-xs"
              aria-label="Select report date range"
            >
              <Calendar size={13} className="text-primary" />
              <span>{formatDisplayPeriod()}</span>
              <span className="text-on-surface-variant text-[10px]">▾</span>
            </button>
          )}

          {onExportPdf && (
            <button
              type="button"
              onClick={onExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-outline-variant/40 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              aria-label="Export report to printable PDF"
            >
              <Printer size={13} className="text-secondary" />
              <span className="hidden sm:inline">Export</span> PDF
            </button>
          )}

          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              disabled={isExportingExcel}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              aria-label="Export report to Excel or CSV"
            >
              <FileSpreadsheet size={13} />
              <span className="hidden sm:inline">Export</span> Excel
            </button>
          )}
        </div>
      </div>

      {/* Sub-Reports Switcher Tabs & Search Row */}
      {(subReports.length > 0 || onSearchChange) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 bg-surface-container rounded-lg sm:rounded-xl p-1.5 sm:p-2 border border-outline-variant/30">
          {/* Sub-Reports Tabs */}
          {subReports.length > 0 && (
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="tablist">
              {subReports.map((sub) => {
                const isActive = activeSubReport === sub.id;
                return (
                  <button
                    key={sub.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onSelectSubReport?.(sub.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'bg-surface/80 hover:bg-surface-container-high text-on-surface hover:text-primary'
                    }`}
                  >
                    <span>{sub.label}</span>
                    {sub.badge !== undefined && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive
                            ? 'bg-on-primary/20 text-on-primary'
                            : 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                      >
                        {sub.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Search Input */}
          {onSearchChange && (
            <div className="relative min-w-[180px] sm:w-64">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Filter report records"
                className="w-full pl-7 pr-6 py-1 text-xs bg-surface border border-outline-variant/40 rounded-md sm:rounded-lg text-on-surface placeholder:text-on-surface-variant/60 focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer p-0.5"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Date Filter Modal */}
      {isDateModalOpen && onSelectDateRange && (
        <DateFilterModal
          isOpen={isDateModalOpen}
          activePreset={datePreset}
          customStartDate={customStart}
          customEndDate={customEnd}
          onSelectRange={(preset: DatePreset, start?: string, end?: string) => {
            onSelectDateRange(preset, start, end);
            setIsDateModalOpen(false);
          }}
          onClose={() => setIsDateModalOpen(false)}
        />
      )}
    </div>
  );
};
