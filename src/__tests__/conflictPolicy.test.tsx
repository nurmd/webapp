// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CONFLICT_POLICY,
  ConflictPolicyViolationError,
  assertManualConflictResolution,
} from '../services/conflictPolicy.ts';
import { pouch, SyncConflict, PouchSyncState } from '../services/pouchdb.ts';
import { DataSyncTab } from '../components/Settings/tabs/DataSyncTab.tsx';

describe('Conflict Resolution Policy', () => {
  describe('CONFLICT_POLICY', () => {
    it('pins the manual per-document policy with every automation flag disabled', () => {
      expect(CONFLICT_POLICY.mode).toBe('MANUAL_PER_DOCUMENT');
      expect(CONFLICT_POLICY.allowAutoResolve).toBe(false);
      expect(CONFLICT_POLICY.allowBulkResolve).toBe(false);
      expect(CONFLICT_POLICY.allowMerge).toBe(false);
      expect(CONFLICT_POLICY.allowDirectRemoteWrite).toBe(false);
    });
  });

  describe('assertManualConflictResolution', () => {
    it('accepts a single document id with each allowed choice', () => {
      expect(() =>
        assertManualConflictResolution('invoice:INV-1', 'keep_winning')
      ).not.toThrow();
      expect(() =>
        assertManualConflictResolution('invoice:INV-1#2-branch', 'keep_conflicting')
      ).not.toThrow();
    });

    it('blocks the merge choice', () => {
      expect(() => assertManualConflictResolution('invoice:INV-1', 'merge')).toThrow(
        ConflictPolicyViolationError
      );
      try {
        assertManualConflictResolution('invoice:INV-1', 'merge');
      } catch (err: any) {
        expect(err.code).toBe('MERGE_BLOCKED');
      }
    });

    it('blocks unsupported choices', () => {
      try {
        assertManualConflictResolution('invoice:INV-1', 'overwrite_all');
      } catch (err: any) {
        expect(err.code).toBe('UNSUPPORTED_CHOICE');
        return;
      }
      throw new Error('expected a policy violation');
    });

    it('blocks bulk identifiers', () => {
      for (const bulk of ['invoice:A,invoice:B', 'invoice:A;invoice:B', 'invoice:A\ninvoice:B']) {
        try {
          assertManualConflictResolution(bulk, 'keep_winning');
          throw new Error('expected a policy violation');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ConflictPolicyViolationError);
          expect(err.code).toBe('BULK_RESOLUTION_BLOCKED');
        }
      }
    });

    it('blocks empty and non-string identifiers', () => {
      for (const bad of ['', '   ', null, undefined, 42, ['invoice:A']]) {
        try {
          assertManualConflictResolution(bad as any, 'keep_winning');
          throw new Error('expected a policy violation');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ConflictPolicyViolationError);
          expect(err.code).toBe('INVALID_DOCUMENT_ID');
        }
      }
    });
  });

  describe('pouch.resolveConflict policy enforcement', () => {
    let putSpy: any;
    let removeSpy: any;
    const originalLocalDB = (pouch as any).localDB;

    beforeEach(() => {
      putSpy = vi.fn(async () => ({ ok: true }));
      removeSpy = vi.fn(async () => ({ ok: true }));
      (pouch as any).localDB = {
        get: vi.fn(async (id: string, opts?: any) => {
          if (opts?.rev) {
            return { _id: id, _rev: opts.rev, id: 'X', partyName: 'Remote Branch' };
          }
          return { _id: id, _rev: '1-local', id: 'X', partyName: 'Local Branch', _conflicts: ['2-remote'] };
        }),
        put: putSpy,
        remove: removeSpy,
      };
      vi.spyOn(pouch, 'refreshConflicts').mockResolvedValue([]);
      vi.spyOn(pouch as any, 'notifyDataChange').mockImplementation(() => {});
    });

    afterEach(() => {
      (pouch as any).localDB = originalLocalDB;
      vi.restoreAllMocks();
    });

    it('rejects a merge attempt without touching the local database', async () => {
      await expect(
        (pouch as any).resolveConflict('invoice:X', 'merge')
      ).rejects.toBeInstanceOf(ConflictPolicyViolationError);

      expect(putSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('rejects a bulk identifier without touching the local database', async () => {
      await expect(
        (pouch as any).resolveConflict('invoice:X,invoice:Y', 'keep_winning')
      ).rejects.toMatchObject({ code: 'BULK_RESOLUTION_BLOCKED' });

      expect(putSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('still promotes the conflicting revision for a single document', async () => {
      await pouch.resolveConflict('invoice:X', 'keep_conflicting');

      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith('invoice:X', '2-remote');
    });

    it('still discards the conflicting revision when keeping the winner', async () => {
      await pouch.resolveConflict('invoice:X', 'keep_winning');

      expect(putSpy).not.toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalledWith('invoice:X', '2-remote');
    });
  });

  describe('DataSyncTab policy notice', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    const defaultSyncState: PouchSyncState = {
      status: 'synced',
      remoteUrl: 'https://couchdb.example.com/store',
      pendingChanges: 0,
      conflicts: [],
      conflictsCount: 0,
    };

    const mockConflict: SyncConflict = {
      id: 'invoice:INV-1#2-branch-b',
      docId: 'invoice:INV-1',
      docType: 'invoice',
      entityId: 'INV-1',
      winningRev: '2-branch-a',
      conflictingRev: '2-branch-b',
      winningDoc: { id: 'INV-1', totalAmount: 100 },
      conflictingDoc: { id: 'INV-1', totalAmount: 200 },
      detectedAt: '2026-10-21T10:06:00Z',
    };

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

    it('renders the manual per-document policy note', async () => {
      await act(async () => {
        root!.render(
          <DataSyncTab
            isSyncingProfile={false}
            lastProfileSyncTime="Just now"
            handleSyncAllSettingsAcrossDevices={vi.fn()}
            profileSyncNotice={null}
            setIsPairQrModalOpen={vi.fn()}
            setIsImportProfileModalOpen={vi.fn()}
            syncState={{ ...defaultSyncState, conflicts: [mockConflict], conflictsCount: 1 }}
            handleSyncNow={vi.fn()}
            isSyncStarting={false}
            isSyncConfigOpen={false}
            setIsSyncConfigOpen={vi.fn()}
            syncUrlInput=""
            setSyncUrlInput={vi.fn()}
            handleConnectSync={vi.fn()}
            handleStopSync={vi.fn()}
            conflicts={[mockConflict]}
            handleResolveConflict={vi.fn()}
          />
        );
      });

      const note = container!.querySelector('[data-testid="conflict-policy-note"]');
      expect(note).not.toBeNull();
      expect(note!.textContent).toContain('Manual, one document at a time');
      expect(note!.textContent).toContain('Nothing is auto-resolved, merged, or bulk-resolved');
    });
  });
});
