import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { db } from '../services/db.ts';
import {
  createAndVerifyPreMigrationBackup,
  hasVerifiedPreMigrationBackup,
  restorePreMigrationBackup,
} from '../services/db/preMigrationBackup.ts';

describe('Pre-Migration Backup & Round-Trip Verification Suite', () => {
  beforeEach(() => {
    testStorage.clear();
  });

  it('successfully creates, stores, and verifies a restorable pre-migration backup snapshot', () => {
    const result = createAndVerifyPreMigrationBackup('v1221_reconciliation');
    expect(result.success).toBe(true);
    expect(result.migrationId).toBe('v1221_reconciliation');
    expect(result.backupKey).toBe('gst_pre_migration_backup_v1221_reconciliation');
    expect(result.checksum).toBeDefined();
    expect(result.recordCounts).toBeDefined();

    expect(hasVerifiedPreMigrationBackup('v1221_reconciliation')).toBe(true);
  });

  it('aborts and throws if read-back payload is corrupted', () => {
    const originalGetItem = testStorage.getItem.bind(testStorage);
    vi.spyOn(testStorage, 'getItem').mockImplementation((key: string) => {
      if (key.startsWith('gst_pre_migration_backup_')) {
        return '{ "format": "CORRUPTED" }';
      }
      return originalGetItem(key);
    });

    expect(() => {
      createAndVerifyPreMigrationBackup('test_corruption');
    }).toThrow(/Pre-migration verification failed/);

    vi.restoreAllMocks();
  });

  it('refuses to proceed if migration ID is empty', () => {
    expect(() => {
      createAndVerifyPreMigrationBackup('');
    }).toThrow(/Migration ID must be specified/);
  });

  it('restores database state cleanly from a verified pre-migration backup', async () => {
    const backupResult = createAndVerifyPreMigrationBackup('restore_test');
    expect(backupResult.success).toBe(true);

    const restoreSuccess = await restorePreMigrationBackup('restore_test');
    expect(restoreSuccess).toBe(true);
  });
});
