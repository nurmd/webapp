import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';

// Custom in-memory storage mock
class MockLocalStorage implements Storage {
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

const mockStorage = new MockLocalStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
}

// In-memory PouchDB mock for audit trail persistence
const inMemoryPouchDocs = new Map<string, any>();
vi.mock('../services/pouchdb.ts', () => {
  return {
    pouch: {
      putDoc: vi.fn(async (type: string, doc: any) => {
        inMemoryPouchDocs.set(`${type}:${doc.id}`, { ...doc, docType: type });
      }),
      deleteDoc: vi.fn(async (type: string, id: string) => {
        inMemoryPouchDocs.delete(`${type}:${id}`);
      }),
      getAllDocs: vi.fn(async (type: string) => {
        const prefix = `${type}:`;
        return Array.from(inMemoryPouchDocs.entries())
          .filter(([k]) => k.startsWith(prefix))
          .map(([, v]) => ({ ...v }));
      }),
      syncNow: vi.fn(async () => ({ ok: true })),
      subscribeState: vi.fn(() => () => {}),
      onDataChange: vi.fn(() => () => {}),
      notifyDataChange: vi.fn(),
      getState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
      migrateFromLocalStorage: vi.fn(async () => {}),
    },
  };
});

import { sha256Sync, sha256Hex, generateRandomSalt } from '../core/utils/crypto.ts';
import { rbac, hashPin, timingSafeEqual } from '../services/rbac.ts';
import { auditTrail, computeRecordHash, buildPreimage, GENESIS_PREVIOUS_HASH } from '../services/auditTrail.ts';
import { updateService } from '../services/updateService.ts';

// Oracle helper using Node.js crypto
function nodeSha256(data: string | Uint8Array | ArrayBuffer): string {
  let buf: Buffer;
  if (typeof data === 'string') {
    buf = Buffer.from(data, 'utf8');
  } else if (data instanceof Uint8Array) {
    buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else {
    buf = Buffer.from(data);
  }
  return crypto.createHash('sha256').update(new Uint8Array(buf)).digest('hex');
}

describe('Challenger 1: Empirical Stress-Test — Non-Secure Web Crypto Fallback (R1)', () => {
  const originalSubtle = globalThis.crypto?.subtle;
  const originalGetRandomValues = globalThis.crypto?.getRandomValues;
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    // Restore original crypto configuration
    if (globalThis.crypto) {
      if (originalSubtle) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: originalSubtle,
          configurable: true,
          writable: true,
        });
      }
      if (originalGetRandomValues) {
        Object.defineProperty(globalThis.crypto, 'getRandomValues', {
          value: originalGetRandomValues,
          configurable: true,
          writable: true,
        });
      }
    }
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Dimension 1: NIST Test Vectors & Boundary Size Exhaustive Verification
  // --------------------------------------------------------------------------
  describe('Dimension 1: NIST & Boundary Exhaustive Coverage vs Node Crypto Oracle', () => {
    it('verifies Official NIST SHA-256 test vectors', () => {
      // Vector 1: Empty string (0 bits)
      expect(sha256Sync('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      // Vector 2: "abc" (24 bits)
      expect(sha256Sync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      // Vector 3: 56-byte string (448 bits - boundary case: fills payload, padding overflows to block 2)
      const input56 = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
      expect(sha256Sync(input56)).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    });

    it('matches Node crypto oracle across all consecutive lengths from 0 to 130 bytes', () => {
      // Tests every single boundary transition around 55, 56, 64, 119, 120, 128
      for (let len = 0; len <= 130; len++) {
        const charCode = 65 + (len % 26);
        const str = String.fromCharCode(charCode).repeat(len);
        const expected = nodeSha256(str);
        const actualSync = sha256Sync(str);
        expect(actualSync, `Mismatch at length ${len}`).toBe(expected);
      }
    });

    it('matches Node crypto oracle across critical padding boundaries (54, 55, 56, 57, 63, 64, 65)', () => {
      const boundaryLengths = [54, 55, 56, 57, 63, 64, 65, 118, 119, 120, 121, 127, 128, 129];
      for (const len of boundaryLengths) {
        const pseudoRandomBytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          pseudoRandomBytes[i] = (i * 37 + 13) % 256;
        }
        const expected = nodeSha256(pseudoRandomBytes);
        const actual = sha256Sync(pseudoRandomBytes);
        expect(actual, `Boundary fail at length ${len}`).toBe(expected);
      }
    });

    it('handles large multi-block payloads (1 KB, 16 KB, 64 KB, 100 KB)', () => {
      const largeSizes = [1024, 16384, 65536, 102400];
      for (const size of largeSizes) {
        const bigBytes = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
          bigBytes[i] = (i ^ (i >> 8)) & 0xff;
        }
        const expected = nodeSha256(bigBytes);
        const actual = sha256Sync(bigBytes);
        expect(actual, `Large payload mismatch at size ${size}`).toBe(expected);
      }
    });

    it('handles Uint8Array views with non-zero byte offsets (slices/subarrays)', () => {
      const rawBuffer = new ArrayBuffer(100);
      const fullView = new Uint8Array(rawBuffer);
      for (let i = 0; i < 100; i++) fullView[i] = i;

      // Subarray starting at offset 10 with length 40
      const sub = fullView.subarray(10, 50);
      const expected = nodeSha256(sub);
      const actual = sha256Sync(sub);
      expect(actual).toBe(expected);
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 2: Unicode & Multi-Byte UTF-8 Boundary Stress
  // --------------------------------------------------------------------------
  describe('Dimension 2: Unicode, Multilingual & Surrogate Pairs Stress', () => {
    const testCases = [
      { name: 'Pure ASCII', text: 'GST Billing Vyapar Pro 2026' },
      { name: 'Latin-1 Accents', text: 'Crédit Débit Facture Añadir Über' },
      { name: 'Indian Devanagari (3-byte)', text: 'व्यापार बिलिंग और लेखांकन प्रणाली' },
      { name: 'Indian Rupee Symbol', text: '₹ 1,50,000.00 Net Payable' },
      { name: 'CJK Characters (3-byte)', text: '税务发票管理系统' },
      { name: 'Arabic Script (2-byte)', text: 'نظام الفوترة والمحاسبة' },
      { name: '4-byte Emojis (Surrogate Pairs)', text: '🚀💳🛒📦📊💰🎉' },
      { name: 'Complex Flag Emojis (Multiple surrogates)', text: '🇮🇳 GST India 🇮🇳' },
      { name: 'Combined Family Emoji sequence', text: 'Family: 👨‍👩‍👧‍👦 POS Counter' },
    ];

    for (const { name, text } of testCases) {
      it(`computes exact UTF-8 hash for ${name}`, () => {
        const expected = nodeSha256(text);
        const actualSync = sha256Sync(text);
        expect(actualSync).toBe(expected);
      });
    }

    it('verifies fallback UTF-8 encoder produces identical hashes when TextEncoder is undefined', () => {
      const originalTextEncoder = globalThis.TextEncoder;
      try {
        // Temporarily undefine TextEncoder to force the fallback encoder in crypto.ts:toBytes
        (globalThis as any).TextEncoder = undefined;

        for (const { name, text } of testCases) {
          const expected = nodeSha256(text);
          const fallbackHash = sha256Sync(text);
          expect(fallbackHash, `Fallback encoder failed on ${name}`).toBe(expected);
        }
      } finally {
        globalThis.TextEncoder = originalTextEncoder;
      }
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 3: Non-Secure Environment Simulation & Fault Injection
  // --------------------------------------------------------------------------
  describe('Dimension 3: Non-Secure Environment (LAN HTTP / undefined subtle / throwing API)', () => {
    it('seamlessly falls back when crypto.subtle is undefined', async () => {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }
      expect(globalThis.crypto?.subtle).toBeUndefined();

      const input = 'LAN_HTTP_TEST_NON_SECURE_CONTEXT';
      const expected = nodeSha256(input);
      const actual = await sha256Hex(input);
      expect(actual).toBe(expected);
    });

    it('seamlessly recovers when crypto.subtle.digest throws an unexpected error', async () => {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: {
            digest: vi.fn().mockRejectedValue(new Error('OperationError: WebCrypto disabled on insecure origin')),
          },
          configurable: true,
          writable: true,
        });
      }

      const input = 'FAULT_INJECTION_SUBTLE_ERROR';
      const expected = nodeSha256(input);
      const actual = await sha256Hex(input);
      expect(actual).toBe(expected);
    });

    it('recovers when globalThis.crypto is completely undefined', async () => {
      // Simulate environment without global crypto object
      const original = (globalThis as any).crypto;
      try {
        delete (globalThis as any).crypto;
        expect((globalThis as any).crypto).toBeUndefined();

        const input = 'NO_GLOBAL_CRYPTO_FALLBACK';
        const expected = nodeSha256(input);
        const actual = await sha256Hex(input);
        expect(actual).toBe(expected);

        // Also test generateRandomSalt fallback to Math.random
        const salt = generateRandomSalt(16);
        expect(salt.length).toBe(32);
        expect(/^[0-9a-f]{32}$/.test(salt)).toBe(true);
      } finally {
        (globalThis as any).crypto = original;
      }
    });

    it('generateRandomSalt handles zero, default, and custom byte lengths', () => {
      expect(generateRandomSalt(0)).toBe('');
      expect(generateRandomSalt(8).length).toBe(16);
      expect(generateRandomSalt(16).length).toBe(32);
      expect(generateRandomSalt(32).length).toBe(64);
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 4: RBAC PIN Authentication & Lockout Under Insecure LAN Context
  // --------------------------------------------------------------------------
  describe('Dimension 4: RBAC PIN Security & Brute-Force Lockout in Non-Secure LAN', () => {
    beforeEach(() => {
      // Simulate non-secure context
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }
      mockStorage.clear();
      rbac.reloadFromStorage();
    });

    it('authenticates all default users with standard PINs in non-secure context', async () => {
      // Owner (PIN: 1234)
      const ownerAuth = await rbac.verifyPin('user_owner', '1234');
      expect(ownerAuth).toBe(true);

      // Cashier (PIN: 0000)
      const cashierAuth = await rbac.verifyPin('user_cashier', '0000');
      expect(cashierAuth).toBe(true);

      // Accountant (PIN: 9999)
      const caAuth = await rbac.verifyPin('user_ca', '9999');
      expect(caAuth).toBe(true);
    });

    it('rejects incorrect PINs and applies timingSafeEqual', async () => {
      const badPin = await rbac.verifyPin('user_owner', '9999');
      expect(badPin).toBe(false);

      expect(timingSafeEqual('abcdef', 'abcdef')).toBe(true);
      expect(timingSafeEqual('abcdef', 'abcdeg')).toBe(false);
      expect(timingSafeEqual('abcdef', 'abcde')).toBe(false);
      expect(timingSafeEqual('', '')).toBe(true);
    });

    it('transparently migrates legacy user with plaintext PIN on first authentication', async () => {
      // Inject legacy user with plaintext pin and no hash/salt
      const legacyUsers = [
        {
          id: 'user_legacy',
          name: 'Legacy Cashier',
          role: 'CASHIER',
          pin: '7777',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      mockStorage.setItem('vyapar_custom_users', JSON.stringify(legacyUsers));
      rbac.reloadFromStorage();

      // Authenticate with legacy plaintext pin
      const auth = await rbac.verifyPin('user_legacy', '7777');
      expect(auth).toBe(true);

      // Inspect persisted users: plaintext pin must be deleted, pinSalt and pinHash must be populated
      const savedRaw = mockStorage.getItem('vyapar_custom_users');
      expect(savedRaw).not.toBeNull();
      const savedUsers = JSON.parse(savedRaw!);
      const migrated = savedUsers.find((u: any) => u.id === 'user_legacy');
      expect(migrated.pin).toBeUndefined();
      expect(migrated.pinSalt).toBeDefined();
      expect(migrated.pinSalt.length).toBe(32);
      expect(migrated.pinHash).toBeDefined();
      expect(migrated.pinHash.length).toBe(64);

      // Subsequent login with new salted hash succeeds
      const secondAuth = await rbac.verifyPin('user_legacy', '7777');
      expect(secondAuth).toBe(true);
    });

    it('enforces brute-force lockout: no lockout on 1-2 attempts, lockout on 3, 5, 10 attempts', async () => {
      const userId = 'user_owner';
      rbac.resetFailedAttempts(userId);

      // Attempt 1: Failed
      await rbac.verifyPin(userId, '0001');
      expect(rbac.isUserLockedOut(userId).isLocked).toBe(false);

      // Attempt 2: Failed
      await rbac.verifyPin(userId, '0002');
      expect(rbac.isUserLockedOut(userId).isLocked).toBe(false);

      // Attempt 3: Failed -> triggers 30s lockout tier
      await rbac.verifyPin(userId, '0003');
      const lock3 = rbac.isUserLockedOut(userId);
      expect(lock3.isLocked).toBe(true);
      expect(lock3.remainingSeconds).toBeGreaterThan(0);
      expect(lock3.remainingSeconds).toBeLessThanOrEqual(30);

      // During lockout: Even CORRECT PIN '1234' is rejected!
      const blockedAuth = await rbac.verifyPin(userId, '1234');
      expect(blockedAuth).toBe(false);

      // Advance time beyond 30s lockout
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);
      expect(rbac.isUserLockedOut(userId).isLocked).toBe(false);

      // Now valid PIN succeeds
      const recoveredAuth = await rbac.verifyPin(userId, '1234');
      expect(recoveredAuth).toBe(true);
      expect(rbac.isUserLockedOut(userId).isLocked).toBe(false);

      dateNowSpy.mockRestore();
    });

    it('enforces 60s lockout tier at 5 failed attempts and 300s at 10 failed attempts', () => {
      const userId = 'user_cashier';
      rbac.resetFailedAttempts(userId);

      // Trigger 5 failed attempts
      for (let i = 0; i < 4; i++) {
        rbac.recordFailedAttempt(userId);
      }
      const attempt5 = rbac.recordFailedAttempt(userId);
      expect(attempt5.locked).toBe(true);
      expect(attempt5.lockDurationSeconds).toBe(60);

      // Trigger up to 10 failed attempts
      for (let i = 5; i < 9; i++) {
        rbac.recordFailedAttempt(userId);
      }
      const attempt10 = rbac.recordFailedAttempt(userId);
      expect(attempt10.locked).toBe(true);
      expect(attempt10.lockDurationSeconds).toBe(300);
    });

    it('allows changing PIN and validates new 4-digit PIN in non-secure context', async () => {
      const userId = 'user_owner';
      // Change PIN from 1234 to 4321
      const updateResult = await rbac.updatePin(userId, '1234', '4321');
      expect(updateResult.success).toBe(true);

      // Old PIN fails
      const oldCheck = await rbac.verifyPin(userId, '1234');
      expect(oldCheck).toBe(false);

      // New PIN succeeds
      rbac.resetFailedAttempts(userId);
      const newCheck = await rbac.verifyPin(userId, '4321');
      expect(newCheck).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 5: Audit Trail Hash Chain Integrity Under Non-Secure LAN Context
  // --------------------------------------------------------------------------
  describe('Dimension 5: MCA Audit Trail Immutability & Chain Integrity in Non-Secure Context', () => {
    beforeEach(async () => {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }
      await auditTrail._resetForTesting();
    });

    it('logs 20 sequential transactions and maintains flawless cryptographic hash chaining', async () => {
      for (let i = 1; i <= 20; i++) {
        await auditTrail.logEvent({
          actionType: i % 2 === 0 ? 'INVOICE_CREATE' : 'PAYMENT_RECORD',
          documentType: i % 2 === 0 ? 'INVOICE' : 'PAYMENT',
          documentId: `DOC_${i.toString().padStart(4, '0')}`,
          userId: 'user_owner',
          userName: 'Admin User',
          userRole: 'OWNER',
          summary: `Audit transaction #${i}`,
          previousSnapshot: i > 1 ? { step: i - 1 } : undefined,
          newSnapshot: { step: i, amount: i * 500 },
        });
      }

      await auditTrail.waitForIdle();
      const records = await auditTrail.getAuditTrail();
      expect(records.length).toBe(20);

      // Genesis check
      expect(records[0].previousHash).toBe(GENESIS_PREVIOUS_HASH);
      expect(records[0].sequence).toBe(1);

      // Monotonic sequence and hash link check
      for (let i = 1; i < records.length; i++) {
        expect(records[i].sequence).toBe(i + 1);
        expect(records[i].previousHash).toBe(records[i - 1].recordHash);
      }

      // Verify chain integrity via service
      const verifyResult = await auditTrail.verifyChainIntegrity();
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.totalRecords).toBe(20);
    });

    it('detects tampering with record payload (summary mutation)', async () => {
      await auditTrail.logEvent({
        actionType: 'INVOICE_CREATE',
        documentType: 'INVOICE',
        documentId: 'INV_001',
        userId: 'user_owner',
        userName: 'Admin',
        userRole: 'OWNER',
        summary: 'Original Summary',
      });
      await auditTrail.logEvent({
        actionType: 'INVOICE_UPDATE',
        documentType: 'INVOICE',
        documentId: 'INV_001',
        userId: 'user_owner',
        userName: 'Admin',
        userRole: 'OWNER',
        summary: 'Second Event',
      });

      await auditTrail.waitForIdle();
      const records = await auditTrail.getAuditTrail();

      // Tamper with record #1 summary
      records[0].summary = 'TAMPERED_SUMMARY_ATTACK';
      auditTrail._setRecordsForTesting(records);

      const verifyResult = await auditTrail.verifyChainIntegrity();
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.brokenSequence).toBe(1);
      expect(verifyResult.reason).toContain('Corrupted payload');
    });

    it('detects tampering with previousHash linkage', async () => {
      await auditTrail.logEvent({
        actionType: 'INVOICE_CREATE',
        documentType: 'INVOICE',
        documentId: 'INV_001',
        userId: 'user_owner',
        userName: 'Admin',
        userRole: 'OWNER',
        summary: 'First Event',
      });
      await auditTrail.logEvent({
        actionType: 'INVOICE_CREATE',
        documentType: 'INVOICE',
        documentId: 'INV_002',
        userId: 'user_owner',
        userName: 'Admin',
        userRole: 'OWNER',
        summary: 'Second Event',
      });

      await auditTrail.waitForIdle();
      const records = await auditTrail.getAuditTrail();

      // Corrupt previousHash on record #2
      records[1].previousHash = 'f'.repeat(64);
      auditTrail._setRecordsForTesting(records);

      const verifyResult = await auditTrail.verifyChainIntegrity();
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.brokenSequence).toBe(2);
      expect(verifyResult.reason).toContain('Broken cryptographic hash chain');
    });

    it('detects record omission or deletion (sequence gap)', async () => {
      for (let i = 1; i <= 3; i++) {
        await auditTrail.logEvent({
          actionType: 'INVOICE_CREATE',
          documentType: 'INVOICE',
          documentId: `INV_${i}`,
          userId: 'user_owner',
          userName: 'Admin',
          userRole: 'OWNER',
          summary: `Event ${i}`,
        });
      }

      await auditTrail.waitForIdle();
      const records = await auditTrail.getAuditTrail();

      // Delete record #2 from chain
      const corrupted = [records[0], records[2]];
      auditTrail._setRecordsForTesting(corrupted);

      const verifyResult = await auditTrail.verifyChainIntegrity();
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.reason).toContain('Sequence break');
    });

    it('strictly enforces MCA Rule 3(1) immutability: throws on update/delete/purge/clear', () => {
      expect(() => auditTrail.updateRecord('audit_1', {})).toThrow(/Audit records are immutable/);
      expect(() => auditTrail.deleteRecord('audit_1')).toThrow(/Audit trail cannot be purged or deleted/);
      expect(() => auditTrail.purge()).toThrow(/Audit trail cannot be purged or deleted/);
      expect(() => auditTrail.clear()).toThrow(/Audit trail cannot be purged or deleted/);
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 6: UpdateService Binary APK Checksum Under Non-Secure Context
  // --------------------------------------------------------------------------
  describe('Dimension 6: UpdateService Checksum Calculation in Non-Secure Context', () => {
    it('calculates exact SHA-256 for binary APK payload ArrayBuffers', async () => {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }

      const binaryData = new Uint8Array(2048);
      for (let i = 0; i < binaryData.length; i++) {
        binaryData[i] = (i * 17) & 0xff;
      }

      const expected = nodeSha256(binaryData);
      const calculated = await updateService.calculateSha256(binaryData.buffer);

      expect(calculated).toBe(expected);
      expect(calculated.length).toBe(64);
    });
  });
});
