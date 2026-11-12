import { SyncStorage } from './syncStorage.ts';
import { STORAGE_KEYS } from './storageEngine.ts';
import {
  attachPaiseFields,
  verifyPaiseFields,
  hasCurrentPaiseSchema,
  type PaisePersistKind,
} from '../../core/accounting/paisePersistence.ts';
import { createAndVerifyPreMigrationBackup } from './preMigrationBackup.ts';

export const PAISE_MIGRATION_ID = 'paise-schema-v1';

export interface PaiseMigrationEntityPlan {
  entity: string;
  kind: PaisePersistKind;
  storageKey: string;
  total: number;
  pending: number;
  current: number;
}

export interface PaiseMigrationPlan {
  generatedAt: string;
  entities: PaiseMigrationEntityPlan[];
  totalPending: number;
  totalCurrent: number;
  totalDocuments: number;
}

export interface PaiseMigrationDivergence {
  entity: string;
  id: string;
  path: string;
  rupee: number;
  paise: number;
}

export interface PaiseMigrationEntityResult {
  entity: string;
  migrated: number;
  skipped: number;
  divergences: PaiseMigrationDivergence[];
}

export interface PaiseMigrationReport {
  success: boolean;
  dryRun: boolean;
  backupId?: string;
  backupChecksum?: string;
  startedAt: string;
  finishedAt: string;
  entities: PaiseMigrationEntityResult[];
  totalMigrated: number;
  totalSkipped: number;
  totalDivergences: number;
  abortedReason?: string;
}

type MigratableDoc = object & {
  id?: string;
  _id?: string;
  _rev?: string;
  paiseSchema?: number;
  __paiseSchema?: number;
};

interface EntityMigrationConfig {
  readonly entity: string;
  readonly kind: PaisePersistKind;
  readonly storageKey: string;
  readonly pouchType: string;
  readonly getDocs: (storage: PaiseMigrationStorage) => readonly MigratableDoc[];
}

const ENTITY_CONFIGS: readonly EntityMigrationConfig[] = [
  {
    entity: 'invoice',
    kind: 'invoice',
    storageKey: STORAGE_KEYS.INVOICES,
    pouchType: 'invoice',
    getDocs: (s) => s.getInvoices(),
  },
  {
    entity: 'purchase',
    kind: 'purchase',
    storageKey: STORAGE_KEYS.PURCHASES,
    pouchType: 'purchase',
    getDocs: (s) => s.getPurchases(),
  },
  {
    entity: 'voucher',
    kind: 'voucher',
    storageKey: STORAGE_KEYS.VOUCHERS,
    pouchType: 'voucher',
    getDocs: (s) => s.getVouchers(),
  },
  {
    entity: 'expense',
    kind: 'expense',
    storageKey: STORAGE_KEYS.EXPENSES,
    pouchType: 'expense',
    getDocs: (s) => s.getExpenses(),
  },
  {
    entity: 'party',
    kind: 'party',
    storageKey: STORAGE_KEYS.PARTIES,
    pouchType: 'party',
    getDocs: (s) => s.getParties(),
  },
  {
    entity: 'bankAccount',
    kind: 'bankAccount',
    storageKey: STORAGE_KEYS.BANK_ACCOUNTS,
    pouchType: 'bank_account',
    getDocs: (s) => s.getBankAccounts(),
  },
  {
    entity: 'cashBankTxn',
    kind: 'cashBankTxn',
    storageKey: STORAGE_KEYS.CASH_BANK_TXNS,
    pouchType: 'cash_bank_txn',
    getDocs: (s) => s.getCashBankTransactions(),
  },
  {
    entity: 'loan',
    kind: 'loan',
    storageKey: STORAGE_KEYS.LOANS,
    pouchType: 'loan',
    getDocs: (s) => s.getLoans(),
  },
  {
    entity: 'loanTxn',
    kind: 'loanTxn',
    storageKey: STORAGE_KEYS.LOAN_TXNS,
    pouchType: 'loan_txn',
    getDocs: (s) => s.getLoanTransactions(),
  },
];

function extractDocId(doc: { id?: string; _id?: string }): string {
  if (typeof doc.id === 'string' && doc.id.length > 0) {
    return doc.id;
  }
  if (typeof doc._id === 'string' && doc._id.length > 0) {
    return doc._id;
  }
  return '';
}

export class PaiseMigrationStorage extends SyncStorage {
  public planPaiseMigration(): PaiseMigrationPlan {
    const entities: PaiseMigrationEntityPlan[] = ENTITY_CONFIGS.map((config) => {
      const docs = config.getDocs(this);
      let current = 0;
      for (const doc of docs) {
        if (hasCurrentPaiseSchema(doc)) {
          current++;
        }
      }
      const total = docs.length;
      const pending = total - current;
      return {
        entity: config.entity,
        kind: config.kind,
        storageKey: config.storageKey,
        total,
        pending,
        current,
      };
    });

    let totalPending = 0;
    let totalCurrent = 0;
    let totalDocuments = 0;
    for (const item of entities) {
      totalPending += item.pending;
      totalCurrent += item.current;
      totalDocuments += item.total;
    }

    return {
      generatedAt: new Date().toISOString(),
      entities,
      totalPending,
      totalCurrent,
      totalDocuments,
    };
  }

  public runPaiseMigration(options?: { dryRun?: boolean; batchSize?: number }): PaiseMigrationReport {
    const dryRun = options?.dryRun ?? false;
    const batchSize = options?.batchSize && options.batchSize > 0 ? options.batchSize : 50;
    const startedAt = new Date().toISOString();

    if (dryRun) {
      const plan = this.planPaiseMigration();
      const entityResults: PaiseMigrationEntityResult[] = plan.entities.map((p) => ({
        entity: p.entity,
        migrated: 0,
        skipped: p.pending,
        divergences: [],
      }));
      return {
        success: true,
        dryRun: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        entities: entityResults,
        totalMigrated: 0,
        totalSkipped: plan.totalPending,
        totalDivergences: 0,
        abortedReason: 'DRY_RUN',
      };
    }

    let backupKey: string | undefined;
    let backupChecksum: string | undefined;
    try {
      const backupResult = createAndVerifyPreMigrationBackup(PAISE_MIGRATION_ID);
      backupKey = backupResult.backupKey;
      backupChecksum = backupResult.checksum;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        dryRun: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        entities: [],
        totalMigrated: 0,
        totalSkipped: 0,
        totalDivergences: 0,
        abortedReason: `BACKUP_FAILED: ${msg}`,
      };
    }

    const entityResults: PaiseMigrationEntityResult[] = [];
    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalDivergences = 0;

    for (const config of ENTITY_CONFIGS) {
      const originalDocs = config.getDocs(this);
      const clonedList: MigratableDoc[] = [...originalDocs];
      let entityMigrated = 0;
      let entitySkipped = 0;
      const entityDivergences: PaiseMigrationDivergence[] = [];
      const changedBatch: MigratableDoc[] = [];

      const flushBatch = () => {
        if (changedBatch.length === 0) return;
        this.set(config.storageKey, clonedList);
        for (const changedDoc of changedBatch) {
          this.backgroundPouchPut(config.pouchType, changedDoc);
        }
        changedBatch.length = 0;
      };

      for (let i = 0; i < clonedList.length; i++) {
        const doc = clonedList[i];
        if (hasCurrentPaiseSchema(doc)) {
          const mismatches = verifyPaiseFields(doc);
          if (mismatches.length === 0) {
            continue;
          }
          for (const m of mismatches) {
            entityDivergences.push({
              entity: config.entity,
              id: extractDocId(doc),
              path: m.path,
              rupee: m.rupee,
              paise: m.paise,
            });
          }
          entitySkipped++;
          continue;
        }

        const attached = attachPaiseFields(doc, config.kind);
        const mismatches = verifyPaiseFields(attached);
        if (mismatches.length > 0) {
          for (const m of mismatches) {
            entityDivergences.push({
              entity: config.entity,
              id: extractDocId(doc),
              path: m.path,
              rupee: m.rupee,
              paise: m.paise,
            });
          }
          entitySkipped++;
          continue;
        }

        clonedList[i] = attached;
        entityMigrated++;
        changedBatch.push(attached);

        if (changedBatch.length >= batchSize) {
          flushBatch();
        }
      }

      flushBatch();

      totalMigrated += entityMigrated;
      totalSkipped += entitySkipped;
      totalDivergences += entityDivergences.length;

      entityResults.push({
        entity: config.entity,
        migrated: entityMigrated,
        skipped: entitySkipped,
        divergences: entityDivergences,
      });
    }

    return {
      success: true,
      dryRun: false,
      backupId: backupKey,
      backupChecksum,
      startedAt,
      finishedAt: new Date().toISOString(),
      entities: entityResults,
      totalMigrated,
      totalSkipped,
      totalDivergences,
    };
  }

  public verifyPaiseIntegrity(): PaiseMigrationDivergence[] {
    const divergences: PaiseMigrationDivergence[] = [];
    for (const config of ENTITY_CONFIGS) {
      const docs = config.getDocs(this);
      for (const doc of docs) {
        if (!hasCurrentPaiseSchema(doc)) {
          continue;
        }
        const mismatches = verifyPaiseFields(doc);
        for (const m of mismatches) {
          divergences.push({
            entity: config.entity,
            id: extractDocId(doc),
            path: m.path,
            rupee: m.rupee,
            paise: m.paise,
          });
        }
      }
    }
    return divergences;
  }
}

export function scheduleStartupPaiseIntegrityCheck(
  storage: Pick<PaiseMigrationStorage, 'verifyPaiseIntegrity'>
): void {
  if (typeof window === 'undefined') return;
  setTimeout(() => {
    try {
      const divergences = storage.verifyPaiseIntegrity();
      if (divergences.length > 0) {
        console.warn(
          `[PaiseIntegrity] Startup integrity check found ${divergences.length} paise field divergences.`
        );
      }
    } catch {
      // never throw, never write
    }
  }, 0);
}
