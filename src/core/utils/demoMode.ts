import { POUCH_PERSIST_KEYS } from '../../services/db/localDbConstants.ts';

export function isDemoModeActive(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(POUCH_PERSIST_KEYS.DEMO_MODE) === 'true';
}
