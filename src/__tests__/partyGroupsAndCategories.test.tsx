import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Mock storage
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

// Mock pouchdb
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

// Mock auditTrail
vi.mock('../services/auditTrail.ts', () => ({
  auditTrail: {
    logEvent: vi.fn(async () => {}),
    getRecentLogs: vi.fn(async () => []),
    getLogsByDocument: vi.fn(async () => []),
  },
}));

import { db } from '../services/db.ts';
import { pouch } from '../services/pouchdb.ts';
import { rbac } from '../services/rbac.ts';
import { Party, PartyGroup, PartyCategory } from '../models/party.ts';
import { DatabaseBackupBundle, computeBackupChecksum } from '../core/backup/backupEngine.ts';
import { PartiesView } from '../components/Parties/PartiesView.tsx';
import { AddEditPartyModal } from '../components/Parties/AddEditPartyModal.tsx';
import { PartyGroupsCategoriesModal } from '../components/Parties/modals/PartyGroupsCategoriesModal.tsx';

function changeInput(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Party Groups & Categories Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    testStorage.clear();
    (db as any).clearMemoryCache?.();
    vi.clearAllMocks();
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

  describe('1. Storage Engine CRUD & Validation', () => {
    it('creates, renames, and retrieves party groups', () => {
      expect(db.getPartyGroups()).toEqual([]);

      const created = db.savePartyGroup({
        id: 'grp_retail',
        name: '  Retail Buyers  ',
        description: 'Walk-in retail consumers',
        color: '#2563eb',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(created.name).toBe('Retail Buyers');
      expect(created.color).toBe('#2563eb');

      const all = db.getPartyGroups();
      expect(all.length).toBe(1);
      expect(all[0].id).toBe('grp_retail');
      expect(all[0].name).toBe('Retail Buyers');

      // Rename
      const renamed = db.savePartyGroup({
        ...created,
        name: 'VIP Retailers',
      });
      expect(renamed.name).toBe('VIP Retailers');
      expect(db.getPartyGroups()[0].name).toBe('VIP Retailers');
    });

    it('enforces non-empty and case-insensitive duplicate validation on PartyGroup', () => {
      // Empty name throws
      expect(() =>
        db.savePartyGroup({
          id: 'grp_empty',
          name: '   ',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      ).toThrow(/cannot be empty/i);

      db.savePartyGroup({
        id: 'grp_corp',
        name: 'Corporate',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Duplicate case-insensitive name throws
      expect(() =>
        db.savePartyGroup({
          id: 'grp_corp_2',
          name: 'corporate ',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      ).toThrow(/already exists/i);
    });

    it('creates, renames, and retrieves party categories with duplicate validation', () => {
      expect(db.getPartyCategories()).toEqual([]);

      const cat = db.savePartyCategory({
        id: 'cat_wholesaler',
        name: 'Wholesaler',
        description: 'Bulk order buyers',
        color: '#16a34a',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(cat.name).toBe('Wholesaler');
      expect(db.getPartyCategories().length).toBe(1);

      // Empty name rejected
      expect(() =>
        db.savePartyCategory({
          id: 'cat_2',
          name: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      ).toThrow(/cannot be empty/i);

      // Duplicate name rejected
      expect(() =>
        db.savePartyCategory({
          id: 'cat_3',
          name: 'WHOLESALER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      ).toThrow(/already exists/i);
    });

    it('deleting a group unassigns linked parties but preserves parties', () => {
      const group = db.savePartyGroup({
        id: 'grp_north',
        name: 'North Zone',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const party1: Party = {
        id: 'PTY-001',
        name: 'Delhi Traders',
        type: 'CUSTOMER',
        phone: '9876543210',
        stateCode: '07',
        billingAddress: 'Chandni Chowk',
        currentBalance: 5000,
        groupId: group.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const party2: Party = {
        id: 'PTY-002',
        name: 'Mumbai Mart',
        type: 'CUSTOMER',
        phone: '9876543211',
        stateCode: '27',
        billingAddress: 'Dadar',
        currentBalance: 2000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.saveParty(party1);
      db.saveParty(party2);

      expect(db.getParties().find((p) => p.id === 'PTY-001')?.groupId).toBe(group.id);

      // Delete group
      db.deletePartyGroup(group.id);

      expect(db.getPartyGroups().some((g) => g.id === group.id)).toBe(false);

      // Parties still exist
      const partiesAfter = db.getParties();
      expect(partiesAfter.length).toBe(2);

      const p1After = partiesAfter.find((p) => p.id === 'PTY-001')!;
      expect(p1After).toBeTruthy();
      expect(p1After.groupId).toBeUndefined(); // Reference cleared!
      expect(p1After.name).toBe('Delhi Traders');

      const p2After = partiesAfter.find((p) => p.id === 'PTY-002')!;
      expect(p2After).toBeTruthy();
      expect(p2After.groupId).toBeUndefined();
    });

    it('deleting a category unassigns linked parties but preserves parties', () => {
      const category = db.savePartyCategory({
        id: 'cat_distributor',
        name: 'Distributor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const party: Party = {
        id: 'PTY-003',
        name: 'Apex Distributors',
        type: 'CUSTOMER',
        phone: '9876543212',
        stateCode: '07',
        billingAddress: 'Connaught Place',
        currentBalance: 0,
        categoryId: category.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.saveParty(party);
      expect(db.getParties().find((p) => p.id === 'PTY-003')?.categoryId).toBe(category.id);

      db.deletePartyCategory(category.id);

      expect(db.getPartyCategories().some((c) => c.id === category.id)).toBe(false);
      const partyAfter = db.getParties().find((p) => p.id === 'PTY-003')!;
      expect(partyAfter).toBeTruthy();
      expect(partyAfter.categoryId).toBeUndefined();
    });

    it('preserves existing party groupId and categoryId on partial updates', () => {
      const party: Party = {
        id: 'PTY-004',
        name: 'Kolkata Stores',
        type: 'CUSTOMER',
        phone: '9876543213',
        stateCode: '19',
        billingAddress: 'Park Street',
        currentBalance: 1000,
        groupId: 'grp_east',
        categoryId: 'cat_retail',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(party);

      // Partial update that omitted groupId and categoryId
      db.saveParty({
        id: 'PTY-004',
        name: 'Kolkata Stores Renamed',
        type: 'CUSTOMER',
        phone: '9876543213',
        stateCode: '19',
        billingAddress: 'Park Street',
        currentBalance: 1000,
        createdAt: party.createdAt,
        updatedAt: new Date().toISOString(),
      } as any);

      const loaded = db.getParties().find((p) => p.id === 'PTY-004')!;
      expect(loaded.name).toBe('Kolkata Stores Renamed');
      expect(loaded.groupId).toBe('grp_east');
      expect(loaded.categoryId).toBe('cat_retail');
    });

    it('unassigns party references on cross-tab BroadcastChannel mutation without deleting party', () => {
      const group = db.savePartyGroup({
        id: 'grp_xtab',
        name: 'Cross Tab Group',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const category = db.savePartyCategory({
        id: 'cat_xtab',
        name: 'Cross Tab Category',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const party: Party = {
        id: 'PTY-XTAB-01',
        name: 'Cross Tab Store',
        type: 'CUSTOMER',
        phone: '9876543210',
        stateCode: '07',
        billingAddress: 'Main Market',
        currentBalance: 0,
        groupId: group.id,
        categoryId: category.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(party);

      expect(db.getParties().find((p) => p.id === 'PTY-XTAB-01')?.groupId).toBe('grp_xtab');
      expect(db.getParties().find((p) => p.id === 'PTY-XTAB-01')?.categoryId).toBe('cat_xtab');

      // Simulate BroadcastChannel delete for group
      (db as any).applyLocalEntityMutation('party_group', 'delete', 'grp_xtab');

      expect(db.getPartyGroups().some((g) => g.id === 'grp_xtab')).toBe(false);
      const partyAfterGroup = db.getParties().find((p) => p.id === 'PTY-XTAB-01');
      expect(partyAfterGroup).toBeTruthy();
      expect(partyAfterGroup?.groupId).toBeUndefined();
      expect(partyAfterGroup?.categoryId).toBe('cat_xtab');

      // Simulate BroadcastChannel delete for category
      (db as any).applyLocalEntityMutation('party_category', 'delete', 'cat_xtab');

      expect(db.getPartyCategories().some((c) => c.id === 'cat_xtab')).toBe(false);
      const partyAfterCat = db.getParties().find((p) => p.id === 'PTY-XTAB-01');
      expect(partyAfterCat).toBeTruthy();
      expect(partyAfterCat?.categoryId).toBeUndefined();
    });

    it('unassigns party references and persists updated party on incoming PouchDB sync deletion', () => {
      const group = db.savePartyGroup({
        id: 'grp_sync',
        name: 'Sync Group',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const category = db.savePartyCategory({
        id: 'cat_sync',
        name: 'Sync Category',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const party: Party = {
        id: 'PTY-SYNC-01',
        name: 'Sync Store',
        type: 'CUSTOMER',
        phone: '9876543211',
        stateCode: '07',
        billingAddress: 'Sync Road',
        currentBalance: 0,
        groupId: group.id,
        categoryId: category.id,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      db.saveParty(party);

      vi.clearAllMocks();

      // Incoming change: party_group deleted
      (db as any).applyIncomingChange({ id: 'party_group:grp_sync', deleted: true });

      expect(db.getPartyGroups().some((g) => g.id === 'grp_sync')).toBe(false);
      const partyAfterGroup = db.getParties().find((p) => p.id === 'PTY-SYNC-01');
      expect(partyAfterGroup).toBeTruthy();
      expect(partyAfterGroup?.groupId).toBeUndefined();
      expect(partyAfterGroup?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
      expect(pouch.putDoc).toHaveBeenCalledWith('party', expect.objectContaining({
        id: 'PTY-SYNC-01',
        groupId: undefined,
      }));

      vi.clearAllMocks();

      // Incoming change: party_category deleted
      (db as any).applyIncomingChange({ id: 'party_category:cat_sync', deleted: true });

      expect(db.getPartyCategories().some((c) => c.id === 'cat_sync')).toBe(false);
      const partyAfterCat = db.getParties().find((p) => p.id === 'PTY-SYNC-01');
      expect(partyAfterCat).toBeTruthy();
      expect(partyAfterCat?.categoryId).toBeUndefined();
      expect(pouch.putDoc).toHaveBeenCalledWith('party', expect.objectContaining({
        id: 'PTY-SYNC-01',
        categoryId: undefined,
      }));
    });

    it('prunes dangling party references when groups are removed via full sync reconciliation', async () => {
      const group = db.savePartyGroup({
        id: 'grp_remote_del',
        name: 'Remote Deleted Group',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const party: Party = {
        id: 'PTY-RECON-01',
        name: 'Reconcile Target Store',
        type: 'CUSTOMER',
        phone: '9876543219',
        stateCode: '07',
        billingAddress: 'Reconcile Ave',
        currentBalance: 0,
        groupId: group.id,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      db.saveParty(party);

      expect(db.getParties().find((p) => p.id === 'PTY-RECON-01')?.groupId).toBe('grp_remote_del');

      // Mock remote tombstones indicating group was deleted remotely
      (pouch as any).getAllTombstones = vi.fn(async () => [
        { targetType: 'party_group', targetId: 'grp_remote_del', deletedAt: new Date().toISOString() },
      ]);

      // Mock pouch.getAllDocs to return empty party_groups and party_categories (simulating remote removal)
      (pouch.getAllDocs as any).mockImplementation(async (type: string) => {
        if (type === 'party_group') return [];
        if (type === 'party_category') return [];
        if (type === 'party') return [db.getParties().find((p) => p.id === 'PTY-RECON-01')];
        return [];
      });

      vi.clearAllMocks();

      await (db as any).syncAllFromPouch();

      expect(db.getPartyGroups().some((g) => g.id === 'grp_remote_del')).toBe(false);
      const partyAfter = db.getParties().find((p) => p.id === 'PTY-RECON-01');
      expect(partyAfter).toBeTruthy();
      expect(partyAfter?.groupId).toBeUndefined();
      expect(pouch.putDoc).toHaveBeenCalledWith('party', expect.objectContaining({
        id: 'PTY-RECON-01',
        groupId: undefined,
      }));
    });

    it('preserves party group and category assignments on incoming partial party updates', () => {
      const party: Party = {
        id: 'PTY-PARTIAL-01',
        name: 'Partial Sync Store',
        type: 'CUSTOMER',
        phone: '9876543210',
        stateCode: '07',
        billingAddress: 'Partial St',
        currentBalance: 0,
        groupId: 'grp_assigned',
        categoryId: 'cat_assigned',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      db.saveParty(party);

      // 1. applyLocalEntityMutation partial update
      (db as any).applyLocalEntityMutation('party', 'save', 'PTY-PARTIAL-01', {
        id: 'PTY-PARTIAL-01',
        name: 'Partial Sync Store Updated Loc',
        phone: '9876543210',
        // groupId and categoryId omitted in partial payload
      });

      const partyAfterLocal = db.getParties().find((p) => p.id === 'PTY-PARTIAL-01')!;
      expect(partyAfterLocal.name).toBe('Partial Sync Store Updated Loc');
      expect(partyAfterLocal.groupId).toBe('grp_assigned');
      expect(partyAfterLocal.categoryId).toBe('cat_assigned');

      // 2. applyIncomingChange partial update
      (db as any).applyIncomingChange({
        id: 'party:PTY-PARTIAL-01',
        doc: {
          id: 'PTY-PARTIAL-01',
          name: 'Partial Sync Store Remote Renamed',
          phone: '9876543210',
          // groupId and categoryId omitted in incoming payload
        },
      });

      const partyAfterIncoming = db.getParties().find((p) => p.id === 'PTY-PARTIAL-01')!;
      expect(partyAfterIncoming.name).toBe('Partial Sync Store Remote Renamed');
      expect(partyAfterIncoming.groupId).toBe('grp_assigned');
      expect(partyAfterIncoming.categoryId).toBe('cat_assigned');
    });
  });

  describe('2. Backup Round-Trip & Backward Compatibility', () => {
    it('backs up and restores party groups and party categories', async () => {
      db.savePartyGroup({
        id: 'grp_vip',
        name: 'VIP Accounts',
        color: '#dc2626',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      db.savePartyCategory({
        id: 'cat_gold',
        name: 'Gold Tier',
        color: '#ca8a04',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const backup = db.createDatabaseBackup();
      expect(backup.counts.partyGroups).toBe(1);
      expect(backup.counts.partyCategories).toBe(1);
      expect(backup.data.partyGroups?.length).toBe(1);
      expect(backup.data.partyCategories?.length).toBe(1);

      // Clear local
      db.deletePartyGroup('grp_vip');
      db.deletePartyCategory('cat_gold');
      expect(db.getPartyGroups().length).toBe(0);
      expect(db.getPartyCategories().length).toBe(0);

      // Restore
      const restoreResult = await db.restoreDatabaseBackup(backup, 'REPLACE');
      expect(restoreResult.restoredCounts.partyGroups).toBe(1);
      expect(restoreResult.restoredCounts.partyCategories).toBe(1);
      expect(db.getPartyGroups().some((g) => g.id === 'grp_vip')).toBe(true);
      expect(db.getPartyCategories().some((c) => c.id === 'cat_gold')).toBe(true);
    });

    it('restores legacy backup without partyGroups/partyCategories without errors', async () => {
      // Existing group in local
      db.savePartyGroup({
        id: 'grp_local',
        name: 'Local Group',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const baseBackup = db.createDatabaseBackup();
      // Simulate legacy backup created by older versions (v1.2.24 or earlier)
      const legacyBackup: DatabaseBackupBundle = {
        ...baseBackup,
        counts: {
          ...baseBackup.counts,
          partyGroups: undefined,
          partyCategories: undefined,
        },
        data: {
          ...baseBackup.data,
          partyGroups: undefined,
          partyCategories: undefined,
        },
      };
      legacyBackup.checksum = computeBackupChecksum(legacyBackup.data);

      // Restore should succeed without crashing or dropping
      await expect(db.restoreDatabaseBackup(legacyBackup, 'MERGE')).resolves.not.toThrow();
      expect(db.getPartyGroups().length).toBe(1);
      expect(db.getPartyGroups()[0].id).toBe('grp_local');
    });
  });

  describe('3. AddEditPartyModal Integration', () => {
    it('initializes and saves selected groupId and categoryId', () => {
      const group = db.savePartyGroup({
        id: 'grp_test_ui',
        name: 'UI Test Group',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const cat = db.savePartyCategory({
        id: 'cat_test_ui',
        name: 'UI Test Category',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      let savedParty: Party | null = null;

      act(() => {
        root!.render(
          <AddEditPartyModal
            isOpen={true}
            onClose={() => {}}
            onSave={(p) => {
              savedParty = p;
            }}
            editingParty={null}
            initialType="CUSTOMER"
            parties={[]}
          />
        );
      });

      // Verify label was renamed to "Party Type"
      expect(container!.textContent).toContain('Party Type');

      // Fill party details
      const nameInput = container!.querySelector('input[placeholder*="Ramesh Hardware Store"]') as HTMLInputElement;
      expect(nameInput).toBeTruthy();
      act(() => {
        changeInput(nameInput, 'Ramesh Store');
      });

      const phoneInput = container!.querySelector('input[placeholder*="10-digit mobile"]') as HTMLInputElement;
      expect(phoneInput).toBeTruthy();
      act(() => {
        changeInput(phoneInput, '9876543210');
      });

      // Select group
      const groupSelect = container!.querySelector('#party-form-group-select') as HTMLSelectElement;
      expect(groupSelect).toBeTruthy();
      act(() => {
        groupSelect.value = group.id;
        groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Select category
      const catSelect = container!.querySelector('#party-form-category-select') as HTMLSelectElement;
      expect(catSelect).toBeTruthy();
      act(() => {
        catSelect.value = cat.id;
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Submit form
      const form = container!.querySelector('form');
      expect(form).toBeTruthy();
      act(() => {
        form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(savedParty).not.toBeNull();
      expect((savedParty as any).name).toBe('Ramesh Store');
      expect((savedParty as any).groupId).toBe(group.id);
      expect((savedParty as any).categoryId).toBe(cat.id);
    });
  });

  describe('4. PartiesView UI & Filtering', () => {
    it('filters parties by group and category and matches in search', () => {
      const g1 = db.savePartyGroup({ id: 'g1', name: 'Premium Group', color: '#2563eb', createdAt: '', updatedAt: '' });
      const c1 = db.savePartyCategory({ id: 'c1', name: 'Wholesale Tier', color: '#16a34a', createdAt: '', updatedAt: '' });

      const partyA: Party = {
        id: 'pA',
        name: 'A One Stores',
        type: 'CUSTOMER',
        phone: '9000000001',
        billingAddress: 'Sector 1',
        stateCode: '07',
        currentBalance: 1000,
        groupId: g1.id,
        categoryId: c1.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const partyB: Party = {
        id: 'pB',
        name: 'B Two Retails',
        type: 'CUSTOMER',
        phone: '9000000002',
        billingAddress: 'Sector 2',
        stateCode: '07',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        root!.render(
          <PartiesView
            parties={[partyA, partyB]}
            onSaveParty={() => {}}
            onDeleteParty={() => {}}
          />
        );
      });

      // Both parties visible initially
      expect(container!.textContent).toContain('A One Stores');
      expect(container!.textContent).toContain('B Two Retails');

      // Colored chips visible on party card
      expect(container!.textContent).toContain('Premium Group');
      expect(container!.textContent).toContain('Wholesale Tier');

      // Filter by Group select
      const groupSelect = container!.querySelector('select[aria-label="Filter by Party Group"]') as HTMLSelectElement;
      expect(groupSelect).toBeTruthy();

      act(() => {
        groupSelect.value = g1.id;
        groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // PartyA is visible, PartyB is filtered out
      expect(container!.textContent).toContain('A One Stores');
      expect(container!.textContent).not.toContain('B Two Retails');

      // Search by group name also matches
      act(() => {
        groupSelect.value = 'ALL';
        groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const searchInput = container!.querySelector('input[placeholder*="Search customer"]') as HTMLInputElement;
      act(() => {
        changeInput(searchInput, 'Premium');
      });

      expect(container!.textContent).toContain('A One Stores');
      expect(container!.textContent).not.toContain('B Two Retails');

      // Clear Filters button resets filters
      const clearBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Clear Filters')
      );
      expect(clearBtn).toBeTruthy();

      act(() => {
        clearBtn!.click();
      });

      expect(container!.textContent).toContain('A One Stores');
      expect(container!.textContent).toContain('B Two Retails');
    });

    it('resets stale group/category filter to ALL when selected group or category is deleted', () => {
      const g1 = db.savePartyGroup({ id: 'g_stale', name: 'Stale Group', createdAt: '', updatedAt: '' });
      const c1 = db.savePartyCategory({ id: 'c_stale', name: 'Stale Category', createdAt: '', updatedAt: '' });

      const partyA: Party = {
        id: 'p_stale_party',
        name: 'Stale Filter Target Party',
        type: 'CUSTOMER',
        phone: '9000000099',
        billingAddress: 'Sector Stale',
        stateCode: '07',
        currentBalance: 500,
        groupId: g1.id,
        categoryId: c1.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        root!.render(
          <PartiesView
            parties={[partyA]}
            onSaveParty={() => {}}
            onDeleteParty={() => {}}
          />
        );
      });

      const groupSelect = container!.querySelector('select[aria-label="Filter by Party Group"]') as HTMLSelectElement;
      expect(groupSelect).toBeTruthy();

      act(() => {
        groupSelect.value = g1.id;
        groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(groupSelect.value).toBe(g1.id);

      // Delete group from db
      act(() => {
        db.deletePartyGroup(g1.id);
      });

      // Filter should auto-reset to ALL, displaying the party
      expect(container!.textContent).toContain('Stale Filter Target Party');

      // Test category filter stale reset
      const catSelect = container!.querySelector('select[aria-label="Filter by Party Category"]') as HTMLSelectElement;
      expect(catSelect).toBeTruthy();

      act(() => {
        catSelect.value = c1.id;
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(catSelect.value).toBe(c1.id);

      // Delete category from db
      act(() => {
        db.deletePartyCategory(c1.id);
      });

      // Filter should auto-reset to ALL, displaying the party
      expect(container!.textContent).toContain('Stale Filter Target Party');
    });
  });

  describe('5. PartyGroupsCategoriesModal & RBAC Deletion Guard', () => {
    it('manages groups and categories through modal with delete confirmation', () => {
      act(() => {
        root!.render(
          <PartyGroupsCategoriesModal
            isOpen={true}
            onClose={() => {}}
          />
        );
      });

      expect(container!.textContent).toContain('Party Groups & Categories');

      // Click "Add Group"
      const addBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Group')
      );
      expect(addBtn).toBeTruthy();

      act(() => {
        addBtn!.click();
      });

      const nameInput = container!.querySelector('#form-name-input') as HTMLInputElement;
      expect(nameInput).toBeTruthy();

      act(() => {
        changeInput(nameInput, 'South Zone');
      });

      const saveBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
        b.textContent === 'Save'
      );
      expect(saveBtn).toBeTruthy();
      act(() => {
        saveBtn!.click();
      });

      // Group appears in list
      expect(container!.textContent).toContain('South Zone');
      expect(db.getPartyGroups().some((g) => g.name === 'South Zone')).toBe(true);
    });

    it('enforces rbac.canDeleteParty guard on delete action', () => {
      const grp = db.savePartyGroup({
        id: 'grp_rbac',
        name: 'Protected Group',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Mock canDeleteParty to false (e.g. CASHIER or restricted role)
      vi.spyOn(rbac, 'canDeleteParty').mockReturnValue(false);

      act(() => {
        root!.render(
          <PartyGroupsCategoriesModal
            isOpen={true}
            onClose={() => {}}
          />
        );
      });

      const deleteBtn = container!.querySelector(`button[title="Delete ${grp.name}"]`) as HTMLButtonElement;
      expect(deleteBtn).toBeTruthy();

      act(() => {
        deleteBtn.click();
      });

      // Confirm modal should NOT be opened because permission was denied
      expect(container!.textContent).not.toContain('Delete & Unassign');
      // Group was NOT deleted
      expect(db.getPartyGroups().some((g) => g.id === grp.id)).toBe(true);

      // Now allow deletion
      vi.spyOn(rbac, 'canDeleteParty').mockReturnValue(true);

      act(() => {
        deleteBtn.click();
      });

      // Confirm modal is opened
      expect(document.body.textContent).toContain('Delete & Unassign');

      // Click confirm delete
      const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delete & Unassign')
      );
      expect(confirmBtn).toBeTruthy();

      act(() => {
        confirmBtn!.click();
      });

      // Group is now deleted
      expect(db.getPartyGroups().some((g) => g.id === grp.id)).toBe(false);
    });
  });
});
