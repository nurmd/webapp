// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataSyncTab } from '../components/Settings/tabs/DataSyncTab.tsx';
import type { SyncConflict, PouchSyncState } from '../services/pouchdb.ts';
import type { SupportDiagnosticsBundle } from '../core/utils/supportDiagnostics.ts';

describe('Support Diagnostics UI & Release Gate Invariants', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let interceptedBlob: Blob | null = null;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    interceptedBlob = null;

    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn((blob: Blob) => {
      interceptedBlob = blob;
      return 'blob:http://localhost/mock-diagnostics-blob';
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  const credentialBearingSyncState: PouchSyncState = {
    status: 'synced',
    remoteUrl: 'https://operator_alpha:SuperSecretPass999@remote.vyapar.internal:5984/gupta_hardware_live?auth=token_secret',
    pendingChanges: 7,
    lastSyncedAt: '2026-10-25T06:00:00Z',
    conflicts: [],
    conflictsCount: 0,
  };

  const mockConflicts: SyncConflict[] = [
    {
      id: 'invoice:INV-2026-0042#rev-branch-a',
      docId: 'invoice:INV-2026-0042',
      docType: 'invoice',
      entityId: 'INV-2026-0042',
      winningRev: '2-branch-a',
      conflictingRev: '2-branch-b',
      winningDoc: {
        id: 'INV-2026-0042',
        grandTotal: 12500,
        customerName: 'Secret Commercial Enterprises',
        gstin: '07AAAAA0000A1Z5',
      },
      conflictingDoc: {
        id: 'INV-2026-0042',
        grandTotal: 12000,
        customerName: 'Secret Commercial Enterprises',
      },
      detectedAt: '2026-10-25T05:50:00Z',
    },
    {
      id: 'party:PTY-088#rev-branch-1',
      docId: 'party:PTY-088',
      docType: 'party',
      entityId: 'PTY-088',
      winningRev: '3-branch-1',
      conflictingRev: '3-branch-2',
      winningDoc: {
        id: 'PTY-088',
        name: 'Private VIP Supplier',
        gstin: '18ADHPL1415E1ZX',
      },
      conflictingDoc: {
        id: 'PTY-088',
        name: 'Private VIP Supplier',
      },
      detectedAt: '2026-10-25T05:55:00Z',
    },
  ];

  it('renders Support Diagnostics card with proper copy, button, and section test ids', async () => {
    await act(async () => {
      root!.render(
        <DataSyncTab
          isSyncingProfile={false}
          lastProfileSyncTime="Just now"
          handleSyncAllSettingsAcrossDevices={vi.fn()}
          profileSyncNotice={null}
          setIsPairQrModalOpen={vi.fn()}
          setIsImportProfileModalOpen={vi.fn()}
          syncState={credentialBearingSyncState}
          handleSyncNow={vi.fn()}
          isSyncStarting={false}
          isSyncConfigOpen={false}
          setIsSyncConfigOpen={vi.fn()}
          syncUrlInput=""
          setSyncUrlInput={vi.fn()}
          handleConnectSync={vi.fn()}
          handleStopSync={vi.fn()}
          conflicts={mockConflicts}
        />
      );
    });

    const section = container!.querySelector('[data-testid="support-diagnostics-section"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('Support Diagnostics');
    expect(section?.textContent).toContain('local-only');
    expect(section?.textContent).toContain('excludes credentials, document bodies, business identifiers, and local paths');
    expect(section?.textContent).toContain('never uploaded automatically');

    const downloadBtn = container!.querySelector('[data-testid="download-support-diagnostics"]');
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn?.textContent).toContain('Export Diagnostics');
  });

  it('exports diagnostics bundle reflecting displayed sync status & conflict queue, proving local-only release gate invariants', async () => {
    await act(async () => {
      root!.render(
        <DataSyncTab
          isSyncingProfile={false}
          lastProfileSyncTime="Just now"
          handleSyncAllSettingsAcrossDevices={vi.fn()}
          profileSyncNotice={null}
          setIsPairQrModalOpen={vi.fn()}
          setIsImportProfileModalOpen={vi.fn()}
          syncState={credentialBearingSyncState}
          handleSyncNow={vi.fn()}
          isSyncStarting={false}
          isSyncConfigOpen={false}
          setIsSyncConfigOpen={vi.fn()}
          syncUrlInput=""
          setSyncUrlInput={vi.fn()}
          handleConnectSync={vi.fn()}
          handleStopSync={vi.fn()}
          conflicts={mockConflicts}
        />
      );
    });

    const downloadBtn = container!.querySelector('[data-testid="download-support-diagnostics"]') as HTMLButtonElement;
    expect(downloadBtn).not.toBeNull();

    // Tap Export Diagnostics
    await act(async () => {
      downloadBtn.click();
    });

    // 1. Success status UI assertion
    const statusBox = container!.querySelector('[data-testid="support-diagnostics-status"]');
    expect(statusBox).not.toBeNull();
    expect(statusBox?.textContent).toContain('Diagnostics bundle saved: support-diagnostics-');
    expect(statusBox?.textContent).toContain('.json');

    // 2. Intercept and parse the JSON Blob
    expect(interceptedBlob).not.toBeNull();
    const rawText = await (interceptedBlob as Blob).text();
    const bundle = JSON.parse(rawText) as SupportDiagnosticsBundle;

    // =========================================================================
    // RELEASE GATE ASSERTIONS
    // =========================================================================

    // Gate Assertion 1: Conflict counts are present and match the displayed queue
    expect(bundle.sync.conflictSummary.revisions).toBe(mockConflicts.length);
    expect(bundle.sync.conflictSummary.uniqueDocuments).toBe(2);
    expect(bundle.sync.conflictSummary.byDocType).toEqual({
      invoice: 1,
      party: 1,
    });

    // Gate Assertion 2: Sync status / pending state is present and truthful
    expect(bundle.sync.status).toBe('synced');
    expect(bundle.sync.pendingChanges).toBe(7);
    expect(bundle.sync.lastSyncedTime).toBe('2026-10-25T06:00:00Z');

    // Gate Assertion 3: The diagnostics bundle is local-only and credential-free
    expect(bundle.privacyFlags.localOnly).toBe(true);
    expect(bundle.privacyFlags.noCredentials).toBe(true);
    expect(bundle.privacyFlags.noDocumentBodies).toBe(true);
    expect(bundle.privacyFlags.noBusinessIdentifiers).toBe(true);

    // Gate Assertion 4: Redaction of remote credentials, hostnames, and database names
    expect(bundle.sync.remoteHost).toMatch(/^host-[0-9a-f]{8}:5984$/);
    expect(bundle.sync.remoteDatabase).toMatch(/^db-[0-9a-f]{8}$/);
    expect(rawText).not.toContain('remote.vyapar.internal');
    expect(rawText).not.toContain('gupta_hardware_live');
    expect(rawText).not.toContain('operator_alpha');
    expect(rawText).not.toContain('SuperSecretPass999');
    expect(rawText).not.toContain('token_secret');
    expect(rawText).not.toContain('Secret Commercial Enterprises');
    expect(rawText).not.toContain('07AAAAA0000A1Z5');
    expect(rawText).not.toContain('Private VIP Supplier');
    expect(rawText).not.toContain('18ADHPL1415E1ZX');
    expect(rawText).not.toContain('rev-branch-a');
    expect(rawText).not.toContain('2-branch-b');
  });

  it('exports diagnostics through AndroidBridge and delays success message until native callback fires', async () => {
    const mockDownload = vi.fn();
    (window as any).AndroidBridge = { downloadBackup: mockDownload };

    try {
      await act(async () => {
        root!.render(
          <DataSyncTab
            isSyncingProfile={false}
            lastProfileSyncTime="Just now"
            handleSyncAllSettingsAcrossDevices={vi.fn()}
            profileSyncNotice={null}
            setIsPairQrModalOpen={vi.fn()}
            setIsImportProfileModalOpen={vi.fn()}
            syncState={credentialBearingSyncState}
            handleSyncNow={vi.fn()}
            isSyncStarting={false}
            isSyncConfigOpen={false}
            setIsSyncConfigOpen={vi.fn()}
            syncUrlInput=""
            setSyncUrlInput={vi.fn()}
            handleConnectSync={vi.fn()}
            handleStopSync={vi.fn()}
            conflicts={mockConflicts}
          />
        );
      });

      const downloadBtn = container!.querySelector('[data-testid="download-support-diagnostics"]') as HTMLButtonElement;
      expect(downloadBtn).not.toBeNull();

      // Click export
      act(() => {
        downloadBtn.click();
      });

      // Bridge was invoked immediately
      expect(mockDownload).toHaveBeenCalledTimes(1);

      // Status shows Preparing... and NOT saved yet
      let statusBox = container!.querySelector('[data-testid="support-diagnostics-status"]');
      expect(statusBox?.textContent).toContain('Preparing…');
      expect(statusBox?.textContent).not.toContain('saved');

      // Native result arrives
      await act(async () => {
        (window as any).onBackupSaveResult('SUCCESS', 'support-diagnostics-native-test.json', 'File saved');
      });

      // Now status box reflects saved file
      statusBox = container!.querySelector('[data-testid="support-diagnostics-status"]');
      expect(statusBox?.textContent).toContain('Diagnostics bundle saved: support-diagnostics-native-test.json');
    } finally {
      delete (window as any).AndroidBridge;
      delete (window as any).onBackupSaveResult;
    }
  });
});
