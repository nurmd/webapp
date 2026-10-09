/**
 * Role-Based Access Control (RBAC) & Cryptographic PIN Authentication Service
 */

export type UserRole = 'OWNER' | 'CASHIER' | 'ACCOUNTANT';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  roleTitle?: string;
  avatarColor?: string;
  pinHash?: string; // 64-char lowercase hex SHA-256 of (pinSalt + pin)
  pinSalt?: string; // 32-char lowercase hex (16 cryptographically random bytes)
  createdAt: string;
  lastLogin?: string;
  pin?: string; // Deprecated legacy plaintext PIN; removed upon migration
}

export interface LockoutState {
  failedAttempts: number;
  lockedUntil?: number; // Epoch timestamp in ms
  lastFailedAt?: number;
}

export function generateSalt(byteLength: number = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const normalizedPin = pin.trim();
  const data = new TextEncoder().encode(salt + normalizedPin);
  const digestBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digestBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const lenA = a.length;
  const lenB = b.length;
  let mismatch = lenA ^ lenB;
  const maxLen = Math.max(lenA, lenB);
  for (let i = 0; i < maxLen; i++) {
    const charA = i < lenA ? a.charCodeAt(i) : 0;
    const charB = i < lenB ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }
  return mismatch === 0;
}

export const constantTimeCompare = timingSafeEqual;

export const DEFAULT_USERS: UserProfile[] = [
  {
    id: 'user_owner',
    name: 'Business Owner',
    role: 'OWNER',
    roleTitle: 'Store Owner & Admin',
    avatarColor: '#006c49',
    pinHash: 'a8d95645cde5b3a7366b40ff0840ab6bdad05dec7e6c221d86fd500c57397e60',
    pinSalt: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'user_cashier',
    name: 'Counter Cashier',
    role: 'CASHIER',
    roleTitle: 'POS & Billing Counter',
    avatarColor: '#0284c7',
    pinHash: '74882b345b3db7cb85075187ab8839827e0e5255de9f802a19340fd4f944a76e',
    pinSalt: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'user_ca',
    name: 'Chartered Accountant',
    role: 'ACCOUNTANT',
    roleTitle: 'Audit, Tax & Daybook',
    avatarColor: '#7c3aed',
    pinHash: 'f59834a284bfb5fea0d2549a5540528d20054262accd24ab35bd65df20a76308',
    pinSalt: '1a2b3c4d5e6f708192a3b4c5d6e7f809',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
];

const STORAGE_ACTIVE_USER = 'vyapar_active_user_id';
const STORAGE_CUSTOM_USERS = 'vyapar_custom_users';
const STORAGE_LOCKOUT = 'vyapar_rbac_lockout';
const STORAGE_LOCKOUT_ALT = 'vyapar_auth_lockouts';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch {}
  return null;
}

export class RbacService {
  private users: UserProfile[];
  private activeUser: UserProfile;
  private listeners: Set<(user: UserProfile) => void> = new Set();

  constructor() {
    this.users = this.loadUsersFromStorage();
    const storage = getStorage();
    const savedId = storage ? storage.getItem(STORAGE_ACTIVE_USER) : null;
    const found = this.users.find((u) => u.id === savedId);
    this.activeUser = found || this.users[0];
  }

  private loadUsersFromStorage(): UserProfile[] {
    const storage = getStorage();
    if (!storage) {
      return JSON.parse(JSON.stringify(DEFAULT_USERS));
    }
    const saved = storage.getItem(STORAGE_CUSTOM_USERS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }
    return JSON.parse(JSON.stringify(DEFAULT_USERS));
  }

  private persistUsers(): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_CUSTOM_USERS, JSON.stringify(this.users));
    } catch (e) {
      console.error('Error persisting custom users', e);
    }
  }

  public getUsers(): UserProfile[] {
    return [...this.users];
  }

  public getActiveUser(): UserProfile {
    return { ...this.activeUser };
  }

  public reloadFromStorage(): void {
    this.users = this.loadUsersFromStorage();
    const storage = getStorage();
    const savedId = storage ? storage.getItem(STORAGE_ACTIVE_USER) : null;
    const found = this.users.find((u) => u.id === savedId);
    this.activeUser = found || this.users[0];
  }

  public subscribe(cb: (user: UserProfile) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // --- Persistent Brute-Force Lockout Defense ---

  private getLockoutRecord(userId: string): LockoutState | null {
    const storage = getStorage();
    if (!storage) return null;
    try {
      // 1. Primary multi-user map: vyapar_rbac_lockout
      const primaryRaw = storage.getItem(STORAGE_LOCKOUT);
      if (primaryRaw) {
        const parsed = JSON.parse(primaryRaw);
        if (parsed && typeof parsed === 'object' && parsed[userId]) {
          return parsed[userId];
        }
      }
      // 2. Alt map: vyapar_auth_lockouts
      const altRaw = storage.getItem(STORAGE_LOCKOUT_ALT);
      if (altRaw) {
        const parsed = JSON.parse(altRaw);
        if (parsed && typeof parsed === 'object' && parsed[userId]) {
          return parsed[userId];
        }
      }
      // 3. Per-user storage key: vyapar_lockout_${userId}
      const perUserRaw = storage.getItem(`vyapar_lockout_${userId}`);
      if (perUserRaw) {
        return JSON.parse(perUserRaw);
      }
    } catch (e) {
      console.error('Error reading lockout state', e);
    }
    return null;
  }

  private saveLockoutRecord(userId: string, record: LockoutState): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      // Save in primary multi-user map
      let primaryMap: Record<string, LockoutState> = {};
      const primaryRaw = storage.getItem(STORAGE_LOCKOUT);
      if (primaryRaw) {
        try {
          primaryMap = JSON.parse(primaryRaw) || {};
        } catch {}
      }
      primaryMap[userId] = record;
      storage.setItem(STORAGE_LOCKOUT, JSON.stringify(primaryMap));

      // Mirror to alt multi-user map
      storage.setItem(STORAGE_LOCKOUT_ALT, JSON.stringify(primaryMap));

      // Mirror to per-user key
      storage.setItem(`vyapar_lockout_${userId}`, JSON.stringify(record));
    } catch (e) {
      console.error('Error saving lockout state', e);
    }
  }

  private clearLockoutRecord(userId: string): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      const primaryRaw = storage.getItem(STORAGE_LOCKOUT);
      if (primaryRaw) {
        try {
          const map = JSON.parse(primaryRaw) || {};
          delete map[userId];
          storage.setItem(STORAGE_LOCKOUT, JSON.stringify(map));
        } catch {}
      }
      const altRaw = storage.getItem(STORAGE_LOCKOUT_ALT);
      if (altRaw) {
        try {
          const map = JSON.parse(altRaw) || {};
          delete map[userId];
          storage.setItem(STORAGE_LOCKOUT_ALT, JSON.stringify(map));
        } catch {}
      }
      storage.removeItem(`vyapar_lockout_${userId}`);
    } catch (e) {
      console.error('Error clearing lockout state', e);
    }
  }

  public isUserLockedOut(userId: string): { isLocked: boolean; remainingSeconds: number } {
    const record = this.getLockoutRecord(userId);
    if (!record || !record.lockedUntil) {
      return { isLocked: false, remainingSeconds: 0 };
    }
    const now = Date.now();
    if (record.lockedUntil > now) {
      const remainingSeconds = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
      return { isLocked: true, remainingSeconds };
    }
    return { isLocked: false, remainingSeconds: 0 };
  }

  public recordFailedAttempt(userId: string): { locked: boolean; lockDurationSeconds: number } {
    const record = this.getLockoutRecord(userId) || { failedAttempts: 0 };
    record.failedAttempts = (record.failedAttempts || 0) + 1;
    record.lastFailedAt = Date.now();

    let lockDurationSeconds = 0;
    let locked = false;

    // Lockout tiers: < 3 attempts no lockout, 3-4 attempts 30s, 5-9 attempts 60s, 10+ attempts 300s
    if (record.failedAttempts >= 10) {
      lockDurationSeconds = 300;
      locked = true;
    } else if (record.failedAttempts >= 5) {
      lockDurationSeconds = 60;
      locked = true;
    } else if (record.failedAttempts >= 3) {
      lockDurationSeconds = 30;
      locked = true;
    }

    if (locked) {
      record.lockedUntil = Date.now() + lockDurationSeconds * 1000;
    } else {
      delete record.lockedUntil;
    }

    this.saveLockoutRecord(userId, record);
    return { locked, lockDurationSeconds };
  }

  public resetFailedAttempts(userId: string): void {
    this.clearLockoutRecord(userId);
  }

  // --- Cryptographic PIN Authentication ---

  public async verifyPin(userId: string, enteredPin: string): Promise<boolean> {
    const lockout = this.isUserLockedOut(userId);
    if (lockout.isLocked) {
      this.recordFailedAttempt(userId);
      return false;
    }

    if (!enteredPin || typeof enteredPin !== 'string') {
      this.recordFailedAttempt(userId);
      return false;
    }

    const cleanPin = enteredPin.trim();
    if (!cleanPin) {
      this.recordFailedAttempt(userId);
      return false;
    }

    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      this.recordFailedAttempt(userId);
      return false;
    }

    // Transparent JIT migration fallback for legacy plaintext PIN profiles
    if (user.pin && (!user.pinHash || !user.pinSalt)) {
      if (user.pin.trim() === cleanPin) {
        const salt = generateSalt(16);
        const hash = await hashPin(cleanPin, salt);
        user.pinSalt = salt;
        user.pinHash = hash;
        user.createdAt = user.createdAt || new Date().toISOString();
        user.lastLogin = new Date().toISOString();
        delete user.pin;
        this.persistUsers();
        this.resetFailedAttempts(userId);
        return true;
      } else {
        this.recordFailedAttempt(userId);
        return false;
      }
    }

    if (!user.pinHash || !user.pinSalt) {
      this.recordFailedAttempt(userId);
      return false;
    }

    try {
      const computed = await hashPin(cleanPin, user.pinSalt);
      const isValid = timingSafeEqual(computed, user.pinHash);

      if (isValid) {
        this.resetFailedAttempts(userId);
        user.lastLogin = new Date().toISOString();
        this.persistUsers();
        return true;
      } else {
        this.recordFailedAttempt(userId);
        return false;
      }
    } catch {
      this.recordFailedAttempt(userId);
      return false;
    }
  }

  public async setPin(userId: string, newPin: string): Promise<void> {
    const cleanPin = newPin ? newPin.trim() : '';
    if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      throw new Error('PIN must be exactly 4 digits.');
    }

    const idx = this.users.findIndex((u) => u.id === userId);
    if (idx === -1) {
      throw new Error('User not found.');
    }

    const salt = generateSalt(16);
    const hash = await hashPin(cleanPin, salt);

    this.users[idx].pinSalt = salt;
    this.users[idx].pinHash = hash;
    if (!this.users[idx].createdAt) {
      this.users[idx].createdAt = new Date().toISOString();
    }
    delete this.users[idx].pin;

    this.persistUsers();

    if (this.activeUser.id === userId) {
      this.activeUser.pinSalt = salt;
      this.activeUser.pinHash = hash;
      delete this.activeUser.pin;
    }

    this.resetFailedAttempts(userId);
  }

  public async switchUser(
    userId: string,
    enteredPin: string
  ): Promise<{ success: boolean; error?: string; remainingSeconds?: number }> {
    const lockout = this.isUserLockedOut(userId);
    if (lockout.isLocked) {
      return {
        success: false,
        error: `Account locked due to multiple failed attempts. Retry in ${lockout.remainingSeconds}s.`,
        remainingSeconds: lockout.remainingSeconds,
      };
    }

    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      return { success: false, error: 'User profile not found.' };
    }

    const isValid = await this.verifyPin(userId, enteredPin);
    if (!isValid) {
      const postLockout = this.isUserLockedOut(userId);
      if (postLockout.isLocked) {
        return {
          success: false,
          error: `Account locked due to multiple failed attempts. Retry in ${postLockout.remainingSeconds}s.`,
          remainingSeconds: postLockout.remainingSeconds,
        };
      }
      return { success: false, error: 'Incorrect 4-digit PIN.' };
    }

    this.activeUser = user;
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_ACTIVE_USER, user.id);
    }
    this.listeners.forEach((cb) => cb(this.activeUser));
    return { success: true };
  }

  public async updatePin(
    userId: string,
    oldPin: string,
    newPin: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanNewPin = newPin ? newPin.trim() : '';
    if (cleanNewPin.length !== 4 || !/^\d{4}$/.test(cleanNewPin)) {
      return { success: false, error: 'PIN must be exactly 4 digits.' };
    }

    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      return { success: false, error: 'User not found.' };
    }

    const isValid = await this.verifyPin(userId, oldPin);
    if (!isValid) {
      return { success: false, error: 'Old PIN does not match.' };
    }

    await this.setPin(userId, cleanNewPin);
    return { success: true };
  }

  // --- Transparent Legacy PIN Migration ---

  public async migrateLegacyPins(): Promise<void> {
    const storage = getStorage();
    if (!storage) return;

    const customUsersRaw = storage.getItem(STORAGE_CUSTOM_USERS);
    const legacyUsersRaw = storage.getItem('vyapar_users');

    let userList: UserProfile[] = [];
    if (customUsersRaw) {
      try {
        userList = JSON.parse(customUsersRaw);
      } catch {}
    } else if (legacyUsersRaw) {
      try {
        userList = JSON.parse(legacyUsersRaw);
      } catch {}
    } else {
      userList = this.users;
    }

    let modified = false;

    for (const u of userList) {
      if (u.pin || !u.pinHash || !u.pinSalt) {
        modified = true;
        const plainPin = u.pin
          ? u.pin.trim()
          : u.role === 'OWNER'
          ? '1234'
          : u.role === 'CASHIER'
          ? '0000'
          : '9999';
        const salt = generateSalt(16);
        const hash = await hashPin(plainPin, salt);
        u.pinSalt = salt;
        u.pinHash = hash;
        u.createdAt = u.createdAt || new Date().toISOString();
        delete u.pin;
      }
    }

    // Sync in-memory user collection
    for (const memUser of this.users) {
      const match = userList.find((x) => x.id === memUser.id);
      if (match) {
        memUser.pinHash = match.pinHash;
        memUser.pinSalt = match.pinSalt;
        memUser.createdAt = match.createdAt || new Date().toISOString();
        delete memUser.pin;
      }
    }

    if (modified || legacyUsersRaw) {
      this.users = userList;
      this.persistUsers();
      if (legacyUsersRaw) {
        storage.removeItem('vyapar_users');
      }
      const activeMatch = this.users.find((u) => u.id === this.activeUser.id);
      if (activeMatch) {
        this.activeUser = activeMatch;
      }
    }
  }

  // --- Role Permission Helpers ---

  public isOwner(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canAccessTab(tab: string, role: UserRole = this.activeUser.role): boolean {
    if (tab === 'menu') return true;
    if (role === 'OWNER') return true;

    if (role === 'CASHIER') {
      const allowed = ['dashboard', 'pos', 'sales', 'cash_bank', 'inventory', 'menu', 'print_settings'];
      return allowed.includes(tab);
    }

    if (role === 'ACCOUNTANT') {
      const allowed = ['dashboard', 'reports', 'accounting', 'cash_bank', 'sales', 'purchases', 'expenses', 'parties', 'inventory', 'menu', 'print_settings'];
      return allowed.includes(tab);
    }

    return false;
  }

  public canCreateInvoice(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER' || role === 'CASHIER';
  }

  public canDeleteInvoice(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canDeletePurchase(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canDeleteExpense(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canDeleteParty(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canDeleteItem(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canDeleteBankAccount(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canDeleteCashBankTxn(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canDeleteTransaction(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canDeleteVoucher(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canEditCompanySettings(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }
}

export const rbac = new RbacService();
