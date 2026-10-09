import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rbac,
  RbacService,
  generateSalt,
  hashPin,
  timingSafeEqual,
  UserProfile,
} from '../services/rbac.ts';

// Comprehensive Storage Mock for consistent Node & Happy-DOM test execution
class TestStorage implements Storage {
  private store = new Map<string, string>();

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
    return Array.from(this.store.keys())[index] || null;
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

describe('Cryptographic PIN Security Hardening (Milestone 2 - R3)', () => {
  beforeEach(() => {
    testStorage.clear();
    rbac.reloadFromStorage();
  });

  // =========================================================================
  // 1. Web Crypto Salt & SHA-256 Hashing Specifications
  // =========================================================================
  describe('Web Crypto Salt & SHA-256 Hashing', () => {
    it('TC-PIN-01: generateSalt returns 32 lowercase hex characters (16 random bytes)', () => {
      const salt = generateSalt(16);
      expect(typeof salt).toBe('string');
      expect(salt.length).toBe(32);
      expect(salt).toMatch(/^[0-9a-f]{32}$/);
    });

    it('TC-PIN-02: generateSalt produces cryptographically unique values across calls', () => {
      const salts = new Set<string>();
      for (let i = 0; i < 20; i++) {
        salts.add(generateSalt(16));
      }
      expect(salts.size).toBe(20);
    });

    it('TC-PIN-03: hashPin computes deterministic 64 lowercase hex SHA-256 digest', async () => {
      const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const pin = '1234';
      const hash1 = await hashPin(pin, salt);
      const hash2 = await hashPin(pin, salt);

      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash1).toBe(hash2);
      // Precomputed SHA-256 for salt + pin
      expect(hash1).toBe('a8d95645cde5b3a7366b40ff0840ab6bdad05dec7e6c221d86fd500c57397e60');
    });

    it('TC-PIN-04: identical PINs with different salts produce distinct hashes (salt isolation)', async () => {
      const saltA = generateSalt(16);
      const saltB = generateSalt(16);
      const hashA = await hashPin('1234', saltA);
      const hashB = await hashPin('1234', saltB);

      expect(hashA).not.toBe(hashB);
    });

    it('TC-PIN-05: timingSafeEqual validates equal strings and detects unequal strings safely', () => {
      const str1 = 'a8d95645cde5b3a7366b40ff0840ab6bdad05dec7e6c221d86fd500c57397e60';
      const str2 = 'a8d95645cde5b3a7366b40ff0840ab6bdad05dec7e6c221d86fd500c57397e60';
      const str3 = '74882b345b3db7cb85075187ab8839827e0e5255de9f802a19340fd4f944a76e';

      expect(timingSafeEqual(str1, str2)).toBe(true);
      expect(timingSafeEqual(str1, str3)).toBe(false);
      expect(timingSafeEqual(str1, str1.slice(0, 32))).toBe(false);
      expect(timingSafeEqual('', '')).toBe(true);
      expect(timingSafeEqual('a', '')).toBe(false);
      // @ts-expect-error test non-string types
      expect(timingSafeEqual(null, undefined)).toBe(false);
    });
  });

  // =========================================================================
  // 2. Authentication & Verification
  // =========================================================================
  describe('Authentication & Verification', () => {
    it('TC-PIN-06: verifyPin authenticates default users with correct PINs', async () => {
      expect(await rbac.verifyPin('user_owner', '1234')).toBe(true);
      expect(await rbac.verifyPin('user_cashier', '0000')).toBe(true);
      expect(await rbac.verifyPin('user_ca', '9999')).toBe(true);
    });

    it('TC-PIN-07: verifyPin rejects incorrect PINs', async () => {
      expect(await rbac.verifyPin('user_owner', '9999')).toBe(false);
      expect(await rbac.verifyPin('user_cashier', '1234')).toBe(false);
      expect(await rbac.verifyPin('user_ca', '0000')).toBe(false);
    });

    it('TC-PIN-08: verifyPin handles leading/trailing whitespace gracefully', async () => {
      expect(await rbac.verifyPin('user_owner', '  1234  ')).toBe(true);
    });

    it('TC-PIN-09: verifyPin safely rejects malformed or non-numeric PIN inputs without crashing', async () => {
      expect(await rbac.verifyPin('user_owner', '')).toBe(false);
      expect(await rbac.verifyPin('user_owner', 'abcd')).toBe(false);
      expect(await rbac.verifyPin('user_owner', '12')).toBe(false);
      // @ts-expect-error non-string test
      expect(await rbac.verifyPin('user_owner', null)).toBe(false);
      expect(await rbac.verifyPin('non_existent_user', '1234')).toBe(false);
    });

    it('TC-PIN-10: verifyPin updates lastLogin timestamp on successful authentication', async () => {
      const before = Date.now();
      const success = await rbac.verifyPin('user_owner', '1234');
      expect(success).toBe(true);

      const owner = rbac.getUsers().find((u) => u.id === 'user_owner');
      expect(owner?.lastLogin).toBeDefined();
      const loginTime = new Date(owner!.lastLogin!).getTime();
      expect(loginTime).toBeGreaterThanOrEqual(before - 1000);
      expect(loginTime).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('TC-PIN-11: switchUser successfully switches active user when PIN is valid', async () => {
      const res = await rbac.switchUser('user_cashier', '0000');
      expect(res.success).toBe(true);
      expect(rbac.getActiveUser().id).toBe('user_cashier');
      expect(rbac.getActiveUser().role).toBe('CASHIER');
    });

    it('TC-PIN-12: switchUser returns error when PIN is incorrect and leaves active user unchanged', async () => {
      const initialUser = rbac.getActiveUser().id;
      const res = await rbac.switchUser('user_ca', '1111');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Incorrect 4-digit PIN.');
      expect(rbac.getActiveUser().id).toBe(initialUser);
    });
  });

  // =========================================================================
  // 3. PIN Management & Credential Updates
  // =========================================================================
  describe('PIN Management & Credential Updates', () => {
    it('TC-PIN-13: setPin securely updates credentials with fresh salt and hash', async () => {
      const oldOwner = rbac.getUsers().find((u) => u.id === 'user_owner')!;
      const oldHash = oldOwner.pinHash;
      const oldSalt = oldOwner.pinSalt;

      await rbac.setPin('user_owner', '5678');

      const updatedOwner = rbac.getUsers().find((u) => u.id === 'user_owner')!;
      expect(updatedOwner.pinSalt).not.toBe(oldSalt);
      expect(updatedOwner.pinHash).not.toBe(oldHash);
      expect(updatedOwner.pin).toBeUndefined();

      expect(await rbac.verifyPin('user_owner', '5678')).toBe(true);
      expect(await rbac.verifyPin('user_owner', '1234')).toBe(false);
    });

    it('TC-PIN-14: setPin enforces exactly 4 numeric digits', async () => {
      await expect(rbac.setPin('user_owner', '123')).rejects.toThrow('PIN must be exactly 4 digits.');
      await expect(rbac.setPin('user_owner', '12345')).rejects.toThrow('PIN must be exactly 4 digits.');
      await expect(rbac.setPin('user_owner', 'abcd')).rejects.toThrow('PIN must be exactly 4 digits.');
      await expect(rbac.setPin('user_owner', '')).rejects.toThrow('PIN must be exactly 4 digits.');
    });

    it('TC-PIN-15: updatePin verifies old PIN before applying new PIN', async () => {
      const failRes = await rbac.updatePin('user_cashier', 'wrong', '4444');
      expect(failRes.success).toBe(false);

      const wrongPinRes = await rbac.updatePin('user_cashier', '1111', '4444');
      expect(wrongPinRes.success).toBe(false);
      expect(wrongPinRes.error).toBe('Old PIN does not match.');

      const okRes = await rbac.updatePin('user_cashier', '0000', '4444');
      expect(okRes.success).toBe(true);
      expect(await rbac.verifyPin('user_cashier', '4444')).toBe(true);
    });
  });

  // =========================================================================
  // 4. Transparent Legacy Migration
  // =========================================================================
  describe('Transparent Legacy PIN Migration', () => {
    it('TC-PIN-16: migrateLegacyPins upgrades legacy plaintext PINs and purges plaintext keys', async () => {
      const legacyProfiles = [
        {
          id: 'user_legacy_1',
          name: 'Legacy Owner',
          role: 'OWNER',
          pin: '8888',
          avatarColor: '#006c49',
        },
      ];
      localStorage.setItem('vyapar_custom_users', JSON.stringify(legacyProfiles));

      const service = new RbacService();
      await service.migrateLegacyPins();

      const storedRaw = localStorage.getItem('vyapar_custom_users');
      expect(storedRaw).toBeDefined();
      expect(storedRaw).not.toContain('"pin":');
      expect(storedRaw).toContain('"pinHash":');
      expect(storedRaw).toContain('"pinSalt":');

      const user = service.getUsers().find((u) => u.id === 'user_legacy_1');
      expect(user?.pin).toBeUndefined();
      expect(user?.pinHash?.length).toBe(64);
      expect(user?.pinSalt?.length).toBe(32);

      // Verify user can authenticate with legacy PIN
      expect(await service.verifyPin('user_legacy_1', '8888')).toBe(true);
    });

    it('TC-PIN-17: migrateLegacyPins is idempotent and does not invalidate existing hashes', async () => {
      await rbac.migrateLegacyPins();
      const firstUsers = rbac.getUsers();
      const ownerSalt1 = firstUsers.find((u) => u.id === 'user_owner')?.pinSalt;
      const ownerHash1 = firstUsers.find((u) => u.id === 'user_owner')?.pinHash;

      // Run second migration
      await rbac.migrateLegacyPins();
      const secondUsers = rbac.getUsers();
      const ownerSalt2 = secondUsers.find((u) => u.id === 'user_owner')?.pinSalt;
      const ownerHash2 = secondUsers.find((u) => u.id === 'user_owner')?.pinHash;

      expect(ownerSalt1).toBe(ownerSalt2);
      expect(ownerHash1).toBe(ownerHash2);
      expect(await rbac.verifyPin('user_owner', '1234')).toBe(true);
    });

    it('TC-PIN-18: migrateLegacyPins converts data from legacy vyapar_users key and removes old key', async () => {
      const legacyVyaparUsers = [
        {
          id: 'user_v1',
          name: 'Old User',
          role: 'CASHIER',
          pin: '2222',
          avatarColor: '#0284c7',
        },
      ];
      localStorage.setItem('vyapar_users', JSON.stringify(legacyVyaparUsers));

      const service = new RbacService();
      await service.migrateLegacyPins();

      expect(localStorage.getItem('vyapar_users')).toBeNull();
      const customUsers = localStorage.getItem('vyapar_custom_users');
      expect(customUsers).toContain('user_v1');
      expect(customUsers).not.toContain('"pin":');
      expect(await service.verifyPin('user_v1', '2222')).toBe(true);
    });

    it('TC-PIN-19: verifyPin performs just-in-time migration if profile has not yet run startup migration', async () => {
      // Direct injection of legacy plaintext profile
      const legacyUsers: UserProfile[] = [
        {
          id: 'user_jit',
          name: 'JIT User',
          role: 'ACCOUNTANT',
          pin: '7777',
          avatarColor: '#7c3aed',
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem('vyapar_custom_users', JSON.stringify(legacyUsers));

      const service = new RbacService();
      // Directly authenticate without calling migrateLegacyPins()
      const authResult = await service.verifyPin('user_jit', '7777');
      expect(authResult).toBe(true);

      const stored = localStorage.getItem('vyapar_custom_users');
      expect(stored).not.toContain('"pin":');
      expect(stored).toContain('"pinHash":');
      expect(stored).toContain('"pinSalt":');
    });
  });

  // =========================================================================
  // 5. Brute-Force Lockout Defense & Progressive Backoff Tiers
  // =========================================================================
  describe('Brute-Force Lockout Defense & Progressive Backoff Tiers', () => {
    it('TC-PIN-20: 1 and 2 failed attempts do NOT trigger lockout (< 3 attempts)', async () => {
      await rbac.verifyPin('user_owner', 'wrong1');
      let status = rbac.isUserLockedOut('user_owner');
      expect(status.isLocked).toBe(false);
      expect(status.remainingSeconds).toBe(0);

      await rbac.verifyPin('user_owner', 'wrong2');
      status = rbac.isUserLockedOut('user_owner');
      expect(status.isLocked).toBe(false);
      expect(status.remainingSeconds).toBe(0);
    });

    it('TC-PIN-21: 3 failed attempts trigger Tier 1 lockout (30s delay)', async () => {
      for (let i = 0; i < 3; i++) {
        await rbac.verifyPin('user_owner', `wrong${i}`);
      }
      const status = rbac.isUserLockedOut('user_owner');
      expect(status.isLocked).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThanOrEqual(28);
      expect(status.remainingSeconds).toBeLessThanOrEqual(30);
    });

    it('TC-PIN-22: 4 failed attempts remain in Tier 1 lockout (30s delay)', async () => {
      for (let i = 0; i < 4; i++) {
        await rbac.verifyPin('user_owner', `wrong${i}`);
      }
      const status = rbac.isUserLockedOut('user_owner');
      expect(status.isLocked).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThanOrEqual(28);
      expect(status.remainingSeconds).toBeLessThanOrEqual(30);
    });

    it('TC-PIN-23: 5 failed attempts escalate to Tier 2 lockout (60s delay)', async () => {
      for (let i = 0; i < 5; i++) {
        await rbac.verifyPin('user_owner', `wrong${i}`);
      }
      const status = rbac.isUserLockedOut('user_owner');
      expect(status.isLocked).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThan(30);
      expect(status.remainingSeconds).toBeLessThanOrEqual(60);
    });

    it('TC-PIN-24: 10+ failed attempts escalate to Tier 3 lockout (300s / 5m delay)', async () => {
      for (let i = 0; i < 10; i++) {
        await rbac.verifyPin('user_owner', `wrong${i}`);
      }
      const status = rbac.isUserLockedOut('user_owner');
      expect(status.isLocked).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThan(60);
      expect(status.remainingSeconds).toBeLessThanOrEqual(300);
    });

    it('TC-PIN-25: locked user cannot authenticate even with correct PIN (short-circuit)', async () => {
      for (let i = 0; i < 3; i++) {
        await rbac.verifyPin('user_owner', `wrong${i}`);
      }
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(true);

      // Attempt correct PIN during lockout
      const res = await rbac.verifyPin('user_owner', '1234');
      expect(res).toBe(false);

      const switchRes = await rbac.switchUser('user_owner', '1234');
      expect(switchRes.success).toBe(false);
      expect(switchRes.error).toContain('Account locked');
      expect(switchRes.remainingSeconds).toBeGreaterThan(0);
    });

    it('TC-PIN-26: successful PIN authentication resets failed attempts and lockout', async () => {
      await rbac.verifyPin('user_owner', 'wrong1');
      await rbac.verifyPin('user_owner', 'wrong2');

      // Successful verification resets counter
      expect(await rbac.verifyPin('user_owner', '1234')).toBe(true);

      // Now next failed attempt is attempt #1, not #3
      await rbac.verifyPin('user_owner', 'wrong_again');
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(false);
    });

    it('TC-PIN-27: per-user isolation prevents User A lockout from impacting User B', async () => {
      // Lock out Owner
      for (let i = 0; i < 3; i++) {
        await rbac.verifyPin('user_owner', `wrong${i}`);
      }
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(true);

      // Cashier is NOT locked out
      expect(rbac.isUserLockedOut('user_cashier').isLocked).toBe(false);
      expect(await rbac.verifyPin('user_cashier', '0000')).toBe(true);
    });

    it('TC-PIN-28: lockout state persists in localStorage across service reloads', async () => {
      for (let i = 0; i < 3; i++) {
        await rbac.verifyPin('user_owner', `wrong${i}`);
      }
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(true);

      // Verify persistent storage key exists
      const lockoutRaw = localStorage.getItem('vyapar_rbac_lockout');
      expect(lockoutRaw).toBeDefined();
      expect(lockoutRaw).toContain('user_owner');

      // Create a brand new RbacService instance
      const freshService = new RbacService();
      const status = freshService.isUserLockedOut('user_owner');
      expect(status.isLocked).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThan(0);
    });

    it('TC-PIN-29: lockout expires after cooldown duration passes', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      rbac.recordFailedAttempt('user_owner');
      rbac.recordFailedAttempt('user_owner');
      rbac.recordFailedAttempt('user_owner'); // 30s lock

      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(true);

      // Advance time past 30 seconds
      vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(false);
      expect(rbac.isUserLockedOut('user_owner').remainingSeconds).toBe(0);

      vi.restoreAllMocks();
    });
  });

  // =========================================================================
  // 6. Role-Based Access Control Permissions (Owner Enforcement)
  // =========================================================================
  describe('RBAC Permission Helpers', () => {
    it('TC-PIN-30: OWNER role is permitted for all deletions and settings operations', () => {
      expect(rbac.canDeleteInvoice('OWNER')).toBe(true);
      expect(rbac.canDeletePurchase('OWNER')).toBe(true);
      expect(rbac.canDeleteExpense('OWNER')).toBe(true);
      expect(rbac.canDeleteParty('OWNER')).toBe(true);
      expect(rbac.canDeleteItem('OWNER')).toBe(true);
      expect(rbac.canDeleteBankAccount('OWNER')).toBe(true);
      expect(rbac.canDeleteCashBankTxn('OWNER')).toBe(true);
      expect(rbac.canDeleteTransaction('OWNER')).toBe(true);
      expect(rbac.canDeleteVoucher('OWNER')).toBe(true);
      expect(rbac.canEditCompanySettings('OWNER')).toBe(true);
      expect(rbac.isOwner('OWNER')).toBe(true);
    });

    it('TC-PIN-31: CASHIER role is rejected for all sensitive deletions and settings', () => {
      expect(rbac.canDeleteInvoice('CASHIER')).toBe(false);
      expect(rbac.canDeletePurchase('CASHIER')).toBe(false);
      expect(rbac.canDeleteExpense('CASHIER')).toBe(false);
      expect(rbac.canDeleteParty('CASHIER')).toBe(false);
      expect(rbac.canDeleteItem('CASHIER')).toBe(false);
      expect(rbac.canDeleteBankAccount('CASHIER')).toBe(false);
      expect(rbac.canDeleteCashBankTxn('CASHIER')).toBe(false);
      expect(rbac.canDeleteTransaction('CASHIER')).toBe(false);
      expect(rbac.canDeleteVoucher('CASHIER')).toBe(false);
      expect(rbac.canEditCompanySettings('CASHIER')).toBe(false);
      expect(rbac.isOwner('CASHIER')).toBe(false);
    });

    it('TC-PIN-32: ACCOUNTANT role is rejected for all sensitive deletions and settings', () => {
      expect(rbac.canDeleteInvoice('ACCOUNTANT')).toBe(false);
      expect(rbac.canDeletePurchase('ACCOUNTANT')).toBe(false);
      expect(rbac.canDeleteExpense('ACCOUNTANT')).toBe(false);
      expect(rbac.canDeleteParty('ACCOUNTANT')).toBe(false);
      expect(rbac.canDeleteItem('ACCOUNTANT')).toBe(false);
      expect(rbac.canDeleteBankAccount('ACCOUNTANT')).toBe(false);
      expect(rbac.canDeleteCashBankTxn('ACCOUNTANT')).toBe(false);
      expect(rbac.canDeleteTransaction('ACCOUNTANT')).toBe(false);
      expect(rbac.canDeleteVoucher('ACCOUNTANT')).toBe(false);
      expect(rbac.canEditCompanySettings('ACCOUNTANT')).toBe(false);
      expect(rbac.isOwner('ACCOUNTANT')).toBe(false);
    });
  });

  // =========================================================================
  // 7. Tamper Resistance
  // =========================================================================
  describe('Tamper Resistance', () => {
    it('TC-PIN-33: corrupted pinHash fails authentication safely without exceptions', async () => {
      const users = rbac.getUsers();
      const owner = users.find((u) => u.id === 'user_owner')!;
      owner.pinHash = 'corrupted_hash_string_that_does_not_match';
      localStorage.setItem('vyapar_custom_users', JSON.stringify(users));

      const service = new RbacService();
      expect(await service.verifyPin('user_owner', '1234')).toBe(false);
    });

    it('TC-PIN-34: missing or corrupted pinSalt fails authentication safely', async () => {
      const users = rbac.getUsers();
      const owner = users.find((u) => u.id === 'user_owner')!;
      delete owner.pinSalt;
      localStorage.setItem('vyapar_custom_users', JSON.stringify(users));

      const service = new RbacService();
      expect(await service.verifyPin('user_owner', '1234')).toBe(false);
    });
  });
});
