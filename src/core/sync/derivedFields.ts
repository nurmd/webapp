/**
 * src/core/sync/derivedFields.ts
 *
 * Single source of truth for volatile, derived, and sync bookkeeping fields.
 * A difference in these fields alone is never a user-visible conflict and
 * must not raise phantom 409 or financial-divergence conflict alarms.
 */

/**
 * Fields that are recomputed or are pure sync bookkeeping. A difference in
 * these alone is never a user-visible conflict.
 */
export const DERIVED_OR_VOLATILE_FIELDS = new Set<string>([
  'currentBalance', // recomputed by recalculatePartyBalance()
  'updatedAt', // bookkeeping
  'syncedAt', // bookkeeping
  'docType', // bookkeeping
  'paiseSchema', // derived from rupee fields by paise backfill
]);

/**
 * PouchDB document metadata fields that are stripped before comparing content.
 */
export const SYNC_METADATA_FIELDS = new Set<string>([
  '_id',
  '_rev',
  '_conflicts',
]);

/**
 * Checks whether a property key is considered volatile, derived, or bookkeeping.
 */
export function isDerivedOrVolatileField(key: string): boolean {
  if (DERIVED_OR_VOLATILE_FIELDS.has(key)) return true;
  if (key.endsWith('Paise')) return true;
  if (key === '__paiseSchema' || key === '__paiseKind') return true;
  return false;
}

/**
 * Checks whether a key should be ignored when comparing document content.
 */
export function isIgnoredSyncField(key: string): boolean {
  return SYNC_METADATA_FIELDS.has(key) || isDerivedOrVolatileField(key);
}

/**
 * Strips metadata, bookkeeping, and derived/volatile fields from a document,
 * returning a shallow copy with sorted keys for deterministic comparison.
 */
export function stripDerivedAndVolatileFields(doc: unknown): Record<string, unknown> {
  if (!doc || typeof doc !== 'object') return {};
  const clean: Record<string, unknown> = {};
  const record = doc as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  for (const key of sortedKeys) {
    if (isIgnoredSyncField(key)) {
      continue;
    }
    clean[key] = record[key];
  }
  return clean;
}

/**
 * Strips core metadata & bookkeeping fields (_id, _rev, _conflicts, syncedAt, docType),
 * matching the legacy isDocDivergent / areEntitiesDivergent baseline.
 */
export function stripCoreMetadata(doc: unknown): Record<string, unknown> {
  if (!doc || typeof doc !== 'object') return {};
  const clean: Record<string, unknown> = { ...(doc as Record<string, unknown>) };
  delete clean._id;
  delete clean._rev;
  delete clean._conflicts;
  delete clean.syncedAt;
  delete clean.docType;
  return clean;
}

/**
 * Standard content divergence check (excluding revision & sync bookkeeping).
 */
export function isDocDivergent(a: unknown, b: unknown): boolean {
  if (!a || !b) return true;
  const cleanA = stripCoreMetadata(a);
  const cleanB = stripCoreMetadata(b);
  return JSON.stringify(cleanA) !== JSON.stringify(cleanB);
}

/**
 * Returns true if documents differ per isDocDivergent, BUT are identical
 * once volatile and derived fields (currentBalance, updatedAt, paiseSchema, *Paise)
 * are removed.
 */
export function hasOnlyDerivedDivergence(a: unknown, b: unknown): boolean {
  if (!isDocDivergent(a, b)) {
    return false;
  }
  const cleanA = stripDerivedAndVolatileFields(a);
  const cleanB = stripDerivedAndVolatileFields(b);
  return JSON.stringify(cleanA) === JSON.stringify(cleanB);
}

/**
 * Returns the names of all non-metadata fields that differ between a and b.
 */
export function getDerivedDivergenceFields(a: unknown, b: unknown): string[] {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [];
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const diffs: string[] = [];
  const allKeys = new Set([...Object.keys(recA), ...Object.keys(recB)]);
  for (const key of allKeys) {
    if (SYNC_METADATA_FIELDS.has(key)) continue;
    if (JSON.stringify(recA[key]) !== JSON.stringify(recB[key])) {
      diffs.push(key);
    }
  }
  return diffs;
}
