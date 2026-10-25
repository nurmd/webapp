/**
 * Pure, dependency-free support diagnostics builder and sanitization utilities.
 *
 * Guarantees:
 * - Local-only: never performs network calls, writes, or mutations.
 * - Credential-free: removes basic auth, passwords, bearer tokens, API keys, and query credentials.
 * - Privacy-preserving: completely excludes document bodies, business names, customer names, and GSTINs.
 * - Robust: malformed URLs or errors never throw; returns safe fallbacks.
 */

export const SUPPORT_DIAGNOSTICS_SCHEMA_VERSION = '1.0.0';

export interface SupportDiagnosticsConflictSummary {
  revisions: number;
  uniqueDocuments: number;
  byDocType: Record<string, number>;
}

export interface SupportDiagnosticsRecordCounts {
  company: number;
  parties: number;
  items: number;
  invoices: number;
  purchases: number;
  expenses: number;
  vouchers: number;
  bankAccounts: number;
  cashBankTransactions: number;
}

export interface SupportDiagnosticsPrivacyFlags {
  localOnly: boolean;
  noDocumentBodies: boolean;
  noBusinessIdentifiers: boolean;
  noCredentials: boolean;
  redactionList: string[];
}

export interface SupportDiagnosticsBundle {
  schemaVersion: string;
  generatedAt: string;
  app: {
    name: string;
    version: string;
    buildTime: string;
    platform: string;
  };
  environment: {
    online: boolean;
    userAgent: string;
    language: string;
    timeZone: string;
  };
  database: {
    /**
     * Privacy-safe reference for active database (e.g. 'offline-primary', 'demo',
     * 'remote-db-<hash>', 'custom-db-<hash>'). Never contains raw PouchDB names or business identifiers.
     */
    activeDbName: string;
    isDemoMode: boolean;
    isRemoteDbActive: boolean;
  };
  sync: {
    status: string;
    remoteHost: string | null;
    remoteDatabase: string | null;
    pendingChanges: number;
    lastSyncedTime: string | null;
    sanitizedError: string | null;
    conflictSummary: SupportDiagnosticsConflictSummary;
  };
  recordCounts: SupportDiagnosticsRecordCounts;
  privacyFlags: SupportDiagnosticsPrivacyFlags;
  warnings: string[];
}

export interface SupportDiagnosticsConflictItem {
  id?: string;
  docId?: string;
  docType?: string;
  entityId?: string;
  winningRev?: string;
  conflictingRev?: string;
  winningDoc?: any;
  conflictingDoc?: any;
  detectedAt?: string;
}

export interface SupportDiagnosticsInput {
  generatedAt?: string;
  app?: Partial<{
    name: string;
    version: string;
    buildTime: string;
    platform: string;
  }>;
  environment?: Partial<{
    online: boolean;
    userAgent: string;
    language: string;
    timeZone: string;
  }>;
  database?: Partial<{
    activeDbName: string;
    isDemoMode: boolean;
    isRemoteDbActive: boolean;
  }>;
  sync?: Partial<{
    status: string;
    remoteUrl: string | null;
    remoteHost: string | null;
    remoteDatabase: string | null;
    pendingChanges: number;
    lastSyncedTime: string | null;
    error: string | null;
    conflicts: SupportDiagnosticsConflictItem[];
  }>;
  recordCounts?: Partial<SupportDiagnosticsRecordCounts>;
  warnings?: string[];
}

export const SUPPORT_DIAGNOSTICS_REDACTION_LIST: string[] = [
  'Database credentials (passwords, auth tokens, basic auth)',
  'Remote URL usernames, passwords, and query parameters',
  'Remote hostnames, database names, and active database references (non-reversible hashes; literal IPs and loopback preserved)',
  'Document bodies and contents (line items, transactions, notes, addresses)',
  'Business identifiers, customer names, vendor names, and GSTINs',
  'Local filesystem paths and file URLs',
  'Revision hashes and conflict branch document payloads',
];

/**
 * 32-bit FNV-1a deterministic hash helper.
 * Synchronous and memory-efficient; produces a stable 8-character hex string.
 */
export function fnv1aShortHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Safely decodes a URI component, falling back to undecoded string on malformed percent escapes.
 * Guarantees that sanitizeRemoteDatabase and sanitizeRemoteUrl never throw URIError on inputs like 'sales%ZZdb'.
 */
export function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Checks whether a hostname is a loopback name ('localhost') or literal IP address (IPv4 or IPv6).
 * Literal IP addresses and loopback do not leak company or customer identities.
 */
export function isIpOrLoopback(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (lower === 'localhost') return true;
  // IPv4 regex (0.0.0.0 to 255.255.255.255)
  if (/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(lower)) {
    return true;
  }
  // Bracketed IPv6 e.g. [::1], [fe80::1]
  if (/^\[[0-9a-fA-F:]+\]$/.test(lower)) {
    return true;
  }
  // Raw IPv6 e.g. ::1
  if (lower.includes(':') && /^[0-9a-fA-F:]+$/.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Obscures a remote host string:
 * - Preserves loopback ('localhost') and literal IP addresses (e.g. '127.0.0.1:5984', '192.168.1.100:5984', '[::1]:5984').
 * - For named hostnames (e.g. 'sync.brahmaputrahw.store', 'couchdb.cloud.net'), replaces the hostname with
 *   'host-<short-hash>', preserving the port if present.
 */
export function obscureRemoteHost(rawHost?: string | null): string | null {
  if (!rawHost || typeof rawHost !== 'string' || !rawHost.trim()) return null;
  const trimmed = rawHost.trim();

  // Bracketed IPv6 with optional port: [::1]:5984 or [::1]
  if (trimmed.startsWith('[')) {
    const closing = trimmed.indexOf(']');
    if (closing !== -1) {
      const hostname = trimmed.substring(0, closing + 1);
      const rest = trimmed.substring(closing + 1);
      const port = rest.startsWith(':') ? rest.substring(1) : null;
      if (isIpOrLoopback(hostname)) {
        return port ? `${hostname}:${port}` : hostname;
      }
      const hashed = `host-${fnv1aShortHash(hostname.toLowerCase())}`;
      return port ? `${hashed}:${port}` : hashed;
    }
  }

  // IPv4 or regular hostname with optional port
  const lastColon = trimmed.lastIndexOf(':');
  let hostname = trimmed;
  let port: string | null = null;
  if (lastColon !== -1) {
    const possiblePort = trimmed.substring(lastColon + 1);
    if (/^\d+$/.test(possiblePort)) {
      hostname = trimmed.substring(0, lastColon);
      port = possiblePort;
    }
  }

  if (isIpOrLoopback(hostname)) {
    return port ? `${hostname}:${port}` : hostname;
  }

  const hashed = `host-${fnv1aShortHash(hostname.toLowerCase())}`;
  return port ? `${hashed}:${port}` : hashed;
}

/**
 * Replaces non-empty remote database name with a non-reversible reference: 'db-<short-hash>'.
 * Guarantees that business-specific database names never appear in the diagnostics bundle.
 */
export function obscureRemoteDatabase(rawDb?: string | null): string | null {
  if (!rawDb || typeof rawDb !== 'string' || !rawDb.trim()) return null;
  const cleaned = sanitizeRemoteDatabase(rawDb);
  if (!cleaned) return null;
  return `db-${fnv1aShortHash(cleaned)}`;
}

/**
 * Obscures the active local database name:
 * - Demo mode -> 'demo'
 * - Default offline database -> 'offline-primary'
 * - vyapar_remote_* -> 'remote-db-<short-hash>'
 * - Anything else -> 'custom-db-<short-hash>'
 */
export function obscureActiveDbName(activeDbName?: string | null, isDemoMode?: boolean): string {
  if (isDemoMode) {
    return 'demo';
  }
  if (!activeDbName || typeof activeDbName !== 'string' || !activeDbName.trim()) {
    return 'offline-primary';
  }
  const trimmed = activeDbName.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'demo' || lower === 'vyapar_demo' || lower === 'vyapar_books_demo') {
    return 'demo';
  }
  if (
    lower === 'default' ||
    lower === 'offline-primary' ||
    lower === 'vyapar_fintech_store' ||
    lower === 'vyapar_books_phase_d_primary' ||
    lower === 'vyapar_books'
  ) {
    return 'offline-primary';
  }
  if (lower.startsWith('vyapar_remote_')) {
    return `remote-db-${fnv1aShortHash(trimmed)}`;
  }
  return `custom-db-${fnv1aShortHash(trimmed)}`;
}

/**
 * Parses a remote CouchDB/PouchDB URL and extracts host and database path ONLY.
 * Strips usernames, passwords, tokens, query parameters, and hashes.
 * Never throws on malformed or invalid URLs or invalid percent encodings.
 */
export function sanitizeRemoteUrl(rawUrl?: string | null): {
  host: string | null;
  database: string | null;
} {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { host: null, database: null };
  }

  try {
    const trimmed = rawUrl.trim();
    // Validate protocol if present, or attempt URL construction
    const parsed = new URL(trimmed);
    const host = parsed.host || null;
    const rawPath = parsed.pathname.replace(/^\/+|\/+$/g, '');
    const dbPath = safeDecodeURIComponent(rawPath);
    const database = dbPath.length > 0 ? dbPath : null;
    return { host, database };
  } catch {
    return { host: null, database: null };
  }
}

/**
 * Sanitizes a directly passed remoteHost string to ensure no protocols,
 * credentials, or paths are included.
 */
export function sanitizeRemoteHost(rawHost?: string | null): string | null {
  if (!rawHost || typeof rawHost !== 'string' || !rawHost.trim()) return null;
  const trimmed = rawHost.trim();
  const urlAttempt = trimmed.includes('://') ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(urlAttempt);
    return parsed.host || null;
  } catch {
    const cleaned = trimmed.replace(/^[^@\s]+@/, '').split('/')[0];
    return cleaned || null;
  }
}

/**
 * Sanitizes a directly passed remoteDatabase string to ensure no protocols,
 * query parameters, or credentials are included.
 * Never throws on malformed percent encodings.
 */
export function sanitizeRemoteDatabase(rawDb?: string | null): string | null {
  if (!rawDb || typeof rawDb !== 'string' || !rawDb.trim()) return null;
  const trimmed = rawDb.trim();
  try {
    if (trimmed.includes('://')) {
      const parsed = new URL(trimmed);
      const rawPath = parsed.pathname.replace(/^\/+|\/+$/g, '');
      const dbPath = safeDecodeURIComponent(rawPath);
      return dbPath.length > 0 ? dbPath : null;
    }
  } catch {}
  const cleaned = safeDecodeURIComponent(trimmed.split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, ''));
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Classifies sync error messages into coarse, allowlisted category strings.
 * Guarantees that document IDs, customer names, GSTINs, and raw server payloads
 * are never included in the diagnostics bundle.
 */
export function classifySyncError(error?: string | null): string | null {
  if (!error || typeof error !== 'string' || !error.trim()) {
    return null;
  }
  const lower = error.toLowerCase();
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('access denied')
  ) {
    return 'Sync failed: Authentication or authorization error (HTTP 401/403)';
  }
  if (lower.includes('409') || lower.includes('conflict')) {
    return 'Sync failed: Document revision conflict detected (HTTP 409)';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'Sync failed: Database or document not found (HTTP 404)';
  }
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('internal server') ||
    lower.includes('bad gateway')
  ) {
    return 'Sync failed: Remote server error (HTTP 5xx)';
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('offline') ||
    lower.includes('fetch') ||
    lower.includes('connection') ||
    lower.includes('failed to fetch')
  ) {
    return 'Sync failed: Network or connection error';
  }
  return 'Sync failed: Operational error';
}

/**
 * Sanitizes free-form error, message, or warning strings by removing credentials,
 * tokens, passwords, file URLs, Windows paths, POSIX filesystem paths,
 * application document IDs, and GSTINs.
 * Truncates output to a safe length.
 */
export function sanitizeDiagnosticsText(
  text?: string | null,
  maxLength = 500
): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text
    // 1. Remove Basic authorization header or bare Basic token:
    // Matches "Authorization: Basic dXNlcjpwYXNzd29yZA==" or "Basic dXNlcjpwYXNzd29yZA=="
    .replace(/\b(?:authorization\s*[:=]\s*)?basic\s+[A-Za-z0-9+/=]{4,}/gi, 'Authorization=[REDACTED]')
    // 2. Remove Bearer tokens
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    // 3. Remove URL credentials (both username:password and username-only)
    .replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[REDACTED_CREDENTIALS]@')
    // 4. Remove password/token/key key-value pairs
    .replace(
      /(?:\b|_)(password|passwd|secret|token|api[_-]?key|auth|access[_-]?token)\s*[:=]\s*[^\s,;'"\]\}]+/gi,
      '$1=[REDACTED]'
    )
    // 5. Remove file:// URLs
    .replace(/file:\/\/[^\s"'`<>]+/gi, '[REDACTED_PATH]')
    // 6. Remove Windows paths (e.g. C:\Users\... or D:\data\...)
    .replace(/\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n\s]*/g, '[REDACTED_PATH]')
    // 7. Remove local POSIX paths (including /sdcard, /mnt, /run, /proc)
    .replace(
      /(?:^|[\s"'`(\[])(\/(?:home|Users|data|var|tmp|etc|usr|root|private|opt|storage|sdcard|mnt|run|proc)\/[^\s"'`)\],;]*)/g,
      (match, p1) => match.replace(p1, '[REDACTED_PATH]')
    )
    // 8. Remove application document IDs (e.g. invoice:INV/26-27/0010, party:PTY-123)
    .replace(/\b(?:invoice|party|item|purchase|voucher|settings|company):[A-Za-z0-9_.\-\/]+/gi, '[REDACTED_DOC_ID]')
    // 9. Remove Indian GSTIN patterns (e.g. 18ADHPL1415E1ZX)
    .replace(/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/g, '[REDACTED_GSTIN]');

  sanitized = sanitized.trim();
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '... (truncated)';
  }

  return sanitized;
}

/**
 * Computes a sanitized conflict summary: counts revisions, unique document IDs,
 * and groups by docType. Never leaks document bodies, business names, GSTINs, or hashes.
 */
export function summarizeConflicts(
  conflicts: SupportDiagnosticsConflictItem[] = []
): SupportDiagnosticsConflictSummary {
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return {
      revisions: 0,
      uniqueDocuments: 0,
      byDocType: {},
    };
  }

  const uniqueDocs = new Set<string>();
  const byDocType: Record<string, number> = {};

  for (const conflict of conflicts) {
    if (!conflict) continue;
    const docId = conflict.docId || (conflict.docType && conflict.entityId ? `${conflict.docType}:${conflict.entityId}` : conflict.id);
    if (docId) {
      uniqueDocs.add(docId);
    }
    const docType = conflict.docType || 'unknown';
    byDocType[docType] = (byDocType[docType] || 0) + 1;
  }

  return {
    revisions: conflicts.length,
    uniqueDocuments: uniqueDocs.size,
    byDocType,
  };
}

/**
 * Pure, deterministic builder for the support diagnostics bundle.
 */
export function buildSupportDiagnostics(
  input: SupportDiagnosticsInput = {}
): SupportDiagnosticsBundle {
  const generatedAt = input.generatedAt || new Date().toISOString();

  // Environment detection
  const envInput = input.environment || {};
  const online =
    typeof envInput.online === 'boolean'
      ? envInput.online
      : typeof navigator !== 'undefined'
      ? navigator.onLine
      : true;
  const userAgent =
    typeof envInput.userAgent === 'string'
      ? envInput.userAgent
      : typeof navigator !== 'undefined'
      ? navigator.userAgent
      : 'Node.js/Test';
  const language =
    typeof envInput.language === 'string'
      ? envInput.language
      : typeof navigator !== 'undefined'
      ? navigator.language
      : 'en-IN';
  const timeZone =
    typeof envInput.timeZone === 'string'
      ? envInput.timeZone
      : typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';

  // Remote URL sanitization & privacy-preserving non-reversible references
  const syncInput = input.sync || {};
  let rawHost: string | null = null;
  let rawDatabase: string | null = null;

  if (syncInput.remoteUrl !== undefined) {
    const sanitizedUrl = sanitizeRemoteUrl(syncInput.remoteUrl);
    rawHost = sanitizedUrl.host;
    rawDatabase = sanitizedUrl.database;
  } else {
    rawHost = sanitizeRemoteHost(syncInput.remoteHost);
    rawDatabase = sanitizeRemoteDatabase(syncInput.remoteDatabase);
  }

  const remoteHost = obscureRemoteHost(rawHost);
  const remoteDatabase = obscureRemoteDatabase(rawDatabase);

  const sanitizedError = classifySyncError(syncInput.error);
  const conflictSummary = summarizeConflicts(syncInput.conflicts);

  const rawCounts = input.recordCounts || {};
  const recordCounts: SupportDiagnosticsRecordCounts = {
    company: typeof rawCounts.company === 'number' ? rawCounts.company : 0,
    parties: typeof rawCounts.parties === 'number' ? rawCounts.parties : 0,
    items: typeof rawCounts.items === 'number' ? rawCounts.items : 0,
    invoices: typeof rawCounts.invoices === 'number' ? rawCounts.invoices : 0,
    purchases: typeof rawCounts.purchases === 'number' ? rawCounts.purchases : 0,
    expenses: typeof rawCounts.expenses === 'number' ? rawCounts.expenses : 0,
    vouchers: typeof rawCounts.vouchers === 'number' ? rawCounts.vouchers : 0,
    bankAccounts: typeof rawCounts.bankAccounts === 'number' ? rawCounts.bankAccounts : 0,
    cashBankTransactions: typeof rawCounts.cashBankTransactions === 'number' ? rawCounts.cashBankTransactions : 0,
  };

  const warnings = (input.warnings || [])
    .map((w) => sanitizeDiagnosticsText(w))
    .filter(Boolean);

  const appInput = input.app || {};
  const dbInput = input.database || {};
  const isDemoMode = Boolean(dbInput.isDemoMode);
  const activeDbName = obscureActiveDbName(dbInput.activeDbName, isDemoMode);

  return {
    schemaVersion: SUPPORT_DIAGNOSTICS_SCHEMA_VERSION,
    generatedAt,
    app: {
      name: appInput.name || 'Vyapar Books',
      version: appInput.version || '0.0.0',
      buildTime: appInput.buildTime || generatedAt,
      platform: appInput.platform || (typeof window !== 'undefined' && (window as any).AndroidBridge ? 'android' : 'web'),
    },
    environment: {
      online,
      userAgent: sanitizeDiagnosticsText(userAgent, 250),
      language,
      timeZone,
    },
    database: {
      activeDbName,
      isDemoMode,
      isRemoteDbActive: Boolean(dbInput.isRemoteDbActive),
    },
    sync: {
      status: syncInput.status || 'offline',
      remoteHost,
      remoteDatabase,
      pendingChanges: typeof syncInput.pendingChanges === 'number' ? syncInput.pendingChanges : 0,
      lastSyncedTime: syncInput.lastSyncedTime || null,
      sanitizedError,
      conflictSummary,
    },
    recordCounts,
    privacyFlags: {
      localOnly: true,
      noDocumentBodies: true,
      noBusinessIdentifiers: true,
      noCredentials: true,
      redactionList: [...SUPPORT_DIAGNOSTICS_REDACTION_LIST],
    },
    warnings,
  };
}

/**
 * Serializes the diagnostics bundle to a formatted JSON string.
 */
export function serializeSupportDiagnostics(bundle: SupportDiagnosticsBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Generates a filesystem-safe filename for the diagnostics bundle.
 * Output pattern: support-diagnostics-YYYY-MM-DDTHH-mm-ss-sssZ.json
 */
export function generateSupportDiagnosticsFilename(timestamp: string | Date = new Date()): string {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const iso = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
  const safe = iso.replace(/[:.]/g, '-');
  return `support-diagnostics-${safe}.json`;
}
