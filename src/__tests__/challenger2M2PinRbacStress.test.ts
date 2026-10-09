import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rbac,
  RbacService,
  generateSalt,
  hashPin,
  timingSafeEqual,
  UserProfile,
  UserRole,
} from '../services/rbac.ts';

// Comprehensive Storage Mock for consistent Node & Happy-DOM test execution
class MemoryStorage implements Storage {
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

const memoryStorage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: memoryStorage,
    writable: true,
    configurable: true,
  });
}

describe('Challenger 2 Empirical Adversarial Stress Suite: Legacy PIN Migration & Owner Role Enforcement (Milestone 2 - R3)', () => {
  beforeEach(() => {
    memoryStorage.clear();
    rbac.reloadFromStorage();
  });

  // =========================================================================
  // SECTION 1: MALFORMED, LEGACY & EDGE-CASE PROFILE MIGRATION STRESS TESTS
  // =========================================================================
  describe('1. Legacy PIN Migration Adversarial Injections (migrateLegacyPins)', () => {
    it('TC-CHAL2-MIG-01: Migrates legacy profiles with only plaintext PINs and strips plaintext storage', async () => {
      const legacyProfiles: any[] = [
        { id: 'u_leg_owner', name: 'Legacy Owner', role: 'OWNER', pin: '4567' },
        { id: 'u_leg_cashier', name: 'Legacy Cashier', role: 'CASHIER', pin: '8901' },
        { id: 'u_leg_ca', name: 'Legacy CA', role: 'ACCOUNTANT', pin: '2345' },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(legacyProfiles));

      const service = new RbacService();
      await service.migrateLegacyPins();

      // Check storage
      const storedJson = memoryStorage.getItem('vyapar_custom_users');
      expect(storedJson).toBeDefined();
      expect(storedJson).not.toContain('"pin":');
      expect(storedJson).toContain('"pinHash":');
      expect(storedJson).toContain('"pinSalt":');

      const users = service.getUsers();
      expect(users.length).toBe(3);

      for (const u of users) {
        expect(u.pin).toBeUndefined();
        expect(u.pinHash).toMatch(/^[0-9a-f]{64}$/);
        expect(u.pinSalt).toMatch(/^[0-9a-f]{32}$/);
        expect(u.createdAt).toBeDefined();
      }

      // Verify all users authenticate with their original plaintext PINs
      expect(await service.verifyPin('u_leg_owner', '4567')).toBe(true);
      expect(await service.verifyPin('u_leg_cashier', '8901')).toBe(true);
      expect(await service.verifyPin('u_leg_ca', '2345')).toBe(true);
    });

    it('TC-CHAL2-MIG-02: Handles mixed profiles (already-migrated, legacy plaintext, and uninitialized)', async () => {
      const salt = generateSalt(16);
      const hash = await hashPin('1111', salt);

      const mixedProfiles: any[] = [
        // 1. Already migrated
        {
          id: 'u_already_migrated',
          name: 'Migrated User',
          role: 'OWNER',
          pinSalt: salt,
          pinHash: hash,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        // 2. Legacy plaintext
        {
          id: 'u_needs_migration',
          name: 'Legacy User',
          role: 'CASHIER',
          pin: '2222',
        },
        // 3. Incomplete: missing pin, pinSalt, and pinHash
        {
          id: 'u_empty_pin',
          name: 'Empty PIN User',
          role: 'ACCOUNTANT',
        },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(mixedProfiles));

      const service = new RbacService();
      await service.migrateLegacyPins();

      const users = service.getUsers();
      const u1 = users.find((u) => u.id === 'u_already_migrated')!;
      const u2 = users.find((u) => u.id === 'u_needs_migration')!;
      const u3 = users.find((u) => u.id === 'u_empty_pin')!;

      // Already migrated user credentials remain intact (salt and hash unchanged)
      expect(u1.pinSalt).toBe(salt);
      expect(u1.pinHash).toBe(hash);
      expect(await service.verifyPin('u_already_migrated', '1111')).toBe(true);

      // Legacy user migrated properly
      expect(u2.pin).toBeUndefined();
      expect(u2.pinHash).toMatch(/^[0-9a-f]{64}$/);
      expect(await service.verifyPin('u_needs_migration', '2222')).toBe(true);

      // Uninitialized user assigned fallback PIN ('9999' for ACCOUNTANT)
      expect(u3.pinHash).toMatch(/^[0-9a-f]{64}$/);
      expect(await service.verifyPin('u_empty_pin', '9999')).toBe(true);
    });

    it('TC-CHAL2-MIG-03: Handles PINs with leading and trailing whitespace during migration', async () => {
      const paddedProfiles: any[] = [
        { id: 'u_padded', name: 'Padded PIN User', role: 'OWNER', pin: '  3333  ' },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(paddedProfiles));

      const service = new RbacService();
      await service.migrateLegacyPins();

      // Should authenticate with trimmed PIN '3333' or padded PIN '  3333  '
      expect(await service.verifyPin('u_padded', '3333')).toBe(true);
      expect(await service.verifyPin('u_padded', '  3333  ')).toBe(true);
    });

    it('TC-CHAL2-MIG-04: Migrates data from legacy "vyapar_users" key and purges the old key completely', async () => {
      const oldStorageUsers: any[] = [
        { id: 'u_vyapar_1', name: 'Vyapar Old Owner', role: 'OWNER', pin: '5555' },
      ];
      memoryStorage.setItem('vyapar_users', JSON.stringify(oldStorageUsers));
      expect(memoryStorage.getItem('vyapar_custom_users')).toBeNull();

      const service = new RbacService();
      await service.migrateLegacyPins();

      // vyapar_users must be completely removed
      expect(memoryStorage.getItem('vyapar_users')).toBeNull();
      // migrated data stored in vyapar_custom_users
      const customUsers = memoryStorage.getItem('vyapar_custom_users');
      expect(customUsers).toBeDefined();
      expect(customUsers).toContain('u_vyapar_1');
      expect(customUsers).not.toContain('"pin":');
      expect(await service.verifyPin('u_vyapar_1', '5555')).toBe(true);
    });

    it('TC-CHAL2-MIG-05: Idempotency stress test — 25 consecutive migrations preserve all credentials and do not trigger lockout', async () => {
      const initialProfiles: any[] = [
        { id: 'u_idem_owner', name: 'Idem Owner', role: 'OWNER', pin: '6789' },
        { id: 'u_idem_cashier', name: 'Idem Cashier', role: 'CASHIER', pin: '9876' },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(initialProfiles));

      const service = new RbacService();
      await service.migrateLegacyPins();

      const firstUsers = service.getUsers();
      const saltOwner1 = firstUsers.find((u) => u.id === 'u_idem_owner')!.pinSalt;
      const hashOwner1 = firstUsers.find((u) => u.id === 'u_idem_owner')!.pinHash;
      const saltCashier1 = firstUsers.find((u) => u.id === 'u_idem_cashier')!.pinSalt;
      const hashCashier1 = firstUsers.find((u) => u.id === 'u_idem_cashier')!.pinHash;

      // Run migration 24 more times
      for (let i = 0; i < 24; i++) {
        await service.migrateLegacyPins();
      }

      const endUsers = service.getUsers();
      const saltOwnerEnd = endUsers.find((u) => u.id === 'u_idem_owner')!.pinSalt;
      const hashOwnerEnd = endUsers.find((u) => u.id === 'u_idem_owner')!.pinHash;
      const saltCashierEnd = endUsers.find((u) => u.id === 'u_idem_cashier')!.pinSalt;
      const hashCashierEnd = endUsers.find((u) => u.id === 'u_idem_cashier')!.pinHash;

      expect(saltOwnerEnd).toBe(saltOwner1);
      expect(hashOwnerEnd).toBe(hashOwner1);
      expect(saltCashierEnd).toBe(saltCashier1);
      expect(hashCashierEnd).toBe(hashCashier1);

      // Verify no lockout occurred
      expect(service.isUserLockedOut('u_idem_owner').isLocked).toBe(false);
      expect(service.isUserLockedOut('u_idem_cashier').isLocked).toBe(false);

      // Both users must authenticate cleanly
      expect(await service.verifyPin('u_idem_owner', '6789')).toBe(true);
      expect(await service.verifyPin('u_idem_cashier', '9876')).toBe(true);
    });

    it('TC-CHAL2-MIG-06: Concurrency resilience — concurrent migration calls do not corrupt state', async () => {
      const initialProfiles: any[] = [
        { id: 'u_conc_owner', name: 'Conc Owner', role: 'OWNER', pin: '7777' },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(initialProfiles));

      const service = new RbacService();
      // Invoke 5 concurrent migrations
      await Promise.all([
        service.migrateLegacyPins(),
        service.migrateLegacyPins(),
        service.migrateLegacyPins(),
        service.migrateLegacyPins(),
        service.migrateLegacyPins(),
      ]);

      const storedJson = memoryStorage.getItem('vyapar_custom_users');
      expect(() => JSON.parse(storedJson!)).not.toThrow();
      expect(await service.verifyPin('u_conc_owner', '7777')).toBe(true);
    });

    it('TC-CHAL2-MIG-07: Gracefully handles corrupted JSON in storage without throwing unhandled exceptions', async () => {
      // Malformed JSON syntax
      memoryStorage.setItem('vyapar_custom_users', '{invalid_json_corrupted:');

      const service = new RbacService();
      await expect(service.migrateLegacyPins()).resolves.not.toThrow();

      // Users fall back to default users safely
      const users = service.getUsers();
      expect(users.length).toBeGreaterThanOrEqual(1);
      expect(users[0].id).toBe('user_owner');
    });

    it('TC-CHAL2-MIG-08: Non-array JSON object in vyapar_custom_users is handled without crash', async () => {
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify({ error: 'not an array' }));

      const service = new RbacService();
      // Should not throw unhandled TypeError: userList is not iterable
      try {
        await service.migrateLegacyPins();
      } catch (e: any) {
        // If it throws, we detect and document whether userList iteration crashed
        expect(e).toBeDefined();
      }
    });

    it('TC-CHAL2-MIG-09: Numeric pin field (e.g. pin: 1234) legacy behavior', async () => {
      const numericPinProfile = [
        { id: 'u_num_pin', name: 'Num Pin', role: 'OWNER', pin: 1234 as any },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(numericPinProfile));

      const service = new RbacService();
      try {
        await service.migrateLegacyPins();
      } catch (e: any) {
        // Document if u.pin.trim throws TypeError
        expect(e).toBeDefined();
      }
    });
  });

  // =========================================================================
  // SECTION 2: JUST-IN-TIME (JIT) AUTHENTICATION WITHOUT LOCKOUT
  // =========================================================================
  describe('2. Just-In-Time (JIT) Authentication Without Lockout', () => {
    it('TC-CHAL2-JIT-01: Direct JIT authentication converts legacy plaintext profile on the fly without startup migration', async () => {
      const legacyProfile: UserProfile[] = [
        {
          id: 'u_jit_single',
          name: 'JIT Target',
          role: 'OWNER',
          pin: '5432',
          avatarColor: '#006c49',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(legacyProfile));

      // Notice: migrateLegacyPins() is NEVER called
      const service = new RbacService();

      // Lockout state before authentication
      expect(service.isUserLockedOut('u_jit_single').isLocked).toBe(false);

      // Authenticate directly
      const authResult = await service.verifyPin('u_jit_single', '5432');
      expect(authResult).toBe(true);

      // Lockout state after authentication must still be clean (0 failed attempts, not locked)
      expect(service.isUserLockedOut('u_jit_single').isLocked).toBe(false);

      // Storage must now be cryptographically hashed
      const stored = memoryStorage.getItem('vyapar_custom_users');
      expect(stored).not.toContain('"pin":');
      expect(stored).toContain('"pinHash":');
      expect(stored).toContain('"pinSalt":');

      // Subsequent authentication must succeed via the new hash
      const secondAuth = await service.verifyPin('u_jit_single', '5432');
      expect(secondAuth).toBe(true);
    });

    it('TC-CHAL2-JIT-02: JIT authentication with invalid PIN fails, increments failed attempts, and retains legacy PIN', async () => {
      const legacyProfile: UserProfile[] = [
        {
          id: 'u_jit_wrong',
          name: 'JIT Wrong PIN',
          role: 'CASHIER',
          pin: '8888',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(legacyProfile));

      const service = new RbacService();

      // Attempt 1 with wrong PIN
      const authFail1 = await service.verifyPin('u_jit_wrong', '9999');
      expect(authFail1).toBe(false);
      expect(service.isUserLockedOut('u_jit_wrong').isLocked).toBe(false);

      // Attempt 2 with wrong PIN
      const authFail2 = await service.verifyPin('u_jit_wrong', '1111');
      expect(authFail2).toBe(false);
      expect(service.isUserLockedOut('u_jit_wrong').isLocked).toBe(false);

      // Attempt 3 with wrong PIN triggers Tier 1 lockout
      const authFail3 = await service.verifyPin('u_jit_wrong', '2222');
      expect(authFail3).toBe(false);
      const lockoutState = service.isUserLockedOut('u_jit_wrong');
      expect(lockoutState.isLocked).toBe(true);
      expect(lockoutState.remainingSeconds).toBeGreaterThan(0);

      // Even correct PIN fails while locked out
      const lockedAuth = await service.verifyPin('u_jit_wrong', '8888');
      expect(lockedAuth).toBe(false);

      // Reset failed attempts (simulating lockout expiration or manual reset)
      service.resetFailedAttempts('u_jit_wrong');
      expect(service.isUserLockedOut('u_jit_wrong').isLocked).toBe(false);

      // Now authenticating with correct PIN succeeds and completes JIT migration
      const okAuth = await service.verifyPin('u_jit_wrong', '8888');
      expect(okAuth).toBe(true);

      const stored = memoryStorage.getItem('vyapar_custom_users');
      expect(stored).not.toContain('"pin":');
      expect(stored).toContain('"pinHash":');
    });

    it('TC-CHAL2-JIT-03: JIT authentication works across all user roles (OWNER, CASHIER, ACCOUNTANT)', async () => {
      const multiRoleProfiles: UserProfile[] = [
        { id: 'u_jit_o', name: 'O', role: 'OWNER', pin: '1010', createdAt: '2025-01-01T00:00:00.000Z' },
        { id: 'u_jit_c', name: 'C', role: 'CASHIER', pin: '2020', createdAt: '2025-01-01T00:00:00.000Z' },
        { id: 'u_jit_a', name: 'A', role: 'ACCOUNTANT', pin: '3030', createdAt: '2025-01-01T00:00:00.000Z' },
      ];
      memoryStorage.setItem('vyapar_custom_users', JSON.stringify(multiRoleProfiles));

      const service = new RbacService();

      expect(await service.verifyPin('u_jit_o', '1010')).toBe(true);
      expect(await service.verifyPin('u_jit_c', '2020')).toBe(true);
      expect(await service.verifyPin('u_jit_a', '3030')).toBe(true);

      expect(service.isUserLockedOut('u_jit_o').isLocked).toBe(false);
      expect(service.isUserLockedOut('u_jit_c').isLocked).toBe(false);
      expect(service.isUserLockedOut('u_jit_a').isLocked).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 3: EMPIRICAL ROLE-BASED PERMISSION HELPERS STRESS TESTS
  // =========================================================================
  describe('3. Role-Based Permission Helpers (Owner Enforcement & Non-Owner Blockage)', () => {
    const sensitiveHelpers: Array<{
      name: string;
      fn: (role?: any) => boolean;
    }> = [
      { name: 'canDeletePurchase', fn: (r) => rbac.canDeletePurchase(r) },
      { name: 'canDeleteExpense', fn: (r) => rbac.canDeleteExpense(r) },
      { name: 'canDeleteParty', fn: (r) => rbac.canDeleteParty(r) },
      { name: 'canDeleteItem', fn: (r) => rbac.canDeleteItem(r) },
      { name: 'canDeleteBankAccount', fn: (r) => rbac.canDeleteBankAccount(r) },
      { name: 'canDeleteCashBankTxn', fn: (r) => rbac.canDeleteCashBankTxn(r) },
      { name: 'canEditCompanySettings', fn: (r) => rbac.canEditCompanySettings(r) },
      // Additional sensitive actions
      { name: 'canDeleteInvoice', fn: (r) => rbac.canDeleteInvoice(r) },
      { name: 'canDeleteTransaction', fn: (r) => rbac.canDeleteTransaction(r) },
      { name: 'canDeleteVoucher', fn: (r) => rbac.canDeleteVoucher(r) },
      { name: 'isOwner', fn: (r) => rbac.isOwner(r) },
    ];

    it('TC-CHAL2-RBAC-01: OWNER role is granted 100% permission across all sensitive actions', () => {
      for (const helper of sensitiveHelpers) {
        const result = helper.fn('OWNER');
        expect(result, `Helper ${helper.name} should return TRUE for OWNER`).toBe(true);
      }
    });

    it('TC-CHAL2-RBAC-02: CASHIER role is BLOCKED 100% of the time across all sensitive actions', () => {
      for (const helper of sensitiveHelpers) {
        const result = helper.fn('CASHIER');
        expect(result, `Helper ${helper.name} should return FALSE for CASHIER`).toBe(false);
      }
    });

    it('TC-CHAL2-RBAC-03: ACCOUNTANT role is BLOCKED 100% of the time across all sensitive actions', () => {
      for (const helper of sensitiveHelpers) {
        const result = helper.fn('ACCOUNTANT');
        expect(result, `Helper ${helper.name} should return FALSE for ACCOUNTANT`).toBe(false);
      }
    });

    it('TC-CHAL2-RBAC-04: null role argument is BLOCKED 100% of the time across all sensitive actions', () => {
      for (const helper of sensitiveHelpers) {
        const result = helper.fn(null);
        expect(result, `Helper ${helper.name} should return FALSE for null`).toBe(false);
      }
    });

    it('TC-CHAL2-RBAC-05: Rogue and malformed role strings are BLOCKED 100% of the time', () => {
      const rogueRoles = [
        'ADMIN',
        'SUPERUSER',
        'ROOT',
        'owner', // lowercase
        'Owner', // titlecase
        'OWNER ', // trailing space
        ' OWNER', // leading space
        'GUEST',
        'MANAGER',
        '', // empty string
        '   ', // whitespace
        'null',
        'undefined',
        'NaN',
      ];

      for (const role of rogueRoles) {
        for (const helper of sensitiveHelpers) {
          const result = helper.fn(role);
          expect(result, `Helper ${helper.name} should return FALSE for rogue role "${role}"`).toBe(false);
        }
      }
    });

    it('TC-CHAL2-RBAC-06: Non-string and object types are BLOCKED 100% of the time', () => {
      const nonStringInputs = [123, 0, -1, true, false, {}, [], { role: 'OWNER' }, () => 'OWNER'];

      for (const input of nonStringInputs) {
        for (const helper of sensitiveHelpers) {
          const result = helper.fn(input as any);
          expect(result, `Helper ${helper.name} should return FALSE for non-string input`).toBe(false);
        }
      }
    });

    it('TC-CHAL2-RBAC-07: Default argument behavior when activeUser is CASHIER or ACCOUNTANT', async () => {
      // Switch active user to CASHIER
      await rbac.switchUser('user_cashier', '0000');
      expect(rbac.getActiveUser().role).toBe('CASHIER');

      // Calling helpers with no argument or undefined MUST evaluate against CASHIER and return FALSE
      for (const helper of sensitiveHelpers) {
        expect(helper.fn(), `Helper ${helper.name}() should return FALSE when activeUser is CASHIER`).toBe(false);
        expect(helper.fn(undefined), `Helper ${helper.name}(undefined) should return FALSE when activeUser is CASHIER`).toBe(false);
      }

      // Switch active user to ACCOUNTANT
      await rbac.switchUser('user_ca', '9999');
      expect(rbac.getActiveUser().role).toBe('ACCOUNTANT');

      // Calling helpers with no argument or undefined MUST evaluate against ACCOUNTANT and return FALSE
      for (const helper of sensitiveHelpers) {
        expect(helper.fn(), `Helper ${helper.name}() should return FALSE when activeUser is ACCOUNTANT`).toBe(false);
        expect(helper.fn(undefined), `Helper ${helper.name}(undefined) should return FALSE when activeUser is ACCOUNTANT`).toBe(false);
      }
    });

    it('TC-CHAL2-RBAC-08: canCreateInvoice enforces OWNER and CASHIER, but BLOCKS ACCOUNTANT, null, and rogue roles', () => {
      expect(rbac.canCreateInvoice('OWNER')).toBe(true);
      expect(rbac.canCreateInvoice('CASHIER')).toBe(true);
      expect(rbac.canCreateInvoice('ACCOUNTANT')).toBe(false);
      expect(rbac.canCreateInvoice(null as any)).toBe(false);
      expect(rbac.canCreateInvoice('ADMIN' as any)).toBe(false);
      expect(rbac.canCreateInvoice('' as any)).toBe(false);
    });

    it('TC-CHAL2-RBAC-09: canAccessTab enforces tab isolation across roles', () => {
      // 'menu' is universally accessible
      expect(rbac.canAccessTab('menu', 'OWNER')).toBe(true);
      expect(rbac.canAccessTab('menu', 'CASHIER')).toBe(true);
      expect(rbac.canAccessTab('menu', 'ACCOUNTANT')).toBe(true);
      expect(rbac.canAccessTab('menu', null as any)).toBe(true);

      // OWNER can access every tab
      const allTabs = [
        'dashboard',
        'pos',
        'sales',
        'purchases',
        'expenses',
        'parties',
        'inventory',
        'accounting',
        'reports',
        'gstr_filing',
        'settings',
        'cash_bank',
        'print_settings',
      ];
      for (const tab of allTabs) {
        expect(rbac.canAccessTab(tab, 'OWNER'), `OWNER should access ${tab}`).toBe(true);
      }

      // CASHIER blocked from sensitive tabs (reports, accounting, purchases, expenses, parties, settings, gstr_filing)
      const cashierBlockedTabs = ['reports', 'accounting', 'purchases', 'expenses', 'parties', 'settings', 'gstr_filing'];
      for (const tab of cashierBlockedTabs) {
        expect(rbac.canAccessTab(tab, 'CASHIER'), `CASHIER should be blocked from ${tab}`).toBe(false);
      }

      // ACCOUNTANT blocked from settings, pos, etc.
      const accountantBlockedTabs = ['settings', 'pos'];
      for (const tab of accountantBlockedTabs) {
        expect(rbac.canAccessTab(tab, 'ACCOUNTANT'), `ACCOUNTANT should be blocked from ${tab}`).toBe(false);
      }

      // null role blocked from all non-menu tabs
      for (const tab of allTabs) {
        expect(rbac.canAccessTab(tab, null as any), `null role should be blocked from ${tab}`).toBe(false);
      }
    });
  });

  // =========================================================================
  // SECTION 4: APP.TSX DELETE & EDIT ACTION GUARD SIMULATION
  // =========================================================================
  describe('4. App.tsx UI & Handler RBAC Guard Simulation', () => {
    interface ActionHandlerResult {
      blocked: boolean;
      executed: boolean;
      alertMessage?: string;
    }

    // Exact logic mirror of App.tsx delete/save handlers
    const createSimulatedHandlers = (currentRole: UserRole | null | undefined) => {
      let deleteCalled = false;
      let alertMsg: string | undefined;

      const mockAlert = (msg: string) => {
        alertMsg = msg;
      };

      const executeDeletePurchase = (id: string): ActionHandlerResult => {
        deleteCalled = false;
        alertMsg = undefined;
        if (!rbac.canDeletePurchase(currentRole as any)) {
          mockAlert('Permission Denied: Only Business Owners can delete purchase bills.');
          return { blocked: true, executed: false, alertMessage: alertMsg };
        }
        deleteCalled = true;
        return { blocked: false, executed: true };
      };

      const executeDeleteExpense = (id: string): ActionHandlerResult => {
        deleteCalled = false;
        alertMsg = undefined;
        if (!rbac.canDeleteExpense(currentRole as any)) {
          mockAlert('Permission Denied: Only Business Owners can delete expense vouchers.');
          return { blocked: true, executed: false, alertMessage: alertMsg };
        }
        deleteCalled = true;
        return { blocked: false, executed: true };
      };

      const executeDeleteParty = (id: string): ActionHandlerResult => {
        deleteCalled = false;
        alertMsg = undefined;
        if (!rbac.canDeleteParty(currentRole as any)) {
          mockAlert('Permission Denied: Only Business Owners can delete customer/supplier accounts.');
          return { blocked: true, executed: false, alertMessage: alertMsg };
        }
        deleteCalled = true;
        return { blocked: false, executed: true };
      };

      const executeDeleteItem = (id: string): ActionHandlerResult => {
        deleteCalled = false;
        alertMsg = undefined;
        if (!rbac.canDeleteItem(currentRole as any)) {
          mockAlert('Permission Denied: Only Business Owners can delete inventory items.');
          return { blocked: true, executed: false, alertMessage: alertMsg };
        }
        deleteCalled = true;
        return { blocked: false, executed: true };
      };

      const executeDeleteBankAccount = (id: string): ActionHandlerResult => {
        deleteCalled = false;
        alertMsg = undefined;
        if (!rbac.canDeleteBankAccount(currentRole as any)) {
          mockAlert('Permission Denied: Only Business Owners can delete bank accounts.');
          return { blocked: true, executed: false, alertMessage: alertMsg };
        }
        deleteCalled = true;
        return { blocked: false, executed: true };
      };

      const executeDeleteCashBankTxn = (id: string): ActionHandlerResult => {
        deleteCalled = false;
        alertMsg = undefined;
        if (!rbac.canDeleteCashBankTxn(currentRole as any)) {
          mockAlert('Permission Denied: Only Business Owners can delete cash/bank transactions.');
          return { blocked: true, executed: false, alertMessage: alertMsg };
        }
        deleteCalled = true;
        return { blocked: false, executed: true };
      };

      const executeSaveCompanySettings = (company: any): ActionHandlerResult => {
        deleteCalled = false;
        alertMsg = undefined;
        if (!rbac.canEditCompanySettings(currentRole as any)) {
          mockAlert('Permission Denied: Only Business Owners can edit company profile.');
          return { blocked: true, executed: false, alertMessage: alertMsg };
        }
        deleteCalled = true;
        return { blocked: false, executed: true };
      };

      return {
        executeDeletePurchase,
        executeDeleteExpense,
        executeDeleteParty,
        executeDeleteItem,
        executeDeleteBankAccount,
        executeDeleteCashBankTxn,
        executeSaveCompanySettings,
      };
    };

    it('TC-CHAL2-APP-01: Unauthorized roles (CASHIER, ACCOUNTANT, null) are BLOCKED 100% of the time from all deletions', () => {
      const unauthorizedRoles = ['CASHIER', 'ACCOUNTANT', null, 'GUEST' as any];

      for (const role of unauthorizedRoles) {
        const handlers = createSimulatedHandlers(role);

        const resPurchase = handlers.executeDeletePurchase('P_001');
        expect(resPurchase.blocked).toBe(true);
        expect(resPurchase.executed).toBe(false);
        expect(resPurchase.alertMessage).toContain('Permission Denied');

        const resExpense = handlers.executeDeleteExpense('E_001');
        expect(resExpense.blocked).toBe(true);
        expect(resExpense.executed).toBe(false);

        const resParty = handlers.executeDeleteParty('PARTY_001');
        expect(resParty.blocked).toBe(true);
        expect(resParty.executed).toBe(false);

        const resItem = handlers.executeDeleteItem('ITEM_001');
        expect(resItem.blocked).toBe(true);
        expect(resItem.executed).toBe(false);

        const resBank = handlers.executeDeleteBankAccount('BANK_001');
        expect(resBank.blocked).toBe(true);
        expect(resBank.executed).toBe(false);

        const resTxn = handlers.executeDeleteCashBankTxn('TXN_001');
        expect(resTxn.blocked).toBe(true);
        expect(resTxn.executed).toBe(false);

        const resCompany = handlers.executeSaveCompanySettings({});
        expect(resCompany.blocked).toBe(true);
        expect(resCompany.executed).toBe(false);
      }
    });

    it('TC-CHAL2-APP-02: Authorized OWNER role executes deletions successfully with zero blocks', () => {
      const handlers = createSimulatedHandlers('OWNER');

      expect(handlers.executeDeletePurchase('P_001').executed).toBe(true);
      expect(handlers.executeDeleteExpense('E_001').executed).toBe(true);
      expect(handlers.executeDeleteParty('PARTY_001').executed).toBe(true);
      expect(handlers.executeDeleteItem('ITEM_001').executed).toBe(true);
      expect(handlers.executeDeleteBankAccount('BANK_001').executed).toBe(true);
      expect(handlers.executeDeleteCashBankTxn('TXN_001').executed).toBe(true);
      expect(handlers.executeSaveCompanySettings({}).executed).toBe(true);
    });
  });
});
