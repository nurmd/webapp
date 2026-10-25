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

  it('toggle reveals and hides details', async () => {
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
        />
      );
    });

    const toggleBtn = container!.querySelector(
      `[data-testid="conflict-details-toggle-${mockConflict.id}"]`
    ) as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(toggleBtn.textContent).toContain('View details');

    // Details panel is collapsed by default
    let detailsPanel = container!.querySelector(`[data-testid="conflict-details-${mockConflict.id}"]`);
    expect(detailsPanel).toBeNull();

    // Click to expand
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(toggleBtn.textContent).toContain('Hide details');
    detailsPanel = container!.querySelector(`[data-testid="conflict-details-${mockConflict.id}"]`);
    expect(detailsPanel).not.toBeNull();

    // Click to collapse
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(toggleBtn.textContent).toContain('View details');
    detailsPanel = container!.querySelector(`[data-testid="conflict-details-${mockConflict.id}"]`);
    expect(detailsPanel).toBeNull();
  });

  it('changed fields appear with both values; _id and unchanged fields do not appear as changed rows', async () => {
    const longTextWinner = 'X'.repeat(1400);
    const longTextConflicting = 'Y'.repeat(1400);

    const fieldDiffConflict: SyncConflict = {
      id: 'invoice:INV-DIFF#rev-2',
      docId: 'invoice:INV-DIFF',
      docType: 'invoice',
      entityId: 'INV-DIFF',
      winningRev: '1-rev-win-long-sha-1234567890',
      conflictingRev: '2-rev-conflict-long-sha-0987654321',
      winningDoc: {
        _id: 'invoice:INV-DIFF',
        _rev: '1-rev-win-long-sha-1234567890',
        _conflicts: ['2-rev-conflict-long-sha-0987654321'],
        id: 'INV-DIFF',
        partyName: 'Original Customer Pvt Ltd',
        totalAmount: 12000,
        notes: '',
        status: 'PAID',
        winnerOnlyField: 'present in winner',
        longRemark: longTextWinner,
      },
      conflictingDoc: {
        _id: 'invoice:INV-DIFF',
        _rev: '2-rev-conflict-long-sha-0987654321',
        id: 'INV-DIFF',
        partyName: 'Updated Customer Pvt Ltd',
        totalAmount: 14500,
        notes: 'Priority delivery',
        status: 'PAID',
        longRemark: longTextConflicting,
      },
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
            conflicts: [fieldDiffConflict],
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
          conflicts={[fieldDiffConflict]}
        />
      );
    });

    const toggleBtn = container!.querySelector(
      `[data-testid="conflict-details-toggle-${fieldDiffConflict.id}"]`
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn.click();
    });

    const detailsPanel = container!.querySelector(`[data-testid="conflict-details-${fieldDiffConflict.id}"]`);
    expect(detailsPanel).not.toBeNull();

    // Full doc ID, full winning rev, full conflicting rev, detected timestamp
    expect(detailsPanel!.textContent).toContain('invoice:INV-DIFF');
    expect(detailsPanel!.textContent).toContain('1-rev-win-long-sha-1234567890');
    expect(detailsPanel!.textContent).toContain('2-rev-conflict-long-sha-0987654321');

    // Changed fields: partyName, totalAmount, notes, winnerOnlyField, longRemark
    const partyNameRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${fieldDiffConflict.id}-partyName"]`
    );
    expect(partyNameRow).not.toBeNull();
    expect(partyNameRow!.textContent).toContain('Original Customer Pvt Ltd');
    expect(partyNameRow!.textContent).toContain('Updated Customer Pvt Ltd');

    const amountRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${fieldDiffConflict.id}-totalAmount"]`
    );
    expect(amountRow).not.toBeNull();
    expect(amountRow!.textContent).toContain('12000');
    expect(amountRow!.textContent).toContain('14500');

    const notesRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${fieldDiffConflict.id}-notes"]`
    );
    expect(notesRow).not.toBeNull();
    expect(notesRow!.textContent).toContain('(empty)');
    expect(notesRow!.textContent).toContain('Priority delivery');

    // Missing value shows 'Not present'
    const winnerOnlyRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${fieldDiffConflict.id}-winnerOnlyField"]`
    );
    expect(winnerOnlyRow).not.toBeNull();
    expect(winnerOnlyRow!.textContent).toContain('present in winner');
    expect(winnerOnlyRow!.textContent).toContain('Not present');

    // Long values are capped with truncation indicator
    const longRemarkRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${fieldDiffConflict.id}-longRemark"]`
    );
    expect(longRemarkRow).not.toBeNull();
    expect(longRemarkRow!.textContent).toContain('... [truncated]');

    // Revision metadata fields must be ignored and not present as changed rows
    expect(container!.querySelector(`[data-testid="conflict-detail-field-${fieldDiffConflict.id}-_id"]`)).toBeNull();
    expect(container!.querySelector(`[data-testid="conflict-detail-field-${fieldDiffConflict.id}-_rev"]`)).toBeNull();
    expect(container!.querySelector(`[data-testid="conflict-detail-field-${fieldDiffConflict.id}-_conflicts"]`)).toBeNull();

    // Unchanged fields must NOT appear as changed rows
    expect(container!.querySelector(`[data-testid="conflict-detail-field-${fieldDiffConflict.id}-id"]`)).toBeNull();
    expect(container!.querySelector(`[data-testid="conflict-detail-field-${fieldDiffConflict.id}-status"]`)).toBeNull();
  });

  it('sensitive value is redacted and the raw secret is absent from the DOM', async () => {
    const sensitiveConflict: SyncConflict = {
      id: 'settings:cloud-sync#rev-2',
      docId: 'settings:cloud-sync',
      docType: 'settings',
      entityId: 'cloud-sync',
      winningRev: '1-rev',
      conflictingRev: '2-rev',
      winningDoc: {
        id: 'cloud-sync',
        apiKey: 'super-secret-production-key-998877',
        password: 'rawPasswordWinner456!',
        syncRemoteUrl: 'https://admin:mypassword@couchdb.example.com',
        userCredential: {
          token: 'jwt-top-secret-token-112233',
          authorization: 'Bearer token-abcdef-secret',
        },
        publicSetting: 'Enabled',
      },
      conflictingDoc: {
        id: 'cloud-sync',
        apiKey: 'alternate-secret-staging-key-112233',
        password: 'rawPasswordConflicting789!',
        syncRemoteUrl: 'https://admin:otherpass@couchdb.example.com',
        userCredential: {
          token: 'jwt-top-secret-token-445566',
          authorization: 'Bearer token-fedcba-secret',
        },
        publicSetting: 'Disabled',
      },
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
            conflicts: [sensitiveConflict],
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
          conflicts={[sensitiveConflict]}
        />
      );
    });

    const toggleBtn = container!.querySelector(
      `[data-testid="conflict-details-toggle-${sensitiveConflict.id}"]`
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn.click();
    });

    const apiKeyRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${sensitiveConflict.id}-apiKey"]`
    );
    expect(apiKeyRow).not.toBeNull();
    expect(apiKeyRow!.textContent).toContain('[REDACTED]');

    const passwordRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${sensitiveConflict.id}-password"]`
    );
    expect(passwordRow).not.toBeNull();
    expect(passwordRow!.textContent).toContain('[REDACTED]');

    const syncUrlRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${sensitiveConflict.id}-syncRemoteUrl"]`
    );
    expect(syncUrlRow).not.toBeNull();
    expect(syncUrlRow!.textContent).toContain('[REDACTED]');

    const credRow = container!.querySelector(
      `[data-testid="conflict-detail-field-${sensitiveConflict.id}-userCredential"]`
    );
    expect(credRow).not.toBeNull();
    expect(credRow!.textContent).toContain('[REDACTED]');

    // Verify all raw secrets are strictly absent from the DOM
    const allDomText = container!.textContent || '';
    expect(allDomText).not.toContain('super-secret-production-key-998877');
    expect(allDomText).not.toContain('alternate-secret-staging-key-112233');
    expect(allDomText).not.toContain('rawPasswordWinner456!');
    expect(allDomText).not.toContain('rawPasswordConflicting789!');
    expect(allDomText).not.toContain('mypassword');
    expect(allDomText).not.toContain('otherpass');
    expect(allDomText).not.toContain('jwt-top-secret-token-112233');
    expect(allDomText).not.toContain('jwt-top-secret-token-445566');
    expect(allDomText).not.toContain('token-abcdef-secret');
    expect(allDomText).not.toContain('token-fedcba-secret');
  });

  it('unavailable revision bodies produce the unavailable warning', async () => {
    const unavailableConflict: SyncConflict = {
      id: 'voucher:VOUCH-UNAVAIL#rev-2',
      docId: 'voucher:VOUCH-UNAVAIL',
      docType: 'voucher',
      entityId: 'VOUCH-UNAVAIL',
      winningRev: '1-rev',
      conflictingRev: '2-rev',
      winningDoc: { _id: 'voucher:VOUCH-UNAVAIL', _unavailable: true },
      conflictingDoc: null,
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
            conflicts: [unavailableConflict],
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
          conflicts={[unavailableConflict]}
        />
      );
    });

    const toggleBtn = container!.querySelector(
      `[data-testid="conflict-details-toggle-${unavailableConflict.id}"]`
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn.click();
    });

    const unavailableBox = container!.querySelector(
      `[data-testid="conflict-details-unavailable-${unavailableConflict.id}"]`
    );
    expect(unavailableBox).not.toBeNull();
    expect(unavailableBox!.textContent).toMatch(/unavailable/i);

    // Must NOT show empty message
    const emptyBox = container!.querySelector(
      `[data-testid="conflict-details-empty-${unavailableConflict.id}"]`
    );
    expect(emptyBox).toBeNull();
  });

  it('identical bodies produce the no-difference message', async () => {
    const identicalConflict: SyncConflict = {
      id: 'item:ITEM-IDENTICAL#rev-2',
      docId: 'item:ITEM-IDENTICAL',
      docType: 'item',
      entityId: 'ITEM-IDENTICAL',
      winningRev: '1-rev-win',
      conflictingRev: '2-rev-conflict',
      winningDoc: {
        _id: 'item:ITEM-IDENTICAL',
        _rev: '1-rev-win',
        name: 'Basmati Rice 5kg',
        price: 450,
      },
      conflictingDoc: {
        _id: 'item:ITEM-IDENTICAL',
        _rev: '2-rev-conflict',
        name: 'Basmati Rice 5kg',
        price: 450,
      },
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
            conflicts: [identicalConflict],
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
          conflicts={[identicalConflict]}
        />
      );
    });

    const toggleBtn = container!.querySelector(
      `[data-testid="conflict-details-toggle-${identicalConflict.id}"]`
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn.click();
    });

    const emptyBox = container!.querySelector(
      `[data-testid="conflict-details-empty-${identicalConflict.id}"]`
    );
    expect(emptyBox).not.toBeNull();
    expect(emptyBox!.textContent).toContain('No field-level differences; branches differ only in revision metadata.');

    const unavailableBox = container!.querySelector(
      `[data-testid="conflict-details-unavailable-${identicalConflict.id}"]`
    );
    expect(unavailableBox).toBeNull();
  });
});
