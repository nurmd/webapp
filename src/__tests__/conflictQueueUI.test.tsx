import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataSyncTab } from '../components/Settings/tabs/DataSyncTab.tsx';
import { SyncConflict, PouchSyncState } from '../services/pouchdb.ts';

describe('Sync Conflict Queue UI Component', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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
  });

  const defaultSyncState: PouchSyncState = {
    status: 'synced',
    remoteUrl: 'https://couchdb.example.com/store',
    pendingChanges: 0,
    conflicts: [],
    conflictsCount: 0,
  };

  const mockConflict: SyncConflict = {
    id: 'invoice:INV-2026-0042#2-branch-b',
    docId: 'invoice:INV-2026-0042',
    docType: 'invoice',
    entityId: 'INV-2026-0042',
    winningRev: '2-branch-a',
    conflictingRev: '2-branch-b',
    winningDoc: { id: 'INV-2026-0042', totalAmount: 12000, updatedAt: '2026-10-21T10:00:00Z' },
    conflictingDoc: { id: 'INV-2026-0042', totalAmount: 13500, updatedAt: '2026-10-21T10:05:00Z' },
    detectedAt: '2026-10-21T10:06:00Z',
  };

  it('renders clean conflict badge when no conflicts are present', async () => {
    await act(async () => {
      root!.render(
        <DataSyncTab
          isSyncingProfile={false}
          lastProfileSyncTime="Just now"
          handleSyncAllSettingsAcrossDevices={vi.fn()}
          profileSyncNotice={null}
          setIsPairQrModalOpen={vi.fn()}
          setIsImportProfileModalOpen={vi.fn()}
          syncState={defaultSyncState}
          handleSyncNow={vi.fn()}
          isSyncStarting={false}
          isSyncConfigOpen={false}
          setIsSyncConfigOpen={vi.fn()}
          syncUrlInput=""
          setSyncUrlInput={vi.fn()}
          handleConnectSync={vi.fn()}
          handleStopSync={vi.fn()}
          conflicts={[]}
        />
      );
    });

    const badge = container!.querySelector('[data-testid="conflict-queue-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('0 Conflicts • Verified Clean');
    expect(container!.textContent).toContain('No revision conflicts detected');
  });

  it('renders conflict details and action buttons when conflicts exist', async () => {
    const handleResolve = vi.fn();

    await act(async () => {
      root!.render(
        <DataSyncTab
          isSyncingProfile={false}
          lastProfileSyncTime="Just now"
          handleSyncAllSettingsAcrossDevices={vi.fn()}
          profileSyncNotice={null}
          setIsPairQrModalOpen={vi.fn()}
          setIsImportProfileModalOpen={vi.fn()}
          syncState={{
            ...defaultSyncState,
            conflicts: [mockConflict],
            conflictsCount: 1,
          }}
          handleSyncNow={vi.fn()}
          isSyncStarting={false}
          isSyncConfigOpen={false}
          setIsSyncConfigOpen={vi.fn()}
          syncUrlInput=""
          setSyncUrlInput={vi.fn()}
          handleConnectSync={vi.fn()}
          handleStopSync={vi.fn()}
          conflicts={[mockConflict]}
          handleResolveConflict={handleResolve}
        />
      );
    });

    const badge = container!.querySelector('[data-testid="conflict-queue-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('1 Unresolved Conflict');

    expect(container!.textContent).toContain('INV-2026-0042');
    expect(container!.textContent).toContain('Version A (Winning / Local)');
    expect(container!.textContent).toContain('Version B (Conflicting / Remote)');

    const keepBtnA = container!.querySelector('[data-testid="resolve-winning-invoice:INV-2026-0042"]') as HTMLButtonElement;
    expect(keepBtnA).not.toBeNull();
    await act(async () => {
      keepBtnA.click();
    });
    expect(handleResolve).toHaveBeenCalledWith('invoice:INV-2026-0042#2-branch-b', 'keep_winning');

    const keepBtnB = container!.querySelector('[data-testid="resolve-conflicting-invoice:INV-2026-0042"]') as HTMLButtonElement;
    expect(keepBtnB).not.toBeNull();
    await act(async () => {
      keepBtnB.click();
    });
    expect(handleResolve).toHaveBeenCalledWith('invoice:INV-2026-0042#2-branch-b', 'keep_conflicting');
  });
});
