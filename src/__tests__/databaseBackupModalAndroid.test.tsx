import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

vi.mock('../services/pouchdb.ts', () => ({
  DEFAULT_COUCHDB_REMOTE_URL: '',
  pouch: {
    putDoc: vi.fn(async () => {}),
    putDocStrict: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    deleteDocStrict: vi.fn(async () => {}),
    getAllDocs: vi.fn(async () => []),
    getAllDocsWithMeta: vi.fn(async () => []),
    getDoc: vi.fn(async () => null),
    getAllTombstones: vi.fn(async () => []),
    getConflicts: vi.fn(async () => []),
    refreshConflicts: vi.fn(async () => []),
    resolveConflict: vi.fn(async () => {}),
    addExplicitConflict: vi.fn(),
    removeExplicitConflict: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0, conflictsCount: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    subscribeDataChange: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    sync: vi.fn(),
  },
  PouchSyncState: {},
}));

import { DatabaseBackupModal } from '../components/Settings/modals/DatabaseBackupModal.tsx';
import { db } from '../services/db.ts';

describe('DatabaseBackupModal Android Native Integration', () => {
  let container: HTMLDivElement;
  let root: Root;
  let mockDownloadBackup: any;
  let mockSaveBackupWithPicker: any;
  const originalFileReader = globalThis.FileReader;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockDownloadBackup = vi.fn();
    mockSaveBackupWithPicker = vi.fn();

    (window as any).AndroidBridge = {
      downloadBackup: mockDownloadBackup,
      saveBackupWithPicker: mockSaveBackupWithPicker,
    };

    // Deterministic mock FileReader for jsdom
    class MockFileReader {
      onload: ((event: any) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsText(file: any) {
        setTimeout(() => {
          if (this.onload) {
            const result = (file as any)._content || (typeof file === 'string' ? file : JSON.stringify(db.createDatabaseBackup()));
            this.onload({ target: { result } });
          }
        }, 0);
      }
    }
    (globalThis as any).FileReader = MockFileReader;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (window as any).AndroidBridge;
    delete (window as any).onBackupSaveResult;
    (globalThis as any).FileReader = originalFileReader;
    vi.restoreAllMocks();
  });

  it('renders without any storage permission banners or prompts on Android', async () => {
    await act(async () => {
      root.render(<DatabaseBackupModal isOpen={true} onClose={() => {}} />);
    });

    const text = container.textContent || '';
    expect(text).not.toContain('Storage Permission Required');
    expect(text).not.toContain('Device Storage Access Active');
    expect(text).not.toContain('Grant Permission');
    expect((window as any).AndroidBridge.hasStoragePermission).toBeUndefined();
    expect((window as any).AndroidBridge.requestStoragePermission).toBeUndefined();
  });

  it('invokes AndroidBridge.downloadBackup when Download Backup is clicked', async () => {
    await act(async () => {
      root.render(<DatabaseBackupModal isOpen={true} onClose={() => {}} />);
    });

    // Find the Download Backup button
    const buttons = Array.from(container.querySelectorAll('button'));
    const downloadBtn = buttons.find((b) => b.textContent?.includes('Download Backup'));
    expect(downloadBtn).toBeDefined();

    await act(async () => {
      downloadBtn?.click();
    });

    await vi.waitFor(() => {
      expect(mockDownloadBackup).toHaveBeenCalledTimes(1);
    }, { timeout: 1500 });

    const [calledFilename, calledJson] = mockDownloadBackup.mock.calls[0];
    expect(calledFilename).toMatch(/\.json$/);

    const parsed = JSON.parse(calledJson);
    expect(parsed.format).toBe('GST_BILLING_BACKUP');
    expect(parsed.checksum).toBeDefined();

    // Simulate native callback success
    await act(async () => {
      if (typeof (window as any).onBackupSaveResult === 'function') {
        (window as any).onBackupSaveResult('SUCCESS', calledFilename, '');
      }
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain(`Saved: ${calledFilename}`);
    }, { timeout: 1500 });
  });

  it('handles CANCELLED callback gracefully without showing an error banner', async () => {
    await act(async () => {
      root.render(<DatabaseBackupModal isOpen={true} onClose={() => {}} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const downloadBtn = buttons.find((b) => b.textContent?.includes('Download Backup'));

    await act(async () => {
      downloadBtn?.click();
    });

    await vi.waitFor(() => {
      expect(mockDownloadBackup).toHaveBeenCalledTimes(1);
    }, { timeout: 1500 });

    // Simulate user cancellation
    await act(async () => {
      if (typeof (window as any).onBackupSaveResult === 'function') {
        (window as any).onBackupSaveResult('CANCELLED', 'backup.json', 'Backup cancelled');
      }
    });

    await vi.waitFor(() => {
      const errorEl = container.querySelector('.bg-error\\/10');
      expect(errorEl).toBeNull();
    }, { timeout: 1500 });
  });

  it('invokes the hidden file input directly when Browse Backup File is clicked', async () => {
    await act(async () => {
      root.render(<DatabaseBackupModal isOpen={true} onClose={() => {}} />);
    });

    // Switch to Restore tab
    const tabs = Array.from(container.querySelectorAll('button'));
    const restoreTab = tabs.find((t) => t.textContent?.includes('Restore Database'));
    expect(restoreTab).toBeDefined();

    await act(async () => {
      restoreTab?.click();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeDefined();
    const clickSpy = vi.spyOn(fileInput, 'click');

    const browseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Browse Backup File')
    );
    expect(browseBtn).toBeDefined();

    await act(async () => {
      browseBtn?.click();
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Verified safety snapshot saved before restore');
  });

  it('creates a verified safety snapshot before executing restore and handles rollback UI', async () => {
    const restoreDbSpy = vi.spyOn(db, 'restoreDatabaseBackup').mockRejectedValueOnce(new Error('Simulated write error'));

    await act(async () => {
      root.render(<DatabaseBackupModal isOpen={true} onClose={() => {}} />);
    });

    // Switch to restore tab
    const tabs = Array.from(container.querySelectorAll('button'));
    const restoreTab = tabs.find((t) => t.textContent?.includes('Restore Database'));
    await act(async () => {
      restoreTab?.click();
    });

    // Create a mock backup bundle file
    const validBundle = db.createDatabaseBackup();
    const fileContent = JSON.stringify(validBundle);
    const file = new File([fileContent], 'test_backup.json', { type: 'application/json' });
    (file as any)._content = fileContent;

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: true,
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for file reader & mode selection to appear
    let restoreBtn: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      const buttons = Array.from(container.querySelectorAll('button'));
      restoreBtn = buttons.find((b) =>
        b.textContent?.includes('Restore Database') && b.textContent?.includes('Clean Overwrite')
      );
      expect(restoreBtn).toBeDefined();
    }, { timeout: 1500 });

    await act(async () => {
      restoreBtn?.click();
    });

    // Confirm restore
    let confirmBtn: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      const buttons = Array.from(container.querySelectorAll('button'));
      confirmBtn = buttons.find((b) => b.textContent?.includes('Proceed with Restore'));
      expect(confirmBtn).toBeDefined();
    }, { timeout: 1500 });

    await act(async () => {
      confirmBtn?.click();
    });

    // Verify database restore was called
    await vi.waitFor(() => {
      expect(restoreDbSpy).toHaveBeenCalledTimes(1);
    }, { timeout: 1500 });

    // Verify that a verified safety snapshot was written into storage before restore failed
    const storageKeys = Array.from((testStorage as any).store.keys()) as string[];
    const safetyKey = storageKeys.find((k) => k.startsWith('gst_pre_migration_backup_restore_'));
    expect(safetyKey).toBeDefined();

    // Error banner with Rollback button must be shown
    await vi.waitFor(() => {
      expect(container.textContent).toContain('Simulated write error');
      const rollbackBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Rollback to Snapshot')
      );
      expect(rollbackBtn).toBeDefined();
    }, { timeout: 1500 });
  });
});
