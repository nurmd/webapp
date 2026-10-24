import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import {
  DataSyncTab,
  formatLastSyncedTime,
  formatConflictTimestamp,
  getConflictHumanLabel,
  deriveSyncStatus,
} from '../components/Settings/tabs/DataSyncTab.tsx';
import { PouchSyncState, SyncConflict, pouch, PouchService } from '../services/pouchdb.ts';
import { POUCH_PERSIST_KEYS } from '../services/db/localDbConstants.ts';

describe('Truthful Data & Sync Status Suite', () => {
  describe('formatLastSyncedTime unit tests', () => {
    it('returns "Never" for blank, undefined, null, or whitespace timestamps', () => {
      expect(formatLastSyncedTime(undefined)).toBe('Never');
      expect(formatLastSyncedTime(null)).toBe('Never');
      expect(formatLastSyncedTime('')).toBe('Never');
      expect(formatLastSyncedTime('   ')).toBe('Never');
    });

    it('formats an ISO timestamp for today into "Today at HH:MM:SS"', () => {
      const now = new Date();
      const iso = now.toISOString();
      const formatted = formatLastSyncedTime(iso);
      expect(formatted).toContain('Today at');
    });

    it('formats an older ISO timestamp with full date and time', () => {
      const pastDate = new Date('2026-10-20T10:30:00Z');
      const formatted = formatLastSyncedTime(pastDate.toISOString());
      expect(formatted).not.toContain('Today at');
      expect(formatted).toContain('2026');
    });

    it('preserves already human-formatted time strings like "10:30:15 AM"', () => {
      expect(formatLastSyncedTime('10:30:15 AM')).toBe('10:30:15 AM');
      expect(formatLastSyncedTime('Just now')).toBe('Just now');
    });
  });

  describe('formatConflictTimestamp unit tests', () => {
    it('returns "Timestamp unavailable" for null, undefined, blank or whitespace', () => {
      expect(formatConflictTimestamp(undefined)).toBe('Timestamp unavailable');
      expect(formatConflictTimestamp(null)).toBe('Timestamp unavailable');
      expect(formatConflictTimestamp('')).toBe('Timestamp unavailable');
      expect(formatConflictTimestamp('   ')).toBe('Timestamp unavailable');
    });

    it('returns "Timestamp unavailable" for "N/A" (case-insensitive) or invalid dates', () => {
      expect(formatConflictTimestamp('N/A')).toBe('Timestamp unavailable');
      expect(formatConflictTimestamp('n/a')).toBe('Timestamp unavailable');
      expect(formatConflictTimestamp('invalid-date')).toBe('Timestamp unavailable');
    });

    it('formats a valid timestamp correctly via formatLastSyncedTime', () => {
      const now = new Date();
      const formatted = formatConflictTimestamp(now.toISOString());
      expect(formatted).toContain('Today at');
    });
  });

  describe('getConflictHumanLabel unit tests', () => {
    it('returns businessName when present on winningDoc', () => {
      const conflict: SyncConflict = {
        id: 'company:c1#rev2',
        docId: 'company:c1',
        docType: 'company',
        entityId: 'c1',
        winningRev: 'rev1',
        conflictingRev: 'rev2',
        winningDoc: { id: 'c1', businessName: 'Sharma Supermarket' },
        conflictingDoc: null,
        detectedAt: '2026-10-24T05:00:00Z',
      };
      expect(getConflictHumanLabel(conflict)).toBe('Sharma Supermarket');
    });

    it('returns partyName, invoiceNumber, or name in priority order', () => {
      const invoiceConflict: SyncConflict = {
        id: 'invoice:inv1#rev2',
        docId: 'invoice:inv1',
        docType: 'invoice',
        entityId: 'inv1',
        winningRev: 'rev1',
        conflictingRev: 'rev2',
        winningDoc: null,
        conflictingDoc: { id: 'inv1', invoiceNumber: 'INV/2026/042' },
        detectedAt: '2026-10-24T05:00:00Z',
      };
      expect(getConflictHumanLabel(invoiceConflict)).toBe('INV/2026/042');

      const partyConflict: SyncConflict = {
        id: 'party:p1#rev2',
        docId: 'party:p1',
        docType: 'party',
        entityId: 'p1',
        winningRev: 'rev1',
        conflictingRev: 'rev2',
        winningDoc: { id: 'p1', partyName: 'Gupta Enterprises' },
        conflictingDoc: null,
        detectedAt: '2026-10-24T05:00:00Z',
      };
      expect(getConflictHumanLabel(partyConflict)).toBe('Gupta Enterprises');
    });

    it('returns null if no descriptive attributes exist', () => {
      const bareConflict: SyncConflict = {
        id: 'doc:1#rev2',
        docId: 'doc:1',
        docType: 'doc',
        entityId: '1',
        winningRev: 'rev1',
        conflictingRev: 'rev2',
        winningDoc: { id: '1', someOtherField: 123 },
        conflictingDoc: null,
        detectedAt: '2026-10-24T05:00:00Z',
      };
      expect(getConflictHumanLabel(bareConflict)).toBeNull();
    });
  });

  describe('deriveSyncStatus state machine tests', () => {
    const getRecentTimestamp = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const getStaleTimestamp = () => new Date(Date.now() - 35 * 60 * 1000).toISOString();

    const getBaseSyncState = (): PouchSyncState => ({
      status: 'synced',
      remoteUrl: 'https://couchdb.example.com/live_db',
      pendingChanges: 0,
      conflicts: [],
      conflictsCount: 0,
      lastSyncedAt: getRecentTimestamp(),
    });

    it('derives "offline" when network is offline regardless of PouchDB status', () => {
      const result = deriveSyncStatus({
        syncState: getBaseSyncState(),
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: false,
      });

      expect(result.state).toBe('offline');
      expect(result.badgeLabel).toBe('Offline');
      expect(result.iconName).toBe('cloud_off');
      expect(result.description).toContain('Device is offline');
    });

    it('ensures offline wins over a stale error string', () => {
      const result = deriveSyncStatus({
        syncState: {
          ...getBaseSyncState(),
          status: 'error',
          error: '504 Gateway Timeout: Server unreachable',
        },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: false, // Network is offline
      });

      expect(result.state).toBe('offline');
      expect(result.badgeLabel).toBe('Offline');
      expect(result.description).toContain('Device is offline');
    });

    it('derives "online" when cloud DB is active, device is online, status is synced, and lastSyncedAt is recent', () => {
      const result = deriveSyncStatus({
        syncState: getBaseSyncState(),
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });

      expect(result.state).toBe('online');
      expect(result.badgeLabel).toBe('Cloud Synced');
      expect(result.iconName).toBe('cloud_done');
      expect(result.description).toContain('Continuous 2-Way CouchDB Multi-Device Sync Active');
    });

    it('derives "pending" with "Sync Pending" badge when pendingChanges > 0', () => {
      const result = deriveSyncStatus({
        syncState: {
          ...getBaseSyncState(),
          pendingChanges: 3,
        },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });

      expect(result.state).toBe('pending');
      expect(result.badgeLabel).toBe('Sync Pending');
      expect(result.badgeColorClass).toContain('bg-amber-500');
      expect(result.iconName).toBe('cloud_upload');
      expect(result.description).toContain('3 local changes pending upload');
    });

    it('derives "paused" with "Sync Unverified" when lastSyncedAt is missing', () => {
      const result = deriveSyncStatus({
        syncState: {
          ...getBaseSyncState(),
          lastSyncedAt: undefined,
        },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });

      expect(result.state).toBe('paused');
      expect(result.badgeLabel).toBe('Sync Unverified');
      expect(result.badgeColorClass).toContain('bg-amber-500');
      expect(result.description).toContain('No successful cloud sync has been recorded yet');
    });

    it('derives "paused" with "Check Sync" in amber when lastSyncedAt is older than 30 minutes', () => {
      const staleTime = getStaleTimestamp();
      const result = deriveSyncStatus({
        syncState: {
          ...getBaseSyncState(),
          lastSyncedAt: staleTime,
        },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });

      expect(result.state).toBe('paused');
      expect(result.badgeLabel).toBe('Check Sync');
      expect(result.badgeColorClass).toContain('bg-amber-500');
      expect(result.description).toContain('Tap "Sync Now" to confirm cloud status');
    });

    it('derives "syncing" when isSyncStarting is true or status is syncing/connecting', () => {
      const resultStarting = deriveSyncStatus({
        syncState: getBaseSyncState(),
        isSyncStarting: true,
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });
      expect(resultStarting.state).toBe('syncing');
      expect(resultStarting.badgeLabel).toBe('Syncing...');
      expect(resultStarting.isSpinning).toBe(true);

      const resultSyncing = deriveSyncStatus({
        syncState: { ...getBaseSyncState(), status: 'syncing' },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });
      expect(resultSyncing.state).toBe('syncing');
      expect(resultSyncing.badgeLabel).toBe('Syncing...');

      const resultConnecting = deriveSyncStatus({
        syncState: { ...getBaseSyncState(), status: 'connecting' },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });
      expect(resultConnecting.state).toBe('syncing');
      expect(resultConnecting.badgeLabel).toBe('Connecting...');
    });

    it('derives "error" when status is error or error string is present while online', () => {
      const result = deriveSyncStatus({
        syncState: {
          ...getBaseSyncState(),
          status: 'error',
          error: 'Push permission denied (403): Read only',
        },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });

      expect(result.state).toBe('error');
      expect(result.badgeLabel).toBe('Sync Error');
      expect(result.iconName).toBe('cloud_off');
      expect(result.description).toBe('Push permission denied (403): Read only');
    });

    it('derives "paused" when cloud database is active and online but status is offline/idle', () => {
      const result = deriveSyncStatus({
        syncState: { ...getBaseSyncState(), status: 'offline' },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });

      expect(result.state).toBe('paused');
      expect(result.badgeLabel).toBe('Cloud Paused');
      expect(result.iconName).toBe('pause_circle');
      expect(result.description).toContain('Sync paused / idle');
    });

    it('derives "offline" for offline primary database', () => {
      const result = deriveSyncStatus({
        syncState: { ...getBaseSyncState(), status: 'offline', remoteUrl: '' },
        isRemoteDbActive: false,
        hasSavedUrl: false,
        isOnline: true,
      });

      expect(result.state).toBe('offline');
      expect(result.badgeLabel).toBe('Offline Primary');
      expect(result.description).toContain('100% Offline-First');
    });

    it('derives "paused" for Demo Sandbox mode', () => {
      const result = deriveSyncStatus({
        syncState: getBaseSyncState(),
        isDemoMode: true,
        activeDbName: 'vyapar_demo',
      });

      expect(result.state).toBe('paused');
      expect(result.badgeLabel).toContain('Demo Sandbox');
      expect(result.description).toContain('Changes are isolated to vyapar_demo');
    });

    it('correctly reports pending changes and conflict counts, overriding "Cloud Synced"', () => {
      const result = deriveSyncStatus({
        syncState: {
          ...getBaseSyncState(),
          pendingChanges: 5,
          conflictsCount: 48,
        },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });

      expect(result.pendingChanges).toBe(5);
      expect(result.conflictsCount).toBe(48);
      expect(result.state).toBe('conflict');
      expect(result.badgeLabel).toBe('Review Conflicts');
      expect(result.badgeColorClass).toContain('bg-rose-500');
      expect(result.description).toContain('48 conflict revisions require manual per-document review. Nothing will be auto-resolved.');
    });

    it('ensures unresolved conflicts override "Cloud Synced" even with clean status and recent timestamp', () => {
      const result = deriveSyncStatus({
        syncState: {
          ...getBaseSyncState(),
          status: 'synced',
          pendingChanges: 0,
          conflictsCount: 2,
        },
        isRemoteDbActive: true,
        hasSavedUrl: true,
        isOnline: true,
      });

      expect(result.state).toBe('conflict');
      expect(result.badgeLabel).toBe('Review Conflicts');
      expect(result.badgeColorClass).toContain('bg-rose-500');
      expect(result.iconName).toBe('warning');
      expect(result.description).toContain('2 conflict revisions require manual per-document review');
      expect(result.description).toContain('Nothing will be auto-resolved');
    });
  });

  describe('PouchService per-database timestamp isolation & persistence guarantees', () => {
    beforeEach(() => {
      testStorage.clear();
    });

    it('persists lastSyncedAt timestamp strictly under per-DB key', () => {
      const testTimestamp = '2026-10-24T05:10:00.000Z';
      const activeDb = pouch.getActiveDbName();
      const perDbKey = `${POUCH_PERSIST_KEYS.LAST_SYNCED_AT}_${activeDb}`;

      (pouch as any).notifySyncState({ lastSyncedAt: testTimestamp });

      // Verifies state and getter
      expect(pouch.getSyncState().lastSyncedAt).toBe(testTimestamp);
      expect((pouch as any).getPersistedLastSyncedAt()).toBe(testTimestamp);

      // Verifies storage wrote strictly to perDbKey
      expect(testStorage.getItem(perDbKey)).toBe(testTimestamp);

      // Verifies global key was NEVER written
      expect(testStorage.getItem(POUCH_PERSIST_KEYS.LAST_SYNCED_AT)).toBeNull();
    });

    it('restores persisted timestamp on a new PouchService instantiation using per-DB key', () => {
      const testTimestamp = '2026-10-24T04:30:00.000Z';
      const activeDb = pouch.getActiveDbName();
      const perDbKey = `${POUCH_PERSIST_KEYS.LAST_SYNCED_AT}_${activeDb}`;

      testStorage.setItem(perDbKey, testTimestamp);

      const freshInstance = new PouchService();
      expect(freshInstance.getSyncState().lastSyncedAt).toBe(testTimestamp);
      expect(freshInstance.getPersistedLastSyncedAt()).toBe(testTimestamp);
    });

    it('does not rehydrate from legacy global LAST_SYNCED_AT key', () => {
      testStorage.setItem(POUCH_PERSIST_KEYS.LAST_SYNCED_AT, '2026-10-24T01:00:00.000Z');

      const freshInstance = new PouchService();
      expect(freshInstance.getSyncState().lastSyncedAt).toBeUndefined();
      expect(freshInstance.getPersistedLastSyncedAt()).toBeUndefined();
    });

    it('isolates timestamps across different database names', () => {
      const db1Key = `${POUCH_PERSIST_KEYS.LAST_SYNCED_AT}_vyapar_store_1`;
      const db2Key = `${POUCH_PERSIST_KEYS.LAST_SYNCED_AT}_vyapar_store_2`;

      testStorage.setItem(db1Key, '2026-10-24T06:00:00.000Z');

      expect((pouch as any).getPersistedLastSyncedAt('vyapar_store_1')).toBe('2026-10-24T06:00:00.000Z');
      expect((pouch as any).getPersistedLastSyncedAt('vyapar_store_2')).toBeUndefined();
    });
  });

  describe('PouchService pending change accounting', () => {
    it('increments pendingChanges unconditionally on putDoc and deleteDoc', async () => {
      const startPending = pouch.getSyncState().pendingChanges || 0;

      await pouch.putDoc('item', { id: `item-test-${Date.now()}`, name: 'Test Item' });
      expect(pouch.getSyncState().pendingChanges).toBe(startPending + 1);

      await pouch.deleteDoc('item', `item-test-${Date.now()}`);
      expect(pouch.getSyncState().pendingChanges).toBe(startPending + 2);
    });

    it('resets pendingChanges to 0 when live sync pauses cleanly', () => {
      (pouch as any).notifySyncState({ pendingChanges: 10 });
      expect(pouch.getSyncState().pendingChanges).toBe(10);

      // Simulates live sync paused event (replication caught up)
      (pouch as any).notifySyncState({
        status: 'synced',
        error: undefined,
        pendingChanges: 0,
        lastSyncedAt: new Date().toISOString(),
      });

      expect(pouch.getSyncState().pendingChanges).toBe(0);
      expect(pouch.getSyncState().status).toBe('synced');
    });
  });

  describe('DataSyncTab UI component rendering', () => {
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
      lastSyncedAt: new Date().toISOString(),
    };

    it('renders "Last Synced: Never" and truthful "Settings last synced: Never" without pairing claim', async () => {
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
              lastSyncedAt: undefined,
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
          />
        );
      });

      const couchLastSyncEl = container!.querySelector('[data-testid="last-couchdb-sync-time"]');
      expect(couchLastSyncEl).not.toBeNull();
      expect(couchLastSyncEl!.textContent).toBe('Last Synced: Never');

      const settingsLastSyncEl = container!.querySelector('[data-testid="last-settings-sync-time"]');
      expect(settingsLastSyncEl).not.toBeNull();
      expect(settingsLastSyncEl!.textContent).toBe('Settings last synced: Never');
      expect(settingsLastSyncEl!.textContent).not.toContain('All counter devices paired');
    });

    it('renders formatted real CouchDB lastSyncedAt timestamp when provided', async () => {
      const now = new Date();
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
              lastSyncedAt: now.toISOString(),
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
          />
        );
      });

      const couchLastSyncEl = container!.querySelector('[data-testid="last-couchdb-sync-time"]');
      expect(couchLastSyncEl).not.toBeNull();
      expect(couchLastSyncEl!.textContent).toContain('Today at');
    });

    it('renders distinct state badge with data-sync-state attribute', async () => {
      // 1. Offline state
      await act(async () => {
        root!.render(
          <DataSyncTab
            isSyncingProfile={false}
            lastProfileSyncTime=""
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
            isRemoteDbActive={true}
            savedRemoteUrl="https://couchdb.example.com/store"
            isOnline={false}
          />
        );
      });

      const badge = container!.querySelector('[data-testid="sync-status-badge"]');
      expect(badge).not.toBeNull();
      expect(badge!.getAttribute('data-sync-state')).toBe('offline');
      expect(badge!.textContent).toBe('Offline');
    });

    it('displays pending changes indicator when pendingChanges > 0', async () => {
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
              pendingChanges: 7,
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
          />
        );
      });

      const pendingBadge = container!.querySelector('[data-testid="sync-pending-badge"]');
      expect(pendingBadge).not.toBeNull();
      expect(pendingBadge!.textContent).toContain('7 Pending');

      const pendingText = container!.querySelector('[data-testid="sync-pending-changes"]');
      expect(pendingText).not.toBeNull();
      expect(pendingText!.textContent).toContain('7 local changes pending');
    });

    it('renders real unresolved conflict count and review required notice without auto-resolving', async () => {
      const mockConflicts: SyncConflict[] = Array.from({ length: 48 }, (_, i) => ({
        id: `invoice:INV-${i}#2-rev`,
        docId: `invoice:INV-${i}`,
        docType: 'invoice',
        entityId: `INV-${i}`,
        winningRev: '1-rev',
        conflictingRev: '2-rev',
        winningDoc: { id: `INV-${i}`, total: 100 },
        conflictingDoc: { id: `INV-${i}`, total: 200 },
        detectedAt: '2026-10-24T05:00:00Z',
      }));

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
              conflicts: mockConflicts,
              conflictsCount: 48,
            }}
            conflicts={mockConflicts}
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
          />
        );
      });

      // Primary badge MUST be 'Review Conflicts' (not 'Cloud Synced') when unresolved conflicts exist
      const syncStatusBadge = container!.querySelector('[data-testid="sync-status-badge"]');
      expect(syncStatusBadge).not.toBeNull();
      expect(syncStatusBadge!.getAttribute('data-sync-state')).toBe('conflict');
      expect(syncStatusBadge!.textContent).toBe('Review Conflicts');

      const conflictQueueBadge = container!.querySelector('[data-testid="conflict-queue-badge"]');
      expect(conflictQueueBadge).not.toBeNull();
      expect(conflictQueueBadge!.textContent).toContain('48 Unresolved Conflicts (48 Documents)');

      const reviewRequiredLabel = container!.querySelector('[data-testid="conflict-review-required-label"]');
      expect(reviewRequiredLabel).not.toBeNull();
      expect(reviewRequiredLabel!.textContent).toContain('Review required');

      const conflictCardNotice = container!.querySelector('[data-testid="sync-conflicts-notice-badge"]');
      expect(conflictCardNotice).not.toBeNull();
      expect(conflictCardNotice!.textContent).toBe('48 Conflict Revisions (48 Documents) • Review Required');
    });

    it('triggers handleSyncNow callback on "Sync Now" button click', async () => {
      const handleSyncNowMock = vi.fn();

      await act(async () => {
        root!.render(
          <DataSyncTab
            isSyncingProfile={false}
            lastProfileSyncTime=""
            handleSyncAllSettingsAcrossDevices={vi.fn()}
            profileSyncNotice={null}
            setIsPairQrModalOpen={vi.fn()}
            setIsImportProfileModalOpen={vi.fn()}
            syncState={defaultSyncState}
            handleSyncNow={handleSyncNowMock}
            isSyncStarting={false}
            isSyncConfigOpen={false}
            setIsSyncConfigOpen={vi.fn()}
            syncUrlInput=""
            setSyncUrlInput={vi.fn()}
            handleConnectSync={vi.fn()}
            handleStopSync={vi.fn()}
            isRemoteDbActive={true}
            savedRemoteUrl="https://couchdb.example.com/store"
          />
        );
      });

      const syncNowBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Sync Now')
      );
      expect(syncNowBtn).toBeDefined();

      await act(async () => {
        syncNowBtn!.click();
      });

      expect(handleSyncNowMock).toHaveBeenCalledTimes(1);
    });
  });
});
