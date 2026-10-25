import { describe, expect, it } from 'vitest';
import {
  computeConflictDiff,
  formatFieldValue,
  isHighRiskConflict,
  isSensitiveKey,
  redactConflictValue,
} from '../services/conflictDiff.ts';

describe('conflict diff helpers', () => {
  it('recursively redacts sensitive values in nested objects and arrays', () => {
    const redacted = redactConflictValue({
      name: 'Production',
      password: 'secret-password-value',
      nested: {
        apiKey: 'secret-api-key-value',
        token: 'secret-token-value',
        label: 'visible-label',
      },
      entries: [
        {
          authorization: 'Bearer secret-authorization-value',
          value: 7,
        },
      ],
      userCredential: {
        token: 'secret-credential-token',
      },
    });

    expect(redacted).toEqual({
      name: 'Production',
      password: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        token: '[REDACTED]',
        label: 'visible-label',
      },
      entries: [
        {
          authorization: '[REDACTED]',
          value: 7,
        },
      ],
      userCredential: '[REDACTED]',
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('secret-password-value');
    expect(serialized).not.toContain('secret-api-key-value');
    expect(serialized).not.toContain('secret-token-value');
    expect(serialized).not.toContain('secret-authorization-value');
    expect(serialized).not.toContain('secret-credential-token');
    expect(serialized).toContain('visible-label');
  });

  it('detects sensitive field names case-insensitively', () => {
    expect(isSensitiveKey('syncRemoteUrl')).toBe(true);
    expect(isSensitiveKey('user_credential')).toBe(true);
    expect(isSensitiveKey('API_KEY')).toBe(true);
    expect(isSensitiveKey('companyName')).toBe(false);
  });

  it('compares values structurally and ignores revision metadata', () => {
    const result = computeConflictDiff(
      {
        _id: 'invoice:INV-1',
        _rev: '1-a',
        _conflicts: ['2-b'],
        status: 'PAID',
        nested: { a: 1, b: 2 },
        notes: '',
        partyName: 'Original',
      },
      {
        _id: 'invoice:INV-1',
        _rev: '2-b',
        status: 'PAID',
        nested: { b: 2, a: 1 },
        notes: 'Updated note',
        partyName: 'Original',
      }
    );

    expect(result.isAvailable).toBe(true);
    expect(result.hasDifferences).toBe(true);
    expect(result.differences.map((entry) => entry.field)).toEqual(['notes']);
    expect(result.differences[0].winningFormatted).toBe('(empty)');
    expect(result.differences[0].conflictingFormatted).toBe('Updated note');
  });

  it('reports metadata-only and unavailable revisions explicitly', () => {
    const metadataOnly = computeConflictDiff(
      { _id: 'item:1', _rev: '1-a', name: 'Rice' },
      { _id: 'item:1', _rev: '2-b', name: 'Rice' }
    );
    expect(metadataOnly.isAvailable).toBe(true);
    expect(metadataOnly.hasDifferences).toBe(false);

    const unavailableWinner = computeConflictDiff(null, { name: 'Rice' });
    expect(unavailableWinner.isAvailable).toBe(false);
    expect(unavailableWinner.unavailableReason).toContain('Version A');

    const unavailableBoth = computeConflictDiff(
      { _unavailable: true },
      { _unavailable: true }
    );
    expect(unavailableBoth.isAvailable).toBe(false);
    expect(unavailableBoth.unavailableReason).toContain('Both');
  });

  it('formats and truncates values without leaking nested secrets', () => {
    expect(formatFieldValue(undefined, false, 'notes')).toBe('Not present');
    expect(formatFieldValue('', true, 'notes')).toBe('(empty)');
    expect(formatFieldValue('x'.repeat(1300), true, 'notes')).toContain(
      '... [truncated]'
    );

    const objectValue = formatFieldValue(
      { label: 'Visible', apiKey: 'secret-nested-api-key' },
      true,
      'connector'
    );
    expect(objectValue).toContain('Visible');
    expect(objectValue).toContain('[REDACTED]');
    expect(objectValue).not.toContain('secret-nested-api-key');

    const longObject = formatFieldValue(
      { text: 'y'.repeat(1500) },
      true,
      'payload'
    );
    expect(longObject).toContain('... [truncated]');
  });

  it('flags company, settings, party, financial, and deletion conflicts as high risk', () => {
    for (const docType of [
      'company',
      'settings',
      'party',
      'item',
      'invoice',
      'purchase',
      'voucher',
      'expense',
      'bank_account',
      'cash_bank_txn',
      'loan',
      'loan_txn',
      'tombstone',
    ]) {
      expect(isHighRiskConflict({ docType })).toBe(true);
    }

    expect(isHighRiskConflict({ docType: 'unknown' })).toBe(false);
    expect(
      isHighRiskConflict({
        docType: 'unknown',
        winningDoc: { _deleted: true },
      })
    ).toBe(true);
  });
});
