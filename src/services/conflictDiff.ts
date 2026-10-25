/**
 * Conflict Diff Engine & Pure Field Comparison Helpers
 * 
 * Provides pure, zero-dependency helpers for:
 * 1. Deep sensitive data redaction (passwords, tokens, API keys, sync URLs, credentials).
 * 2. Field-level conflict diffing between winning (Version A) and conflicting (Version B) revision payloads.
 * 3. Human-readable value formatting and truncation for manual conflict inspection UI.
 */

export const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'secret',
  'token',
  'authorization',
  'apikey',
  'syncremoteurl',
  'credential',
];

export const IGNORED_DIFF_FIELDS = new Set([
  '_id',
  '_rev',
  '_conflicts',
  '_revisions',
  '_revs_info',
  '_attachments',
  '_unavailable',
]);

// Values are normalized by removing '-' and '_' before lookup.
export const HIGH_RISK_DOC_TYPES = new Set([
  'company',
  'companysettings',
  'companyprofile',
  'settings',
  'party',
  'customer',
  'supplier',
  'item',
  'inventory',
  'inventoryitem',
  'invoice',
  'purchase',
  'voucher',
  'expense',
  'bankaccount',
  'cashbanktxn',
  'loan',
  'loantxn',
  'tombstone',
]);

/**
 * Checks whether a given property or key name represents sensitive information.
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_KEY_SUBSTRINGS.some((sensitive) =>
    normalized.includes(sensitive.toLowerCase().replace(/[-_]/g, ''))
  );
}

/**
 * Recursively redacts sensitive keys in objects or arrays.
 * Sensitive keys are replaced with '[REDACTED]'.
 */
export function redactConflictValue(value: any, keyName?: string): any {
  if (keyName && isSensitiveKey(keyName)) {
    return '[REDACTED]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactConflictValue(item));
  }
  if (typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSensitiveKey(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactConflictValue(v, k);
      }
    }
    return result;
  }
  return value;
}

/**
 * Checks whether a document payload is available for comparison.
 */
export function isRevisionBodyAvailable(doc: any): boolean {
  if (!doc || typeof doc !== 'object') {
    return false;
  }
  if (doc._unavailable === true) {
    return false;
  }
  return true;
}

/**
 * Checks whether a conflict belongs to a high-risk entity type.
 */
export function isHighRiskConflict(conflict: {
  docType?: string;
  winningDoc?: any;
  conflictingDoc?: any;
}): boolean {
  const type = (conflict.docType || '').toLowerCase().replace(/[-_]/g, '');
  if (HIGH_RISK_DOC_TYPES.has(type)) return true;
  if (type.includes('invoice') || type.includes('purchase') || type.includes('voucher') || type.includes('party')) {
    return true;
  }
  if (conflict.winningDoc?._deleted || conflict.conflictingDoc?._deleted) {
    return true;
  }
  return false;
}

/**
 * Canonical JSON stringification to compare objects regardless of key order.
 */
function canonicalStringify(val: any): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(val[k])).join(',') + '}';
}

/**
 * Deep equality check between two arbitrary values.
 */
export function areValuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  return canonicalStringify(a) === canonicalStringify(b);
}

const MAX_PREVIEW_CHARS = 1200;

/**
 * Formats a single field value for UI comparison display.
 */
export function formatFieldValue(val: any, hasValue: boolean, fieldName: string): string {
  if (!hasValue || val === undefined) {
    return 'Not present';
  }

  if (isSensitiveKey(fieldName)) {
    return '[REDACTED]';
  }

  if (val === null) {
    return 'null';
  }

  if (typeof val === 'string') {
    if (val === '') {
      return '(empty)';
    }
    if (val.length > MAX_PREVIEW_CHARS) {
      return val.slice(0, MAX_PREVIEW_CHARS) + '... [truncated]';
    }
    return val;
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }

  if (typeof val === 'object') {
    const redacted = redactConflictValue(val, fieldName);
    try {
      const pretty = JSON.stringify(redacted, null, 2);
      if (pretty.length > MAX_PREVIEW_CHARS) {
        return pretty.slice(0, MAX_PREVIEW_CHARS) + '\n... [truncated]';
      }
      return pretty;
    } catch {
      return String(redacted);
    }
  }

  return String(val);
}

export interface ConflictFieldDiff {
  field: string;
  hasWinning: boolean;
  hasConflicting: boolean;
  winningValue: any;
  conflictingValue: any;
  winningFormatted: string;
  conflictingFormatted: string;
  isWinningObject: boolean;
  isConflictingObject: boolean;
}

export interface ConflictDiffResult {
  isAvailable: boolean;
  unavailableReason?: string;
  differences: ConflictFieldDiff[];
  hasDifferences: boolean;
}

/**
 * Compares two revision document bodies, ignoring revision metadata fields.
 */
export function computeConflictDiff(winningDoc: any, conflictingDoc: any): ConflictDiffResult {
  const winningAvailable = isRevisionBodyAvailable(winningDoc);
  const conflictingAvailable = isRevisionBodyAvailable(conflictingDoc);

  if (!winningAvailable || !conflictingAvailable) {
    return {
      isAvailable: false,
      unavailableReason:
        !winningAvailable && !conflictingAvailable
          ? 'Both revision payloads are unavailable.'
          : !winningAvailable
          ? 'Version A (winning) revision payload is unavailable.'
          : 'Version B (conflicting) revision payload is unavailable.',
      differences: [],
      hasDifferences: false,
    };
  }

  const allKeys = Array.from(
    new Set([...Object.keys(winningDoc), ...Object.keys(conflictingDoc)])
  )
    .filter((k) => !IGNORED_DIFF_FIELDS.has(k))
    .sort();

  const differences: ConflictFieldDiff[] = [];

  for (const field of allKeys) {
    const hasWinning = Object.prototype.hasOwnProperty.call(winningDoc, field);
    const hasConflicting = Object.prototype.hasOwnProperty.call(conflictingDoc, field);
    const valA = winningDoc[field];
    const valB = conflictingDoc[field];

    if (hasWinning && hasConflicting && areValuesEqual(valA, valB)) {
      continue;
    }

    const isWinningObj = hasWinning && valA !== null && typeof valA === 'object';
    const isConflictingObj = hasConflicting && valB !== null && typeof valB === 'object';

    const winningFormatted = formatFieldValue(valA, hasWinning, field);
    const conflictingFormatted = formatFieldValue(valB, hasConflicting, field);

    differences.push({
      field,
      hasWinning,
      hasConflicting,
      winningValue: valA,
      conflictingValue: valB,
      winningFormatted,
      conflictingFormatted,
      isWinningObject: isWinningObj,
      isConflictingObject: isConflictingObj,
    });
  }

  return {
    isAvailable: true,
    differences,
    hasDifferences: differences.length > 0,
  };
}
