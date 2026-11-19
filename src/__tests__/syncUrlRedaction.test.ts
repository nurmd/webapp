import { describe, it, expect } from 'vitest';
import { redactSyncUrl } from '../core/utils/syncUrl.ts';
import { buildSupportDiagnostics } from '../core/utils/supportDiagnostics.ts';

describe('Sync URL Redaction (4.13)', () => {
  it('1. URL without credentials passes through unchanged (aside from normalization)', () => {
    const plainHttp = 'http://localhost:5984/vyapar_fintech_store';
    expect(redactSyncUrl(plainHttp)).toBe('http://localhost:5984/vyapar_fintech_store');

    const plainHttps = 'https://couchdb.example.com/company_db';
    expect(redactSyncUrl(plainHttps)).toBe('https://couchdb.example.com/company_db');

    const rootUrl = 'https://couchdb.example.com:6984';
    expect(redactSyncUrl(rootUrl)).toBe('https://couchdb.example.com:6984/');
  });

  it('2. URL with user:pass@host -> ***:***@host (password never appears in output)', () => {
    const urlWithCreds = 'https://admin:superSecretPassword123@couchdb.example.com:5984/store_prod';
    const redacted = redactSyncUrl(urlWithCreds);

    expect(redacted).not.toContain('superSecretPassword123');
    expect(redacted).not.toContain('admin');
    expect(redacted).toBe('https://***:***@couchdb.example.com:5984/store_prod');
  });

  it('3. URL with only username -> username redacted', () => {
    const urlWithUserOnly = 'http://operator@couchdb.internal:5984/mydb';
    const redacted = redactSyncUrl(urlWithUserOnly);

    expect(redacted).not.toContain('operator');
    expect(redacted).toBe('http://***@couchdb.internal:5984/mydb');
  });

  it('4. malformed input returns a placeholder and never throws', () => {
    expect(() => redactSyncUrl('not a valid url')).not.toThrow();
    expect(redactSyncUrl('not a valid url')).toBe('[REDACTED_INVALID_URL]');

    expect(() => redactSyncUrl('')).not.toThrow();
    expect(redactSyncUrl('')).toBe('[REDACTED_INVALID_URL]');

    expect(() => redactSyncUrl(null)).not.toThrow();
    expect(redactSyncUrl(null)).toBe('[REDACTED_INVALID_URL]');

    expect(() => redactSyncUrl(undefined)).not.toThrow();
    expect(redactSyncUrl(undefined)).toBe('[REDACTED_INVALID_URL]');

    // @ts-expect-error test non-string input
    expect(() => redactSyncUrl({ url: 'http://foo' })).not.toThrow();
    // @ts-expect-error test non-string input
    expect(redactSyncUrl({ url: 'http://foo' })).toBe('[REDACTED_INVALID_URL]');
  });

  it('5. redaction applied to a sample diagnostic payload removes the password', () => {
    const rawRemoteUrl = 'https://vyapar_admin:ultra_confidential_key@couch.vyapar.in:5984/fintech_db';

    // Simulate diagnostic bundle preparation
    const diagnosticBundle = buildSupportDiagnostics({
      app: { name: 'Vyapar Books', version: '1.2.82', platform: 'android' },
      database: { activeDbName: 'vyapar_remote_db', isDemoMode: false, isRemoteDbActive: true },
      sync: {
        status: 'synced',
        remoteUrl: redactSyncUrl(rawRemoteUrl),
        pendingChanges: 0,
      },
      recordCounts: {
        company: 1,
        parties: 10,
        items: 25,
        invoices: 5,
        purchases: 2,
        expenses: 0,
        vouchers: 3,
        bankAccounts: 1,
        cashBankTransactions: 4,
      },
    });

    const serialized = JSON.stringify(diagnosticBundle);

    expect(serialized).not.toContain('ultra_confidential_key');
    expect(serialized).not.toContain('vyapar_admin');
    expect(diagnosticBundle.sync.remoteHost).toBeDefined();
    expect(diagnosticBundle.sync.remoteDatabase).toBeDefined();
  });
});
