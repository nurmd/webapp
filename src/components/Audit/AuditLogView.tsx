/**
 * AuditLogView - MCA Rule 3(1) Compliant Immutable Audit Trail Viewer
 *
 * Provides a read-only, auditor-grade inspection interface:
 * - Live cryptographic chain verification status (SHA-256 tamper-evident integrity)
 * - Multi-criteria filtering (date range, action type, user, search query)
 * - Detailed event inspection with side-by-side snapshot diffing
 * - RFC 4180 CSV and formatted JSON statutory export
 * - Strict read-only enforcement (tamper/deletion controls prohibited by law)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  auditTrail,
  AuditRecord,
  AuditVerificationResult,
  AuditActionType,
  GENESIS_PREVIOUS_HASH,
  CURRENT_AUDIT_EPOCH,
  LEGACY_AUDIT_EPOCH,
} from '../../services/auditTrail.ts';

import { FinancialBalanceAuditorPanel } from './FinancialBalanceAuditorPanel.tsx';
import { InventoryStockAuditorPanel } from './InventoryStockAuditorPanel.tsx';

export type AuditTab = 'mca_trail' | 'party_balance' | 'inventory_stock';

export interface AuditLogViewProps {
  onClose?: () => void;
  documentIdFilter?: string;
  initialAuditTab?: AuditTab;
}

interface DiffRow {
  field: string;
  oldValue: any;
  newValue: any;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
}

function computeDiff(prev?: Record<string, any>, curr?: Record<string, any>): DiffRow[] {
  const p = prev || {};
  const c = curr || {};
  const allKeys = Array.from(new Set([...Object.keys(p), ...Object.keys(c)])).sort();

  return allKeys.map((key) => {
    const hasOld = key in p;
    const hasNew = key in c;
    const oldVal = p[key];
    const newVal = c[key];

    if (!hasOld && hasNew) {
      return { field: key, oldValue: undefined, newValue: newVal, type: 'added' };
    }
    if (hasOld && !hasNew) {
      return { field: key, oldValue: oldVal, newValue: undefined, type: 'removed' };
    }
    const isSame = JSON.stringify(oldVal) === JSON.stringify(newVal);
    return {
      field: key,
      oldValue: oldVal,
      newValue: newVal,
      type: isSame ? 'unchanged' : 'changed',
    };
  });
}

function formatValue(val: any): string {
  if (val === undefined) return '<undefined>';
  if (val === null) return '<null>';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

const ACTION_COLORS: Record<AuditActionType, { bg: string; text: string; border: string; label: string }> = {
  INVOICE_CREATE: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', border: 'border-emerald-500/30', label: 'Invoice Created' },
  INVOICE_UPDATE: { bg: 'bg-blue-500/15', text: 'text-blue-500', border: 'border-blue-500/30', label: 'Invoice Updated' },
  INVOICE_DELETE: { bg: 'bg-rose-500/15', text: 'text-rose-500', border: 'border-rose-500/30', label: 'Invoice Deleted' },
  INVOICE_CANCEL: { bg: 'bg-amber-500/15', text: 'text-amber-500', border: 'border-amber-500/30', label: 'Invoice Cancelled' },
  PURCHASE_CREATE: { bg: 'bg-teal-500/15', text: 'text-teal-500', border: 'border-teal-500/30', label: 'Purchase Created' },
  PURCHASE_UPDATE: { bg: 'bg-cyan-500/15', text: 'text-cyan-500', border: 'border-cyan-500/30', label: 'Purchase Updated' },
  PURCHASE_DELETE: { bg: 'bg-red-500/15', text: 'text-red-500', border: 'border-red-500/30', label: 'Purchase Deleted' },
  PAYMENT_RECORD: { bg: 'bg-purple-500/15', text: 'text-purple-500', border: 'border-purple-500/30', label: 'Payment / Receipt' },
  STOCK_ADJUSTMENT: { bg: 'bg-orange-500/15', text: 'text-orange-500', border: 'border-orange-500/30', label: 'Stock Adjustment' },
  VOUCHER_CREATE: { bg: 'bg-indigo-500/15', text: 'text-indigo-500', border: 'border-indigo-500/30', label: 'Voucher Created' },
  VOUCHER_DELETE: { bg: 'bg-pink-500/15', text: 'text-pink-500', border: 'border-pink-500/30', label: 'Voucher Deleted' },
  SETTINGS_UPDATE: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30', label: 'Settings Updated' },
};

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  onClose,
  documentIdFilter,
  initialAuditTab = 'mca_trail',
}) => {
  const [activeTab, setActiveTab] = useState<AuditTab>(initialAuditTab);
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleSwitchAuditTab = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        const t = e.detail;
        if (t === 'mca_trail' || t === 'party_balance' || t === 'inventory_stock') {
          setActiveTab(t);
        }
      }
    };
    window.addEventListener('switch_audit_tab', handleSwitchAuditTab);
    return () => window.removeEventListener('switch_audit_tab', handleSwitchAuditTab);
  }, []);

  // Scope filter: Current epoch (default) / Legacy / All
  const [selectedScope, setSelectedScope] = useState<'CURRENT' | 'LEGACY' | 'ALL'>('CURRENT');

  // Live Verification
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<AuditVerificationResult | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState(documentIdFilter || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');

  // Inspection Drawer
  const [inspectRecord, setInspectRecord] = useState<AuditRecord | null>(null);
  const [diffMode, setDiffMode] = useState<'visual' | 'raw'>('visual');
  const [copiedHashRecordId, setCopiedHashRecordId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await auditTrail.getAuditTrail({ sortDirection: 'desc' });
      setRecords(data);
      const vResult = await auditTrail.verifyCurrentEpoch();
      setVerificationResult(vResult);
    } catch (err) {
      console.error('Failed to load audit records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await auditTrail.verifyCurrentEpoch();
      setVerificationResult(res);
      if (res.valid) {
        showToast(
          res.totalRecords > 0
            ? `Current epoch verified: all ${res.totalRecords} records cryptographically intact`
            : 'Current epoch verified: ready and cryptographically healthy'
        );
      } else {
        showToast(`Current epoch tampering detected at sequence #${res.brokenSequence}`);
      }
    } catch (err: any) {
      setVerificationResult({
        valid: false,
        totalRecords: records.filter((r) => r.epoch === CURRENT_AUDIT_EPOCH).length,
        reason: err?.message || 'Verification exception encountered',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyHash = (hash: string, recordId: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(hash);
    }
    setCopiedHashRecordId(recordId);
    setTimeout(() => setCopiedHashRecordId(null), 2000);
    showToast('Hash copied to clipboard');
  };

  const handleExportCsv = async () => {
    try {
      const csvText = await auditTrail.exportAuditTrailAsCsv();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mca_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exported CSV successfully');
    } catch (err) {
      console.error('Failed to export CSV:', err);
    }
  };

  const handleExportJson = async () => {
    try {
      const jsonText = await auditTrail.exportAuditTrailAsJson();
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mca_audit_trail_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exported JSON successfully');
    } catch (err) {
      console.error('Failed to export JSON:', err);
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setSelectedAction('ALL');
    setSelectedUser('ALL');
  };

  // Distinct users list for filtering
  const distinctUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string }>();
    records.forEach((r) => {
      if (!map.has(r.userId)) {
        map.set(r.userId, { id: r.userId, name: r.userName, role: r.userRole });
      }
    });
    return Array.from(map.values());
  }, [records]);

  // Counts by epoch
  const legacyCount = useMemo(
    () => records.filter((r) => (r.epoch ?? LEGACY_AUDIT_EPOCH) === LEGACY_AUDIT_EPOCH).length,
    [records]
  );
  const currentEpochCount = useMemo(
    () => records.filter((r) => (r.epoch ?? LEGACY_AUDIT_EPOCH) === CURRENT_AUDIT_EPOCH).length,
    [records]
  );

  // Active scope filtering (Current Epoch / Legacy / All)
  const scopedRecords = useMemo(() => {
    if (selectedScope === 'CURRENT') {
      return records.filter((r) => (r.epoch ?? LEGACY_AUDIT_EPOCH) === CURRENT_AUDIT_EPOCH);
    }
    if (selectedScope === 'LEGACY') {
      return records.filter((r) => (r.epoch ?? LEGACY_AUDIT_EPOCH) === LEGACY_AUDIT_EPOCH);
    }
    return records;
  }, [records, selectedScope]);

  // Client-side filtering within the active scope
  const filteredRecords = useMemo(() => {
    return scopedRecords.filter((r) => {
      if (selectedAction !== 'ALL' && r.actionType !== selectedAction) {
        return false;
      }
      if (selectedUser !== 'ALL' && r.userId !== selectedUser) {
        return false;
      }
      if (startDate) {
        const d = r.timestamp.slice(0, 10);
        if (d < startDate) return false;
      }
      if (endDate) {
        const d = r.timestamp.slice(0, 10);
        if (d > endDate) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matches =
          r.documentId.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.userName.toLowerCase().includes(q) ||
          r.actionType.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [scopedRecords, selectedAction, selectedUser, startDate, endDate, searchTerm]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-container-highest text-on-surface px-4 py-2.5 rounded-xl shadow-xl border border-outline-variant/40 flex items-center gap-2 text-sm font-medium animate-fade-in">
          <span className="material-symbols-outlined text-[18px] text-primary">info</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Audit Navigation Switcher */}
      <div className="bg-surface-container-low p-1.5 rounded-2xl border border-outline-variant/30 flex items-center gap-1.5 shadow-xs overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('mca_trail')}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'mca_trail'
              ? 'bg-surface text-on-surface shadow-xs border border-outline-variant/40'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
          }`}
        >
          <span className="material-symbols-outlined text-[18px] text-primary">verified_user</span>
          <span>MCA Audit Trail</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('party_balance')}
          className={`flex-1 min-w-[150px] py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'party_balance'
              ? 'bg-surface text-on-surface shadow-xs border border-outline-variant/40'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
          }`}
        >
          <span className="material-symbols-outlined text-[18px] text-secondary">account_balance_wallet</span>
          <span>Party Balance Auditor</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('inventory_stock')}
          className={`flex-1 min-w-[150px] py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'inventory_stock'
              ? 'bg-surface text-on-surface shadow-xs border border-outline-variant/40'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
          }`}
        >
          <span className="material-symbols-outlined text-[18px] text-amber-500">inventory_2</span>
          <span>Inventory Stock Auditor</span>
        </button>
      </div>

      {/* Tab Panel 2: Party Balance Auditor */}
      {activeTab === 'party_balance' && (
        <FinancialBalanceAuditorPanel onRefreshParent={loadData} />
      )}

      {/* Tab Panel 3: Inventory Stock Auditor */}
      {activeTab === 'inventory_stock' && (
        <InventoryStockAuditorPanel onRefreshParent={loadData} />
      )}

      {/* Tab Panel 1: MCA Statutory Audit Trail */}
      {activeTab === 'mca_trail' && (
        <>
      {/* Header & Verification Status Card */}
      <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">verified_user</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-on-surface">MCA Statutory Audit Trail</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
                Rule 3(1) Compliant
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Cryptographically chained SHA-256 event ledger. Immutable, tamper-evident record of all financial mutations.
            </p>
            {/* Legacy Archive Notice */}
            <div className="mt-2 text-xs flex flex-wrap items-center gap-2">
              <span
                data-testid="legacy-archive-badge"
                className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20"
              >
                <span className="material-symbols-outlined text-[14px]">archive</span>
                <span>Legacy archive: {legacyCount} records preserved</span>
              </span>
              <span className="text-[11px] text-on-surface-variant/80">
                (Archived and not re-verified)
              </span>
            </div>
          </div>
        </div>

        {/* Live Integrity Badge & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {verificationResult && (
            <div
              data-testid="current-epoch-badge"
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                verificationResult.valid
                  ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-500 border-rose-500/30'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {verificationResult.valid ? 'check_circle' : 'warning'}
              </span>
              <span>
                {verificationResult.valid
                  ? `Current epoch: Healthy`
                  : `Current epoch violation (#${verificationResult.brokenSequence || '?'})`}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="px-3.5 py-1.5 bg-surface-container-highest hover:bg-surface-container-high text-on-surface rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-outline-variant/30 cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${isVerifying ? 'animate-spin' : ''}`}>
              {isVerifying ? 'sync' : 'lock_reset'}
            </span>
            <span>{isVerifying ? 'Verifying...' : 'Verify Current Epoch'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-surface-container-highest hover:bg-surface-container-high text-on-surface rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-outline-variant/30 cursor-pointer"
            title="Export CSV (RFC 4180)"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-surface-container-highest hover:bg-surface-container-high text-on-surface rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-outline-variant/30 cursor-pointer"
            title="Export JSON Ledger"
          >
            <span className="material-symbols-outlined text-[16px]">data_object</span>
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Verification Warning Banner if Current Epoch Tampered */}
      {verificationResult && !verificationResult.valid && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-xs text-rose-500 flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] text-rose-500 shrink-0">error</span>
          <div>
            <span className="font-bold">Current Epoch Cryptographic Integrity Violation Detected: </span>
            <span>{verificationResult.reason}</span>
            {verificationResult.corruptedRecordId && (
              <div className="mt-1 font-mono text-[11px] opacity-90">
                Corrupted Record ID: {verificationResult.corruptedRecordId}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/30 flex flex-col gap-3">
        {/* Scope Selector (Current Epoch / Legacy / All) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant/15">
          <div className="flex items-center gap-1.5 bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/30">
            <button
              type="button"
              data-testid="scope-current"
              onClick={() => setSelectedScope('CURRENT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedScope === 'CURRENT'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">verified</span>
              <span>Current Epoch</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedScope === 'CURRENT'
                    ? 'bg-on-primary/20 text-on-primary'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {currentEpochCount}
              </span>
            </button>

            <button
              type="button"
              data-testid="scope-legacy"
              onClick={() => setSelectedScope('LEGACY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedScope === 'LEGACY'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">archive</span>
              <span>Legacy</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedScope === 'LEGACY'
                    ? 'bg-black/20 text-white'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {legacyCount}
              </span>
            </button>

            <button
              type="button"
              data-testid="scope-all"
              onClick={() => setSelectedScope('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedScope === 'ALL'
                  ? 'bg-surface-container-highest text-on-surface shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span>All</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedScope === 'ALL'
                    ? 'bg-surface-container text-on-surface'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {records.length}
              </span>
            </button>
          </div>

          <div className="text-xs text-on-surface-variant">
            {selectedScope === 'CURRENT' && (
              <span className="text-primary font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                <span>Active epoch (clean cryptographic chain)</span>
              </span>
            )}
            {selectedScope === 'LEGACY' && (
              <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">archive</span>
                <span>Immutable legacy archive preserved</span>
              </span>
            )}
            {selectedScope === 'ALL' && (
              <span className="font-medium">
                Combined view across all audit epochs
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search Input */}
          <div className="relative lg:col-span-2">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by doc ID, user, summary..."
              className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest text-on-surface text-xs rounded-xl border border-outline-variant/30 focus:outline-none focus:border-primary placeholder:text-on-surface-variant/60"
            />
          </div>

          {/* Action Type Dropdown */}
          <div>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-lowest text-on-surface text-xs rounded-xl border border-outline-variant/30 focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Financial Actions</option>
              <option value="INVOICE_CREATE">Invoice Created</option>
              <option value="INVOICE_UPDATE">Invoice Updated</option>
              <option value="INVOICE_DELETE">Invoice Deleted</option>
              <option value="INVOICE_CANCEL">Invoice Cancelled</option>
              <option value="PURCHASE_CREATE">Purchase Created</option>
              <option value="PURCHASE_UPDATE">Purchase Updated</option>
              <option value="PURCHASE_DELETE">Purchase Deleted</option>
              <option value="PAYMENT_RECORD">Payment / Receipt</option>
              <option value="STOCK_ADJUSTMENT">Stock Adjustment</option>
              <option value="VOUCHER_CREATE">Voucher Created</option>
              <option value="VOUCHER_DELETE">Voucher Deleted</option>
              <option value="SETTINGS_UPDATE">Settings Updated</option>
            </select>
          </div>

          {/* User Dropdown */}
          <div>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-lowest text-on-surface text-xs rounded-xl border border-outline-variant/30 focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Users</option>
              {distinctUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-1/2 px-2 py-2 bg-surface-container-lowest text-on-surface text-xs rounded-xl border border-outline-variant/30 focus:outline-none focus:border-primary"
              title="From Date"
            />
            <span className="text-on-surface-variant text-xs">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-1/2 px-2 py-2 bg-surface-container-lowest text-on-surface text-xs rounded-xl border border-outline-variant/30 focus:outline-none focus:border-primary"
              title="To Date"
            />
          </div>
        </div>

        {/* Filter Summary & Reset */}
        <div className="flex items-center justify-between text-xs text-on-surface-variant pt-1 border-t border-outline-variant/15">
          <div>
            Showing <span className="font-bold text-on-surface">{filteredRecords.length}</span> of{' '}
            <span className="font-bold text-on-surface">{scopedRecords.length}</span> audit records
          </div>
          {(searchTerm || startDate || endDate || selectedAction !== 'ALL' || selectedUser !== 'ALL') && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-16 text-center text-on-surface-variant flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[32px] animate-spin text-primary">sync</span>
            <span className="text-xs font-medium">Loading statutory audit ledger...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center text-on-surface-variant flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[36px] text-outline">
              {selectedScope === 'CURRENT' && scopedRecords.length === 0 ? 'verified' : 'history'}
            </span>
            <span className="text-xs font-medium">
              {selectedScope === 'CURRENT' && scopedRecords.length === 0
                ? 'No current epoch audit records yet. Next event will start sequence #0001 from genesis anchor.'
                : 'No audit events found matching the selected filters'}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/30 text-[11px] font-bold">
                  <th className="py-3 px-4 w-28">Seq</th>
                  <th className="py-3 px-4 w-36">Timestamp</th>
                  <th className="py-3 px-4 w-36">User</th>
                  <th className="py-3 px-4 w-40">Action</th>
                  <th className="py-3 px-4 w-32">Document</th>
                  <th className="py-3 px-4">Summary</th>
                  <th className="py-3 px-4 w-28">Record Hash</th>
                  <th className="py-3 px-4 w-24 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 text-on-surface">
                {filteredRecords.map((r) => {
                  const actionCfg = ACTION_COLORS[r.actionType] || {
                    bg: 'bg-surface-container-high',
                    text: 'text-on-surface',
                    border: 'border-outline-variant',
                    label: r.actionType,
                  };
                  const dateStr = new Date(r.timestamp).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  const isCopied = copiedHashRecordId === r.id;

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"
                      onClick={() => setInspectRecord(r)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-primary">
                            #{String(r.sequence).padStart(4, '0')}
                          </span>
                          {(r.epoch ?? LEGACY_AUDIT_EPOCH) === CURRENT_AUDIT_EPOCH ? (
                            <span
                              data-testid="badge-current"
                              className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-primary/10 text-primary border border-primary/20"
                            >
                              Current
                            </span>
                          ) : (
                            <span
                              data-testid="badge-legacy"
                              className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            >
                              Legacy
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-on-surface-variant whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold truncate max-w-[120px]">{r.userName}</div>
                        <div className="text-[10px] text-on-surface-variant font-mono uppercase">
                          {r.userRole}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${actionCfg.bg} ${actionCfg.text} ${actionCfg.border}`}
                        >
                          {actionCfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] font-medium text-on-surface truncate max-w-[120px]">
                        {r.documentId}
                      </td>
                      <td className="py-3 px-4 truncate max-w-[260px] text-on-surface-variant" title={r.summary}>
                        {r.summary}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyHash(r.recordHash, r.id);
                          }}
                          className="flex items-center gap-1 hover:text-primary transition-colors text-on-surface-variant"
                          title={`Click to copy full hash: ${r.recordHash}`}
                        >
                          <span>{r.recordHash.slice(0, 8)}...</span>
                          <span className="material-symbols-outlined text-[14px]">
                            {isCopied ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectRecord(r);
                          }}
                          className="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-lg text-[11px] font-bold transition-all border border-outline-variant/30"
                        >
                          Diff
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Statutory Immutability Footnote */}
      <div className="bg-surface-container-low/50 rounded-xl p-3 border border-outline-variant/20 flex items-center justify-between text-xs text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-emerald-500">lock</span>
          <span>
            Permanently enabled edit log per MCA Companies (Accounts) Rules, 2014 Rule 3(1). Logs cannot be disabled or purged.
          </span>
        </div>
        <span className="font-mono text-[10px] opacity-70">
          Genesis Anchor: {GENESIS_PREVIOUS_HASH.slice(0, 16)}...
        </span>
      </div>

      {/* Inspection & Diff Modal */}
      {inspectRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-outline-variant/30">
            {/* Modal Header */}
            <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded-lg bg-primary text-on-primary font-mono text-xs font-bold">
                  #{String(inspectRecord.sequence).padStart(4, '0')}
                </span>
                {(inspectRecord.epoch ?? LEGACY_AUDIT_EPOCH) === CURRENT_AUDIT_EPOCH ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary border border-primary/20">
                    Current Epoch
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Legacy Archive
                  </span>
                )}
                <div>
                  <h3 className="font-bold text-sm text-on-surface">
                    {inspectRecord.actionType} • {inspectRecord.documentId}
                  </h3>
                  <div className="text-[11px] text-on-surface-variant flex items-center gap-2">
                    <span>{new Date(inspectRecord.timestamp).toISOString()}</span>
                    <span>•</span>
                    <span>By: {inspectRecord.userName} ({inspectRecord.userRole})</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectRecord(null)}
                aria-label="Close audit record"
                className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex flex-col gap-4">
              {/* Summary */}
              <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/20">
                <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Event Summary
                </div>
                <div className="text-xs text-on-surface font-medium">{inspectRecord.summary}</div>
              </div>

              {/* Cryptographic Chain Box */}
              <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/20 flex flex-col gap-2 font-mono text-xs">
                <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider font-sans">
                  Cryptographic Chain Linkage
                </div>
                <div>
                  <span className="text-on-surface-variant">Previous Hash: </span>
                  <span className="text-on-surface break-all">
                    {inspectRecord.previousHash === GENESIS_PREVIOUS_HASH ? (
                      <span className="text-emerald-500 font-bold">
                        {inspectRecord.previousHash} (Genesis Anchor)
                      </span>
                    ) : (
                      inspectRecord.previousHash
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-on-surface-variant">Record Hash: </span>
                  <span className="text-primary font-bold break-all">{inspectRecord.recordHash}</span>
                </div>
              </div>

              {/* Snapshot Diff Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-on-surface">State Transition Snapshot</div>
                  <div className="flex bg-surface-container-low rounded-lg p-0.5 border border-outline-variant/20">
                    <button
                      type="button"
                      onClick={() => setDiffMode('visual')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                        diffMode === 'visual'
                          ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      Visual Diff
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiffMode('raw')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                        diffMode === 'raw'
                          ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      Raw JSON
                    </button>
                  </div>
                </div>

                {diffMode === 'visual' ? (
                  <div className="border border-outline-variant/20 rounded-xl overflow-hidden">
                    {inspectRecord.previousSnapshot === undefined && inspectRecord.newSnapshot ? (
                      <div className="p-3 bg-emerald-500/10 text-emerald-500 text-xs font-medium border-b border-outline-variant/20 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">add_circle</span>
                        <span>Initial document creation. All fields newly recorded.</span>
                      </div>
                    ) : inspectRecord.newSnapshot === undefined && inspectRecord.previousSnapshot ? (
                      <div className="p-3 bg-rose-500/10 text-rose-500 text-xs font-medium border-b border-outline-variant/20 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                        <span>Document deleted. Pre-deletion snapshot captured above.</span>
                      </div>
                    ) : null}

                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/20 text-[10px] uppercase font-bold">
                            <th className="py-2 px-3 w-1/3">Field</th>
                            <th className="py-2 px-3 w-1/3">Previous Value</th>
                            <th className="py-2 px-3 w-1/3">New Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/15 text-xs font-mono">
                          {computeDiff(inspectRecord.previousSnapshot, inspectRecord.newSnapshot).map((d) => {
                            if (d.type === 'unchanged') return null; // Only show modified/added/removed
                            const rowBg =
                              d.type === 'added'
                                ? 'bg-emerald-500/10'
                                : d.type === 'removed'
                                ? 'bg-rose-500/10'
                                : 'bg-amber-500/10';

                            return (
                              <tr key={d.field} className={rowBg}>
                                <td className="py-2 px-3 font-bold font-sans text-on-surface">
                                  {d.field}
                                </td>
                                <td className="py-2 px-3 text-rose-400 break-all">
                                  {formatValue(d.oldValue)}
                                </td>
                                <td className="py-2 px-3 text-emerald-400 break-all">
                                  {formatValue(d.newValue)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/20 max-h-72 overflow-y-auto">
                      <div className="text-[11px] font-sans font-bold text-on-surface-variant mb-1">
                        Previous Snapshot
                      </div>
                      <pre className="text-[11px] text-on-surface whitespace-pre-wrap">
                        {JSON.stringify(inspectRecord.previousSnapshot ?? null, null, 2)}
                      </pre>
                    </div>
                    <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/20 max-h-72 overflow-y-auto">
                      <div className="text-[11px] font-sans font-bold text-on-surface-variant mb-1">
                        New Snapshot
                      </div>
                      <pre className="text-[11px] text-on-surface whitespace-pre-wrap">
                        {JSON.stringify(inspectRecord.newSnapshot ?? null, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-outline-variant/20 bg-surface-container-low flex justify-end">
              <button
                type="button"
                onClick={() => setInspectRecord(null)}
                className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
