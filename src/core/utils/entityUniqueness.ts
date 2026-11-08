import type { InventoryItem } from '../../models/item.ts';
import type { Party } from '../../models/party.ts';

/**
 * Normalizes an entity name for uniqueness comparison:
 * - Unicode NFC normalization
 * - Trims leading & trailing whitespace
 * - Collapses multiple internal whitespace characters to a single space
 * - Case-insensitive lowercasing
 */
export function normalizeEntityName(name: string | undefined | null): string {
  if (!name) return '';
  return name
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Error thrown when an entity creation or rename collides with an existing record.
 */
export class DuplicateEntityNameError extends Error {
  readonly entityType: 'item' | 'party';
  readonly conflictingName: string;
  readonly conflictingId: string;

  constructor(entityType: 'item' | 'party', name: string, conflictingId: string) {
    const capitalized = entityType === 'item' ? 'Item' : 'Party';
    super(`${capitalized} with name "${name}" already exists (conflicting ID: ${conflictingId}).`);
    this.name = 'DuplicateEntityNameError';
    this.entityType = entityType;
    this.conflictingName = name;
    this.conflictingId = conflictingId;
  }
}

/**
 * Checks whether an item with the same normalized name already exists.
 * Excludes current item when `currentItemId` is supplied.
 */
export function findDuplicateItem(
  name: string | undefined | null,
  existingItems: InventoryItem[],
  currentItemId?: string
): InventoryItem | undefined {
  const normalized = normalizeEntityName(name);
  if (!normalized || !Array.isArray(existingItems)) return undefined;

  const currentIdStr = currentItemId ? String(currentItemId) : undefined;
  return existingItems.find((item) => {
    if (!item) return false;
    if (currentIdStr && String(item.id) === currentIdStr) return false;
    return normalizeEntityName(item.name) === normalized;
  });
}

/**
 * Checks whether a party with the same normalized name already exists.
 * Excludes current party when `currentPartyId` is supplied.
 */
export function findDuplicateParty(
  name: string | undefined | null,
  existingParties: Party[],
  currentPartyId?: string
): Party | undefined {
  const normalized = normalizeEntityName(name);
  if (!normalized || !Array.isArray(existingParties)) return undefined;

  const currentIdStr = currentPartyId ? String(currentPartyId) : undefined;
  return existingParties.find((party) => {
    if (!party) return false;
    if (currentIdStr && String(party.id) === currentIdStr) return false;
    return normalizeEntityName(party.name) === normalized;
  });
}
