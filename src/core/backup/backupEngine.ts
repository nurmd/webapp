import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem, StockAdjustment } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { Voucher } from '../accounting/voucherTypes.ts';
import { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import { SyncedSettings } from '../../services/db.ts';

export interface DatabaseBackupCounts {
  invoices: number;
  purchases: number;
  items: number;
  parties: number;
  vouchers: number;
  expenses: number;
  stockAdjustments: number;
  bankAccounts: number;
  cashBankTransactions: number;
  auditLogs: number;
}

export interface DatabaseBackupData {
  company: CompanyProfile;
  settings?: SyncedSettings;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  items: InventoryItem[];
  parties: Party[];
  vouchers: Voucher[];
  expenses: Expense[];
  adjustments: StockAdjustment[];
  bankAccounts: BankAccount[];
  cashBankTransactions: CashBankTransaction[];
  auditLogs?: any[];
  allowNegativeStock?: boolean;
  hideBuyPrices?: boolean;
}

export interface DatabaseBackupBundle {
  format: 'GST_BILLING_BACKUP';
  version: number;
  appName: string;
  appVersion: string;
  createdAt: string;
  checksum: string;
  counts: DatabaseBackupCounts;
  metadata: {
    businessName: string;
    tradeName?: string;
    gstin?: string;
    phone?: string;
    email?: string;
    totalSalesAmount?: number;
    totalPurchasesAmount?: number;
  };
  data: DatabaseBackupData;
}

export interface BackupValidationResult {
  isValid: boolean;
  error?: string;
  bundle?: DatabaseBackupBundle;
}

/**
 * Computes a deterministic checksum for the backup data payload.
 * Uses FNV-1a 64-bit algorithm for fast, environment-independent, synchronous verification.
 */
export function computeBackupChecksum(data: DatabaseBackupData): string {
  const json = JSON.stringify(data);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(16, '0');
}

/**
 * Generates an intuitive, timestamped filename for a backup download.
 * e.g., GST_Backup_My_Store_2026-10-16_1058.json
 */
export function generateBackupFilename(businessName?: string, date: Date = new Date()): string {
  const sanitizedName = (businessName || 'Business')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `GST_Backup_${sanitizedName}_${yyyy}${mm}${dd}_${hh}${min}.json`;
}

/**
 * Strictly parses and validates a raw backup file (JSON string or object).
 * Verifies headers, data presence, collection arrays, and checksum.
 */
export function validateBackupBundle(input: unknown): BackupValidationResult {
  let parsed: any = input;

  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { isValid: false, error: 'Invalid JSON file: Failed to parse backup file.' };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { isValid: false, error: 'Malformed backup: Expected a JSON object.' };
  }

  if (parsed.format !== 'GST_BILLING_BACKUP') {
    return { isValid: false, error: 'Invalid backup format. File is not a recognized GST Billing backup.' };
  }

  if (typeof parsed.version !== 'number' || parsed.version < 1) {
    return { isValid: false, error: 'Unsupported backup version.' };
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    return { isValid: false, error: 'Corrupt backup file: Missing database payload data.' };
  }

  const { data } = parsed;

  // Validate critical collections exist as arrays or objects
  if (!data.company || typeof data.company !== 'object') {
    return { isValid: false, error: 'Corrupt backup file: Missing company profile data.' };
  }

  const expectedArrayKeys = [
    'invoices',
    'purchases',
    'items',
    'parties',
    'vouchers',
    'expenses',
    'adjustments',
    'bankAccounts',
    'cashBankTransactions',
  ];

  for (const key of expectedArrayKeys) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      return { isValid: false, error: `Invalid backup data structure: "${key}" must be a list.` };
    }
  }

  // Validate Checksum if provided
  if (parsed.checksum) {
    const computed = computeBackupChecksum(data);
    if (computed !== parsed.checksum) {
      return {
        isValid: false,
        error: 'Data integrity verification failed: Checksum does not match. The file may have been modified or corrupted.',
      };
    }
  }

  return {
    isValid: true,
    bundle: parsed as DatabaseBackupBundle,
  };
}
