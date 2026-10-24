import { sha256Sync } from '../core/utils/crypto.ts';

/**
 * Read-only conflict review and backup manifest builders.
 *
 * These helpers never write to PouchDB/CouchDB. They turn the visible conflict
 * queue into a deterministic review artifact and a checksum-verified backup of
 * every winning/conflicting revision body.
 */

export interface ConflictDoc {
  _id?: string;
  _rev?: string;
  _conflicts?: string[];
  _deleted?: boolean;
  _attachments?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConflictQueueItemLike {
  id?: string;
  docId: string;
  docType: string;
  entityId: string;
  winningRev?: string;
  conflictingRev: string;
  winningDoc?: ConflictDoc;
  conflictingDoc?: ConflictDoc;
  detectedAt?: string;
}

export interface ConflictManifestSource {
  host?: string;
  database?: string;
}

export interface ConflictManifestOptions {
  generatedAt?: string;
  source?: ConflictManifestSource;
  /** All documents known to the caller, used only for dependency warnings. */
  allDocs?: ConflictDoc[];
}

export interface ConflictFieldDifference {
  field: string;
  winning: unknown;
  conflicting: Array<{ revision: string; value: unknown }>;
}

export interface ConflictManifestDocument {
  docId: string;
  docType: string;
  entityId: string;
  label: string | null;
  winningRev: string;
  conflictRevisions: number;
  updatedAt: string | null;
  winningHash: string;
  conflictingHashes: Array<{ revision: string; hash: string }>;
  fieldDiff: ConflictFieldDifference[];
  dependencyWarnings: string[];
  redactedFields: string[];
}

export interface ConflictManifest {
  schemaVersion: 1;
  readOnly: true;
  generatedAt: string;
  source: ConflictManifestSource;
  counts: {
    documents: number;
    conflictRevisions: number;
    byType: Record<string, number>;
  };
  dependencyOrder: string[];
  documents: ConflictManifestDocument[];
  warnings: string[];
}

export interface ConflictBackupRevision {
  revision: string;
  hash: string;
  doc: ConflictDoc;
}

export interface ConflictBackupDocument {
  docId: string;
  docType: string;
  entityId: string;
  label: string | null;
  winningRev: string;
  winningHash: string;
  winningDoc: ConflictDoc;
  conflicting: ConflictBackupRevision[];
  contentHash: string;
  sensitiveFields: string[];
}

export interface ConflictBackup {
  schemaVersion: 1;
  readOnly: true;
  generatedAt: string;
  source: ConflictManifestSource;
  counts: {
    documents: number;
    conflictRevisions: number;
    byType: Record<string, number>;
  };
  documents: ConflictBackupDocument[];
  integrity: {
    algorithm: 'sha256';
    rootHash: string;
    documentHashes: Record<string, string>;
  };
}

export interface ConflictBackupVerification {
  valid: boolean;
  errors: string[];
  counts: {
    documents: number;
    conflictRevisions: number;
  };
}

const IGNORED_DIFF_FIELDS = new Set([
  '_id',
  '_rev',
  '_conflicts',
  '_revisions',
  '_revs_info',
  '_attachments',
  '_unavailable',
]);

const SENSITIVE_KEY_PATTERN =
  /(^|_)(pass(word)?|secret|token|authorization|api_?key|sync_?remote_?url|credentials?)(_|$)/i;

const EXTRA_SENSITIVE_KEY_PATTERN = /password|secret|token|authorization|apiKey|syncRemoteUrl|credential/i;

const DEPENDENCY_ORDER = [
  'company',
  'settings',
  'item',
  'inventory_item',
  'party_group',
  'party_category',
  'party',
  'invoice',
  'purchase',
  'voucher',
  'expense',
  'bank_account',
  'cash_bank_txn',
  'loan',
  'loan_txn',
  'tombstone',
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) || EXTRA_SENSITIVE_KEY_PATTERN.test(key);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  return value;
}

/** Deterministic JSON used for hashes and integrity checks. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'null';
}

/** Hash a document or any JSON value with the app's zero-dependency SHA-256. */
export function hashConflictValue(value: unknown): string {
  return sha256Sync(stableStringify(value));
}

/** Strip credentials from a CouchDB URL before it reaches a manifest. */
export function sanitizeConflictSource(rawUrl: string): ConflictManifestSource {
  try {
    const parsed = new URL(rawUrl);
    return {
      host: parsed.host,
      database: decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, '')),
    };
  } catch {
    return { host: 'unknown', database: 'unknown' };
  }
}

/** Recursively replace credential-like values for shareable manifests. */
export function redactSensitiveValues<T>(
  value: T,
  path = ''
): { value: T; redactedFields: string[] } {
  const redactedFields: string[] = [];

  const walk = (input: unknown, currentPath: string): unknown => {
    if (Array.isArray(input)) {
      return input.map((entry, index) => walk(entry, `${currentPath}[${index}]`));
    }
    if (input && typeof input === 'object') {
      const source = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(source)) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        if (isSensitiveKey(key)) {
          out[key] = '[REDACTED]';
          redactedFields.push(nextPath);
        } else {
          out[key] = walk(source[key], nextPath);
        }
      }
      return out;
    }
    return input;
  };

  return { value: walk(value, path) as T, redactedFields };
}

/** Find sensitive field paths without changing the backup payload. */
export function findSensitiveFields(value: unknown, path = ''): string[] {
  const matches: string[] = [];
  const walk = (input: unknown, currentPath: string): void => {
    if (Array.isArray(input)) {
      input.forEach((entry, index) => walk(entry, `${currentPath}[${index}]`));
      return;
    }
    if (!input || typeof input !== 'object') return;
    for (const [key, child] of Object.entries(input as Record<string, unknown>)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      if (isSensitiveKey(key)) matches.push(nextPath);
      else walk(child, nextPath);
    }
  };
  walk(value, path);
  return matches;
}

export function getConflictDocType(doc: ConflictDoc | undefined, fallback = 'unknown'): string {
  if (!doc) return fallback;
  if (typeof doc.docType === 'string' && doc.docType.trim()) {
    return doc.docType.trim().toLowerCase();
  }
  if (typeof doc._id === 'string') {
    const colon = doc._id.indexOf(':');
    if (colon > 0) return doc._id.slice(0, colon).toLowerCase();
  }
  return fallback;
}

export function getConflictEntityId(doc: ConflictDoc | undefined, fallback = 'unknown'): string {
  if (!doc) return fallback;
  if (typeof doc._id === 'string') {
    const colon = doc._id.indexOf(':');
    if (colon >= 0 && colon < doc._id.length - 1) return doc._id.slice(colon + 1);
  }
  if (typeof doc.id === 'string' && doc.id.trim()) return doc.id;
  return fallback;
}

/** Human label used by the conflict queue and exported manifests. */
export function getConflictHumanLabel(doc: ConflictDoc | undefined): string | null {
  if (!doc) return null;
  const candidates = [
    doc.businessName,
    doc.tradeName,
    doc.name,
    doc.partyName,
    doc.supplierName,
    doc.invoiceNumber,
    doc.purchaseNumber,
    doc.voucherNumber,
    doc.title,
    doc.code,
    doc.sku,
    doc.hsnSacCode,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return null;
}

function getUpdatedAt(doc: ConflictDoc | undefined): string | null {
  if (!doc) return null;
  for (const key of ['updatedAt', 'syncedAt', 'createdAt', 'date']) {
    const value = doc[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function sortKeyForDocType(docType: string): number {
  const index = DEPENDENCY_ORDER.indexOf(docType);
  return index === -1 ? DEPENDENCY_ORDER.length : index;
}

function groupConflicts(
  conflicts: ConflictQueueItemLike[]
): Map<string, ConflictQueueItemLike[]> {
  const groups = new Map<string, ConflictQueueItemLike[]>();
  for (const conflict of conflicts) {
    if (!conflict?.docId) continue;
    const list = groups.get(conflict.docId) || [];
    list.push(conflict);
    groups.set(conflict.docId, list);
  }
  return groups;
}

interface ReferenceIndex {
  party: Map<string, Set<string>>;
  item: Map<string, Set<string>>;
}

function addReference(index: Map<string, Set<string>>, key: string, docId: string): void {
  const clean = key.trim();
  if (!clean) return;
  const refs = index.get(clean) || new Set<string>();
  refs.add(docId);
  index.set(clean, refs);
}

function buildReferenceIndex(allDocs: ConflictDoc[]): ReferenceIndex {
  const party = new Map<string, Set<string>>();
  const item = new Map<string, Set<string>>();

  for (const doc of allDocs) {
    if (!doc || typeof doc !== 'object') continue;
    const type = getConflictDocType(doc);
    const docId = typeof doc._id === 'string' ? doc._id : String(doc.id || 'unknown');

    if (type === 'invoice' || type === 'purchase') {
      const partyKey = doc.partyId || doc.supplierId || doc.partyName || doc.supplierName;
      if (typeof partyKey === 'string' && partyKey.trim()) {
        addReference(party, partyKey, docId);
      }
      const lines = doc.items || doc.lineItems || doc.lines;
      if (Array.isArray(lines)) {
        for (const line of lines) {
          if (!line || typeof line !== 'object') continue;
          const candidate =
            (line as Record<string, unknown>).itemId ||
            (line as Record<string, unknown>).item_id ||
            (line as Record<string, unknown>).id;
          if (typeof candidate === 'string' && candidate.trim()) {
            addReference(item, candidate, docId);
          }
        }
      }
    }

    if (type === 'voucher') {
      const entries = doc.entries;
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (!entry || typeof entry !== 'object') continue;
          const account =
            (entry as Record<string, unknown>).accountId ||
            (entry as Record<string, unknown>).partyId ||
            (entry as Record<string, unknown>).accountName;
          if (typeof account === 'string' && account.trim()) {
            addReference(party, account, docId);
          }
        }
      }
    }
  }

  return { party, item };
}

function getReferenceDocs(
  index: Map<string, Set<string>>,
  candidates: Array<unknown>
): Set<string> {
  const refs = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    for (const docId of index.get(candidate) || []) refs.add(docId);
  }
  return refs;
}

function buildDependencyWarnings(
  docType: string,
  docs: ConflictDoc[],
  referenceIndex: ReferenceIndex
): string[] {
  const warnings: string[] = [];
  const primary = docs[0];
  const candidates = [
    primary?.id,
    primary?._id ? getConflictEntityId(primary) : undefined,
    primary?.name,
    primary?.partyName,
    primary?.supplierName,
    primary?.sku,
    primary?.code,
  ];

  if (docType === 'party' || docType === 'party_group' || docType === 'party_category') {
    const refs = getReferenceDocs(referenceIndex.party, candidates);
    if (refs.size > 0) {
      warnings.push(
        `Referenced by ${refs.size} financial document${refs.size === 1 ? '' : 's'}; review party balances and passbook entries before resolving.`
      );
    }
  }

  if (docType === 'item' || docType === 'inventory_item') {
    const refs = getReferenceDocs(referenceIndex.item, candidates);
    if (refs.size > 0) {
      warnings.push(
        `Referenced by ${refs.size} invoice/purchase document${refs.size === 1 ? '' : 's'}; review stock movements and line-item snapshots before resolving.`
      );
    }
  }

  if (docType === 'company' || docType === 'settings') {
    warnings.push('Company/settings changes can affect invoice numbering, GST defaults, and receipt titles.');
  }

  if (
    ['invoice', 'purchase', 'voucher', 'expense', 'bank_account', 'cash_bank_txn'].includes(
      docType
    )
  ) {
    warnings.push('Financial document branch: review linked ledger vouchers, party dues, and stock postings before resolving.');
  }

  if (docs.some((doc) => doc._deleted === true)) {
    warnings.push('One branch is a deletion; verify tombstone semantics to prevent resurrection after sync.');
  }

  if (docs.some((doc) => doc._attachments && Object.keys(doc._attachments).length > 0)) {
    warnings.push('Attachment branches differ; attachments are not merged automatically.');
  }

  return warnings;
}

function countByType(documents: ConflictManifestDocument[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const doc of documents) {
    counts[doc.docType] = (counts[doc.docType] || 0) + 1;
  }
  return counts;
}

function buildFieldDiff(
  winningDoc: ConflictDoc,
  conflictingDocs: ConflictDoc[],
  redactedWinning: ConflictDoc,
  redactedConflicts: ConflictDoc[]
): ConflictFieldDifference[] {
  const fields = new Set<string>();
  for (const doc of [winningDoc, ...conflictingDocs]) {
    for (const key of Object.keys(doc || {})) {
      if (!IGNORED_DIFF_FIELDS.has(key)) fields.add(key);
    }
  }

  return [...fields]
    .sort()
    .filter((field) => {
      const base = stableStringify(winningDoc[field] ?? null);
      return conflictingDocs.some(
        (doc) => stableStringify(doc[field] ?? null) !== base
      );
    })
    .map((field) => ({
      field,
      winning: redactedWinning[field] ?? null,
      conflicting: redactedConflicts.map((doc, index) => ({
        revision: conflictingDocs[index]?._rev || `conflict-${index + 1}`,
        value: doc[field] ?? null,
      })),
    }));
}

/** Build a shareable, credential-free conflict review manifest. */
export function buildConflictManifest(
  conflicts: ConflictQueueItemLike[],
  options: ConflictManifestOptions = {}
): ConflictManifest {
  const groups = groupConflicts(conflicts);
  const referenceIndex = buildReferenceIndex(options.allDocs || []);
  const warnings: string[] = [];

  if (!options.allDocs) {
    warnings.push(
      'Dependency counts are limited to the supplied conflict documents because no full document set was provided.'
    );
  }

  const documents: ConflictManifestDocument[] = [];
  let hasUnavailableRevision = false;

  for (const [docId, group] of groups.entries()) {
    const first = group[0];
    const winningDoc = (first.winningDoc || {}) as ConflictDoc;
    const conflictingDocs = group
      .map((item) => (item.conflictingDoc || {}) as ConflictDoc)
      .sort((a, b) => String(a._rev || '').localeCompare(String(b._rev || '')));

    if (isUnavailableDoc(winningDoc) || conflictingDocs.some((doc) => isUnavailableDoc(doc))) {
      hasUnavailableRevision = true;
    }

    const docType = getConflictDocType(winningDoc, first.docType || 'unknown');
    const entityId = first.entityId || getConflictEntityId(winningDoc, docId);
    const label = getConflictHumanLabel(winningDoc) || getConflictHumanLabel(conflictingDocs[0]);
    const redactedWinningResult = redactSensitiveValues(winningDoc);
    const redactedConflicts = conflictingDocs.map((doc) => redactSensitiveValues(doc));
    const redactedFields = new Set(redactedWinningResult.redactedFields);
    for (const result of redactedConflicts) {
      for (const field of result.redactedFields) redactedFields.add(field);
    }

    documents.push({
      docId,
      docType,
      entityId,
      label,
      winningRev: first.winningRev || winningDoc._rev || 'unknown',
      conflictRevisions: conflictingDocs.length,
      updatedAt: getUpdatedAt(winningDoc),
      winningHash: hashConflictValue(winningDoc),
      conflictingHashes: conflictingDocs.map((doc, index) => ({
        revision: doc._rev || group[index]?.conflictingRev || `conflict-${index + 1}`,
        hash: hashConflictValue(doc),
      })),
      fieldDiff: buildFieldDiff(
        winningDoc,
        conflictingDocs,
        redactedWinningResult.value,
        redactedConflicts.map((result) => result.value)
      ),
      dependencyWarnings: buildDependencyWarnings(
        docType,
        [winningDoc, ...conflictingDocs],
        referenceIndex
      ),
      redactedFields: [...redactedFields].sort(),
    });
  }

  documents.sort((a, b) => {
    const order = sortKeyForDocType(a.docType) - sortKeyForDocType(b.docType);
    return order !== 0 ? order : a.docId.localeCompare(b.docId);
  });

  if (hasUnavailableRevision) {
    warnings.push(
      'One or more conflict revisions could not be fetched; this manifest and its backup are incomplete. Recover the missing revisions before resolving or restoring anything.'
    );
  }

  const counts = {
    documents: documents.length,
    conflictRevisions: documents.reduce((sum, doc) => sum + doc.conflictRevisions, 0),
    byType: countByType(documents),
  };

  return {
    schemaVersion: 1,
    readOnly: true,
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: options.source || {},
    counts,
    dependencyOrder: DEPENDENCY_ORDER,
    documents,
    warnings,
  };
}

/** Build a full-body backup of every winning and conflicting revision. */
export function buildConflictBackup(
  conflicts: ConflictQueueItemLike[],
  options: ConflictManifestOptions = {}
): ConflictBackup {
  const groups = groupConflicts(conflicts);
  const documents: ConflictBackupDocument[] = [];

  for (const [docId, group] of groups.entries()) {
    const first = group[0];
    const winningDoc = (first.winningDoc || {}) as ConflictDoc;
    const conflictingDocs = group
      .map((item) => (item.conflictingDoc || {}) as ConflictDoc)
      .sort((a, b) => String(a._rev || '').localeCompare(String(b._rev || '')));

    const conflicting = conflictingDocs.map((doc, index) => ({
      revision: doc._rev || group[index]?.conflictingRev || `conflict-${index + 1}`,
      hash: hashConflictValue(doc),
      doc,
    }));

    const contentHash = hashConflictValue({
      winningDoc,
      conflictingDocs,
    });

    documents.push({
      docId,
      docType: getConflictDocType(winningDoc, first.docType || 'unknown'),
      entityId: first.entityId || getConflictEntityId(winningDoc, docId),
      label: getConflictHumanLabel(winningDoc) || getConflictHumanLabel(conflictingDocs[0]),
      winningRev: first.winningRev || winningDoc._rev || 'unknown',
      winningHash: hashConflictValue(winningDoc),
      winningDoc,
      conflicting,
      contentHash,
      sensitiveFields: [
        ...new Set([
          ...findSensitiveFields(winningDoc),
          ...conflictingDocs.flatMap((doc) => findSensitiveFields(doc)),
        ]),
      ].sort(),
    });
  }

  documents.sort((a, b) => {
    const order = sortKeyForDocType(a.docType) - sortKeyForDocType(b.docType);
    return order !== 0 ? order : a.docId.localeCompare(b.docId);
  });

  const documentHashes: Record<string, string> = {};
  for (const doc of documents) documentHashes[doc.docId] = doc.contentHash;

  const rootHash = hashConflictValue(
    documents.map((doc) => ({ docId: doc.docId, contentHash: doc.contentHash }))
  );

  return {
    schemaVersion: 1,
    readOnly: true,
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: options.source || {},
    counts: {
      documents: documents.length,
      conflictRevisions: documents.reduce(
        (sum, doc) => sum + doc.conflicting.length,
        0
      ),
      byType: documents.reduce<Record<string, number>>((acc, doc) => {
        acc[doc.docType] = (acc[doc.docType] || 0) + 1;
        return acc;
      }, {}),
    },
    documents,
    integrity: {
      algorithm: 'sha256',
      rootHash,
      documentHashes,
    },
  };
}

/** Verify a conflict backup after a round-trip through disk/storage. */
export function verifyConflictBackup(backup: ConflictBackup): ConflictBackupVerification {
  const errors: string[] = [];

  if (!backup || backup.schemaVersion !== 1) {
    errors.push('Unsupported or missing backup schemaVersion.');
  }
  if (backup?.readOnly !== true) {
    errors.push('Backup is not marked read-only.');
  }
  if (!Array.isArray(backup?.documents)) {
    errors.push('Backup documents array is missing.');
  }

  const documents = Array.isArray(backup?.documents) ? backup.documents : [];
  const revisionCount = documents.reduce(
    (sum, doc) => sum + (Array.isArray(doc.conflicting) ? doc.conflicting.length : 0),
    0
  );

  if (backup?.counts?.documents !== documents.length) {
    errors.push(
      `Document count mismatch: header=${backup?.counts?.documents}, actual=${documents.length}.`
    );
  }
  if (backup?.counts?.conflictRevisions !== revisionCount) {
    errors.push(
      `Conflict revision count mismatch: header=${backup?.counts?.conflictRevisions}, actual=${revisionCount}.`
    );
  }

  const seen = new Set<string>();
  const recomputedHashes: Record<string, string> = {};

  for (const doc of documents) {
    if (!doc?.docId) {
      errors.push('Backup contains a document without docId.');
      continue;
    }
    if (seen.has(doc.docId)) {
      errors.push(`Duplicate document in backup: ${doc.docId}.`);
    }
    seen.add(doc.docId);

    if (isUnavailableDoc(doc.winningDoc)) {
      errors.push(`Winning revision unavailable for ${doc.docId}.`);
    }

    const winningHash = hashConflictValue(doc.winningDoc);
    if (winningHash !== doc.winningHash) {
      errors.push(`Winning revision hash mismatch for ${doc.docId}.`);
    }

    for (const conflict of doc.conflicting || []) {
      if (isUnavailableDoc(conflict.doc)) {
        errors.push(
          `Conflicting revision unavailable for ${doc.docId} at ${conflict.revision}.`
        );
      }
      if (hashConflictValue(conflict.doc) !== conflict.hash) {
        errors.push(
          `Conflicting revision hash mismatch for ${doc.docId} at ${conflict.revision}.`
        );
      }
    }

    const contentHash = hashConflictValue({
      winningDoc: doc.winningDoc,
      conflictingDocs: (doc.conflicting || []).map((entry) => entry.doc),
    });
    if (contentHash !== doc.contentHash) {
      errors.push(`Content hash mismatch for ${doc.docId}.`);
    }
    recomputedHashes[doc.docId] = contentHash;
  }

  for (const [docId, hash] of Object.entries(backup?.integrity?.documentHashes || {})) {
    if (recomputedHashes[docId] !== hash) {
      errors.push(`Document hash index mismatch for ${docId}.`);
    }
  }

  const expectedRoot = hashConflictValue(
    documents.map((doc) => ({ docId: doc.docId, contentHash: recomputedHashes[doc.docId] }))
  );
  if (expectedRoot !== backup?.integrity?.rootHash) {
    errors.push('Backup root hash mismatch.');
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      documents: documents.length,
      conflictRevisions: revisionCount,
    },
  };
}

/** Detect the CLI's placeholder for a conflict revision that could not be fetched. */
function isUnavailableDoc(doc: ConflictDoc | undefined): boolean {
  return typeof doc?._unavailable === 'string' && doc._unavailable.trim().length > 0;
}

/** Human-readable summary with no document bodies or credentials. */
export function formatConflictManifestSummary(manifest: ConflictManifest): string {
  const lines: string[] = [
    `CONFLICT MANIFEST (READ-ONLY)`,
    `Generated: ${manifest.generatedAt}`,
    `Source: ${manifest.source.host || 'unknown'}${manifest.source.database ? ` / ${manifest.source.database}` : ''}`,
    `Documents: ${manifest.counts.documents}`,
    `Conflict revisions: ${manifest.counts.conflictRevisions}`,
    `By type: ${Object.entries(manifest.counts.byType)
      .map(([type, count]) => `${type}=${count}`)
      .join(', ') || 'none'}`,
  ];

  if (manifest.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of manifest.warnings) lines.push(`- ${warning}`);
  }

  lines.push('Documents:');
  for (const doc of manifest.documents) {
    lines.push(
      `- [${doc.docType}] ${doc.entityId}${doc.label ? ` (${doc.label})` : ''}: ${doc.conflictRevisions} conflict revision${doc.conflictRevisions === 1 ? '' : 's'}`
    );
    for (const warning of doc.dependencyWarnings) lines.push(`  ! ${warning}`);
  }

  return lines.join('\n');
}
