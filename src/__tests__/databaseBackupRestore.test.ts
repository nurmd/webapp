import { describe, it, expect, beforeEach, vi } from 'vitest';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: testStorage,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: testStorage,
    writable: true,
    configurable: true,
  });
}

const inMemoryDocs = new Map<string, any>();
vi.mock('../services/pouchdb.ts', () => {
  return {
    pouch: {
      putDoc: vi.fn(async (type: string, doc: any) => {
        inMemoryDocs.set(`${type}:${doc.id}`, { ...doc, docType: type });
      }),
      deleteDoc: vi.fn(async (type: string, id: string) => {
        inMemoryDocs.delete(`${type}:${id}`);
      }),
      getAllDocs: vi.fn(async (type: string) => {
        const prefix = `${type}:`;
        return Array.from(inMemoryDocs.entries())
          .filter(([k]) => k.startsWith(prefix))
          .map(([, v]) => v);
      }),
      getDoc: vi.fn(async (type: string, id: string) => {
        return inMemoryDocs.get(`${type}:${id}`) || null;
      }),
      migrateFromLocalStorage: vi.fn(async () => {}),
      sync: vi.fn(),
      getSyncState: vi.fn(() => ({ status: 'idle', message: 'Offline' })),
      subscribeSync: vi.fn(() => () => {}),
    },
    PouchSyncState: {},
  };
});

import { db } from '../services/db.ts';
import {
  computeBackupChecksum,
  generateBackupFilename,
  validateBackupBundle,
  DatabaseBackupBundle,
} from '../core/backup/backupEngine.ts';
import { CompanyProfile } from '../models/company.ts';
import { InventoryItem } from '../models/item.ts';
import { Party } from '../models/party.ts';

const SAMPLE_COMPANY: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'Apex Retail Store',
  tradeName: 'Apex Store',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  phone: '9876543210',
  email: 'contact@apexstore.com',
  address: 'Shop 12, Market Yard',
  city: 'Pune',
  stateCode: '27',
  pincode: '411037',
  termsAndConditions: 'Payment due in 15 days',
  bankName: 'HDFC Bank',
  accountNumber: '50200012345678',
  ifscCode: 'HDFC0001234',
  branchName: 'Pune Main Branch',
};

const createSampleParty = (id: string, name: string): Party => ({
  id,
  name,
  phone: '9822001122',
  gstin: '27ABCDE1234F1Z5',
  type: 'CUSTOMER',
  billingAddress: '42 Station Road, Pune',
  stateCode: '27',
  currentBalance: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const createSampleItem = (id: string, name: string): InventoryItem => ({
  id,
  name,
  hsnSacCode: '10063020',
  category: 'Groceries',
  unit: 'BAG',
  salePrice: 1650,
  purchasePrice: 1400,
  gstRate: 5,
  cessRate: 0,
  currentStock: 40,
  minStockAlert: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('Database Backup & Restore Engine', () => {
  beforeEach(() => {
    localStorage.clear();
    inMemoryDocs.clear();

    // Initialize company profile
    db.saveCompany(SAMPLE_COMPANY);
  });

  describe('Backup Bundle Creation & Integrity', () => {
    it('creates a complete backup bundle with correct schema, counts, and checksum', () => {
      // Add test item
      db.saveItem(createSampleItem('ITEM-001', 'Basmati Rice 25kg'));

      // Add test party
      db.saveParty(createSampleParty('PARTY-001', 'Sharma Stores'));

      const bundle = db.createDatabaseBackup();

      expect(bundle.format).toBe('GST_BILLING_BACKUP');
      expect(bundle.version).toBe(1);
      expect(bundle.appName).toBe('GST Billing & Accounting');
      expect(bundle.checksum).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.counts.items).toBeGreaterThanOrEqual(1);
      expect(bundle.counts.parties).toBeGreaterThanOrEqual(1);
      expect(bundle.data.company.businessName).toBe('Apex Retail Store');
      expect(bundle.metadata?.businessName).toBe('Apex Retail Store');
      expect(bundle.metadata?.gstin).toBe('27AABCU9603R1ZM');
    });

    it('generates safe, compliant backup filenames', () => {
      const filename = generateBackupFilename('Apex Retail Store');
      expect(filename).toMatch(/^GST_Backup_Apex_Retail_Store_\d{8}_\d{4}\.json$/);
    });

    it('validates a pristine backup bundle successfully', () => {
      const bundle = db.createDatabaseBackup();
      const validation = validateBackupBundle(bundle);
      expect(validation.isValid).toBe(true);
      expect(validation.error).toBeUndefined();
      expect(validation.bundle).toBeDefined();
    });

    it('detects tampering or corruption when data is modified after checksum generation', () => {
      const bundle = db.createDatabaseBackup();
      // Corrupt data without updating checksum
      const tampered = JSON.parse(JSON.stringify(bundle));
      tampered.data.company.businessName = 'Hacked Company Name';

      const validation = validateBackupBundle(tampered);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Checksum does not match');
    });

    it('rejects invalid or corrupted JSON structures', () => {
      expect(validateBackupBundle(null).isValid).toBe(false);
      expect(validateBackupBundle({} as any).isValid).toBe(false);
      expect(validateBackupBundle({ format: 'WRONG_FORMAT' } as any).isValid).toBe(false);
      expect(validateBackupBundle({ format: 'GST_BILLING_BACKUP', version: 999 } as any).isValid).toBe(false);
    });
  });

  describe('Restore Database Functionality', () => {
    it('restores all data cleanly in REPLACE mode', async () => {
      // 1. Setup initial state A
      db.saveParty(createSampleParty('PARTY-OLD-01', 'Old Customer A'));

      // 2. Create backup bundle representing State B
      const backupBundle: DatabaseBackupBundle = {
        format: 'GST_BILLING_BACKUP',
        version: 1,
        appName: 'GST Billing & Accounting',
        appVersion: '1.1.35',
        createdAt: new Date().toISOString(),
        checksum: '',
        counts: {
          invoices: 1,
          purchases: 0,
          items: 1,
          parties: 1,
          vouchers: 0,
          expenses: 0,
          stockAdjustments: 0,
          bankAccounts: 0,
          cashBankTransactions: 0,
          auditLogs: 0,
        },
        metadata: {
          businessName: 'Fresh Restored Business',
          tradeName: 'Fresh Trade',
          gstin: '27AABCU9603R1ZM',
        },
        data: {
          company: {
            id: 'COMP-RESTORED',
            businessName: 'Fresh Restored Business',
            tradeName: 'Fresh Trade',
            gstin: '27AABCU9603R1ZM',
            pan: 'AABCU9603R',
            phone: '9988776655',
            email: 'fresh@restored.com',
            address: '100 Restored St',
            city: 'Mumbai',
            pincode: '400001',
            stateCode: '27',
          },
          settings: {
            businessType: 'Retail',
            showBuyPricesGlobally: true,
          } as any,
          invoices: [
            {
              id: 'INV-RESTORED-001',
              invoiceNumber: 'INV-2026-001',
              date: '2026-04-10',
              customerName: 'New Restored Customer',
              customerGstin: '',
              customerAddress: 'Mumbai',
              customerStateCode: '27',
              placeOfSupply: '27',
              items: [],
              subTotal: 1000,
              totalTax: 180,
              grandTotal: 1180,
              status: 'PAID',
              roundOff: 0,
            } as any,
          ],
          purchases: [],
          items: [createSampleItem('ITEM-RESTORED-001', 'Restored Item X')],
          parties: [createSampleParty('PARTY-RESTORED-001', 'New Restored Customer')],
          vouchers: [],
          expenses: [],
          adjustments: [],
          bankAccounts: [],
          cashBankTransactions: [],
          auditLogs: [],
          allowNegativeStock: true,
          hideBuyPrices: false,
        },
      };

      // Compute valid checksum for this bundle
      backupBundle.checksum = computeBackupChecksum(backupBundle.data);

      // Perform restore in REPLACE mode
      const result = await db.restoreDatabaseBackup(backupBundle, 'REPLACE');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('REPLACE');

      // Verify replaced state
      const company = db.getCompany();
      expect(company.businessName).toBe('Fresh Restored Business');

      const parties = db.getParties();
      expect(parties.some((p) => p.id === 'PARTY-RESTORED-001')).toBe(true);
      // Old party should be wiped out in REPLACE mode
      expect(parties.some((p) => p.id === 'PARTY-OLD-01')).toBe(false);

      const items = db.getItems();
      expect(items.some((i) => i.id === 'ITEM-RESTORED-001')).toBe(true);

      const invoices = db.getInvoices();
      expect(invoices.some((inv) => inv.id === 'INV-RESTORED-001')).toBe(true);
      expect(db.getAllowNegativeStock()).toBe(true);
      expect(db.getBuyPriceVisibility()).toBe(true);
    });

    it('merges data additively in MERGE mode without deleting existing records', async () => {
      // 1. Setup initial party
      db.saveParty(createSampleParty('PARTY-EXISTING-01', 'Existing Customer 1'));

      // 2. Setup incoming backup bundle with a different party
      const backupBundle: DatabaseBackupBundle = {
        format: 'GST_BILLING_BACKUP',
        version: 1,
        appName: 'GST Billing & Accounting',
        appVersion: '1.1.35',
        createdAt: new Date().toISOString(),
        checksum: '',
        counts: {
          invoices: 0,
          purchases: 0,
          items: 1,
          parties: 1,
          vouchers: 0,
          expenses: 0,
          stockAdjustments: 0,
          bankAccounts: 0,
          cashBankTransactions: 0,
          auditLogs: 0,
        },
        metadata: {
          businessName: SAMPLE_COMPANY.businessName,
          tradeName: SAMPLE_COMPANY.tradeName,
          gstin: SAMPLE_COMPANY.gstin,
        },
        data: {
          company: db.getCompany(),
          settings: {} as any,
          invoices: [],
          purchases: [],
          items: [createSampleItem('ITEM-INCOMING-01', 'Incoming Item')],
          parties: [createSampleParty('PARTY-INCOMING-02', 'Incoming Customer 2')],
          vouchers: [],
          expenses: [],
          adjustments: [],
          bankAccounts: [],
          cashBankTransactions: [],
        },
      };

      backupBundle.checksum = computeBackupChecksum(backupBundle.data);

      const result = await db.restoreDatabaseBackup(backupBundle, 'MERGE');

      expect(result.success).toBe(true);
      expect(result.mode).toBe('MERGE');

      const parties = db.getParties();
      // Both existing and incoming should exist
      expect(parties.some((p) => p.id === 'PARTY-EXISTING-01')).toBe(true);
      expect(parties.some((p) => p.id === 'PARTY-INCOMING-02')).toBe(true);

      const items = db.getItems();
      expect(items.some((i) => i.id === 'ITEM-INCOMING-01')).toBe(true);
    });

    it('rejects restoring a bundle with invalid checksum', async () => {
      const bundle = db.createDatabaseBackup();
      const corrupted = JSON.parse(JSON.stringify(bundle));
      corrupted.checksum = '0000000000000000000000000000000000000000000000000000000000000000';

      await expect(db.restoreDatabaseBackup(corrupted)).rejects.toThrow('Checksum does not match');
    });
  });
});
