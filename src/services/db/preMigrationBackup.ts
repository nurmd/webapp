import { db } from '../db.ts';
import {
  DatabaseBackupBundle,
  validateBackupBundle,
} from '../../core/backup/backupEngine.ts';

export interface PreMigrationBackupResult {
  success: boolean;
  migrationId: string;
  backupKey: string;
  checksum: string;
  createdAt: string;
  recordCounts: {
    invoices: number;
    purchases: number;
    items: number;
    parties: number;
    vouchers: number;
  };
}

/**
 * Creates, stores, and cryptographically verifies a restorable pre-migration backup snapshot.
 * Strict Invariant: Never allows migration or repair execution to proceed if the backup cannot be read back.
 */
export function createAndVerifyPreMigrationBackup(migrationId: string): PreMigrationBackupResult {
  if (!migrationId || !migrationId.trim()) {
    throw new Error('Migration ID must be specified for pre-migration backup.');
  }

  const cleanId = migrationId.trim();
  const backupKey = `gst_pre_migration_backup_${cleanId}`;

  // 1. Generate full bundle using domain backup engine
  const bundle: DatabaseBackupBundle = db.createDatabaseBackup();

  // 2. Initial schema & checksum validation
  const validation = validateBackupBundle(bundle);
  if (!validation.isValid || !validation.bundle) {
    throw new Error(`Pre-migration backup creation failed validation: ${validation.error || 'Unknown error'}`);
  }

  // 3. Serialize and write to storage
  const serialized = JSON.stringify(bundle);
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage is not available for persistent pre-migration backup.');
  }

  try {
    localStorage.setItem(backupKey, serialized);
  } catch (err: any) {
    throw new Error(`Failed to write pre-migration backup to storage (storage quota exceeded?): ${err?.message || err}`);
  }

  // 4. Read back and perform round-trip cryptographic verification
  const readBackRaw = localStorage.getItem(backupKey);
  if (!readBackRaw) {
    throw new Error(`Pre-migration verification failed: backup key "${backupKey}" not found immediately after write.`);
  }

  let readBackBundle: DatabaseBackupBundle;
  try {
    readBackBundle = JSON.parse(readBackRaw);
  } catch (err: any) {
    try { localStorage.removeItem(backupKey); } catch {}
    throw new Error(`Pre-migration verification failed: backup payload could not be parsed back as JSON: ${err?.message || err}`);
  }

  const readBackValidation = validateBackupBundle(readBackBundle);
  if (!readBackValidation.isValid || !readBackValidation.bundle) {
    try { localStorage.removeItem(backupKey); } catch {}
    throw new Error(`Pre-migration verification failed: read-back backup bundle failed validation: ${readBackValidation.error}`);
  }

  if (readBackValidation.bundle.checksum !== bundle.checksum) {
    try { localStorage.removeItem(backupKey); } catch {}
    throw new Error('Pre-migration verification failed: read-back checksum mismatch.');
  }

  return {
    success: true,
    migrationId: cleanId,
    backupKey,
    checksum: bundle.checksum,
    createdAt: bundle.createdAt,
    recordCounts: {
      invoices: bundle.counts.invoices,
      purchases: bundle.counts.purchases,
      items: bundle.counts.items,
      parties: bundle.counts.parties,
      vouchers: bundle.counts.vouchers,
    },
  };
}

/**
 * Validates that a verifiable pre-migration backup exists in storage.
 */
export function hasVerifiedPreMigrationBackup(migrationId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  const backupKey = `gst_pre_migration_backup_${migrationId.trim()}`;
  const raw = localStorage.getItem(backupKey);
  if (!raw) return false;
  try {
    const bundle = JSON.parse(raw);
    const validation = validateBackupBundle(bundle);
    return validation.isValid;
  } catch {
    return false;
  }
}

/**
 * Restores the pre-migration backup in REPLACE mode to revert any failed migration.
 */
export async function restorePreMigrationBackup(migrationId: string): Promise<boolean> {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage is unavailable.');
  }
  const backupKey = `gst_pre_migration_backup_${migrationId.trim()}`;
  const raw = localStorage.getItem(backupKey);
  if (!raw) {
    throw new Error(`Cannot restore: pre-migration backup for "${migrationId}" not found.`);
  }

  const bundle = JSON.parse(raw);
  const result = await db.restoreDatabaseBackup(bundle, 'REPLACE');
  return result.success;
}
