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
    expect(container!.textContent).toContain('Version A (Winning Revision)');
    expect(container!.textContent).toContain('Version B (Conflicting Revision)');

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

  it('ensures primary status badge shows "Review Conflicts" (never "Cloud Synced") when unresolved conflicts exist', async () => {
    await act(async () => {
      root!.render(
        <DataSyncTab
          isSyncingProfile={false}
          lastProfileSyncTime=""
          handleSyncAllSettingsAcrossDevices={vi.fn()}
          profileSyncNotice={null}
          setIsPairQrModalOpen={vi.fn()}
          setIsImportProfileModalOpen={vi.fn()}
          syncState={{
            status: 'synced',
            remoteUrl: 'https://couchdb.example.com/store',
            pendingChanges: 0,
            lastSyncedAt: new Date().toISOString(),
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
          isRemoteDbActive={true}
          savedRemoteUrl="https://couchdb.example.com/store"
          conflicts={[mockConflict]}
        />
      );
    });

    const statusBadge = container!.querySelector('[data-testid="sync-status-badge"]');
    expect(statusBadge).not.toBeNull();
    expect(statusBadge!.getAttribute('data-sync-state')).toBe('conflict');
    expect(statusBadge!.textContent).toBe('Review Conflicts');

    const noticeBadge = container!.querySelector('[data-testid="sync-conflicts-notice-badge"]');
    expect(noticeBadge).not.toBeNull();
    expect(noticeBadge!.textContent).toBe('1 Conflict Revision (1 Document) • Review Required');

    expect(container!.textContent).toContain('1 conflict revision requires manual per-document review. Nothing will be auto-resolved.');
  });

  it('replaces missing or "N/A" updated timestamps with "Timestamp unavailable"', async () => {
    const noTimestampConflict: SyncConflict = {
      id: 'invoice:INV-MISSING-TIME#2-rev',
      docId: 'invoice:INV-MISSING-TIME',
      docType: 'invoice',
      entityId: 'INV-MISSING-TIME',
      winningRev: '1-rev',
      conflictingRev: '2-rev',
      winningDoc: { id: 'INV-MISSING-TIME', updatedAt: 'N/A' },
      conflictingDoc: { id: 'INV-MISSING-TIME' }, // completely missing timestamp
      detectedAt: '2026-10-21T10:06:00Z',
    };

    await act(async () => {
      root!.render(
        <DataSyncTab
          isSyncingProfile={false}
          lastProfileSyncTime=""
          handleSyncAllSettingsAcrossDevices={vi.fn()}
          profileSyncNotice={null}
          setIsPairQrModalOpen={vi.fn()}
          setIsImportProfileModalOpen={vi.fn()}
          syncState={{
            ...defaultSyncState,
            conflicts: [noTimestampConflict],
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
          conflicts={[noTimestampConflict]}
        />
      );
    });

    const conflictCard = container!.querySelector('[data-testid="conflict-item-invoice:INV-MISSING-TIME"]');
    expect(conflictCard).not.toBeNull();

    const timestampOccurrences = Array.from(conflictCard!.querySelectorAll('p')).filter((p) =>
      p.textContent?.includes('Updated: Timestamp unavailable')
    );
    expect(timestampOccurrences.length).toBe(2);
    expect(conflictCard!.textContent).not.toContain('Updated: N/A');
  });

  it('renders a human document label when available in addition to docType and entityId', async () => {
    const labeledConflict: SyncConflict = {
      id: 'party:PARTY-007#2-rev',
      docId: 'party:PARTY-007',
      docType: 'party',
      entityId: 'PARTY-007',
      winningRev: '1-rev',
      conflictingRev: '2-rev',
      winningDoc: { id: 'PARTY-007', partyName: 'Suresh Hardware & Electricals' },
      conflictingDoc: { id: 'PARTY-007', partyName: 'Suresh Hardware Store' },
      detectedAt: '2026-10-21T10:06:00Z',
    };

    await act(async () => {
      root!.render(
        <DataSyncTab
          isSyncingProfile={false}
          lastProfileSyncTime=""
          handleSyncAllSettingsAcrossDevices={vi.fn()}
          profileSyncNotice={null}
          setIsPairQrModalOpen={vi.fn()}
          setIsImportProfileModalOpen={vi.fn()}
          syncState={{
            ...defaultSyncState,
            conflicts: [labeledConflict],
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
          conflicts={[labeledConflict]}
        />
      );
    });

    const humanLabelEl = container!.querySelector('[data-testid="conflict-label-party:PARTY-007"]');
    expect(humanLabelEl).not.toBeNull();
    expect(humanLabelEl!.textContent).toContain('• Suresh Hardware & Electricals');
  });

  it('shows both revision count and unique affected document count when multiple revisions belong to the same document', async () => {
    const multiBranchConflicts: SyncConflict[] = [
      {
        id: 'party:PARTY-1#rev-2a',
        docId: 'party:PARTY-1',
        docType: 'party',
        entityId: 'PARTY-1',
        winningRev: 'rev-1',
        conflictingRev: 'rev-2a',
        winningDoc: { id: 'PARTY-1', partyName: 'Branch A' },
        conflictingDoc: { id: 'PARTY-1', partyName: 'Branch B' },
        detectedAt: '2026-10-21T10:06:00Z',
      },
      {
        id: 'party:PARTY-1#rev-2b',
        docId: 'party:PARTY-1',
        docType: 'party',
        entityId: 'PARTY-1',
        winningRev: 'rev-1',
        conflictingRev: 'rev-2b',
        winningDoc: { id: 'PARTY-1', partyName: 'Branch A' },
        conflictingDoc: { id: 'PARTY-1', partyName: 'Branch C' },
        detectedAt: '2026-10-21T10:06:00Z',
      },
      {
        id: 'invoice:INV-99#rev-2',
        docId: 'invoice:INV-99',
        docType: 'invoice',
        entityId: 'INV-99',
        winningRev: 'rev-1',
        conflictingRev: 'rev-2',
        winningDoc: { id: 'INV-99', invoiceNumber: 'INV/2026/099' },
        conflictingDoc: { id: 'INV-99', invoiceNumber: 'INV/2026/099-alt' },
        detectedAt: '2026-10-21T10:06:00Z',
      },
    ];

    await act(async () => {
      root!.render(
        <DataSyncTab
          isSyncingProfile={false}
          lastProfileSyncTime=""
          handleSyncAllSettingsAcrossDevices={vi.fn()}
          profileSyncNotice={null}
          setIsPairQrModalOpen={vi.fn()}
          setIsImportProfileModalOpen={vi.fn()}
          syncState={{
            ...defaultSyncState,
            conflicts: multiBranchConflicts,
            conflictsCount: 3,
          }}
          handleSyncNow={vi.fn()}
          isSyncStarting={false}
          isSyncConfigOpen={false}
          setIsSyncConfigOpen={vi.fn()}
          syncUrlInput=""
          setSyncUrlInput={vi.fn()}
          handleConnectSync={vi.fn()}
          handleStopSync={vi.fn()}
          isRemoteDbActive={true}
          savedRemoteUrl="https://couchdb.example.com/store"
          conflicts={multiBranchConflicts}
        />
      );
    });

    // 3 conflict branches across 2 unique documents (PARTY-1 and INV-99)
    const queueBadge = container!.querySelector('[data-testid="conflict-queue-badge"]');
    expect(queueBadge).not.toBeNull();
    expect(queueBadge!.textContent).toBe('3 Unresolved Conflicts (2 Documents)');

    const noticeBadge = container!.querySelector('[data-testid="sync-conflicts-notice-badge"]');
    expect(noticeBadge).not.toBeNull();
    expect(noticeBadge!.textContent).toBe('3 Conflict Revisions (2 Documents) • Review Required');
  });
});
