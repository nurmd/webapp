import React, { useState } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  ShoppingBag,
  Users,
  Package,
  Calendar,
  Search,
  X,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';
import { DatePreset, DateFilterRange, getDateFilterBounds } from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';

export type ReportCategoryKey =
  | 'gst_tax'
  | 'sales_revenue'
  | 'purchases_expenses'
  | 'party_khata'
  | 'inventory_stock';

export interface SubReportOption {
  id: string;
  label: string;
  badge?: string | number;
}

export interface ReportKpiItem {
  label: string;
  value: string;
  hint?: string;
  color?: 'primary' | 'success' | 'danger' | 'warning' | 'info';
}

interface ReportsHubHeaderProps {
  activeCategory: ReportCategoryKey;
  onSelectCategory: (cat: ReportCategoryKey) => void;
  categoryCounters: Record<ReportCategoryKey, number>;
  activeSubReport: string;
  onSelectSubReport: (id: string) => void;
  subReports: SubReportOption[];
  datePreset: DatePreset;
  customStart?: string;
  customEnd?: string;
  onSelectDateRange: (preset: DatePreset, start?: string, end?: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  kpis: ReportKpiItem[];
  onExportPdf: () => void;
  onExportExcel: () => void;
  isExportingPdf?: boolean;
  isExportingExcel?: boolean;
}

export const CATEGORIES_CONFIG: Array<{
  id: ReportCategoryKey;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
  description: string;
}> = [
  {
    id: 'gst_tax',
    label: 'GST & Tax Compliance',
    shortLabel: 'GST & Tax',
    icon: ShieldCheck,
    description: 'GSTR-1, GSTR-3B Tax Offset & HSN Summaries',
  },
  {
    id: 'sales_revenue',
    label: 'Sales & Revenue',
    shortLabel: 'Sales',
    icon: TrendingUp,
    description: 'Sales Register, Bill-wise Profit & Item Margins',
  },
  {
    id: 'purchases_expenses',
    label: 'Purchases & Expenses',
    shortLabel: 'Purchases',
    icon: ShoppingBag,
    description: 'Purchase Register, ITC Eligibility & Expense Splits',
  },
  {
    id: 'party_khata',
    label: 'Party & Khata Dues',
    shortLabel: 'Khata Dues',
    icon: Users,
    description: 'Aging Buckets & Party Passbook Statements',
  },
  {
    id: 'inventory_stock',
    label: 'Inventory & Stock',
    shortLabel: 'Stock',
    icon: Package,
    description: 'Stock Valuation, Profit Potential & Low Stock Alerts',
  },
];

export const ReportsHubHeader: React.FC<ReportsHubHeaderProps> = ({
  activeCategory,
  onSelectCategory,
  categoryCounters,
  activeSubReport,
  onSelectSubReport,
  subReports,
  datePreset,
  customStart,
  customEnd,
  onSelectDateRange,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search records, parties or items...',
  kpis,
  onExportPdf,
  onExportExcel,
  isExportingPdf = false,
  isExportingExcel = false,
}) => {
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  const dateBounds: DateFilterRange = getDateFilterBounds(datePreset, customStart, customEnd);

  const formatDisplayDateRange = () => {
    if (datePreset === 'ALL_TIME') return 'All Time';
    if (datePreset === 'TODAY') return 'Today';
    if (datePreset === 'YESTERDAY') return 'Yesterday';
    if (datePreset === 'THIS_MONTH') return 'This Month';
    if (datePreset === 'THIS_QUARTER') return 'This Quarter';
    if (datePreset === 'THIS_FY') return 'This FY';
    if (customStart && customEnd) {
      return `${customStart} to ${customEnd}`;
    }
    return dateBounds.label;
  };

  return (
    <div className="space-y-4 mb-6">
      {/* 1. Five Category Switcher Tabs */}
      <div className="bg-surface-container rounded-2xl p-2 shadow-sm border border-outline-variant/40">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" role="tablist" aria-label="Report Categories">
          {CATEGORIES_CONFIG.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            const count = categoryCounters[cat.id] ?? 0;

            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={isActive}
                aria-label={`${cat.label} category, ${count} records`}
                onClick={() => onSelectCategory(cat.id)}
                className={`flex items-center gap-2.5 p-3 rounded-xl transition-all text-left min-h-[48px] ${
                  isActive
                    ? 'bg-primary text-on-primary shadow-sm ring-1 ring-primary/20'
                    : 'bg-surface hover:bg-surface-container-high text-on-surface hover:text-primary'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-on-primary/15 text-on-primary' : 'bg-primary/10 text-primary'
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-xs sm:text-sm truncate">
                      {cat.shortLabel}
                    </span>
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-on-primary/20 text-on-primary'
                          : 'bg-surface-container-highest text-on-surface-variant'
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                  <p
                    className={`text-[10px] truncate hidden sm:block mt-0.5 ${
                      isActive ? 'text-on-primary/80' : 'text-on-surface-variant'
                    }`}
                  >
                    {cat.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Sub-Navigation Tabs & Controls Dock */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface rounded-xl p-3 border border-outline-variant/30 shadow-xs">
        {/* Sub-report selector tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
          {subReports.map((sub) => {
            const isSubActive = activeSubReport === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => onSelectSubReport(sub.id)}
                aria-label={`View ${sub.label}`}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors min-h-[38px] flex items-center gap-2 ${
                  isSubActive
                    ? 'bg-secondary-container text-on-secondary-container ring-1 ring-secondary/30'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span>{sub.label}</span>
                {sub.badge !== undefined && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface font-bold">
                    {sub.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right side: Search, Date Filter Button, and 1-Click Exports */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Live Search input */}
          <div className="relative flex-1 sm:w-56 min-w-[160px]">
            <Search
              size={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Filter report records"
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface-container-lowest rounded-lg border border-outline-variant/60 focus:outline-hidden focus:ring-1 focus:ring-primary min-h-[38px]"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Date Preset Selector Trigger */}
          <button
            onClick={() => setIsDateModalOpen(true)}
            aria-label={`Selected date range: ${formatDisplayDateRange()}. Click to change`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-lg border border-outline-variant/50 transition-colors min-h-[38px]"
          >
            <Calendar size={14} className="text-primary shrink-0" />
            <span className="truncate max-w-[130px] font-semibold">{formatDisplayDateRange()}</span>
          </button>

          {/* 1-Click Export Excel button */}
          <button
            onClick={onExportExcel}
            disabled={isExportingExcel}
            aria-label="Export report to Excel or CSV"
            title="Download CSV spreadsheet"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors min-h-[38px] shadow-xs active:scale-95 disabled:opacity-50"
          >
            <FileSpreadsheet size={15} />
            <span className="hidden sm:inline">Export Excel</span>
          </button>

          {/* 1-Click Export PDF button */}
          <button
            onClick={onExportPdf}
            disabled={isExportingPdf}
            aria-label="Export report to printable PDF"
            title="Print or Save as A4 PDF"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-on-primary rounded-lg transition-colors min-h-[38px] shadow-xs active:scale-95 disabled:opacity-50"
          >
            <Printer size={15} />
            <span className="hidden sm:inline">Export PDF</span>
          </button>
        </div>
      </div>

      {/* 3. Summary KPI Banner */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {kpis.map((kpi, idx) => {
            const colorClass =
              kpi.color === 'success'
                ? 'text-emerald-700 dark:text-emerald-400'
                : kpi.color === 'danger'
                ? 'text-rose-700 dark:text-rose-400'
                : kpi.color === 'warning'
                ? 'text-amber-700 dark:text-amber-400'
                : kpi.color === 'info'
                ? 'text-sky-700 dark:text-sky-400'
                : 'text-on-surface';

            return (
              <div
                key={idx}
                className="bg-surface rounded-xl p-3 border border-outline-variant/30 shadow-xs flex flex-col justify-between"
              >
                <div className="text-[11px] font-medium text-on-surface-variant truncate">
                  {kpi.label}
                </div>
                <div className={`text-base sm:text-lg font-bold mt-1 ${colorClass}`}>
                  {kpi.value}
                </div>
                {kpi.hint && (
                  <div className="text-[10px] text-on-surface-variant/80 mt-0.5 truncate">
                    {kpi.hint}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Date Filter Modal */}
      <DateFilterModal
        isOpen={isDateModalOpen}
        activePreset={datePreset}
        customStartDate={customStart}
        customEndDate={customEnd}
        onClose={() => setIsDateModalOpen(false)}
        onSelectRange={(preset, start, end) => {
          onSelectDateRange(preset, start, end);
          setIsDateModalOpen(false);
        }}
        accentColor="primary"
      />
    </div>
  );
};
