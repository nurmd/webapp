import { describe, it, expect } from 'vitest';
import {
  buildSupportDiagnostics,
  sanitizeRemoteUrl,
  sanitizeRemoteHost,
  sanitizeRemoteDatabase,
  obscureActiveDbName,
  sanitizeDiagnosticsText,
  classifySyncError,
  summarizeConflicts,
  serializeSupportDiagnostics,
  generateSupportDiagnosticsFilename,
  SUPPORT_DIAGNOSTICS_SCHEMA_VERSION,
} from '../core/utils/supportDiagnostics.ts';

describe('Local-Only Support Diagnostics Pure Builder & Sanitizers', () => {
  it('redacts credential-bearing remote URL and error; host and database are obscured non-reversible references', () => {
    const rawUrl = 'https://admin:SuperSecretPass123!@couchdb.subdomain.example.com:5984/live_store_data?auth_token=abc123xyz#heading';
    const rawError = 'Connection failed to https://admin:SuperSecretPass123!@couchdb.subdomain.example.com:5984/live_store_data';

    const bundle = buildSupportDiagnostics({
      sync: {
        status: 'error',
        remoteUrl: rawUrl,
        error: rawError,
        pendingChanges: 3,
      },
    });

    // Host and database are non-reversible hashed references preserving port
    expect(bundle.sync.remoteHost).toMatch(/^host-[0-9a-f]{8}:5984$/);
    expect(bundle.sync.remoteDatabase).toMatch(/^db-[0-9a-f]{8}$/);

    // Bundle JSON contains NO credentials, raw tokens, raw hostnames, or raw database names
    const serialized = serializeSupportDiagnostics(bundle);
    expect(serialized).not.toContain('admin:');
    expect(serialized).not.toContain('SuperSecretPass123!');
    expect(serialized).not.toContain('auth_token=abc123xyz');
    expect(serialized).not.toContain('couchdb.subdomain.example.com');
    expect(serialized).not.toContain('live_store_data');

    // Sync error is categorized cleanly
    expect(bundle.sync.sanitizedError).toBe('Sync failed: Network or connection error');
  });

  it('redacts Basic authorization headers and bare Basic base64 tokens in free-form text', () => {
    const textWithBasicHeader = 'Error: request failed with Authorization: Basic dXNlcjpwYXNzd29yZA== (status 401)';
    const textWithBareBasic = 'Failed CouchDB handshake with header Basic dXNlcjpwYXNzd29yZA==';
    const textWithUsernameOnlyUrl = 'Failed to connect to https://sysadmin@couchdb.cloud.net:5984/store';
    const textWithExtendedPaths = 'Crash at /sdcard/Download/dump.log and /mnt/storage/backup.db and /proc/cpuinfo';

    const sanitizedHeader = sanitizeDiagnosticsText(textWithBasicHeader);
    const sanitizedBare = sanitizeDiagnosticsText(textWithBareBasic);
    const sanitizedUserUrl = sanitizeDiagnosticsText(textWithUsernameOnlyUrl);
    const sanitizedPaths = sanitizeDiagnosticsText(textWithExtendedPaths);

    // Basic auth payload is completely redacted
    expect(sanitizedHeader).toContain('Authorization=[REDACTED]');
    expect(sanitizedHeader).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(sanitizedHeader).not.toContain('user:password');

    expect(sanitizedBare).toContain('Authorization=[REDACTED]');
    expect(sanitizedBare).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(sanitizedBare).not.toContain('user:password');

    // Username-only URL userinfo is redacted
    expect(sanitizedUserUrl).toContain('https://[REDACTED_CREDENTIALS]@couchdb.cloud.net:5984/store');
    expect(sanitizedUserUrl).not.toContain('sysadmin@');

    // Extended paths are redacted
    expect(sanitizedPaths).not.toContain('/sdcard/Download');
    expect(sanitizedPaths).not.toContain('/mnt/storage');
    expect(sanitizedPaths).not.toContain('/proc/cpuinfo');
    expect(sanitizedPaths).toContain('[REDACTED_PATH]');
  });

  it('proves noBusinessIdentifiers is truthful by coarsifying sync errors and excluding doc IDs, party names, and GSTINs', () => {
    const rawSyncError = 'PouchDB PUT failed for invoice:INV/26-27/0010 (party:PTY-400, customer Gupta Traders, GSTIN 18ADHPL1415E1ZX): 401 Unauthorized';

    const bundle = buildSupportDiagnostics({
      sync: {
        status: 'error',
        error: rawSyncError,
      },
    });

    // sanitizedError is a coarse allowlisted classification without raw server payload
    expect(bundle.sync.sanitizedError).toBe('Sync failed: Authentication or authorization error (HTTP 401/403)');

    // Serialized bundle contains zero document IDs, customer names, or GSTINs
    const jsonStr = serializeSupportDiagnostics(bundle);
    expect(jsonStr).not.toContain('invoice:INV/26-27/0010');
    expect(jsonStr).not.toContain('INV/26-27/0010');
    expect(jsonStr).not.toContain('party:PTY-400');
    expect(jsonStr).not.toContain('Gupta Traders');
    expect(jsonStr).not.toContain('18ADHPL1415E1ZX');

    // Privacy flag remains strictly truthful
    expect(bundle.privacyFlags.noBusinessIdentifiers).toBe(true);
    expect(bundle.privacyFlags.noDocumentBodies).toBe(true);
    expect(bundle.privacyFlags.noCredentials).toBe(true);
  });

  it('sanitizes direct remoteHost and remoteDatabase overrides into non-reversible references', () => {
    const bundle = buildSupportDiagnostics({
      sync: {
        remoteHost: 'admin:secret99@couchdb-direct.lan:5984',
        remoteDatabase: '/sales_production_2026?token=secret123#head',
      },
    });

    expect(bundle.sync.remoteHost).toMatch(/^host-[0-9a-f]{8}:5984$/);
    expect(bundle.sync.remoteHost).not.toContain('admin:secret99@');
    expect(bundle.sync.remoteHost).not.toContain('couchdb-direct.lan');

    expect(bundle.sync.remoteDatabase).toMatch(/^db-[0-9a-f]{8}$/);
    expect(bundle.sync.remoteDatabase).not.toContain('token=secret123');
    expect(bundle.sync.remoteDatabase).not.toContain('sales_production_2026');

    const json = serializeSupportDiagnostics(bundle);
    expect(json).not.toContain('secret99');
    expect(json).not.toContain('secret123');
    expect(json).not.toContain('couchdb-direct.lan');
    expect(json).not.toContain('sales_production_2026');
  });

  it('summarizes conflict counts and by-type correctly without document bodies, business names, or GSTINs', () => {
    const mockConflicts = [
      {
        id: 'invoice:INV-001#2-revA',
        docId: 'invoice:INV-001',
        docType: 'invoice',
        entityId: 'INV-001',
        winningRev: '2-revA',
        conflictingRev: '2-revB',
        winningDoc: {
          id: 'INV-001',
          partyName: 'Sensitive Customer VIP',
          gstin: '27AABCS1429B1ZB',
          items: [{ name: 'Rice Gold 10kg', price: 1200 }],
        },
        conflictingDoc: {
          id: 'INV-001',
          partyName: 'Sensitive Customer VIP',
          gstin: '27AABCS1429B1ZB',
          items: [{ name: 'Rice Gold 10kg', price: 1100 }],
        },
      },
      {
        id: 'party:PTY-100#3-rev1',
        docId: 'party:PTY-100',
        docType: 'party',
        entityId: 'PTY-100',
        winningRev: '3-rev1',
        conflictingRev: '3-rev2',
        winningDoc: {
          id: 'PTY-100',
          businessName: 'Gupta Hardware Wholesalers',
          gstin: '07AAAAA0000A1Z5',
          phone: '9876543210',
        },
        conflictingDoc: {
          id: 'PTY-100',
          businessName: 'Gupta Hardware Wholesalers',
        },
      },
      {
        id: 'party:PTY-100#3-rev3',
        docId: 'party:PTY-100',
        docType: 'party',
        entityId: 'PTY-100',
        winningRev: '3-rev1',
        conflictingRev: '3-rev3',
        winningDoc: {
          id: 'PTY-100',
          businessName: 'Gupta Hardware Wholesalers',
          gstin: '07AAAAA0000A1Z5',
        },
        conflictingDoc: {
          id: 'PTY-100',
          businessName: 'Gupta Hardware Wholesalers',
        },
      },
    ];

    const bundle = buildSupportDiagnostics({
      sync: {
        status: 'conflict',
        conflicts: mockConflicts as any,
      },
    });

    expect(bundle.sync.conflictSummary.revisions).toBe(3);
    expect(bundle.sync.conflictSummary.uniqueDocuments).toBe(2);
    expect(bundle.sync.conflictSummary.byDocType).toEqual({
      invoice: 1,
      party: 2,
    });

    // Ensure document bodies and business identifiers are NEVER present in serialized bundle
    const jsonStr = serializeSupportDiagnostics(bundle);
    expect(jsonStr).not.toContain('Sensitive Customer VIP');
    expect(jsonStr).not.toContain('27AABCS1429B1ZB');
    expect(jsonStr).not.toContain('Rice Gold 10kg');
    expect(jsonStr).not.toContain('Gupta Hardware Wholesalers');
    expect(jsonStr).not.toContain('07AAAAA0000A1Z5');
    expect(jsonStr).not.toContain('2-revA');
    expect(jsonStr).not.toContain('3-rev3');
  });

  it('first-run bundle with no state returns zeros and null remote fields', () => {
    const bundle = buildSupportDiagnostics({});

    expect(bundle.schemaVersion).toBe(SUPPORT_DIAGNOSTICS_SCHEMA_VERSION);
    expect(bundle.sync.remoteHost).toBeNull();
    expect(bundle.sync.remoteDatabase).toBeNull();
    expect(bundle.sync.pendingChanges).toBe(0);
    expect(bundle.sync.lastSyncedTime).toBeNull();
    expect(bundle.sync.sanitizedError).toBeNull();

    expect(bundle.sync.conflictSummary).toEqual({
      revisions: 0,
      uniqueDocuments: 0,
      byDocType: {},
    });

    expect(bundle.recordCounts).toEqual({
      company: 0,
      parties: 0,
      items: 0,
      invoices: 0,
      purchases: 0,
      expenses: 0,
      vouchers: 0,
      bankAccounts: 0,
      cashBankTransactions: 0,
    });

    expect(bundle.privacyFlags.localOnly).toBe(true);
    expect(bundle.privacyFlags.noCredentials).toBe(true);
    expect(bundle.privacyFlags.noDocumentBodies).toBe(true);
    expect(bundle.privacyFlags.noBusinessIdentifiers).toBe(true);
    expect(bundle.privacyFlags.redactionList.length).toBeGreaterThan(0);
  });

  it('legacy offline/upgrade state maps active DB name and preserves literal IP remote host without credentials', () => {
    const bundle = buildSupportDiagnostics({
      database: {
        activeDbName: 'vyapar_books_legacy_v1',
        isDemoMode: false,
        isRemoteDbActive: false,
      },
      sync: {
        status: 'offline',
        remoteUrl: 'http://syncuser:password999@192.168.1.100:5984/legacy_store_db',
        pendingChanges: 12,
        lastSyncedTime: '2026-10-20T12:00:00Z',
      },
      recordCounts: {
        parties: 15,
        invoices: 45,
      },
    });

    expect(bundle.database.activeDbName).toMatch(/^custom-db-[0-9a-f]{8}$/);
    expect(bundle.database.activeDbName).not.toContain('vyapar_books_legacy_v1');
    expect(bundle.database.isDemoMode).toBe(false);
    expect(bundle.database.isRemoteDbActive).toBe(false);

    expect(bundle.sync.remoteHost).toBe('192.168.1.100:5984');
    expect(bundle.sync.remoteDatabase).toMatch(/^db-[0-9a-f]{8}$/);
    expect(bundle.sync.remoteDatabase).not.toContain('legacy_store_db');
    expect(bundle.sync.pendingChanges).toBe(12);
    expect(bundle.sync.lastSyncedTime).toBe('2026-10-20T12:00:00Z');

    const json = serializeSupportDiagnostics(bundle);
    expect(json).not.toContain('syncuser');
    expect(json).not.toContain('password999');
    expect(json).not.toContain('legacy_store_db');
    expect(bundle.recordCounts.parties).toBe(15);
    expect(bundle.recordCounts.invoices).toBe(45);
    expect(bundle.recordCounts.items).toBe(0);
  });

  it('handles malformed URLs without throwing and returns null host/database', () => {
    expect(() => sanitizeRemoteUrl('ht!tp:invalid-url:::')).not.toThrow();
    expect(sanitizeRemoteUrl('ht!tp:invalid-url:::')).toEqual({ host: null, database: null });
    expect(sanitizeRemoteUrl('')).toEqual({ host: null, database: null });
    expect(sanitizeRemoteUrl(null)).toEqual({ host: null, database: null });
    expect(sanitizeRemoteUrl(undefined)).toEqual({ host: null, database: null });

    const bundle = buildSupportDiagnostics({
      sync: {
        remoteUrl: 'invalid--not-a-url',
      },
    });
    expect(bundle.sync.remoteHost).toBeNull();
    expect(bundle.sync.remoteDatabase).toBeNull();
  });

  it('serializes properly and creates a filesystem-safe filename', () => {
    const fixedDate = '2026-10-25T06:13:00.000Z';
    const filename = generateSupportDiagnosticsFilename(fixedDate);

    expect(filename).toBe('support-diagnostics-2026-10-25T06-13-00-000Z.json');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('/');
    expect(filename).not.toContain('\\');

    const bundle = buildSupportDiagnostics({ generatedAt: fixedDate });
    const serialized = serializeSupportDiagnostics(bundle);
    const parsed = JSON.parse(serialized);
    expect(parsed.schemaVersion).toBe(SUPPORT_DIAGNOSTICS_SCHEMA_VERSION);
    expect(parsed.generatedAt).toBe(fixedDate);
  });

  it('guarantees production business identifiers in host and database never leak', () => {
    const bundle = buildSupportDiagnostics({
      database: {
        activeDbName: 'vyapar_remote_brahmaputrahw_store_9f8e7d6c',
      },
      sync: {
        remoteUrl: 'https://sync.brahmaputrahw.store:5984/brahmaputrahw_store',
      },
    });

    expect(bundle.sync.remoteHost).toMatch(/^host-[0-9a-f]{8}:5984$/);
    expect(bundle.sync.remoteDatabase).toMatch(/^db-[0-9a-f]{8}$/);
    expect(bundle.database.activeDbName).toMatch(/^remote-db-[0-9a-f]{8}$/);

    const serialized = serializeSupportDiagnostics(bundle);
    expect(serialized).not.toContain('brahmaputrahw');
    expect(serialized).not.toContain('sync.brahmaputrahw.store');
    expect(serialized).not.toContain('brahmaputrahw_store');
    expect(serialized).not.toContain('remote.vyapar.internal');
    expect(serialized).not.toContain('couchdb.cloud.net');
    expect(bundle.privacyFlags.noBusinessIdentifiers).toBe(true);
  });

  it('guarantees never-throw on malformed percent escapes and invalid URLs', () => {
    expect(() => sanitizeRemoteDatabase('sales%ZZdb')).not.toThrow();
    expect(sanitizeRemoteDatabase('sales%ZZdb')).toBe('sales%ZZdb');
    expect(sanitizeRemoteDatabase('https://couchdb.lan/sales%ZZdb')).toBe('sales%ZZdb');

    expect(() => sanitizeRemoteUrl('https://couchdb.lan:5984/sales%ZZdb')).not.toThrow();
    expect(sanitizeRemoteUrl('https://couchdb.lan:5984/sales%ZZdb')).toEqual({
      host: 'couchdb.lan:5984',
      database: 'sales%ZZdb',
    });
    expect(() => sanitizeRemoteUrl('https://%ZZ:pass@host/sales%ZZdb')).not.toThrow();

    expect(() =>
      buildSupportDiagnostics({
        sync: {
          remoteDatabase: 'sales%ZZdb',
          remoteUrl: 'http://127.0.0.1:5984/sales%ZZdb',
        },
      })
    ).not.toThrow();

    const bundle = buildSupportDiagnostics({
      sync: {
        remoteUrl: 'http://127.0.0.1:5984/sales%ZZdb',
      },
    });
    expect(bundle.sync.remoteHost).toBe('127.0.0.1:5984');
    expect(bundle.sync.remoteDatabase).toMatch(/^db-[0-9a-f]{8}$/);
  });

  it('correctly categorizes active database names into privacy-safe references', () => {
    // Default offline database
    expect(obscureActiveDbName('vyapar_fintech_store')).toBe('offline-primary');
    expect(obscureActiveDbName('default')).toBe('offline-primary');
    expect(obscureActiveDbName('offline-primary')).toBe('offline-primary');

    // Demo databases (with or without isDemoMode flag)
    expect(obscureActiveDbName('vyapar_demo')).toBe('demo');
    expect(obscureActiveDbName('demo')).toBe('demo');
    expect(obscureActiveDbName('vyapar_books_demo')).toBe('demo');
    expect(obscureActiveDbName('any_name', true)).toBe('demo');

    // Remote databases
    expect(obscureActiveDbName('vyapar_remote_brahmaputrahw_store_9f8e7d6c')).toMatch(/^remote-db-[0-9a-f]{8}$/);
    expect(obscureActiveDbName('vyapar_remote_brahmaputrahw_store_9f8e7d6c')).not.toContain('brahmaputrahw');

    // Generic custom databases
    expect(obscureActiveDbName('custom_accounting_db')).toMatch(/^custom-db-[0-9a-f]{8}$/);
    expect(obscureActiveDbName('custom_accounting_db')).not.toContain('custom_accounting_db');
  });
});
