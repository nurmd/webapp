/**
 * Deterministic entity resolution.
 *
 * The model reads text; this module decides which existing Party / InventoryItem
 * that text refers to. Pure functions, no IO, so it is directly unit-testable.
 *
 * Matching follows the codebase search invariant: word-level token matching, never
 * prefix equality. "Fortune Mustard Oil 1L" must resolve from "mustard oil fortune 1 ltr".
 */
import type { InventoryItem } from '../../models/item.ts';
import type { Party } from '../../models/party.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import type { MatchMethod } from './types.ts';

const LEGAL_SUFFIXES = new Set([
  'pvt', 'pvtltd', 'private', 'ltd', 'limited', 'llp', 'co', 'company', 'and', '&',
  'enterprises', 'enterprise', 'traders', 'trading', 'agency', 'agencies', 'sales',
  'corporation', 'corp', 'india', 'indian', 'inc', 'llc', 'opus',
]);

export function normalizeName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameTokens(value: string, dropSuffixes = true): string[] {
  return normalizeName(value)
    .split(' ')
    .filter((t) => t.length > 1 && (!dropSuffixes || !LEGAL_SUFFIXES.has(t)));
}

/** Jaccard-style overlap that tolerates a subset ("mustard oil" vs "fortune mustard oil 1l"). */
export function tokenScore(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  let hits = 0;
  for (const t of ta) {
    if (setB.has(t)) hits += 1;
    else if (tb.some((x) => x.length > 3 && t.length > 3 && (x.includes(t) || t.includes(x)))) hits += 0.5;
  }
  // Recall against the shorter token list, so a short description still scores.
  return hits / Math.min(ta.length, tb.length);
}

export function normalizeGstin(value?: string): string {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function normalizeDocNumber(value?: string): string {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export interface SupplierMatch {
  party?: Party;
  method: MatchMethod;
  score: number;
}

export function matchSupplier(
  parties: Party[],
  input: { name?: string; gstin?: string }
): SupplierMatch {
  const gstin = normalizeGstin(input.gstin);
  const suppliers = parties.filter((p) => p.type === 'SUPPLIER' || p.type === 'CUSTOMER');

  if (gstin) {
    const byGstin = suppliers.find((p) => normalizeGstin(p.gstin) === gstin);
    if (byGstin) return { party: byGstin, method: 'GSTIN', score: 1 };
  }

  const name = input.name || '';
  const exact = suppliers.find((p) => normalizeName(p.name) === normalizeName(name));
  if (name && exact) return { party: exact, method: 'NAME', score: 0.9 };

  let best: { party: Party; score: number } | undefined;
  for (const p of suppliers) {
    const score = tokenScore(name, p.name);
    if (!best || score > best.score) best = { party: p, score };
  }
  if (best && best.score >= 0.62) {
    return { party: best.party, method: 'NAME', score: Number(best.score.toFixed(2)) };
  }

  return { method: 'NONE', score: 0 };
}

export interface ItemMatch {
  item?: InventoryItem;
  method: MatchMethod;
  score: number;
}

export function matchItem(
  catalog: InventoryItem[],
  input: { description?: string; hsnSacCode?: string; quantity?: number; unit?: string }
): ItemMatch {
  const description = input.description || '';
  const hsn = String(input.hsnSacCode || '').replace(/\s/g, '');
  const active = catalog.filter((i) => !i.isDisabled);

  // 1. SKU appearing inside the description (some bills print "SKU: ABC-12").
  if (description) {
    const compact = normalizeName(description).replace(/\s/g, '');
    const bySku = active.find((i) => i.sku && compact.includes(normalizeName(i.sku).replace(/\s/g, '')));
    if (bySku) return { item: bySku, method: 'SKU', score: 1 };
  }

  // 2. Exact catalog name.
  const exact = active.find((i) => normalizeName(i.name) === normalizeName(description));
  if (description && exact) return { item: exact, method: 'NAME', score: 0.95 };

  // 3. HSN/SAC prefix match, then break ties by description similarity.
  if (hsn && hsn.length >= 4) {
    const byHsn = active.filter((i) => String(i.hsnSacCode || '').replace(/\s/g, '').startsWith(hsn.slice(0, 6)));
    if (byHsn.length === 1) {
      return { item: byHsn[0], method: 'HSN', score: 0.85 };
    }
    if (byHsn.length > 1) {
      let best: { item: InventoryItem; score: number } | undefined;
      for (const candidate of byHsn) {
        const score = tokenScore(description, candidate.name);
        if (!best || score > best.score) best = { item: candidate, score };
      }
      if (best && best.score >= 0.4) {
        return { item: best.item, method: 'HSN', score: Number((0.6 + best.score * 0.3).toFixed(2)) };
      }
      return { item: byHsn[0], method: 'HSN', score: 0.55 };
    }
  }

  // 4. Description similarity only.
  let best: { item: InventoryItem; score: number } | undefined;
  for (const candidate of active) {
    const score = tokenScore(description, candidate.name);
    if (!best || score > best.score) best = { item: candidate, score };
  }
  if (best && best.score >= 0.7) return { item: best.item, method: 'NAME', score: Number(best.score.toFixed(2)) };

  return { method: 'NONE', score: 0 };
}

export interface DuplicateMatch {
  purchaseId: string;
  billNumber: string;
}

/**
 * A purchase is a duplicate when supplier identity and document number collide.
 * Date is intentionally NOT a key: the same bill must never land twice even if
 * the model misread the date.
 */
export function findDuplicatePurchase(
  purchases: PurchaseBill[],
  input: { supplierGstin?: string; supplierName?: string; billNumber?: string; excludeId?: string }
): DuplicateMatch | undefined {
  const gstin = normalizeGstin(input.supplierGstin);
  const billNo = normalizeDocNumber(input.billNumber);
  if (!billNo) return undefined;

  const match = purchases.find((p) => {
    if (p.id === input.excludeId) return false;
    if (p.isCancelled) return false;
    if (normalizeDocNumber(p.billNumber) !== billNo) return false;
    if (gstin) return normalizeGstin(p.supplierGstin) === gstin;
    return normalizeName(p.supplierName) === normalizeName(input.supplierName || '');
  });

  return match ? { purchaseId: match.id, billNumber: match.billNumber } : undefined;
}
