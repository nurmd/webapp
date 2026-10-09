/**
 * src/__tests__/challenger1PinSecurity.test.ts
 *
 * Milestone 2 Challenger 1: Adversarial Cryptographic Security & Lockout Verification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rbac,
  RbacService,
  generateSalt,
  hashPin,
  timingSafeEqual,
  UserProfile,
} from '../services/rbac.ts';

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

describe('Challenger 1 Adversarial Security Harness (Milestone 2 - R3)', () => {
  beforeEach(() => {
    testStorage.clear();
    rbac.reloadFromStorage();
    vi.restoreAllMocks();
  });

  describe('Adversarial Salt Randomness & Distribution', () => {
    it('generates 5,000 salts with zero collisions and exact 32 lowercase hex characters', () => {
      const COUNT = 5_000;
      const set = new Set<string>();
      const charFreq = new Map<string, number>();
      for (const c of '0123456789abcdef') charFreq.set(c, 0);

      for (let i = 0; i < COUNT; i++) {
        const salt = generateSalt(16);
        expect(salt.length).toBe(32);
        expect(salt).toMatch(/^[0-9a-f]{32}$/);
        set.add(salt);
        for (const ch of salt) {
          charFreq.set(ch, (charFreq.get(ch) || 0) + 1);
        }
      }

      expect(set.size).toBe(COUNT);

      // Chi-squared test for hex character distribution
      const expected = (COUNT * 32) / 16;
      let chiSquare = 0;
      for (const [, cnt] of charFreq.entries()) {
        chiSquare += Math.pow(cnt - expected, 2) / expected;
      }
      expect(chiSquare).toBeLessThan(37.7); // p=0.001 critical value for df=15
    });

    it('handles extreme salt byte lengths safely', () => {
      expect(generateSalt(0)).toBe('');
      expect(generateSalt(1).length).toBe(2);
      expect(generateSalt(32).length).toBe(64);
      expect(generateSalt(64).length).toBe(128);
    });
  });

  describe('timingSafeEqual Constant-Time & Bit-Flipping Matrix', () => {
    const baseHash = 'a8d95645cde5b3a7366b40ff0840ab6bdad05dec7e6c221d86fd500c57397e60';

    it('validates identity and rejects length mismatches', () => {
      expect(timingSafeEqual('', '')).toBe(true);
      expect(timingSafeEqual(baseHash, baseHash)).toBe(true);
      expect(timingSafeEqual(baseHash, baseHash.slice(0, 32))).toBe(false);
      expect(timingSafeEqual(baseHash, baseHash + '0')).toBe(false);
      expect(timingSafeEqual('', 'a')).toBe(false);
    });

    it('rejects bit-flips across all 64 character positions', () => {
      for (let pos = 0; pos < 64; pos++) {
        for (const bit of [1, 2, 4]) {
          const charCode = baseHash.charCodeAt(pos) ^ bit;
          const flipped = baseHash.slice(0, pos) + String.fromCharCode(charCode) + baseHash.slice(pos + 1);
          expect(timingSafeEqual(baseHash, flipped)).toBe(false);
        }
      }
    });

    it('safely handles non-string inputs without throwing', () => {
      // @ts-expect-error non-string
      expect(timingSafeEqual(null, baseHash)).toBe(false);
      // @ts-expect-error non-string
      expect(timingSafeEqual(baseHash, undefined)).toBe(false);
      // @ts-expect-error non-string
      expect(timingSafeEqual(1234, 1234)).toBe(false);
      // @ts-expect-error non-string
      expect(timingSafeEqual({}, {})).toBe(false);
    });
  });

  describe('Progressive Lockout Escalation & Rapid Brute Force', () => {
    it('escalates progressively across tiers 0, 1, 2, and 3', () => {
      const userId = 'victim_user';

      // Attempts 1 and 2: no lockout
      expect(rbac.recordFailedAttempt(userId).locked).toBe(false);
      expect(rbac.recordFailedAttempt(userId).locked).toBe(false);
      expect(rbac.isUserLockedOut(userId).isLocked).toBe(false);

      // Attempt 3: Tier 1 (30s)
      const a3 = rbac.recordFailedAttempt(userId);
      expect(a3.locked).toBe(true);
      expect(a3.lockDurationSeconds).toBe(30);

      // Attempt 4: Tier 1 (30s)
      const a4 = rbac.recordFailedAttempt(userId);
      expect(a4.locked).toBe(true);
      expect(a4.lockDurationSeconds).toBe(30);

      // Attempt 5: Tier 2 (60s)
      const a5 = rbac.recordFailedAttempt(userId);
      expect(a5.locked).toBe(true);
      expect(a5.lockDurationSeconds).toBe(60);

      // Attempts 6-9: Tier 2 (60s)
      for (let i = 6; i <= 9; i++) {
        expect(rbac.recordFailedAttempt(userId).lockDurationSeconds).toBe(60);
      }

      // Attempt 10: Tier 3 (300s)
      const a10 = rbac.recordFailedAttempt(userId);
      expect(a10.locked).toBe(true);
      expect(a10.lockDurationSeconds).toBe(300);
      expect(rbac.isUserLockedOut(userId).remainingSeconds).toBeGreaterThan(290);
    });

    it('rapid hammering of 50 failed attempts keeps lock duration pegged at 300s and blocks valid PIN', async () => {
      for (let i = 0; i < 50; i++) {
        await rbac.verifyPin('user_owner', '9999');
      }

      const status = rbac.isUserLockedOut('user_owner');
      expect(status.isLocked).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThan(290);

      // Even correct PIN fails during lockout
      expect(await rbac.verifyPin('user_owner', '1234')).toBe(false);

      const switchRes = await rbac.switchUser('user_owner', '1234');
      expect(switchRes.success).toBe(false);
      expect(switchRes.error).toContain('Account locked');
      expect(switchRes.remainingSeconds).toBeGreaterThan(0);
    });
  });

  describe('Multi-User Lockout Isolation Under Concurrent Attacks', () => {
    it('maintains strict isolation across 5 users under interleaved brute-force attacks', async () => {
      const users: UserProfile[] = [
        { id: 'usr_clean', name: 'Clean User', role: 'CASHIER', createdAt: new Date().toISOString() },
        { id: 'usr_sub', name: 'Sub-Threshold User', role: 'CASHIER', createdAt: new Date().toISOString() },
        { id: 'usr_t1', name: 'Tier 1 User', role: 'ACCOUNTANT', createdAt: new Date().toISOString() },
        { id: 'usr_t2', name: 'Tier 2 User', role: 'ACCOUNTANT', createdAt: new Date().toISOString() },
        { id: 'usr_t3', name: 'Tier 3 User', role: 'OWNER', createdAt: new Date().toISOString() },
      ];

      for (const u of users) {
        const salt = generateSalt(16);
        u.pinSalt = salt;
        u.pinHash = await hashPin('2222', salt);
      }

      testStorage.setItem('vyapar_custom_users', JSON.stringify(users));
      rbac.reloadFromStorage();

      // Interleaved failed attempts
      // usr_sub: 2 failed
      await rbac.verifyPin('usr_sub', 'wrong');
      await rbac.verifyPin('usr_sub', 'wrong');

      // usr_t1: 3 failed
      for (let i = 0; i < 3; i++) await rbac.verifyPin('usr_t1', 'wrong');

      // usr_t2: 6 failed
      for (let i = 0; i < 6; i++) await rbac.verifyPin('usr_t2', 'wrong');

      // usr_t3: 12 failed
      for (let i = 0; i < 12; i++) await rbac.verifyPin('usr_t3', 'wrong');

      // Verify states
      expect(rbac.isUserLockedOut('usr_clean').isLocked).toBe(false);
      expect(rbac.isUserLockedOut('usr_sub').isLocked).toBe(false);
      expect(rbac.isUserLockedOut('usr_t1').isLocked).toBe(true);
      expect(rbac.isUserLockedOut('usr_t1').remainingSeconds).toBeLessThanOrEqual(30);

      expect(rbac.isUserLockedOut('usr_t2').isLocked).toBe(true);
      expect(rbac.isUserLockedOut('usr_t2').remainingSeconds).toBeLessThanOrEqual(60);

      expect(rbac.isUserLockedOut('usr_t3').isLocked).toBe(true);
      expect(rbac.isUserLockedOut('usr_t3').remainingSeconds).toBeLessThanOrEqual(300);

      // Clean users can authenticate
      expect(await rbac.verifyPin('usr_clean', '2222')).toBe(true);
      expect(await rbac.verifyPin('usr_sub', '2222')).toBe(true);

      // Resetting usr_t1 does not unblock usr_t2 or usr_t3
      rbac.resetFailedAttempts('usr_t1');
      expect(rbac.isUserLockedOut('usr_t1').isLocked).toBe(false);
      expect(rbac.isUserLockedOut('usr_t2').isLocked).toBe(true);
      expect(rbac.isUserLockedOut('usr_t3').isLocked).toBe(true);
    });
  });

  describe('Time Manipulation & Storage Tampering Resilience', () => {
    it('evaluates millisecond boundary and clock skew accurately', () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      rbac.recordFailedAttempt('user_owner');
      rbac.recordFailedAttempt('user_owner');
      rbac.recordFailedAttempt('user_owner'); // 30s -> lockedUntil = now + 30_000

      // At lockedUntil - 1ms
      vi.spyOn(Date, 'now').mockReturnValue(now + 29_999);
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(true);

      // At lockedUntil exactly
      vi.spyOn(Date, 'now').mockReturnValue(now + 30_000);
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(false);

      // Clock skew backward (fails closed)
      vi.spyOn(Date, 'now').mockReturnValue(now - 10_000);
      const backwardStatus = rbac.isUserLockedOut('user_owner');
      expect(backwardStatus.isLocked).toBe(true);
      expect(backwardStatus.remainingSeconds).toBe(40);
    });

    it('resists storage tampering and invalid JSON payloads without crashing', async () => {
      // Corrupt JSON in vyapar_rbac_lockout
      testStorage.setItem('vyapar_rbac_lockout', '{invalid_syntax');
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(false);

      // Corrupt primitive in vyapar_rbac_lockout
      testStorage.setItem('vyapar_rbac_lockout', '99999');
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(false);

      // Corrupt NaN lockedUntil
      testStorage.setItem('vyapar_rbac_lockout', JSON.stringify({ user_owner: { lockedUntil: 'NaN' } }));
      expect(rbac.isUserLockedOut('user_owner').isLocked).toBe(false);

      // Credential tampering in vyapar_custom_users
      const users = rbac.getUsers();
      users[0].pinHash = 'malformed_hex';
      users[1].pinSalt = '';
      testStorage.setItem('vyapar_custom_users', JSON.stringify(users));

      const service = new RbacService();
      expect(await service.verifyPin('user_owner', '1234')).toBe(false);
      expect(await service.verifyPin('user_cashier', '0000')).toBe(false);
    });

    it('supports triple-redundant storage failover across primary, alt, and per-user keys', () => {
      const service = new RbacService();
      service.recordFailedAttempt('redundant_user');
      service.recordFailedAttempt('redundant_user');
      service.recordFailedAttempt('redundant_user');

      // Primary key deleted -> fallback to alt map
      testStorage.removeItem('vyapar_rbac_lockout');
      expect(service.isUserLockedOut('redundant_user').isLocked).toBe(true);

      // Alt map deleted -> fallback to per-user key
      testStorage.removeItem('vyapar_auth_lockouts');
      expect(service.isUserLockedOut('redundant_user').isLocked).toBe(true);
    });
  });

  describe('Transparent Migration Stress', () => {
    it('migrates 50 legacy users in bulk and preserves valid authentication with zero plaintext leaks', async () => {
      const legacyList = Array.from({ length: 50 }, (_, i) => ({
        id: `bulk_user_${i}`,
        name: `Bulk User ${i}`,
        role: 'CASHIER',
        pin: String(2000 + i).padStart(4, '0'),
      }));

      testStorage.setItem('vyapar_users', JSON.stringify(legacyList));

      const service = new RbacService();
      await service.migrateLegacyPins();

      expect(testStorage.getItem('vyapar_users')).toBeNull();

      for (let i = 0; i < 50; i++) {
        const pin = String(2000 + i).padStart(4, '0');
        expect(await service.verifyPin(`bulk_user_${i}`, pin)).toBe(true);
      }

      const storedRaw = testStorage.getItem('vyapar_custom_users')!;
      expect(storedRaw).not.toContain('"pin":');
    });
  });
});
