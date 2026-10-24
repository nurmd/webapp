import { describe, expect, it } from 'vitest';
import {
  buildConflictBackup,
  buildConflictManifest,
  findSensitiveFields,
  formatConflictManifestSummary,
  getConflictHumanLabel,
  redactSensitiveValues,
  sanitizeConflictSource,
  verifyConflictBackup,
} from '../services/conflictManifest.ts';
import type {
  ConflictDoc,
  ConflictQueueItemLike,
} from '../services/conflictManifest.ts';

function makeDoc(
  id: string,
  rev: string,
  fields: Record<string, unknown>
): ConflictDoc {
  return {
    _id: id,
    _rev: rev,
    ...fields,
  };
}

function makeItem(
  docId: string,
  docType: string,
  winningDoc: ConflictDoc,
  conflictingDocs: ConflictDoc[]
): ConflictQueueItemLike[] {
  return conflictingDocs.map((conflictingDoc) => ({
    id: `${docId}#${conflictingDoc._rev}`,
    docId,
    docType,
    entityId: docId.slice(docId.indexOf(':') + 1),
    winningRev: winningDoc._rev,
    conflictingRev: String(conflictingDoc._rev),
    winningDoc,
    conflictingDoc,
    detectedAt: '2026-10-24T00:00:00.000Z',
  }));
}

function buildFixture(): {
  queue: ConflictQueueItemLike[];
  allDocs: ConflictDoc[];
} {
  const queue: ConflictQueueItemLike[] = [];
  const allDocs: ConflictDoc[] = [];

  const companyWinning = makeDoc('company:COMP-001', '3-winning', {
    docType: 'company',
    businessName: 'Brahmaputra Hardware',
    gstin: '18ADHPL1415E1ZX',
    invoicePrefix: 'INV/26-27/',
    syncRemoteUrl: 'https://admin:topsecret@sync.example.com/vyapar_fintech_store',
  });
  const companyConflicts = [
    makeDoc('company:COMP-001', '2-older', {
      docType: 'company',
      businessName: 'Brahmaputra Hardware',
      gstin: '18ADHPL1415E1ZX',
      invoicePrefix: 'BHW-',
      syncRemoteUrl: 'https://admin:topsecret@sync.example.com/vyapar_fintech_store',
    }),
    makeDoc('company:COMP-001', '1-oldest', {
      docType: 'company',
      businessName: 'Brahmaputra Hardware',
      gstin: '18BADPL1415E1ZX',
      invoicePrefix: 'INV/25-26/',
      syncRemoteUrl: 'https://admin:topsecret@sync.example.com/old_store',
    }),
  ];
  allDocs.push(companyWinning);
  queue.push(...makeItem('company:COMP-001', 'company', companyWinning, companyConflicts));

  for (let index = 1; index <= 10; index++) {
    const padded = String(index).padStart(4, '0');
    const id = `item:ITEM-${padded}`;
    const winning = makeDoc(id, '2-winning', {
      docType: 'item',
      name: `Item ${index}`,
      sku: `SKU-${padded}`,
      purchasePrice: 100 + index,
      stock: 20,
    });
    const conflicting = makeDoc(id, index === 10 ? '1-deleted' : '1-older', {
      docType: 'item',
      name: `Item ${index}`,
      sku: `SKU-${padded}`,
      purchasePrice: 100 + index,
      stock: index === 10 ? 0 : 21,
      ...(index === 10 ? { _deleted: true } : {}),
    });
    allDocs.push(winning);
    queue.push(...makeItem(id, 'item', winning, [conflicting]));
  }

  for (let index = 1; index <= 10; index++) {
    const padded = String(index).padStart(4, '0');
    const id = `party:PARTY-${padded}`;
    const winning = makeDoc(id, '2-winning', {
      docType: 'party',
      name: `Party ${index}`,
      type: index <= 2 ? 'CUSTOMER' : 'SUPPLIER',
      openingBalance: 1000 + index,
      openingBalanceType: 'TO_RECEIVE',
      openingBalanceDate: '2026-04-01',
      phone: `98765000${String(index).padStart(2, '0')}`,
    });
    const conflicting = makeDoc(id, '1-older', {
      docType: 'party',
      name: `Party ${index}`,
      type: index <= 2 ? 'CUSTOMER' : 'SUPPLIER',
      openingBalance: 500 + index,
      openingBalanceType: 'TO_RECEIVE',
      openingBalanceDate: '2026-04-01',
      phone: `98765000${String(index).padStart(2, '0')}`,
    });
    allDocs.push(winning);
    queue.push(...makeItem(id, 'party', winning, [conflicting]));
  }

  for (let index = 1; index <= 6; index++) {
    const padded = String(index).padStart(4, '0');
    const id = `invoice:INV-${padded}`;
    const winning = makeDoc(id, '4-winning', {
      docType: 'invoice',
      invoiceNumber: `INV/26-27/${padded}`,
      partyId: 'PARTY-0001',
      partyName: 'Party 1',
      items: [{ itemId: 'ITEM-0001', qty: 2, rate: 100 }],
      total: 200,
      balanceDue: 200,
    });
    const conflicts = [1, 2, 3].map((revision) =>
      makeDoc(id, `${revision}-branch`, {
        docType: 'invoice',
        invoiceNumber: `INV/26-27/${padded}`,
        partyId: 'PARTY-0001',
        partyName: 'Party 1',
        items: [{ itemId: 'ITEM-0001', qty: 2, rate: 100 }],
        total: 200 + revision,
        balanceDue: revision === 3 ? 0 : 200,
        ...(revision === 3
          ? { _attachments: { 'receipt.pdf': { stub: true } } }
          : {}),
      })
    );
    allDocs.push(winning);
    queue.push(...makeItem(id, 'invoice', winning, conflicts));
  }

  for (let index = 1; index <= 4; index++) {
    const padded = String(index).padStart(4, '0');
    const id = `purchase:PUR-${padded}`;
    const winning = makeDoc(id, '3-winning', {
      docType: 'purchase',
      purchaseNumber: `PUR/26-27/${padded}`,
      supplierId: 'PARTY-0002',
      supplierName: 'Party 2',
      items: [{ itemId: 'ITEM-0002', qty: 5, rate: 80 }],
      total: 400,
    });
    const conflicts = [1, 2].map((revision) =>
      makeDoc(id, `${revision}-branch`, {
        docType: 'purchase',
        purchaseNumber: `PUR/26-27/${padded}`,
        supplierId: 'PARTY-0002',
        supplierName: 'Party 2',
        items: [{ itemId: 'ITEM-0002', qty: 5, rate: 80 }],
        total: 400 + revision,
      })
    );
    allDocs.push(winning);
    queue.push(...makeItem(id, 'purchase', winning, conflicts));
  }

  return { queue, allDocs };
}

describe('Read-only conflict manifest and backup', () => {
  it('inventories 31 documents and 48 conflict revisions without writing or leaking credentials', () => {
    const { queue, allDocs } = buildFixture();
    const manifest = buildConflictManifest(queue, {
      generatedAt: '2026-10-24T12:00:00.000Z',
      source: sanitizeConflictSource(
        'https://admin:topsecret@sync.example.com/vyapar_fintech_store'
      ),
      allDocs,
    });

    expect(manifest.readOnly).toBe(true);
    expect(manifest.counts).toEqual({
      documents: 31,
      conflictRevisions: 48,
      byType: {
        company: 1,
        item: 10,
        party: 10,
        invoice: 6,
        purchase: 4,
      },
    });
    expect(manifest.source).toEqual({
      host: 'sync.example.com',
      database: 'vyapar_fintech_store',
    });
    expect(manifest.documents[0].docType).toBe('company');
    expect(manifest.documents.some((doc) => doc.docType === 'invoice')).toBe(true);

    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain('topsecret');
    expect(serialized).not.toContain('admin:topsecret');
    expect(serialized).toContain('[REDACTED]');

    const company = manifest.documents.find((doc) => doc.docType === 'company')!;
    expect(company.redactedFields).toContain('syncRemoteUrl');
    expect(company.fieldDiff.some((diff) => diff.field === 'invoicePrefix')).toBe(true);

    const party = manifest.documents.find((doc) => doc.docType === 'party')!;
    expect(party.dependencyWarnings.join(' ')).toContain('Referenced by');

    const item = manifest.documents.find((doc) => doc.entityId === 'ITEM-0001')!;
    expect(item.dependencyWarnings.join(' ')).toContain('Referenced by');

    const deletedItem = manifest.documents.find((doc) => doc.entityId === 'ITEM-0010')!;
    expect(deletedItem.dependencyWarnings.join(' ')).toContain('deletion');

    const invoice = manifest.documents.find((doc) => doc.entityId === 'INV-0001')!;
    expect(invoice.dependencyWarnings.join(' ')).toContain('Financial document');
    expect(invoice.dependencyWarnings.join(' ')).toContain('Attachment');

    const summary = formatConflictManifestSummary(manifest);
    expect(summary).toContain('31');
    expect(summary).toContain('48');
    expect(summary).not.toContain('topsecret');
  });

  it('creates a full revision backup that survives a JSON round-trip and verifies', () => {
    const { queue } = buildFixture();
    const backup = buildConflictBackup(queue, {
      generatedAt: '2026-10-24T12:00:00.000Z',
      source: { host: 'sync.example.com', database: 'vyapar_fintech_store' },
    });

    expect(backup.counts).toEqual({
      documents: 31,
      conflictRevisions: 48,
      byType: {
        company: 1,
        item: 10,
        party: 10,
        invoice: 6,
        purchase: 4,
      },
    });
    expect(backup.integrity.algorithm).toBe('sha256');
    expect(backup.integrity.rootHash).toMatch(/^[a-f0-9]{64}$/);

    const company = backup.documents.find((doc) => doc.docType === 'company')!;
    expect(company.winningDoc.syncRemoteUrl).toContain('topsecret');
    expect(company.sensitiveFields).toContain('syncRemoteUrl');
    expect(findSensitiveFields(company.winningDoc)).toContain('syncRemoteUrl');

    const roundTripped = JSON.parse(JSON.stringify(backup));
    const verification = verifyConflictBackup(roundTripped);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
    expect(verification.counts).toEqual({
      documents: 31,
      conflictRevisions: 48,
    });
  });

  it('detects tampered bodies and count mismatches', () => {
    const { queue } = buildFixture();
    const backup = buildConflictBackup(queue, {
      generatedAt: '2026-10-24T12:00:00.000Z',
    });

    const tampered = JSON.parse(JSON.stringify(backup));
    tampered.documents[0].winningDoc.businessName = 'Tampered Hardware';
    const tamperedVerification = verifyConflictBackup(tampered);
    expect(tamperedVerification.valid).toBe(false);
    expect(tamperedVerification.errors.join(' ')).toContain('hash mismatch');

    const wrongCount = JSON.parse(JSON.stringify(backup));
    wrongCount.counts.conflictRevisions = 0;
    const countVerification = verifyConflictBackup(wrongCount);
    expect(countVerification.valid).toBe(false);
    expect(countVerification.errors.join(' ')).toContain('revision count mismatch');
  });

  it('handles explicit 409 conflicts with non-native revision markers', () => {
    const winning = makeDoc('invoice:INV-409', '2-winning', {
      docType: 'invoice',
      invoiceNumber: 'INV-409',
      total: 100,
    });
    const conflicting = makeDoc('invoice:INV-409', 'local-409', {
      docType: 'invoice',
      invoiceNumber: 'INV-409',
      total: 120,
    });
    const queue: ConflictQueueItemLike[] = [
      {
        id: 'invoice:INV-409#local-409',
        docId: 'invoice:INV-409',
        docType: 'invoice',
        entityId: 'INV-409',
        winningRev: '2-winning',
        conflictingRev: 'local-409',
        winningDoc: winning,
        conflictingDoc: conflicting,
      },
    ];

    const manifest = buildConflictManifest(queue, {
      generatedAt: '2026-10-24T12:00:00.000Z',
    });
    const backup = buildConflictBackup(queue, {
      generatedAt: '2026-10-24T12:00:00.000Z',
    });

    expect(manifest.counts).toMatchObject({
      documents: 1,
      conflictRevisions: 1,
    });
    expect(verifyConflictBackup(backup).valid).toBe(true);
  });

  it('fails closed when a conflict revision could not be fetched', () => {
    const winning = makeDoc('party:PARTY-MISSING', '2-winning', {
      docType: 'party',
      name: 'Missing Branch Party',
      openingBalance: 100,
    });
    const unavailable = makeDoc('party:PARTY-MISSING', '1-missing', {
      _unavailable: 'GET /party%3APARTY-MISSING failed with HTTP 404',
    });
    const queue: ConflictQueueItemLike[] = [
      {
        id: 'party:PARTY-MISSING#1-missing',
        docId: 'party:PARTY-MISSING',
        docType: 'party',
        entityId: 'PARTY-MISSING',
        winningRev: '2-winning',
        conflictingRev: '1-missing',
        winningDoc: winning,
        conflictingDoc: unavailable,
      },
    ];

    const manifest = buildConflictManifest(queue, {
      generatedAt: '2026-10-24T12:00:00.000Z',
    });
    const backup = buildConflictBackup(queue, {
      generatedAt: '2026-10-24T12:00:00.000Z',
    });

    expect(manifest.warnings.join(' ')).toContain('incomplete');
    expect(manifest.documents[0].fieldDiff.some((diff) => diff.field === '_unavailable')).toBe(
      false
    );

    const verification = verifyConflictBackup(backup);
    expect(verification.valid).toBe(false);
    expect(verification.errors.join(' ')).toContain('revision unavailable');
  });

  it('redacts nested secret-like keys and keeps labels stable', () => {
    const result = redactSensitiveValues({
      name: 'Brahmaputra Hardware',
      nested: {
        apiKey: 'secret-value',
        notes: 'keep me',
      },
      syncRemoteUrl: 'https://admin:secret@sync.example.com/db',
    });

    expect(result.value.name).toBe('Brahmaputra Hardware');
    expect(result.value.nested.notes).toBe('keep me');
    expect(result.value.nested.apiKey).toBe('[REDACTED]');
    expect(result.value.syncRemoteUrl).toBe('[REDACTED]');
    expect(result.redactedFields).toEqual([
      'nested.apiKey',
      'syncRemoteUrl',
    ]);
    expect(getConflictHumanLabel({ businessName: 'Brahmaputra Hardware' })).toBe(
      'Brahmaputra Hardware'
    );
  });
});
