import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
import { rbac, hashPin, generateSalt } from '../services/rbac.ts';
import { auditTrail, computeSha256Hex } from '../services/auditTrail.ts';
import { updateService } from '../services/updateService.ts';

describe('Web Crypto Fallback & Pure-JS SHA-256 Resilience (R1)', () => {
  const originalSubtle = globalThis.crypto?.subtle;
  const originalGetRandomValues = globalThis.crypto?.getRandomValues;

  afterEach(() => {
    // Restore original globals
    if (originalSubtle && globalThis.crypto) {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        value: originalSubtle,
        configurable: true,
        writable: true,
      });
    }
    if (originalGetRandomValues && globalThis.crypto) {
      Object.defineProperty(globalThis.crypto, 'getRandomValues', {
        value: originalGetRandomValues,
        configurable: true,
        writable: true,
      });
    }
  });

  describe('Pure-JS SHA-256 NIST & Boundary Test Vectors', () => {
    it('computes correct digest for empty string', () => {
      const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      expect(sha256Sync('')).toBe(expected);
    });

    it('computes correct digest for standard NIST test vector "abc"', () => {
      const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
      expect(sha256Sync('abc')).toBe(expected);
    });

    it('computes correct digest for multi-block 56-byte message', () => {
      const input = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
      const expected = '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1';
      expect(sha256Sync(input)).toBe(expected);
    });

    it('computes correct digest for Uint8Array and ArrayBuffer inputs', () => {
      const data = new TextEncoder().encode('Hello WebCrypto Fallback!');
      const hash1 = sha256Sync(data);
      const hash2 = sha256Sync(data.buffer);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });
  });

  describe('Non-Secure LAN Context (crypto.subtle === undefined)', () => {
    beforeEach(() => {
      // Simulate non-secure context (e.g. http://192.168.1.50:3000)
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }
    });

    it('sha256Hex seamlessly falls back to pure-JS when crypto.subtle is undefined', async () => {
      expect(globalThis.crypto.subtle).toBeUndefined();
      const digest = await sha256Hex('abc');
      expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('hashPin works correctly without crypto.subtle and matches standard RBAC hashes', async () => {
      const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const pin = '1234';
      const hash = await hashPin(pin, salt);
      expect(hash).toBe('a8d95645cde5b3a7366b40ff0840ab6bdad05dec7e6c221d86fd500c57397e60');
    });

    it('RBAC authentication succeeds without throwing TypeError or locking user out', async () => {
      // Reset lockout state
      testStorage.clear();
      const authResult = await rbac.verifyPin('user_owner', '1234');
      expect(authResult).toBe(true);
      expect(rbac.getActiveUser()?.role).toBe('OWNER');
    });

    it('Audit trail computeSha256Hex and logging work without Node crypto or crypto.subtle', async () => {
      const digest = await computeSha256Hex('test-audit-payload');
      expect(digest.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(digest)).toBe(true);

      const logRecord = await auditTrail.logEvent({
        actionType: 'SETTINGS_UPDATE',
        documentType: 'SETTINGS',
        documentId: 'test_company',
        userId: 'user_owner',
        userName: 'Admin',
        userRole: 'OWNER',
        summary: 'Updated company settings in non-secure context',
        previousSnapshot: { name: 'Old Company' },
        newSnapshot: { name: 'New Company' },
      });

      expect(logRecord.recordHash.length).toBe(64);
      expect(logRecord.sequence).toBeGreaterThanOrEqual(1);

      const verification = await auditTrail.verifyChainIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBeGreaterThanOrEqual(1);
    });

    it('updateService.calculateSha256 correctly calculates hash for ArrayBuffer without crypto.subtle', async () => {
      const buffer = new TextEncoder().encode('android-apk-payload').buffer;
      const hash = await updateService.calculateSha256(buffer);
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });
  });

  describe('Random Salt Generator Resilience', () => {
    it('generates 32-character hex string when getRandomValues is available', () => {
      const salt = generateRandomSalt(16);
      expect(salt.length).toBe(32);
      expect(/^[0-9a-f]{32}$/.test(salt)).toBe(true);
    });

    it('generates 32-character hex string when getRandomValues is undefined (Math.random fallback)', () => {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'getRandomValues', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }
      const salt = generateRandomSalt(16);
      expect(salt.length).toBe(32);
      expect(/^[0-9a-f]{32}$/.test(salt)).toBe(true);
    });
  });
});
