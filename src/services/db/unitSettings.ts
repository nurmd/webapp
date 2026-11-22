/**
 * src/services/db/unitSettings.ts
 *
 * Persisted Unit of Measurement registry.
 * Provides standard seed units (13 GST units) and custom unit management
 * with case-insensitive validation and localStorage persistence.
 */

import { STORAGE_KEYS } from './storageEngine.ts';

export interface UnitSetting {
  id?: string;
  code: string;
  label: string;
  kind: 'STANDARD' | 'CUSTOM';
  active: boolean;
  updatedAt?: string;
  createdAt?: string;
}

export const STANDARD_UNIT_SEEDS: readonly UnitSetting[] = [
  { code: 'PCS', label: 'Pieces', kind: 'STANDARD', active: true },
  { code: 'NOS', label: 'Numbers', kind: 'STANDARD', active: true },
  { code: 'KGS', label: 'Kilograms', kind: 'STANDARD', active: true },
  { code: 'GMS', label: 'Grams', kind: 'STANDARD', active: true },
  { code: 'LTR', label: 'Litres', kind: 'STANDARD', active: true },
  { code: 'ML', label: 'Millilitres', kind: 'STANDARD', active: true },
  { code: 'MTR', label: 'Metres', kind: 'STANDARD', active: true },
  { code: 'BOX', label: 'Boxes', kind: 'STANDARD', active: true },
  { code: 'PKT', label: 'Packets', kind: 'STANDARD', active: true },
  { code: 'SET', label: 'Sets', kind: 'STANDARD', active: true },
  { code: 'BAG', label: 'Bags', kind: 'STANDARD', active: true },
  { code: 'HOURS', label: 'Hours', kind: 'STANDARD', active: true },
  { code: 'DAYS', label: 'Days', kind: 'STANDARD', active: true },
];

export const STORAGE_KEY_UNITS = STORAGE_KEYS.UNITS;

export function normalizeUnitCode(raw?: string): string {
  if (!raw) return '';
  return String(raw).trim().replace(/\s+/g, ' ').toUpperCase();
}

let inMemoryUnits: UnitSetting[] | null = null;
let sortedCache: { src: UnitSetting[]; out: UnitSetting[] } | null = null;
let fallbackMemoryStorage: string | null = null;
const unitSubscribers = new Set<() => void>();

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    return localStorage;
  }
  return null;
}

export function subscribeUnits(listener: () => void): () => void {
  unitSubscribers.add(listener);
  return () => {
    unitSubscribers.delete(listener);
  };
}

function notifyUnitSubscribers(): void {
  unitSubscribers.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Error in unit subscriber:', e);
    }
  });
}

function loadRawUnits(): UnitSetting[] {
  if (inMemoryUnits) {
    return inMemoryUnits;
  }

  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY_UNITS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryUnits = parsed;
          return inMemoryUnits;
        }
      }
    } catch {
      // Fallback to standard seeds
    }
  } else if (fallbackMemoryStorage) {
    try {
      const parsed = JSON.parse(fallbackMemoryStorage);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryUnits = parsed;
        return inMemoryUnits;
      }
    } catch {
      // Fallback
    }
  }

  inMemoryUnits = STANDARD_UNIT_SEEDS.map((s) => ({ ...s }));
  return inMemoryUnits;
}

function persistUnits(units: UnitSetting[]): void {
  inMemoryUnits = units;
  sortedCache = null;
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY_UNITS, JSON.stringify(units));
    } catch {
      // Ignore localStorage write failures
    }
  } else {
    fallbackMemoryStorage = JSON.stringify(units);
  }
  notifyUnitSubscribers();
}

/**
 * List all units from registry with active units first.
 * Returns a referentially stable array when underlying units have not mutated.
 */
export function listUnits(): UnitSetting[] {
  const all = loadRawUnits();
  if (sortedCache && sortedCache.src === all) {
    return sortedCache.out;
  }

  const sorted = [...all].sort((a, b) => {
    if (a.active === b.active) return 0;
    return a.active ? -1 : 1;
  });

  sortedCache = { src: all, out: sorted };
  return sorted;
}

/**
 * Alias for listUnits() per synced collection pattern.
 */
export function getUnits(): UnitSetting[] {
  return listUnits();
}

/**
 * Persist raw units array (used by sync engine to apply remote mutations).
 */
export function setUnits(units: UnitSetting[]): void {
  persistUnits(units);
}

/**
 * Invalidate in-memory caches and reload units from storage.
 * Called after sync writes units via the storage engine.
 */
export function reloadUnitsFromStorage(): void {
  inMemoryUnits = null;
  sortedCache = null;
  loadRawUnits();
  notifyUnitSubscribers();
}

/**
 * Add a new custom unit.
 * Code is required, trimmed, uppercase, and checked for case-insensitive uniqueness.
 */
export function addUnit(code: string, label?: string): UnitSetting {
  const normalizedCode = normalizeUnitCode(code);
  if (!normalizedCode) {
    throw new Error('Unit code is required and cannot be empty.');
  }

  const current = loadRawUnits();
  const duplicate = current.find(
    (u) => normalizeUnitCode(u.code) === normalizedCode
  );
  if (duplicate) {
    throw new Error(`Unit code "${normalizedCode}" already exists.`);
  }

  const cleanLabel = (label || '').trim() || normalizedCode;
  const newUnit: UnitSetting = {
    code: normalizedCode,
    label: cleanLabel,
    kind: 'CUSTOM',
    active: true,
  };

  const nextList = [...current, newUnit];
  persistUnits(nextList);
  return newUnit;
}

/**
 * Deactivate a unit by code (active = false).
 */
export function deactivateUnit(code: string): UnitSetting {
  const normalizedCode = normalizeUnitCode(code);
  if (!normalizedCode) {
    throw new Error('Unit code is required.');
  }

  const current = loadRawUnits();
  const idx = current.findIndex(
    (u) => normalizeUnitCode(u.code) === normalizedCode
  );
  if (idx < 0) {
    throw new Error(`Unit "${normalizedCode}" not found.`);
  }

  const updated: UnitSetting = {
    ...current[idx],
    active: false,
  };
  const nextList = [...current];
  nextList[idx] = updated;
  persistUnits(nextList);
  return updated;
}

/**
 * Activate a unit by code (active = true).
 */
export function activateUnit(code: string): UnitSetting {
  const normalizedCode = normalizeUnitCode(code);
  if (!normalizedCode) {
    throw new Error('Unit code is required.');
  }

  const current = loadRawUnits();
  const idx = current.findIndex(
    (u) => normalizeUnitCode(u.code) === normalizedCode
  );
  if (idx < 0) {
    throw new Error(`Unit "${normalizedCode}" not found.`);
  }

  const updated: UnitSetting = {
    ...current[idx],
    active: true,
  };
  const nextList = [...current];
  nextList[idx] = updated;
  persistUnits(nextList);
  return updated;
}

/**
 * Lookup a unit by code (case-insensitive).
 * Returns undefined if not found without throwing.
 */
export function getUnit(code: string): UnitSetting | undefined {
  const normalizedCode = normalizeUnitCode(code);
  if (!normalizedCode) return undefined;
  const current = loadRawUnits();
  return current.find((u) => normalizeUnitCode(u.code) === normalizedCode);
}

/**
 * Reset unit registry back to initial 13 standard seeds (useful for test harnesses).
 */
export function resetUnits(): void {
  inMemoryUnits = STANDARD_UNIT_SEEDS.map((s) => ({ ...s }));
  sortedCache = null;
  fallbackMemoryStorage = null;
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY_UNITS);
    } catch {}
  }
  notifyUnitSubscribers();
}
