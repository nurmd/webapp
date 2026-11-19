import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hashPin,
  verifyPin,
  DEFAULT_USERS,
  UserProfile,
  RbacService,
} from '../services/rbac.ts';
import { pbkdf2Hex, sha256Hex } from '../core/utils/crypto.ts';

// In-memory localStorage mock for node / test environments
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

describe('RBAC PBKDF2-SHA-256 PIN Hashing & Transparent Migration (4.12)', () => {
  const originalStorage = globalThis.localStorage;
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('1. hashPin with a known salt produces a 64-char hex string and is deterministic', async () => {
    const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const pin = '1234';

    const hash1 = await hashPin(pin, salt);
    const hash2 = await hashPin(pin, salt);

    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBe(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash1).toBe(hash2);
  });

  it('2. PBKDF2 hash differs from the legacy single-round SHA-256 of salt+pin', async () => {
    const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const pin = '1234';

    const legacySingleRoundSha256 = await sha256Hex(salt + pin);
    const pbkdf2Derived = await hashPin(pin, salt);

    expect(legacySingleRoundSha256).toBe(
      'a8d95645cde5b3a7366b40ff0840ab6bdad05dec7e6c221d86fd500c57397e60'
    );
    expect(pbkdf2Derived.length).toBe(64);
    expect(pbkdf2Derived).not.toBe(legacySingleRoundSha256);
  });

  it('3. verifyPin accepts the correct PIN and rejects a wrong one for a PBKDF2 profile', async () => {
    const salt = 'c0ffee112233445566778899aabbccdd';
    const pin = '4321';
    const pbkdf2Hash = await hashPin(pin, salt);

    const user: UserProfile = {
      id: 'user_pbkdf2_test',
      name: 'PBKDF2 User',
      role: 'CASHIER',
      pinHash: pbkdf2Hash,
      pinSalt: salt,
      pinAlgo: 'pbkdf2',
      createdAt: '2026-11-19T00:00:00.000Z',
    };

    const isCorrectValid = await verifyPin('4321', user);
    expect(isCorrectValid).toBe(true);

    const isWrongValid = await verifyPin('9999', user);
    expect(isWrongValid).toBe(false);
  });

  it('4. legacy sha256 profile: first successful verify migrates to pbkdf2 (pinAlgo === "pbkdf2") and the stored hash changes; subsequent verify uses PBKDF2', async () => {
    const salt = '1a2b3c4d5e6f708192a3b4c5d6e7f809';
    const pin = '9999';
    const legacyHash = await sha256Hex(salt + pin);

    const user: UserProfile = {
      id: 'user_legacy_migrate',
      name: 'Legacy Profile',
      role: 'ACCOUNTANT',
      pinHash: legacyHash,
      pinSalt: salt,
      pinAlgo: 'sha256',
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    expect(user.pinAlgo).toBe('sha256');
    expect(user.pinHash).toBe(legacyHash);

    // First successful verification triggers transparent migration
    const firstVerify = await verifyPin(pin, user);
    expect(firstVerify).toBe(true);
    expect(user.pinAlgo).toBe('pbkdf2');
    expect(user.pinHash).not.toBe(legacyHash);
    expect(user.pinHash?.length).toBe(64);

    const migratedHash = user.pinHash;

    // Subsequent verification uses PBKDF2
    const secondVerify = await verifyPin(pin, user);
    expect(secondVerify).toBe(true);
    expect(user.pinHash).toBe(migratedHash);

    const wrongVerify = await verifyPin('0000', user);
    expect(wrongVerify).toBe(false);
  });

  it('5. wrong PIN on a legacy profile does not migrate and keeps pinAlgo === "sha256"', async () => {
    const salt = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
    const correctPin = '0000';
    const legacyHash = await sha256Hex(salt + correctPin);

    const user: UserProfile = {
      id: 'user_legacy_wrong',
      name: 'Legacy Wrong Attempt',
      role: 'CASHIER',
      pinHash: legacyHash,
      pinSalt: salt,
      pinAlgo: 'sha256',
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    const wrongVerify = await verifyPin('1111', user);
    expect(wrongVerify).toBe(false);
    expect(user.pinAlgo).toBe('sha256');
    expect(user.pinHash).toBe(legacyHash);
  });

  it('6. pbkdf2Hex returns 64 hex chars and is deterministic; fallback path (mock subtle undefined) still returns a stable hash', async () => {
    const password = 'mySecretPin';
    const salt = 'randomSaltHex123';

    // Standard Web Crypto path
    const hashA = await pbkdf2Hex(password, salt, 100);
    const hashB = await pbkdf2Hex(password, salt, 100);

    expect(hashA.length).toBe(64);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashA).toBe(hashB);

    // Test fallback when crypto.subtle is undefined
    const originalSubtle = globalThis.crypto?.subtle;
    try {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }

      const fallback1 = await pbkdf2Hex(password, salt, 100);
      const fallback2 = await pbkdf2Hex(password, salt, 100);

      expect(fallback1.length).toBe(64);
      expect(fallback1).toMatch(/^[0-9a-f]{64}$/);
      expect(fallback1).toBe(fallback2);
    } finally {
      if (globalThis.crypto) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          value: originalSubtle,
          configurable: true,
          writable: true,
        });
      }
    }
  });

  it('7. no plaintext PIN is ever persisted (pin field deleted after migration)', async () => {
    const legacyUsersWithPlaintext = [
      {
        id: 'user_plain_1',
        name: 'Plaintext User',
        role: 'OWNER',
        pin: '1234',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    mockStorage.setItem('vyapar_custom_users', JSON.stringify(legacyUsersWithPlaintext));

    const rbacService = new RbacService();
    const authSuccess = await rbacService.verifyPin('user_plain_1', '1234');
    expect(authSuccess).toBe(true);

    const persistedJson = mockStorage.getItem('vyapar_custom_users') || '';
    expect(persistedJson).not.toContain('"pin":"1234"');
    expect(persistedJson).not.toContain('"pin":');
    expect(persistedJson).toContain('"pinAlgo":"pbkdf2"');
    expect(persistedJson).toContain('"pinHash":');
    expect(persistedJson).toContain('"pinSalt":');

    const migratedUser = rbacService.getUsers().find((u) => u.id === 'user_plain_1');
    expect(migratedUser?.pin).toBeUndefined();
    expect(migratedUser?.pinAlgo).toBe('pbkdf2');
  });
});
