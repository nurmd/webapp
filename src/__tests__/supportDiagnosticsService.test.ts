import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PouchSyncState, SyncConflict } from '../services/pouchdb.ts';

// Mock pouchdb and db before importing service
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    getSyncState: vi.fn(),
    getActiveDbName: vi.fn(),
    isDemoMode: vi.fn(),
    isRemoteDbActive: vi.fn(),
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    resolveConflict: vi.fn(),
    syncNow: vi.fn(),
    startSync: vi.fn(),
    stopSync: vi.fn(),
  },
}));

vi.mock('../services/db.ts', () => ({
  db: {
    getCompany: vi.fn(),
    getParties: vi.fn(),
    getItems: vi.fn(),
    getInvoices: vi.fn(),
    getPurchases: vi.fn(),
    getExpenses: vi.fn(),
    getVouchers: vi.fn(),
    getBankAccounts: vi.fn(),
    getCashBankTransactions: vi.fn(),
    saveInvoice: vi.fn(),
    saveParty: vi.fn(),
    saveItem: vi.fn(),
    deleteInvoice: vi.fn(),
  },
}));

import { pouch } from '../services/pouchdb.ts';
import { db } from '../services/db.ts';
import {
  collectSupportDiagnostics,
  downloadSupportDiagnostics,
  supportDiagnosticsService,
} from '../services/supportDiagnosticsService.ts';
import { serializeSupportDiagnostics } from '../core/utils/supportDiagnostics.ts';

describe('SupportDiagnosticsService Collector & Exporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accurately collects record counts, sync status, pending changes, and conflicts', () => {
    // 1. Setup DB mocks
    vi.mocked(db.getCompany).mockReturnValue({ businessName: 'Super Secret Hardware', gstin: '18ADHPL1415E1ZX' } as any);
    vi.mocked(db.getParties).mockReturnValue([
      { id: 'PTY-1', name: 'Private Customer 1', phone: '9876543210' },
      { id: 'PTY-2', name: 'Private Customer 2', phone: '9876543211' },
      { id: 'PTY-3', name: 'Private Customer 3', phone: '9876543212' },
    ] as any);
    vi.mocked(db.getItems).mockReturnValue(new Array(5).fill({ id: 'item' }) as any);
    vi.mocked(db.getInvoices).mockReturnValue(new Array(10).fill({ id: 'inv' }) as any);
    vi.mocked(db.getPurchases).mockReturnValue(new Array(2).fill({ id: 'purch' }) as any);
    vi.mocked(db.getExpenses).mockReturnValue(new Array(4).fill({ id: 'exp' }) as any);
    vi.mocked(db.getVouchers).mockReturnValue(new Array(3).fill({ id: 'vouch' }) as any);
    vi.mocked(db.getBankAccounts).mockReturnValue(new Array(2).fill({ id: 'bank' }) as any);
    vi.mocked(db.getCashBankTransactions).mockReturnValue(new Array(7).fill({ id: 'tx' }) as any);

    // 2. Setup Pouch mocks with credentials in URL and sensitive conflict docs
    const mockSyncState: PouchSyncState = {
      status: 'error',
      remoteUrl: 'https://sync_admin:UltraSecretAuthToken99@couchdb.cloud.net:5984/pos_production_db',
      pendingChanges: 14,
      lastSyncedAt: '2026-10-25T05:30:00Z',
      error: 'Unauthorized access to https://sync_admin:UltraSecretAuthToken99@couchdb.cloud.net:5984/pos_production_db',
      conflicts: [
        {
          id: 'invoice:INV-001#rev-a',
          docId: 'invoice:INV-001',
          docType: 'invoice',
          entityId: 'INV-001',
          winningRev: 'rev-a',
          conflictingRev: 'rev-b',
          winningDoc: { id: 'INV-001', customerName: 'Confidential Client Ltd', gstin: '07AAAAA0000A1Z5' },
          conflictingDoc: { id: 'INV-001', customerName: 'Confidential Client Ltd' },
          detectedAt: '2026-10-25T05:31:00Z',
        },
        {
          id: 'party:PTY-002#rev-x',
          docId: 'party:PTY-002',
          docType: 'party',
          entityId: 'PTY-002',
          winningRev: 'rev-x',
          conflictingRev: 'rev-y',
          winningDoc: { id: 'PTY-002', name: 'Private Vendor Ltd' },
          conflictingDoc: { id: 'PTY-002', name: 'Private Vendor Ltd' },
          detectedAt: '2026-10-25T05:32:00Z',
        },
      ],
    };

    vi.mocked(pouch.getSyncState).mockReturnValue(mockSyncState);
    vi.mocked(pouch.getActiveDbName).mockReturnValue('vyapar_remote_pos');
    vi.mocked(pouch.isDemoMode).mockReturnValue(false);
    vi.mocked(pouch.isRemoteDbActive).mockReturnValue(true);

    // 3. Collect diagnostics
    const bundle = collectSupportDiagnostics();

    // 4. Assert record counts
    expect(bundle.recordCounts).toEqual({
      company: 1,
      parties: 3,
      items: 5,
      invoices: 10,
      purchases: 2,
      expenses: 4,
      vouchers: 3,
      bankAccounts: 2,
      cashBankTransactions: 7,
    });

    // 5. Assert sync state & truthful pending changes
    expect(bundle.sync.status).toBe('error');
    expect(bundle.sync.remoteHost).toMatch(/^host-[0-9a-f]{8}:5984$/);
    expect(bundle.sync.remoteDatabase).toMatch(/^db-[0-9a-f]{8}$/);
    expect(bundle.database.activeDbName).toMatch(/^remote-db-[0-9a-f]{8}$/);
    expect(bundle.sync.pendingChanges).toBe(14);
    expect(bundle.sync.lastSyncedTime).toBe('2026-10-25T05:30:00Z');

    // 6. Assert conflict summary
    expect(bundle.sync.conflictSummary.revisions).toBe(2);
    expect(bundle.sync.conflictSummary.uniqueDocuments).toBe(2);
    expect(bundle.sync.conflictSummary.byDocType).toEqual({
      invoice: 1,
      party: 1,
    });

    // 7. Assert ZERO credentials, customer names, or GSTINs in bundle
    const jsonStr = serializeSupportDiagnostics(bundle);
    expect(jsonStr).not.toContain('sync_admin');
    expect(jsonStr).not.toContain('UltraSecretAuthToken99');
    expect(jsonStr).not.toContain('Super Secret Hardware');
    expect(jsonStr).not.toContain('18ADHPL1415E1ZX');
    expect(jsonStr).not.toContain('Private Customer 1');
    expect(jsonStr).not.toContain('Confidential Client Ltd');
    expect(jsonStr).not.toContain('07AAAAA0000A1Z5');
    expect(jsonStr).not.toContain('Private Vendor Ltd');
    expect(jsonStr).not.toContain('rev-a');
    expect(jsonStr).not.toContain('rev-b');
    expect(jsonStr).not.toContain('couchdb.cloud.net');
    expect(jsonStr).not.toContain('pos_production_db');
    expect(jsonStr).not.toContain('vyapar_remote_pos');
    expect(bundle.privacyFlags.noBusinessIdentifiers).toBe(true);
  });

  it('asserts the service NEVER invokes database write, sync, or conflict-resolution methods', () => {
    vi.mocked(pouch.getSyncState).mockReturnValue({
      status: 'synced',
      remoteUrl: 'https://user:pass@host/db',
      pendingChanges: 0,
      conflicts: [],
    });

    // Run collector and export
    const bundle = supportDiagnosticsService.collectDiagnostics();
    expect(bundle).toBeDefined();

    // Verify ZERO mutations or network triggers
    expect(pouch.putDoc).not.toHaveBeenCalled();
    expect(pouch.deleteDoc).not.toHaveBeenCalled();
    expect(pouch.resolveConflict).not.toHaveBeenCalled();
    expect(pouch.syncNow).not.toHaveBeenCalled();
    expect(pouch.startSync).not.toHaveBeenCalled();
    expect(pouch.stopSync).not.toHaveBeenCalled();

    expect(db.saveInvoice).not.toHaveBeenCalled();
    expect(db.saveParty).not.toHaveBeenCalled();
    expect(db.saveItem).not.toHaveBeenCalled();
    expect(db.deleteInvoice).not.toHaveBeenCalled();
  });

  it('safely handles DB getter exceptions and produces safe zero counts without throwing', () => {
    vi.mocked(db.getInvoices).mockImplementation(() => {
      throw new Error('Database locked / corrupted table');
    });
    vi.mocked(pouch.getSyncState).mockImplementation(() => {
      throw new Error('Pouch instance destroyed');
    });

    let bundle!: ReturnType<typeof collectSupportDiagnostics>;
    expect(() => {
      bundle = collectSupportDiagnostics();
    }).not.toThrow();

    expect(bundle.recordCounts.invoices).toBe(0);
    expect(bundle.sync.status).toBe('offline');
  });

  it('triggers download helper using safe filename and defers revoking object URL', async () => {
    vi.useFakeTimers();
    delete (window as any).AndroidBridge;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;

    const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost/test-diag-blob');
    const mockRevokeObjectURL = vi.fn();
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    try {
      const bundle = supportDiagnosticsService.collectDiagnostics();
      const resPromise = supportDiagnosticsService.downloadDiagnostics(bundle);
      const res = await resPromise;

      expect(res.success).toBe(true);
      expect(res.native).toBe(false);
      expect(res.filename).toMatch(/^support-diagnostics-[\w-]+\.json$/);
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      // Revoke is deferred to prevent premature cancellation on WebViews/Safari
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();

      // After 1000ms timer fires, URL is revoked
      vi.advanceTimersByTime(1000);
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      vi.useRealTimers();
    }
  });

  it('invokes AndroidBridge.downloadBackup and resolves on native SUCCESS result', async () => {
    const mockDownloadBackup = vi.fn();
    (window as any).AndroidBridge = { downloadBackup: mockDownloadBackup };

    try {
      const bundle = supportDiagnosticsService.collectDiagnostics();
      const downloadPromise = supportDiagnosticsService.downloadDiagnostics(bundle);

      expect(mockDownloadBackup).toHaveBeenCalledTimes(1);
      const [calledFilename, calledContent] = mockDownloadBackup.mock.calls[0];
      expect(calledFilename).toMatch(/^support-diagnostics-[\w-]+\.json$/);
      expect(JSON.parse(calledContent).schemaVersion).toBe('1.0.0');

      // Native result arrives
      (window as any).onBackupSaveResult('SUCCESS', 'support-diagnostics-saved.json', 'Saved to Download/GSTBilling');

      const result = await downloadPromise;
      expect(result.success).toBe(true);
      expect(result.native).toBe(true);
      expect(result.filename).toBe('support-diagnostics-saved.json');
      expect((window as any).onBackupSaveResult).toBeUndefined();
    } finally {
      delete (window as any).AndroidBridge;
      delete (window as any).onBackupSaveResult;
    }
  });

  it('handles Android native export CANCELLED result cleanly', async () => {
    const mockSavePicker = vi.fn();
    (window as any).AndroidBridge = { saveBackupWithPicker: mockSavePicker };

    try {
      const bundle = supportDiagnosticsService.collectDiagnostics();
      const downloadPromise = supportDiagnosticsService.downloadDiagnostics(bundle);

      expect(mockSavePicker).toHaveBeenCalledTimes(1);

      // User cancelled SAF picker
      (window as any).onBackupSaveResult('CANCELLED', '', 'User cancelled file selection');

      const result = await downloadPromise;
      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.native).toBe(true);
      expect(result.message).toBe('User cancelled file selection');
      expect((window as any).onBackupSaveResult).toBeUndefined();
    } finally {
      delete (window as any).AndroidBridge;
      delete (window as any).onBackupSaveResult;
    }
  });

  it('resolves with timeout failure when Android bridge does not respond within timeout', async () => {
    vi.useFakeTimers();
    const mockDownload = vi.fn();
    (window as any).AndroidBridge = { downloadBackup: mockDownload };

    try {
      const bundle = supportDiagnosticsService.collectDiagnostics();
      const downloadPromise = supportDiagnosticsService.downloadDiagnostics(bundle, 500);

      expect(mockDownload).toHaveBeenCalledTimes(1);

      // Fast forward past timeout
      vi.advanceTimersByTime(550);

      const result = await downloadPromise;
      expect(result.success).toBe(false);
      expect(result.native).toBe(true);
      expect(result.message).toContain('Timed out waiting for Android');
      expect((window as any).onBackupSaveResult).toBeUndefined();
    } finally {
      delete (window as any).AndroidBridge;
      delete (window as any).onBackupSaveResult;
      vi.useRealTimers();
    }
  });

  it('preserves a newer window.onBackupSaveResult installed by another feature when diagnostics times out', async () => {
    vi.useFakeTimers();
    const mockDownload = vi.fn();
    (window as any).AndroidBridge = { downloadBackup: mockDownload };

    try {
      const bundle = supportDiagnosticsService.collectDiagnostics();
      // 1. Start an Android diagnostics export with a short timeout
      const downloadPromise = supportDiagnosticsService.downloadDiagnostics(bundle, 300);

      expect(mockDownload).toHaveBeenCalledTimes(1);

      // 2. Replace window.onBackupSaveResult with a newer spy callback (e.g. from DatabaseBackupModal)
      const newerSpyCallback = vi.fn();
      (window as any).onBackupSaveResult = newerSpyCallback;

      // 3. Advance past the diagnostics timeout
      vi.advanceTimersByTime(350);

      // 4. Await the diagnostics result (timeout failure)
      const result = await downloadPromise;
      expect(result.success).toBe(false);
      expect(result.message).toContain('Timed out waiting for Android');

      // 5. Assert window.onBackupSaveResult is still the newer spy callback, not undefined
      expect((window as any).onBackupSaveResult).toBe(newerSpyCallback);
    } finally {
      delete (window as any).AndroidBridge;
      delete (window as any).onBackupSaveResult;
      vi.useRealTimers();
    }
  });
});
