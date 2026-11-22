import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../services/db.ts';
import { pouch } from '../services/pouchdb.ts';
import {
  getUnits,
  setUnits,
  reloadUnitsFromStorage,
  resetUnits,
  subscribeUnits,
  UnitSetting,
} from '../services/db/unitSettings.ts';
import { STORAGE_KEYS } from '../services/db/storageEngine.ts';

describe('Units of Measurement Multi-Device Sync (Synced Collection Pattern)', () => {
  beforeEach(() => {
    resetUnits();
  });

  afterEach(() => {
    resetUnits();
    vi.restoreAllMocks();
  });

  it('getUnits and setUnits round-trip and update subscribers', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeUnits(subscriber);

    const initial = getUnits();
    expect(initial.length).toBeGreaterThan(0);

    const customUnit: UnitSetting = {
      id: 'BRL',
      code: 'BRL',
      label: 'Barrels',
      kind: 'CUSTOM',
      active: true,
    };

    setUnits([...initial, customUnit]);

    expect(subscriber).toHaveBeenCalled();
    const updated = getUnits();
    expect(updated.some((u) => u.code === 'BRL')).toBe(true);

    unsubscribe();
  });

  it('reloadUnitsFromStorage clears in-memory caches and refreshes from storage', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeUnits(subscriber);

    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (storage) {
      const rawCustomUnits: UnitSetting[] = [
        { id: 'TIN', code: 'TIN', label: 'Tins', kind: 'CUSTOM', active: true },
      ];
      storage.setItem(STORAGE_KEYS.UNITS, JSON.stringify(rawCustomUnits));
    } else {
      setUnits([{ id: 'TIN', code: 'TIN', label: 'Tins', kind: 'CUSTOM', active: true }]);
    }

    // Reload from storage
    reloadUnitsFromStorage();

    expect(subscriber).toHaveBeenCalled();
    const current = getUnits();
    expect(current.some((u) => u.code === 'TIN')).toBe(true);

    unsubscribe();
  });

  it('applyLocalEntityMutation handles unit save and delete', () => {
    const newUnit: UnitSetting = {
      id: 'CRATE',
      code: 'CRATE',
      label: 'Crates',
      kind: 'CUSTOM',
      active: true,
    };

    // Save mutation
    db.applyLocalEntityMutation('unit', 'save', 'CRATE', newUnit);
    let units = db.getUnits();
    expect(units.some((u) => u.code === 'CRATE')).toBe(true);

    // Delete mutation
    db.applyLocalEntityMutation('unit', 'delete', 'CRATE');
    units = db.getUnits();
    expect(units.some((u) => u.code === 'CRATE')).toBe(false);
    expect(db.getTombstones()['unit:CRATE']).toBeDefined();
  });

  it('reconciles remote units from PouchDB without clobbering unsynced local units', async () => {
    // Local custom unit
    db.addUnit('LOCAL_U', 'Local Custom Unit');

    // Mock remote units in PouchDB
    const remoteUnits: UnitSetting[] = [
      { id: 'REMOTE_U', code: 'REMOTE_U', label: 'Remote Unit', kind: 'CUSTOM', active: true },
    ];
    vi.spyOn(pouch, 'getAllDocs').mockImplementation(async (type: string) => {
      if (type === 'unit') {
        return remoteUnits as any;
      }
      return [];
    });

    await db.syncAllFromPouch();

    const units = db.getUnits();
    // Both local unsynced and remote units should be present
    expect(units.some((u) => u.code === 'LOCAL_U')).toBe(true);
    expect(units.some((u) => u.code === 'REMOTE_U')).toBe(true);
  });

  it('clearSyncedDataKeys removes STORAGE_KEYS.UNITS', () => {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (storage) {
      storage.setItem(STORAGE_KEYS.UNITS, JSON.stringify([{ code: 'TEMP' }]));
      expect(storage.getItem(STORAGE_KEYS.UNITS)).toBeTruthy();

      db.clearSyncedDataKeys();

      expect(storage.getItem(STORAGE_KEYS.UNITS)).toBeNull();
    }
  });
});
