/**
 * MCA-Compliant Immutable Audit Trail Service (Rule 3(1) Companies Rules, 2014)
 *
 * Implements an append-only, tamper-evident audit logging system:
 * - Deterministic RFC 8785 canonical JSON serialization
 * - SHA-256 cryptographic hash chaining with 64-zero genesis anchor
 * - FIFO Promise mutex queue for race-condition-free concurrent mutations
 * - Dual-tier storage (PouchDB doc type 'audit_log' + localStorage cache 'gst_audit_logs')
 * - 3-stage chain integrity validation (sequence contiguity, hash link, payload parity)
 * - Strict immutability protection (rejects/throws on any update or deletion attempt)
 */

import { pouch } from './pouchdb.ts';
import { rbac, UserRole } from './rbac.ts';

export type AuditActionType =
  | 'INVOICE_CREATE'
  | 'INVOICE_UPDATE'
  | 'INVOICE_DELETE'
  | 'INVOICE_CANCEL'
  | 'PURCHASE_CREATE'
  | 'PURCHASE_UPDATE'
  | 'PURCHASE_DELETE'
  | 'PAYMENT_RECORD'
  | 'STOCK_ADJUSTMENT'
  | 'VOUCHER_CREATE'
  | 'VOUCHER_DELETE'
  | 'SETTINGS_UPDATE';

export type AuditDocumentType =
  | 'INVOICE'
  | 'PURCHASE'
  | 'PAYMENT'
  | 'ITEM'
  | 'VOUCHER'
  | 'SETTINGS';

export interface AuditRecord {
  id: string; // "audit_" + timestamp + "_" + randomHex
  sequence: number; // sequential increment (1, 2, 3...)
  timestamp: string; // ISO 8601 UTC
  userId: string;
  userName: string;
  userRole: UserRole;
  actionType: AuditActionType;
  documentId: string;
  documentType: AuditDocumentType;
  previousSnapshot?: Record<string, any>;
  newSnapshot?: Record<string, any>;
  summary: string;
  previousHash: string; // 64-char lowercase hex SHA-256 of previous record
  recordHash: string; // 64-char lowercase hex SHA-256 of preimage
}

export interface AuditVerificationResult {
  valid: boolean;
  totalRecords: number;
  corruptedRecordId?: string;
  brokenSequence?: number;
  expectedHash?: string;
  actualHash?: string;
  reason?: string;
}

export interface AuditTrailFilter {
  startDate?: string;
  endDate?: string;
  userId?: string;
  actionType?: AuditActionType;
  documentId?: string;
  documentType?: AuditDocumentType;
  searchTerm?: string;
  sortDirection?: 'asc' | 'desc';
}

export const GENESIS_PREVIOUS_HASH = '0'.repeat(64);
const STORAGE_KEY_AUDIT_LOGS = 'gst_audit_logs';

/**
 * Deterministic JSON serialization sorting object keys lexicographically
 * and standardizing null/undefined values.
 */
export function canonicalJson(val: any): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return JSON.stringify(val);
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    const items = val.map((item) => canonicalJson(item));
    return `[${items.join(',')}]`;
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val).sort();
    const pairs: string[] = [];
    for (const k of keys) {
      const v = val[k];
      if (v !== undefined) {
        pairs.push(`${JSON.stringify(k)}:${canonicalJson(v)}`);
      }
    }
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(val);
}

/**
 * Constructs the canonical preimage string:
 * previousHash|sequence|timestamp|userId|userName|userRole|actionType|documentId|documentType|canonicalJson(previousSnapshot)|canonicalJson(newSnapshot)|summary
 */
export function buildPreimage(record: {
  previousHash: string;
  sequence: number;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  actionType: string;
  documentId: string;
  documentType: string;
  previousSnapshot?: Record<string, any>;
  newSnapshot?: Record<string, any>;
  summary: string;
}): string {
  return [
    record.previousHash,
    String(record.sequence),
    record.timestamp,
    record.userId,
    record.userName,
    record.userRole,
    record.actionType,
    record.documentId,
    record.documentType,
    canonicalJson(record.previousSnapshot ?? null),
    canonicalJson(record.newSnapshot ?? null),
    record.summary,
  ].join('|');
}

/**
 * Compute SHA-256 digest returning a 64-character lowercase hex string.
 * Uses Web Crypto API (`crypto.subtle`) with Node.js crypto fallback.
 */
export async function computeSha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder().encode(data);
  if (globalThis.crypto?.subtle) {
    const buffer = await globalThis.crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for Node.js environments without global crypto.subtle
  const cryptoModule = await import('crypto');
  return cryptoModule.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes recordHash over the canonical record preimage.
 */
export async function computeRecordHash(record: {
  previousHash: string;
  sequence: number;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  actionType: string;
  documentId: string;
  documentType: string;
  previousSnapshot?: Record<string, any>;
  newSnapshot?: Record<string, any>;
  summary: string;
}): Promise<string> {
  const preimage = buildPreimage(record);
  return computeSha256Hex(preimage);
}

export type AuditLogInput = Omit<AuditRecord, 'id' | 'sequence' | 'previousHash' | 'recordHash' | 'timestamp'> & {
  timestamp?: string;
};

export class AuditTrailService {
  private records: AuditRecord[] = [];
  private loaded: boolean = false;
  private appendQueue: Promise<any> = Promise.resolve();

  constructor() {
    this.hydrateFromStorageSync();
  }

  /**
   * Synchronously reads Tier 1 localStorage cache if available
   */
  private hydrateFromStorageSync(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY_AUDIT_LOGS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.records = parsed.sort((a, b) => a.sequence - b.sequence);
            this.loaded = true;
          }
        }
      }
    } catch (e) {
      console.warn('AuditTrailService: Failed to parse sync cache', e);
    }
  }

  /**
   * Ensures storage is loaded and hydrated from Tier 1 (localStorage) or Tier 2 (PouchDB).
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded && this.records.length > 0) return;

    this.hydrateFromStorageSync();
    if (this.records.length > 0) {
      this.loaded = true;
      return;
    }

    try {
      const pouchDocs = await pouch.getAllDocs<AuditRecord>('audit_log');
      if (pouchDocs && pouchDocs.length > 0) {
        this.records = pouchDocs.sort((a, b) => a.sequence - b.sequence);
        this.syncToLocalStorage();
      }
    } catch (e) {
      // PouchDB unavailable or empty
    }
    this.loaded = true;
  }

  private syncToLocalStorage(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, JSON.stringify(this.records));
      } catch (e) {
        console.warn('AuditTrailService: localStorage write failed', e);
      }
    }
  }

  /**
   * Appends an event to the audit trail via serialized FIFO Promise mutex queue.
   */
  public async logEvent(
    entry: AuditLogInput
  ): Promise<AuditRecord> {
    const nextOp = this.appendQueue.then(async () => {
      await this.ensureLoaded();
      return this.internalAppendRecord(entry);
    });

    this.appendQueue = nextOp.catch((err) => {
      console.error('Audit trail queue execution error:', err);
    });

    return nextOp;
  }

  private async internalAppendRecord(
    entry: AuditLogInput
  ): Promise<AuditRecord> {
    const total = this.records.length;
    const lastRecord = total > 0 ? this.records[total - 1] : null;

    const sequence = lastRecord ? lastRecord.sequence + 1 : 1;
    const previousHash = lastRecord ? lastRecord.recordHash : GENESIS_PREVIOUS_HASH;
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const timestamp = entry.timestamp || new Date().toISOString();

    const recordData = {
      actionType: entry.actionType,
      documentId: entry.documentId,
      documentType: entry.documentType,
      newSnapshot: entry.newSnapshot,
      previousHash,
      previousSnapshot: entry.previousSnapshot,
      sequence,
      summary: entry.summary,
      timestamp,
      userId: entry.userId,
      userName: entry.userName,
      userRole: entry.userRole,
    };

    const recordHash = await computeRecordHash(recordData);

    const record: AuditRecord = {
      id,
      sequence,
      timestamp,
      userId: entry.userId,
      userName: entry.userName,
      userRole: entry.userRole,
      actionType: entry.actionType,
      documentId: entry.documentId,
      documentType: entry.documentType,
      previousSnapshot: entry.previousSnapshot,
      newSnapshot: entry.newSnapshot,
      summary: entry.summary,
      previousHash,
      recordHash,
    };

    this.records.push(record);
    this.syncToLocalStorage();

    // Persist to Tier 2 PouchDB doc asynchronously
    pouch.putDoc('audit_log', record).catch((err) => {
      console.error('AuditTrailService: PouchDB putDoc error:', err);
    });

    return { ...record };
  }

  /**
   * Retrieves audit records matching filter criteria.
   */
  public async getAuditTrail(filter?: AuditTrailFilter): Promise<AuditRecord[]> {
    await this.ensureLoaded();
    let result = [...this.records];

    if (filter) {
      if (filter.startDate) {
        const s = filter.startDate.trim();
        result = result.filter((r) => {
          if (s.length === 10) {
            return r.timestamp.slice(0, 10) >= s;
          }
          return r.timestamp >= s;
        });
      }
      if (filter.endDate) {
        const e = filter.endDate.trim();
        result = result.filter((r) => {
          if (e.length === 10) {
            return r.timestamp.slice(0, 10) <= e;
          }
          return r.timestamp <= e;
        });
      }
      if (filter.userId) {
        const u = filter.userId.trim();
        result = result.filter((r) => r.userId === u);
      }
      if (filter.actionType) {
        result = result.filter((r) => r.actionType === filter.actionType);
      }
      if (filter.documentId) {
        const docId = filter.documentId.trim().toLowerCase();
        result = result.filter((r) => r.documentId.toLowerCase().includes(docId));
      }
      if (filter.documentType) {
        result = result.filter((r) => r.documentType === filter.documentType);
      }
      if (filter.searchTerm) {
        const q = filter.searchTerm.trim().toLowerCase();
        result = result.filter(
          (r) =>
            r.documentId.toLowerCase().includes(q) ||
            r.summary.toLowerCase().includes(q) ||
            r.userName.toLowerCase().includes(q) ||
            r.actionType.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q)
        );
      }
      if (filter.sortDirection === 'desc') {
        result.sort((a, b) => b.sequence - a.sequence);
      } else {
        result.sort((a, b) => a.sequence - b.sequence);
      }
    } else {
      result.sort((a, b) => a.sequence - b.sequence);
    }

    // Return detached copies to preserve immutability
    return result.map((r) => ({ ...r }));
  }

  /**
   * Validates hash chain integrity through 3 sequential checks:
   * 1. Monotonic sequence contiguity (1, 2, 3...)
   * 2. Cryptographic hash linkage (previousHash matches predecessor recordHash)
   * 3. SHA-256 canonical preimage recomputation
   */
  public async verifyChainIntegrity(): Promise<AuditVerificationResult> {
    await this.ensureLoaded();
    const total = this.records.length;
    if (total === 0) {
      return { valid: true, totalRecords: 0 };
    }

    const sorted = [...this.records].sort((a, b) => a.sequence - b.sequence);
    let expectedPrevHash = GENESIS_PREVIOUS_HASH;

    for (let i = 0; i < sorted.length; i++) {
      const rec = sorted[i];
      const expectedSequence = i + 1;

      // 1. Sequence contiguity
      if (rec.sequence !== expectedSequence) {
        return {
          valid: false,
          totalRecords: total,
          corruptedRecordId: rec.id,
          brokenSequence: rec.sequence,
          reason: `Sequence break at position ${i + 1}: expected sequence ${expectedSequence}, but found ${rec.sequence}. Records may have been deleted, inserted, or reordered.`,
        };
      }

      // 2. Cryptographic previousHash link
      if (rec.previousHash !== expectedPrevHash) {
        return {
          valid: false,
          totalRecords: total,
          corruptedRecordId: rec.id,
          brokenSequence: rec.sequence,
          expectedHash: expectedPrevHash,
          actualHash: rec.previousHash,
          reason: `Broken cryptographic hash chain at record #${rec.sequence} (${rec.id}). Previous hash does not match predecessor record hash.`,
        };
      }

      // 3. Payload hash recomputation
      const recomputedHash = await computeRecordHash(rec);
      if (rec.recordHash !== recomputedHash) {
        return {
          valid: false,
          totalRecords: total,
          corruptedRecordId: rec.id,
          brokenSequence: rec.sequence,
          expectedHash: recomputedHash,
          actualHash: rec.recordHash,
          reason: `Corrupted payload at record #${rec.sequence} (${rec.id}). Stored hash does not match recomputed SHA-256 payload digest. Record data has been altered.`,
        };
      }

      expectedPrevHash = rec.recordHash;
    }

    return { valid: true, totalRecords: total };
  }

  public async getAuditRecordById(id: string): Promise<AuditRecord | null> {
    await this.ensureLoaded();
    const found = this.records.find((r) => r.id === id);
    return found ? { ...found } : null;
  }

  public async getAuditTrailForDocument(documentId: string): Promise<AuditRecord[]> {
    return this.getAuditTrail({ documentId });
  }

  /**
   * Waits for all pending asynchronous append operations to settle.
   */
  public async waitForIdle(): Promise<void> {
    await this.appendQueue;
  }

  /**
   * Exports full audit trail formatted as RFC 4180 CSV.
   */
  public async exportAuditTrailAsCsv(): Promise<string> {
    const records = await this.getAuditTrail();
    const headers = [
      'Sequence',
      'Timestamp',
      'User ID',
      'User Name',
      'User Role',
      'Action Type',
      'Document Type',
      'Document ID',
      'Summary',
      'Previous Hash',
      'Record Hash',
    ];

    const escapeCell = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = records.map((r) => [
      r.sequence,
      r.timestamp,
      escapeCell(r.userId),
      escapeCell(r.userName),
      escapeCell(r.userRole),
      escapeCell(r.actionType),
      escapeCell(r.documentType),
      escapeCell(r.documentId),
      escapeCell(r.summary),
      r.previousHash,
      r.recordHash,
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  }

  /**
   * Exports full audit trail formatted as JSON.
   */
  public async exportAuditTrailAsJson(): Promise<string> {
    const records = await this.getAuditTrail();
    return JSON.stringify(records, null, 2);
  }

  // --- Strict Statutory Immutability Protections ---
  public updateRecord(_id: string, _data: any): never {
    throw new Error('Audit record mutation rejected: Audit records are immutable under MCA Rule 3(1).');
  }

  public deleteRecord(_id: string): never {
    throw new Error('Audit record deletion rejected: Audit trail cannot be purged or deleted.');
  }

  public purge(): never {
    throw new Error('Audit record deletion rejected: Audit trail cannot be purged or deleted.');
  }

  public clear(): never {
    throw new Error('Audit record deletion rejected: Audit trail cannot be purged or deleted.');
  }

  // --- Test & Diagnostic Utilities ---
  public async reloadFromStorage(): Promise<void> {
    this.loaded = false;
    this.records = [];
    await this.ensureLoaded();
  }

  public async _resetForTesting(): Promise<void> {
    await this.waitForIdle();
    this.records = [];
    this.loaded = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_AUDIT_LOGS);
    }
  }

  public _setRecordsForTesting(records: AuditRecord[]): void {
    this.records = records.map((r) => ({ ...r }));
    this.syncToLocalStorage();
  }
}

export const auditTrail = new AuditTrailService();
