import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  LedgerSortOption,
  LEDGER_SORT_LABELS,
} from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { canConvertToInvoice, convertDocumentToTaxInvoice } from '../../core/utils/documentConversion.ts';
import { showAppToast } from '../../services/toast.ts';

export interface QuotationsEstimatesViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  onNewQuotation: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onRefresh?: () => void;
}

export const QuotationsEstimatesView: React.FC<QuotationsEstimatesViewProps> = ({
  company,
  invoices,
  onNewQuotation,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'OPEN' | 'CONVERTED'>('ALL');
  const [search, setSearch] = useState('');
  const [confirmConvertDoc, setConfirmConvertDoc] = useState<Invoice | null>(null);
  const [docToDelete, setDocToDelete] = useState<Invoice | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Date Filter
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  useBackNavigation(() => {
    if (confirmConvertDoc) {
      setConfirmConvertDoc(null);
      return true;
    }
    if (docToDelete) {
      setDocToDelete(null);
      return true;
    }
    if (isDateModalOpen) {
      setIsDateModalOpen(false);
      return true;
    }
    if (isSortDropdownOpen) {
      setIsSortDropdownOpen(false);
      return true;
    }
    return false;
  }, isDateModalOpen || isSortDropdownOpen || !!confirmConvertDoc || !!docToDelete, 20);

  // 1. Filter only Quotations / Estimates
  const quotationList = useMemo(() => {
    return invoices.filter((i) => i.invoiceType === 'ESTIMATE');
  }, [invoices]);

  // 2. Active Date Range
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  const dateFiltered = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return quotationList;
    return quotationList.filter((inv) => isDateInRange(inv.date, dateRange.start, dateRange.end));
  }, [quotationList, dateRange]);

  // KPI Metrics
  const totalValue = dateFiltered.reduce((sum, q) => sum + q.grandTotal, 0);
  const convertedList = dateFiltered.filter((q) => q.isConverted);
  const convertedValue = convertedList.reduce((sum, q) => sum + q.grandTotal, 0);
  const openList = dateFiltered.filter((q) => !q.isConverted);
  const openValue = openList.reduce((sum, q) => sum + q.grandTotal, 0);
  const conversionRate = dateFiltered.length > 0 ? Math.round((convertedList.length / dateFiltered.length) * 100) : 0;

  // 3. Search & Tab Filter
  const statusFiltered = useMemo(() => {
    return dateFiltered.filter((inv) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.partyName.toLowerCase().includes(q) ||
        (inv.partyGstin && inv.partyGstin.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (activeTab === 'OPEN') return !inv.isConverted;
      if (activeTab === 'CONVERTED') return Boolean(inv.isConverted);
      return true;
    });
  }, [dateFiltered, search, activeTab]);

  // 4. Sort
  const sortedQuotations = useMemo(() => {
    return [...statusFiltered].sort((a, b) => {
      switch (sortBy) {
        case 'NEWEST': {
          const tA = new Date(a.date).getTime() || 0;
          const tB = new Date(b.date).getTime() || 0;
          if (tB !== tA) return tB - tA;
          return (b.id || '').localeCompare(a.id || '');
        }
        case 'OLDEST': {
          const tA = new Date(a.date).getTime() || 0;
          const tB = new Date(b.date).getTime() || 0;
          if (tA !== tB) return tA - tB;
          return (a.id || '').localeCompare(b.id || '');
        }
        case 'AMOUNT_HIGH':
          return b.grandTotal - a.grandTotal;
        case 'AMOUNT_LOW':
          return a.grandTotal - b.grandTotal;
        case 'NAME_AZ':
          return (a.partyName || '').localeCompare(b.partyName || '');
        case 'NAME_ZA':
          return (b.partyName || '').localeCompare(a.partyName || '');
        case 'DOC_NUM':
          return (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
        default:
          return 0;
      }
    });
  }, [statusFiltered, sortBy]);

  // 1-Tap Document Conversion
  const handleConvertQuotation = async (doc: Invoice) => {
    try {
      const newInv = await convertDocumentToTaxInvoice(doc, company);
      showAppToast(`Quotation #${doc.invoiceNumber} converted to Tax Invoice #${newInv.invoiceNumber}`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to convert quotation:', err);
      showAppToast(err.message || 'Failed to convert quotation.');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-24">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-2xl">request_quote</span>
            <h1 className="font-headline-sm text-xl sm:text-2xl font-black text-on-surface tracking-tight">
              Quotations & Estimates
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Create professional price quotes, estimates, and convert directly into Tax Invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="new-quotation-header-btn"
            onClick={onNewQuotation}
            className="h-10 px-4 rounded-xl bg-secondary text-on-secondary text-xs sm:text-sm font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>+ New Quotation</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total Quotes</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-on-surface tabular-nums">{dateFiltered.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(totalValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Open / Pending</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-amber-800 dark:text-amber-300 tabular-nums">{openList.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(openValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Converted to Sale</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">{convertedList.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(convertedValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">Conversion Rate</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg sm:text-xl font-extrabold text-secondary tabular-nums">{conversionRate}%</span>
            <span className="text-[11px] text-on-surface-variant">won quotes</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          {(['ALL', 'OPEN', 'CONVERTED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {tab === 'ALL' ? `All (${dateFiltered.length})` : tab === 'OPEN' ? `Open (${openList.length})` : `Converted (${convertedList.length})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotation..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-secondary/30 min-h-[36px]"
            />
          </div>

          {/* Date Range Preset Button */}
          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className="h-9 px-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low text-on-surface text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">calendar_today</span>
            <span>{datePreset === 'ALL_TIME' ? 'All Time' : datePreset.replace('_', ' ')}</span>
          </button>
        </div>
      </div>

      {/* Quotation List Cards */}
      <div className="space-y-2.5">
        {sortedQuotations.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-8 sm:p-12 border border-outline-variant/20 text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">request_quote</span>
            <h3 className="font-bold text-sm text-on-surface">No quotations found</h3>
            <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
              {search ? 'Try clearing your search query or date filter.' : 'Create your first price estimate or proforma quotation for prospective customers.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={onNewQuotation}
                className="mt-2 h-9 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-xs hover:bg-secondary/90 cursor-pointer inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Create Quotation</span>
              </button>
            )}
          </div>
        ) : (
          sortedQuotations.map((inv) => (
            <div
              key={inv.id}
              onClick={() => onViewInvoice(inv)}
              className="bg-surface-container-lowest rounded-xl p-3 sm:p-4 shadow-xs border border-outline-variant/20 flex flex-col gap-2 hover:border-secondary/40 active:scale-[0.99] transition-all cursor-pointer"
            >
              {/* Line 1: Party Name & Grand Total */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-on-surface truncate flex-1 min-w-0">
                  {inv.partyName || 'Cash Customer'}
                </span>
                <span className="font-extrabold text-xs sm:text-sm text-on-surface whitespace-nowrap tabular-nums shrink-0">
                  {formatINR(inv.grandTotal)}
                </span>
              </div>

              {/* Line 2: Quote # and Status Badges */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-[10px] font-semibold text-secondary shrink-0 bg-secondary/10 px-1.5 py-0.2 rounded font-mono whitespace-nowrap">
                  #{inv.invoiceNumber}
                </span>

                {inv.isConverted ? (
                  <span
                    data-testid="converted-badge"
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shrink-0"
                  >
                    <span className="material-symbols-outlined text-[12px]">check_circle</span>
                    <span>Converted {inv.convertedToInvoiceNumber ? `#${inv.convertedToInvoiceNumber}` : ''}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0">
                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                    <span>Open Quote</span>
                  </span>
                )}

                {/* 1-Tap Convert to Invoice button */}
                {canConvertToInvoice(inv) && (
                  <button
                    type="button"
                    data-testid="convert-quotation-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmConvertDoc(inv);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-secondary text-on-secondary shadow-xs hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer ml-auto"
                    title="Convert Quotation directly to Tax Invoice"
                  >
                    <span className="material-symbols-outlined text-[12px]">receipt_long</span>
                    <span>Convert to Invoice</span>
                  </button>
                )}
              </div>

              {/* Line 3: Date, Items count & Actions */}
              <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant pt-1 border-t border-outline-variant/15">
                <div className="flex items-center gap-1.5 truncate">
                  <span>{formatDate(inv.date)}</span>
                  <span>•</span>
                  <span>{inv.items?.length || 0} {inv.items?.length === 1 ? 'item' : 'items'}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* WhatsApp Share */}
                  {inv.partyPhone && (
                    <a
                      href={getWhatsAppShareUrl(inv, company, inv.partyPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                      title="Share Quotation on WhatsApp"
                    >
                      <span className="material-symbols-outlined text-[16px]">share</span>
                    </a>
                  )}

                  {/* Edit */}
                  {onEditInvoice && !inv.isConverted && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditInvoice(inv);
                      }}
                      className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md transition-colors"
                      title="Edit Quotation"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDocToDelete(inv);
                    }}
                    className="p-1 text-error/70 hover:text-error hover:bg-error-container/20 rounded-md transition-colors"
                    title="Delete Quotation"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          type="button"
          onClick={onNewQuotation}
          className="h-11 px-4 rounded-full bg-secondary text-on-secondary font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer border border-white/10"
          title="Create New Quotation"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ Quotation</span>
        </button>
      </div>

      {/* Date Filter Modal */}
      <DateFilterModal
        isOpen={isDateModalOpen}
        activePreset={datePreset}
        customStartDate={customStart}
        customEndDate={customEnd}
        onClose={() => setIsDateModalOpen(false)}
        onSelectRange={(preset, start, end) => {
          setDatePreset(preset);
          setCustomStart(start || '');
          setCustomEnd(end || '');
        }}
        accentColor="secondary"
      />

      {/* Convert Quotation Confirmation Modal */}
      {confirmConvertDoc && (
        <ConfirmDeleteModal
          isOpen={!!confirmConvertDoc}
          title="Convert Quotation to Tax Invoice?"
          description={`Are you sure you want to convert Quotation #${confirmConvertDoc.invoiceNumber} for ${confirmConvertDoc.partyName} into a formal Tax Invoice? A new sequential Tax Invoice will be generated and inventory adjusted.`}
          confirmText="Convert Now"
          confirmButtonClass="bg-secondary text-on-secondary hover:bg-secondary/90"
          icon="receipt_long"
          iconBgClass="bg-secondary/15 text-secondary"
          onConfirm={async () => {
            const doc = confirmConvertDoc;
            setConfirmConvertDoc(null);
            await handleConvertQuotation(doc);
          }}
          onClose={() => setConfirmConvertDoc(null)}
        />
      )}

      {/* Delete Quotation Modal */}
      {docToDelete && (
        <ConfirmDeleteModal
          isOpen={!!docToDelete}
          title="Delete Quotation?"
          description={`Are you sure you want to delete quotation #${docToDelete.invoiceNumber} for ${docToDelete.partyName}? This action cannot be undone.`}
          confirmText="Delete Quotation"
          confirmButtonClass="bg-error text-on-error hover:bg-error/90"
          onConfirm={() => {
            const id = docToDelete.id;
            setDocToDelete(null);
            onDeleteInvoice(id);
            showAppToast('Quotation deleted successfully.');
          }}
          onClose={() => setDocToDelete(null)}
        />
      )}
    </div>
  );
};
