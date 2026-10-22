import React, { useState, useMemo, useRef } from 'react';
import { db } from '../../../services/db.ts';
import {
  DatabaseBackupBundle,
  validateBackupBundle,
  generateBackupFilename,
} from '../../../core/backup/backupEngine.ts';
import {
  createAndVerifyPreMigrationBackup,
  restorePreMigrationBackup,
} from '../../../services/db/preMigrationBackup.ts';
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
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStepText, setExportStepText] = useState('');
  const [lastExportedFilename, setLastExportedFilename] = useState<string | null>(null);

  // Restore State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedBundle, setParsedBundle] = useState<DatabaseBackupBundle | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<'REPLACE' | 'MERGE'>('REPLACE');
  const [isArmedConfirm, setIsArmedConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreStepText, setRestoreStepText] = useState('');
  const [restoreSuccessNotice, setRestoreSuccessNotice] = useState<string | null>(null);
  const [lastSafetySnapshotId, setLastSafetySnapshotId] = useState<string | null>(null);
  const [canRollback, setCanRollback] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const isAndroidBridge = typeof window !== 'undefined' && !!(window as any).AndroidBridge;

  // Live database snapshot for Backup view
  const liveBackup = useMemo(() => {
    if (!isOpen) return null;
    return db.createDatabaseBackup();
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // Process selected file from either <input>, showOpenFilePicker, or drag-and-drop
  const processSelectedFile = (file: File) => {
    setValidationError(null);
    setRestoreSuccessNotice(null);
    setParsedBundle(null);
    setSelectedFile(file);
    setIsArmedConfirm(false);
    setCanRollback(false);

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

  // Explicit Browse File Handler supporting system file picker without storage permissions
  const handleBrowseFiles = async () => {
    if (isAndroidBridge) {
      fileInputRef.current?.click();
      return;
    }
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'GST Billing JSON Backup (*.json)',
              accept: {
                'application/json': ['.json'],
                'text/json': ['.json'],
                'text/plain': ['.json'],
              },
            },
          ],
          multiple: false,
        });
        if (handle) {
          const file = await handle.getFile();
          processSelectedFile(file);
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return; // User cancelled file picker
      }
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  // Consolidated Export Handler (Android MediaStore / SAF picker or Web showSaveFilePicker / Blob)
  const executeExport = async (usePicker: boolean = false) => {
    setIsExporting(true);
    setExportProgress(20);
    setExportStepText('Gathering financial records & vouchers...');

    let timeoutId: any = null;

    try {
      setExportProgress(50);
      setExportStepText('Building & verifying backup bundle...');

      const bundle = await (db as any).createDatabaseBackupAsync();
      const { filename, jsonStr } = (db as any).serializeDatabaseBackup(bundle);

      if (isAndroidBridge) {
        setExportProgress(80);
        setExportStepText(usePicker ? 'Opening save dialog...' : 'Saving backup...');

        // Clear any stale callback before installing new one
        try {
          delete (window as any).onBackupSaveResult;
        } catch {}

        const savePromise = new Promise<{ status: string; displayName: string; message: string }>((resolve, reject) => {
          timeoutId = setTimeout(() => {
            try {
              delete (window as any).onBackupSaveResult;
            } catch {}
            reject(new Error('Backup save timed out. Please try again.'));
          }, 120000);

          (window as any).onBackupSaveResult = (status: string, displayName: string, message: string) => {
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            try {
              delete (window as any).onBackupSaveResult;
            } catch {}
            resolve({ status, displayName, message });
          };
        });

        if (usePicker && typeof (window as any).AndroidBridge?.saveBackupWithPicker === 'function') {
          (window as any).AndroidBridge.saveBackupWithPicker(filename, jsonStr);
        } else if (typeof (window as any).AndroidBridge?.downloadBackup === 'function') {
          (window as any).AndroidBridge.downloadBackup(filename, jsonStr);
        } else {
          throw new Error('Android backup export bridge not available');
        }

        const res = await savePromise;
        if (res.status === 'SUCCESS') {
          setExportProgress(100);
          setExportStepText('Backup saved successfully!');
          setLastExportedFilename(res.displayName || filename);
          showAppToast(`Backup saved: ${res.displayName || filename}`);
        } else if (res.status === 'CANCELLED') {
          setExportStepText('');
          showAppToast(res.message || 'Backup cancelled');
        } else {
          throw new Error(res.message || 'Failed to save backup');
        }
      } else if (usePicker && typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        setExportProgress(75);
        setExportStepText('Choose folder to save backup file...');

        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'GST Billing Database Backup',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });

        setExportProgress(90);
        setExportStepText('Writing backup to selected file...');
        const writable = await handle.createWritable();
        await writable.write(jsonStr);
        await writable.close();

        setExportProgress(100);
        setExportStepText('Backup saved successfully!');
        setLastExportedFilename(filename);
        showAppToast(`Backup saved to chosen folder: ${filename}`);
      } else {
        setExportProgress(85);
        setExportStepText('Initiating download...');
        const res = db.downloadDatabaseBackup(bundle);
        if (!res.success && res.reason === 'ANDROID_FILE_PICKER_REQUIRED') {
          throw new Error('Android file picker required');
        }
        setExportProgress(100);
        setExportStepText('Download initiated!');
        setLastExportedFilename(res.filename);
        showAppToast(`Backup downloaded: ${res.filename}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      showAppToast(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try {
        delete (window as any).onBackupSaveResult;
      } catch {}
      setIsExporting(false);
      setExportProgress(0);
      setExportStepText('');
    }
  };

  const handleDownloadBackup = () => executeExport(false);
  const handleSaveToLocation = () => executeExport(true);

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

      await navigator.clipboard.writeText(jsonStr);
      showAppToast('Backup JSON copied to clipboard');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showAppToast('Failed to share backup file');
      }
    }
  };

  const handleExecuteRestore = async () => {
    if (!parsedBundle) return;

    setIsRestoring(true);
    setRestoreProgress(10);
    setRestoreStepText('Validating backup bundle & checksum...');
    setValidationError(null);
    setRestoreSuccessNotice(null);
    setCanRollback(false);

    const snapshotId = `restore_${Date.now()}`;
    let snapshotCreated = false;

    try {
      // 1. Create and verify pre-restore safety snapshot before touching any data
      setRestoreProgress(30);
      setRestoreStepText('Creating verified safety snapshot...');
      createAndVerifyPreMigrationBackup(snapshotId);
      snapshotCreated = true;
      setLastSafetySnapshotId(snapshotId);

      // 2. Execute restore
      setRestoreProgress(65);
      setRestoreStepText('Restoring invoices, items, parties & vouchers...');
      const result = await db.restoreDatabaseBackup(parsedBundle, restoreMode);

      setRestoreProgress(90);
      setRestoreStepText('Syncing local offline database & audit trail...');

      setRestoreProgress(100);
      setRestoreStepText('Database restored successfully!');

      setRestoreSuccessNotice(
        `Database restored successfully in ${restoreMode} mode! (${result.restoredCounts.invoices} invoices, ${result.restoredCounts.items} items, ${result.restoredCounts.parties} parties).`
      );
      showAppToast('Database restored successfully');
      onRestored?.();
    } catch (err: any) {
      setValidationError(err?.message || 'Database restore failed.');
      if (snapshotCreated) {
        setCanRollback(true);
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRollback = async () => {
    if (!lastSafetySnapshotId) return;
    setIsRollingBack(true);
    try {
      const ok = await restorePreMigrationBackup(lastSafetySnapshotId);
      if (ok) {
        setValidationError(null);
        setRestoreSuccessNotice('Database safely rolled back to pre-restore snapshot.');
        setCanRollback(false);
        showAppToast('Database restored to safety snapshot');
        onRestored?.();
      } else {
        showAppToast('Failed to rollback to safety snapshot');
      }
    } catch (err: any) {
      showAppToast(`Rollback failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsRollingBack(false);
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
              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={isExporting}
                  className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title="Download database backup file"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  <span>{isExporting ? 'Saving...' : 'Download Backup'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveToLocation}
                  disabled={isExporting}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl border border-secondary/40 bg-secondary/10 text-secondary hover:bg-secondary/20 font-bold text-sm active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title="Choose destination file or folder"
                >
                  <span className="material-symbols-outlined text-[20px]">save_as</span>
                  <span>Save As...</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareBackup}
                  disabled={isExporting}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-surface-container text-on-surface font-bold text-sm hover:bg-surface-container-high transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title="Share backup via Android share sheet, WhatsApp, or Drive"
                >
                  <span className="material-symbols-outlined text-[20px]">share</span>
                  <span>Share</span>
                </button>
              </div>

              {/* Export Progress Bar */}
              {isExporting && (
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-secondary/30 flex flex-col gap-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-secondary">
                      <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                      <span>{exportStepText || 'Creating backup...'}</span>
                    </span>
                    <span className="text-secondary font-mono">{exportProgress}%</span>
                  </div>
                  <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-secondary h-full transition-all duration-300 rounded-full"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {lastExportedFilename && !isExporting && (
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
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center gap-3 transition-all ${
                  isDragging
                    ? 'border-secondary bg-secondary/15 scale-[1.01]'
                    : 'border-outline-variant/40 bg-surface-container-low/30 hover:border-secondary/60'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-secondary/15 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[28px]">
                    {selectedFile ? 'file_present' : 'folder_open'}
                  </span>
                </div>
                <div className="flex flex-col items-center text-center max-w-sm">
                  <span className="text-sm font-bold text-on-surface truncate max-w-full">
                    {selectedFile ? selectedFile.name : 'Choose or Drop Backup File (.json)'}
                  </span>
                  <span className="text-xs text-on-surface-variant mt-0.5">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB • Last modified: ${new Date(selectedFile.lastModified).toLocaleDateString()}`
                      : 'Select a GST Billing JSON backup file from device storage, Google Drive, or SD card'}
                  </span>
                </div>

                {/* Explicit Action Buttons */}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={handleBrowseFiles}
                    className="py-2 px-4 rounded-xl bg-secondary text-on-secondary text-xs sm:text-sm font-bold shadow-sm hover:brightness-105 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">folder_open</span>
                    <span>{selectedFile ? 'Change Backup File' : 'Browse Backup File'}</span>
                  </button>
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setParsedBundle(null);
                        setValidationError(null);
                        setCanRollback(false);
                      }}
                      className="py-2 px-3 rounded-xl border border-outline-variant/40 text-on-surface-variant hover:text-error hover:border-error/40 text-xs font-semibold transition-colors cursor-pointer"
                      title="Remove selected file"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  id="database-restore-file-input"
                  type="file"
                  accept=".json,application/json,text/json,text/plain"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Restore Progress Bar */}
              {isRestoring && (
                <div className="p-4 rounded-xl bg-secondary/10 border border-secondary/30 flex flex-col gap-2.5 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-2 text-secondary">
                      <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                      <span>{restoreStepText || 'Restoring database...'}</span>
                    </span>
                    <span className="text-secondary font-mono font-bold">{restoreProgress}%</span>
                  </div>
                  <div className="w-full bg-surface-container h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-secondary h-full transition-all duration-300 rounded-full"
                      style={{ width: `${restoreProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span>Do not close this window while restoring...</span>
                    <span>Safe Mode Active</span>
                  </div>
                </div>
              )}

              {/* Validation Error Banner with Rollback Option */}
              {validationError && (
                <div className="p-3.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-semibold flex flex-col gap-2.5 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] flex-shrink-0">error</span>
                    <span>{validationError}</span>
                  </div>
                  {canRollback && lastSafetySnapshotId && (
                    <div className="flex items-center justify-between pt-2 border-t border-error/20">
                      <span className="text-[11px] text-on-surface-variant">
                        A verified safety snapshot was saved before restore failed.
                      </span>
                      <button
                        type="button"
                        onClick={handleRollback}
                        disabled={isRollingBack}
                        className="py-1.5 px-3 rounded-lg bg-error text-on-error font-bold text-xs hover:brightness-110 active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">undo</span>
                        <span>{isRollingBack ? 'Rolling back...' : 'Rollback to Snapshot'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Restore Success Banner */}
              {restoreSuccessNotice && !isRestoring && (
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
                              ? 'This will overwrite your existing sales, purchases, items, parties and vouchers with the backup bundle. A verified safety snapshot of your current database will be saved before restore.'
                              : 'This will merge records from the backup bundle into your database. A verified safety snapshot of your current database will be saved before restore.'}
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
            <span>Verified safety snapshot saved before restore</span>
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
