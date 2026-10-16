import React, { useState, useMemo, useRef } from 'react';
import { db } from '../../../services/db.ts';
import {
  DatabaseBackupBundle,
  validateBackupBundle,
  generateBackupFilename,
} from '../../../core/backup/backupEngine.ts';
import { formatINR, formatDate } from '../../../core/utils/formatters.ts';
import { useBackNavigation } from '../../../core/utils/backNavigation.ts';
import { showAppToast } from '../../../services/toast.ts';

export interface DatabaseBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored?: () => void;
}

export const DatabaseBackupModal: React.FC<DatabaseBackupModalProps> = ({
  isOpen,
  onClose,
  onRestored,
}) => {
  useBackNavigation(onClose, isOpen);

  const [activeTab, setActiveTab] = useState<'BACKUP' | 'RESTORE'>('BACKUP');

  // Backup State
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportedFilename, setLastExportedFilename] = useState<string | null>(null);

  // Restore State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBundle, setParsedBundle] = useState<DatabaseBackupBundle | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<'REPLACE' | 'MERGE'>('REPLACE');
  const [isArmedConfirm, setIsArmedConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessNotice, setRestoreSuccessNotice] = useState<string | null>(null);

  // Live database snapshot for Backup view
  const liveBackup = useMemo(() => {
    if (!isOpen) return null;
    return db.createDatabaseBackup();
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleDownloadBackup = () => {
    setIsExporting(true);
    try {
      const res = db.downloadDatabaseBackup(liveBackup || undefined);
      setLastExportedFilename(res.filename);
      showAppToast(`Backup downloaded: ${res.filename}`);
    } catch (err: any) {
      alert(`Backup download failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareBackup = async () => {
    if (!liveBackup) return;
    const jsonStr = JSON.stringify(liveBackup, null, 2);
    const filename = generateBackupFilename(liveBackup.metadata?.businessName);

    try {
      if (navigator.share && navigator.canShare) {
        const file = new File([jsonStr], filename, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'GST Billing Database Backup',
            text: `Backup for ${liveBackup.metadata?.businessName || 'Business'} (${liveBackup.createdAt})`,
            files: [file],
          });
          showAppToast('Backup shared successfully');
          return;
        }
      }

      // Fallback: Copy to clipboard
      await navigator.clipboard.writeText(jsonStr);
      showAppToast('Backup JSON copied to clipboard');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showAppToast('Failed to share backup file');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setValidationError(null);
    setRestoreSuccessNotice(null);
    setParsedBundle(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setIsArmedConfirm(false);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const res = validateBackupBundle(text);
        if (!res.isValid || !res.bundle) {
          setValidationError(res.error || 'Corrupted or unsupported backup file.');
          setParsedBundle(null);
        } else {
          setParsedBundle(res.bundle);
          setValidationError(null);
        }
      } catch {
        setValidationError('Failed to read backup file as JSON.');
        setParsedBundle(null);
      }
    };

    reader.onerror = () => {
      setValidationError('Error reading file from disk.');
      setParsedBundle(null);
    };

    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!parsedBundle) return;

    setIsRestoring(true);
    setValidationError(null);
    setRestoreSuccessNotice(null);

    try {
      // 1. Download safety backup of current data first
      db.downloadDatabaseBackup();

      // 2. Execute restore
      const result = await db.restoreDatabaseBackup(parsedBundle, restoreMode);

      setRestoreSuccessNotice(
        `Database restored successfully in ${restoreMode} mode! (${result.restoredCounts.invoices} invoices, ${result.restoredCounts.items} items, ${result.restoredCounts.parties} parties).`
      );
      showAppToast('Database restored successfully');
      onRestored?.();
    } catch (err: any) {
      setValidationError(err?.message || 'Database restore failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in"
    >
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center text-secondary flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">database</span>
            </div>
            <div className="flex flex-col">
              <h2 id="backup-modal-title" className="font-headline-sm text-base sm:text-lg font-bold text-on-surface">
                Database Backup &amp; Restore
              </h2>
              <span className="text-xs text-on-surface-variant">
                100% offline, full JSON backup of financial records, bills &amp; stock
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-outline-variant/20 bg-surface-container-low/30 px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('BACKUP')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'BACKUP'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Create Backup</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('RESTORE')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'RESTORE'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">upload</span>
            <span>Restore Database</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex flex-col gap-4">
          {activeTab === 'BACKUP' ? (
            /* --- CREATE BACKUP TAB --- */
            <div className="flex flex-col gap-4">
              {/* Business Summary Card */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-on-surface">
                    {liveBackup?.metadata?.businessName || 'Business Profile'}
                  </span>
                  {liveBackup?.metadata?.gstin ? (
                    <span className="text-[11px] font-mono text-secondary font-semibold">
                      GSTIN: {liveBackup.metadata.gstin}
                    </span>
                  ) : (
                    <span className="text-[11px] text-outline">Unregistered</span>
                  )}
                </div>
                <div className="text-[11px] text-on-surface-variant flex items-center gap-2">
                  <span>Version: v{liveBackup?.appVersion}</span>
                  <span>•</span>
                  <span>Payload format: JSON</span>
                  <span>•</span>
                  <span>Tamper-proof FNV Checksum</span>
                </div>
              </div>

              {/* Records Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Sales Bills</span>
                  <span className="text-base sm:text-lg font-bold text-on-surface font-tabular-data">
                    {liveBackup?.counts.invoices || 0}
                  </span>
                  <span className="text-[10px] text-secondary font-semibold truncate">
                    {formatINR(liveBackup?.metadata?.totalSalesAmount || 0)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Purchases</span>
                  <span className="text-base sm:text-lg font-bold text-on-surface font-tabular-data">
                    {liveBackup?.counts.purchases || 0}
                  </span>
                  <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold truncate">
                    {formatINR(liveBackup?.metadata?.totalPurchasesAmount || 0)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Products</span>
                  <span className="text-base sm:text-lg font-bold text-on-surface font-tabular-data">
                    {liveBackup?.counts.items || 0}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">
                    +{liveBackup?.counts.stockAdjustments || 0} stock entries
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Parties</span>
                  <span className="text-base sm:text-lg font-bold text-on-surface font-tabular-data">
                    {liveBackup?.counts.parties || 0}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">Customers &amp; Suppliers</span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Vouchers</span>
                  <span className="text-base sm:text-lg font-bold text-on-surface font-tabular-data">
                    {liveBackup?.counts.vouchers || 0}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">Double-entry ledger</span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Expenses</span>
                  <span className="text-base sm:text-lg font-bold text-on-surface font-tabular-data">
                    {liveBackup?.counts.expenses || 0}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">Operating costs</span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Bank &amp; Cash</span>
                  <span className="text-base sm:text-lg font-bold text-on-surface font-tabular-data">
                    {liveBackup?.counts.bankAccounts || 0}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">
                    +{liveBackup?.counts.cashBankTransactions || 0} transfers
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex flex-col">
                  <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Audit Logs</span>
                  <span className="text-base sm:text-lg font-bold text-on-surface font-tabular-data">
                    {liveBackup?.counts.auditLogs || 0}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">Immutable trail</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={isExporting}
                  className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  <span>{isExporting ? 'Generating...' : 'Download JSON Backup'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareBackup}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-surface-container text-on-surface font-bold text-sm hover:bg-surface-container-high transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  title="Share backup via Android share sheet, WhatsApp, or Drive"
                >
                  <span className="material-symbols-outlined text-[20px]">share</span>
                  <span>Share</span>
                </button>
              </div>

              {lastExportedFilename && (
                <div className="p-2.5 rounded-xl bg-secondary/10 border border-secondary/20 text-secondary text-xs font-medium flex items-center gap-2 animate-fade-in">
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  <span>Saved: {lastExportedFilename}</span>
                </div>
              )}
            </div>
          ) : (
            /* --- RESTORE DATABASE TAB --- */
            <div className="flex flex-col gap-4">
              {/* File Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 hover:border-secondary transition-colors cursor-pointer bg-surface-container-low/30 text-center"
              >
                <div className="w-12 h-12 rounded-full bg-secondary/15 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[28px]">upload_file</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-on-surface">
                    {selectedFile ? selectedFile.name : 'Choose Backup File (.json)'}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : 'Click to select a GST Billing JSON backup file'}
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Validation Error Banner */}
              {validationError && (
                <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-semibold flex items-center gap-2 animate-fade-in">
                  <span className="material-symbols-outlined text-[20px] flex-shrink-0">error</span>
                  <span>{validationError}</span>
                </div>
              )}

              {/* Restore Success Banner */}
              {restoreSuccessNotice && (
                <div className="p-3 rounded-xl bg-secondary/10 border border-secondary/20 text-secondary text-xs font-semibold flex items-center gap-2 animate-fade-in">
                  <span className="material-symbols-outlined text-[20px] flex-shrink-0">check_circle</span>
                  <span>{restoreSuccessNotice}</span>
                </div>
              )}

              {/* Parsed Backup Contents Preview */}
              {parsedBundle && (
                <div className="flex flex-col gap-3 p-4 rounded-xl bg-surface-container-low border border-secondary/30 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                    <span className="text-xs font-bold text-on-surface">
                      {parsedBundle.metadata?.businessName || parsedBundle.data.company.businessName}
                    </span>
                    <span className="text-[11px] text-secondary font-semibold">
                      Created: {formatDate(parsedBundle.createdAt)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-surface-container-lowest">
                      <span className="text-[10px] text-outline block">Invoices</span>
                      <strong className="text-on-surface">{parsedBundle.counts.invoices}</strong>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-container-lowest">
                      <span className="text-[10px] text-outline block">Purchases</span>
                      <strong className="text-on-surface">{parsedBundle.counts.purchases}</strong>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-container-lowest">
                      <span className="text-[10px] text-outline block">Products</span>
                      <strong className="text-on-surface">{parsedBundle.counts.items}</strong>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-container-lowest">
                      <span className="text-[10px] text-outline block">Parties</span>
                      <strong className="text-on-surface">{parsedBundle.counts.parties}</strong>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-outline-variant/20">
                    <label className="text-xs font-bold text-on-surface">Select Restore Mode:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRestoreMode('REPLACE');
                          setIsArmedConfirm(false);
                        }}
                        className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                          restoreMode === 'REPLACE'
                            ? 'bg-secondary/15 border-secondary text-secondary font-bold'
                            : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant'
                        }`}
                      >
                        <span className="text-xs">Clean Overwrite</span>
                        <span className="text-[10px] font-normal opacity-80">
                          Replaces all local data with backup
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRestoreMode('MERGE');
                          setIsArmedConfirm(false);
                        }}
                        className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                          restoreMode === 'MERGE'
                            ? 'bg-secondary/15 border-secondary text-secondary font-bold'
                            : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant'
                        }`}
                      >
                        <span className="text-xs">Merge Data</span>
                        <span className="text-[10px] font-normal opacity-80">
                          Preserves current, adds missing records
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Restore Action */}
                  {!isArmedConfirm ? (
                    <button
                      type="button"
                      onClick={() => setIsArmedConfirm(true)}
                      disabled={isRestoring}
                      className="w-full mt-2 py-3 px-4 rounded-xl bg-error text-on-error font-bold text-sm shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        settings_backup_restore
                      </span>
                      <span>
                        Restore Database ({restoreMode === 'REPLACE' ? 'Clean Overwrite' : 'Merge Data'})
                      </span>
                    </button>
                  ) : (
                    <div className="mt-2 p-3.5 rounded-xl border border-error/40 bg-error/10 flex flex-col gap-2.5 animate-fade-in">
                      <div className="flex items-start gap-2 text-xs">
                        <span className="material-symbols-outlined text-error text-[20px] shrink-0 mt-0.5">
                          warning
                        </span>
                        <div>
                          <p className="font-bold text-error">
                            {restoreMode === 'REPLACE'
                              ? 'Confirm Clean Overwrite Restore'
                              : 'Confirm Merge Restore'}
                          </p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
                            {restoreMode === 'REPLACE'
                              ? 'This will overwrite your existing sales, purchases, items, parties and vouchers with the backup bundle. A safety backup copy of your current database will be auto-downloaded first.'
                              : 'This will merge records from the backup bundle into your database. A safety backup copy of your current database will be auto-downloaded first.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setIsArmedConfirm(false)}
                          disabled={isRestoring}
                          className="flex-1 py-2 px-3 rounded-lg border border-outline-variant/40 bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleExecuteRestore}
                          disabled={isRestoring}
                          className="flex-1 py-2 px-3 rounded-lg bg-error text-on-error text-xs font-bold shadow active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {isRestoring ? 'hourglass_empty' : 'check_circle'}
                          </span>
                          <span>{isRestoring ? 'Restoring...' : 'Proceed with Restore'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-outline-variant/20 bg-surface-container-low/50 flex items-center justify-between text-xs text-on-surface-variant">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="material-symbols-outlined text-[16px] text-secondary">security</span>
            <span>Safety copy automatically downloaded before any restore</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-surface-container text-on-surface font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
