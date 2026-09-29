/**
 * Role-Based Access Control (RBAC) & PIN Authentication Service
 */

export type UserRole = 'OWNER' | 'CASHIER' | 'ACCOUNTANT';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  roleTitle: string;
  pin: string; // 4-digit numeric PIN
  avatarColor: string;
}

export const DEFAULT_USERS: UserProfile[] = [
  {
    id: 'user_owner',
    name: 'Business Owner',
    role: 'OWNER',
    roleTitle: 'Store Owner & Admin',
    pin: '1234',
    avatarColor: '#006c49',
  },
  {
    id: 'user_cashier',
    name: 'Counter Cashier',
    role: 'CASHIER',
    roleTitle: 'POS & Billing Counter',
    pin: '0000',
    avatarColor: '#0284c7',
  },
  {
    id: 'user_ca',
    name: 'Chartered Accountant',
    role: 'ACCOUNTANT',
    roleTitle: 'Audit, Tax & Daybook',
    pin: '9999',
    avatarColor: '#7c3aed',
  },
];

const STORAGE_ACTIVE_USER = 'vyapar_active_user_id';
const STORAGE_CUSTOM_USERS = 'vyapar_custom_users';

class RbacService {
  private users: UserProfile[];
  private activeUser: UserProfile;
  private listeners: Set<(user: UserProfile) => void> = new Set();

  constructor() {
    const saved = localStorage.getItem(STORAGE_CUSTOM_USERS);
    this.users = saved ? JSON.parse(saved) : DEFAULT_USERS;

    const savedId = localStorage.getItem(STORAGE_ACTIVE_USER);
    const found = this.users.find((u) => u.id === savedId);
    this.activeUser = found || this.users[0];
  }

  public getUsers(): UserProfile[] {
    return [...this.users];
  }

  public getActiveUser(): UserProfile {
    return { ...this.activeUser };
  }

  public subscribe(cb: (user: UserProfile) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public verifyPin(userId: string, pin: string): boolean {
    const user = this.users.find((u) => u.id === userId);
    return user ? user.pin === pin.trim() : false;
  }

  public switchUser(userId: string, pin: string): { success: boolean; error?: string } {
    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      return { success: false, error: 'User profile not found.' };
    }
    if (user.pin !== pin.trim()) {
      return { success: false, error: 'Incorrect 4-digit PIN.' };
    }

    this.activeUser = user;
    localStorage.setItem(STORAGE_ACTIVE_USER, user.id);
    this.listeners.forEach((cb) => cb(this.activeUser));
    return { success: true };
  }

  public updatePin(userId: string, oldPin: string, newPin: string): { success: boolean; error?: string } {
    if (newPin.trim().length !== 4 || !/^\d{4}$/.test(newPin.trim())) {
      return { success: false, error: 'PIN must be exactly 4 digits.' };
    }
    const idx = this.users.findIndex((u) => u.id === userId);
    if (idx === -1) return { success: false, error: 'User not found.' };

    if (this.users[idx].pin !== oldPin.trim()) {
      return { success: false, error: 'Old PIN does not match.' };
    }

    this.users[idx].pin = newPin.trim();
    localStorage.setItem(STORAGE_CUSTOM_USERS, JSON.stringify(this.users));
    if (this.activeUser.id === userId) {
      this.activeUser.pin = newPin.trim();
    }
    return { success: true };
  }

  // Permission Check Helpers
  public canAccessTab(tab: string, role: UserRole = this.activeUser.role): boolean {
    if (tab === 'menu') return true;
    if (role === 'OWNER') return true;

    if (role === 'CASHIER') {
      // Cashier only does POS counter, simple sales, dashboard, inventory view, and menu hub
      const allowed = ['dashboard', 'pos', 'sales', 'inventory', 'menu'];
      return allowed.includes(tab);
    }

    if (role === 'ACCOUNTANT') {
      // CA accesses compliance, audit, reports, daybook, sales, purchases, expenses
      const allowed = ['dashboard', 'reports', 'accounting', 'sales', 'purchases', 'expenses', 'parties', 'inventory'];
      return allowed.includes(tab);
    }

    return false;
  }

  public canDeleteInvoice(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canEditCompanySettings(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER';
  }

  public canCreateInvoice(role: UserRole = this.activeUser.role): boolean {
    return role === 'OWNER' || role === 'CASHIER';
  }
}

export const rbac = new RbacService();
