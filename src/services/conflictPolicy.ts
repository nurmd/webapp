/**
 * Conflict Resolution Policy — single source of truth.
 *
 * Conflicts are reviewed read-only and resolved manually, one document at a
 * time, from the Data & Sync queue. The application must never auto-resolve,
 * bulk-resolve, merge branches, or write directly to CouchDB from the review
 * UI. Production conflicts are resolved by the user, deliberately, per record.
 */

export type ConflictResolutionChoice = 'keep_winning' | 'keep_conflicting';

export const CONFLICT_POLICY = {
  mode: 'MANUAL_PER_DOCUMENT',
  allowAutoResolve: false,
  allowBulkResolve: false,
  allowMerge: false,
  allowDirectRemoteWrite: false,
} as const;

export type ConflictPolicyViolationCode =
  | 'INVALID_DOCUMENT_ID'
  | 'BULK_RESOLUTION_BLOCKED'
  | 'MERGE_BLOCKED'
  | 'UNSUPPORTED_CHOICE';

export class ConflictPolicyViolationError extends Error {
  public readonly code: ConflictPolicyViolationCode;

  constructor(code: ConflictPolicyViolationCode, message: string) {
    super(message);
    this.name = 'ConflictPolicyViolationError';
    this.code = code;
    Object.setPrototypeOf(this, ConflictPolicyViolationError.prototype);
  }
}

/**
 * Blocks anything other than a deliberate, single-document manual resolution.
 * Throws ConflictPolicyViolationError instead of silently ignoring the request.
 */
export function assertManualConflictResolution(
  docId: unknown,
  choice: unknown
): asserts choice is ConflictResolutionChoice {
  if (typeof docId !== 'string') {
    throw new ConflictPolicyViolationError(
      'INVALID_DOCUMENT_ID',
      'Conflict resolution requires a single document identifier.'
    );
  }

  const trimmed = docId.trim();
  if (!trimmed) {
    throw new ConflictPolicyViolationError(
      'INVALID_DOCUMENT_ID',
      'Conflict resolution requires a non-empty document identifier.'
    );
  }

  if (/[,;\r\n]/.test(trimmed)) {
    throw new ConflictPolicyViolationError(
      'BULK_RESOLUTION_BLOCKED',
      'Bulk conflict resolution is not permitted. Resolve one document at a time.'
    );
  }

  if (choice === 'merge') {
    throw new ConflictPolicyViolationError(
      'MERGE_BLOCKED',
      'Merging conflict branches is not permitted. Choose the winning or the conflicting revision.'
    );
  }

  if (choice !== 'keep_winning' && choice !== 'keep_conflicting') {
    throw new ConflictPolicyViolationError(
      'UNSUPPORTED_CHOICE',
      `Unsupported conflict resolution choice: ${String(choice)}.`
    );
  }
}
